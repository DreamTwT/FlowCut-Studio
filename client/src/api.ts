import {
  AiEngineSettings,
  AiScriptGenerateRequest,
  AspectRatio,
  BeatAnalysisResult,
  BeatDensityMode,
  BreathRemovalOptions,
  buildSyncedSubtitlesFromScript,
  CoverExportMode,
  createDefaultAiSettings,
  DetectedSceneSegment,
  ExportQuality,
  FULL_CROP,
  GeneratedAdScriptItem,
  getTargetDimensions,
  HardwareAccelerationReport,
  MatrixConfig,
  MediaAsset,
  ProjectData,
  RenderBatchJob,
  SceneDetectRequest,
  SceneSplitCommitRequest,
  SceneTag,
  SpeechSegmentPayload,
  SubtitleCue,
  TTS_VOICES,
  VideoEncoderId,
} from '@shared/schema';
import {
  RenderedSubtitleStrip,
  renderGroupStaticLayerPngDataUrl,
  renderSubtitleCuesToStrips,
} from './utils/overlayCanvas';
import {
  createSimulatedSpeechWavInBrowser,
  processAudioInBrowser,
} from './utils/audioWaveform';
import { uid } from './utils/format';
import {
  buildLocalDemoProject,
  cancelLocalBatch,
  createLocalBlankProject,
  deleteLocalProjectById,
  generateMatrixGroupsLocal,
  getLocalBatchStatus,
  getLocalBootstrap,
  listLocalProjectSummaries,
  loadLocalProjectById,
  probeBrowserFile,
  saveLocalProject,
  startLocalBatchRender,
} from './localEngine';

export interface ProjectSummary {
  id: string;
  name: string;
  updatedAt: string;
  groupCount: number;
  assetCount: number;
}

export let isStandaloneBrowserMode = false;

export async function fetchBootstrap(): Promise<{
  project: ProjectData;
  projects: ProjectSummary[];
  recentBatches: RenderBatchJob[];
}> {
  if (
    typeof window !== 'undefined' &&
    (window.location.protocol === 'file:' ||
      window.location.protocol === 'blob:' ||
      window.location.protocol === 'about:' ||
      window.origin === 'null')
  ) {
    isStandaloneBrowserMode = true;
    return getLocalBootstrap();
  }
  try {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 1800);
    const res = await fetch('/api/bootstrap', { signal: controller.signal });
    window.clearTimeout(timer);
    if (!res.ok) throw new Error('Backend unavailable');
    isStandaloneBrowserMode = false;
    return await res.json();
  } catch {
    isStandaloneBrowserMode = true;
    return getLocalBootstrap();
  }
}

export async function createNewProject(name: string): Promise<{
  project: ProjectData;
  projects: ProjectSummary[];
}> {
  if (isStandaloneBrowserMode) {
    const proj = createLocalBlankProject(name);
    return { project: proj, projects: listLocalProjectSummaries() };
  }
  const res = await fetch('/api/projects/new', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  });
  if (!res.ok) throw new Error('新建项目失败');
  return res.json();
}

export async function createDemoProject(): Promise<{
  project: ProjectData;
  projects: ProjectSummary[];
}> {
  if (isStandaloneBrowserMode) {
    const demo = saveLocalProject(buildLocalDemoProject());
    return { project: demo, projects: listLocalProjectSummaries() };
  }
  const res = await fetch('/api/projects/demo', { method: 'POST' });
  if (!res.ok) throw new Error('加载演示工程失败');
  return res.json();
}

export async function loadProjectById(id: string): Promise<{
  project: ProjectData;
  projects: ProjectSummary[];
}> {
  if (isStandaloneBrowserMode) {
    return {
      project: loadLocalProjectById(id),
      projects: listLocalProjectSummaries(),
    };
  }
  const res = await fetch(`/api/projects/${id}`);
  if (!res.ok) throw new Error('切换项目失败');
  return res.json();
}

