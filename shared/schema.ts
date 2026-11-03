export type AssetType = 'video' | 'image' | 'audio';

export type AudioRole = 'bgm' | 'voiceover';

export type AspectRatio = '9:16' | '16:9' | '1:1';

export type ExportQuality = '1080p' | '720p';

export type FitMode = 'cover' | 'blur' | 'contain';

export type TransitionType = 'none' | 'fade' | 'wipeleft' | 'smoothup' | 'circleopen';

export type TitleStyleId =
  | 'douyin_yellow'
  | 'promo_red'
  | 'glass_dark'
  | 'cyber_cyan'
  | 'vibrant_orange'
  | 'clean_white';

export type SceneTag =
  | '未分类'
  | '吸睛开头'
  | '痛点场景'
  | '核心卖点'
  | '产品特写'
  | '促销CTA';

export const SCENE_TAGS: SceneTag[] = [
  '未分类',
  '吸睛开头',
  '痛点场景',
  '核心卖点',
  '产品特写',
  '促销CTA',
];

export interface TtsVoiceMeta {
  id: string;
  name: string;
  gender: 'female' | 'male';
  badge: string;
  desc: string;
}

export const TTS_VOICES: TtsVoiceMeta[] = [
  {
    id: 'zh-CN-XiaoxiaoNeural',
    name: '晓晓 · 金牌带货女声',
    gender: 'female',
    badge: '投流首选',
    desc: '热情自然，适合全品类信息流种草与痛点引入',
  },
  {
    id: 'zh-CN-YunxiNeural',
    name: '云希 · 阳光实测男声',
    gender: 'male',
    badge: '高完播率',
    desc: '清爽有少年感，适合数码家电、开箱实测、好物推荐',
  },
  {
    id: 'zh-CN-YunjianNeural',
    name: '云健 · 激情促销男声',
    gender: 'male',
    badge: '逼单王炸',
    desc: '浑厚有爆发力，适合源头工厂、大促福利、限时秒杀',
  },
  {
    id: 'zh-CN-XiaoyiNeural',
    name: '晓伊 · 甜美种草女声',
    gender: 'female',
    badge: '小红书风',
    desc: '轻快灵动，适合美妆护肤、穿搭、零食日用分享',
  },
  {
    id: 'zh-CN-YunyangNeural',
    name: '云扬 · 专业权威播音',
    gender: 'male',
    badge: '品牌背书',
    desc: '沉稳干练，适合健康科普、企业实力、高客单产品',
  },
  {
    id: 'zh-CN-liaoning-XiaobeiNeural',
    name: '晓北 · 东北幽默女声',
    gender: 'female',
    badge: '特色方言',
    desc: '自带亲和力与喜剧节奏，适合剧情口播与生活痛点',
  },
  {
    id: 'zh-CN-shaanxi-XiaoniNeural',
    name: '晓妮 · 陕西方言女声',
    gender: 'female',
    badge: '地域美食',
    desc: '质朴地道，适合地方美食、生鲜果蔬、源头特产',
  },
  {
    id: 'zh-HK-HiuMaanNeural',
    name: '晓曼 · 粤语带货女声',
    gender: 'female',
    badge: '大湾区粤语',
    desc: '纯正自然粤语，适合港澳及广东本地信息流投放',
  },
];

export type BreathPresetId = 'gentle' | 'standard' | 'tight' | 'custom';

export interface BreathRemovalOptions {
  preset?: BreathPresetId;
  /** RMS threshold in dBFS below which audio is treated as breath/pause, e.g. -36 */
  thresholdDb: number;
  /** Minimum contiguous quiet duration (seconds) to trigger cut, e.g. 0.18 */
  minPauseSec: number;
  /** Tiny natural gap (seconds) preserved at each cut so words don't collide, e.g. 0.045 */
  keepGapSec: number;
}

export const BREATH_PRESETS: Record<
  Exclude<BreathPresetId, 'custom'>,
  BreathRemovalOptions & { label: string; desc: string }
