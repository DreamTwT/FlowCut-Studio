import { execFile, spawn } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import {
  BeatAnalysisResult,
  BeatDensityMode,
  DetectedSceneSegment,
  FULL_CROP,
  MediaAsset,
  ProjectData,
  SceneDetectRequest,
  SceneSplitCommitRequest,
  SceneTag,
} from '../shared/schema.js';
import { FFMPEG_BIN, refreshMediaBinaries, THUMBS_DIR, UPLOADS_DIR } from './paths.js';
import { deleteAssetFromProject, makeClipFromAsset, saveProject } from './projectStore.js';

const execFileAsync = promisify(execFile);

/**
 * Assigns short-video ad narrative SceneTags across N sequential shots:
 * Shot 0 -> 吸睛开头, Shot 1 -> 痛点场景, Middle -> 核心卖点 / 产品特写, Last -> 促销CTA
 */
export function inferNarrativeSceneTag(index: number, total: number): SceneTag {
  if (total <= 1) return '核心卖点';
  if (index === 0) return '吸睛开头';
  if (index === total - 1) return '促销CTA';
  if (index === 1 && total >= 4) return '痛点场景';
  return index % 2 === 0 ? '核心卖点' : '产品特写';
}

function runFfmpegStderr(args: string[], timeoutMs = 90_000): Promise<string> {
  refreshMediaBinaries();
  return new Promise((resolve, reject) => {
    const proc = spawn(FFMPEG_BIN, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    const chunks: string[] = [];
    const timer = setTimeout(() => {
      proc.kill('SIGKILL');
      reject(new Error('视频镜头扫描超时'));
    }, timeoutMs);

    proc.stderr.on('data', (d: Buffer) => chunks.push(d.toString('utf8')));
    proc.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
    proc.on('close', () => {
      clearTimeout(timer);
      resolve(chunks.join(''));
    });
  });
}

async function generateShotThumbnail(
  videoPath: string,
  seekSec: number,
  thumbFilename: string
): Promise<string | undefined> {
  const outPath = path.join(THUMBS_DIR, thumbFilename);
  try {
    await execFileAsync(
      FFMPEG_BIN,
      [
        '-y',
        '-ss',
        Math.max(0, seekSec).toFixed(3),
        '-i',
        videoPath,
        '-frames:v',
        '1',
        '-vf',
        'scale=360:-2',
        '-q:v',
        '4',
        outPath,
      ],
      { timeout: 15_000 }
    );
    if (fs.existsSync(outPath) && fs.statSync(outPath).size > 100) {
      return `/media/thumbnails/${thumbFilename}`;
    }
  } catch {
    // ignore single frame failure
  }
  return undefined;
}

/**
 * Scans a video asset for camera/scene cuts via FFmpeg `scdet` (or fixed rhythmic intervals),
 * merges micro-flash cuts shorter than `minShotSec`, and extracts midpoint thumbnails.
 */
export async function detectVideoScenes(
  asset: MediaAsset,
  req: SceneDetectRequest
): Promise<{
  segments: DetectedSceneSegment[];
  modeUsed: 'smart_scdet' | 'fixed_interval';
  autoFallbackNote?: string;
}> {
  if (asset.type !== 'video') {
    throw new Error('仅视频素材支持智能镜头拆条');
  }
  const videoPath = path.join(UPLOADS_DIR, asset.filename);
  if (!fs.existsSync(videoPath)) {
    throw new Error(`找不到源视频文件: ${asset.name}`);
  }

  const rangeStart = Math.max(0, asset.defaultTrimStart || 0);
  const rangeEnd = Math.max(
    rangeStart + 0.5,
    Math.min(asset.duration, asset.defaultTrimEnd || asset.duration)
  );
  const totalSpan = rangeEnd - rangeStart;
  const minShotSec = Math.max(0.6, Math.min(10, Number(req.minShotSec || 1.5)));

  let cutPointsRel: Array<{ time: number; score: number }> = [];
  let modeUsed: 'smart_scdet' | 'fixed_interval' = req.mode || 'smart_scdet';
  let autoFallbackNote: string | undefined;

  if (modeUsed === 'smart_scdet') {
    const sens = req.sensitivity || 'standard';
    const threshold = sens === 'high' ? 6.5 : sens === 'low' ? 18.0 : 11.0;

    const stderr = await runFfmpegStderr([
      '-hide_banner',
      '-ss',
      rangeStart.toFixed(3),
      '-t',
      totalSpan.toFixed(3),
      '-i',
      videoPath,
      '-vf',
      `scale=320:-2,scdet=threshold=${threshold}`,
      '-an',
      '-f',
      'null',
      '-',
    ]);

    const regex = /lavfi\.scd\.score:\s*([\d.]+),\s*lavfi\.scd\.time:\s*([\d.]+)/g;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(stderr)) !== null) {
      const score = parseFloat(match[1]);
      const t = parseFloat(match[2]);
      if (Number.isFinite(t) && t > 0.15 && t < totalSpan - 0.15) {
        cutPointsRel.push({ time: t, score: Number.isFinite(score) ? score : threshold });
      }
    }

    // If video is a continuous one-take shot (0 scene cuts detected) and >= 4s,
    // gracefully suggest / slice into 3.0s rhythmic segments so the user still gets actionable shots!
    if (cutPointsRel.length === 0 && totalSpan >= 3.6) {
      const fallbackStep = Math.min(3.5, Math.max(2.0, totalSpan / Math.min(6, Math.ceil(totalSpan / 3))));
      for (let t = fallbackStep; t < totalSpan - 0.8; t += fallbackStep) {
        cutPointsRel.push({ time: t, score: 0 });
      }
      modeUsed = 'fixed_interval';
      autoFallbackNote =
        '该视频为一镜到底连续画面（无硬转场突变），已自动按均匀节奏预切分，您也可手动调整切分间隔';
    }
  } else {
    const step = Math.max(1.0, Math.min(30, Number(req.fixedIntervalSec || 3.0)));
    for (let t = step; t < totalSpan - 0.5; t += step) {
      cutPointsRel.push({ time: t, score: 100 });
    }
  }

  // Sort & merge segments shorter than `minShotSec`
  cutPointsRel.sort((a, b) => a.time - b.time);
  const rawBounds: Array<{ start: number; end: number; score: number }> = [];
  let prev = 0;
  let prevScore = 100;
  for (const cp of cutPointsRel) {
    if (cp.time - prev >= minShotSec) {
      rawBounds.push({ start: prev, end: cp.time, score: prevScore });
      prev = cp.time;
      prevScore = cp.score;
    }
  }
  if (totalSpan - prev < minShotSec * 0.65 && rawBounds.length > 0) {
    // Absorb tiny tail into final shot
    rawBounds[rawBounds.length - 1].end = totalSpan;
  } else {
    rawBounds.push({ start: prev, end: totalSpan, score: prevScore });
  }

  const baseTitle = asset.name.replace(/\.[^.]+$/, '').slice(0, 18);
  const segments: DetectedSceneSegment[] = rawBounds.map((b, idx) => {
    const id = uuidv4();
    const startSec = Math.round((rangeStart + b.start) * 100) / 100;
    const endSec = Math.round((rangeStart + b.end) * 100) / 100;
    const durationSec = Math.round(Math.max(0.2, endSec - startSec) * 100) / 100;
    const sceneTag = inferNarrativeSceneTag(idx, rawBounds.length);
    return {
      id,
      index: idx,
      startSec,
      endSec,
      durationSec,
      score: Math.round(b.score * 10) / 10,
      name: `${baseTitle}_镜头${String(idx + 1).padStart(2, '0')}`,
      sceneTag,
    };
  });

  // Extract midpoint thumbnails in parallel batches of 4
  const BATCH = 4;
  for (let i = 0; i < segments.length; i += BATCH) {
    const slice = segments.slice(i, i + BATCH);
    await Promise.all(
      slice.map(async (seg) => {
        const midSec = seg.startSec + seg.durationSec * 0.45;
        const thumbFile = `thumb_split_${seg.id}.jpg`;
        const url = await generateShotThumbnail(videoPath, midSec, thumbFile);
        seg.thumbnailUrl = url || asset.thumbnailUrl;
      })
    );
  }

  return { segments, modeUsed, autoFallbackNote };
}