export async function deleteProjectApi(
  targetId: string,
  currentActiveId?: string
): Promise<{
  project: ProjectData;
  projects: ProjectSummary[];
  switchedActive: boolean;
  deletedName: string;
}> {
  if (isStandaloneBrowserMode) {
    return deleteLocalProjectById(targetId, currentActiveId);
  }
  const qs = currentActiveId
    ? `?activeId=${encodeURIComponent(currentActiveId)}`
    : '';
  const res = await fetch(`/api/projects/${encodeURIComponent(targetId)}${qs}`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error('删除工程失败');
  return res.json();
}

export async function importProjectJson(project: ProjectData): Promise<{
  project: ProjectData;
  projects: ProjectSummary[];
}> {
  if (isStandaloneBrowserMode) {
    const saved = saveLocalProject({ ...project, name: `${project.name} (导入)` });
    return { project: saved, projects: listLocalProjectSummaries() };
  }
  const res = await fetch('/api/projects/import', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ project }),
  });
  if (!res.ok) throw new Error('导入工程失败');
  return res.json();
}

export async function saveProjectApi(project: ProjectData): Promise<ProjectData> {
  if (isStandaloneBrowserMode) {
    return saveLocalProject(project);
  }
  const res = await fetch(`/api/projects/${project.id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(project),
  });
  if (!res.ok) throw new Error('保存失败');
  const data = await res.json();
  return data.project;
}

export async function uploadAssetsWithProgress(
  projectId: string,
  files: File[],
  sceneTag: SceneTag,
  onProgress: (pct: number) => void
): Promise<{ assets: MediaAsset[]; project: ProjectData }> {
  if (isStandaloneBrowserMode) {
    const proj = loadLocalProjectById(projectId);
    const created: MediaAsset[] = [];
    for (let i = 0; i < files.length; i++) {
      onProgress(Math.round(((i + 0.3) / files.length) * 90));
      const asset = await probeBrowserFile(files[i], sceneTag);
      proj.assets.unshift(asset);
      created.push(asset);
    }
    onProgress(100);
    saveLocalProject(proj);
    return { assets: created, project: proj };
  }

  return new Promise((resolve, reject) => {
    const fd = new FormData();
    for (const f of files) {
      fd.append('files', f);
    }
    fd.append('sceneTag', sceneTag);

    const xhr = new XMLHttpRequest();
    xhr.open('POST', `/api/projects/${projectId}/assets/upload`);

    xhr.upload.onprogress = (ev) => {
      if (ev.lengthComputable) {
        onProgress(Math.min(95, Math.round((ev.loaded / ev.total) * 95)));
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          onProgress(100);
          resolve(JSON.parse(xhr.responseText));
        } catch (err) {
          reject(err);
        }
      } else {
        try {
          const parsed = JSON.parse(xhr.responseText);
          reject(new Error(parsed.error || '上传失败'));
        } catch {
          reject(new Error(`上传错误 (${xhr.status})`));
        }
      }
    };

    xhr.onerror = () => reject(new Error('网络异常，上传中断'));
    xhr.send(fd);
  });
}

export async function deleteAssetApi(projectId: string, assetId: string): Promise<ProjectData> {
  if (isStandaloneBrowserMode) {
    const proj = loadLocalProjectById(projectId);
    proj.assets = proj.assets.filter((a) => a.id !== assetId);
    for (const g of proj.videoGroups) {
      g.clips = g.clips.filter((c) => c.assetId !== assetId);
      if (g.bgmAssetId === assetId) g.bgmAssetId = null;
      if (g.pip?.assetId === assetId) g.pip.assetId = null;
    }
    for (const s of proj.matrix.slots) {
      s.assetIds = s.assetIds.filter((id) => id !== assetId);
    }
    return saveLocalProject(proj);
  }
  const res = await fetch(`/api/projects/${projectId}/assets/${assetId}`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error('删除素材失败');
  const data = await res.json();
  return data.project;
}

export async function generateMatrixGroupsApi(
  project: ProjectData,
  matrix?: MatrixConfig
): Promise<{ project: ProjectData; generatedCount: number; totalPossible: number }> {
  if (isStandaloneBrowserMode) {
    return generateMatrixGroupsLocal(project, matrix);
  }
  const res = await fetch(`/api/projects/${project.id}/matrix/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ project, matrix }),
  });
  if (!res.ok) throw new Error('生成矩阵视频组失败');
  return res.json();
}