> = {
  gentle: {
    preset: 'gentle',
    label: '轻度自然',
    desc: '仅切除明显长停顿，保留自然口播呼吸感',
    thresholdDb: -40,
    minPauseSec: 0.28,
    keepGapSec: 0.09,
  },
  standard: {
    preset: 'standard',
    label: '标准信息流 (推荐)',
    desc: '精准剔除气口与句间拖沓空白，保留45ms防吞字微衔接',
    thresholdDb: -36,
    minPauseSec: 0.18,
    keepGapSec: 0.045,
  },
  tight: {
    preset: 'tight',
    label: '极限紧凑逼单',
    desc: '连珠炮快节奏高密度口播，强拉前3秒留存',
    thresholdDb: -32,
    minPauseSec: 0.12,
    keepGapSec: 0.02,
  },
};

export interface CropBox {
  /** Normalized [0..1] left offset relative to source width */
  x: number;
  /** Normalized [0..1] top offset relative to source height */
  y: number;
  /** Normalized [0..1] width fraction */
  w: number;
  /** Normalized [0..1] height fraction */
  h: number;
}

export const FULL_CROP: CropBox = { x: 0, y: 0, w: 1, h: 1 };

export interface MediaAsset {
  id: string;
  name: string;
  type: AssetType;
  audioRole?: AudioRole;
  ttsSourceText?: string;
  ttsVoiceId?: string;
  breathRemoved?: boolean;
  breathSavedSec?: number;
  breathCutCount?: number;
  filename: string;
  url: string;
  thumbnailUrl?: string;
  filmstripUrls?: string[];
  duration: number; // seconds (for images, default e.g. 3.0s)
  width: number;
  height: number;
  fps: number;
  hasAudio: boolean;
  sizeBytes: number;
  sceneTag: SceneTag;
  defaultTrimStart: number;
  defaultTrimEnd: number;
  defaultSpeed?: number; // 0.5 ~ 2.0 (for audio/video)
  fadeInSec?: number; // 0 ~ 5.0
  fadeOutSec?: number; // 0 ~ 5.0
  defaultCrop: CropBox;
  defaultFitMode: FitMode;
  createdAt: string;
}

export interface TimelineClip {
  id: string;
  assetId: string;
  trimStart: number;
  trimEnd: number;
  speed: number; // 0.5 ~ 2.0
  volume: number; // 0 ~ 2.0
  muted: boolean;
  crop: CropBox;
  fitMode: FitMode;
  transition: TransitionType;
  note?: string;
}

export interface GroupOverlayConfig {
  topTitle: string;
  bottomTitle: string;
  styleId: TitleStyleId;
  topY: number; // 6 ~ 38 (% from top)
  bottomY: number; // 62 ~ 92 (% from top)
  fontScale: number; // 0.7 ~ 1.5
}

export type SubtitleStyleId =
  | 'jianying_white'
  | 'douyin_yellow'
  | 'keyword_box'
  | 'neon_cyan'
  | 'coral_pop';

export interface SubtitleCue {
  id: string;
  startSec: number;
  endSec: number;
  text: string;
}

export interface SubtitleConfig {
  enabled: boolean;
  styleId: SubtitleStyleId;
  /** Vertical position (% from top), default 74 so it sits cleanly above bottom title / Douyin caption bar */
  yPercent: number;
  /** Font scale multiplier 0.7 ~ 1.5, default 1.0 */
  fontScale: number;
  cues: SubtitleCue[];
}

export type WatermarkCorner = 'top_left' | 'top_right' | 'bottom_left' | 'bottom_right';

export interface WatermarkConfig {
  enabled: boolean;
  mode: 'text' | 'image';
  text: string;
  imageAssetId: string | null;
  corner: WatermarkCorner;
  /** Margin from horizontal edge (% of canvas width), default 4.5 */
  offsetX: number;
  /** Margin from vertical edge (% of canvas height), default 4.0 */
  offsetY: number;
  /** Size multiplier 0.5 ~ 2.0, default 1.0 */
  scale: number;
  /** Opacity 0.15 ~ 1.0, default 0.82 */
  opacity: number;
}

