import { spawn, execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { MsEdgeTTS, OUTPUT_FORMAT } from 'msedge-tts';
import { FFMPEG_BIN, refreshMediaBinaries, TEMP_DIR, UPLOADS_DIR } from './paths.js';
import { probeAndProcessFile } from './mediaService.js';
import {
  BREATH_PRESETS,
  BreathRemovalOptions,
  MediaAsset,
  TTS_VOICES,
} from '../shared/schema.js';

const execFileAsync = promisify(execFile);

export interface BreathRemovalResult {
  originalDuration: number;
  newDuration: number;
  savedSec: number;
  cutCount: number;
}

function decodeAudioToFloat32Mono(ffmpegPath: string, inputPath: string, sampleRate = 24000): Promise<Float32Array> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const proc = spawn(
      ffmpegPath,
      ['-v', 'error', '-i', inputPath, '-f', 'f32le', '-ac', '1', '-ar', String(sampleRate), 'pipe:1'],
      { stdio: ['ignore', 'pipe', 'pipe'] }
    );
    let stderr = '';
    proc.stdout.on('data', (c: Buffer) => chunks.push(c));
    proc.stderr.on('data', (c: Buffer) => {
      stderr += c.toString('utf8');
    });
    proc.on('error', reject);
    proc.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`解码音频失败: ${stderr.slice(-300)}`));
        return;
      }
      const buf = Buffer.concat(chunks);
      const sampleCount = Math.floor(buf.byteLength / 4);
      const out = new Float32Array(sampleCount);
      for (let i = 0; i < sampleCount; i++) {
        out[i] = buf.readFloatLE(i * 4);
      }
      resolve(out);
    });
  });
}

function encodeFloat32MonoToMp3(
  ffmpegPath: string,
  samples: Float32Array,
  sampleRate: number,
  outputPath: string
): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(
      ffmpegPath,
      [
        '-y',
        '-v',
        'error',
        '-f',
        'f32le',
        '-ar',
        String(sampleRate),
        '-ac',
        '1',
        '-i',
        'pipe:0',
        '-ar',
        '44100',
        '-ac',
        '2',
        '-c:a',
        'libmp3lame',
        '-b:a',
        '192k',
        outputPath,
      ],
      { stdio: ['pipe', 'ignore', 'pipe'] }
    );

    let stderr = '';
    proc.stderr.on('data', (c: Buffer) => {
      stderr += c.toString('utf8');
    });
    proc.on('error', reject);
    proc.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`编码音频失败: ${stderr.slice(-300)}`));
      } else {
        resolve();
      }
    });

    const outBuf = Buffer.allocUnsafe(samples.length * 4);
    for (let i = 0; i < samples.length; i++) {
      outBuf.writeFloatLE(samples[i], i * 4);
    }
    proc.stdin.end(outBuf);
  });
}

/**
 * Studio-grade Smart Breath & Dead-Air Removal (智能去气口):
 * - Analyzes 10ms RMS energy windows at 24kHz
 * - Bridges plosive consonant micro-gaps (< minPauseSec) so internal syllables are never cut
 * - Pads speech onset (+35ms) and trailing release (+55ms) so soft Chinese initials/finals never clip
 * - Applies 10ms cosine fades at splice edges + clean digital micro-gap (keepGapSec) to eliminate inhale noise & clicks
 */
