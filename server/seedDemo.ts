import path from 'path';
import fs from 'fs';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { createRequire } from 'module';
import { v4 as uuidv4 } from 'uuid';
import { ensureStorageDirs, FFMPEG_BIN, TEMP_DIR, UPLOADS_DIR } from './paths.js';
import { probeAndProcessFile } from './mediaService.js';
import { makeClipFromAsset, saveProject } from './projectStore.js';
import { MediaAsset, ProjectData, SceneTag } from '../shared/schema.js';

const execFileAsync = promisify(execFile);
const customRequire =
  typeof require !== 'undefined' ? require : createRequire(import.meta.url);

function tryLoadSharp(): any | null {
  try {
    const m = customRequire('sharp');
    return m.default || m;
  } catch {
    return null;
  }
}

interface DemoClipSpec {
  filename: string;
  displayName: string;
  tag: SceneTag;
  duration: number;
  gradStart: string;
  gradEnd: string;
  accent: string;
  badge: string;
  headline: string;
  subline: string;
  freq: number;
  zoomDir: 'in' | 'out';
}

const DEMO_SPECS: DemoClipSpec[] = [
  {
    filename: 'demo_hook_ice.mp4',
    displayName: '01_前3秒吸睛_冰块秒碎实拍',
    tag: '吸睛开头',
    duration: 3.4,
    gradStart: '#06283D',
    gradEnd: '#1363DF',
    accent: '#00F5D4',
    badge: 'HOOK · 黄金前3秒',
    headline: '硬核碎冰 · 4秒出汁',
    subline: '22000转暴风动力 · 细腻无渣免过滤',
    freq: 330,
    zoomDir: 'in',
  },
  {
    filename: 'demo_hook_office.mp4',
    displayName: '02_前3秒吸睛_早八通勤痛点',
    tag: '吸睛开头',
    duration: 3.2,
    gradStart: '#2C1654',
    gradEnd: '#7B2CBF',
    accent: '#FFB703',
    badge: 'HOOK · 痛点切入',
    headline: '早八赶时间？随手鲜榨',
    subline: '350g超轻随行杯 · 放进包包说走就走',
    freq: 392,
    zoomDir: 'out',
  },
  {
    filename: 'demo_scene_fresh.mp4',
    displayName: '03_场景展示_桌面鲜果活力站',
    tag: '痛点场景',
    duration: 3.5,
    gradStart: '#0B392A',
    gradEnd: '#1B7F5C',
    accent: '#A7F3D0',
    badge: 'SCENE · 使用场景',
    headline: '告别高糖奶茶 · 每天维C自由',
    subline: '食品级母婴Tritan材质 · 冷热双饮安心用',
    freq: 440,
    zoomDir: 'in',
  },
  {
    filename: 'demo_feature_blade.mp4',
    displayName: '04_卖点实测_六叶精钢旋风刀',
    tag: '核心卖点',
    duration: 3.6,
    gradStart: '#0F172A',
    gradEnd: '#1E3A8A',
    accent: '#38BDF8',
    badge: 'FEATURE · 硬核参数',
    headline: '304六叶立体精钢刀头',
    subline: 'Type-C无线快充 · 满电连榨18杯不断电',
    freq: 494,
    zoomDir: 'out',
  },
  {
    filename: 'demo_feature_clean.mp4',
    displayName: '05_卖点实测_双击自动水洗',
    tag: '核心卖点',
    duration: 3.3,
    gradStart: '#134E4A',
    gradEnd: '#0E7490',
    accent: '#67E8F9',
    badge: 'FEATURE · 懒人福音',
    headline: '双击开启龙卷风自清洁',
    subline: '无需手洗刀头 · 一冲即净不留果渍异味',
    freq: 523,
    zoomDir: 'in',
  },
  {
    filename: 'demo_cta_promo.mp4',
    displayName: '06_促销转化_工厂直供买1送1',
    tag: '促销CTA',
    duration: 3.4,
    gradStart: '#7F1D1D',
    gradEnd: '#DC2626',
    accent: '#FDE047',
    badge: 'CTA · 限时福利转化',
    headline: '源头工厂直发 · 立减50%',
    subline: '今日下单送吸管盖+杯刷 · 365天只换不修',
    freq: 587,
    zoomDir: 'in',
  },
];