export interface DedupConfig {
  enabled: boolean;
  /** Horizontal mirror flip on underlying video picture ONLY (never flips titles, subtitles, or watermark!) */
  mirrorFlip: boolean;
  /** Subtle zoom-in crop percentage (0 ~ 8%), e.g. 3 means 103% scale to shift pixel hashes */
  zoomPunchPct: number;
  /** FFmpeg eq brightness (-0.1 ~ +0.1), default 0 */
  brightness: number;
  /** FFmpeg eq contrast (0.9 ~ 1.15), default 1.0 */
  contrast: number;
  /** FFmpeg eq saturation (0.85 ~ 1.2), default 1.0 */
  saturation: number;
  /** Mild luma sharpen to alter macroblock fingerprint while enhancing crispness */
  sharpen: boolean;
}

export interface VideoGroup {
  id: string;
  name: string;
  selectedForExport: boolean;
  clips: TimelineClip[];
  overlay: GroupOverlayConfig;
  subtitles?: SubtitleConfig;
  watermark?: WatermarkConfig;
  dedup?: DedupConfig;

  // BGM Music Track & Clip Controls
  bgmAssetId: string | null;
  bgmVolume: number; // 0 ~ 1.5
  bgmTrimStart?: number; // start offset inside BGM file (e.g. jump straight to chorus!)
  bgmTrimEnd?: number; // end offset inside BGM file (0 or undefined = until asset defaultTrimEnd)
  bgmSpeed?: number; // 0.75 ~ 1.5
  bgmLoop?: boolean; // default true
  bgmFadeInSec?: number; // 0 ~ 5
  bgmFadeOutSec?: number; // 0 ~ 5
  bgmDucking?: boolean; // auto lower BGM volume while voiceover is speaking!

  // Voiceover / TTS Track Controls
  voiceoverAssetId?: string | null;
  voiceoverVolume?: number; // 0 ~ 2.0 (default 1.15)
  voiceoverTrimStart?: number;
  voiceoverTrimEnd?: number;
  voiceoverSpeed?: number; // 0.75 ~ 1.6
  voiceoverDelaySec?: number; // start offset on video timeline (seconds, default 0)

  clipMasterVolume: number; // 0 ~ 1.5
  audioFadeOut: boolean;
  lastExportUrl?: string;
  lastExportFilename?: string;
  lastExportSizeBytes?: number;
}

export interface MatrixSlot {
  id: string;
  name: string;
  badgeColor: string;
  assetIds: string[];
}

export interface MatrixConfig {
  slots: MatrixSlot[];
  topTitlePool: string[];
  bottomTitlePool: string[];
  styleId: TitleStyleId;
  bgmPoolAssetIds: string[];
  voiceoverPoolAssetIds?: string[];
  autoSyncSubtitles?: boolean;
  autoDedup?: boolean;
  defaultTransition: TransitionType;
  defaultFitMode: FitMode;
  strategy: 'balanced_limit' | 'all_cartesian';
  targetCount: number;
  appendMode: 'append' | 'replace';
}

export interface ProjectData {
  id: string;
  name: string;
  updatedAt: string;
  aspectRatio: AspectRatio;
  exportQuality: ExportQuality;
  exportFps: 30 | 60;
  exportCrf: 20 | 23;
  filenamePattern: string; // e.g. "{project}_{index}_{group}"
  assets: MediaAsset[];
  videoGroups: VideoGroup[];
  matrix: MatrixConfig;
}

export interface RenderItemStatus {
  jobItemId: string;
  groupId: string;
  groupName: string;
  outputFilename: string;
  status: 'queued' | 'rendering' | 'done' | 'error' | 'cancelled';
  progress: number; // 0 ~ 100
  outputUrl?: string;
  fileSizeBytes?: number;
  durationSec?: number;
  error?: string;
  startedAt?: string;
  completedAt?: string;
}

export interface RenderBatchJob {
  batchId: string;
  projectId: string;
  projectName: string;
  aspectRatio: AspectRatio;
  quality: ExportQuality;
  fps: 30 | 60;
  createdAt: string;
  status: 'running' | 'completed' | 'cancelled' | 'partial_error';
  items: RenderItemStatus[];
}