export async function removeAudioBreaths(
  inputPath: string,
  outputPath: string,
  opts?: Partial<BreathRemovalOptions>
): Promise<BreathRemovalResult> {
  const bins = refreshMediaBinaries();
  const ffmpegPath = bins.ffmpegPath || FFMPEG_BIN;
  if (!bins.ffmpegFound) {
    throw new Error('未检测到 FFmpeg 引擎，无法执行音频去气口处理');
  }

  const thresholdDb = opts?.thresholdDb ?? BREATH_PRESETS.standard.thresholdDb;
  const minPauseSec = Math.max(0.06, opts?.minPauseSec ?? BREATH_PRESETS.standard.minPauseSec);
  const keepGapSec = Math.max(0, Math.min(0.4, opts?.keepGapSec ?? BREATH_PRESETS.standard.keepGapSec));

  const SR = 24000;
  const samples = await decodeAudioToFloat32Mono(ffmpegPath, inputPath, SR);
  const originalDuration = samples.length / SR;

  if (samples.length < SR * 0.25) {
    fs.copyFileSync(inputPath, outputPath);
    return {
      originalDuration,
      newDuration: originalDuration,
      savedSec: 0,
      cutCount: 0,
    };
  }

  const frameSize = 240; // 10ms per frame at 24kHz
  const numFrames = Math.ceil(samples.length / frameSize);
  const active = new Uint8Array(numFrames);

  for (let f = 0; f < numFrames; f++) {
    const s0 = f * frameSize;
    const s1 = Math.min(samples.length, s0 + frameSize);
    let sumSq = 0;
    for (let i = s0; i < s1; i++) {
      sumSq += samples[i] * samples[i];
    }
    const rms = Math.sqrt(sumSq / Math.max(1, s1 - s0));
    const db = 20 * Math.log10(Math.max(rms, 1e-7));
    active[f] = db >= thresholdDb ? 1 : 0;
  }

  // Bridge internal non-speech gaps shorter than minPauseFrames (preserves natural consonant closures!)
  const minPauseFrames = Math.max(5, Math.round(minPauseSec * 100));
  let f = 0;
  while (f < numFrames) {
    if (active[f] === 0) {
      let endZero = f;
      while (endZero < numFrames && active[endZero] === 0) endZero++;
      const zeroLen = endZero - f;
      // Only bridge internal gaps (not leading/trailing dead air, unless leading/trailing is tiny)
      if (f > 0 && endZero < numFrames && zeroLen < minPauseFrames) {
        for (let k = f; k < endZero; k++) active[k] = 1;
      }
      f = endZero;
    } else {
      f++;
    }
  }

  // Extract raw speech islands [startFrame, endFrame)
  const rawIslands: Array<[number, number]> = [];
  f = 0;
  while (f < numFrames) {
    if (active[f] === 1) {
      let endOne = f;
      while (endOne < numFrames && active[endOne] === 1) endOne++;
      // Ignore isolated 10ms click spikes (< 30ms)
      if (endOne - f >= 3) {
        rawIslands.push([f, endOne]);
      }
      f = endOne;
    } else {
      f++;
    }
  }

  if (rawIslands.length === 0) {
    fs.copyFileSync(inputPath, outputPath);
    return {
      originalDuration,
      newDuration: originalDuration,
      savedSec: 0,
      cutCount: 0,
    };
  }

  // Pad each island (+35ms onset, +55ms release) and merge overlapping islands
  const padHeadFrames = 4; // 40ms
  const padTailFrames = 6; // 60ms
  const merged: Array<[number, number]> = [];

  for (const [s, e] of rawIslands) {
    const ps = Math.max(0, s - padHeadFrames);
    const pe = Math.min(numFrames, e + padTailFrames);
    if (merged.length > 0 && ps <= merged[merged.length - 1][1]) {
      merged[merged.length - 1][1] = Math.max(merged[merged.length - 1][1], pe);
    } else {
      merged.push([ps, pe]);
    }
  }

  const gapSamples = Math.round(keepGapSec * SR);
  const fadeSamples = Math.round(0.01 * SR); // 10ms anti-click cosine fade

  let totalOutSamples = 0;
  for (let idx = 0; idx < merged.length; idx++) {
    const [sf, ef] = merged[idx];
    const s0 = sf * frameSize;
    const s1 = Math.min(samples.length, ef * frameSize);
    totalOutSamples += Math.max(0, s1 - s0);
    if (idx < merged.length - 1) {
      totalOutSamples += gapSamples;
    }
  }

  const outPcm = new Float32Array(totalOutSamples);
  let writePos = 0;

  for (let idx = 0; idx < merged.length; idx++) {
    const [sf, ef] = merged[idx];
    const s0 = sf * frameSize;
    const s1 = Math.min(samples.length, ef * frameSize);
    const segLen = Math.max(0, s1 - s0);

    for (let i = 0; i < segLen; i++) {
      let gain = 1.0;
      if (i < fadeSamples) {
        gain = 0.5 * (1 - Math.cos((Math.PI * i) / fadeSamples));
      } else if (i >= segLen - fadeSamples) {
        const rem = segLen - 1 - i;
        gain = 0.5 * (1 - Math.cos((Math.PI * Math.max(0, rem)) / fadeSamples));
      }
      outPcm[writePos + i] = samples[s0 + i] * gain;
    }
    writePos += segLen;
    if (idx < merged.length - 1) {
      // Pure digital silence gap (eliminates inhale breath noise!)
      writePos += gapSamples;
    }
  }

  await encodeFloat32MonoToMp3(ffmpegPath, outPcm, SR, outputPath);

  const newDuration = Math.round((totalOutSamples / SR) * 100) / 100;
  const origRounded = Math.round(originalDuration * 100) / 100;
  const savedSec = Math.max(0, Math.round((origRounded - newDuration) * 100) / 100);

  let cutCount = Math.max(0, merged.length - 1);
  if (merged[0][0] > minPauseFrames) cutCount++;
  if (numFrames - merged[merged.length - 1][1] > minPauseFrames) cutCount++;

  return {
    originalDuration: origRounded,
    newDuration,
    savedSec,
    cutCount,
  };
}

/**
 * Offline fallback on Windows using built-in SAPI5 SpeechSynthesizer via PowerShell
 */
