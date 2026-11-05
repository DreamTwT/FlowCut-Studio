import { buildTransitionTimeline } from './timeline.js';

export type AssetType = 'video' | 'image' | 'audio';

export type AudioRole = 'bgm' | 'voiceover';

export type AspectRatio = '9:16' | '16:9' | '1:1';

export type ExportQuality = '1080p' | '720p';

export type FitMode = 'cover' | 'blur' | 'contain';

export type TransitionType = 'none' | 'fade' | 'wipeleft' | 'smoothup' | 'circleopen';

export type MotionPresetId =
  | 'none'
  | 'hook_punch'
  | 'zoom_in'
  | 'zoom_out'
  | 'pan_right'
  | 'pan_left'
  | 'tilt_up';

export type MotionMatrixStrategy = 'none' | 'smart_alternating' | 'images_only';

export type SfxPresetId =
  | 'none'
  | 'whoosh_hook'
  | 'impact_boom'
  | 'pop_bubble'
  | 'ding_shine'
  | 'cash_register'
  | 'camera_shutter';

export type CoverExportMode = 'none' | 'first_highlight' | 'golden_3s' | 'middle_frame';

export type VideoEncoderId =
  | 'auto'
  | 'h264_nvenc'
  | 'h264_videotoolbox'
  | 'h264_amf'
  | 'h264_qsv'
  | 'libx264';

export type ResolvedVideoEncoderId = Exclude<VideoEncoderId, 'auto'>;

export interface HardwareEncoderInfo {
  id: ResolvedVideoEncoderId;
  name: string;
  shortLabel: string;
  vendor: 'nvidia' | 'apple' | 'amd' | 'intel' | 'cpu';
  available: boolean;
  reason?: string;
}

export interface HardwareAccelerationReport {
  probedAt: string;
  gpuNames: string[];
  hasHardwareGpu: boolean;
  recommendedEncoder: ResolvedVideoEncoderId;
  recommendedConcurrency: 1 | 2 | 3 | 4;
  encoders: HardwareEncoderInfo[];
}

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
  motion?: MotionPresetId;
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

export type DedupPresetId = 'light' | 'standard' | 'strong' | 'custom';

export interface DedupConfig {
  enabled: boolean;
  preset?: DedupPresetId;
  /**
   * 1. Spatial Visual Hash Dispersion
   * Applied ONLY to underlying video picture BEFORE titles/subtitles/watermarks!
   */
  mirrorFlip: boolean;
  /** Subtle zoom-in crop percentage (0 ~ 8%), e.g. 3 means 103% scale to shift pixel hashes */
  zoomPunchPct: number;
  /** Micro rotation angle (-1.2 ~ +1.2 deg); auto-zoomed so zero black corners appear */
  rotateDeg?: number;
  /** FFmpeg eq brightness (-0.1 ~ +0.1), default 0 */
  brightness: number;
  /** FFmpeg eq contrast (0.9 ~ 1.15), default 1.0 */
  contrast: number;
  /** FFmpeg eq saturation (0.85 ~ 1.2), default 1.0 */
  saturation: number;
  /** Subtle hue color-temperature shift (-5 ~ +5 deg) */
  hueDeg?: number;
  /** Mild luma sharpen to alter macroblock fingerprint while enhancing crispness */
  sharpen: boolean;
  /** Dynamic per-frame temporal micro-grain (0 ~ 6, FFmpeg noise=alls=N:allf=t) */
  temporalGrain?: number;
  /** Subtle natural optical vignette around corners */
  vignette?: boolean;

  /**
   * 2. Temporal Sequence & Keyframe Dispersion
   * Applied AFTER subtitle burn-in in lockstep to BOTH video & audio -> 100% lip/subtitle sync!
   */
  /** Global master tempo jitter (-3.0% ~ +3.5%), e.g. +2.1 -> 1.021x */
  speedJitterPct?: number;
  /** Randomize GOP keyframe interval (-g 46..74) to shift platform I-frame sampling */
  randomGop?: boolean;

  /**
   * 3. Audio Chromaprint Fingerprint Dispersion
   * 40Hz sub-bass cut + randomized transparent 2-band micro-EQ + subtle stereo width
   */
  audioFingerprint?: boolean;

  /**
   * 4. MP4 Container Scrubbing & Natural Camera Metadata
   * Strips Lavf/encoder signatures (-map_metadata -1) & writes randomized recent creation_time
   */
  scrubMetadata?: boolean;
}

export const DEDUP_PRESETS: Record<
  Exclude<DedupPresetId, 'custom'>,
  { label: string; badge: string; desc: string }
> = {
  light: {
    label: '轻度自然档',
    badge: '品牌高画质',
    desc: '微缩放 + 极轻色彩微扰 + 容器元数据清洗，保留极致原生画质',
  },
  standard: {
    label: '标准投流档',
    badge: '千川推荐',
    desc: '空间微变 + 时变微胶片颗粒 + 全片微变速错帧 + 声纹微均衡 + 元数据清洗（极速不掉帧）',
  },
  strong: {
    label: '强力矩阵过审档',
    badge: '高密跑量',
    desc: '全开四维防重 + 隐形微角度旋转扩边 + 光学暗角 + 随机GOP关键帧重构（适合20~60条同源裂变）',
  },
};