export async function fetchHardwareReportApi(
  forceRefresh = false
): Promise<HardwareAccelerationReport> {
  if (isStandaloneBrowserMode) {
    return {
      probedAt: new Date().toISOString(),
      gpuNames: ['浏览器 WebCanvas 媒体引擎'],
      hasHardwareGpu: false,
      recommendedEncoder: 'libx264',
      recommendedConcurrency: 2,
      encoders: [
        {
          id: 'libx264',
          name: '浏览器离线录制引擎',
          shortLabel: 'Web 引擎',
          vendor: 'cpu',
          available: true,
        },
      ],
    };
  }
  const qs = forceRefresh ? '?refresh=1' : '';
  const res = await fetch(`/api/hardware${qs}`);
  if (!res.ok) throw new Error('探测硬件编码器失败');
  const data = await res.json();
  return data.hardware;
}

export async function startBatchRenderApi(
  project: ProjectData,
  options: {
    groupIds?: string[];
    aspectRatio?: AspectRatio;
    quality?: ExportQuality;
    fps?: 30 | 60;
    crf?: 20 | 23;
    videoEncoder?: VideoEncoderId;
    concurrency?: 1 | 2 | 3 | 4;
    exportCoverMode?: CoverExportMode;
    filenamePattern?: string;
  }
): Promise<RenderBatchJob> {
  if (isStandaloneBrowserMode) {
    const targetGroups = project.videoGroups.filter((g) =>
      options.groupIds?.length ? options.groupIds.includes(g.id) : g.selectedForExport
    );
    if ((options.exportCoverMode || project.exportCoverMode || 'none') !== 'none' ||
        targetGroups.some((g) => g.pip?.enabled || g.sfx?.enabled || g.clips.some((c) => c.motion && c.motion !== 'none'))) {
      throw new Error('浏览器独立预览模式暂不支持画中画、运镜、音效或封面导出；请启动桌面版或本地服务后导出。');
    }
    return startLocalBatchRender(project, options);
  }

  // Pre-rasterize Fancy Title + Brand Watermark + Timed Subtitle Strips via native browser Canvas
  // so Windows/Mac servers never need native C++ sharp/libass and get 100% crisp OS CJK + Emoji!
  const ar = options.aspectRatio || project.aspectRatio || '9:16';
  const qual = options.quality || project.exportQuality || '1080p';
  const { width: outW, height: outH } = getTargetDimensions(ar, qual);
  const assetMap = new Map<string, MediaAsset>(project.assets.map((a) => [a.id, a]));
  const overlayPngMap: Record<string, string> = {};
  const subtitleStripsMap: Record<string, RenderedSubtitleStrip[]> = {};

  for (const g of project.videoGroups) {
    if (options.groupIds && options.groupIds.length > 0 && !options.groupIds.includes(g.id)) {
      continue;
    }
    if (!options.groupIds && !g.selectedForExport) continue;
    try {
      const pngDataUrl = await renderGroupStaticLayerPngDataUrl(g, assetMap, outW, outH);
      if (pngDataUrl) overlayPngMap[g.id] = pngDataUrl;
    } catch {
      // fallback to server renderer if any
    }
    try {
      const strips = renderSubtitleCuesToStrips(g.subtitles, outW, outH);
      if (strips.length > 0) subtitleStripsMap[g.id] = strips;
    } catch {
      // fallback to server renderer if any
    }
  }

  const res = await fetch(`/api/projects/${project.id}/render`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      project,
      options: {
        ...options,
        overlayPngMap,
        subtitleStripsMap,
      },
    }),
  });
  if (!res.ok) throw new Error('启动批量渲染失败');
  const data = await res.json();
  return data.batch;
}

export async function pollBatchStatusApi(batchId: string): Promise<RenderBatchJob> {
  if (isStandaloneBrowserMode) {
    const b = getLocalBatchStatus(batchId);
    if (!b) throw new Error('找不到批次');
    return structuredClone(b);
  }
  const res = await fetch(`/api/renders/${batchId}`);
  if (!res.ok) throw new Error('查询渲染状态失败');
  const data = await res.json();
  return data.batch;
}

