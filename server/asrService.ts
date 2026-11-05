import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { Response } from 'express';
import { FFMPEG_BIN, MODELS_DIR, refreshMediaBinaries, UPLOADS_DIR } from './paths.js';
import { loadAiSettings } from './aiScriptService.js';
import {
  AI_PROVIDER_PRESETS,
  AiEngineSettings,
  buildSyncedSubtitlesFromScript,
  MediaAsset,
  ProjectData,
  SpeechSegmentPayload,
  SubtitleCue,
  VideoGroup,
} from '../shared/schema.js';

const WASM_RUNTIME_DIR = path.join(MODELS_DIR, 'wasm-runtime');
const HF_CACHE_DIR = path.join(MODELS_DIR, 'hf-cache');
const TRANSFORMERS_TGZ_URL =
  'https://registry.npmmirror.com/@xenova/transformers/-/transformers-2.17.2.tgz';

const SAMPLE_RATE = 16000;

export interface RawSpeechSegment {
  index: number;
  startSec: number;
  endSec: number;
  samples: Float32Array;
}

/**
 * Mix & decode either the group's Voiceover track OR the group's Video Clips timeline
 * (accounting for clip trimStart, trimEnd, speed, mute & xfade overlap!) into 16kHz mono Float32 PCM.
 */