export interface GroupSfxConfig {
  enabled: boolean;
  volume: number; // 0.1 ~ 1.5, default 0.65
  /** Triggered at t=0.04s on the opening hook shot */
  hookSfxId: SfxPresetId;
  /** Triggered automatically on every clip cut / transition boundary */
  transitionSfxId: SfxPresetId;
  /** Triggered when the final CTA clip starts */
  ctaSfxId: SfxPresetId;
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
  sfx?: GroupSfxConfig;

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
  dedupPreset?: Exclude<DedupPresetId, 'custom'>;
  protectPackagingText?: boolean;
  defaultTransition: TransitionType;
  defaultFitMode: FitMode;
  defaultMotionStrategy?: MotionMatrixStrategy;
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
  videoEncoder?: VideoEncoderId;
  renderConcurrency?: 1 | 2 | 3 | 4;
  exportCoverMode?: CoverExportMode;
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
  coverFilename?: string;
  coverUrl?: string;
  coverError?: string;
  fileSizeBytes?: number;
  durationSec?: number;
  encoderUsed?: string;
  elapsedMs?: number;
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
  encoderRequested?: VideoEncoderId;
  encoderResolved?: string;
  concurrency?: number;
  exportCoverMode?: CoverExportMode;
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
  return buildTransitionTimeline(group.clips.map(clip => ({
    duration: getClipEffectiveDuration(clip), transition: clip.transition,
  }))).totalDuration;
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
    preset: 'standard',
    mirrorFlip: false,
    zoomPunchPct: 0,
    rotateDeg: 0,
    brightness: 0,
    contrast: 1.0,
    saturation: 1.0,
    hueDeg: 0,
    sharpen: false,
    temporalGrain: 0,
    vignette: false,
    speedJitterPct: 0,
    randomGop: true,
    audioFingerprint: true,
    scrubMetadata: true,
  };
}

/**
 * Build a preset configuration for a single video group, or generate a unique
 * 4-dimensional anti-duplicate variant for batch/matrix groups!
 */
export function buildDedupFromPreset(
  preset: Exclude<DedupPresetId, 'custom'>,
  index = 0,
  allowMirror = false
): DedupConfig {
  const zoomsLight = [1.4, 2.0, 1.7, 2.4, 1.5, 2.2, 1.9, 2.6];
  const zoomsStd = [2.2, 3.1, 3.8, 2.6, 4.2, 2.9, 3.5, 4.5];
  const zoomsStrong = [3.6, 4.8, 5.6, 4.2, 6.2, 4.5, 5.2, 6.0];

  const brights = [0.015, -0.015, 0.025, -0.01, 0.01, 0.03, -0.02, 0.02];
  const contrasts = [1.03, 0.98, 1.04, 1.02, 0.97, 1.05, 1.01, 1.04];
  const sats = [1.04, 0.97, 1.06, 0.98, 1.03, 1.08, 0.96, 1.05];
  const hues = [1.8, -1.6, 2.6, -2.2, 1.4, -2.8, 2.2, -1.9];
  const speeds = [1.6, -1.5, 2.3, -2.1, 1.2, 2.7, -1.8, 2.0];
  const rotates = [0.55, -0.6, 0.75, -0.7, 0.5, -0.8, 0.65, -0.55];

  const k = Math.abs(index) % 8;
  const jitter = Math.round((Math.random() * 0.5 - 0.25) * 100) / 100;
  const spdJitter = Math.round((Math.random() * 0.6 - 0.3) * 10) / 10;

  if (preset === 'light') {
    return {
      enabled: true,
      preset: 'light',
      mirrorFlip: allowMirror ? k % 2 === 1 : false,
      zoomPunchPct: Math.max(1.0, Math.round((zoomsLight[k] + jitter) * 10) / 10),
      rotateDeg: 0,
      brightness: Math.round(brights[k] * 0.6 * 1000) / 1000,
      contrast: contrasts[k],
      saturation: sats[k],
      hueDeg: 0,
      sharpen: false,
      temporalGrain: 0,
      vignette: false,
      speedJitterPct: 0,
      randomGop: true,
      audioFingerprint: false,
      scrubMetadata: true,
    };
  }

  if (preset === 'strong') {
    return {
      enabled: true,
      preset: 'strong',
      mirrorFlip: allowMirror ? k % 2 === 1 : false,
      zoomPunchPct: Math.max(2.5, Math.round((zoomsStrong[k] + jitter) * 10) / 10),
      rotateDeg: rotates[k],
      brightness: brights[k],
      contrast: contrasts[k],
      saturation: sats[k],
      hueDeg: hues[k],
      sharpen: true,
      temporalGrain: k % 2 === 0 ? 4 : 3,
      vignette: true,
      speedJitterPct: Math.round((speeds[k] * 1.15 + spdJitter) * 10) / 10,
      randomGop: true,
      audioFingerprint: true,
      scrubMetadata: true,
    };
  }

  // 'standard' (Recommended for Qianchuan / Douyin daily feed ads: fast + 4D coverage)
  return {
    enabled: true,
    preset: 'standard',
    mirrorFlip: allowMirror ? k % 2 === 1 : false,
    zoomPunchPct: Math.max(1.6, Math.round((zoomsStd[k] + jitter) * 10) / 10),
    rotateDeg: 0,
    brightness: brights[k],
    contrast: contrasts[k],
    saturation: sats[k],
    hueDeg: Math.round(hues[k] * 0.75 * 10) / 10,
    sharpen: k % 2 === 0,
    temporalGrain: 2,
    vignette: false,
    speedJitterPct: Math.round((speeds[k] + spdJitter) * 10) / 10,
    randomGop: true,
    audioFingerprint: true,
    scrubMetadata: true,
  };
}

