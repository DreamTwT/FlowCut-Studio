import { execFile } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { FFMPEG_BIN, FFPROBE_BIN, refreshMediaBinaries, THUMBS_DIR } from './paths.js';
import { AssetType, FULL_CROP, MediaAsset } from '../shared/schema.js';

const execFileAsync = promisify(execFile);

export function decodeUploadFilename(rawName: string): string {
  try {
    // Fix Multer/Busboy latin1 -> utf8 encoding for CJK filenames when needed
    if (/[\u0080-\u00ff]/.test(rawName) && !/[\u4e00-\u9fff]/.test(rawName)) {
      const decoded = Buffer.from(rawName, 'latin1').toString('utf8');
      if (!decoded.includes('\ufffd')) {
        return decoded;
      }
    }
  } catch {
    // ignore
  }
  return rawName;
}

export function detectAssetType(filename: string, mimeType?: string): AssetType {
  const ext = path.extname(filename).toLowerCase();
  if (
    mimeType?.startsWith('audio/') ||
    ['.mp3', '.wav', '.m4a', '.aac', '.ogg', '.flac'].includes(ext)
  ) {
    return 'audio';
  }
  if (
    mimeType?.startsWith('image/') ||
    ['.jpg', '.jpeg', '.png', '.webp', '.bmp', '.gif'].includes(ext)
  ) {
    return 'image';
  }
  return 'video';
}

function parseFps(rateStr?: string): number {
  if (!rateStr) return 30;
  const parts = rateStr.split('/');
  if (parts.length === 2) {
    const num = parseFloat(parts[0]);
    const den = parseFloat(parts[1]);
    if (den > 0 && Number.isFinite(num / den)) {
      return Math.round((num / den) * 100) / 100;
    }
  }
  const val = parseFloat(rateStr);
  return Number.isFinite(val) && val > 0 ? val : 30;
}

/**
 * Probes media dimensions, duration, fps, rotation, and audio presence using ONLY `ffmpeg -i`
 * (zero separate 78MB ffprobe binary or native sharp C++ addon required!).
 */