async function decodeGroupTimelineAudio16k(
  project: ProjectData,
  group: VideoGroup,
  sourceTrack: 'auto' | 'voiceover' | 'video_clips' = 'auto'
): Promise<{ samples: Float32Array; sourceLabel: string; timelineOffsetSec: number }> {
  const bins = refreshMediaBinaries();
  if (!bins.ffmpegFound) {
    throw new Error('未检测到 FFmpeg 引擎，无法提取音轨进行语音识别');
  }
  const ffmpegBin = bins.ffmpegPath || FFMPEG_BIN;
  const assetMap = new Map<string, MediaAsset>(project.assets.map((a) => [a.id, a]));

  // Check if voiceover track should be used
  if (sourceTrack !== 'video_clips' && group.voiceoverAssetId) {
    const vo = assetMap.get(group.voiceoverAssetId);
    const voPath = vo ? path.join(UPLOADS_DIR, vo.filename) : null;
    if (vo && voPath && fs.existsSync(voPath)) {
      const t0 = Math.max(0, group.voiceoverTrimStart ?? vo.defaultTrimStart ?? 0);
      const t1 = Math.max(
        t0 + 0.15,
        Math.min(vo.duration, group.voiceoverTrimEnd || vo.defaultTrimEnd || vo.duration)
      );
      const spd = Math.min(2.0, Math.max(0.5, group.voiceoverSpeed ?? vo.defaultSpeed ?? 1.0));
      const delaySec = Math.max(0, group.voiceoverDelaySec || 0);
      const tempoExpr = Math.abs(spd - 1.0) > 0.01 ? `,atempo=${spd.toFixed(4)}` : '';

      const samples = await runFfmpegToFloat32(ffmpegBin, [
        '-v',
        'error',
        '-i',
        voPath,
        '-af',
        `atrim=${t0.toFixed(3)}:${t1.toFixed(3)},asetpts=PTS-STARTPTS${tempoExpr}`,
        '-ac',
        '1',
        '-ar',
        String(SAMPLE_RATE),
        '-f',
        'f32le',
        'pipe:1',
      ]);
      return {
        samples,
        sourceLabel: `口播轨「${vo.name}」`,
        timelineOffsetSec: delaySec,
      };
    }
  }
  if (sourceTrack === 'voiceover') {
    throw new Error('当前视频组尚未挂载独立的口播配音轨，请切换为「智能音轨」或先添加配音');
  }

  // Otherwise extract exact timeline audio across group's video/image clips!
  const validClips = group.clips
    .map((clip) => {
      const asset = assetMap.get(clip.assetId);
      if (!asset || asset.type === 'audio') return null;
      const fp = path.join(UPLOADS_DIR, asset.filename);
      if (!fs.existsSync(fp)) return null;
      return { clip, asset, fp };
    })
    .filter((x): x is NonNullable<typeof x> => Boolean(x));

  if (validClips.length === 0) {
    throw new Error('当前视频组没有可识别的视频原声或口播音频');
  }

  const allMuted =
    validClips.some((x) => x.asset.type === 'video' && x.asset.hasAudio) &&
    validClips.every((x) => !(x.asset.type === 'video' && x.asset.hasAudio) || x.clip.muted);
  if (allMuted) {
    throw new Error(
      '当前视频组内的视频片段均已静音（缩略图左下角红喇叭），若需识别原片说话声请先取消片段静音，或切换为识别口播配音轨'
    );
  }

  const hasAnyVideoAudio = validClips.some(
    (x) => x.asset.type === 'video' && x.asset.hasAudio && !x.clip.muted
  );
  if (!hasAnyVideoAudio) {
    throw new Error(
      '当前视频组内的视频片段均无原声音轨，请挂载口播音频后再识别'
    );
  }

  const inputArgs: string[] = [];
  const filterParts: string[] = [];
  const effDurs: number[] = [];

  for (let i = 0; i < validClips.length; i++) {
    const { clip, asset, fp } = validClips[i];
    const spd = Math.min(2.0, Math.max(0.5, clip.speed || 1.0));
    const t0 = Math.max(0, clip.trimStart || 0);
    const maxEnd =
      asset.type === 'video' ? asset.duration : Math.max(asset.duration, clip.trimEnd || 3.5);
    const t1 = Math.min(maxEnd, Math.max(t0 + 0.2, clip.trimEnd || asset.duration));
    const rawDur = Math.max(0.2, t1 - t0);
    const effDur = rawDur / spd;
    effDurs.push(effDur);

    if (asset.type === 'video' && asset.hasAudio && !clip.muted) {
      inputArgs.push('-ss', t0.toFixed(3), '-t', rawDur.toFixed(3), '-i', fp);
      const inIdx = inputArgs.filter((x) => x === '-i').length - 1;
      const tempo = Math.abs(spd - 1.0) > 0.01 ? `,atempo=${spd.toFixed(4)}` : '';
      filterParts.push(
        `[${inIdx}:a]aresample=${SAMPLE_RATE},aformat=sample_fmts=fltp:channel_layouts=mono,asetpts=PTS-STARTPTS${tempo},apad=whole_dur=${effDur.toFixed(3)},atrim=0:${effDur.toFixed(3)},asetpts=PTS-STARTPTS[a${i}]`
      );
    } else {
      filterParts.push(
        `anullsrc=channel_layout=mono:sample_rate=${SAMPLE_RATE},atrim=0:${effDur.toFixed(3)},asetpts=PTS-STARTPTS[a${i}]`
      );
    }
  }

  const N = validClips.length;
  if (N === 1) {
    filterParts.push('[a0]anull[aout]');
  } else {
    let currA = '[a0]';
    let cumDur = effDurs[0];
    for (let i = 1; i < N; i++) {
      const tr = validClips[i - 1].clip.transition;
      const outA = i === N - 1 ? '[aout]' : `[ax${i}]`;
      if (!tr || tr === 'none' || cumDur < 0.45 || effDurs[i] < 0.45) {
        filterParts.push(`${currA}[a${i}]concat=n=2:v=0:a=1${outA}`);
        cumDur += effDurs[i];
      } else {
        const trDur = Math.min(0.35, cumDur * 0.3, effDurs[i] * 0.3);
        filterParts.push(`${currA}[a${i}]acrossfade=d=${trDur.toFixed(3)}:c1=tri:c2=tri${outA}`);
        cumDur = cumDur + effDurs[i] - trDur;
      }
      currA = outA;
    }
  }

  const samples = await runFfmpegToFloat32(ffmpegBin, [
    '-v',
    'error',
    ...inputArgs,
    '-filter_complex',
    filterParts.join(';'),
    '-map',
    '[aout]',
    '-ac',
    '1',
    '-ar',
    String(SAMPLE_RATE),
    '-f',
    'f32le',
    'pipe:1',
  ]);

  return {
    samples,
    sourceLabel: `本组视频原声时间轴 (${validClips.length}段)`,
    timelineOffsetSec: 0,
  };
}