/**
 * Commits user-confirmed split segments into the project as independent zero-copy MediaAssets,
 * and optionally dispatches them directly into the active VideoGroup or Matrix Mixer slots!
 */
export function commitSceneSplitToProject(
  project: ProjectData,
  sourceAssetId: string,
  req: SceneSplitCommitRequest
): { createdAssets: MediaAsset[]; project: ProjectData } {
  const srcAsset = project.assets.find((a) => a.id === sourceAssetId);
  if (!srcAsset) {
    throw new Error('找不到待拆条的源视频素材');
  }
  if (!Array.isArray(req.segments) || req.segments.length === 0) {
    throw new Error('请至少勾选 1 个镜头片段');
  }

  const createdAssets: MediaAsset[] = req.segments.map((seg, idx) => {
    const start = Math.max(0, Math.min(srcAsset.duration - 0.1, Number(seg.startSec) || 0));
    const end = Math.max(start + 0.2, Math.min(srcAsset.duration, Number(seg.endSec) || srcAsset.duration));
    return {
      id: uuidv4(),
      name: seg.name?.trim() || `${srcAsset.name}_片段${String(idx + 1).padStart(2, '0')}`,
      type: 'video',
      filename: srcAsset.filename,
      url: srcAsset.url,
      thumbnailUrl: seg.thumbnailUrl || srcAsset.thumbnailUrl,
      duration: srcAsset.duration,
      width: srcAsset.width,
      height: srcAsset.height,
      fps: srcAsset.fps,
      hasAudio: srcAsset.hasAudio,
      sizeBytes: Math.round(srcAsset.sizeBytes * ((end - start) / Math.max(0.5, srcAsset.duration))),
      sceneTag: seg.sceneTag || '未分类',
      defaultTrimStart: Math.round(start * 100) / 100,
      defaultTrimEnd: Math.round(end * 100) / 100,
      defaultCrop: srcAsset.defaultCrop ? { ...srcAsset.defaultCrop } : { ...FULL_CROP },
      defaultFitMode: srcAsset.defaultFitMode || 'cover',
      createdAt: new Date().toISOString(),
    };
  });

  // Insert right after source asset (or at top)
  const srcIdx = project.assets.findIndex((a) => a.id === sourceAssetId);
  if (srcIdx >= 0) {
    project.assets.splice(srcIdx + 1, 0, ...createdAssets);
  } else {
    project.assets.unshift(...createdAssets);
  }

  // Dispatch according to requested mode
  if (req.dispatchMode === 'active_group') {
    const grp =
      project.videoGroups.find((g) => g.id === req.targetGroupId) || project.videoGroups[0];
    if (grp) {
      const newClips = createdAssets.map((a) =>
        makeClipFromAsset(a, project.matrix.defaultFitMode, project.matrix.defaultTransition)
      );
      grp.clips.push(...newClips);
    }
  } else if (req.dispatchMode === 'matrix_slots_by_tag' && project.matrix.slots.length > 0) {
    const slots = project.matrix.slots;
    for (let i = 0; i < createdAssets.length; i++) {
      const a = createdAssets[i];
      let targetSlot = slots[Math.min(slots.length - 1, i)];
      if (a.sceneTag === '吸睛开头') {
        targetSlot =
          slots.find((s) => s.name.includes('开头') || s.name.includes('钩子')) || slots[0];
      } else if (a.sceneTag === '痛点场景') {
        targetSlot =
          slots.find((s) => s.name.includes('痛点') || s.name.includes('场景')) ||
          slots[Math.min(1, slots.length - 1)];
      } else if (a.sceneTag === '核心卖点' || a.sceneTag === '产品特写') {
        targetSlot =
          slots.find((s) => s.name.includes('卖点') || s.name.includes('特写')) ||
          slots[Math.min(2, slots.length - 1)];
      } else if (a.sceneTag === '促销CTA') {
        targetSlot =
          slots.find(
            (s) => s.name.includes('促销') || s.name.includes('CTA') || s.name.includes('福利')
          ) || slots[slots.length - 1];
      }
      if (targetSlot && !targetSlot.assetIds.includes(a.id)) {
        targetSlot.assetIds.push(a.id);
      }
    }
  }

  if (req.removeOriginalAsset) {
    deleteAssetFromProject(project, sourceAssetId);
  } else {
    saveProject(project);
  }

  return { createdAssets, project };
}