export interface TitleStyleMeta {
  id: TitleStyleId;
  name: string;
  badge: string;
  textColor: string;
  strokeColor: string;
  strokeWidth: number;
  bgColor: string | null;
  bgOpacity: number;
  borderColor?: string;
  accentColor?: string;
  shadowColor: string;
}

export const TITLE_STYLES: Record<TitleStyleId, TitleStyleMeta> = {
  douyin_yellow: {
    id: 'douyin_yellow',
    name: '爆款黄黑描边',
    badge: '投流王炸',
    textColor: '#FFE600',
    strokeColor: '#0A0A0C',
    strokeWidth: 8,
    bgColor: null,
    bgOpacity: 0,
    shadowColor: 'rgba(0,0,0,0.85)',
  },
  promo_red: {
    id: 'promo_red',
    name: '大促红金胶囊',
    badge: '高转化',
    textColor: '#FFFDF5',
    strokeColor: '#7A0010',
    strokeWidth: 3,
    bgColor: '#E61E32',
    bgOpacity: 0.94,
    borderColor: '#FFD166',
    shadowColor: 'rgba(0,0,0,0.55)',
  },
  glass_dark: {
    id: 'glass_dark',
    name: '极简磨砂黑底',
    badge: '高级感',
    textColor: '#FFFFFF',
    strokeColor: '#000000',
    strokeWidth: 0,
    bgColor: '#12141C',
    bgOpacity: 0.82,
    borderColor: 'rgba(255,255,255,0.22)',
    shadowColor: 'rgba(0,0,0,0.5)',
  },
  cyber_cyan: {
    id: 'cyber_cyan',
    name: '剪映青潮酷字',
    badge: '潮酷科技',
    textColor: '#FFFFFF',
    strokeColor: '#00D8EE',
    strokeWidth: 6,
    bgColor: '#0B1320',
    bgOpacity: 0.72,
    borderColor: '#00E5FF',
    shadowColor: 'rgba(0,229,255,0.45)',
  },
  vibrant_orange: {
    id: 'vibrant_orange',
    name: '种草活力橙帖',
    badge: '好物种草',
    textColor: '#FFFFFF',
    strokeColor: '#692300',
    strokeWidth: 3,
    bgColor: '#FF6200',
    bgOpacity: 0.93,
    borderColor: '#FFE0B2',
    shadowColor: 'rgba(0,0,0,0.55)',
  },
  clean_white: {
    id: 'clean_white',
    name: '经典白字黑边',
    badge: '通用口播',
    textColor: '#FFFFFF',
    strokeColor: '#111216',
    strokeWidth: 7,
    bgColor: null,
    bgOpacity: 0,
    shadowColor: 'rgba(0,0,0,0.8)',
  },
};

export const TRANSITION_LABELS: Record<TransitionType, string> = {
  none: '硬切直连 (快节奏)',
  fade: '叠化淡入 (柔和)',
  wipeleft: '左滑推进 (动感)',
  smoothup: '上滑切入 (种草)',
  circleopen: '圆形展开 (吸睛)',
};

export const FIT_MODE_LABELS: Record<FitMode, string> = {
  cover: '智能裁切填满 (Cover)',
  blur: '毛玻璃模糊背景 (信息流竖屏推荐)',
  contain: '完整画面留黑边 (Contain)',
};

export function getTargetDimensions(
  aspectRatio: AspectRatio,
  quality: ExportQuality
): { width: number; height: number } {
  const shortSide = quality === '1080p' ? 1080 : 720;
  const longSide = quality === '1080p' ? 1920 : 1280;
  if (aspectRatio === '9:16') {
    return { width: shortSide, height: longSide };
  }
  if (aspectRatio === '16:9') {
    return { width: longSide, height: shortSide };
  }
  return { width: shortSide, height: shortSide };
}

export function getClipEffectiveDuration(clip: TimelineClip): number {
  const raw = Math.max(0.2, (clip.trimEnd || 0) - (clip.trimStart || 0));
  const spd = Math.min(2.0, Math.max(0.5, clip.speed || 1));
  return raw / spd;
}