function runFfmpegToFloat32(ffmpegBin: string, args: string[]): Promise<Float32Array> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let stderr = '';
    const proc = spawn(ffmpegBin, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    proc.stdout.on('data', (c: Buffer) => chunks.push(c));
    proc.stderr.on('data', (c: Buffer) => {
      stderr += c.toString('utf8');
    });
    proc.on('error', reject);
    proc.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`提取音频流失败: ${stderr.slice(-240)}`));
        return;
      }
      const buf = Buffer.concat(chunks);
      const count = Math.floor(buf.byteLength / 4);
      const arr = new Float32Array(count);
      for (let i = 0; i < count; i++) {
        arr[i] = buf.readFloatLE(i * 4);
      }
      resolve(arr);
    });
  });
}

/**
 * Adaptive 16kHz RMS Energy VAD Segmenter:
 * Isolates real human speech utterances [startSec, endSec] so silent B-roll gaps never get subtitles!
 */
export function segmentSpeechByVad(samples: Float32Array): RawSpeechSegment[] {
  const frameSamples = 320; // 20ms @ 16kHz
  const numFrames = Math.floor(samples.length / frameSamples);
  if (numFrames < 8) return [];

  const frameDb = new Float32Array(numFrames);
  const sortedDb: number[] = [];

  for (let f = 0; f < numFrames; f++) {
    const s0 = f * frameSamples;
    let sumSq = 0;
    for (let i = 0; i < frameSamples; i++) {
      const v = samples[s0 + i];
      sumSq += v * v;
    }
    const rms = Math.sqrt(sumSq / frameSamples);
    const db = 20 * Math.log10(Math.max(rms, 1e-6));
    frameDb[f] = db;
    sortedDb.push(db);
  }

  sortedDb.sort((a, b) => a - b);
  const p20Noise = sortedDb[Math.floor(sortedDb.length * 0.2)] ?? -50;
  const p85Peak = sortedDb[Math.floor(sortedDb.length * 0.85)] ?? -20;

  if (p85Peak < -48) {
    return [];
  }

  const gateDb = Math.max(-41, Math.min(-25, Math.max(p20Noise + 8.5, p85Peak - 18)));
  const active = new Uint8Array(numFrames);
  for (let f = 0; f < numFrames; f++) {
    active[f] = frameDb[f] >= gateDb ? 1 : 0;
  }

  // Bridge pauses shorter than 280ms (14 frames)
  const bridgeFrames = 14;
  let gapRun = 0;
  for (let f = 0; f < numFrames; f++) {
    if (active[f] === 0) {
      gapRun++;
    } else {
      if (gapRun > 0 && gapRun < bridgeFrames && f - gapRun > 0) {
        for (let k = f - gapRun; k < f; k++) active[k] = 1;
      }
      gapRun = 0;
    }
  }

  // Extract raw contiguous speech islands + pad onset (-3 frames = 60ms) / offset (+5 frames = 100ms)
  const rawIslands: Array<{ fStart: number; fEnd: number }> = [];
  let inSpeech = false;
  let segStart = 0;
  for (let f = 0; f < numFrames; f++) {
    if (active[f] === 1 && !inSpeech) {
      inSpeech = true;
      segStart = f;
    } else if (active[f] === 0 && inSpeech) {
      inSpeech = false;
      if (f - segStart >= 13) {
        // >= 260ms real utterance
        rawIslands.push({
          fStart: Math.max(0, segStart - 3),
          fEnd: Math.min(numFrames, f + 5),
        });
      }
    }
  }
  if (inSpeech && numFrames - segStart >= 13) {
    rawIslands.push({
      fStart: Math.max(0, segStart - 3),
      fEnd: numFrames,
    });
  }

  // Split any long continuous speech island (> 10.5s = 525 frames) at its quietest internal pause valley
  const finalIslands: Array<{ fStart: number; fEnd: number }> = [];
  const maxFrames = 520;
  for (const isl of rawIslands) {
    let curStart = isl.fStart;
    while (isl.fEnd - curStart > maxFrames) {
      const searchFrom = curStart + 200; // >= 4.0s
      const searchTo = Math.min(isl.fEnd - 80, curStart + maxFrames);
      let minDb = 999;
      let splitAt = Math.min(curStart + 400, isl.fEnd);
      for (let f = searchFrom; f <= searchTo; f++) {
        if (frameDb[f] < minDb) {
          minDb = frameDb[f];
          splitAt = f;
        }
      }
      finalIslands.push({ fStart: curStart, fEnd: splitAt });
      curStart = splitAt;
    }
    if (isl.fEnd - curStart >= 12) {
      finalIslands.push({ fStart: curStart, fEnd: isl.fEnd });
    }
  }

  return finalIslands.map((isl, idx) => {
    const s0 = isl.fStart * frameSamples;
    const s1 = Math.min(samples.length, isl.fEnd * frameSamples);
    return {
      index: idx,
      startSec: Math.round((s0 / SAMPLE_RATE) * 100) / 100,
      endSec: Math.round((s1 / SAMPLE_RATE) * 100) / 100,
      samples: samples.subarray(s0, s1),
    };
  });
}