async function synthesizeWithWindowsSapiFallback(
  text: string,
  ratePct: number,
  outMp3Path: string
): Promise<void> {
  const bins = refreshMediaBinaries();
  const ffmpegPath = bins.ffmpegPath || FFMPEG_BIN;
  const tempWav = path.join(TEMP_DIR, `sapi_${uuidv4()}.wav`);
  const tempTxt = path.join(TEMP_DIR, `sapi_${uuidv4()}.txt`);
  fs.writeFileSync(tempTxt, text, 'utf8');

  // Map -35..+60% to SAPI Rate -4..+6
  const sapiRate = Math.max(-5, Math.min(7, Math.round(ratePct / 10)));
  const psScript = `
Add-Type -AssemblyName System.Speech
$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
$synth.Rate = ${sapiRate}
$txt = Get-Content -Path '${tempTxt.replace(/'/g, "''")}' -Raw -Encoding UTF8
$synth.SetOutputToWaveFile('${tempWav.replace(/'/g, "''")}')
$synth.Speak($txt)
$synth.Dispose()
`;
  try {
    await execFileAsync('powershell', ['-NoProfile', '-NonInteractive', '-Command', psScript], {
      timeout: 30000,
    });
    await execFileAsync(ffmpegPath, [
      '-y',
      '-i',
      tempWav,
      '-ar',
      '44100',
      '-ac',
      '2',
      '-c:a',
      'libmp3lame',
      '-b:a',
      '192k',
      outMp3Path,
    ]);
  } finally {
    try {
      if (fs.existsSync(tempWav)) fs.unlinkSync(tempWav);
      if (fs.existsSync(tempTxt)) fs.unlinkSync(tempTxt);
    } catch {
      // ignore
    }
  }
}

export interface SynthesizeTtsRequest {
  text: string;
  voiceId?: string;
  ratePct?: number; // -35 ~ +60
  pitchHz?: number; // -20 ~ +20
  titleName?: string;
  removeBreath?: boolean;
  breathOptions?: Partial<BreathRemovalOptions>;
}