async function probeWithFfmpegStderr(filePath: string): Promise<{
  duration: number;
  width: number;
  height: number;
  fps: number;
  hasAudio: boolean;
}> {
  let stderr = '';
  try {
    await execFileAsync(FFMPEG_BIN, ['-hide_banner', '-i', filePath]);
  } catch (err: any) {
    // `ffmpeg -i <file>` intentionally exits with code 1 ("At least one output file must be specified")
    // after printing complete stream metadata to stderr.
    stderr = String(err?.stderr || err?.message || '');
  }

  let duration = 0;
  const durMatch = stderr.match(/Duration:\s*(\d{2}):(\d{2}):(\d{2}(?:\.\d+)?)/);
  if (durMatch) {
    duration =
      parseInt(durMatch[1], 10) * 3600 +
      parseInt(durMatch[2], 10) * 60 +
      parseFloat(durMatch[3]);
  }

  let width = 1080;
  let height = 1920;
  let fps = 30;

  const videoLineMatch = stderr.match(/Stream\s+#\d+:\d+[^\r\n]*Video:[^\r\n]*/);
  if (videoLineMatch) {
    const vLine = videoLineMatch[0];
    const dimMatch = vLine.match(/,\s*(\d{2,5})x(\d{2,5})(?=[\s,\[])/);
    if (dimMatch) {
      width = parseInt(dimMatch[1], 10);
      height = parseInt(dimMatch[2], 10);
    }
    const fpsMatch = vLine.match(/(\d+(?:\.\d+)?)\s*fps/);
    if (fpsMatch) {
      fps = Math.round(parseFloat(fpsMatch[1]) * 100) / 100;
    }
  }

  // Smartphone rotation awareness (-90 / 90 / 270 degrees)
  const rotMatch =
    stderr.match(/rotation of\s+(-?\d+(?:\.\d+)?)\s+degrees/i) ||
    stderr.match(/rotate\s*:\s*(-?\d+)/i);
  if (rotMatch) {
    const deg = Math.round(Math.abs(parseFloat(rotMatch[1]))) % 360;
    if (deg === 90 || deg === 270) {
      [width, height] = [height, width];
    }
  }

  const hasAudio = /Stream\s+#\d+:\d+[^\r\n]*Audio:/i.test(stderr);

  return { duration, width, height, fps, hasAudio };
}

export async function probeAndProcessFile(
  filePath: string,
  storedFilename: string,
  displayName: string,
  mimeType?: string,
  presetId?: string
): Promise<MediaAsset> {
  const bins = refreshMediaBinaries();
  const id = presetId || uuidv4();
  const stat = fs.statSync(filePath);
  const assetType = detectAssetType(displayName || storedFilename, mimeType);

  let duration = assetType === 'image' ? 3.5 : 5.0;
  let width = 1080;
  let height = 1920;
  let fps = 30;
  let hasAudio = assetType === 'audio';

  if (assetType === 'image') {
    const info = await probeWithFfmpegStderr(filePath);
    if (info.width > 0 && info.height > 0) {
      width = info.width;
      height = info.height;
    }

    const thumbName = `thumb_${id}.jpg`;
    const thumbPath = path.join(THUMBS_DIR, thumbName);
    let thumbUrl: string | undefined;
    try {
      await execFileAsync(FFMPEG_BIN, [
        '-y',
        '-i',
        filePath,
        '-frames:v',
        '1',
        '-vf',
        'scale=360:-2',
        '-q:v',
        '3',
        thumbPath,
      ]);
      if (fs.existsSync(thumbPath)) {
        thumbUrl = `/storage/thumbnails/${thumbName}`;
      }
    } catch {
      thumbUrl = `/storage/uploads/${storedFilename}`;
    }

    return {
      id,
      name: path.parse(displayName).name || displayName,
      type: 'image',
      filename: storedFilename,
      url: `/storage/uploads/${storedFilename}`,
      thumbnailUrl: thumbUrl,
      filmstripUrls: thumbUrl ? [thumbUrl, thumbUrl, thumbUrl, thumbUrl] : [],
      duration: 3.5,
      width,
      height,
      fps: 30,
      hasAudio: false,
      sizeBytes: stat.size,
      sceneTag: '未分类',
      defaultTrimStart: 0,
      defaultTrimEnd: 3.5,
      defaultCrop: { ...FULL_CROP },
      defaultFitMode: width > height ? 'blur' : 'cover',
      createdAt: new Date().toISOString(),
    };
  }

  // Video or Audio: prefer ffprobe if available, otherwise native ffmpeg -i parser
  let probedOk = false;
  if (bins.ffprobeFound) {
    try {
      const { stdout } = await execFileAsync(FFPROBE_BIN, [
        '-v',
        'quiet',
        '-print_format',
        'json',
        '-show_format',
        '-show_streams',
        filePath,
      ]);
      const info = JSON.parse(stdout);
      const streams: any[] = info.streams || [];
      const videoStream = streams.find(
        (s) => s.codec_type === 'video' && s.disposition?.attached_pic !== 1
      );
      const audioStream = streams.find((s) => s.codec_type === 'audio');

      hasAudio = Boolean(audioStream);
      const formatDur = parseFloat(info.format?.duration || '0');
      const streamDur = parseFloat(videoStream?.duration || audioStream?.duration || '0');
      duration = Math.max(0.3, formatDur || streamDur || 5.0);
      duration = Math.round(duration * 100) / 100;

      if (videoStream) {
        let w = parseInt(videoStream.width || '1080', 10);
        let h = parseInt(videoStream.height || '1920', 10);

        let rotation = 0;
        if (videoStream.tags?.rotate) {
          rotation = Math.abs(parseInt(videoStream.tags.rotate, 10));
        } else if (Array.isArray(videoStream.side_data_list)) {
          const rotData = videoStream.side_data_list.find((d: any) => d.rotation !== undefined);
          if (rotData) rotation = Math.abs(parseInt(rotData.rotation, 10));
        }
        if (rotation === 90 || rotation === 270) {
          [w, h] = [h, w];
        }
        width = w;
        height = h;
        fps = parseFps(videoStream.avg_frame_rate || videoStream.r_frame_rate);
      }
      probedOk = true;
    } catch {
      probedOk = false;
    }
  }

  if (!probedOk) {
    const fallback = await probeWithFfmpegStderr(filePath);
    if (fallback.duration > 0) {
      duration = Math.round(Math.max(0.3, fallback.duration) * 100) / 100;
    }
    width = fallback.width;
    height = fallback.height;
    fps = fallback.fps;
    hasAudio = fallback.hasAudio;
  }

  let thumbnailUrl: string | undefined;
  const filmstripUrls: string[] = [];

  if (assetType === 'video') {
    const thumbName = `thumb_${id}.jpg`;
    const thumbPath = path.join(THUMBS_DIR, thumbName);
    const seekSec = Math.min(0.5, Math.max(0, duration * 0.15));
    try {
      await execFileAsync(FFMPEG_BIN, [
        '-y',
        '-ss',
        seekSec.toFixed(2),
        '-i',
        filePath,
        '-frames:v',
        '1',
        '-vf',
        'scale=360:-2',
        '-q:v',
        '4',
        thumbPath,
      ]);
      if (fs.existsSync(thumbPath)) {
        thumbnailUrl = `/storage/thumbnails/${thumbName}`;
      }
    } catch (e) {
      console.error('Thumbnail extraction warning:', e);
    }

    // Generate 5 filmstrip frames across the video duration for precision Trim Studio
    const frameCount = 5;
    for (let i = 0; i < frameCount; i++) {
      const t = Math.min(Math.max(0, duration - 0.1), (duration * (i + 0.5)) / frameCount);
      const stripName = `strip_${id}_${i}.jpg`;
      const stripPath = path.join(THUMBS_DIR, stripName);
      try {
        await execFileAsync(FFMPEG_BIN, [
          '-y',
          '-ss',
          t.toFixed(2),
          '-i',
          filePath,
          '-frames:v',
          '1',
          '-vf',
          'scale=180:-2',
          '-q:v',
          '6',
          stripPath,
        ]);
        if (fs.existsSync(stripPath)) {
          filmstripUrls.push(`/storage/thumbnails/${stripName}`);
        }
      } catch {
        // skip individual frame error
      }
    }
    if (!filmstripUrls.length && thumbnailUrl) {
      filmstripUrls.push(thumbnailUrl);
    }
  }

  return {
    id,
    name: path.parse(displayName).name || displayName,
    type: assetType,
    filename: storedFilename,
    url: `/storage/uploads/${storedFilename}`,
    thumbnailUrl,
    filmstripUrls,
    duration,
    width: assetType === 'audio' ? 0 : width,
    height: assetType === 'audio' ? 0 : height,
    fps: assetType === 'audio' ? 0 : fps,
    hasAudio,
    sizeBytes: stat.size,
    sceneTag: '未分类',
    defaultTrimStart: 0,
    defaultTrimEnd: duration,
    defaultCrop: { ...FULL_CROP },
    defaultFitMode: width > height ? 'blur' : 'cover',
    createdAt: new Date().toISOString(),
  };
}