export async function cancelBatchApi(batchId: string): Promise<RenderBatchJob> {
  if (isStandaloneBrowserMode) {
    const b = cancelLocalBatch(batchId);
    if (!b) throw new Error('找不到批次');
    return structuredClone(b);
  }
  const res = await fetch(`/api/renders/${batchId}/cancel`, { method: 'POST' });
  if (!res.ok) throw new Error('取消任务失败');
  const data = await res.json();
  return data.batch;
}

export interface BreathStatsDto {
  originalDuration: number;
  newDuration: number;
  savedSec: number;
  cutCount: number;
}

export async function synthesizeTtsApi(
  project: ProjectData,
  payload: {
    scripts: string[];
    scriptOverlays?: Array<{ topTitle?: string; bottomTitle?: string }>;
    voiceId: string;
    ratePct: number;
    pitchHz: number;
    titleName?: string;
    removeBreath: boolean;
    breathOptions?: Partial<BreathRemovalOptions>;
    assignMode: 'library_only' | 'active_group' | 'dispatch_groups' | 'matrix_pool';
    targetGroupId?: string;
    autoSubtitles?: boolean;
  }
): Promise<{
  assets: MediaAsset[];
  breathStats: Array<BreathStatsDto | undefined>;
  project: ProjectData;
}> {
  if (isStandaloneBrowserMode) {
    const clone = structuredClone(project);
    const created: MediaAsset[] = [];
    const statsList: Array<BreathStatsDto | undefined> = [];
    const voiceMeta = TTS_VOICES.find((v) => v.id === payload.voiceId) || TTS_VOICES[0];
    const voiceShort = voiceMeta.name.split('·')[0].trim();

    for (const script of payload.scripts) {
      const sim = createSimulatedSpeechWavInBrowser(script, payload.ratePct);
      let finalUrl = sim.blobUrl;
      let finalDur = sim.duration;
      let finalSize = sim.sizeBytes;
      let bStats: BreathStatsDto | undefined;

      if (payload.removeBreath) {
        const cleaned = await processAudioInBrowser(sim.blobUrl, {
          removeBreath: true,
          breathOptions: payload.breathOptions,
        });
        finalUrl = cleaned.blobUrl;
        finalDur = cleaned.newDuration;
        finalSize = cleaned.sizeBytes;
        bStats = {
          originalDuration: cleaned.originalDuration,
          newDuration: cleaned.newDuration,
          savedSec: cleaned.savedSec,
          cutCount: cleaned.cutCount,
        };
      }

      const snippet = script.replace(/\s+/g, '').slice(0, 12);
      const asset: MediaAsset = {
        id: uid(),
        name:
          (payload.scripts.length === 1 ? payload.titleName?.trim() : undefined) ||
          `AI配音_${voiceShort}_${snippet}${payload.removeBreath ? '(已去气口)' : ''}`,
        type: 'audio',
        audioRole: 'voiceover',
        ttsSourceText: script,
        ttsVoiceId: payload.voiceId,
        breathRemoved: payload.removeBreath,
        breathSavedSec: bStats?.savedSec,
        breathCutCount: bStats?.cutCount,
        filename: `tts_${Date.now()}.wav`,
        url: finalUrl,
        duration: finalDur,
        width: 0,
        height: 0,
        fps: 0,
        hasAudio: true,
        sizeBytes: finalSize,
        sceneTag: '未分类',
        defaultTrimStart: 0,
        defaultTrimEnd: finalDur,
        defaultCrop: { ...FULL_CROP },
        defaultFitMode: 'cover',
        createdAt: new Date().toISOString(),
      };
      clone.assets.unshift(asset);
      created.push(asset);
      statsList.push(bStats);
    }

    if (payload.assignMode === 'active_group' && created[0]) {
      const grp =
        clone.videoGroups.find((g) => g.id === payload.targetGroupId) || clone.videoGroups[0];
      if (grp) {
        grp.voiceoverAssetId = created[0].id;
        grp.voiceoverVolume = grp.voiceoverVolume ?? 1.15;
        grp.bgmDucking = true;
        if (payload.scriptOverlays?.[0]) {
          if (payload.scriptOverlays[0].topTitle) {
            grp.overlay.topTitle = payload.scriptOverlays[0].topTitle;
          }
          if (payload.scriptOverlays[0].bottomTitle) {
            grp.overlay.bottomTitle = payload.scriptOverlays[0].bottomTitle;
          }
        }
        if (payload.autoSubtitles !== false && created[0].ttsSourceText) {
          grp.subtitles = {
            enabled: true,
            styleId: grp.subtitles?.styleId || 'douyin_yellow',
            yPercent: grp.subtitles?.yPercent || 74,
            fontScale: grp.subtitles?.fontScale || 1.0,
            cues: buildSyncedSubtitlesFromScript(
              created[0].ttsSourceText,
              created[0].duration,
              grp.voiceoverDelaySec || 0
            ),
          };
        }
      }
    } else if (payload.assignMode === 'dispatch_groups' && created.length > 0) {
      clone.videoGroups.forEach((g, idx) => {
        const pIdx = idx % created.length;
        const picked = created[pIdx];
        g.voiceoverAssetId = picked.id;
        g.voiceoverVolume = g.voiceoverVolume ?? 1.15;
        g.bgmDucking = true;
        if (payload.scriptOverlays?.[pIdx]) {
          if (payload.scriptOverlays[pIdx].topTitle) {
            g.overlay.topTitle = payload.scriptOverlays[pIdx].topTitle!;
          }
          if (payload.scriptOverlays[pIdx].bottomTitle) {
            g.overlay.bottomTitle = payload.scriptOverlays[pIdx].bottomTitle!;
          }
        }
        if (payload.autoSubtitles !== false && picked.ttsSourceText) {
          g.subtitles = {
            enabled: true,
            styleId: g.subtitles?.styleId || 'douyin_yellow',
            yPercent: g.subtitles?.yPercent || 74,
            fontScale: g.subtitles?.fontScale || 1.0,
            cues: buildSyncedSubtitlesFromScript(
              picked.ttsSourceText,
              picked.duration,
              g.voiceoverDelaySec || 0
            ),
          };
        }
      });
    } else if (payload.assignMode === 'matrix_pool' && created.length > 0) {
      clone.matrix.voiceoverPoolAssetIds = Array.from(
        new Set([...(clone.matrix.voiceoverPoolAssetIds || []), ...created.map((a) => a.id)])
      );
      if (payload.scriptOverlays?.length) {
        const tops = payload.scriptOverlays.map((o) => o.topTitle?.trim()).filter(Boolean) as string[];
        const bots = payload.scriptOverlays
          .map((o) => o.bottomTitle?.trim())
          .filter(Boolean) as string[];
        if (tops.length) {
          clone.matrix.topTitlePool = Array.from(new Set([...tops, ...clone.matrix.topTitlePool]));
        }
        if (bots.length) {
          clone.matrix.bottomTitlePool = Array.from(
            new Set([...bots, ...clone.matrix.bottomTitlePool])
          );
        }
      }
    }

    saveLocalProject(clone);
    return { assets: created, breathStats: statsList, project: clone };
  }

  const res = await fetch(`/api/projects/${project.id}/tts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      project,
      ...payload,
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error || '文字生成音频失败');
  return data;
}

export async function removeAudioBreathApi(
  project: ProjectData,
  assetId: string,
  options: {
    replaceInPlace?: boolean;
    breathOptions?: Partial<BreathRemovalOptions>;
  }
): Promise<{
  asset: MediaAsset;
  breathStats: BreathStatsDto;
  project: ProjectData;
}> {
  if (isStandaloneBrowserMode) {
    const clone = structuredClone(project);
    const src = clone.assets.find((a) => a.id === assetId);
    if (!src) throw new Error('找不到目标音频');
    const cleaned = await processAudioInBrowser(src.url, {
      removeBreath: true,
      breathOptions: options.breathOptions,
    });
    const stats: BreathStatsDto = {
      originalDuration: cleaned.originalDuration,
      newDuration: cleaned.newDuration,
      savedSec: cleaned.savedSec,
      cutCount: cleaned.cutCount,
    };

    if (options.replaceInPlace !== false) {
      src.url = cleaned.blobUrl;
      src.duration = cleaned.newDuration;
      src.sizeBytes = cleaned.sizeBytes;
      src.defaultTrimStart = 0;
      src.defaultTrimEnd = cleaned.newDuration;
      if (!src.name.includes('去气口')) src.name = `${src.name}(已去气口)`;
      src.breathRemoved = true;
      src.breathSavedSec = stats.savedSec;
      src.breathCutCount = stats.cutCount;
      saveLocalProject(clone);
      return { asset: src, breathStats: stats, project: clone };
    } else {
      const copy: MediaAsset = {
        ...structuredClone(src),
        id: uid(),
        name: `${src.name}(已去气口)`,
        url: cleaned.blobUrl,
        duration: cleaned.newDuration,
        sizeBytes: cleaned.sizeBytes,
        defaultTrimStart: 0,
        defaultTrimEnd: cleaned.newDuration,
        breathRemoved: true,
        breathSavedSec: stats.savedSec,
        breathCutCount: stats.cutCount,
      };
      clone.assets.unshift(copy);
      saveLocalProject(clone);
      return { asset: copy, breathStats: stats, project: clone };
    }
  }

  const res = await fetch(`/api/projects/${project.id}/assets/${assetId}/remove-breath`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      project,
      ...options,
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error || '音频去气口失败');
  return data;
}

export async function renderEditedAudioApi(
  project: ProjectData,
  assetId: string,
  params: {
    trimStart: number;
    trimEnd: number;
    speed: number;
    fadeInSec: number;
    fadeOutSec: number;
    removeBreath: boolean;
    breathOptions?: Partial<BreathRemovalOptions>;
    newName?: string;
  }
): Promise<{
  asset: MediaAsset;
  breathStats?: BreathStatsDto;
  project: ProjectData;
}> {
  if (isStandaloneBrowserMode) {
    const clone = structuredClone(project);
    const src = clone.assets.find((a) => a.id === assetId);
    if (!src) throw new Error('找不到目标音频');
    const proc = await processAudioInBrowser(src.url, {
      trimStart: params.trimStart,
      trimEnd: params.trimEnd,
      fadeInSec: params.fadeInSec,
      fadeOutSec: params.fadeOutSec,
      removeBreath: params.removeBreath,
      breathOptions: params.breathOptions,
    });
    const newAsset: MediaAsset = {
      ...structuredClone(src),
      id: uid(),
      name: params.newName?.trim() || `${src.name}${params.removeBreath ? '(去气口精剪)' : '(精剪版)'}`,
      url: proc.blobUrl,
      duration: proc.newDuration,
      sizeBytes: proc.sizeBytes,
      defaultTrimStart: 0,
      defaultTrimEnd: proc.newDuration,
      defaultSpeed: params.speed,
      breathRemoved: params.removeBreath || src.breathRemoved,
      breathSavedSec: params.removeBreath ? proc.savedSec : src.breathSavedSec,
      breathCutCount: params.removeBreath ? proc.cutCount : src.breathCutCount,
    };
    clone.assets.unshift(newAsset);
    saveLocalProject(clone);
    return {
      asset: newAsset,
      breathStats: params.removeBreath
        ? {
            originalDuration: proc.originalDuration,
            newDuration: proc.newDuration,
            savedSec: proc.savedSec,
            cutCount: proc.cutCount,
          }
        : undefined,
      project: clone,
    };
  }

  const res = await fetch(`/api/projects/${project.id}/assets/${assetId}/audio-edit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      project,
      ...params,
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error || '音频剪辑导出失败');
  return data;
}