export function generateDedupVariant(
  index: number,
  allowMirror = false,
  preset: Exclude<DedupPresetId, 'custom'> = 'standard'
): DedupConfig {
  return buildDedupFromPreset(preset, index, allowMirror);
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

// ============================================================================
// v2.2 — AI Ad Script Fission & Dual-Mode Speech-to-Subtitle (ASR) Schemas
// ============================================================================

export type AiProviderId =
  | 'siliconflow'
  | 'deepseek'
  | 'aliyun_bailian'
  | 'zhipu'
  | 'doubao'
  | 'ollama_local'
  | 'openai_custom';

export interface AiProviderPreset {
  id: AiProviderId;
  name: string;
  badge: string;
  baseUrl: string;
  defaultLlmModel: string;
  suggestedModels: string[];
  supportsCloudAsr: boolean;
  defaultAsrModel?: string;
  keyHint: string;
}

export const AI_PROVIDER_PRESETS: Record<AiProviderId, AiProviderPreset> = {
  siliconflow: {
    id: 'siliconflow',
    name: '硅基流动 SiliconFlow',
    badge: '一Key双通·含免费ASR',
    baseUrl: 'https://api.siliconflow.cn/v1',
    defaultLlmModel: 'Qwen/Qwen2.5-7B-Instruct',
    suggestedModels: [
      'Qwen/Qwen2.5-7B-Instruct',
      'deepseek-ai/DeepSeek-V3',
      'Qwen/Qwen2.5-72B-Instruct',
    ],
    supportsCloudAsr: true,
    defaultAsrModel: 'FunAudioLLM/SenseVoiceSmall',
    keyHint: '填入硅基流动 sk-... 密钥，可同时免费调用 Qwen2.5-7B 与阿里 SenseVoice 语音识别',
  },
  deepseek: {
    id: 'deepseek',
    name: 'DeepSeek 官方直连',
    badge: '爆款文案王',
    baseUrl: 'https://api.deepseek.com/v1',
    defaultLlmModel: 'deepseek-chat',
    suggestedModels: ['deepseek-chat', 'deepseek-reasoner'],
    supportsCloudAsr: false,
    keyHint: '填入 platform.deepseek.com 的 API Key，中文电商网感极强',
  },
  aliyun_bailian: {
    id: 'aliyun_bailian',
    name: '阿里云百炼 (通义千问)',
    badge: '国内高稳',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    defaultLlmModel: 'qwen-plus',
    suggestedModels: ['qwen-plus', 'qwen-max', 'qwen-turbo'],
    supportsCloudAsr: false,
    keyHint: '填入阿里云百炼 DashScope sk-... API Key',
  },
  zhipu: {
    id: 'zhipu',
    name: '智谱清言 GLM',
    badge: '含免费Flash',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    defaultLlmModel: 'glm-4-flash',
    suggestedModels: ['glm-4-flash', 'glm-4-plus'],
    supportsCloudAsr: false,
    keyHint: 'glm-4-flash 官方免费高速调用，适合大批次脚本裂变',
  },
  doubao: {
    id: 'doubao',
    name: '字节火山方舟 (豆包)',
    badge: '抖音同源',
    baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
    defaultLlmModel: 'doubao-1-5-pro-32k-250115',
    suggestedModels: ['doubao-1-5-pro-32k-250115'],
    supportsCloudAsr: false,
    keyHint: '填入火山方舟 API Key 及推理接入点 ep-... 或模型名',
  },
  ollama_local: {
    id: 'ollama_local',
    name: '本地 Ollama 离线大模型',
    badge: '完全免Key',
    baseUrl: 'http://127.0.0.1:11434/v1',
    defaultLlmModel: 'qwen2.5:7b',
    suggestedModels: ['qwen2.5:7b', 'deepseek-r1:7b', 'llama3.1:8b'],
    supportsCloudAsr: false,
    keyHint: '本机启动 ollama serve 后无需 API Key 即可离线生成脚本',
  },
  openai_custom: {
    id: 'openai_custom',
    name: 'OpenAI / 通用中转接口',
    badge: '自定义兼容',
    baseUrl: 'https://api.openai.com/v1',
    defaultLlmModel: 'gpt-4o-mini',
    suggestedModels: ['gpt-4o-mini', 'gpt-4o'],
    supportsCloudAsr: true,
    defaultAsrModel: 'whisper-1',
    keyHint: '兼容任意支持 /v1/chat/completions 与 /v1/audio/transcriptions 的接口',
  },
};

export type AsrEngineMode = 'auto' | 'cloud' | 'local_wasm';

export type LocalWhisperModelId = 'Xenova/whisper-base' | 'Xenova/whisper-small';

export interface AiEngineSettings {
  providerId: AiProviderId;
  baseUrl: string;
  apiKey: string;
  llmModel: string;
  asrMode: AsrEngineMode;
  /** Defaults to https://api.siliconflow.cn/v1 so 1 SiliconFlow key unlocks free SenseVoiceSmall */
  asrBaseUrl: string;
  /** Optional dedicated ASR key; if empty, automatically reuses `apiKey`! */
  asrApiKey: string;
  asrModel: string;
  localWhisperModel: LocalWhisperModelId;
}

export function createDefaultAiSettings(): AiEngineSettings {
  return {
    providerId: 'siliconflow',
    baseUrl: 'https://api.siliconflow.cn/v1',
    apiKey: '',
    llmModel: 'Qwen/Qwen2.5-7B-Instruct',
    asrMode: 'auto',
    asrBaseUrl: 'https://api.siliconflow.cn/v1',
    asrApiKey: '',
    asrModel: 'FunAudioLLM/SenseVoiceSmall',
    localWhisperModel: 'Xenova/whisper-base',
  };
}

export type AiScriptStyleId =
  | 'mixed_horse_race'
  | 'pain_point_hook'
  | 'hardcore_test'
  | 'anti_pitfall'
  | 'promo_urgency'
  | 'local_store';

export const AI_SCRIPT_STYLES: Record<
  AiScriptStyleId,
  { label: string; badge: string; desc: string }
> = {
  mixed_horse_race: {
    label: '全流派混合赛马',
    badge: '千川首选',
    desc: '痛点型+测评型+避坑型+逼单型多维度交叉生成，测试最优跑量方向',
  },
  pain_point_hook: {
    label: '痛点直击种草',
    badge: '高留存',
    desc: '前3秒精准戳中人群日常痛点，顺势引出产品解决方案',
  },
  hardcore_test: {
    label: '硬核参数实测',
    badge: '强信任',
    desc: '聚焦暴力实测、核心用料与前后对比，快速打消下单顾虑',
  },
  anti_pitfall: {
    label: '反向避坑揭秘',
    badge: '高完播',
    desc: '“别再交智商税了！”悬念反常识切入，拉满前3秒完播率',
  },
  promo_urgency: {
    label: '源头福利逼单',
    badge: '高ROI转化',
    desc: '突出源头直发、价格锚点对比与限时赠品福利，强力促单',
  },
  local_store: {
    label: '同城团购探店',
    badge: '本地生活',
    desc: '适合餐饮美食、休闲娱乐、同城门店团购套餐引流到店',
  },
};

export interface AiScriptGenerateRequest {
  productName: string;
  sellingPoints: string;
  painPoints?: string;
  ctaOffer?: string;
  styleId: AiScriptStyleId;
  count: number; // 3 ~ 16
  targetDurationSec: 12 | 20 | 32;
  useOfflineFormulaOnly?: boolean;
}

export interface GeneratedAdScriptItem {
  id: string;
  angleBadge: string;
  topTitle: string;
  bottomTitle: string;
  spokenScript: string;
  estDurationSec: number;
}

export interface SpeechSegmentPayload {
  index: number;
  startSec: number;
  endSec: number;
  /** Base64-encoded Float32LE 16kHz mono PCM samples */
  pcmFloat32Base64: string;
}

// ============================================================================
// v2.3 Smart Long-Video Scene Split, BGM Beat-Sync & Audio-Video Auto-Align
// ============================================================================

export type SceneSplitMode = 'smart_scdet' | 'fixed_interval';

export type SceneSplitSensitivity = 'high' | 'standard' | 'low';

export interface DetectedSceneSegment {
  id: string;
  index: number;
  startSec: number;
  endSec: number;
  durationSec: number;
  score: number;
  name: string;
  sceneTag: SceneTag;
  thumbnailUrl?: string;
}

export interface SceneDetectRequest {
  mode: SceneSplitMode;
  sensitivity?: SceneSplitSensitivity;
  minShotSec?: number; // e.g. 1.5s
  fixedIntervalSec?: number; // e.g. 3.0s when mode === 'fixed_interval'
}

export type SceneSplitDispatchMode =
  | 'library_only'
  | 'active_group'
  | 'matrix_slots_by_tag';

export interface SceneSplitCommitRequest {
  segments: Array<{
    startSec: number;
    endSec: number;
    name: string;
    sceneTag: SceneTag;
    thumbnailUrl?: string;
  }>;
  dispatchMode: SceneSplitDispatchMode;
  targetGroupId?: string;
  removeOriginalAsset?: boolean;
}

export type BeatDensityMode = 'dense' | 'standard' | 'relaxed';

export type BeatSyncStrategy = 'trim_first' | 'speed_fit';

export interface BeatAnalysisResult {
  assetId: string;
  analyzedDurationSec: number;
  estimatedBpm: number;
  density: BeatDensityMode;
  /** Beat timestamps (seconds, starting at 0.0) relative to the analyzed BGM window */
  beatsSec: number[];
}

export type DurationAlignMode =
  | 'hybrid_smart'
  | 'video_speed_only'
  | 'voiceover_speed_fit';

export const DURATION_ALIGN_MODES: Record<
  DurationAlignMode,
  { label: string; badge: string; desc: string }
> = {
  hybrid_smart: {
    label: '智能混合对齐 (先展缩片段裁剪，不足再微变速)',
    badge: '自然推荐',
    desc: '优先利用原片冗余时长保持 1.0x 原速，原片不够长时自动平滑微变速补齐口播',
  },
  video_speed_only: {
    label: '固定已剪画面范围 · 均匀变速对齐口播',
    badge: '保完整动作',
    desc: '不改动每个镜头的起止画面内容，按比例自动调节片段倍速与图片停留时长',
  },
  voiceover_speed_fit: {
    label: '固定画面卡点 · 反向微调口播语速与字幕轴',
    badge: '保音乐踩点',
    desc: '适合已做好音乐鼓点卡点的视频组：不动画面切点，自动微调口播倍速并同步缩放字幕时间轴',
  },
};

/**
 * Returns the effective end timestamp (seconds on group timeline) of the active voiceover track,
 * or 0 if the group has no valid voiceover assigned.
 */
export function getGroupVoiceoverDuration(
  group: VideoGroup,
  assetMap: Map<string, MediaAsset>
): number {
  if (!group.voiceoverAssetId) return 0;
  const vo = assetMap.get(group.voiceoverAssetId);
  if (!vo) return 0;
  const start = group.voiceoverTrimStart ?? vo.defaultTrimStart ?? 0;
  const rawEnd = group.voiceoverTrimEnd || vo.defaultTrimEnd || vo.duration || 0;
  const end = Math.max(start + 0.1, rawEnd);
  const spd = Math.max(0.5, Math.min(2.0, group.voiceoverSpeed || vo.defaultSpeed || 1.0));
  const delay = Math.max(0, group.voiceoverDelaySec || 0);
  return Math.round((delay + (end - start) / spd) * 100) / 100;
}

function computeTransitionOverlapSum(clips: TimelineClip[]): number {
  let overlap = 0;
  for (let i = 0; i < clips.length - 1; i++) {
    if (clips[i].transition !== 'none') {
      const d = getClipEffectiveDuration(clips[i]);
      const nextD = getClipEffectiveDuration(clips[i + 1]);
      overlap += Math.min(0.35, d * 0.3, nextD * 0.3);
    }
  }
  return overlap;
}

/**
 * Aligns a VideoGroup's visual timeline and/or voiceover duration so there is zero audio cut-off
 * and zero awkward trailing silent tail.
 */
export function alignGroupDurationToVoiceover(
  group: VideoGroup,
  assetMap: Map<string, MediaAsset>,
  mode: DurationAlignMode = 'hybrid_smart',
  tailPadSec = 0.2
): {
  changed: boolean;
  beforeVideoSec: number;
  afterVideoSec: number;
  voiceoverSec: number;
  note: string;
} {
  const beforeVideoSec = getGroupTotalDuration(group);
  const voEndSec = getGroupVoiceoverDuration(group, assetMap);
  if (!group.clips.length || voEndSec <= 0.15) {
    return {
      changed: false,
      beforeVideoSec,
      afterVideoSec: beforeVideoSec,
      voiceoverSec: voEndSec,
      note: '当前组未挂载口播配音或无画面片段',
    };
  }

  const targetSec = Math.max(0.8, voEndSec + tailPadSec);
  if (Math.abs(beforeVideoSec - targetSec) < 0.08) {
    return {
      changed: false,
      beforeVideoSec,
      afterVideoSec: beforeVideoSec,
      voiceoverSec: voEndSec,
      note: '当前音画时长已精准对齐',
    };
  }

  // Strategy 3: Keep video cuts untouched; adjust voiceover playback speed + rescale subtitle cues!
  if (mode === 'voiceover_speed_fit') {
    const vo = group.voiceoverAssetId ? assetMap.get(group.voiceoverAssetId) : null;
    if (!vo) {
      return {
        changed: false,
        beforeVideoSec,
        afterVideoSec: beforeVideoSec,
        voiceoverSec: voEndSec,
        note: '未找到口播音频素材',
      };
    }
    const delay = Math.max(0, group.voiceoverDelaySec || 0);
    const availVoWindow = Math.max(0.5, beforeVideoSec - delay - 0.15);
    const start = group.voiceoverTrimStart ?? vo.defaultTrimStart ?? 0;
    const end = Math.max(start + 0.1, group.voiceoverTrimEnd || vo.defaultTrimEnd || vo.duration);
    const rawSpan = end - start;
    const oldSpd = group.voiceoverSpeed || vo.defaultSpeed || 1.0;
    const idealSpd = rawSpan / availVoWindow;
    const clampedSpd = Math.round(Math.max(0.78, Math.min(1.55, idealSpd)) * 100) / 100;
    group.voiceoverSpeed = clampedSpd;

    // Proportionally remap subtitle cues after `delay` so hard-burned subtitles stay 100% synced!
    if (group.subtitles?.cues?.length && Math.abs(clampedSpd - oldSpd) > 0.005) {
      const timeScale = oldSpd / clampedSpd;
      group.subtitles.cues = group.subtitles.cues.map((c) => {
        const relS = Math.max(0, c.startSec - delay);
        const relE = Math.max(relS + 0.15, c.endSec - delay);
        return {
          ...c,
          startSec: Math.round((delay + relS * timeScale) * 100) / 100,
          endSec: Math.round((delay + relE * timeScale) * 100) / 100,
        };
      });
    }

    const newVoSec = getGroupVoiceoverDuration(group, assetMap);
    return {
      changed: true,
      beforeVideoSec,
      afterVideoSec: beforeVideoSec,
      voiceoverSec: newVoSec,
      note: `口播倍速已智能调整为 ${clampedSpd}x（字幕轴同步校准）`,
    };
  }

  // Strategy 1 & 2: Adjust visual clips so getGroupTotalDuration(group) === targetSec
  // Two-pass solver to account accurately for xfade transition overlaps
  for (let pass = 0; pass < 2; pass++) {
    const curTotal = getGroupTotalDuration(group);
    if (Math.abs(curTotal - targetSec) < 0.02) break;
    const overlap = computeTransitionOverlapSum(group.clips);
    const curSumEff = curTotal + overlap;
    const desiredSumEff = Math.max(group.clips.length * 0.35, targetSec + overlap);
    const scaleRatio = desiredSumEff / Math.max(0.1, curSumEff);

    for (const clip of group.clips) {
      const asset = assetMap.get(clip.assetId);
      const curEff = getClipEffectiveDuration(clip);
      const wantEff = Math.max(0.35, curEff * scaleRatio);

      if (!asset || asset.type === 'image') {
        clip.speed = 1.0;
        clip.trimStart = 0;
        clip.trimEnd = Math.round(wantEff * 100) / 100;
        continue;
      }

      if (mode === 'hybrid_smart') {
        // Prefer natural 1.0x speed if raw asset footage after trimStart has enough length!
        const maxAvailFromStart = Math.max(0.35, asset.duration - clip.trimStart);
        if (wantEff <= maxAvailFromStart) {
          clip.speed = 1.0;
          clip.trimEnd = Math.round((clip.trimStart + wantEff) * 100) / 100;
        } else if (wantEff <= asset.duration) {
          // Shift trimStart back slightly to unlock full footage at 1.0x!
          clip.speed = 1.0;
          clip.trimStart = Math.round(Math.max(0, asset.duration - wantEff) * 100) / 100;
          clip.trimEnd = Math.round(asset.duration * 100) / 100;
        } else {
          // Use full footage + smooth slow-motion (clamped >= 0.45x)
          clip.trimStart = 0;
          clip.trimEnd = Math.round(asset.duration * 100) / 100;
          const neededSpd = asset.duration / wantEff;
          clip.speed = Math.round(Math.max(0.45, Math.min(2.0, neededSpd)) * 100) / 100;
        }
      } else {
        // video_speed_only: preserve [trimStart, trimEnd] content and adjust speed
        const rawSpan = Math.max(0.25, clip.trimEnd - clip.trimStart);
        const neededSpd = rawSpan / wantEff;
        if (neededSpd >= 0.5 && neededSpd <= 1.95) {
          clip.speed = Math.round(neededSpd * 100) / 100;
        } else if (neededSpd < 0.5) {
          clip.speed = 0.5;
          const extraRawNeeded = wantEff * 0.5;
          clip.trimEnd = Math.round(
            Math.min(asset.duration, clip.trimStart + extraRawNeeded) * 100
          ) / 100;
        } else {
          clip.speed = 1.95;
          clip.trimEnd = Math.round((clip.trimStart + wantEff * 1.95) * 100) / 100;
        }
      }
    }
  }

  const afterVideoSec = getGroupTotalDuration(group);
  return {
    changed: true,
    beforeVideoSec,
    afterVideoSec,
    voiceoverSec: voEndSec,
    note: `画面总长已从 ${beforeVideoSec.toFixed(1)}s 对齐至 ${afterVideoSec.toFixed(1)}s（匹配口播 ${voEndSec.toFixed(1)}s）`,
  };
}

/**
 * Snaps every clip in `group.clips` onto detected musical beat intervals `beatsSec`
 * (`[0, b1, b2, ...]`), compensating for `xfade` transition overlaps so every visual
 * cut/transition lands directly on the beat!
 */
export function applyBeatsToGroupClips(
  group: VideoGroup,
  assetMap: Map<string, MediaAsset>,
  beatsSec: number[],
  strategy: BeatSyncStrategy = 'trim_first'
): { alignedClips: number; totalSec: number } {
  const N = group.clips.length;
  if (N === 0 || beatsSec.length < 2) {
    return { alignedClips: 0, totalSec: getGroupTotalDuration(group) };
  }

  // Ensure monotonic beat grid with enough beat points to cover all N clips
  const grid = [...beatsSec].sort((a, b) => a - b);
  if (grid[0] > 0.05) grid.unshift(0);
  else grid[0] = 0;

  const avgStep =
    grid.length >= 2
      ? Math.max(0.8, (grid[grid.length - 1] - grid[0]) / (grid.length - 1))
      : 2.0;
  while (grid.length <= N) {
    grid.push(Math.round((grid[grid.length - 1] + avgStep) * 100) / 100);
  }

  for (let i = 0; i < N; i++) {
    const clip = group.clips[i];
    const asset = assetMap.get(clip.assetId);
    const beatSpan = Math.max(0.45, grid[i + 1] - grid[i]);
    const hasOutTransition = i < N - 1 && clip.transition !== 'none';
    const trComp = hasOutTransition ? Math.min(0.35, beatSpan * 0.28) : 0;
    const wantEff = beatSpan + trComp;

    if (!asset || asset.type === 'image') {
      clip.speed = 1.0;
      clip.trimStart = 0;
      clip.trimEnd = Math.round(wantEff * 100) / 100;
      continue;
    }

    if (strategy === 'trim_first') {
      const maxAvail = Math.max(0.25, asset.duration - clip.trimStart);
      if (wantEff <= maxAvail) {
        clip.speed = 1.0;
        clip.trimEnd = Math.round((clip.trimStart + wantEff) * 100) / 100;
      } else if (wantEff <= asset.duration) {
        clip.speed = 1.0;
        clip.trimStart = Math.round(Math.max(0, asset.duration - wantEff) * 100) / 100;
        clip.trimEnd = Math.round(asset.duration * 100) / 100;
      } else {
        clip.trimStart = 0;
        clip.trimEnd = Math.round(asset.duration * 100) / 100;
        clip.speed = Math.round(Math.max(0.5, asset.duration / wantEff) * 100) / 100;
      }
    } else {
      const rawSpan = Math.max(0.25, clip.trimEnd - clip.trimStart);
      const spd = rawSpan / wantEff;
      if (spd >= 0.55 && spd <= 1.85) {
        clip.speed = Math.round(spd * 100) / 100;
      } else if (spd < 0.55) {
        clip.speed = 0.55;
        clip.trimEnd = Math.round(
          Math.min(asset.duration, clip.trimStart + wantEff * 0.55) * 100
        ) / 100;
      } else {
        clip.speed = 1.85;
        clip.trimEnd = Math.round((clip.trimStart + wantEff * 1.85) * 100) / 100;
      }
    }
  }

  return {
    alignedClips: N,
    totalSec: getGroupTotalDuration(group),
  };
}

// ============================================================================
// v2.4 Dynamic Camera Motion Presets, Viral SFX Pack & Cover Frame Export
// ============================================================================

export const MOTION_MATRIX_STRATEGIES: { id: MotionMatrixStrategy; label: string }[] = [
  { id: 'none', label: '固定原画' },
  { id: 'smart_alternating', label: '智能交替运镜' },
  { id: 'images_only', label: '仅静图运镜' },
];

export const MOTION_PRESET_LABELS: Record<
  MotionPresetId,
  { label: string; badge: string; desc: string }
> = {
  none: {
    label: '无运镜 (固定原画)',
    badge: '默认',
    desc: '保持原始固定画面构图，不叠加动态推拉位移',
  },
  hook_punch: {
    label: '🔥 冲击放大 (前3秒钩子)',
    badge: '爆款开头',
    desc: '开场 0.35s 凌厉急缩定焦再微推，瞬间抓住用户滑动视线',
  },
  zoom_in: {
    label: '🔍 缓慢推进特写',
    badge: '突出细节',
    desc: '从 100% 平滑推进至 116%，适合产品材质细节与核心卖点展示',
  },
  zoom_out: {
    label: '🖼️ 平滑拉远全景',
    badge: '空间全貌',
    desc: '从 116% 平滑拉远回到 100%，适合门店全景、礼盒全貌与结局揭晓',
  },
  pan_right: {
    label: '➡️ 水平向右巡航',
    badge: '拯救静图',
    desc: '微放大后从左向右丝滑平移，让静态商品图秒变实拍滑轨感',
  },
  pan_left: {
    label: '⬅️ 水平向左巡航',
    badge: '滑轨质感',
    desc: '微放大后从右向左丝滑平移，适合与上一镜头形成错落节奏',
  },
  tilt_up: {
    label: '⬆️ 纵向全身巡礼',
    badge: '穿搭/瓶身',
    desc: '自下而上平滑巡览，极适合护肤瓶身、全身穿搭与菜品特写',
  },
};

export function assignSmartMotionToClips(
  clips: TimelineClip[],
  assetMap: Map<string, MediaAsset>,
  strategy: MotionMatrixStrategy = 'smart_alternating',
  variantSeed = 0
): void {
  const cycle: MotionPresetId[] = [
    'zoom_in',
    'pan_right',
    'zoom_out',
    'pan_left',
    'tilt_up',
  ];
  for (let i = 0; i < clips.length; i++) {
    const clip = clips[i];
    const asset = assetMap.get(clip.assetId);
    if (strategy === 'none') {
      clip.motion = 'none';
      continue;
    }
    if (strategy === 'images_only') {
      if (asset?.type === 'image') {
        clip.motion = i === 0 ? 'hook_punch' : cycle[(i + variantSeed) % cycle.length];
      } else {
        clip.motion = 'none';
      }
      continue;
    }
    // 'smart_alternating': Shot 0 gets viral hook_punch; subsequent shots alternate smoothly
    if (i === 0) {
      clip.motion = 'hook_punch';
    } else {
      clip.motion = cycle[(i - 1 + variantSeed) % cycle.length];
    }
  }
}

export interface SfxPresetMeta {
  id: Exclude<SfxPresetId, 'none'>;
  name: string;
  badge: string;
  durationSec: number;
  desc: string;
}

export const SFX_PRESETS: Record<Exclude<SfxPresetId, 'none'>, SfxPresetMeta> = {
  whoosh_hook: {
    id: 'whoosh_hook',
    name: '🔥 破风呼啸 (Whoosh)',
    badge: '万能转场',
    durationSec: 0.42,
    desc: '干净利落的空气破风声，适合开场切入与分镜快切转场',
  },
  impact_boom: {
    id: 'impact_boom',
    name: '💥 重低音暴击 (Boom)',
    badge: '前3秒震屏',
    durationSec: 0.62,
    desc: '影院级低频下潜冲击音，放在第0秒痛点钩子瞬间拉满紧张感',
  },
  pop_bubble: {
    id: 'pop_bubble',
    name: '🫧 综艺清脆气泡 (Pop)',
    badge: '种草网感',
    durationSec: 0.2,
    desc: '轻快灵动的啵啵气泡音，适合美妆日百、探店种草镜头切换',
  },
  ding_shine: {
    id: 'ding_shine',
    name: '✨ 卖点高光叮声 (Ding)',
    badge: '卖点强调',
    durationSec: 0.65,
    desc: '清澈通透的高频金属泛音，适合核心黑科技或前后对比揭晓',
  },
  cash_register: {
    id: 'cash_register',
    name: '💰 福利收银金币 (Cash)',
    badge: '转化逼单',
    durationSec: 0.54,
    desc: '经典双音清脆金币声，放在结尾“买1送1/立减”促销镜头转化率飙升',
  },
  camera_shutter: {
    id: 'camera_shutter',
    name: '📸 机械单反快门 (Shutter)',
    badge: '定格实测',
    durationSec: 0.24,
    desc: '干脆的快门咔嚓声，适合多角度产品细节连拍卡点',
  },
};

export function createDefaultSfxConfig(): GroupSfxConfig {
  return {
    enabled: false,
    volume: 0.65,
    hookSfxId: 'impact_boom',
    transitionSfxId: 'whoosh_hook',
    ctaSfxId: 'cash_register',
  };
}

export const COVER_EXPORT_MODES: Record<
  CoverExportMode,
  { label: string; badge: string; desc: string }
> = {
  none: {
    label: '仅导出 MP4 成片 (不生成封面图)',
    badge: '默认',
    desc: '仅输出视频文件',
  },
  first_highlight: {
    label: '🖼️ 同步导出高清首帧包装封面 (.jpg)',
    badge: '千川推荐',
    desc: '自动截取开场 0.35s 含上下吸睛花字与角标的高清 JPG 封面，直接配套上传千川/视频号',
  },
  golden_3s: {
    label: '🔥 同步导出黄金第2秒高光封面 (.jpg)',
    badge: '带首句字幕',
    desc: '截取第 1.8s 含花字 + 首句动态口播字幕 + 核心产品画面的高点击封面',
  },
  middle_frame: {
    label: '💎 同步导出成片中段卖点封面 (.jpg)',
    badge: '实测特写',
    desc: '截取成片 50% 处的实测卖点画面与花字包装作为封面图',
  },
};
