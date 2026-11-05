import React from 'react';
import {
  AspectRatio,
  CropBox,
  FitMode,
  FULL_CROP,
  MediaAsset,
  MotionPresetId,
} from '@shared/schema';
import { computeClipMotionCssTransform } from '../utils/motionAndSfx';

interface Props {
  asset: MediaAsset;
  crop?: CropBox;
  fitMode?: FitMode;
  aspectRatio: AspectRatio;
  motion?: MotionPresetId;
  clipElapsedSec?: number;
  clipDurationSec?: number;
  videoRef?: React.RefObject<HTMLVideoElement | null>;
  muted?: boolean;
  onTimeUpdate?: React.ReactEventHandler<HTMLVideoElement>;
  onEnded?: React.ReactEventHandler<HTMLVideoElement>;
  onLoadedMetadata?: React.ReactEventHandler<HTMLVideoElement>;
}

function getStageRatioNum(ar: AspectRatio): number {
  if (ar === '9:16') return 9 / 16;
  if (ar === '16:9') return 16 / 9;
  return 1;
}

export const CroppedMediaFrame: React.FC<Props> = ({
  asset,
  crop = FULL_CROP,
  fitMode = 'cover',
  aspectRatio,
  motion = 'none',
  clipElapsedSec = 0,
  clipDurationSec = 1,
  videoRef,
  muted = false,
  onTimeUpdate,
  onEnded,
  onLoadedMetadata,
}) => {
  const c: CropBox = {
    x: Math.min(0.95, Math.max(0, crop?.x ?? 0)),
    y: Math.min(0.95, Math.max(0, crop?.y ?? 0)),
    w: Math.min(1, Math.max(0.08, crop?.w ?? 1)),
    h: Math.min(1, Math.max(0.08, crop?.h ?? 1)),
  };

  const srcW = asset.width || 1080;
  const srcH = asset.height || 1920;
  const croppedAspect = (srcW * c.w) / (srcH * c.h);
  const stageAspect = getStageRatioNum(aspectRatio);

  // Determine how the cropped viewport box fits inside the stage
  let boxStyle: React.CSSProperties;
  if (fitMode === 'cover') {
    if (croppedAspect > stageAspect) {
      // Wider than stage -> height 100%, width overflows & centers
      const wPct = (croppedAspect / stageAspect) * 100;
      boxStyle = {
        height: '100%',
        width: `${wPct}%`,
        left: `${(100 - wPct) / 2}%`,
        top: '0%',
      };
    } else {
      const hPct = (stageAspect / croppedAspect) * 100;
      boxStyle = {
        width: '100%',
        height: `${hPct}%`,
        left: '0%',
        top: `${(100 - hPct) / 2}%`,
      };
    }
  } else {
    // 'contain' or 'blur' -> fit inside stage without cutting cropped box
    if (croppedAspect > stageAspect) {
      const hPct = (stageAspect / croppedAspect) * 100;
      boxStyle = {
        width: '100%',
        height: `${hPct}%`,
        left: '0%',
        top: `${(100 - hPct) / 2}%`,
      };
    } else {
      const wPct = (croppedAspect / stageAspect) * 100;
      boxStyle = {
        height: '100%',
        width: `${wPct}%`,
        left: `${(100 - wPct) / 2}%`,
        top: '0%',
      };
    }
  }

  const innerMediaStyle: React.CSSProperties = {
    position: 'absolute',
    width: `${(100 / c.w).toFixed(3)}%`,
    height: `${(100 / c.h).toFixed(3)}%`,
    left: `${(-(c.x / c.w) * 100).toFixed(3)}%`,
    top: `${(-(c.y / c.h) * 100).toFixed(3)}%`,
    maxWidth: 'none',
    maxHeight: 'none',
    objectFit: 'fill',
  };

  const bgThumb = asset.thumbnailUrl || asset.url;
  const progress01 =
    clipDurationSec > 0.05 ? Math.min(1, Math.max(0, clipElapsedSec / clipDurationSec)) : 0;
  const motionTransform = computeClipMotionCssTransform(motion, progress01, clipElapsedSec);

  return (
    <div className="relative w-full h-full overflow-hidden bg-black">
      <div
        className="relative w-full h-full overflow-hidden"
        style={
          motionTransform !== 'none'
            ? {
                transform: motionTransform,
                transformOrigin: 'center center',
                willChange: 'transform',
              }
            : undefined
        }
      >
        {/* Frosted Gaussian Blur Background when fitMode === 'blur' */}
        {fitMode === 'blur' && bgThumb && (
          <img
            src={bgThumb}
            alt=""
            className="absolute inset-0 w-full h-full object-cover scale-115 blur-xl brightness-75 opacity-90 pointer-events-none"
          />
        )}

        {/* Cropped Foreground Viewport */}
        <div className="absolute overflow-hidden" style={boxStyle}>
          {asset.type === 'image' ? (
            <img src={asset.url} alt={asset.name} style={innerMediaStyle} draggable={false} />
          ) : (
            <video
              ref={videoRef as React.RefObject<HTMLVideoElement>}
              src={asset.url}
              style={innerMediaStyle}
              playsInline
              preload="auto"
              muted={muted}
              onTimeUpdate={onTimeUpdate}
              onEnded={onEnded}
              onLoadedMetadata={onLoadedMetadata}
            />
          )}
        </div>
      </div>
    </div>
  );
};