// ============================================================================
// v2.2 — AI Engine Settings, Ad Script Fission & Dual-Mode ASR APIs
// ============================================================================

const LOCAL_AI_SETTINGS_KEY = 'flowcut_ai_settings_v22';

export async function fetchAiSettingsApi(): Promise<AiEngineSettings> {
  if (isStandaloneBrowserMode) {
    try {
      const raw = localStorage.getItem(LOCAL_AI_SETTINGS_KEY);
      if (raw) return { ...createDefaultAiSettings(), ...JSON.parse(raw) };
    } catch {
      // ignore
    }
    return createDefaultAiSettings();
  }
  const res = await fetch('/api/ai/settings');
  if (!res.ok) return createDefaultAiSettings();
  const data = await res.json();
  return data.settings;
}

export async function saveAiSettingsApi(
  settings: Partial<AiEngineSettings>
): Promise<AiEngineSettings> {
  if (isStandaloneBrowserMode) {
    const merged = { ...(await fetchAiSettingsApi()), ...settings };
    try {
      localStorage.setItem(LOCAL_AI_SETTINGS_KEY, JSON.stringify(merged));
    } catch {
      // ignore
    }
    return merged;
  }
  const res = await fetch('/api/ai/settings', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ settings }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error || '保存 AI 配置失败');
  return data.settings;
}

