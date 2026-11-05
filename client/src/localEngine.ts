import {
  AspectRatio,
  assignSmartMotionToClips,
  buildSyncedSubtitlesFromScript,
  createDefaultSubtitleConfig,
  ExportQuality,
  FULL_CROP,
  generateDedupVariant,
  getClipEffectiveDuration,
  getTargetDimensions,
  MatrixConfig,
  MediaAsset,
  ProjectData,
  RenderBatchJob,
  SceneTag,
  SUBTITLE_STYLES,
  TITLE_STYLES,
  TimelineClip,
  VideoGroup,
} from '@shared/schema';
import { uid } from './utils/format';

const LOCAL_Batches = new Map<string, RenderBatchJob>();
let localProjects: ProjectData[] = [];
let activeLocalProjectId: string | null = null;

function escapeSvgXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function createSvgPosterDataUrl(
  w: number,
  h: number,
  g1: string,
  g2: string,
  accent: string,
  badge: string,
  headline: string,
  subline: string
): string {
  const svg = `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="${g1}"/>
        <stop offset="100%" stop-color="${g2}"/>
      </linearGradient>
    </defs>
    <rect width="${w}" height="${h}" fill="url(#g)"/>
    <circle cx="${w * 0.78}" cy="${h * 0.2}" r="${Math.min(w, h) * 0.22}" fill="${accent}" fill-opacity="0.12"/>
    <circle cx="${w * 0.2}" cy="${h * 0.82}" r="${Math.min(w, h) * 0.26}" fill="#FFFFFF" fill-opacity="0.07"/>
    <rect x="${w * 0.1}" y="${h * 0.26}" width="${w * 0.8}" height="${h * 0.46}" rx="36" fill="#0B0F19" fill-opacity="0.5" stroke="${accent}" stroke-opacity="0.55" stroke-width="3"/>
    <rect x="${w * 0.16}" y="${h * 0.3}" width="${Math.min(w * 0.44, 280)}" height="48" rx="24" fill="${accent}"/>
    <text x="${w * 0.16 + Math.min(w * 0.44, 280) / 2}" y="${h * 0.3 + 33}" font-family="PingFang SC, Microsoft YaHei, sans-serif" font-size="22" font-weight="900" fill="#090D16" text-anchor="middle">${escapeSvgXml(badge)}</text>
    <text x="${w / 2}" y="${h * 0.52}" font-family="PingFang SC, Microsoft YaHei, sans-serif" font-size="${Math.round(Math.min(w, h) * 0.056)}" font-weight="900" fill="#FFFFFF" text-anchor="middle">${escapeSvgXml(headline)}</text>
    <text x="${w / 2}" y="${h * 0.59}" font-family="PingFang SC, Microsoft YaHei, sans-serif" font-size="${Math.round(Math.min(w, h) * 0.031)}" font-weight="600" fill="#E2E8F0" text-anchor="middle">${escapeSvgXml(subline)}</text>
  </svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function createWavBgmBlobUrl(baseFreq: number, seconds = 12): string {
  const sampleRate = 22050;
  const numSamples = sampleRate * seconds;
  const buffer = new ArrayBuffer(44 + numSamples * 2);
  const view = new DataView(buffer);

  const writeStr = (off: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i));
  };

  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + numSamples * 2, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, 'data');
  view.setUint32(40, numSamples * 2, true);

  const notes = [baseFreq, baseFreq * 1.25, baseFreq * 1.5, baseFreq * 1.25];
  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const beatIdx = Math.floor(t * 2) % notes.length;
    const localT = (t * 2) % 1;
    const env = Math.exp(-3.2 * localT);
    const f = notes[beatIdx];
    const sample =
      0.22 * env * Math.sin(2 * Math.PI * f * t) +
      0.1 * env * Math.sin(2 * Math.PI * (f * 0.5) * t);
    const s16 = Math.max(-32767, Math.min(32767, Math.round(sample * 32767)));
    view.setInt16(44 + i * 2, s16, true);
  }

  return URL.createObjectURL(new Blob([buffer], { type: 'audio/wav' }));
}

function makeClip(
  asset: MediaAsset,
  fitMode: TimelineClip['fitMode'] = 'cover',
  transition: TimelineClip['transition'] = 'fade'
): TimelineClip {
  return {
    id: uid(),
    assetId: asset.id,
    trimStart: asset.defaultTrimStart,
    trimEnd: asset.defaultTrimEnd,
    speed: 1.0,
    volume: 1.0,
    muted: false,
    crop: { ...asset.defaultCrop },
    fitMode,
    transition,
  };
}

export function buildLocalDemoProject(): ProjectData {
  const specs: Array<{
    name: string;
    tag: SceneTag;
    dur: number;
    g1: string;
    g2: string;
    acc: string;
    badge: string;
    h1: string;
    h2: string;
    w?: number;
    h?: number;
    fit?: 'cover' | 'blur';
  }> = [
    {
      name: '01_前3秒吸睛_冰块秒碎实拍',
      tag: '吸睛开头',
      dur: 3.4,
      g1: '#06283D',
      g2: '#1363DF',
      acc: '#00F5D4',
      badge: 'HOOK · 黄金前3秒',
      h1: '硬核碎冰 · 4秒出汁',
      h2: '22000转暴风动力 · 细腻无渣免过滤',
    },
    {
      name: '02_前3秒吸睛_早八通勤痛点',
      tag: '吸睛开头',
      dur: 3.2,
      g1: '#2C1654',
      g2: '#7B2CBF',
      acc: '#FFB703',
      badge: 'HOOK · 痛点切入',
      h1: '早八赶时间？随手鲜榨',
      h2: '350g超轻随行杯 · 放进包包说走就走',
    },
    {
      name: '03_场景展示_桌面鲜果活力站',
      tag: '痛点场景',
      dur: 3.5,
      g1: '#0B392A',
      g2: '#1B7F5C',
      acc: '#A7F3D0',
      badge: 'SCENE · 使用场景',
      h1: '告别高糖奶茶 · 每天维C自由',
      h2: '食品级母婴Tritan材质 · 冷热双饮安心用',
    },
    {
      name: '04_卖点实测_六叶精钢旋风刀',
      tag: '核心卖点',
      dur: 3.6,
      g1: '#0F172A',
      g2: '#1E3A8A',
      acc: '#38BDF8',
      badge: 'FEATURE · 硬核参数',
      h1: '304六叶立体精钢刀头',
      h2: 'Type-C无线快充 · 满电连榨18杯不断电',
    },
    {
      name: '05_卖点实测_双击自动水洗',
      tag: '核心卖点',
      dur: 3.3,
      g1: '#134E4A',
      g2: '#0E7490',
      acc: '#67E8F9',
      badge: 'FEATURE · 懒人福音',
      h1: '双击开启龙卷风自清洁',
      h2: '无需手洗刀头 · 一冲即净不留果渍异味',
    },
    {
      name: '06_促销转化_工厂直供买1送1',
      tag: '促销CTA',
      dur: 3.4,
      g1: '#7F1D1D',
      g2: '#DC2626',
      acc: '#FDE047',
      badge: 'CTA · 限时福利转化',
      h1: '源头工厂直发 · 立减50%',
      h2: '今日下单送吸管盖+杯刷 · 365天只换不修',
    },
    {
      name: '07_横版三色全家福海报(测试裁切)',
      tag: '产品特写',
      dur: 3.5,
      g1: '#0F2027',
      g2: '#2C5364',
      acc: '#00E5FF',
      badge: '16:9 横版实拍海报',
      h1: '极光随行榨汁杯 · 三色全家福',
      h2: '支持 9:16 毛玻璃背景 & 自由框选裁切',
      w: 1280,
      h: 720,
      fit: 'blur',
    },
  ];

  const visualAssets: MediaAsset[] = specs.map((s) => {
    const w = s.w || 900;
    const h = s.h || 1600;
    const url = createSvgPosterDataUrl(w, h, s.g1, s.g2, s.acc, s.badge, s.h1, s.h2);
    return {
      id: uid(),
      name: s.name,
      type: 'image',
      filename: `${s.name}.svg`,
      url,
      thumbnailUrl: url,
      filmstripUrls: [url, url, url, url],
      duration: s.dur,
      width: w,
      height: h,
      fps: 30,
      hasAudio: false,
      sizeBytes: 98400,
      sceneTag: s.tag,
      defaultTrimStart: 0,
      defaultTrimEnd: s.dur,
      defaultCrop: { ...FULL_CROP },
      defaultFitMode: s.fit || 'cover',
      createdAt: new Date().toISOString(),
    };
  });

  const bgm1: MediaAsset = {
    id: uid(),
    name: 'BGM_01_轻快卡点种草律动',
    type: 'audio',
    filename: 'bgm1.wav',
    url: createWavBgmBlobUrl(261.63, 12),
    duration: 12,
    width: 0,
    height: 0,
    fps: 0,
    hasAudio: true,
    sizeBytes: 529200,
    sceneTag: '未分类',
    defaultTrimStart: 0,
    defaultTrimEnd: 12,
    defaultCrop: { ...FULL_CROP },
    defaultFitMode: 'cover',
    createdAt: new Date().toISOString(),
  };

  const bgm2: MediaAsset = {
    id: uid(),
    name: 'BGM_02_活力电音大促节拍',
    type: 'audio',
    filename: 'bgm2.wav',
    url: createWavBgmBlobUrl(329.63, 12),
    duration: 12,
    width: 0,
    height: 0,
    fps: 0,
    hasAudio: true,
    sizeBytes: 529200,
    sceneTag: '未分类',
    defaultTrimStart: 0,
    defaultTrimEnd: 12,
    defaultCrop: { ...FULL_CROP },
    defaultFitMode: 'cover',
    createdAt: new Date().toISOString(),
  };

  const [cHook1, cHook2, cScene, cBlade, cClean, cCta, wideImg] = visualAssets;

  return {
    id: uid(),
    name: '极光随行榨汁杯 · 信息流批量投流',
    updatedAt: new Date().toISOString(),
    aspectRatio: '9:16',
    exportQuality: '720p',
    exportFps: 30,
    exportCrf: 23,
    filenamePattern: '{project}_{index}_{group}',
    assets: [...visualAssets, bgm1, bgm2],
    videoGroups: [
      {
        id: uid(),
        name: '投流A组-碎冰暴风实测版',
        selectedForExport: true,
        clips: [
          makeClip(cHook1, 'cover', 'fade'),
          makeClip(cBlade, 'cover', 'fade'),
          makeClip(cCta, 'cover', 'none'),
        ],
        overlay: {
          topTitle: '4秒碎冰榨汁！细腻免过滤',
          bottomTitle: '▼ 点击下方链接 抢工厂直发5折',
          styleId: 'douyin_yellow',
          topY: 13,
          bottomY: 86,
          fontScale: 1.0,
        },
        subtitles: {
          enabled: true,
          styleId: 'jianying_white',
          yPercent: 73,
          fontScale: 1.0,
          cues: [
            { id: 'demo_sub_1', startSec: 0.0, endSec: 2.8, text: '还在喝奶茶？试试这款随行碎冰榨汁杯！' },
            { id: 'demo_sub_2', startSec: 2.8, endSec: 5.8, text: '十叶精钢刀头，大块冰粒4秒榨成绵密冰沙' },
            { id: 'demo_sub_3', startSec: 5.8, endSec: 9.2, text: '趁着源头工厂直发半价，赶紧点下方链接入手！' },
          ],
        },
        watermark: {
          enabled: true,
          mode: 'text',
          text: '@极光官方旗舰店 · 原创实拍',
          imageAssetId: null,
          corner: 'top_right',
          offsetX: 4.5,
          offsetY: 3.5,
          scale: 0.95,
          opacity: 0.85,
        },
        bgmAssetId: bgm1.id,
        bgmVolume: 0.4,
        clipMasterVolume: 0.8,
        audioFadeOut: true,
      },
      {
        id: uid(),
        name: '投流B组-早八通勤种草版',
        selectedForExport: true,
        clips: [
          makeClip(cHook2, 'cover', 'wipeleft'),
          makeClip(cScene, 'cover', 'fade'),
          makeClip(wideImg, 'blur', 'fade'),
          makeClip(cCta, 'cover', 'none'),
        ],
        overlay: {
          topTitle: '早八人续命神器！每天维C自由',
          bottomTitle: '★ 今日下单送吸管杯盖+运费险',
          styleId: 'promo_red',
          topY: 13,
          bottomY: 84,
          fontScale: 1.0,
        },
        bgmAssetId: bgm2.id,
        bgmVolume: 0.42,
        clipMasterVolume: 0.8,
        audioFadeOut: true,
      },
      {
        id: uid(),
        name: '投流C组-免手洗懒人痛点版',
        selectedForExport: true,
        clips: [
          makeClip(cHook1, 'cover', 'fade'),
          makeClip(cClean, 'cover', 'smoothup'),
          makeClip(cCta, 'cover', 'none'),
        ],
        overlay: {
          topTitle: '双击自动清洗！懒人必入榨汁杯',
          bottomTitle: '✦ 满电连榨18杯 365天只换不修',
          styleId: 'cyber_cyan',
          topY: 13,
          bottomY: 84,
          fontScale: 1.0,
        },
        bgmAssetId: bgm1.id,
        bgmVolume: 0.38,
        clipMasterVolume: 0.8,
        audioFadeOut: true,
      },
    ],
    matrix: {
      slots: [
        { id: uid(), name: '🔥 前3秒吸睛开头组', badgeColor: '#FF4D4F', assetIds: [cHook1.id, cHook2.id] },
        { id: uid(), name: '💡 痛点/产品颜值组', badgeColor: '#FFB800', assetIds: [cScene.id, wideImg.id] },
        { id: uid(), name: '💎 核心卖点实测组', badgeColor: '#00E5FF', assetIds: [cBlade.id, cClean.id] },
        { id: uid(), name: '🎯 促销转化CTA组', badgeColor: '#A855F7', assetIds: [cCta.id] },
      ],
      topTitlePool: [
        '4秒碎冰榨汁！细腻无渣免过滤',
        '早八打工人必入！随手实现果蔬自由',
        '双击龙卷风自清洁！懒人福音太省心',
        '源头工厂直供价！立省一半预算',
      ],
      bottomTitlePool: [
        '▼ 点击下方小黄车 限时买1送1',
        '★ 前100名下单立享半价+运费险',
        '✦ 365天只换不修 闭眼入不踩雷',
      ],
      styleId: 'douyin_yellow',
      bgmPoolAssetIds: [bgm1.id, bgm2.id],
      defaultTransition: 'fade',
      defaultFitMode: 'blur',
      strategy: 'balanced_limit',
      targetCount: 6,
      appendMode: 'append',
    },
  };
}

export function getLocalBootstrap() {
  if (localProjects.length === 0) {
    const demo = buildLocalDemoProject();
    localProjects = [demo];
    activeLocalProjectId = demo.id;
  }
  const active =
    localProjects.find((p) => p.id === activeLocalProjectId) || localProjects[0];
  return {
    project: structuredClone(active),
    projects: listLocalProjectSummaries(),
    recentBatches: Array.from(LOCAL_Batches.values()),
  };
}

export function listLocalProjectSummaries() {
  return localProjects.map((p) => ({
    id: p.id,
    name: p.name,
    updatedAt: p.updatedAt,
    groupCount: p.videoGroups.length,
    assetCount: p.assets.length,
  }));
}

export function saveLocalProject(proj: ProjectData): ProjectData {
  proj.updatedAt = new Date().toISOString();
  const idx = localProjects.findIndex((p) => p.id === proj.id);
  if (idx >= 0) localProjects[idx] = structuredClone(proj);
  else localProjects.unshift(structuredClone(proj));
  activeLocalProjectId = proj.id;
  return proj;
}

export function createLocalBlankProject(name: string): ProjectData {
  const proj: ProjectData = {
    id: uid(),
    name,
    updatedAt: new Date().toISOString(),
    aspectRatio: '9:16',
    exportQuality: '1080p',
    exportFps: 30,
    exportCrf: 23,
    filenamePattern: '{project}_{index}_{group}',
    assets: [],
    videoGroups: [
      {
        id: uid(),
        name: '信息流成片 #01',
        selectedForExport: true,
        clips: [],
        overlay: {
          topTitle: '',
          bottomTitle: '',
          styleId: 'douyin_yellow',
          topY: 13,
          bottomY: 83,
          fontScale: 1.0,
        },
        bgmAssetId: null,
        bgmVolume: 0.35,
        clipMasterVolume: 1.0,
        audioFadeOut: true,
      },
    ],
    matrix: {
      slots: [
        { id: uid(), name: '🔥 前3秒吸睛开头组', badgeColor: '#FF4D4F', assetIds: [] },
        { id: uid(), name: '💡 痛点/场景引入组', badgeColor: '#FFB800', assetIds: [] },
        { id: uid(), name: '💎 核心卖点实测组', badgeColor: '#00E5FF', assetIds: [] },
        { id: uid(), name: '🎯 促销福利CTA组', badgeColor: '#A855F7', assetIds: [] },
      ],
      topTitlePool: ['源头工厂直发！实测太惊艳了', '同品类天花板！细节拉满'],
      bottomTitlePool: ['▼ 点击下方链接 抢限时福利'],
      styleId: 'douyin_yellow',
      bgmPoolAssetIds: [],
      defaultTransition: 'fade',
      defaultFitMode: 'cover',
      strategy: 'balanced_limit',
      targetCount: 6,
      appendMode: 'append',
    },
  };
  saveLocalProject(proj);
  return proj;
}

export function loadLocalProjectById(id: string): ProjectData {
  const found = localProjects.find((p) => p.id === id) || localProjects[0];
  activeLocalProjectId = found.id;
  return structuredClone(found);
}

export function deleteLocalProjectById(
  targetId: string,
  currentActiveId?: string
): {
  project: ProjectData;
  projects: Array<{
    id: string;
    name: string;
    updatedAt: string;
    groupCount: number;
    assetCount: number;
  }>;
  switchedActive: boolean;
  deletedName: string;
} {
  const target = localProjects.find((p) => p.id === targetId);
  const deletedName = target?.name || '未命名工程';
  localProjects = localProjects.filter((p) => p.id !== targetId);

  if (currentActiveId && currentActiveId !== targetId) {
    const stillActive = localProjects.find((p) => p.id === currentActiveId);
    if (stillActive) {
      activeLocalProjectId = stillActive.id;
      return {
        project: structuredClone(stillActive),
        projects: listLocalProjectSummaries(),
        switchedActive: false,
        deletedName,
      };
    }
  }

  if (localProjects.length > 0) {
    const next = localProjects[0];
    activeLocalProjectId = next.id;
    return {
      project: structuredClone(next),
      projects: listLocalProjectSummaries(),
      switchedActive: true,
      deletedName,
    };
  }

  const fresh = createLocalBlankProject('新建信息流生产项目');
  return {
    project: fresh,
    projects: listLocalProjectSummaries(),
    switchedActive: true,
    deletedName,
  };
}

/**
 * Browser-side probing & filmstrip extraction for user-imported local files!
 */
export async function probeBrowserFile(file: File, tag: SceneTag): Promise<MediaAsset> {
  const blobUrl = URL.createObjectURL(file);
  const ext = file.name.split('.').pop()?.toLowerCase() || '';
  const baseName = file.name.replace(/\.[^.]+$/, '');

  if (file.type.startsWith('audio/') || ['mp3', 'wav', 'm4a', 'aac', 'ogg'].includes(ext)) {
    const dur = await new Promise<number>((resolve) => {
      const a = document.createElement('audio');
      a.preload = 'metadata';
      a.onloadedmetadata = () => resolve(Number.isFinite(a.duration) ? a.duration : 10);
      a.onerror = () => resolve(10);
      a.src = blobUrl;
    });
    return {
      id: uid(),
      name: baseName,
      type: 'audio',
      filename: file.name,
      url: blobUrl,
      duration: Math.round(dur * 100) / 100,
      width: 0,
      height: 0,
      fps: 0,
      hasAudio: true,
      sizeBytes: file.size,
      sceneTag: tag,
      defaultTrimStart: 0,
      defaultTrimEnd: Math.round(dur * 100) / 100,
      defaultCrop: { ...FULL_CROP },
      defaultFitMode: 'cover',
      createdAt: new Date().toISOString(),
    };
  }

  if (file.type.startsWith('image/') || ['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(ext)) {
    const dims = await new Promise<{ w: number; h: number }>((resolve) => {
      const img = new Image();
      img.onload = () => resolve({ w: img.naturalWidth || 1080, h: img.naturalHeight || 1920 });
      img.onerror = () => resolve({ w: 1080, h: 1920 });
      img.src = blobUrl;
    });
    return {
      id: uid(),
      name: baseName,
      type: 'image',
      filename: file.name,
      url: blobUrl,
      thumbnailUrl: blobUrl,
      filmstripUrls: [blobUrl, blobUrl, blobUrl, blobUrl],
      duration: 3.5,
      width: dims.w,
      height: dims.h,
      fps: 30,
      hasAudio: false,
      sizeBytes: file.size,
      sceneTag: tag,
      defaultTrimStart: 0,
      defaultTrimEnd: 3.5,
      defaultCrop: { ...FULL_CROP },
      defaultFitMode: dims.w > dims.h ? 'blur' : 'cover',
      createdAt: new Date().toISOString(),
    };
  }

  // Video file: probe metadata + capture 4 filmstrip thumbnails on <canvas>
  const vidMeta = await new Promise<{
    dur: number;
    w: number;
    h: number;
    strips: string[];
  }>((resolve) => {
    const v = document.createElement('video');
    v.preload = 'auto';
    v.muted = true;
    v.playsInline = true;
    v.src = blobUrl;

    v.onloadeddata = async () => {
      const dur = Number.isFinite(v.duration) && v.duration > 0 ? v.duration : 5.0;
      const w = v.videoWidth || 1080;
      const h = v.videoHeight || 1920;
      const strips: string[] = [];

      const c = document.createElement('canvas');
      const cw = 200;
      const ch = Math.max(112, Math.round((cw * h) / w));
      c.width = cw;
      c.height = ch;
      const ctx = c.getContext('2d');

      for (let i = 0; i < 4; i++) {
        const t = Math.min(dur - 0.05, (dur * (i + 0.4)) / 4);
        await new Promise<void>((r) => {
          const onSeeked = () => {
            v.removeEventListener('seeked', onSeeked);
            if (ctx) {
              ctx.drawImage(v, 0, 0, cw, ch);
              strips.push(c.toDataURL('image/jpeg', 0.72));
            }
            r();
          };
          v.addEventListener('seeked', onSeeked);
          v.currentTime = Math.max(0, t);
          setTimeout(r, 350);
        });
      }
      resolve({ dur, w, h, strips });
    };
    v.onerror = () => resolve({ dur: 5, w: 1080, h: 1920, strips: [] });
  });

  return {
    id: uid(),
    name: baseName,
    type: 'video',
    filename: file.name,
    url: blobUrl,
    thumbnailUrl: vidMeta.strips[0],
    filmstripUrls: vidMeta.strips,
    duration: Math.round(vidMeta.dur * 100) / 100,
    width: vidMeta.w,
    height: vidMeta.h,
    fps: 30,
    hasAudio: true,
    sizeBytes: file.size,
    sceneTag: tag,
    defaultTrimStart: 0,
    defaultTrimEnd: Math.round(vidMeta.dur * 100) / 100,
    defaultCrop: { ...FULL_CROP },
    defaultFitMode: vidMeta.w > vidMeta.h ? 'blur' : 'cover',
    createdAt: new Date().toISOString(),
  };
}

export function generateMatrixGroupsLocal(
  project: ProjectData,
  overrideMatrix?: MatrixConfig
) {
  const matrix = overrideMatrix || project.matrix;
  const assetMap = new Map(project.assets.map((a) => [a.id, a]));
  const activeSlots = matrix.slots
    .map((s) => ({
      ...s,
      validAssetIds: s.assetIds.filter((id) => {
        const a = assetMap.get(id);
        return a && a.type !== 'audio';
      }),
    }))
    .filter((s) => s.validAssetIds.length > 0);

  if (activeSlots.length === 0) {
    return { project, generatedCount: 0, totalPossible: 0 };
  }

  const totalPossible = activeSlots.reduce((acc, s) => acc * s.validAssetIds.length, 1);
  const allCombos: string[][] = [];

  function backtrack(idx: number, cur: string[]) {
    if (allCombos.length >= 200) return;
    if (idx === activeSlots.length) {
      allCombos.push([...cur]);
      return;
    }
    for (const aid of activeSlots[idx].validAssetIds) {
      cur.push(aid);
      backtrack(idx + 1, cur);
      cur.pop();
    }
  }
  backtrack(0, []);

  let selected: string[][] = [];
  if (matrix.strategy === 'all_cartesian') {
    selected = allCombos.slice(0, 60);
  } else {
    const target = Math.max(1, Math.min(60, matrix.targetCount || 6));
    if (allCombos.length <= target) {
      selected = [...allCombos];
      while (selected.length < target && allCombos.length > 0) {
        selected.push(allCombos[selected.length % allCombos.length]);
      }
    } else {
      const step = allCombos.length / target;
      const used = new Set<number>();
      for (let i = 0; i < target; i++) {
        let idx = Math.floor(i * step) % allCombos.length;
        while (used.has(idx)) idx = (idx + 1) % allCombos.length;
        used.add(idx);
        selected.push(allCombos[idx]);
      }
    }
  }

  const validBgms = matrix.bgmPoolAssetIds.filter((id) => assetMap.get(id)?.type === 'audio');
  const fallbackAudio = project.assets
    .filter((a) => a.type === 'audio' && a.audioRole !== 'voiceover')
    .map((a) => a.id);
  const bgms = validBgms.length > 0 ? validBgms : fallbackAudio;
  const voPool = (matrix.voiceoverPoolAssetIds || []).filter(
    (id) => assetMap.get(id)?.type === 'audio'
  );
  const templateWatermark = project.videoGroups.find((g) => g.watermark?.enabled)?.watermark;
  const templatePip = project.videoGroups.find((g) => {
    const asset = g.pip?.assetId ? assetMap.get(g.pip.assetId) : undefined;
    return g.pip?.enabled && (asset?.type === 'image' || asset?.type === 'video');
  })?.pip;
  const topPool = matrix.topTitlePool.map((t) => t.trim()).filter(Boolean);
  const bottomPool = matrix.bottomTitlePool.map((t) => t.trim()).filter(Boolean);
  const startIdx = matrix.appendMode === 'replace' ? 1 : project.videoGroups.length + 1;

  const newGroups: VideoGroup[] = selected.map((combo, idx) => {
    const seq = String(startIdx + idx).padStart(2, '0');
    const first = assetMap.get(combo[0]);
    const chosenVoId = voPool.length > 0 ? voPool[idx % voPool.length] : null;
    const chosenVoAsset = chosenVoId ? assetMap.get(chosenVoId) : null;
    const autoSubtitles =
      matrix.autoSyncSubtitles !== false && chosenVoAsset?.ttsSourceText
        ? {
            ...createDefaultSubtitleConfig(),
            enabled: true,
            cues: buildSyncedSubtitlesFromScript(
              chosenVoAsset.ttsSourceText,
              chosenVoAsset.duration,
              0
            ),
          }
        : undefined;

    const clips: TimelineClip[] = combo.map((aid, cIdx) =>
      makeClip(
        assetMap.get(aid)!,
        matrix.defaultFitMode,
        cIdx === combo.length - 1 ? 'none' : matrix.defaultTransition
      )
    );
    if (matrix.defaultMotionStrategy && matrix.defaultMotionStrategy !== 'none') {
      assignSmartMotionToClips(clips, assetMap, matrix.defaultMotionStrategy, idx);
    }
    return {
      id: uid(),
      name: `矩阵成片 #${seq} (${first ? first.name.slice(0, 8) : '混剪'})`,
      selectedForExport: true,
      clips,
      overlay: {
        topTitle: topPool.length ? topPool[idx % topPool.length] : '',
        bottomTitle: bottomPool.length ? bottomPool[idx % bottomPool.length] : '',
        styleId: matrix.styleId || 'douyin_yellow',
        topY: 13,
        bottomY: 83,
        fontScale: 1.0,
      },
      subtitles: autoSubtitles,
      watermark: templateWatermark ? structuredClone(templateWatermark) : undefined,
      pip: templatePip ? structuredClone(templatePip) : undefined,
      dedup: matrix.autoDedup
        ? generateDedupVariant(
            idx,
            matrix.protectPackagingText === false,
            matrix.dedupPreset || 'standard'
          )
        : undefined,
      bgmAssetId: bgms.length ? bgms[idx % bgms.length] : null,
      bgmVolume: chosenVoId ? 0.25 : 0.35,
      bgmDucking: Boolean(chosenVoId),
      voiceoverAssetId: chosenVoId,
      voiceoverVolume: 1.15,
      clipMasterVolume: chosenVoId ? 0.45 : 1.0,
      audioFadeOut: true,
    };
  });

  const nextProj = structuredClone(project);
  nextProj.matrix = matrix;
  nextProj.videoGroups =
    matrix.appendMode === 'replace' ? newGroups : [...nextProj.videoGroups, ...newGroups];
  saveLocalProject(nextProj);
  return { project: nextProj, generatedCount: newGroups.length, totalPossible };
}

