import { normalizePictureInPicture } from './schema.js';
import type { PictureInPictureConfig } from './schema.js';

/** Rectangle in output pixels, preserving source aspect and fitting entirely within the frame. */
export function getPictureInPictureRect(
  config: Partial<PictureInPictureConfig>, frameWidth: number, frameHeight: number,
  sourceWidth: number, sourceHeight: number
) {
  const cfg = normalizePictureInPicture(config);
  const w = Math.max(1, frameWidth), h = Math.max(1, frameHeight);
  const ratio = Math.max(0.01, sourceWidth || 1) / Math.max(0.01, sourceHeight || 1);
  const width = Math.min(w * cfg.widthPercent / 100, h * ratio);
  const height = width / ratio;
  return { width, height, x: (w - width) * cfg.xPercent / 100, y: (h - height) * cfg.yPercent / 100 };
}

/** Fast RGB key approximation for browser Canvas. FFmpeg's colorkey remains authoritative. */
export function applyPictureInPictureColorKey(
  pixels: Uint8ClampedArray, color: string, similarity: number, blend: number
) {
  const cfg = normalizePictureInPicture({ chromaColor: color, similarity, blend });
  const key = parseInt(cfg.chromaColor.slice(1), 16);
  const r = (key >> 16) & 255, g = (key >> 8) & 255, b = key & 255;
  for (let i = 0; i < pixels.length; i += 4) {
    const dr = pixels[i] - r, dg = pixels[i + 1] - g, db = pixels[i + 2] - b;
    const distance = Math.sqrt(dr * dr + dg * dg + db * db) / (255 * Math.sqrt(3));
    const alpha = cfg.blend > 0 ? Math.max(0, Math.min(1, (distance - cfg.similarity) / cfg.blend))
      : (distance > cfg.similarity ? 1 : 0);
    pixels[i + 3] = Math.round(pixels[i + 3] * alpha);
  }
}
