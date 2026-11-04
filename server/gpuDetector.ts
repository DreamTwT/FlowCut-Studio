import { execFile } from 'child_process';
import os from 'os';
import { promisify } from 'util';
import {
  HardwareAccelerationReport,
  HardwareEncoderInfo,
  ResolvedVideoEncoderId,
  VideoEncoderId,
} from '../shared/schema.js';
import { FFMPEG_BIN, refreshMediaBinaries } from './paths.js';

const execFileAsync = promisify(execFile);

/**
 * Priority order approved for Auto GPU mode:
 * NVIDIA NVENC -> Apple VideoToolbox -> AMD AMF -> Intel QSV -> CPU libx264
 */
const ENCODER_CANDIDATES: Array<{
  id: ResolvedVideoEncoderId;
  name: string;
  shortLabel: string;
  vendor: HardwareEncoderInfo['vendor'];
}> = [
  {
    id: 'h264_nvenc',
    name: 'NVIDIA NVENC 显卡硬件编码',
    shortLabel: 'NVENC 独显',
    vendor: 'nvidia',
  },
  {
    id: 'h264_videotoolbox',
    name: 'Apple VideoToolbox 芯片媒体引擎',
    shortLabel: 'VideoToolbox',
    vendor: 'apple',
  },
  {
    id: 'h264_amf',
    name: 'AMD AMF 显卡硬件编码',
    shortLabel: 'AMD AMF',
    vendor: 'amd',
  },
  {
    id: 'h264_qsv',
    name: 'Intel QSV 核显/独显硬件编码',
    shortLabel: 'Intel QSV',
    vendor: 'intel',
  },
  {
    id: 'libx264',
    name: 'CPU 多核软件编码 (x264 100%高兼容)',
    shortLabel: 'CPU x264',
    vendor: 'cpu',
  },
];

let cachedReport: HardwareAccelerationReport | null = null;
let inflightProbe: Promise<HardwareAccelerationReport> | null = null;

async function detectSystemGpuNames(): Promise<string[]> {
  try {
    if (process.platform === 'win32') {
      const { stdout } = await execFileAsync(
        'powershell.exe',
        [
          '-NoProfile',
          '-NonInteractive',
          '-Command',
          'Get-CimInstance Win32_VideoController | Select-Object -ExpandProperty Name',
        ],
        { timeout: 3500, windowsHide: true }
      );
      const list = stdout
        .split(/\r?\n/)
        .map((s) => s.trim())
        .filter((s) => s && !/Microsoft Basic|Remote Desktop/i.test(s));
      if (list.length > 0) return Array.from(new Set(list));
    } else if (process.platform === 'darwin') {
      const { stdout } = await execFileAsync('system_profiler', ['SPDisplaysDataType'], {
        timeout: 3500,
      });
      const matches = Array.from(stdout.matchAll(/Chipset Model:\s*(.+)/gi)).map((m) =>
        m[1].trim()
      );
      if (matches.length > 0) return Array.from(new Set(matches));
    } else {
      try {
        const { stdout } = await execFileAsync(
          'nvidia-smi',
          ['--query-gpu=name', '--format=csv,noheader'],
          { timeout: 2000 }
        );
        const list = stdout
          .split(/\r?\n/)
          .map((s) => s.trim())
          .filter(Boolean);
        if (list.length > 0) return Array.from(new Set(list));
      } catch {
        // ignore if no nvidia-smi
      }
    }
  } catch {
    // ignore OS adapter query failures
  }
  return [];
}

/**
 * Performs a real 1-frame 256x256 hardware encode test in memory (< 200ms).
 * Note: 256x256 is intentionally above NVENC/QSV's 145x49 hardware macroblock minimum!
 */
async function dryRunSingleEncoder(
  ffmpegBin: string,
  encoderId: ResolvedVideoEncoderId
): Promise<{ ok: boolean; reason?: string }> {
  if (encoderId === 'libx264') {
    return { ok: true };
  }
  try {
    await execFileAsync(
      ffmpegBin,
      [
        '-hide_banner',
        '-loglevel',
        'error',
        '-f',
        'lavfi',
        '-i',
        'color=c=black:s=256x256:d=0.04:r=25',
        '-frames:v',
        '1',
        '-pix_fmt',
        'yuv420p',
        '-c:v',
        encoderId,
        '-f',
        'null',
        '-',
      ],
      { timeout: 4000, windowsHide: true }
    );
    return { ok: true };
  } catch (err: any) {
    const rawMsg = String(err?.stderr || err?.message || '').toLowerCase();
    let friendly = '未检测到对应显卡硬件';
    if (rawMsg.includes('driver') || rawMsg.includes('version') || rawMsg.includes('api')) {
      friendly = '显卡驱动版本过旧';
    } else if (rawMsg.includes('cannot load') || rawMsg.includes('not found')) {
      friendly = '未安装对应显卡驱动';
    }
    return { ok: false, reason: friendly };
  }
}