function encodePcm16WavBuffer(samples: Float32Array, sampleRate = 16000): Buffer {
  const numSamples = samples.length;
  const dataSize = numSamples * 2;
  const buf = Buffer.allocUnsafe(44 + dataSize);

  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + dataSize, 4);
  buf.write('WAVE', 8);
  buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20); // PCM
  buf.writeUInt16LE(1, 22); // Mono
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(dataSize, 40);

  for (let i = 0; i < numSamples; i++) {
    const clamped = Math.max(-1, Math.min(1, samples[i]));
    const int16 = clamped < 0 ? Math.round(clamped * 32768) : Math.round(clamped * 32767);
    buf.writeInt16LE(int16, 44 + i * 2);
  }
  return buf;
}

export function cleanAsrTranscriptText(raw: string): string {
  return (
    (raw || '')
      // Strip SenseVoice / Whisper special tokens like <|zh|><|NEUTRAL|><|Speech|><|woitn|>
      .replace(/<\|[^|>]+\|>/g, '')
      .replace(/\[[^\]]*\]/g, '')
      .trim()
  );
}

interface ResolvedCloudAsrPlan {
  protocol: 'openai_transcriptions' | 'qwen_multimodal_chat';
  endpointUrl: string;
  apiKey: string;
  model: string;
  providerLabel: string;
}