export async function testAiConnectionApi(
  settings: Partial<AiEngineSettings>
): Promise<{ ok: boolean; latencyMs: number; message: string }> {
  if (isStandaloneBrowserMode) {
    return {
      ok: false,
      latencyMs: 0,
      message: '纯单文件预览模式请启动完整客户端以连接大模型',
    };
  }
  const res = await fetch('/api/ai/test', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ settings }),
  });
  return res.json();
}

export async function testCloudAsrApi(
  settings: Partial<AiEngineSettings>
): Promise<{ ok: boolean; latencyMs: number; message: string }> {
  if (isStandaloneBrowserMode) {
    return {
      ok: false,
      latencyMs: 0,
      message: '纯单文件预览模式请启动完整客户端以测试云端语音识别',
    };
  }
  const res = await fetch('/api/ai/test-asr', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ settings }),
  });
  return res.json();
}

export async function generateAiScriptsApi(req: AiScriptGenerateRequest): Promise<{
  scripts: GeneratedAdScriptItem[];
  engineUsed: 'cloud_llm' | 'offline_formula';
  modelName: string;
  fallbackNote?: string;
}> {
  if (isStandaloneBrowserMode) {
    const prod = req.productName || '宝藏好物';
    const pts = req.sellingPoints || '硬核升级体验';
    const cta = req.ctaOffer || '点击下方链接抢限时福利';
    return {
      scripts: Array.from({ length: req.count || 4 }).map((_, i) => ({
        id: uid(),
        angleBadge: `离线方案#${i + 1}`,
        topTitle: `${prod.slice(0, 8)}实测太香了`,
        bottomTitle: `👇 ${cta.slice(0, 12)}`,
        spokenScript: `还在挑好用的${prod}？实测${pts}，省心耐用不踩雷，赶紧${cta}！`,
        estDurationSec: 9.5,
      })),
      engineUsed: 'offline_formula',
      modelName: '浏览器离线公式',
    };
  }
  const res = await fetch('/api/ai/scripts/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error || 'AI 裂变脚本生成失败');
  return data;
}

export async function runCloudAsrForGroupApi(
  project: ProjectData,
  groupId: string,
  sourceTrack: 'auto' | 'voiceover' | 'video_clips' = 'auto'
): Promise<{
  cues: SubtitleCue[];
  segmentCount: number;
  sourceLabel: string;
  modelUsed: string;
  project: ProjectData;
}> {
  const res = await fetch(`/api/projects/${project.id}/groups/${groupId}/asr/cloud`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ project, sourceTrack }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error || '云端语音识别失败');
  return data;
}