/**
 * Browser Canvas + MediaRecorder synthesizer for zero-install standalone .html preview!
 */
export function startLocalBatchRender(
  project: ProjectData,
  opts: {
    groupIds?: string[];
    aspectRatio?: AspectRatio;
    quality?: ExportQuality;
    fps?: 30 | 60;
    filenamePattern?: string;
  }
): RenderBatchJob {
  const aspectRatio = opts.aspectRatio || project.aspectRatio || '9:16';
  const quality = opts.quality || '720p';
  const fps = opts.fps || 30;
  const pattern = opts.filenamePattern || '{project}_{index}_{group}';

  const targetGroups = project.videoGroups.filter((g) => {
    if (!g.clips.length) return false;
    if (opts.groupIds?.length) return opts.groupIds.includes(g.id);
    return g.selectedForExport;
  });

  const mimeCandidates = [
    'video/mp4;codecs=avc1',
    'video/webm;codecs=vp9',
    'video/webm;codecs=vp8',
    'video/webm',
  ];
  const chosenMime =
    mimeCandidates.find(
      (m) => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(m)
    ) || 'video/webm';
  const ext = chosenMime.includes('mp4') ? 'mp4' : 'webm';

  const batchId = uid();
  const batch: RenderBatchJob = {
    batchId,
    projectId: project.id,
    projectName: project.name,
    aspectRatio,
    quality,
    fps,
    createdAt: new Date().toISOString(),
    status: targetGroups.length ? 'running' : 'completed',
    items: targetGroups.map((g, i) => {
      const seq = String(i + 1).padStart(2, '0');
      const fname = pattern
        .replace('{project}', project.name)
        .replace('{index}', seq)
        .replace('{group}', g.name)
        .replace(/[<>:"/\\|?*]/g, '_');
      return {
        jobItemId: uid(),
        groupId: g.id,
        groupName: g.name,
        outputFilename: `${fname}.${ext}`,
        status: 'queued',
        progress: 0,
      };
    }),
  };

  LOCAL_Batches.set(batchId, batch);
  const assetMap = new Map(project.assets.map((a) => [a.id, a]));

  void (async () => {
    for (let idx = 0; idx < batch.items.length; idx++) {
      if ((batch.status as string) === 'cancelled') break;
      const item = batch.items[idx];
      const group = targetGroups[idx];
      try {
        await synthesizeGroupOnCanvas(batch, item, group, assetMap, chosenMime);
      } catch (err: any) {
        item.status = 'error';
        item.error = err?.message || '浏览器录制合成异常';
      }
    }
    if ((batch.status as string) !== 'cancelled') {
      batch.status = batch.items.some((i) => i.status === 'error')
        ? 'partial_error'
        : 'completed';
    }
  })();

  return batch;
}

async function synthesizeGroupOnCanvas(
  batch: RenderBatchJob,
  item: RenderBatchJob['items'][0],
  group: VideoGroup,
  assetMap: Map<string, MediaAsset>,
  mimeType: string
) {
  item.status = 'rendering';
  item.progress = 5;

  const { width: fullW, height: fullH } = getTargetDimensions(batch.aspectRatio, '720p');
  const canvas = document.createElement('canvas');
  canvas.width = fullW;
  canvas.height = fullH;
  const ctx = canvas.getContext('2d')!;

  const stream = canvas.captureStream(30);
  const chunks: BlobPart[] = [];
  const recorder = new MediaRecorder(stream, {
    mimeType,
    videoBitsPerSecond: 4_500_000,
  });

  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };

  const stopPromise = new Promise<Blob>((resolve) => {
    recorder.onstop = () => resolve(new Blob(chunks, { type: mimeType }));
  });

  recorder.start(100);

  const validClips = group.clips
    .map((clip) => {
      const asset = assetMap.get(clip.assetId);
      if (!asset || asset.type === 'audio') return null;
      return { clip, asset, effDur: getClipEffectiveDuration(clip) };
    })
    .filter((x): x is NonNullable<typeof x> => Boolean(x));

  const totalDur = validClips.reduce((s, x) => s + x.effDur, 0);
  let elapsedGlobal = 0;

  for (const entry of validClips) {
    if ((batch.status as string) === 'cancelled') break;
    const { clip, asset, effDur } = entry;

    let mediaEl: HTMLImageElement | HTMLVideoElement;
    if (asset.type === 'image') {
      mediaEl = await new Promise<HTMLImageElement>((res, rej) => {
        const img = new Image();
        img.onload = () => res(img);
        img.onerror = rej;
        img.src = asset.url;
      });
    } else {
      mediaEl = await new Promise<HTMLVideoElement>((res, rej) => {
        const v = document.createElement('video');
        v.muted = true;
        v.playsInline = true;
        v.src = asset.url;
        v.onloadeddata = () => {
          v.playbackRate = clip.speed || 1;
          v.currentTime = clip.trimStart || 0;
          v.play().catch(() => {});
          res(v);
        };
        v.onerror = rej;
      });
    }

    const startTs = performance.now();
    // Accelerated preview synthesis (up to 2x realtime for images so export feels snappy)
    const timeFactor = asset.type === 'image' ? 2.0 : 1.0;
    const wallDurMs = (effDur / timeFactor) * 1000;

    while (performance.now() - startTs < wallDurMs) {
      if ((batch.status as string) === 'cancelled') break;
      const frac = Math.min(1, (performance.now() - startTs) / wallDurMs);
      const curGlobal = elapsedGlobal + frac * effDur;
      drawFrameToCanvas(ctx, fullW, fullH, mediaEl, asset, clip, group, curGlobal);
      item.progress = Math.min(97, Math.round((curGlobal / Math.max(0.5, totalDur)) * 96));
      await new Promise((r) => setTimeout(r, 33));
    }

    if (mediaEl instanceof HTMLVideoElement) {
      mediaEl.pause();
    }
    elapsedGlobal += effDur;
  }

  recorder.stop();
  const outBlob = await stopPromise;
  item.status = 'done';
  item.progress = 100;
  item.outputUrl = URL.createObjectURL(outBlob);
  item.fileSizeBytes = outBlob.size;
  item.durationSec = Math.round(totalDur * 10) / 10;
}

function drawFrameToCanvas(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  media: HTMLImageElement | HTMLVideoElement,
  asset: MediaAsset,
  clip: TimelineClip,
  group: VideoGroup,
  currentSec = 0
) {
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, W, H);

  const srcW = asset.width || 1080;
  const srcH = asset.height || 1920;
  const sx = srcW * (clip.crop?.x || 0);
  const sy = srcH * (clip.crop?.y || 0);
  const sw = srcW * (clip.crop?.w || 1);
  const sh = srcH * (clip.crop?.h || 1);

  const dedup = group.dedup;
  ctx.save();
  if (dedup?.enabled) {
    const zoom = 1 + Math.max(0, dedup.zoomPunchPct || 0) / 100;
    const flipX = dedup.mirrorFlip ? -zoom : zoom;
    ctx.translate(W / 2, H / 2);
    ctx.scale(flipX, zoom);
    ctx.translate(-W / 2, -H / 2);
    const b = 1 + (dedup.brightness || 0);
    const c = dedup.contrast ?? 1;
    const s = dedup.saturation ?? 1;
    ctx.filter = `brightness(${b}) contrast(${c}) saturate(${s})`;
  }

  if (clip.fitMode === 'blur') {
    ctx.save();
    ctx.filter = 'blur(22px) brightness(0.75)';
    const bgScale = Math.max(W / sw, H / sh) * 1.1;
    const bw = sw * bgScale;
    const bh = sh * bgScale;
    ctx.drawImage(media, sx, sy, sw, sh, (W - bw) / 2, (H - bh) / 2, bw, bh);
    ctx.restore();
  }

  const scale =
    clip.fitMode === 'cover' ? Math.max(W / sw, H / sh) : Math.min(W / sw, H / sh);
  const dw = sw * scale;
  const dh = sh * scale;
  ctx.drawImage(media, sx, sy, sw, sh, (W - dw) / 2, (H - dh) / 2, dw, dh);
  ctx.restore();

  // Draw Brand Corner Watermark (never mirrored)
  if (group.watermark?.enabled && group.watermark.mode === 'text' && group.watermark.text?.trim()) {
    const wm = group.watermark;
    const fSize = Math.max(14, Math.round(Math.min(W, H) * 0.028 * (wm.scale || 1)));
    ctx.save();
    ctx.globalAlpha = Math.max(0.1, Math.min(1, wm.opacity ?? 0.82));
    ctx.font = `800 ${fSize}px "PingFang SC", "Microsoft YaHei", sans-serif`;
    const m = ctx.measureText(wm.text.trim());
    const padX = Math.round(fSize * 0.65);
    const bw = m.width + padX * 2;
    const bh = Math.round(fSize * 1.65);
    const mx = ((wm.offsetX ?? 4.5) / 100) * W;
    const my = ((wm.offsetY ?? 4.0) / 100) * H;
    const bx = wm.corner.endsWith('right') ? W - mx - bw : mx;
    const by = wm.corner.startsWith('bottom') ? H - my - bh : my;
    ctx.fillStyle = 'rgba(12,14,22,0.52)';
    ctx.beginPath();
    ctx.roundRect(bx, by, bw, bh, bh / 2);
    ctx.fill();
    ctx.fillStyle = '#FFFFFF';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(wm.text.trim(), bx + bw / 2, by + bh / 2);
    ctx.restore();
  }

  // Draw Active Synced Subtitle Cue
  if (group.subtitles?.enabled && group.subtitles.cues?.length) {
    const activeCue = group.subtitles.cues.find(
      (c) => currentSec >= c.startSec && currentSec <= c.endSec && c.text.trim()
    );
    if (activeCue) {
      const subSt =
        SUBTITLE_STYLES[group.subtitles.styleId] || SUBTITLE_STYLES.jianying_white;
      const fSize = Math.round(
        Math.min(W, H) * 0.045 * (group.subtitles.fontScale || 1)
      );
      const cy = (H * (group.subtitles.yPercent || 74)) / 100;
      ctx.save();
      ctx.font = `900 ${fSize}px "PingFang SC", "Microsoft YaHei", sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const txt = activeCue.text.trim();
      const m = ctx.measureText(txt);
      const bw = Math.min(W * 0.92, m.width + fSize * 1.1);
      const bh = fSize * 1.55;
      if (subSt.bgColor) {
        ctx.fillStyle = subSt.bgColor;
        ctx.beginPath();
        ctx.roundRect((W - bw) / 2, cy - bh / 2, bw, bh, bh * 0.28);
        ctx.fill();
      }
      if (subSt.strokeWidth > 0) {
        ctx.strokeStyle = subSt.strokeColor;
        ctx.lineWidth = Math.max(3, Math.round(fSize * 0.13));
        ctx.lineJoin = 'round';
        ctx.strokeText(txt, W / 2, cy);
      }
      ctx.fillStyle = subSt.textColor;
      ctx.fillText(txt, W / 2, cy);
      ctx.restore();
    }
  }

  // Draw Fancy Titles
  const st = TITLE_STYLES[group.overlay.styleId] || TITLE_STYLES.douyin_yellow;
  const drawBanner = (raw: string, yPct: number, fRatio: number) => {
    const txt = raw.trim();
    if (!txt) return;
    const fontSize = Math.round(Math.min(W, H) * fRatio * (group.overlay.fontScale || 1));
    ctx.save();
    ctx.font = `900 ${fontSize}px "PingFang SC", "Microsoft YaHei", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const cy = (H * yPct) / 100;
    const metrics = ctx.measureText(txt);
    const bw = Math.min(W * 0.9, metrics.width + fontSize * 1.4);
    const bh = fontSize * 1.75;

    if (st.bgColor) {
      ctx.fillStyle = st.bgColor;
      ctx.beginPath();
      ctx.roundRect((W - bw) / 2, cy - bh / 2, bw, bh, bh / 2);
      ctx.fill();
    }
    if (st.strokeWidth > 0) {
      ctx.strokeStyle = st.strokeColor;
      ctx.lineWidth = Math.max(3, Math.round(fontSize * 0.12));
      ctx.lineJoin = 'round';
      ctx.strokeText(txt, W / 2, cy);
    }
    ctx.fillStyle = st.textColor;
    ctx.fillText(txt, W / 2, cy);
    ctx.restore();
  };

  if (group.overlay.topTitle) drawBanner(group.overlay.topTitle, group.overlay.topY || 13, 0.056);
  if (group.overlay.bottomTitle)
    drawBanner(group.overlay.bottomTitle, group.overlay.bottomY || 84, 0.044);
}

export function getLocalBatchStatus(batchId: string): RenderBatchJob | undefined {
  return LOCAL_Batches.get(batchId);
}

export function cancelLocalBatch(batchId: string): RenderBatchJob | undefined {
  const b = LOCAL_Batches.get(batchId);
  if (b) b.status = 'cancelled';
  return b;
}