function resolveCloudAsrPlan(cfg: AiEngineSettings): ResolvedCloudAsrPlan {
  const dedicatedKey = (cfg.asrApiKey || '').trim();
  const mainKey = (cfg.apiKey || '').trim();

  // 1) User explicitly configured a dedicated Cloud ASR API Key -> always use ASR fields!
  if (dedicatedKey) {
    const rawBase = (cfg.asrBaseUrl || 'https://api.siliconflow.cn/v1')
      .trim()
      .replace(/\/+$/, '');
    const isDashScope = rawBase.includes('dashscope.aliyuncs.com');
    const model = (
      cfg.asrModel ||
      (isDashScope
        ? 'qwen-omni-turbo'
        : rawBase.includes('bigmodel.cn')
        ? 'glm-asr'
        : 'FunAudioLLM/SenseVoiceSmall')
    ).trim();
    return {
      protocol: isDashScope ? 'qwen_multimodal_chat' : 'openai_transcriptions',
      endpointUrl: isDashScope ? `${rawBase}/chat/completions` : `${rawBase}/audio/transcriptions`,
      apiKey: dedicatedKey,
      model,
      providerLabel: '独立云端ASR密钥',
    };
  }

  // 2) No dedicated ASR key -> check main LLM provider & key
  const preset = AI_PROVIDER_PRESETS[cfg.providerId];
  const presetName = preset?.name.split(' ')[0] || cfg.providerId;

  if (!mainKey) {
    throw new Error(
      '[ASR_CONFIG_REQUIRED] 尚未配置云端语音识别 API Key。推荐点击右上角钥匙图标填入免费的「硅基流动 SiliconFlow」API Key（1秒极速出字），或直接点击旁边的「本地免Key识别」离线提取字幕！'
    );
  }

  if (cfg.providerId === 'siliconflow') {
    const base = (cfg.baseUrl || 'https://api.siliconflow.cn/v1').trim().replace(/\/+$/, '');
    return {
      protocol: 'openai_transcriptions',
      endpointUrl: `${base}/audio/transcriptions`,
      apiKey: mainKey,
      model: (cfg.asrModel || 'FunAudioLLM/SenseVoiceSmall').trim(),
      providerLabel: '硅基流动 SiliconFlow',
    };
  }

  if (cfg.providerId === 'zhipu') {
    const base = (cfg.baseUrl || 'https://open.bigmodel.cn/api/paas/v4')
      .trim()
      .replace(/\/+$/, '');
    const userModel = (cfg.asrModel || '').trim();
    const model =
      !userModel || userModel.includes('SenseVoice') ? 'glm-asr' : userModel;
    return {
      protocol: 'openai_transcriptions',
      endpointUrl: `${base}/audio/transcriptions`,
      apiKey: mainKey,
      model,
      providerLabel: '智谱开放平台 GLM-ASR',
    };
  }

  if (cfg.providerId === 'aliyun_bailian') {
    const base = (cfg.baseUrl || 'https://dashscope.aliyuncs.com/compatible-mode/v1')
      .trim()
      .replace(/\/+$/, '');
    const userModel = (cfg.asrModel || '').trim();
    const model =
      !userModel || userModel.includes('SenseVoice') ? 'qwen-omni-turbo' : userModel;
    return {
      protocol: 'qwen_multimodal_chat',
      endpointUrl: `${base}/chat/completions`,
      apiKey: mainKey,
      model,
      providerLabel: '阿里百炼 Qwen-Omni',
    };
  }

  if (cfg.providerId === 'openai_custom') {
    const base = (cfg.asrBaseUrl || cfg.baseUrl || 'https://api.openai.com/v1')
      .trim()
      .replace(/\/+$/, '');
    const userModel = (cfg.asrModel || '').trim();
    const model =
      !userModel || userModel.includes('SenseVoice') ? 'whisper-1' : userModel;
    return {
      protocol: 'openai_transcriptions',
      endpointUrl: `${base}/audio/transcriptions`,
      apiKey: mainKey,
      model,
      providerLabel: '自定义 OpenAI 兼容接口',
    };
  }

  // DeepSeek / Doubao / Ollama do NOT expose /audio/transcriptions!
  // Never leak or misroute their key to SiliconFlow (which caused 401 Token is invalid)!
  throw new Error(
    `[ASR_CONFIG_REQUIRED] 当前主模型「${presetName}」仅提供文本对话接口，不支持云端语音转文字。请在配置面板下方「独立云端 ASR 密钥」处填入免费的硅基流动 Key，或直接点击旁边的「本地免Key识别」！`
  );
}