export async function synthesizeTtsToAsset(req: SynthesizeTtsRequest): Promise<{
  asset: MediaAsset;
  breathStats?: BreathRemovalResult;
}> {
  const cleanText = (req.text || '').trim();
  if (!cleanText) {
    throw new Error('请输入需要生成语音的口播文案');
  }

  const voiceId = req.voiceId || TTS_VOICES[0].id;
  const voiceMeta = TTS_VOICES.find((v) => v.id === voiceId) || TTS_VOICES[0];
  const ratePct = Math.max(-35, Math.min(60, Math.round(req.ratePct ?? 8)));
  const pitchHz = Math.max(-20, Math.min(20, Math.round(req.pitchHz ?? 0)));

  const tmpSubDir = path.join(TEMP_DIR, `tts_${uuidv4()}`);
  fs.mkdirSync(tmpSubDir, { recursive: true });

  const rawMp3Path = path.join(tmpSubDir, 'raw_tts.mp3');
  const storedFilename = `tts_${Date.now()}_${uuidv4().slice(0, 8)}.mp3`;
  const finalUploadPath = path.join(UPLOADS_DIR, storedFilename);

  try {
    let synthesizedOk = false;
    const tts = new MsEdgeTTS({ connectionTimeoutMs: 12000, synthesisTimeoutMs: 45000 });
    try {
      await tts.setMetadata(voiceId, OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3);
      const rateStr = ratePct >= 0 ? `+${ratePct}%` : `${ratePct}%`;
      const pitchStr = pitchHz >= 0 ? `+${pitchHz}Hz` : `${pitchHz}Hz`;
      const { audioFilePath } = await tts.toFile(tmpSubDir, cleanText, {
        rate: rateStr,
        pitch: pitchStr,
      });
      fs.renameSync(audioFilePath, rawMp3Path);
      synthesizedOk = true;
    } catch (edgeErr: any) {
      if (process.platform === 'win32') {
        await synthesizeWithWindowsSapiFallback(cleanText, ratePct, rawMp3Path);
        synthesizedOk = true;
      } else {
        throw new Error(`神经网络语音合成连接失败 (${edgeErr?.message || '请检查网络'})`);
      }
    } finally {
      try {
        tts.close();
      } catch {
        // ignore
      }
    }

    if (!synthesizedOk || !fs.existsSync(rawMp3Path)) {
      throw new Error('语音合成未生成有效音频文件');
    }

    let breathStats: BreathRemovalResult | undefined;
    if (req.removeBreath) {
      breathStats = await removeAudioBreaths(rawMp3Path, finalUploadPath, req.breathOptions);
    } else {
      fs.copyFileSync(rawMp3Path, finalUploadPath);
    }

    const snippet = cleanText.replace(/\s+/g, '').slice(0, 12);
    const voiceShort = voiceMeta.name.split('·')[0].trim();
    const displayName =
      req.titleName?.trim() ||
      `AI配音_${voiceShort}_${snippet}${req.removeBreath ? '(已去气口)' : ''}`;

    const asset = await probeAndProcessFile(
      finalUploadPath,
      storedFilename,
      displayName,
      'audio/mpeg'
    );
    asset.audioRole = 'voiceover';
    asset.ttsSourceText = cleanText;
    asset.ttsVoiceId = voiceId;
    if (req.removeBreath && breathStats) {
      asset.breathRemoved = true;
      asset.breathSavedSec = breathStats.savedSec;
      asset.breathCutCount = breathStats.cutCount;
    }

    return { asset, breathStats };
  } finally {
    try {
      fs.rmSync(tmpSubDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  }
}

/**
 * Renders an edited audio asset (Trim range + Speed + Fade in/out + Optional Breath Removal)
 * as a clean standalone MP3 asset in the project library!
 */
export async function processEditedAudioAsset(params: {
  sourceAsset: MediaAsset;
  trimStart: number;
  trimEnd: number;
  speed: number;
  fadeInSec: number;
  fadeOutSec: number;
  removeBreath: boolean;
  breathOptions?: Partial<BreathRemovalOptions>;
  newName?: string;
}): Promise<{ asset: MediaAsset; breathStats?: BreathRemovalResult }> {
  const bins = refreshMediaBinaries();
  const ffmpegPath = bins.ffmpegPath || FFMPEG_BIN;
  if (!bins.ffmpegFound) {
    throw new Error('未检测到 FFmpeg 引擎，无法执行音频渲染');
  }

  const srcPath = path.join(UPLOADS_DIR, params.sourceAsset.filename);
  if (!fs.existsSync(srcPath)) {
    throw new Error('找不到原始音频文件');
  }

  const t0 = Math.max(0, params.trimStart || 0);
  const t1 = Math.max(t0 + 0.2, Math.min(params.sourceAsset.duration, params.trimEnd || params.sourceAsset.duration));
  const rawDur = t1 - t0;
  const spd = Math.min(2.0, Math.max(0.5, params.speed || 1.0));
  const effDur = rawDur / spd;

  const tmpTrimmed = path.join(TEMP_DIR, `atrim_${uuidv4()}.mp3`);
  const storedFilename = `aud_${Date.now()}_${uuidv4().slice(0, 8)}.mp3`;
  const finalUploadPath = path.join(UPLOADS_DIR, storedFilename);

  try {
    const afFilters: string[] = [];
    if (Math.abs(spd - 1.0) > 0.01) {
      afFilters.push(`atempo=${spd.toFixed(4)}`);
    }
    if (params.fadeInSec > 0.02) {
      afFilters.push(`afade=t=in:st=0:d=${Math.min(effDur * 0.45, params.fadeInSec).toFixed(2)}`);
    }
    if (params.fadeOutSec > 0.02) {
      const fout = Math.min(effDur * 0.45, params.fadeOutSec);
      afFilters.push(`afade=t=out:st=${Math.max(0, effDur - fout).toFixed(2)}:d=${fout.toFixed(2)}`);
    }

    const args = [
      '-y',
      '-ss',
      t0.toFixed(3),
      '-to',
      t1.toFixed(3),
      '-i',
      srcPath,
      ...(afFilters.length > 0 ? ['-af', afFilters.join(',')] : []),
      '-ar',
      '44100',
      '-ac',
      '2',
      '-c:a',
      'libmp3lame',
      '-b:a',
      '192k',
      tmpTrimmed,
    ];
    await execFileAsync(ffmpegPath, args);

    let breathStats: BreathRemovalResult | undefined;
    if (params.removeBreath) {
      breathStats = await removeAudioBreaths(tmpTrimmed, finalUploadPath, params.breathOptions);
    } else {
      fs.copyFileSync(tmpTrimmed, finalUploadPath);
    }

    const suffix = params.removeBreath ? '(去气口精剪)' : '(精剪版)';
    const displayName = params.newName?.trim() || `${params.sourceAsset.name}${suffix}`;
    const asset = await probeAndProcessFile(
      finalUploadPath,
      storedFilename,
      displayName,
      'audio/mpeg'
    );
    asset.audioRole = params.sourceAsset.audioRole || 'bgm';
    if (params.removeBreath && breathStats) {
      asset.breathRemoved = true;
      asset.breathSavedSec = breathStats.savedSec;
      asset.breathCutCount = breathStats.cutCount;
    }

    return { asset, breathStats };
  } finally {
    try {
      if (fs.existsSync(tmpTrimmed)) fs.unlinkSync(tmpTrimmed);
    } catch {
      // ignore
    }
  }
}