/**
 * Decodes an audio/BGM track into 16kHz mono PCM, applies low-frequency kick/bass emphasis +
 * spectral-flux onset peak picking, estimates BPM, and returns musical beat cut points!
 */
export async function detectAudioBeats(
  asset: MediaAsset,
  options: {
    trimStart?: number;
    trimEnd?: number;
    speed?: number;
    density?: BeatDensityMode;
  } = {}
): Promise<BeatAnalysisResult> {
  refreshMediaBinaries();
  const audioPath = path.join(UPLOADS_DIR, asset.filename);
  if (!fs.existsSync(audioPath)) {
    throw new Error(`找不到音频文件: ${asset.name}`);
  }

  const start = Math.max(0, options.trimStart ?? asset.defaultTrimStart ?? 0);
  const rawEnd = options.trimEnd || asset.defaultTrimEnd || asset.duration || 15;
  const end = Math.max(start + 0.5, Math.min(asset.duration, rawEnd));
  const speed = Math.max(0.5, Math.min(2.0, options.speed || asset.defaultSpeed || 1.0));
  const density: BeatDensityMode = options.density || 'standard';

  // Cap analysis at 90s of timeline duration for instant sub-300ms turnaround
  const maxSourceDur = Math.min(end - start, 90 * speed);
  const sr = 16000;

  const pcmBuf = await new Promise<Buffer>((resolve, reject) => {
    const args = [
      '-hide_banner',
      '-ss',
      start.toFixed(3),
      '-t',
      maxSourceDur.toFixed(3),
      '-i',
      audioPath,
      ...(Math.abs(speed - 1.0) > 0.01 ? ['-af', `atempo=${speed.toFixed(3)}`] : []),
      '-ac',
      '1',
      '-ar',
      String(sr),
      '-f',
      's16le',
      'pipe:1',
    ];
    const proc = spawn(FFMPEG_BIN, args, { stdio: ['ignore', 'pipe', 'ignore'] });
    const chunks: Buffer[] = [];
    proc.stdout.on('data', (c: Buffer) => chunks.push(c));
    proc.on('error', reject);
    proc.on('close', () => resolve(Buffer.concat(chunks)));
  });

  const sampleCount = Math.floor(pcmBuf.length / 2);
  const analyzedDurationSec = Math.round((sampleCount / sr) * 100) / 100;
  if (sampleCount < sr * 0.6) {
    return {
      assetId: asset.id,
      analyzedDurationSec,
      estimatedBpm: 120,
      density,
      beatsSec: [0, Math.max(0.5, analyzedDurationSec)],
    };
  }

  // Hop size = 320 samples (20ms -> 50Hz envelope)
  // Single-pole low-pass filter at fc=240Hz to emphasize bass/kick drum hits!
  const hop = 320;
  const frameCount = Math.floor(sampleCount / hop);
  const fullEnv = new Float32Array(frameCount);
  const bassEnv = new Float32Array(frameCount);

  const rc = 1 / (2 * Math.PI * 240);
  const dt = 1 / sr;
  const alpha = dt / (rc + dt);
  let lpState = 0;

  for (let f = 0; f < frameCount; f++) {
    let sumSqFull = 0;
    let sumSqBass = 0;
    const baseByte = f * hop * 2;
    for (let i = 0; i < hop; i++) {
      const s = pcmBuf.readInt16LE(baseByte + i * 2) / 32768;
      lpState = lpState + alpha * (s - lpState);
      sumSqFull += s * s;
      sumSqBass += lpState * lpState;
    }
    fullEnv[f] = Math.sqrt(sumSqFull / hop);
    bassEnv[f] = Math.sqrt(sumSqBass / hop);
  }

  // Compute Half-Wave Rectified Onset Flux (65% kick/bass + 35% full-band transient)
  const flux = new Float32Array(frameCount);
  for (let f = 2; f < frameCount; f++) {
    const dfBass = Math.max(0, bassEnv[f] - bassEnv[f - 1]);
    const dfFull = Math.max(0, fullEnv[f] - fullEnv[f - 1]);
    flux[f] = dfBass * 0.65 + dfFull * 0.35;
  }

  // Estimate BPM via autocorrelation across [75 BPM .. 162 BPM] (lags 18..40 frames at 50Hz)
  let bestLag = 25; // 120 BPM default
  let bestCorr = -1;
  const corrFrames = Math.min(frameCount, 50 * 25); // first 25s
  for (let lag = 18; lag <= 40; lag++) {
    let corr = 0;
    for (let i = 0; i < corrFrames - lag; i++) {
      corr += flux[i] * flux[i + lag];
    }
    // Slight prior favoring natural 95..140 BPM over half/double harmonics
    const bpm = (60 * 50) / lag;
    const weight = bpm >= 95 && bpm <= 142 ? 1.08 : 1.0;
    if (corr * weight > bestCorr) {
      bestCorr = corr * weight;
      bestLag = lag;
    }
  }
  const estimatedBpm = Math.round((60 * 50) / bestLag);
  const beatPeriodSec = 60 / Math.max(60, estimatedBpm);

  // Minimum inter-cut spacing governed by user density preference
  const minGapSec =
    density === 'dense'
      ? Math.max(0.85, beatPeriodSec * 1.8)
      : density === 'relaxed'
      ? Math.max(2.8, beatPeriodSec * 5.5)
      : Math.max(1.65, beatPeriodSec * 3.6);
  const minGapFrames = Math.max(15, Math.round(minGapSec * 50));

  // Adaptive local threshold peak picking over flux
  const winRadius = 18; // +-0.36s local mean window
  const sensitivityMult = density === 'dense' ? 1.18 : density === 'relaxed' ? 1.48 : 1.3;
  const beatsSec: number[] = [0];
  let lastBeatFrame = 0;

  for (let f = minGapFrames; f < frameCount - 5; f++) {
    if (f - lastBeatFrame < minGapFrames) continue;

    // Must be a local maximum within +-3 frames (60ms)
    const val = flux[f];
    if (
      val < flux[f - 1] ||
      val < flux[f + 1] ||
      val < flux[f - 2] ||
      val < flux[f + 2]
    ) {
      continue;
    }

    let localSum = 0;
    let cnt = 0;
    for (let k = Math.max(0, f - winRadius); k <= Math.min(frameCount - 1, f + winRadius); k++) {
      localSum += flux[k];
      cnt++;
    }
    const localMean = localSum / Math.max(1, cnt);

    // Also allow rhythmic fallback if music went > 2.1 * minGapSec without a hard transient
    const overdue = f - lastBeatFrame >= Math.round(minGapFrames * 2.15);
    if (val > localMean * sensitivityMult && val > 0.0025) {
      beatsSec.push(Math.round((f / 50) * 100) / 100);
      lastBeatFrame = f;
    } else if (overdue && val >= localMean * 0.95) {
      beatsSec.push(Math.round((f / 50) * 100) / 100);
      lastBeatFrame = f;
    }
  }

  // Guarantee clean rhythmic intervals even on ambient/pad tracks
  if (beatsSec.length < 3 && analyzedDurationSec >= 3.0) {
    const fallbackBeats = [0];
    const step = Math.max(1.2, minGapSec);
    for (let t = step; t < analyzedDurationSec - 0.5; t += step) {
      fallbackBeats.push(Math.round(t * 100) / 100);
    }
    fallbackBeats.push(analyzedDurationSec);
    return {
      assetId: asset.id,
      analyzedDurationSec,
      estimatedBpm,
      density,
      beatsSec: fallbackBeats,
    };
  }

  if (analyzedDurationSec - beatsSec[beatsSec.length - 1] >= minGapSec * 0.6) {
    beatsSec.push(analyzedDurationSec);
  }

  return {
    assetId: asset.id,
    analyzedDurationSec,
    estimatedBpm,
    density,
    beatsSec,
  };
}