async function transcribeSingleWavBufferViaPlan(
  wavBuf: Buffer,
  segIdx: number,
  plan: ResolvedCloudAsrPlan
): Promise<string> {
  if (plan.protocol === 'qwen_multimodal_chat') {
    const b64 = wavBuf.toString('base64');
    const res = await fetch(plan.endpointUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${plan.apiKey}`,
      },
      body: JSON.stringify({
        model: plan.model,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'input_audio',
                input_audio: {
                  data: `data:audio/wav;base64,${b64}`,
                  format: 'wav',
                },
              },
              {
                type: 'text',
                text: '请逐字准确转写这段中文语音内容，只输出纯文字台词，若无说话声则输出空字符串，不要任何解释。',
              },
            ],
          },
        ],
      }),
    });

    if (!res.ok) {
      const errTxt = await res.text().catch(() => '');
      throw new Error(formatCloudAsrHttpError(res.status, plan.providerLabel, errTxt));
    }
    const json: any = await res.json();
    const content = json?.choices?.[0]?.message?.content;
    const rawText = Array.isArray(content)
      ? content.map((c: any) => c?.text || '').join('')
      : String(content || '');
    return cleanAsrTranscriptText(rawText);
  }

  const form = new FormData();
  form.append(
    'file',
    new Blob([new Uint8Array(wavBuf)], { type: 'audio/wav' }),
    `seg_${segIdx}.wav`
  );
  form.append('model', plan.model);
  if (plan.model.toLowerCase().includes('whisper')) {
    form.append('language', 'zh');
  }

  const headers: Record<string, string> = {};
  if (plan.apiKey) {
    headers.Authorization = `Bearer ${plan.apiKey}`;
  }

  const res = await fetch(plan.endpointUrl, {
    method: 'POST',
    headers,
    body: form,
  });

  if (!res.ok) {
    const errTxt = await res.text().catch(() => '');
    throw new Error(formatCloudAsrHttpError(res.status, plan.providerLabel, errTxt));
  }

  const json: any = await res.json();
  return cleanAsrTranscriptText(String(json?.text || ''));
}

function formatCloudAsrHttpError(status: number, providerLabel: string, rawBody: string): string {
  const shortBody = rawBody.replace(/\s+/g, ' ').slice(0, 110);
  if (status === 401 || status === 403) {
    return `[ASR_CONFIG_REQUIRED] ${providerLabel} API Key 校验未通过 (HTTP ${status})：请检查密钥是否填写正确，且与所选服务商匹配（${shortBody}）`;
  }
  if (status === 404) {
    return `[ASR_CONFIG_REQUIRED] ${providerLabel} 当前接口地址不支持语音识别端点 (HTTP 404)，建议在下方单独填入硅基流动免费 ASR Key 或使用「本地免Key识别」`;
  }
  if (status === 429) {
    return `${providerLabel} 请求过于频繁或额度不足 (HTTP 429)，请稍后再试或切换「本地免Key识别」`;
  }
  return `${providerLabel} 云端语音识别返回 HTTP ${status}: ${shortBody}`;
}

export async function testCloudAsrConnection(
  overrideSettings?: Partial<AiEngineSettings>
): Promise<{ ok: boolean; latencyMs: number; message: string }> {
  const t0 = Date.now();
  try {
    const cfg: AiEngineSettings = { ...loadAiSettings(), ...(overrideSettings || {}) };
    const plan = resolveCloudAsrPlan(cfg);

    // Build a clean 0.6s 16kHz test WAV buffer
    const testSamples = new Float32Array(Math.floor(SAMPLE_RATE * 0.6));
    for (let i = 0; i < testSamples.length; i++) {
      testSamples[i] = Math.sin((2 * Math.PI * 440 * i) / SAMPLE_RATE) * 0.02;
    }
    const wavBuf = encodePcm16WavBuffer(testSamples, SAMPLE_RATE);
    await transcribeSingleWavBufferViaPlan(wavBuf, 0, plan);
    const ms = Date.now() - t0;
    return {
      ok: true,
      latencyMs: ms,
      message: `✓ 云端语音识别连通成功！(${plan.providerLabel} · ${plan.model} · ${ms}ms)`,
    };
  } catch (err: any) {
    const ms = Date.now() - t0;
    const cleanMsg = String(err?.message || '云端 ASR 测试失败').replace(
      /^\[ASR_CONFIG_REQUIRED\]\s*/,
      ''
    );
    return {
      ok: false,
      latencyMs: ms,
      message: `✗ ${cleanMsg}`,
    };
  }
}

export async function transcribeGroupViaCloudAsr(
  project: ProjectData,
  group: VideoGroup,
  sourceTrack: 'auto' | 'voiceover' | 'video_clips' = 'auto',
  overrideSettings?: Partial<AiEngineSettings>
): Promise<{
  cues: SubtitleCue[];
  segmentCount: number;
  sourceLabel: string;
  modelUsed: string;
}> {
  const cfg: AiEngineSettings = { ...loadAiSettings(), ...(overrideSettings || {}) };
  const plan = resolveCloudAsrPlan(cfg);

  const { samples, sourceLabel, timelineOffsetSec } = await decodeGroupTimelineAudio16k(
    project,
    group,
    sourceTrack
  );
  const segments = segmentSpeechByVad(samples);
  if (segments.length === 0) {
    throw new Error('未在音频中检测到有效人声说话片段，请确认音量正常');
  }

  const segmentTexts = new Array<string>(segments.length).fill('');
  let cursor = 0;
  const concurrency = Math.min(3, segments.length);

  async function worker() {
    while (cursor < segments.length) {
      const idx = cursor++;
      const seg = segments[idx];
      const wavBuf = encodePcm16WavBuffer(seg.samples, SAMPLE_RATE);
      segmentTexts[idx] = await transcribeSingleWavBufferViaPlan(wavBuf, idx, plan);
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()));

  const allCues: SubtitleCue[] = [];
  for (let i = 0; i < segments.length; i++) {
    const txt = segmentTexts[i];
    if (!txt) continue;
    const seg = segments[i];
    const subCues = buildSyncedSubtitlesFromScript(
      txt,
      Math.max(0.3, seg.endSec - seg.startSec),
      timelineOffsetSec + seg.startSec
    );
    allCues.push(...subCues);
  }

  return {
    cues: allCues,
    segmentCount: segments.length,
    sourceLabel,
    modelUsed: plan.model,
  };
}

/**
 * Pure-Node tar.gz extractor for @xenova/transformers/dist/* from Alibaba npmmirror CDN
 * Zero extra npm packages, zero C++ DLLs!
 */
let runtimeBootstrapPromise: Promise<void> | null = null;

export async function ensureLocalWasmRuntimeReady(): Promise<void> {
  const entryJs = path.join(WASM_RUNTIME_DIR, 'transformers.min.js');
  const simdWasm = path.join(WASM_RUNTIME_DIR, 'ort-wasm-simd.wasm');
  if (fs.existsSync(entryJs) && fs.existsSync(simdWasm)) {
    return;
  }
  if (runtimeBootstrapPromise) {
    return runtimeBootstrapPromise;
  }

  runtimeBootstrapPromise = (async () => {
    try {
      fs.mkdirSync(WASM_RUNTIME_DIR, { recursive: true });
      const res = await fetch(TRANSFORMERS_TGZ_URL);
      if (!res.ok) {
        throw new Error(`下载离线推理内核失败 (HTTP ${res.status})`);
      }
      const gzBuf = Buffer.from(await res.arrayBuffer());
      const tarBuf = zlib.gunzipSync(gzBuf);

      let offset = 0;
      while (offset + 512 <= tarBuf.length) {
        const header = tarBuf.subarray(offset, offset + 512);
        if (header[0] === 0) break;

        const rawName = header.subarray(0, 100).toString('utf8').replace(/\0.*$/, '');
        const sizeOctal = header.subarray(124, 136).toString('utf8').replace(/\0.*$/, '').trim();
        const fileSize = parseInt(sizeOctal, 8) || 0;
        const typeFlag = String.fromCharCode(header[156]);
        const dataStart = offset + 512;
        const dataEnd = dataStart + fileSize;

        if ((typeFlag === '0' || typeFlag === '\0') && rawName.startsWith('package/dist/')) {
          const baseName = path.basename(rawName);
          if (
            baseName.endsWith('.js') ||
            baseName.endsWith('.wasm') ||
            baseName.endsWith('.mjs')
          ) {
            fs.writeFileSync(
              path.join(WASM_RUNTIME_DIR, baseName),
              tarBuf.subarray(dataStart, dataEnd)
            );
          }
        }

        offset = dataStart + Math.ceil(fileSize / 512) * 512;
      }
    } finally {
      runtimeBootstrapPromise = null;
    }
  })();

  return runtimeBootstrapPromise;
}

export async function prepareGroupSegmentsForLocalWasm(
  project: ProjectData,
  group: VideoGroup,
  sourceTrack: 'auto' | 'voiceover' | 'video_clips' = 'auto'
): Promise<{
  segments: SpeechSegmentPayload[];
  sourceLabel: string;
}> {
  await ensureLocalWasmRuntimeReady();
  const { samples, sourceLabel, timelineOffsetSec } = await decodeGroupTimelineAudio16k(
    project,
    group,
    sourceTrack
  );
  const rawSegs = segmentSpeechByVad(samples);
  if (rawSegs.length === 0) {
    throw new Error('未在音轨中检测到有效人声片段，请确认视频原声未静音');
  }

  const payloads: SpeechSegmentPayload[] = rawSegs.map((seg) => {
    const byteBuf = Buffer.allocUnsafe(seg.samples.length * 4);
    for (let i = 0; i < seg.samples.length; i++) {
      byteBuf.writeFloatLE(seg.samples[i], i * 4);
    }
    return {
      index: seg.index,
      startSec: Math.round((timelineOffsetSec + seg.startSec) * 100) / 100,
      endSec: Math.round((timelineOffsetSec + seg.endSec) * 100) / 100,
      pcmFloat32Base64: byteBuf.toString('base64'),
    };
  });

  return { segments: payloads, sourceLabel };
}

/**
 * Smart Disk-Caching Proxy for HuggingFace Whisper ONNX files:
 * - Serves instantaneously from local `storage/models/hf-cache/` on 2nd+ run (100% offline capable!)
 * - Fetches via domestic `https://hf-mirror.com/` first, falling back to `https://huggingface.co/`
 */
export async function serveCachedHfModelFile(relPath: string, res: Response): Promise<void> {
  const safeRel = relPath.replace(/\.\.+/g, '').replace(/^\/+/, '');
  if (!safeRel) {
    res.status(400).send('Invalid model path');
    return;
  }

  const localPath = path.join(HF_CACHE_DIR, safeRel);
  if (fs.existsSync(localPath)) {
    const stat = fs.statSync(localPath);
    if (stat.size > 0) {
      if (safeRel.endsWith('.json')) res.setHeader('Content-Type', 'application/json');
      else res.setHeader('Content-Type', 'application/octet-stream');
      res.setHeader('Content-Length', String(stat.size));
      fs.createReadStream(localPath).pipe(res);
      return;
    }
  }

  const urlsToTry = [
    `https://hf-mirror.com/${safeRel}`,
    `https://huggingface.co/${safeRel}`,
  ];

  let upstreamRes: globalThis.Response | null = null;
  for (const url of urlsToTry) {
    try {
      const candidate = await fetch(url, { redirect: 'follow' });
      if (candidate.ok && candidate.body) {
        upstreamRes = candidate;
        break;
      }
    } catch {
      // try next mirror
    }
  }

  if (!upstreamRes || !upstreamRes.body) {
    res.status(502).json({ error: `下载离线语音模型文件失败: ${safeRel}` });
    return;
  }

  fs.mkdirSync(path.dirname(localPath), { recursive: true });
  const tmpPath = `${localPath}.part_${Date.now()}`;
  const fileStream = fs.createWriteStream(tmpPath);

  const contentType = upstreamRes.headers.get('content-type') || 'application/octet-stream';
  const contentLength = upstreamRes.headers.get('content-length');
  res.setHeader('Content-Type', contentType);
  if (contentLength) {
    res.setHeader('Content-Length', contentLength);
  }

  const reader = upstreamRes.body.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        const chunk = Buffer.from(value);
        fileStream.write(chunk);
        res.write(chunk);
      }
    }
    fileStream.end();
    await new Promise<void>((resolve) => fileStream.on('finish', () => resolve()));
    fs.renameSync(tmpPath, localPath);
    res.end();
  } catch (err) {
    fileStream.destroy();
    try {
      if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
    } catch {
      // ignore
    }
    if (!res.headersSent) {
      res.status(500).end();
    } else {
      res.end();
    }
  }
}