export async function prepareLocalAsrSegmentsApi(
  project: ProjectData,
  groupId: string,
  sourceTrack: 'auto' | 'voiceover' | 'video_clips' = 'auto'
): Promise<{
  segments: SpeechSegmentPayload[];
  sourceLabel: string;
}> {
  const res = await fetch(`/api/projects/${project.id}/groups/${groupId}/asr/prepare-local`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ project, sourceTrack }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error || '提取人声片段失败');
  return data;
}

// ============================================================================
// v2.3 Smart Long-Video Scene Split & BGM Beat-Sync Client API
// ============================================================================

export async function detectVideoScenesApi(
  project: ProjectData,
  assetId: string,
  req: SceneDetectRequest
): Promise<{
  segments: DetectedSceneSegment[];
  modeUsed: 'smart_scdet' | 'fixed_interval';
  autoFallbackNote?: string;
}> {
  if (isStandaloneBrowserMode) {
    const asset = project.assets.find((a) => a.id === assetId);
    const dur = asset?.duration || 9;
    const step = req.mode === 'fixed_interval' ? req.fixedIntervalSec || 3 : Math.max(2, dur / 3);
    const segs: DetectedSceneSegment[] = [];
    let idx = 0;
    for (let s = 0; s < dur - 0.5; s += step) {
      const e = Math.min(dur, s + step);
      segs.push({
        id: uid(),
        index: idx,
        startSec: Math.round(s * 100) / 100,
        endSec: Math.round(e * 100) / 100,
        durationSec: Math.round((e - s) * 100) / 100,
        score: 25,
        name: `${(asset?.name || '视频').slice(0, 14)}_镜头${String(idx + 1).padStart(2, '0')}`,
        sceneTag: idx === 0 ? '吸睛开头' : idx === 1 ? '核心卖点' : '促销CTA',
        thumbnailUrl: asset?.thumbnailUrl,
      });
      idx++;
    }
    return { segments: segs, modeUsed: 'fixed_interval' };
  }

  const res = await fetch(`/api/projects/${project.id}/assets/${assetId}/scene-detect`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ project, ...req }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error || '智能镜头切点扫描失败');
  return data;
}

