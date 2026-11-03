import {
  GroupOverlayConfig,
  MediaAsset,
  SUBTITLE_STYLES,
  SubtitleConfig,
  TITLE_STYLES,
  VideoGroup,
  WatermarkConfig,
} from '@shared/schema';

export interface RenderedSubtitleStrip {
  startSec: number;
  endSec: number;
  yPx: number;
  pngDataUrl: string;
}

function splitBalancedLinesClient(rawText: string, maxCharsPerLine: number): string[] {
  const manualLines = rawText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const result: string[] = [];
  for (const line of manualLines) {
    const chars = Array.from(line);
    if (chars.length <= maxCharsPerLine) {
      result.push(line);
    } else if (chars.length <= maxCharsPerLine * 2) {
      const mid = Math.ceil(chars.length / 2);
      let splitAt = mid;
      for (let offset = 0; offset <= 3; offset++) {
        for (const cand of [mid + offset, mid - offset]) {
          if (cand > 3 && cand < chars.length - 3) {
            const prevCh = chars[cand - 1];
            if ('！!？?，,。·：: '.includes(prevCh)) {
              splitAt = cand;
              offset = 99;
              break;
            }
          }
        }
      }
      result.push(chars.slice(0, splitAt).join('').trim());
      result.push(chars.slice(splitAt).join('').trim());
    } else {
      const third = Math.ceil(chars.length / 3);
      result.push(chars.slice(0, third).join('').trim());
      result.push(chars.slice(third, third * 2).join('').trim());
      result.push(chars.slice(third * 2).join('').trim());
    }
  }
  return result.filter(Boolean).slice(0, 3);
}

