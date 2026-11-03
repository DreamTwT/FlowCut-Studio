import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
import {
  GroupOverlayConfig,
  SUBTITLE_STYLES,
  SubtitleConfig,
  TITLE_STYLES,
  WatermarkConfig,
} from '../shared/schema.js';
import { TEMP_DIR } from './paths.js';

const customRequire =
  typeof require !== 'undefined' ? require : createRequire(import.meta.url);

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * librsvg on headless Linux does not render bitmap color emojis (CBDT),
 * showing hex boxes like [01F525]. Map common feed-ad emojis to crisp vector glyphs
 * supported natively in Noto Sans CJK SC so exported MP4s never show hex boxes.
 */
export function normalizeRenderText(raw: string): string {
  return raw
    .replace(/🔥/g, '★ ')
    .replace(/👇/g, '▼ ')
    .replace(/👆/g, '▲ ')
    .replace(/⚡/g, '✦ ')
    .replace(/💎/g, '◆ ')
    .replace(/🎯/g, '◎ ')
    .replace(/💡/g, '✦ ')
    .replace(/✅/g, '✓ ')
    .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\uFE0F]/gu, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/**
 * Balanced CJK line wrapper: avoids ugly 1-2 character orphan tails!
 */
export function splitBalancedLines(rawText: string, maxCharsPerLine: number): string[] {
  const manualLines = rawText
    .split(/\r?\n/)
    .map((l) => normalizeRenderText(l))
    .filter(Boolean);

  const result: string[] = [];
  for (const line of manualLines) {
    const chars = Array.from(line);
    if (chars.length <= maxCharsPerLine) {
      result.push(line);
    } else if (chars.length <= maxCharsPerLine * 2) {
      // Split near natural punctuation or balanced midpoint so no 1-2 char orphan line!
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

function estimateVisualEmWidth(line: string): number {
  let w = 0;
  for (const ch of line) {
    w += ch.charCodeAt(0) > 255 ? 1.02 : 0.6;
  }
  return w;
}

export interface PreRenderedSubtitleStripInput {
  startSec: number;
  endSec: number;
  yPx: number;
  pngDataUrl: string;
}

export interface SubtitleStripFile {
  startSec: number;
  endSec: number;
  yPx: number;
  filePath: string;
}

export async function renderOverlayPng(
  overlay: GroupOverlayConfig,
  width: number,
  height: number,
  jobKey: string,
  preRenderedDataUrl?: string,
  watermark?: WatermarkConfig
): Promise<string | null> {
  const outPath = path.join(TEMP_DIR, `ov_${jobKey}.png`);

  // 1. Primary cross-platform zero-dependency path: client-rasterized Canvas PNG (includes Titles + Watermark!)
  if (preRenderedDataUrl && preRenderedDataUrl.startsWith('data:image/png;base64,')) {
    const base64Data = preRenderedDataUrl.slice('data:image/png;base64,'.length);
    fs.writeFileSync(outPath, Buffer.from(base64Data, 'base64'));
    return outPath;
  }

  const topRaw = (overlay?.topTitle || '').trim();
  const bottomRaw = (overlay?.bottomTitle || '').trim();
  const wmText =
    watermark?.enabled && watermark.mode === 'text' ? (watermark.text || '').trim() : '';
  if (!topRaw && !bottomRaw && !wmText) return null;

  const style = TITLE_STYLES[overlay.styleId] || TITLE_STYLES.douyin_yellow;
  const scale = Math.min(1.6, Math.max(0.6, overlay.fontScale || 1.0));
  const baseUnit = Math.min(width, height);

  const maxCharsTop = width >= height ? 19 : 14;
  const maxCharsBottom = width >= height ? 24 : 18;

  const blocksSvg: string[] = [];

  const renderBlock = (
    text: string,
    yPercent: number,
    fontRatio: number,
    maxChars: number,
    isBottom: boolean
  ) => {
    const lines = splitBalancedLines(text, maxChars);
    if (!lines.length) return;

    const fontSize = Math.round(baseUnit * fontRatio * scale);
    const lineHeight = Math.round(fontSize * 1.32);
    const maxEm = Math.max(...lines.map(estimateVisualEmWidth));
    const padX = Math.round(fontSize * 0.78);
    const padY = Math.round(fontSize * 0.42);
    const boxW = Math.min(Math.round(width * 0.92), Math.round(maxEm * fontSize + padX * 2));
    const boxH = Math.round(lines.length * lineHeight + padY * 1.5);
    const boxX = Math.round((width - boxW) / 2);
    const centerY = Math.round((height * Math.min(93, Math.max(7, yPercent))) / 100);
    const boxY = Math.round(centerY - boxH / 2);

    const strokeW = Math.round((style.strokeWidth / 1080) * baseUnit * (isBottom ? 0.85 : 1));

    let bgRect = '';
    if (style.bgColor && style.bgOpacity > 0) {
      const rx = Math.round(Math.min(boxH / 2, fontSize * 0.72));
      const borderAttr = style.borderColor
        ? `stroke="${style.borderColor}" stroke-width="${Math.max(2, Math.round(baseUnit * 0.003))}"`
        : '';
      bgRect = `<rect x="${boxX}" y="${boxY}" width="${boxW}" height="${boxH}" rx="${rx}" fill="${style.bgColor}" fill-opacity="${style.bgOpacity}" ${borderAttr} filter="url(#dropShadow)" />`;
    }

    const textEls = lines.map((line, idx) => {
      const textY = boxY + Math.round(padY * 0.75) + Math.round((idx + 0.82) * lineHeight);
      const strokeAttrs =
        strokeW > 0
          ? `stroke="${style.strokeColor}" stroke-width="${strokeW}" stroke-linejoin="round" paint-order="stroke fill"`
          : '';
      const filterAttr = !style.bgColor ? `filter="url(#dropShadow)"` : '';
      return `<text x="${Math.round(width / 2)}" y="${textY}" font-family="Microsoft YaHei, PingFang SC, Hiragino Sans GB, Noto Sans CJK SC, SimHei, sans-serif" font-size="${fontSize}" font-weight="900" fill="${style.textColor}" text-anchor="middle" ${strokeAttrs} ${filterAttr}>${escapeXml(line)}</text>`;
    });

    blocksSvg.push(bgRect + textEls.join('\n'));
  };

  if (topRaw) {
    renderBlock(topRaw, overlay.topY || 13, 0.06, maxCharsTop, false);
  }
  if (bottomRaw) {
    renderBlock(bottomRaw, overlay.bottomY || 83, 0.045, maxCharsBottom, true);
  }

  if (wmText && watermark) {
    const wmScale = Math.min(2.2, Math.max(0.4, watermark.scale || 1.0));
    const wmOpacity = Math.min(1, Math.max(0.1, watermark.opacity ?? 0.82));
    const fSize = Math.max(14, Math.round(baseUnit * 0.028 * wmScale));
    const normLabel = normalizeRenderText(wmText);
    const estW = Math.round(estimateVisualEmWidth(normLabel) * fSize + fSize * 1.3);
    const pillH = Math.round(fSize * 1.72);
    const mx = Math.round((width * (watermark.offsetX ?? 4.5)) / 100);
    const my = Math.round((height * (watermark.offsetY ?? 4.0)) / 100);
    const bx =
      watermark.corner === 'top_right' || watermark.corner === 'bottom_right'
        ? width - mx - estW
        : mx;
    const by =
      watermark.corner === 'bottom_left' || watermark.corner === 'bottom_right'
        ? height - my - pillH
        : my;
    blocksSvg.push(
      `<g opacity="${wmOpacity.toFixed(2)}"><rect x="${bx}" y="${by}" width="${estW}" height="${pillH}" rx="${Math.round(
        pillH / 2
      )}" fill="#0C0F16" fill-opacity="0.55" stroke="#FFFFFF" stroke-opacity="0.25" stroke-width="1.5"/><text x="${Math.round(
        bx + estW / 2
      )}" y="${Math.round(
        by + pillH * 0.67
      )}" font-family="Microsoft YaHei, PingFang SC, Noto Sans CJK SC, sans-serif" font-size="${fSize}" font-weight="700" fill="#FFFFFF" text-anchor="middle">${escapeXml(
        normLabel
      )}</text></g>`
    );
  }

  if (!blocksSvg.length) return null;

  const svgStr = `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <filter id="dropShadow" x="-15%" y="-15%" width="130%" height="130%">
        <feDropShadow dx="0" dy="${Math.max(2, Math.round(baseUnit * 0.004))}" stdDeviation="${Math.max(3, Math.round(baseUnit * 0.005))}" flood-color="#000000" flood-opacity="0.65"/>
      </filter>
    </defs>
    ${blocksSvg.join('\n')}
  </svg>`;

  try {
    const sharpMod = customRequire('sharp');
    const sharpFn = sharpMod.default || sharpMod;
    await sharpFn(Buffer.from(svgStr)).png().toFile(outPath);
    return outPath;
  } catch {
    return null;
  }
}

export async function renderSubtitleStripFiles(
  subtitles: SubtitleConfig | undefined,
  width: number,
  height: number,
  jobKey: string,
  preRenderedStrips?: PreRenderedSubtitleStripInput[]
): Promise<SubtitleStripFile[]> {
  const results: SubtitleStripFile[] = [];

  if (preRenderedStrips && preRenderedStrips.length > 0) {
    preRenderedStrips.forEach((s, idx) => {
      if (s.pngDataUrl && s.pngDataUrl.startsWith('data:image/png;base64,')) {
        const fp = path.join(TEMP_DIR, `sub_${jobKey}_${idx}.png`);
        const b64 = s.pngDataUrl.slice('data:image/png;base64,'.length);
        fs.writeFileSync(fp, Buffer.from(b64, 'base64'));
        results.push({
          startSec: s.startSec,
          endSec: s.endSec,
          yPx: s.yPx,
          filePath: fp,
        });
      }
    });
    if (results.length > 0) return results;
  }

  if (!subtitles || !subtitles.enabled || !subtitles.cues?.length) return [];

  let sharpFn: any = null;
  try {
    const sharpMod = customRequire('sharp');
    sharpFn = sharpMod.default || sharpMod;
  } catch {
    return [];
  }

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
  const strokeW = Math.round((style.strokeWidth / 1080) * baseUnit);

  for (let i = 0; i < subtitles.cues.length; i++) {
    const cue = subtitles.cues[i];
    const lines = splitBalancedLines(cue.text || '', maxChars).slice(0, 2);
    if (!lines.length || cue.endSec <= cue.startSec + 0.04) continue;

    const maxEm = Math.max(...lines.map(estimateVisualEmWidth));
    const padX = Math.round(fontSize * 0.68);
    const padY = Math.round(fontSize * 0.34);
    const boxW = Math.min(Math.round(width * 0.92), Math.round(maxEm * fontSize + padX * 2));
    const boxH = Math.round(lines.length * lineHeight + padY * 1.3);
    const boxX = Math.round((width - boxW) / 2);
    const boxY = Math.round((stripH - boxH) / 2);

    const bgRect =
      style.bgColor && style.bgOpacity > 0
        ? `<rect x="${boxX}" y="${boxY}" width="${boxW}" height="${boxH}" rx="${Math.round(
            Math.min(boxH / 2, fontSize * 0.55)
          )}" fill="${style.bgColor}" fill-opacity="${style.bgOpacity}"/>`
        : '';

    const textEls = lines
      .map((line, lIdx) => {
        const ty = boxY + Math.round(padY * 0.72) + Math.round((lIdx + 0.82) * lineHeight);
        const stAttr =
          strokeW > 0
            ? `stroke="${style.strokeColor}" stroke-width="${strokeW}" stroke-linejoin="round" paint-order="stroke fill"`
            : '';
        return `<text x="${Math.round(
          width / 2
        )}" y="${ty}" font-family="Microsoft YaHei, PingFang SC, Noto Sans CJK SC, sans-serif" font-size="${fontSize}" font-weight="900" fill="${
          style.textColor
        }" text-anchor="middle" ${stAttr}>${escapeXml(line)}</text>`;
      })
      .join('\n');

    const svg = `<svg width="${width}" height="${stripH}" viewBox="0 0 ${width} ${stripH}" xmlns="http://www.w3.org/2000/svg">${bgRect}${textEls}</svg>`;
    const fp = path.join(TEMP_DIR, `sub_${jobKey}_${i}.png`);
    await sharpFn(Buffer.from(svg)).png().toFile(fp);
    results.push({ startSec: cue.startSec, endSec: cue.endSec, yPx, filePath: fp });
  }

  return results;
}

