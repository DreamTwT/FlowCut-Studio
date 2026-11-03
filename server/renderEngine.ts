import { spawn, ChildProcess } from 'child_process';
import fs from 'fs';
import path from 'path';
import archiver from 'archiver';
import { Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { EXPORTS_DIR, FFMPEG_BIN, refreshMediaBinaries, UPLOADS_DIR } from './paths.js';
import {
  PreRenderedSubtitleStripInput,
  renderOverlayPng,
  renderSubtitleStripFiles,
} from './overlayRenderer.js';
import { saveProject } from './projectStore.js';
import {
  AspectRatio,
  ExportQuality,
  getTargetDimensions,
  isCustomCropped,
  MediaAsset,
  ProjectData,
  RenderBatchJob,
  RenderItemStatus,
  VideoGroup,
} from '../shared/schema.js';

const batches = new Map<string, RenderBatchJob>();
const activeProcs = new Map<string, ChildProcess>();

function sanitizeFilename(raw: string): string {
  return raw
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')
    .replace(/\s+/g, '_')
    .slice(0, 90);
}

export function getBatchJob(batchId: string): RenderBatchJob | undefined {
  return batches.get(batchId);
}

export function listRecentBatches(): RenderBatchJob[] {
  return Array.from(batches.values()).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function cancelBatchJob(batchId: string): RenderBatchJob | undefined {
  const batch = batches.get(batchId);
  if (!batch) return undefined;
  batch.status = 'cancelled';
  for (const item of batch.items) {
    if (item.status === 'queued' || item.status === 'rendering') {
      item.status = 'cancelled';
      const proc = activeProcs.get(item.jobItemId);
      if (proc) {
        proc.kill('SIGKILL');
        activeProcs.delete(item.jobItemId);
      }
    }
  }
  return batch;
}

export interface StartBatchOptions {
  groupIds?: string[];
  aspectRatio?: AspectRatio;
  quality?: ExportQuality;
  fps?: 30 | 60;
  crf?: 20 | 23;
  filenamePattern?: string;
  overlayPngMap?: Record<string, string>;
  subtitleStripsMap?: Record<string, PreRenderedSubtitleStripInput[]>;
}

export function startBatchRender(project: ProjectData, opts: StartBatchOptions = {}): RenderBatchJob {
  const aspectRatio = opts.aspectRatio || project.aspectRatio || '9:16';
  const quality = opts.quality || project.exportQuality || '1080p';
  const fps = opts.fps || project.exportFps || 30;
  const crf = opts.crf || project.exportCrf || 23;
  const pattern = opts.filenamePattern || project.filenamePattern || '{project}_{index}_{group}';

  const targetGroups = project.videoGroups.filter((g) => {
    if (g.clips.length === 0) return false;
    if (opts.groupIds && opts.groupIds.length > 0) {
      return opts.groupIds.includes(g.id);
    }
    return g.selectedForExport;
  });

  const batchId = uuidv4();
  const batchDir = path.join(EXPORTS_DIR, batchId);
  fs.mkdirSync(batchDir, { recursive: true });

  const items: RenderItemStatus[] = targetGroups.map((group, idx) => {
    const seqStr = String(idx + 1).padStart(2, '0');
    const rawName = pattern
      .replace('{project}', project.name || '信息流项目')
      .replace('{index}', seqStr)
      .replace('{group}', group.name || `成片${seqStr}`);
    const outName = `${sanitizeFilename(rawName)}.mp4`;

    return {
      jobItemId: uuidv4(),
      groupId: group.id,
      groupName: group.name,
      outputFilename: outName,
      status: 'queued',
      progress: 0,
    };
  });

  const batch: RenderBatchJob = {
    batchId,
    projectId: project.id,
    projectName: project.name,
    aspectRatio,
    quality,
    fps,
    createdAt: new Date().toISOString(),
    status: items.length === 0 ? 'completed' : 'running',
    items,
  };

  batches.set(batchId, batch);

  // Kick off async worker pool (concurrency = 2)
  if (items.length > 0) {
    void processBatchQueue(
      batch,
      project,
      targetGroups,
      batchDir,
      crf,
      opts.overlayPngMap || {},
      opts.subtitleStripsMap || {}
    );
  }

  return batch;
}

async function processBatchQueue(
  batch: RenderBatchJob,
  project: ProjectData,
  groups: VideoGroup[],
  batchDir: string,
  crf: number,
  overlayPngMap: Record<string, string>,
  subtitleStripsMap: Record<string, PreRenderedSubtitleStripInput[]>
) {
  const concurrency = 2;
  let cursor = 0;

  const assetMap = new Map<string, MediaAsset>(project.assets.map((a) => [a.id, a]));
  const groupMap = new Map<string, VideoGroup>(groups.map((g) => [g.id, g]));

  async function worker() {
    while (cursor < batch.items.length) {
      if (batch.status === 'cancelled') return;
      const myIdx = cursor++;
      const item = batch.items[myIdx];
      if (!item || item.status !== 'queued') continue;

      const group = groupMap.get(item.groupId);
      if (!group) {
        item.status = 'error';
        item.error = '找不到对应的视频组数据';
        continue;
      }

      try {
        await renderSingleGroup(
          batch,
          item,
          group,
          assetMap,
          batchDir,
          crf,
          project,
          overlayPngMap[group.id],
          subtitleStripsMap[group.id]
        );
      } catch (err: any) {
        if ((item.status as string) !== 'cancelled') {
          item.status = 'error';
          item.error = err?.message || 'FFmpeg 渲染异常';
        }
      }
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, batch.items.length) }, () => worker());
  await Promise.all(workers);

  if (batch.status !== 'cancelled') {
    const anyError = batch.items.some((i) => i.status === 'error');
    batch.status = anyError ? 'partial_error' : 'completed';
    saveProject(project);
  }
}

async function renderSingleGroup(
  batch: RenderBatchJob,
  item: RenderItemStatus,
  group: VideoGroup,
  assetMap: Map<string, MediaAsset>,
  batchDir: string,
  crf: number,
  project: ProjectData,
  preRenderedOverlayPng?: string,
  preRenderedSubtitleStrips?: PreRenderedSubtitleStripInput[]
): Promise<void> {
  item.status = 'rendering';
  item.progress = 2;
  item.startedAt = new Date().toISOString();

  const { width: W, height: H } = getTargetDimensions(batch.aspectRatio, batch.quality);
  const fps = batch.fps;

  // Validate clips with physical files
  const validClips = group.clips
    .map((clip) => {
      const asset = assetMap.get(clip.assetId);
      if (!asset || asset.type === 'audio') return null;
      const filePath = path.join(UPLOADS_DIR, asset.filename);
      if (!fs.existsSync(filePath)) return null;
      return { clip, asset, filePath };
    })
    .filter((x): x is NonNullable<typeof x> => Boolean(x));

  if (validClips.length === 0) {
    throw new Error('该视频组内没有有效的视频或图片素材');
  }

  const inputArgs: string[] = [];
  const filterParts: string[] = [];
  const effDurs: number[] = [];

  for (let i = 0; i < validClips.length; i++) {
    const { clip, asset, filePath } = validClips[i];
    const speed = Math.min(2.0, Math.max(0.5, clip.speed || 1.0));
    const t0 = Math.max(0, clip.trimStart || 0);
    const maxEnd = asset.type === 'video' ? asset.duration : Math.max(asset.duration, clip.trimEnd || 3.5);
    const t1 = Math.min(maxEnd, Math.max(t0 + 0.2, clip.trimEnd || asset.duration));
    const rawDur = Math.max(0.2, t1 - t0);
    const effDur = rawDur / speed;
    effDurs.push(effDur);

    if (asset.type === 'image') {
      inputArgs.push('-loop', '1', '-t', effDur.toFixed(3), '-framerate', String(fps), '-i', filePath);
    } else {
      inputArgs.push('-ss', t0.toFixed(3), '-t', rawDur.toFixed(3), '-i', filePath);
    }

    // Build video filter for clip i
    const ptsExpr =
      asset.type === 'video' && Math.abs(speed - 1.0) > 0.01
        ? `setpts=(PTS-STARTPTS)/${speed.toFixed(4)}`
        : `setpts=PTS-STARTPTS`;

    let cropPrefix = '';
    if (isCustomCropped(clip.crop)) {
      const cx = Math.min(0.9, Math.max(0, clip.crop.x));
      const cy = Math.min(0.9, Math.max(0, clip.crop.y));
      const cw = Math.min(1 - cx, Math.max(0.1, clip.crop.w));
      const ch = Math.min(1 - cy, Math.max(0.1, clip.crop.h));
      cropPrefix = `,crop=trunc(iw*${cw.toFixed(4)}/2)*2:trunc(ih*${ch.toFixed(4)}/2)*2:trunc(iw*${cx.toFixed(4)}):trunc(ih*${cy.toFixed(4)})`;
    }

    if (clip.fitMode === 'blur') {
      const bw = Math.max(64, Math.floor(W / 4 / 2) * 2);
      const bh = Math.max(64, Math.floor(H / 4 / 2) * 2);
      filterParts.push(
        `[${i}:v]${ptsExpr}${cropPrefix},split=2[vsrc_${i}_a][vsrc_${i}_b]`,
        `[vsrc_${i}_a]scale=${bw}:${bh}:force_original_aspect_ratio=increase,crop=${bw}:${bh},gblur=sigma=10,scale=${W}:${H},eq=brightness=-0.07[vbg_${i}]`,
        `[vsrc_${i}_b]scale=${W}:${H}:force_original_aspect_ratio=decrease[vfg_${i}]`,
        `[vbg_${i}][vfg_${i}]overlay=(W-w)/2:(H-h)/2,trim=duration=${effDur.toFixed(3)},setpts=PTS-STARTPTS,fps=${fps},format=yuv420p,setsar=1[v${i}]`
      );
    } else if (clip.fitMode === 'contain') {
      filterParts.push(
        `[${i}:v]${ptsExpr}${cropPrefix},scale=${W}:${H}:force_original_aspect_ratio=decrease,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2:black,trim=duration=${effDur.toFixed(3)},setpts=PTS-STARTPTS,fps=${fps},format=yuv420p,setsar=1[v${i}]`
      );
    } else {
      filterParts.push(
        `[${i}:v]${ptsExpr}${cropPrefix},scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},trim=duration=${effDur.toFixed(3)},setpts=PTS-STARTPTS,fps=${fps},format=yuv420p,setsar=1[v${i}]`
      );
    }

    // Build audio filter for clip i
    const gain = (clip.muted ? 0 : clip.volume ?? 1.0) * (group.clipMasterVolume ?? 1.0);
    if (asset.type === 'video' && asset.hasAudio && gain > 0.005) {
      const tempoFilter = Math.abs(speed - 1.0) > 0.01 ? `,atempo=${speed.toFixed(4)}` : '';
      filterParts.push(
        `[${i}:a]aresample=44100,aformat=sample_fmts=fltp:channel_layouts=stereo,asetpts=PTS-STARTPTS${tempoFilter},volume=${gain.toFixed(3)},apad=whole_dur=${effDur.toFixed(3)},atrim=0:${effDur.toFixed(3)},asetpts=PTS-STARTPTS[a${i}]`
      );
    } else {
      filterParts.push(
        `anullsrc=channel_layout=stereo:sample_rate=44100,atrim=0:${effDur.toFixed(3)},asetpts=PTS-STARTPTS[a${i}]`
      );
    }
  }

  // Sequence concatenation / transitions
  const N = validClips.length;
  let totalDur = effDurs[0];

  const hasAnyTransition = validClips.some(
    (entry, idx) => idx < N - 1 && entry.clip.transition && entry.clip.transition !== 'none'
  );

  if (N === 1) {
    filterParts.push(`[v0]null[vseq]`, `[a0]anull[aseq]`);
  } else if (!hasAnyTransition) {
    const pairs = validClips.map((_, idx) => `[v${idx}][a${idx}]`).join('');
    filterParts.push(`${pairs}concat=n=${N}:v=1:a=1[vseq][aseq]`);
    totalDur = effDurs.reduce((s, d) => s + d, 0);
  } else {
    let currV = '[v0]';
    let currA = '[a0]';
    let cumDur = effDurs[0];

    for (let i = 1; i < N; i++) {
      const tr = validClips[i - 1].clip.transition;
      const outV = i === N - 1 ? '[vseq]' : `[vx${i}]`;
      const outA = i === N - 1 ? '[aseq]' : `[ax${i}]`;

      if (!tr || tr === 'none' || cumDur < 0.45 || effDurs[i] < 0.45) {
        const tmpV = `[vcat_tmp_${i}]`;
        filterParts.push(
          `${currV}${currA}[v${i}][a${i}]concat=n=2:v=1:a=1${tmpV}${outA}`,
          `${tmpV}fps=${fps}${outV}`
        );
        cumDur += effDurs[i];
      } else {
        const trDur = Math.min(0.35, cumDur * 0.3, effDurs[i] * 0.3);
        const offset = Math.max(0.05, cumDur - trDur);
        const tmpV = `[vxf_tmp_${i}]`;
        filterParts.push(
          `${currV}[v${i}]xfade=transition=${tr}:duration=${trDur.toFixed(3)}:offset=${offset.toFixed(3)}${tmpV}`,
          `${tmpV}fps=${fps}${outV}`,
          `${currA}[a${i}]acrossfade=d=${trDur.toFixed(3)}:c1=tri:c2=tri${outA}`
        );
        cumDur = cumDur + effDurs[i] - trDur;
      }
      currV = outV;
      currA = outA;
    }
    totalDur = cumDur;
  }

  let nextInputIdx = N;
  const tempCleanupFiles: string[] = [];

  // A) Anti-Duplicate (批量防重去重) Video Layer Filters — applied BEFORE titles/subtitles/watermarks
  // so hflip/zoom/color jitter NEVER mirror or distort text & brand logos!
  let currVideoPad = '[vseq]';
  if (group.dedup?.enabled) {
    const dedupChain: string[] = [];
    if (group.dedup.mirrorFlip) {
      dedupChain.push('hflip');
    }
    const zp = Number(group.dedup.zoomPunchPct || 0);
    if (zp > 0.1) {
      const zW = Math.max(W + 2, Math.round((W * (1 + zp / 100)) / 2) * 2);
      const zH = Math.max(H + 2, Math.round((H * (1 + zp / 100)) / 2) * 2);
      dedupChain.push(`scale=${zW}:${zH},crop=${W}:${H}`);
    }
    const br = Number(group.dedup.brightness || 0);
    const ct = Number(group.dedup.contrast ?? 1);
    const sat = Number(group.dedup.saturation ?? 1);
    if (Math.abs(br) > 0.004 || Math.abs(ct - 1) > 0.004 || Math.abs(sat - 1) > 0.004) {
      dedupChain.push(
        `eq=brightness=${br.toFixed(3)}:contrast=${ct.toFixed(3)}:saturation=${sat.toFixed(3)}`
      );
    }
    if (group.dedup.sharpen) {
      dedupChain.push('unsharp=5:5:0.55:5:5:0.0');
    }
    if (dedupChain.length > 0) {
      filterParts.push(`${currVideoPad}${dedupChain.join(',')}[vdedup]`);
      currVideoPad = '[vdedup]';
    }
  }

  // B) Render Static Overlay PNG (Fancy Titles + Brand Corner Watermark)
  let overlayPngPath: string | null = null;
  const hasOverlayOrTextWm = Boolean(
    preRenderedOverlayPng ||
      group.overlay?.topTitle?.trim() ||
      group.overlay?.bottomTitle?.trim() ||
      (group.watermark?.enabled && group.watermark.mode === 'text' && group.watermark.text?.trim())
  );
  if (hasOverlayOrTextWm) {
    overlayPngPath = await renderOverlayPng(
      group.overlay,
      W,
      H,
      item.jobItemId,
      preRenderedOverlayPng,
      group.watermark
    );
  }

  if (overlayPngPath && fs.existsSync(overlayPngPath)) {
    tempCleanupFiles.push(overlayPngPath);
    inputArgs.push('-i', overlayPngPath);
    filterParts.push(`${currVideoPad}[${nextInputIdx}:v]overlay=0:0:format=auto[vov]`);
    currVideoPad = '[vov]';
    nextInputIdx++;
  }

  // Server-only fallback for Image Watermark when client Canvas PNG wasn't passed
  if (
    !preRenderedOverlayPng &&
    group.watermark?.enabled &&
    group.watermark.mode === 'image' &&
    group.watermark.imageAssetId
  ) {
    const wmAsset = assetMap.get(group.watermark.imageAssetId);
    const wmPath = wmAsset ? path.join(UPLOADS_DIR, wmAsset.filename) : null;
    if (wmPath && fs.existsSync(wmPath)) {
      const baseU = Math.min(W, H);
      const targetW = Math.max(24, Math.round(baseU * 0.16 * (group.watermark.scale || 1)));
      const op = Math.min(1, Math.max(0.1, group.watermark.opacity ?? 0.82));
      const mx = Math.round((W * (group.watermark.offsetX ?? 4.5)) / 100);
      const my = Math.round((H * (group.watermark.offsetY ?? 4.0)) / 100);
      const xExpr =
        group.watermark.corner === 'top_right' || group.watermark.corner === 'bottom_right'
          ? `W-w-${mx}`
          : `${mx}`;
      const yExpr =
        group.watermark.corner === 'bottom_left' || group.watermark.corner === 'bottom_right'
          ? `H-h-${my}`
          : `${my}`;

      inputArgs.push('-i', wmPath);
      filterParts.push(
        `[${nextInputIdx}:v]scale=${targetW}:-1,format=rgba,colorchannelmixer=aa=${op.toFixed(2)}[vwm]`,
        `${currVideoPad}[vwm]overlay=${xExpr}:${yExpr}:format=auto[vwmout]`
      );
      currVideoPad = '[vwmout]';
      nextInputIdx++;
    }
  }

  // C) Dynamic Synced Spoken Subtitles (Timed Strip PNG Overlays)
  const subStripFiles = await renderSubtitleStripFiles(
    group.subtitles,
    W,
    H,
    item.jobItemId,
    preRenderedSubtitleStrips
  );

  for (let sIdx = 0; sIdx < subStripFiles.length; sIdx++) {
    const sf = subStripFiles[sIdx];
    if (!fs.existsSync(sf.filePath)) continue;
    tempCleanupFiles.push(sf.filePath);
    if (sf.startSec >= totalDur - 0.03) continue;
    const t0 = Math.max(0, sf.startSec).toFixed(2);
    const t1 = Math.min(totalDur, sf.endSec).toFixed(2);
    inputArgs.push('-i', sf.filePath);
    const outPad = `[vsub_${sIdx}]`;
    filterParts.push(
      `${currVideoPad}[${nextInputIdx}:v]overlay=0:${Math.max(
        0,
        Math.round(sf.yPx)
      )}:format=auto:enable='between(t,${t0},${t1})'${outPad}`
    );
    currVideoPad = outPad;
    nextInputIdx++;
  }

  filterParts.push(`${currVideoPad}format=yuv420p[vfinal]`);

  // 1) Voiceover / AI TTS Track
  let voAsset: MediaAsset | null = null;
  let voPath: string | null = null;
  const voVol = group.voiceoverVolume ?? 1.15;
  if (group.voiceoverAssetId && voVol > 0.005) {
    const candAsset = assetMap.get(group.voiceoverAssetId) || null;
    if (candAsset) {
      const candPath = path.join(UPLOADS_DIR, candAsset.filename);
      if (fs.existsSync(candPath)) {
        voAsset = candAsset;
        voPath = candPath;
      }
    }
  }

  let hasVoStream = false;
  if (voAsset && voPath) {
    inputArgs.push('-i', voPath);
    const voT0 = Math.max(0, group.voiceoverTrimStart ?? voAsset.defaultTrimStart ?? 0);
    const rawVoEnd = group.voiceoverTrimEnd || voAsset.defaultTrimEnd || voAsset.duration;
    const voT1 = Math.max(voT0 + 0.15, Math.min(voAsset.duration, rawVoEnd));
    const voSpd = Math.min(2.0, Math.max(0.5, group.voiceoverSpeed ?? voAsset.defaultSpeed ?? 1.0));
    const voTempo = Math.abs(voSpd - 1.0) > 0.01 ? `,atempo=${voSpd.toFixed(4)}` : '';
    const delayMs = Math.round(Math.max(0, group.voiceoverDelaySec || 0) * 1000);
    const delayFilter = delayMs > 0 ? `,adelay=${delayMs}|${delayMs}` : '';

    filterParts.push(
      `[${nextInputIdx}:a]aresample=44100,aformat=sample_fmts=fltp:channel_layouts=stereo,atrim=${voT0.toFixed(3)}:${voT1.toFixed(3)},asetpts=PTS-STARTPTS${voTempo}${delayFilter},volume=${voVol.toFixed(3)},apad=whole_dur=${totalDur.toFixed(3)},atrim=0:${totalDur.toFixed(3)},asetpts=PTS-STARTPTS[avo]`
    );
    nextInputIdx++;
    hasVoStream = true;
  }

  // 2) BGM Music Track (with custom Trim Slice, Speed, Loop/Single, Fade-In/Out & Auto-Ducking!)
  let bgmAsset: MediaAsset | null = null;
  let bgmPath: string | null = null;
  if (group.bgmAssetId && group.bgmVolume > 0.005) {
    const candAsset = assetMap.get(group.bgmAssetId) || null;
    if (candAsset) {
      const candidate = path.join(UPLOADS_DIR, candAsset.filename);
      if (fs.existsSync(candidate)) {
        bgmAsset = candAsset;
        bgmPath = candidate;
      }
    }
  }

  let hasBgmStream = false;
  if (bgmAsset && bgmPath) {
    inputArgs.push('-i', bgmPath);
    const bgmT0 = Math.max(0, group.bgmTrimStart ?? bgmAsset.defaultTrimStart ?? 0);
    const rawBgmEnd = group.bgmTrimEnd || bgmAsset.defaultTrimEnd || bgmAsset.duration;
    const bgmT1 = Math.max(bgmT0 + 0.2, Math.min(bgmAsset.duration, rawBgmEnd));
    const bgmSpd = Math.min(2.0, Math.max(0.5, group.bgmSpeed ?? bgmAsset.defaultSpeed ?? 1.0));
    const bgmTempo = Math.abs(bgmSpd - 1.0) > 0.01 ? `,atempo=${bgmSpd.toFixed(4)}` : '';
    const shouldLoop = group.bgmLoop !== false;
    const loopOrPad = shouldLoop
      ? `,aloop=loop=-1:size=2000000000`
      : `,apad=whole_dur=${totalDur.toFixed(3)}`;

    const fadeInDur = Math.min(totalDur * 0.4, Math.max(0, group.bgmFadeInSec ?? bgmAsset.fadeInSec ?? 0));
    const fadeOutDur = Math.min(
      totalDur * 0.45,
      Math.max(0, group.bgmFadeOutSec ?? (group.audioFadeOut && totalDur > 1.5 ? 1.2 : 0))
    );
    const fadeInExpr = fadeInDur > 0.03 ? `,afade=t=in:st=0:d=${fadeInDur.toFixed(2)}` : '';
    const fadeOutExpr =
      fadeOutDur > 0.03
        ? `,afade=t=out:st=${Math.max(0, totalDur - fadeOutDur).toFixed(3)}:d=${fadeOutDur.toFixed(2)}`
        : '';

    filterParts.push(
      `[${nextInputIdx}:a]aresample=44100,aformat=sample_fmts=fltp:channel_layouts=stereo,atrim=${bgmT0.toFixed(3)}:${bgmT1.toFixed(3)},asetpts=PTS-STARTPTS${bgmTempo}${loopOrPad},atrim=0:${totalDur.toFixed(3)},asetpts=PTS-STARTPTS,volume=${group.bgmVolume.toFixed(3)}${fadeInExpr}${fadeOutExpr}[abgm_raw]`
    );
    nextInputIdx++;
    hasBgmStream = true;
  }

  // 3) Final Multi-Track Mix + Sidechain Voiceover Ducking
  if (hasVoStream && hasBgmStream) {
    if (group.bgmDucking !== false) {
      filterParts.push(
        `[avo]asplit=2[avo_mix][avo_sc]`,
        `[abgm_raw][avo_sc]sidechaincompress=threshold=0.025:ratio=5:attack=30:release=350[abgm]`,
        `[aseq][avo_mix][abgm]amix=inputs=3:duration=first:dropout_transition=0:normalize=0[afinal]`
      );
    } else {
      filterParts.push(
        `[aseq][avo][abgm_raw]amix=inputs=3:duration=first:dropout_transition=0:normalize=0[afinal]`
      );
    }
  } else if (hasVoStream) {
    filterParts.push(
      `[aseq][avo]amix=inputs=2:duration=first:dropout_transition=0:normalize=0[afinal]`
    );
  } else if (hasBgmStream) {
    filterParts.push(
      `[aseq][abgm_raw]amix=inputs=2:duration=first:dropout_transition=0:normalize=0[afinal]`
    );
  } else {
    const fadeOut =
      group.audioFadeOut && totalDur > 1.5
        ? `afade=t=out:st=${Math.max(0, totalDur - 1.0).toFixed(3)}:d=1.0`
        : 'anull';
    filterParts.push(`[aseq]${fadeOut}[afinal]`);
  }

  const outFilePath = path.join(batchDir, item.outputFilename);
  const filterComplex = filterParts.join(';');

  const ffmpegArgs = [
    '-y',
    ...inputArgs,
    '-filter_complex',
    filterComplex,
    '-map',
    '[vfinal]',
    '-map',
    '[afinal]',
    '-c:v',
    'libx264',
    '-preset',
    'veryfast',
    '-crf',
    String(crf),
    '-pix_fmt',
    'yuv420p',
    '-movflags',
    '+faststart',
    '-c:a',
    'aac',
    '-b:a',
    '192k',
    '-t',
    totalDur.toFixed(3),
    '-progress',
    'pipe:1',
    '-nostats',
    outFilePath,
  ];

  const currentBins = refreshMediaBinaries();
  if (!currentBins.ffmpegFound) {
    throw new Error(
      '未检测到 FFmpeg 渲染引擎。请确认网络畅通后重启启动脚本自动下载，或将 ffmpeg.exe 放入软件目录的 bin 文件夹中。'
    );
  }

  await new Promise<void>((resolve, reject) => {
    const proc = spawn(currentBins.ffmpegPath || FFMPEG_BIN, ffmpegArgs, {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    activeProcs.set(item.jobItemId, proc);

    let stderrTail = '';

    proc.stdout.on('data', (chunk: Buffer) => {
      const text = chunk.toString('utf8');
      const lines = text.split('\n');
      for (const line of lines) {
        if (line.startsWith('out_time_us=') || line.startsWith('out_time_ms=')) {
          const val = parseInt(line.split('=')[1], 10);
          if (Number.isFinite(val) && val > 0 && totalDur > 0) {
            const pct = Math.min(98, Math.max(3, Math.round((val / (totalDur * 1_000_000)) * 100)));
            item.progress = pct;
          }
        }
      }
    });

    proc.stderr.on('data', (chunk: Buffer) => {
      stderrTail = (stderrTail + chunk.toString('utf8')).slice(-1800);
    });

    const cleanupTemps = () => {
      for (const fp of tempCleanupFiles) {
        try {
          if (fs.existsSync(fp)) fs.unlinkSync(fp);
        } catch {
          // ignore
        }
      }
    };

    proc.on('error', (err) => {
      activeProcs.delete(item.jobItemId);
      cleanupTemps();
      reject(err);
    });

    proc.on('close', (code) => {
      activeProcs.delete(item.jobItemId);
      cleanupTemps();

      if (item.status === 'cancelled') {
        resolve();
        return;
      }

      if (code === 0 && fs.existsSync(outFilePath)) {
        const stat = fs.statSync(outFilePath);
        item.status = 'done';
        item.progress = 100;
        item.outputUrl = `/storage/exports/${batch.batchId}/${encodeURIComponent(item.outputFilename)}`;
        item.fileSizeBytes = stat.size;
        item.durationSec = Math.round(totalDur * 10) / 10;
        item.completedAt = new Date().toISOString();

        // Update group's latest export info in project
        const projGroup = project.videoGroups.find((g) => g.id === group.id);
        if (projGroup) {
          projGroup.lastExportUrl = item.outputUrl;
          projGroup.lastExportFilename = item.outputFilename;
          projGroup.lastExportSizeBytes = stat.size;
        }
        resolve();
      } else {
        reject(new Error(`FFmpeg 退出码 ${code}: ${stderrTail}`));
      }
    });
  });
}

export function streamBatchZip(batchId: string, res: Response) {
  const batch = batches.get(batchId);
  if (!batch) {
    res.status(404).json({ error: '找不到该批量导出任务' });
    return;
  }

  const doneItems = batch.items.filter((i) => i.status === 'done');
  if (doneItems.length === 0) {
    res.status(400).json({ error: '当前暂无已完成的视频可打包下载' });
    return;
  }

  const zipFilename = encodeURIComponent(`${batch.projectName || '批量成片'}_${doneItems.length}条.zip`);
  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${zipFilename}`);

  const archive = archiver('zip', { store: true }); // MP4 is already compressed; store=true zips instantaneously!
  archive.on('error', (err) => {
    console.error('Zip archive error:', err);
    if (!res.headersSent) res.status(500).end();
  });

  archive.pipe(res);

  const batchDir = path.join(EXPORTS_DIR, batchId);
  for (const item of doneItems) {
    const fp = path.join(batchDir, item.outputFilename);
    if (fs.existsSync(fp)) {
      archive.file(fp, { name: item.outputFilename });
    }
  }

  void archive.finalize();
}