export function getGroupTotalDuration(group: VideoGroup): number {
  if (!group.clips.length) return 0;
  let total = 0;
  for (let i = 0; i < group.clips.length; i++) {
    const d = getClipEffectiveDuration(group.clips[i]);
    total += d;
    if (i < group.clips.length - 1 && group.clips[i].transition !== 'none') {
      const nextD = getClipEffectiveDuration(group.clips[i + 1]);
      const trDur = Math.min(0.35, d * 0.3, nextD * 0.3);
      total -= trDur;
    }
  }
  return Math.max(0, total);
}

export function isCustomCropped(crop?: CropBox): boolean {
  if (!crop) return false;
  return (
    Math.abs(crop.x) > 0.005 ||
    Math.abs(crop.y) > 0.005 ||
    Math.abs(crop.w - 1) > 0.005 ||
    Math.abs(crop.h - 1) > 0.005
  );
}

export interface SubtitleStyleMeta {
  id: SubtitleStyleId;
  name: string;
  textColor: string;
  strokeColor: string;
  strokeWidth: number;
  bgColor: string | null;
  bgOpacity: number;
  shadowColor: string;
}

export const SUBTITLE_STYLES: Record<SubtitleStyleId, SubtitleStyleMeta> = {
  jianying_white: {
    id: 'jianying_white',
    name: '剪映经典白字黑边',
    textColor: '#FFFFFF',
    strokeColor: '#0B0C10',
    strokeWidth: 7,
    bgColor: null,
    bgOpacity: 0,
    shadowColor: 'rgba(0,0,0,0.85)',
  },
  douyin_yellow: {
    id: 'douyin_yellow',
    name: '抖音爆款柠檬黄字',
    textColor: '#FFE600',
    strokeColor: '#0A0A0E',
    strokeWidth: 7,
    bgColor: null,
    bgOpacity: 0,
    shadowColor: 'rgba(0,0,0,0.88)',
  },
  keyword_box: {
    id: 'keyword_box',
    name: '黑底半透知识胶囊',
    textColor: '#FFFFFF',
    strokeColor: '#000000',
    strokeWidth: 0,
    bgColor: '#0E1118',
    bgOpacity: 0.82,
    shadowColor: 'rgba(0,0,0,0.55)',
  },
  neon_cyan: {
    id: 'neon_cyan',
    name: '科技冰青描边字幕',
    textColor: '#FFFFFF',
    strokeColor: '#00B8D4',
    strokeWidth: 6,
    bgColor: null,
    bgOpacity: 0,
    shadowColor: 'rgba(0,229,255,0.5)',
  },
  coral_pop: {
    id: 'coral_pop',
    name: '种草暖橙醒目胶囊',
    textColor: '#FFFDF7',
    strokeColor: '#5C1900',
    strokeWidth: 2,
    bgColor: '#F95724',
    bgOpacity: 0.9,
    shadowColor: 'rgba(0,0,0,0.55)',
  },
};

export function createDefaultSubtitleConfig(): SubtitleConfig {
  return {
    enabled: false,
    styleId: 'douyin_yellow',
    yPercent: 74,
    fontScale: 1.0,
    cues: [],
  };
}

export function createDefaultWatermarkConfig(): WatermarkConfig {
  return {
    enabled: false,
    mode: 'text',
    text: '@品牌官方旗舰店 · 实拍',
    imageAssetId: null,
    corner: 'top_right',
    offsetX: 4.5,
    offsetY: 4.0,
    scale: 1.0,
    opacity: 0.82,
  };
}

export function createDefaultDedupConfig(): DedupConfig {
  return {
    enabled: false,
    mirrorFlip: false,
    zoomPunchPct: 0,
    brightness: 0,
    contrast: 1.0,
    saturation: 1.0,
    sharpen: false,
  };
}

/**
 * Splits a Chinese/English spoken script into bite-sized short-video subtitle cues
 * (<= 14 chars per line, Jianying clean punctuation) and distributes timestamps
 * proportionally to spoken syllable weight across [startDelaySec, startDelaySec + durationSec].
 */