function hexWithOpacity(hex: string, alpha: number): string {
  const clean = hex.replace('#', '');
  if (clean.length === 6) {
    const r = parseInt(clean.slice(0, 2), 16);
    const g = parseInt(clean.slice(2, 4), 16);
    const b = parseInt(clean.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }
  return hex;
}

function loadImageElement(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

function drawFancyTitlesOnCtx(
  ctx: CanvasRenderingContext2D,
  overlay: GroupOverlayConfig,
  width: number,
  height: number
): boolean {
  const topRaw = (overlay.topTitle || '').trim();
  const bottomRaw = (overlay.bottomTitle || '').trim();
  if (!topRaw && !bottomRaw) return false;

  const style = TITLE_STYLES[overlay.styleId] || TITLE_STYLES.douyin_yellow;
  const scale = Math.min(1.6, Math.max(0.6, overlay.fontScale || 1.0));
  const baseUnit = Math.min(width, height);

  const maxCharsTop = width >= height ? 19 : 14;
  const maxCharsBottom = width >= height ? 24 : 18;

  const drawBlock = (
    raw: string,
    yPercent: number,
    fontRatio: number,
    maxChars: number,
    isBottom: boolean
  ) => {
    const lines = splitBalancedLinesClient(raw, maxChars);
    if (!lines.length) return;

    const fontSize = Math.round(baseUnit * fontRatio * scale);
    const lineHeight = Math.round(fontSize * 1.32);

    ctx.save();
    ctx.font = `900 ${fontSize}px "Microsoft YaHei", "PingFang SC", "Hiragino Sans GB", "Noto Sans CJK SC", "SimHei", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const maxLineW = Math.max(...lines.map((l) => ctx.measureText(l).width));
    const padX = Math.round(fontSize * 0.78);
    const padY = Math.round(fontSize * 0.42);
    const boxW = Math.min(Math.round(width * 0.92), Math.round(maxLineW + padX * 2));
    const boxH = Math.round(lines.length * lineHeight + padY * 1.4);
    const boxX = Math.round((width - boxW) / 2);
    const centerY = Math.round((height * Math.min(93, Math.max(7, yPercent))) / 100);
    const boxY = Math.round(centerY - boxH / 2);

    if (style.bgColor && style.bgOpacity > 0) {
      ctx.save();
      ctx.shadowColor = 'rgba(0, 0, 0, 0.55)';
      ctx.shadowBlur = Math.max(8, Math.round(baseUnit * 0.01));
      ctx.shadowOffsetY = Math.max(3, Math.round(baseUnit * 0.004));
      ctx.fillStyle = hexWithOpacity(style.bgColor, style.bgOpacity);
      const rx = Math.round(Math.min(boxH / 2, fontSize * 0.72));
      ctx.beginPath();
      ctx.roundRect(boxX, boxY, boxW, boxH, rx);
      ctx.fill();
      if (style.borderColor) {
        ctx.shadowColor = 'transparent';
        ctx.strokeStyle = style.borderColor;
        ctx.lineWidth = Math.max(2, Math.round(baseUnit * 0.003));
        ctx.stroke();
      }
      ctx.restore();
    }

    const strokeW = Math.round((style.strokeWidth / 1080) * baseUnit * (isBottom ? 0.85 : 1));
    lines.forEach((line, idx) => {
      const lineY =
        boxY + Math.round(padY * 0.7) + Math.round((idx + 0.5) * lineHeight);

      if (!style.bgColor) {
        ctx.shadowColor = 'rgba(0, 0, 0, 0.68)';
        ctx.shadowBlur = Math.max(6, Math.round(baseUnit * 0.008));
        ctx.shadowOffsetY = Math.max(2, Math.round(baseUnit * 0.004));
      } else {
        ctx.shadowColor = 'transparent';
      }

      if (strokeW > 0) {
        ctx.strokeStyle = style.strokeColor;
        ctx.lineWidth = strokeW;
        ctx.lineJoin = 'round';
        ctx.miterLimit = 2;
        ctx.strokeText(line, Math.round(width / 2), lineY);
      }

      ctx.shadowColor = 'transparent';
      ctx.fillStyle = style.textColor;
      ctx.fillText(line, Math.round(width / 2), lineY);
    });

    ctx.restore();
  };

  if (topRaw) {
    drawBlock(topRaw, overlay.topY || 13, 0.06, maxCharsTop, false);
  }
  if (bottomRaw) {
    drawBlock(bottomRaw, overlay.bottomY || 83, 0.045, maxCharsBottom, true);
  }
  return true;
}

async function drawWatermarkOnCtx(
  ctx: CanvasRenderingContext2D,
  wm: WatermarkConfig | undefined,
  assetMap: Map<string, MediaAsset>,
  width: number,
  height: number
): Promise<boolean> {
  if (!wm || !wm.enabled) return false;
  const baseUnit = Math.min(width, height);
  const scale = Math.min(2.2, Math.max(0.4, wm.scale || 1.0));
  const opacity = Math.min(1, Math.max(0.1, wm.opacity ?? 0.82));
  const marginX = Math.round((width * Math.min(35, Math.max(1, wm.offsetX ?? 4.5))) / 100);
  const marginY = Math.round((height * Math.min(35, Math.max(1, wm.offsetY ?? 4.0))) / 100);

  if (wm.mode === 'image' && wm.imageAssetId) {
    const imgAsset = assetMap.get(wm.imageAssetId);
    if (imgAsset?.url) {
      const img = await loadImageElement(imgAsset.url);
      if (img && img.naturalWidth > 0 && img.naturalHeight > 0) {
        const targetW = Math.round(baseUnit * 0.16 * scale);
        const targetH = Math.max(16, Math.round((targetW * img.naturalHeight) / img.naturalWidth));
        const x =
          wm.corner === 'top_right' || wm.corner === 'bottom_right'
            ? width - marginX - targetW
            : marginX;
        const y =
          wm.corner === 'bottom_left' || wm.corner === 'bottom_right'
            ? height - marginY - targetH
            : marginY;

        ctx.save();
        ctx.globalAlpha = opacity;
        ctx.drawImage(img, x, y, targetW, targetH);
        ctx.restore();
        return true;
      }
    }
  }

  const label = (wm.text || '').trim();
  if (!label) return false;

  ctx.save();
  ctx.globalAlpha = opacity;
  const fontSize = Math.max(14, Math.round(baseUnit * 0.028 * scale));
  ctx.font = `700 ${fontSize}px "Microsoft YaHei", "PingFang SC", "Noto Sans CJK SC", sans-serif`;
  ctx.textBaseline = 'middle';
  const textW = ctx.measureText(label).width;
  const padX = Math.round(fontSize * 0.65);
  const padY = Math.round(fontSize * 0.36);
  const pillW = Math.round(textW + padX * 2);
  const pillH = Math.round(fontSize + padY * 2);

  const boxX =
    wm.corner === 'top_right' || wm.corner === 'bottom_right'
      ? width - marginX - pillW
      : marginX;
  const boxY =
    wm.corner === 'bottom_left' || wm.corner === 'bottom_right'
      ? height - marginY - pillH
      : marginY;

  ctx.fillStyle = 'rgba(12, 15, 22, 0.52)';
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.24)';
  ctx.lineWidth = Math.max(1, Math.round(baseUnit * 0.0018));
  ctx.beginPath();
  ctx.roundRect(boxX, boxY, pillW, pillH, Math.round(pillH / 2));
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = '#FFFFFF';
  ctx.textAlign = 'center';
  ctx.fillText(label, Math.round(boxX + pillW / 2), Math.round(boxY + pillH / 2));
  ctx.restore();
  return true;
}

/**
 * Synchronous legacy helper for Fancy Titles only
 */
export function renderOverlayToPngDataUrl(
  overlay: GroupOverlayConfig,
  width: number,
  height: number
): string | null {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.clearRect(0, 0, width, height);
  const drew = drawFancyTitlesOnCtx(ctx, overlay, width, height);
  return drew ? canvas.toDataURL('image/png') : null;
}

/**
 * Async full static layer rasterizer: composites Fancy Titles + Brand Corner Watermark (Logo or Text)
 * into a single transparent PNG Data URL for FFmpeg.
 */
export async function renderGroupStaticLayerPngDataUrl(
  group: VideoGroup,
  assetMap: Map<string, MediaAsset>,
  width: number,
  height: number
): Promise<string | null> {
  const hasTitles = Boolean(
    group.overlay?.topTitle?.trim() || group.overlay?.bottomTitle?.trim()
  );
  const hasWm = Boolean(group.watermark?.enabled);
  if (!hasTitles && !hasWm) return null;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.clearRect(0, 0, width, height);

  let drewAny = false;
  if (hasTitles) {
    drewAny = drawFancyTitlesOnCtx(ctx, group.overlay, width, height) || drewAny;
  }
  if (hasWm) {
    drewAny = (await drawWatermarkOnCtx(ctx, group.watermark, assetMap, width, height)) || drewAny;
  }
  return drewAny ? canvas.toDataURL('image/png') : null;
}

/**
 * Renders each timed subtitle cue as a compact horizontal RGBA strip PNG positioned at `yPx`
 * so FFmpeg burns dynamic spoken captions with 10x faster alpha-blending and zero fontconfig issues!
 */
export function renderSubtitleCuesToStrips(
  subtitles: SubtitleConfig | undefined,
  width: number,
  height: number
): RenderedSubtitleStrip[] {
  if (!subtitles || !subtitles.enabled || !subtitles.cues?.length) return [];

  const style = SUBTITLE_STYLES[subtitles.styleId] || SUBTITLE_STYLES.douyin_yellow;
  const scale = Math.min(1.6, Math.max(0.65, subtitles.fontScale || 1.0));
  const baseUnit = Math.min(width, height);
  const fontSize = Math.max(18, Math.round(baseUnit * 0.048 * scale));
  const lineHeight = Math.round(fontSize * 1.32);
  const maxChars = width >= height ? 24 : 15;

  const stripH = Math.max(100, Math.round(lineHeight * 2.6 + 32));
  const centerY = Math.round(
    (height * Math.min(93, Math.max(10, subtitles.yPercent || 74))) / 100
  );
  const yPx = Math.max(0, Math.min(height - stripH, Math.round(centerY - stripH / 2)));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = stripH;
  const ctx = canvas.getContext('2d');
  if (!ctx) return [];

  const out: RenderedSubtitleStrip[] = [];

  for (const cue of subtitles.cues) {
    const raw = (cue.text || '').trim();
    if (!raw || cue.endSec <= cue.startSec + 0.04) continue;

    const lines = splitBalancedLinesClient(raw, maxChars).slice(0, 2);
    if (!lines.length) continue;

    ctx.clearRect(0, 0, width, stripH);
    ctx.save();
    ctx.font = `900 ${fontSize}px "Microsoft YaHei", "PingFang SC", "Hiragino Sans GB", "Noto Sans CJK SC", "SimHei", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const maxLineW = Math.max(...lines.map((l) => ctx.measureText(l).width));
    const padX = Math.round(fontSize * 0.68);
    const padY = Math.round(fontSize * 0.34);
    const boxW = Math.min(Math.round(width * 0.92), Math.round(maxLineW + padX * 2));
    const boxH = Math.round(lines.length * lineHeight + padY * 1.3);
    const boxX = Math.round((width - boxW) / 2);
    const boxY = Math.round((stripH - boxH) / 2);

    if (style.bgColor && style.bgOpacity > 0) {
      ctx.save();
      ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
      ctx.shadowBlur = Math.max(6, Math.round(baseUnit * 0.008));
      ctx.fillStyle = hexWithOpacity(style.bgColor, style.bgOpacity);
      ctx.beginPath();
      ctx.roundRect(boxX, boxY, boxW, boxH, Math.round(Math.min(boxH / 2, fontSize * 0.55)));
      ctx.fill();
      ctx.restore();
    }

    const strokeW = Math.round((style.strokeWidth / 1080) * baseUnit);
    lines.forEach((line, idx) => {
      const lineY = boxY + Math.round(padY * 0.65) + Math.round((idx + 0.5) * lineHeight);
      if (!style.bgColor) {
        ctx.shadowColor = style.shadowColor || 'rgba(0,0,0,0.8)';
        ctx.shadowBlur = Math.max(5, Math.round(baseUnit * 0.007));
        ctx.shadowOffsetY = Math.max(2, Math.round(baseUnit * 0.003));
      } else {
        ctx.shadowColor = 'transparent';
      }

      if (strokeW > 0) {
        ctx.strokeStyle = style.strokeColor;
        ctx.lineWidth = strokeW;
        ctx.lineJoin = 'round';
        ctx.miterLimit = 2;
        ctx.strokeText(line, Math.round(width / 2), lineY);
      }

      ctx.shadowColor = 'transparent';
      ctx.fillStyle = style.textColor;
      ctx.fillText(line, Math.round(width / 2), lineY);
    });

    ctx.restore();
    out.push({
      startSec: cue.startSec,
      endSec: cue.endSec,
      yPx,
      pngDataUrl: canvas.toDataURL('image/png'),
    });
  }

  return out;
}
