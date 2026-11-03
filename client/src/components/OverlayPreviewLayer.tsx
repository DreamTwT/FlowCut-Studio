import React from 'react';
import {
  AspectRatio,
  GroupOverlayConfig,
  SUBTITLE_STYLES,
  SubtitleConfig,
  TITLE_STYLES,
  WatermarkConfig,
} from '@shared/schema';

interface Props {
  overlay?: GroupOverlayConfig;
  subtitles?: SubtitleConfig;
  currentTimeSec?: number;
  watermark?: WatermarkConfig;
  watermarkImageUrl?: string | null;
  aspectRatio: AspectRatio;
  showSafeZone?: boolean;
}

function normalizeDisplayLine(raw: string): string {
  return raw
    .replace(/🔥/g, '★ ')
    .replace(/👇/g, '▼ ')
    .replace(/👆/g, '▲ ')
    .replace(/⚡/g, '✦ ')
    .replace(/💎/g, '◆ ')
    .replace(/🎯/g, '◎ ')
    .replace(/💡/g, '✦ ')
    .replace(/✅/g, '✓ ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function splitBalancedLines(raw: string, maxChars: number): string[] {
  const manual = raw
    .split(/\r?\n/)
    .map((l) => normalizeDisplayLine(l))
    .filter(Boolean);
  const out: string[] = [];
  for (const line of manual) {
    const chars = Array.from(line);
    if (chars.length <= maxChars) {
      out.push(line);
    } else if (chars.length <= maxChars * 2) {
      const mid = Math.ceil(chars.length / 2);
      let splitAt = mid;
      for (let offset = 0; offset <= 3; offset++) {
        for (const cand of [mid + offset, mid - offset]) {
          if (cand > 3 && cand < chars.length - 3) {
            if ('！!？?，,。·：: '.includes(chars[cand - 1])) {
              splitAt = cand;
              offset = 99;
              break;
            }
          }
        }
      }
      out.push(chars.slice(0, splitAt).join('').trim());
      out.push(chars.slice(splitAt).join('').trim());
    } else {
      const third = Math.ceil(chars.length / 3);
      out.push(chars.slice(0, third).join('').trim());
      out.push(chars.slice(third, third * 2).join('').trim());
      out.push(chars.slice(third * 2).join('').trim());
    }
  }
  return out.filter(Boolean).slice(0, 3);
}

function estimateEm(line: string): number {
  let w = 0;
  for (const ch of line) {
    w += ch.charCodeAt(0) > 255 ? 1.02 : 0.6;
  }
  return w;
}

export const OverlayPreviewLayer: React.FC<Props> = ({
  overlay,
  subtitles,
  currentTimeSec = 0,
  watermark,
  watermarkImageUrl,
  aspectRatio,
  showSafeZone = false,
}) => {
  const W = aspectRatio === '16:9' ? 1920 : 1080;
  const H = aspectRatio === '9:16' ? 1920 : 1080;
  const baseUnit = Math.min(W, H);

  const style = overlay
    ? TITLE_STYLES[overlay.styleId] || TITLE_STYLES.douyin_yellow
    : TITLE_STYLES.douyin_yellow;
  const scale = Math.min(1.6, Math.max(0.6, overlay?.fontScale || 1.0));

  const activeCue =
    subtitles?.enabled && subtitles.cues?.length
      ? subtitles.cues.find(
          (c) => currentTimeSec >= c.startSec && currentTimeSec <= c.endSec
        ) || null
      : null;

  const renderSubtitleSvg = () => {
    if (!activeCue || !subtitles) return null;
    const subStyle = SUBTITLE_STYLES[subtitles.styleId] || SUBTITLE_STYLES.douyin_yellow;
    const subScale = Math.min(1.6, Math.max(0.65, subtitles.fontScale || 1.0));
    const lines = splitBalancedLines(activeCue.text, W >= H ? 24 : 15).slice(0, 2);
    if (!lines.length) return null;

    const fontSize = Math.max(18, Math.round(baseUnit * 0.048 * subScale));
    const lineHeight = Math.round(fontSize * 1.32);
    const maxEm = Math.max(...lines.map(estimateEm));
    const padX = Math.round(fontSize * 0.68);
    const padY = Math.round(fontSize * 0.34);
    const boxW = Math.min(Math.round(W * 0.92), Math.round(maxEm * fontSize + padX * 2));
    const boxH = Math.round(lines.length * lineHeight + padY * 1.3);
    const boxX = Math.round((W - boxW) / 2);
    const centerY = Math.round(
      (H * Math.min(93, Math.max(10, subtitles.yPercent || 74))) / 100
    );
    const boxY = Math.round(centerY - boxH / 2);
    const strokeW = Math.round((subStyle.strokeWidth / 1080) * baseUnit);

    return (
      <g key="active-subtitle">
        {subStyle.bgColor && subStyle.bgOpacity > 0 && (
          <rect
            x={boxX}
            y={boxY}
            width={boxW}
            height={boxH}
            rx={Math.round(Math.min(boxH / 2, fontSize * 0.55))}
            fill={subStyle.bgColor}
            fillOpacity={subStyle.bgOpacity}
            style={{ filter: 'drop-shadow(0px 4px 8px rgba(0,0,0,0.5))' }}
          />
        )}
        {lines.map((line, idx) => {
          const ty = boxY + Math.round(padY * 0.72) + Math.round((idx + 0.82) * lineHeight);
          return (
            <text
              key={`sub_${idx}`}
              x={Math.round(W / 2)}
              y={ty}
              fontSize={fontSize}
              fontWeight={900}
              fill={subStyle.textColor}
              textAnchor="middle"
              stroke={strokeW > 0 ? subStyle.strokeColor : 'none'}
              strokeWidth={strokeW}
              strokeLinejoin="round"
              style={{
                paintOrder: 'stroke fill',
                filter: !subStyle.bgColor
                  ? 'drop-shadow(0px 4px 7px rgba(0,0,0,0.8))'
                  : undefined,
              }}
            >
              {line}
            </text>
          );
        })}
      </g>
    );
  };

  const renderWatermarkSvg = () => {
    if (!watermark || !watermark.enabled) return null;
    const wmScale = Math.min(2.2, Math.max(0.4, watermark.scale || 1.0));
    const wmOp = Math.min(1, Math.max(0.1, watermark.opacity ?? 0.82));
    const mx = Math.round((W * Math.min(35, Math.max(1, watermark.offsetX ?? 4.5))) / 100);
    const my = Math.round((H * Math.min(35, Math.max(1, watermark.offsetY ?? 4.0))) / 100);

    if (watermark.mode === 'image' && watermarkImageUrl) {
      const boxW = Math.round(baseUnit * 0.16 * wmScale);
      const boxH = Math.round(baseUnit * 0.12 * wmScale);
      const x =
        watermark.corner === 'top_right' || watermark.corner === 'bottom_right'
          ? W - mx - boxW
          : mx;
      const y =
        watermark.corner === 'bottom_left' || watermark.corner === 'bottom_right'
          ? H - my - boxH
          : my;
      return (
        <image
          href={watermarkImageUrl}
          x={x}
          y={y}
          width={boxW}
          height={boxH}
          opacity={wmOp}
          preserveAspectRatio="xMidYMid meet"
        />
      );
    }

    const label = normalizeDisplayLine(watermark.text || '');
    if (!label) return null;
    const fSize = Math.max(14, Math.round(baseUnit * 0.028 * wmScale));
    const estW = Math.round(estimateEm(label) * fSize + fSize * 1.3);
    const pillH = Math.round(fSize * 1.72);
    const bx =
      watermark.corner === 'top_right' || watermark.corner === 'bottom_right'
        ? W - mx - estW
        : mx;
    const by =
      watermark.corner === 'bottom_left' || watermark.corner === 'bottom_right'
        ? H - my - pillH
        : my;

    return (
      <g opacity={wmOp}>
        <rect
          x={bx}
          y={by}
          width={estW}
          height={pillH}
          rx={Math.round(pillH / 2)}
          fill="#0C0F16"
          fillOpacity={0.55}
          stroke="#FFFFFF"
          strokeOpacity={0.25}
          strokeWidth={Math.max(1.5, Math.round(baseUnit * 0.0018))}
        />
        <text
          x={Math.round(bx + estW / 2)}
          y={Math.round(by + pillH * 0.67)}
          fontSize={fSize}
          fontWeight={700}
          fill="#FFFFFF"
          textAnchor="middle"
        >
          {label}
        </text>
      </g>
    );
  };

  const renderSvgBlock = (
    text: string,
    yPercent: number,
    fontRatio: number,
    maxChars: number,
    isBottom: boolean,
    keyPrefix: string
  ) => {
    const lines = splitBalancedLines(text, maxChars);
    if (!lines.length) return null;

    const fontSize = Math.round(baseUnit * fontRatio * scale);
    const lineHeight = Math.round(fontSize * 1.32);
    const maxEm = Math.max(...lines.map(estimateEm));
    const padX = Math.round(fontSize * 0.78);
    const padY = Math.round(fontSize * 0.42);
    const boxW = Math.min(Math.round(W * 0.92), Math.round(maxEm * fontSize + padX * 2));
    const boxH = Math.round(lines.length * lineHeight + padY * 1.5);
    const boxX = Math.round((W - boxW) / 2);
    const centerY = Math.round((H * Math.min(93, Math.max(7, yPercent))) / 100);
    const boxY = Math.round(centerY - boxH / 2);
    const strokeW = Math.round((style.strokeWidth / 1080) * baseUnit * (isBottom ? 0.85 : 1));
    const rx = Math.round(Math.min(boxH / 2, fontSize * 0.72));

    return (
      <g key={keyPrefix}>
        {style.bgColor && style.bgOpacity > 0 && (
          <rect
            x={boxX}
            y={boxY}
            width={boxW}
            height={boxH}
            rx={rx}
            fill={style.bgColor}
            fillOpacity={style.bgOpacity}
            stroke={style.borderColor || 'none'}
            strokeWidth={style.borderColor ? Math.max(2, Math.round(baseUnit * 0.003)) : 0}
            style={{ filter: 'drop-shadow(0px 6px 10px rgba(0,0,0,0.55))' }}
          />
        )}
        {lines.map((line, idx) => {
          const textY = boxY + Math.round(padY * 0.75) + Math.round((idx + 0.82) * lineHeight);
          return (
            <text
              key={`${keyPrefix}_${idx}`}
              x={Math.round(W / 2)}
              y={textY}
              fontSize={fontSize}
              fontWeight={900}
              fill={style.textColor}
              textAnchor="middle"
              stroke={strokeW > 0 ? style.strokeColor : 'none'}
              strokeWidth={strokeW}
              strokeLinejoin="round"
              style={{
                paintOrder: 'stroke fill',
                filter: !style.bgColor ? 'drop-shadow(0px 5px 8px rgba(0,0,0,0.75))' : undefined,
              }}
            >
              {line}
            </text>
          );
        })}
      </g>
    );
  };

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full h-full"
        preserveAspectRatio="xMidYMid meet"
      >
        {overlay?.topTitle?.trim() &&
          renderSvgBlock(
            overlay.topTitle,
            overlay.topY || 13,
            0.06,
            W >= H ? 19 : 14,
            false,
            'top'
          )}
        {overlay?.bottomTitle?.trim() &&
          renderSvgBlock(
            overlay.bottomTitle,
            overlay.bottomY || 83,
            0.045,
            W >= H ? 24 : 18,
            true,
            'bottom'
          )}

        {renderWatermarkSvg()}
        {renderSubtitleSvg()}

        {/* Clean Jianying-Style SVG Proportional Safe Zone Guide (never warps or overflows!) */}
        {showSafeZone && aspectRatio === '9:16' && (
          <g opacity="0.88">
            {/* Top Status & Search Safe Line (8%) */}
            <rect x="0" y="0" width={W} height={H * 0.08} fill="#FF4D4F" fillOpacity="0.14" />
            <line
              x1="0"
              y1={H * 0.08}
              x2={W}
              y2={H * 0.08}
              stroke="#FF7875"
              strokeWidth="3"
              strokeDasharray="14 10"
            />
            <text
              x={W / 2}
              y={H * 0.052}
              fontSize="28"
              fontWeight="700"
              fill="#FECACA"
              textAnchor="middle"
            >
              顶部状态与搜索栏遮挡区
            </text>

            {/* Right Interaction Column (right 15%, y 40%..81%) */}
            <rect
              x={W * 0.84}
              y={H * 0.4}
              width={W * 0.16}
              height={H * 0.41}
              fill="#FFB800"
              fillOpacity="0.12"
            />
            <line
              x1={W * 0.84}
              y1={H * 0.4}
              x2={W * 0.84}
              y2={H * 0.81}
              stroke="#FFD666"
              strokeWidth="3"
              strokeDasharray="12 10"
            />
            {[0.46, 0.55, 0.64, 0.73].map((ry, i) => (
              <circle
                key={i}
                cx={W * 0.92}
                cy={H * ry}
                r={i === 0 ? 38 : 30}
                fill="#000000"
                fillOpacity="0.35"
                stroke="#FFD666"
                strokeWidth="3"
              />
            ))}

            {/* Bottom Account & Ad Conversion Card Zone (bottom 19%) */}
            <rect
              x="0"
              y={H * 0.81}
              width={W}
              height={H * 0.19}
              fill="#FF4D4F"
              fillOpacity="0.15"
            />
            <line
              x1="0"
              y1={H * 0.81}
              x2={W}
              y2={H * 0.81}
              stroke="#FF7875"
              strokeWidth="3"
              strokeDasharray="14 10"
            />
            <rect
              x={W * 0.04}
              y={H * 0.89}
              width={W * 0.65}
              height={H * 0.065}
              rx="16"
              fill="#000000"
              fillOpacity="0.4"
              stroke="#FF7875"
              strokeWidth="2"
            />
            <text
              x={W * 0.07}
              y={H * 0.86}
              fontSize="28"
              fontWeight="700"
              fill="#FECACA"
            >
              底部账号文案 &amp; 广告转化卡片遮挡区
            </text>
            <text
              x={W * 0.365}
              y={H * 0.932}
              fontSize="26"
              fontWeight="700"
              fill="#FDE68A"
              textAnchor="middle"
            >
              [ 广告行动号召组件位 ]
            </text>
          </g>
        )}
      </svg>
    </div>
  );
};