export async function commitSceneSplitApi(
  project: ProjectData,
  assetId: string,
  req: SceneSplitCommitRequest
): Promise<{ createdAssets: MediaAsset[]; project: ProjectData }> {
  if (isStandaloneBrowserMode) {
    const clone = structuredClone(project);
    const src = clone.assets.find((a) => a.id === assetId);
    if (!src) throw new Error('找不到源视频素材');
    const created: MediaAsset[] = req.segments.map((seg, i) => ({
      ...structuredClone(src),
      id: uid(),
      name: seg.name || `${src.name}_镜头${i + 1}`,
      sceneTag: seg.sceneTag,
      defaultTrimStart: seg.startSec,
      defaultTrimEnd: seg.endSec,
      thumbnailUrl: seg.thumbnailUrl || src.thumbnailUrl,
      createdAt: new Date().toISOString(),
    }));
    clone.assets.unshift(...created);
    saveLocalProject(clone);
    return { createdAssets: created, project: clone };
  }

  const res = await fetch(`/api/projects/${project.id}/assets/${assetId}/scene-split-commit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ project, ...req }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error || '保存拆条子镜头失败');
  return data;
}

export async function detectAudioBeatsApi(
  project: ProjectData,
  assetId: string,
  options: {
    trimStart?: number;
    trimEnd?: number;
    speed?: number;
    density?: BeatDensityMode;
  } = {}
): Promise<BeatAnalysisResult> {
  if (isStandaloneBrowserMode) {
    const asset = project.assets.find((a) => a.id === assetId);
    const dur = Math.max(4, (options.trimEnd || asset?.duration || 16) - (options.trimStart || 0));
    const step = options.density === 'dense' ? 1.2 : options.density === 'relaxed' ? 3.2 : 2.0;
    const beatsSec: number[] = [0];
    for (let t = step; t < dur - 0.4; t += step) beatsSec.push(Math.round(t * 100) / 100);
    beatsSec.push(Math.round(dur * 100) / 100);
    return {
      assetId,
      analyzedDurationSec: dur,
      estimatedBpm: 120,
      density: options.density || 'standard',
      beatsSec,
    };
  }

  const res = await fetch(`/api/projects/${project.id}/assets/${assetId}/beats`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ project, ...options }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error || '音乐鼓点分析失败');
  return data;
}