async function createMotionCardVideo(spec: DemoClipSpec): Promise<MediaAsset> {
  const outMp4 = path.join(UPLOADS_DIR, spec.filename);
  if (!fs.existsSync(outMp4)) {
    const posterPng = path.join(TEMP_DIR, `seed_${spec.filename}.png`);
    const W = 900;
    const H = 1600;
    const svg = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="${spec.gradStart}"/>
          <stop offset="100%" stop-color="${spec.gradEnd}"/>
        </linearGradient>
        <radialGradient id="glow" cx="50%" cy="42%" r="48%">
          <stop offset="0%" stop-color="${spec.accent}" stop-opacity="0.32"/>
          <stop offset="100%" stop-color="${spec.accent}" stop-opacity="0"/>
        </radialGradient>
      </defs>
      <rect width="${W}" height="${H}" fill="url(#bg)"/>
      <circle cx="450" cy="680" r="420" fill="url(#glow)"/>
      <circle cx="760" cy="260" r="190" fill="${spec.accent}" fill-opacity="0.08"/>
      <circle cx="140" cy="1340" r="240" fill="#FFFFFF" fill-opacity="0.06"/>

      <!-- Decorative Product Visual Frame -->
      <rect x="95" y="420" width="710" height="720" rx="44" fill="#0B0F19" fill-opacity="0.45" stroke="${spec.accent}" stroke-opacity="0.55" stroke-width="3"/>
      <rect x="145" y="460" width="260" height="54" rx="27" fill="${spec.accent}"/>
      <text x="275" y="497" font-family="Noto Sans CJK SC, sans-serif" font-size="24" font-weight="900" fill="#090D16" text-anchor="middle">${spec.badge}</text>

      <!-- Stylized Cup / Tech Graphic -->
      <rect x="360" y="560" width="180" height="310" rx="42" fill="${spec.accent}" fill-opacity="0.22" stroke="#FFFFFF" stroke-width="5"/>
      <rect x="385" y="525" width="130" height="38" rx="16" fill="#FFFFFF" fill-opacity="0.9"/>
      <circle cx="450" cy="790" r="28" fill="${spec.accent}"/>
      <circle cx="450" cy="790" r="12" fill="#090D16"/>

      <text x="450" y="965" font-family="Noto Sans CJK SC, sans-serif" font-size="50" font-weight="900" fill="#FFFFFF" text-anchor="middle">${spec.headline}</text>
      <text x="450" y="1038" font-family="Noto Sans CJK SC, sans-serif" font-size="28" font-weight="600" fill="#E2E8F0" fill-opacity="0.92" text-anchor="middle">${spec.subline}</text>
    </svg>`;

    const sharpFn = tryLoadSharp();
    if (sharpFn) {
      await sharpFn(Buffer.from(svg)).png().toFile(posterPng);
    } else {
      const hexBg = spec.gradEnd.replace('#', '0x');
      await execFileAsync(FFMPEG_BIN, [
        '-y',
        '-f',
        'lavfi',
        '-i',
        `color=c=${hexBg}:s=${W}x${H}:d=0.1`,
        '-frames:v',
        '1',
        posterPng,
      ]);
    }

    const totalFrames = Math.round(spec.duration * 30);
    const zExpr =
      spec.zoomDir === 'in'
        ? `min(zoom+0.0018,1.16)`
        : `if(eq(on,1),1.15,max(1.0,zoom-0.0018))`;

    await execFileAsync(FFMPEG_BIN, [
      '-y',
      '-loop',
      '1',
      '-i',
      posterPng,
      '-f',
      'lavfi',
      '-i',
      `sine=frequency=${spec.freq}:sample_rate=44100:duration=${spec.duration}`,
      '-filter_complex',
      `[0:v]zoompan=z='${zExpr}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${totalFrames}:s=720x1280:fps=30,format=yuv420p[v];[1:a]volume=0.06,afade=t=in:st=0:d=0.2,afade=t=out:st=${(spec.duration - 0.3).toFixed(2)}:d=0.3,aformat=channel_layouts=stereo[a]`,
      '-map',
      '[v]',
      '-map',
      '[a]',
      '-c:v',
      'libx264',
      '-preset',
      'ultrafast',
      '-crf',
      '23',
      '-c:a',
      'aac',
      '-t',
      spec.duration.toFixed(2),
      '-movflags',
      '+faststart',
      outMp4,
    ]);

    if (fs.existsSync(posterPng)) fs.unlinkSync(posterPng);
  }

  const asset = await probeAndProcessFile(outMp4, spec.filename, spec.displayName, 'video/mp4');
  asset.sceneTag = spec.tag;
  return asset;
}