export function buildSyncedSubtitlesFromScript(
  rawScript: string,
  durationSec: number,
  startDelaySec = 0
): SubtitleCue[] {
  const cleaned = (rawScript || '').replace(/\r/g, '').trim();
  if (!cleaned) return [];

  // Split by major & minor clause punctuation while keeping ! / ? emphasis
  const rawParts = cleaned
    .split(/([，。！？；：、\n,.;!?]+)/)
    .reduce<string[]>((acc, token, idx) => {
      if (idx % 2 === 0) {
        const t = token.trim();
        if (t) acc.push(t);
      } else if (acc.length > 0 && /[！？!?]/.test(token)) {
        acc[acc.length - 1] += token[0];
      }
      return acc;
    }, []);

  // Wrap any overly long clause (> 14 chars) into balanced ~11-char phrases
  const phrases: string[] = [];
  for (const part of rawParts) {
    if (part.length <= 15) {
      phrases.push(part);
    } else {
      const chunks = Math.ceil(part.length / 12);
      const step = Math.ceil(part.length / chunks);
      for (let i = 0; i < part.length; i += step) {
        const sub = part.slice(i, i + step).trim();
        if (sub) phrases.push(sub);
      }
    }
  }

  if (phrases.length === 0) return [];

  const effDur = Math.max(0.8, durationSec);
  const weights = phrases.map((p) => {
    let w = 0.25;
    for (const ch of p) {
      w += /[\u4e00-\u9fa5]/.test(ch) ? 1.0 : /[a-zA-Z0-9]/.test(ch) ? 0.55 : 0.2;
    }
    if (/[！？!?]$/.test(p)) w += 0.35;
    return w;
  });
  const totalWeight = weights.reduce((a, b) => a + b, 0) || 1;

  let cursor = Math.max(0, startDelaySec);
  return phrases.map((text, idx) => {
    const share = (weights[idx] / totalWeight) * effDur;
    const startSec = Math.round(cursor * 100) / 100;
    const rawEnd = idx === phrases.length - 1 ? startDelaySec + effDur : cursor + share - 0.03;
    const endSec = Math.round(Math.max(startSec + 0.22, rawEnd) * 100) / 100;
    cursor += share;
    return {
      id: `sub_${idx}_${Math.random().toString(36).slice(2, 7)}`,
      startSec,
      endSec,
      text,
    };
  });
}

export function exportCuesToSrt(cues: SubtitleCue[]): string {
  const fmt = (sec: number) => {
    const msTotal = Math.max(0, Math.round(sec * 1000));
    const h = Math.floor(msTotal / 3600000);
    const m = Math.floor((msTotal % 3600000) / 60000);
    const s = Math.floor((msTotal % 60000) / 1000);
    const ms = msTotal % 1000;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(
      2,
      '0'
    )},${String(ms).padStart(3, '0')}`;
  };
  return cues
    .map((c, idx) => `${idx + 1}\n${fmt(c.startSec)} --> ${fmt(c.endSec)}\n${c.text}\n`)
    .join('\n');
}

export function generateDedupVariant(index: number, allowMirror = false): DedupConfig {
  // Deterministic + jittered subtle variation so every group in a batch gets a unique visual hash
  const zooms = [1.8, 2.6, 3.4, 4.2, 2.2, 3.8, 4.8, 3.0];
  const brights = [0.02, -0.02, 0.03, -0.01, 0.01, 0.04, -0.03, 0.02];
  const contrasts = [1.03, 0.98, 1.05, 1.02, 0.97, 1.04, 1.01, 1.06];
  const sats = [1.05, 0.96, 1.08, 0.98, 1.04, 1.1, 0.95, 1.03];
  const k = index % zooms.length;
  const jitter = Math.round((Math.random() * 0.6 - 0.3) * 100) / 100;
  return {
    enabled: true,
    mirrorFlip: allowMirror ? index % 2 === 1 : false,
    zoomPunchPct: Math.max(1, Math.round((zooms[k] + jitter) * 10) / 10),
    brightness: brights[k],
    contrast: contrasts[k],
    saturation: sats[k],
    sharpen: index % 2 === 0,
  };
}