export async function probeHardwareAcceleration(
  forceRefresh = false
): Promise<HardwareAccelerationReport> {
  if (cachedReport && !forceRefresh) {
    return cachedReport;
  }
  if (inflightProbe && !forceRefresh) {
    return inflightProbe;
  }

  inflightProbe = (async () => {
    const bins = refreshMediaBinaries();
    const ffmpegBin = bins.ffmpegPath || FFMPEG_BIN;
    const cpuCores = Math.max(2, os.cpus()?.length || 4);

    if (!bins.ffmpegFound) {
      const fallback: HardwareAccelerationReport = {
        probedAt: new Date().toISOString(),
        gpuNames: [],
        hasHardwareGpu: false,
        recommendedEncoder: 'libx264',
        recommendedConcurrency: 2,
        encoders: ENCODER_CANDIDATES.map((c) => ({
          ...c,
          available: c.id === 'libx264',
          reason: c.id === 'libx264' ? undefined : '等待 FFmpeg 就绪后探测',
        })),
      };
      cachedReport = fallback;
      inflightProbe = null;
      return fallback;
    }

    let compiledListOutput = '';
    try {
      const { stdout } = await execFileAsync(ffmpegBin, ['-hide_banner', '-encoders'], {
        timeout: 4000,
        windowsHide: true,
      });
      compiledListOutput = stdout;
    } catch {
      // ignore
    }

    const [gpuNames, probeResults] = await Promise.all([
      detectSystemGpuNames(),
      Promise.all(
        ENCODER_CANDIDATES.map(async (cand) => {
          if (cand.id === 'libx264') {
            return { ...cand, available: true };
          }
          // Skip platform-irrelevant probes cleanly
          if (cand.id === 'h264_videotoolbox' && process.platform !== 'darwin') {
            return { ...cand, available: false, reason: '仅 macOS Apple 芯片支持' };
          }
          if (cand.id === 'h264_amf' && process.platform !== 'win32') {
            return { ...cand, available: false, reason: '仅 Windows AMD 显卡支持' };
          }
          if (compiledListOutput && !compiledListOutput.includes(cand.id)) {
            return { ...cand, available: false, reason: '当前 FFmpeg 构建未包含该编码器' };
          }
          const res = await dryRunSingleEncoder(ffmpegBin, cand.id);
          return {
            ...cand,
            available: res.ok,
            reason: res.reason,
          };
        })
      ),
    ]);

    const firstHw = probeResults.find((e) => e.id !== 'libx264' && e.available);
    const recommendedEncoder: ResolvedVideoEncoderId = firstHw ? firstHw.id : 'libx264';
    const hasHardwareGpu = Boolean(firstHw);

    // Recommend concurrency: 3 on hardware GPU + >=8 logical cores, else 2
    let recommendedConcurrency: 1 | 2 | 3 | 4 = 2;
    if (hasHardwareGpu && cpuCores >= 8) {
      recommendedConcurrency = 3;
    } else if (!hasHardwareGpu && cpuCores <= 4) {
      recommendedConcurrency = 1;
    }

    const report: HardwareAccelerationReport = {
      probedAt: new Date().toISOString(),
      gpuNames,
      hasHardwareGpu,
      recommendedEncoder,
      recommendedConcurrency,
      encoders: probeResults,
    };

    cachedReport = report;
    inflightProbe = null;
    return report;
  })();

  return inflightProbe;
}

export async function resolveEncoderForRender(
  requested: VideoEncoderId | undefined
): Promise<{ encoderId: ResolvedVideoEncoderId; shortLabel: string }> {
  const report = await probeHardwareAcceleration(false);
  if (!requested || requested === 'auto') {
    const rec = report.encoders.find((e) => e.id === report.recommendedEncoder);
    return {
      encoderId: report.recommendedEncoder,
      shortLabel: rec?.shortLabel || 'CPU x264',
    };
  }

  const found = report.encoders.find((e) => e.id === requested && e.available);
  if (found) {
    return { encoderId: found.id, shortLabel: found.shortLabel };
  }

  // Fallback safely if user selected an unavailable GPU encoder
  const fallback = report.encoders.find((e) => e.id === report.recommendedEncoder);
  return {
    encoderId: fallback ? fallback.id : 'libx264',
    shortLabel: fallback ? `${fallback.shortLabel} (自动匹配)` : 'CPU x264',
  };
}

/**
 * Equal-quality bitrate/quantizer parameter mapping across NVENC, QSV, AMF, VideoToolbox & libx264
 * so hardware-encoded 1080p feed ads stay crisp without macroblock muddiness!
 */
export function buildVideoEncoderArgs(
  encoderId: ResolvedVideoEncoderId,
  crf: 20 | 23 | number,
  gopSize?: number
): string[] {
  const highQuality = crf <= 20;
  const gopArgs = gopSize && gopSize >= 24 ? ['-g', String(gopSize)] : [];

  switch (encoderId) {
    case 'h264_nvenc':
      return [
        '-c:v',
        'h264_nvenc',
        '-preset',
        'p4',
        '-tune',
        'hq',
        '-rc',
        'vbr',
        '-cq',
        highQuality ? '21' : '24',
        '-b:v',
        '0',
        '-maxrate',
        highQuality ? '12M' : '8M',
        '-bufsize',
        highQuality ? '24M' : '16M',
        ...gopArgs,
      ];

    case 'h264_qsv':
      return [
        '-c:v',
        'h264_qsv',
        '-preset',
        'medium',
        '-global_quality',
        highQuality ? '21' : '24',
        ...gopArgs,
      ];

    case 'h264_amf':
      return [
        '-c:v',
        'h264_amf',
        '-quality',
        'balanced',
        '-rc',
        'cqp',
        '-qp_i',
        highQuality ? '20' : '23',
        '-qp_p',
        highQuality ? '21' : '24',
        ...gopArgs,
      ];

    case 'h264_videotoolbox':
      return [
        '-c:v',
        'h264_videotoolbox',
        '-q:v',
        highQuality ? '68' : '58',
        '-allow_sw',
        '1',
        ...gopArgs,
      ];

    case 'libx264':
    default:
      return ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', String(crf), ...gopArgs];
  }
}