async function createWideShowcaseImage(): Promise<MediaAsset> {
  const filename = 'demo_wide_showcase.jpg';
  const outJpg = path.join(UPLOADS_DIR, filename);
  if (!fs.existsSync(outJpg)) {
    const W = 1280;
    const H = 720;
    const svg = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="wbg" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#0F2027"/>
          <stop offset="50%" stop-color="#203A43"/>
          <stop offset="100%" stop-color="#2C5364"/>
        </linearGradient>
      </defs>
      <rect width="${W}" height="${H}" fill="url(#wbg)"/>
      <rect x="60" y="60" width="1160" height="600" rx="36" fill="#0B1320" fill-opacity="0.55" stroke="#00E5FF" stroke-opacity="0.5" stroke-width="3"/>
      <text x="640" y="255" font-family="Noto Sans CJK SC, sans-serif" font-size="60" font-weight="900" fill="#00E5FF" text-anchor="middle">极光随行榨汁杯 · 三色全家福</text>
      <text x="640" y="345" font-family="Noto Sans CJK SC, sans-serif" font-size="34" font-weight="700" fill="#FFFFFF" text-anchor="middle">冰川白 / 薄荷青 / 樱花粉 · 16:9 横版电商实拍图</text>
      <rect x="370" y="420" width="540" height="78" rx="39" fill="#FFB703"/>
      <text x="640" y="471" font-family="Noto Sans CJK SC, sans-serif" font-size="30" font-weight="900" fill="#111827" text-anchor="middle">测试 9:16 毛玻璃背景 &amp; 自由画面裁切</text>
    </svg>`;
    const sharpFn = tryLoadSharp();
    if (sharpFn) {
      await sharpFn(Buffer.from(svg)).jpeg({ quality: 90 }).toFile(outJpg);
    } else {
      await execFileAsync(FFMPEG_BIN, [
        '-y',
        '-f',
        'lavfi',
        '-i',
        `color=c=0x203A43:s=${W}x${H}:d=0.1`,
        '-frames:v',
        '1',
        outJpg,
      ]);
    }
  }
  const asset = await probeAndProcessFile(
    outJpg,
    filename,
    '07_横版三色全家福海报(可测试裁切)',
    'image/jpeg'
  );
  asset.sceneTag = '产品特写';
  asset.defaultFitMode = 'blur';
  return asset;
}

async function createDemoBgm(
  filename: string,
  displayName: string,
  expr: string
): Promise<MediaAsset> {
  const outMp3 = path.join(UPLOADS_DIR, filename);
  if (!fs.existsSync(outMp3)) {
    await execFileAsync(FFMPEG_BIN, [
      '-y',
      '-f',
      'lavfi',
      '-i',
      `aevalsrc='${expr}':s=44100:d=16`,
      '-af',
      'afade=t=in:st=0:d=0.4,afade=t=out:st=14.8:d=1.2,aformat=channel_layouts=stereo',
      '-b:a',
      '160k',
      outMp3,
    ]);
  }
  return probeAndProcessFile(outMp3, filename, displayName, 'audio/mpeg');
}

export async function ensureDemoProjectExists(): Promise<ProjectData | null> {
  ensureStorageDirs();

  const clips: MediaAsset[] = [];
  for (const spec of DEMO_SPECS) {
    clips.push(await createMotionCardVideo(spec));
  }
  const wideImg = await createWideShowcaseImage();
  const bgm1 = await createDemoBgm(
    'demo_bgm_upbeat.mp3',
    'BGM_01_轻快卡点种草律动',
    '0.14*sin(2*PI*261.63*t)*exp(-2.8*mod(t,0.5)) + 0.11*sin(2*PI*329.63*t)*exp(-2.2*mod(t+0.25,0.5)) + 0.09*sin(2*PI*392.0*t)*exp(-1.5*mod(t,1.0)) + 0.08*sin(2*PI*130.81*t)*exp(-3.5*mod(t,0.5))'
  );
  const bgm2 = await createDemoBgm(
    'demo_bgm_promo.mp3',
    'BGM_02_活力电音大促节拍',
    '0.15*sin(2*PI*293.66*t)*exp(-3.2*mod(t,0.4)) + 0.12*sin(2*PI*369.99*t)*exp(-2.6*mod(t+0.2,0.4)) + 0.10*sin(2*PI*440.0*t)*exp(-1.8*mod(t,0.8)) + 0.09*sin(2*PI*146.83*t)*exp(-4.0*mod(t,0.4))'
  );

  const allAssets = [...clips, wideImg, bgm1, bgm2];

  const [cHook1, cHook2, cScene, cBlade, cClean, cCta] = clips;

  const project: ProjectData = {
    id: uuidv4(),
    name: '极光随行榨汁杯 · 信息流批量投流',
    updatedAt: new Date().toISOString(),
    aspectRatio: '9:16',
    exportQuality: '720p',
    exportFps: 30,
    exportCrf: 23,
    filenamePattern: '{project}_{index}_{group}',
    assets: allAssets,
    videoGroups: [
      {
        id: uuidv4(),
        name: '投流A组-碎冰暴风实测版',
        selectedForExport: true,
        clips: [
          makeClipFromAsset(cHook1, 'cover', 'fade'),
          makeClipFromAsset(cBlade, 'cover', 'fade'),
          makeClipFromAsset(cCta, 'cover', 'none'),
        ],
        overlay: {
          topTitle: '4秒碎冰榨汁！细腻免过滤',
          bottomTitle: '👇 点击下方链接 抢工厂直发5折',
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
        id: uuidv4(),
        name: '投流B组-早八通勤种草版',
        selectedForExport: true,
        clips: [
          makeClipFromAsset(cHook2, 'cover', 'wipeleft'),
          makeClipFromAsset(cScene, 'cover', 'fade'),
          makeClipFromAsset(wideImg, 'blur', 'fade'),
          makeClipFromAsset(cCta, 'cover', 'none'),
        ],
        overlay: {
          topTitle: '早八人续命神器！每天维C自由',
          bottomTitle: '🔥 今日下单送吸管杯盖+运费险',
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
        id: uuidv4(),
        name: '投流C组-免手洗懒人痛点版',
        selectedForExport: true,
        clips: [
          makeClipFromAsset(cHook1, 'cover', 'fade'),
          makeClipFromAsset(cClean, 'cover', 'smoothup'),
          makeClipFromAsset(cCta, 'cover', 'none'),
        ],
        overlay: {
          topTitle: '双击自动清洗！懒人必入榨汁杯',
          bottomTitle: '⚡ 满电连榨18杯 365天只换不修',
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
        {
          id: uuidv4(),
          name: '🔥 前3秒吸睛开头组',
          badgeColor: '#FF4D4F',
          assetIds: [cHook1.id, cHook2.id],
        },
        {
          id: uuidv4(),
          name: '💡 痛点/产品颜值组',
          badgeColor: '#FFB800',
          assetIds: [cScene.id, wideImg.id],
        },
        {
          id: uuidv4(),
          name: '💎 核心卖点实测组',
          badgeColor: '#00E5FF',
          assetIds: [cBlade.id, cClean.id],
        },
        {
          id: uuidv4(),
          name: '🎯 促销转化CTA组',
          badgeColor: '#A855F7',
          assetIds: [cCta.id],
        },
      ],
      topTitlePool: [
        '4秒碎冰榨汁！细腻无渣免过滤',
        '早八打工人必入！随手实现果蔬自由',
        '双击龙卷风自清洁！懒人福音太省心',
        '源头工厂直供价！立省一半智商税',
      ],
      bottomTitlePool: [
        '👇 点击下方小黄车 限时买1送1',
        '🔥 前100名下单立享半价+运费险',
        '⚡ 365天只换不修 闭眼入不踩雷',
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

  return saveProject(project);
}
