import React, { useEffect, useRef, useState } from 'react';
import {
  Check,
  Crop as CropIcon,
  Pause,
  Play,
  RotateCcw,
  Scissors,
  Sparkles,
  X,
} from 'lucide-react';
import {
  CropBox,
  FIT_MODE_LABELS,
  FitMode,
  FULL_CROP,
  MediaAsset,
} from '@shared/schema';
import { formatDuration, formatShortSec } from '../utils/format';

export interface TrimCropResult {
  trimStart: number;
  trimEnd: number;
  speed: number;
  crop: CropBox;
  fitMode: FitMode;
  applyToAllInstances?: boolean;
}

interface Props {
  asset: MediaAsset;
  initialTrimStart: number;
  initialTrimEnd: number;
  initialSpeed?: number;
  initialCrop: CropBox;
  initialFitMode: FitMode;
  mode: 'clip' | 'asset';
  groupName?: string;
  onClose: () => void;
  onSave: (res: TrimCropResult) => void;
}

type DragHandle = 'move' | 'nw' | 'ne' | 'sw' | 'se' | null;

export const TrimCropModal: React.FC<Props> = ({
  asset,
  initialTrimStart,
  initialTrimEnd,
  initialSpeed = 1.0,
  initialCrop,
  initialFitMode,
  mode,
  groupName,
  onClose,
  onSave,
}) => {
  const [trimStart, setTrimStart] = useState(Math.max(0, initialTrimStart || 0));
  const [trimEnd, setTrimEnd] = useState(
    Math.max((initialTrimStart || 0) + 0.2, initialTrimEnd || asset.duration)
  );
  const [speed, setSpeed] = useState(initialSpeed || 1.0);
  const [crop, setCrop] = useState<CropBox>({ ...(initialCrop || FULL_CROP) });
  const [fitMode, setFitMode] = useState<FitMode>(initialFitMode || 'cover');
  const [syncAll, setSyncAll] = useState(false);

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(trimStart);
  const [lockedCropRatio, setLockedCropRatio] = useState<number | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const frameBoxRef = useRef<HTMLDivElement | null>(null);
  const timelineRef = useRef<HTMLDivElement | null>(null);

  const [cropDrag, setCropDrag] = useState<{
    handle: DragHandle;
    startClientX: number;
    startClientY: number;
    startCrop: CropBox;
  } | null>(null);

  const [trimDrag, setTrimDrag] = useState<'start' | 'end' | 'playhead' | null>(null);

  // Sync video playback speed & initial seek
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    v.playbackRate = speed;
    v.currentTime = trimStart;
    setCurrentTime(trimStart);
  }, []);

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.playbackRate = speed;
    }
  }, [speed]);

  const togglePlay = () => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) {
      if (v.currentTime < trimStart || v.currentTime >= trimEnd - 0.05) {
        v.currentTime = trimStart;
      }
      v.play().then(() => setIsPlaying(true)).catch(() => {});
    } else {
      v.pause();
      setIsPlaying(false);
    }
  };

  const handleTimeUpdate = () => {
    const v = videoRef.current;
    if (!v) return;
    setCurrentTime(v.currentTime);
    if (v.currentTime >= trimEnd) {
      v.currentTime = trimStart;
      if (!v.paused) {
        void v.play();
      }
    }
  };

  // Spatial Crop mouse move
  useEffect(() => {
    if (!cropDrag) return;
    const onMove = (e: MouseEvent) => {
      const box = frameBoxRef.current?.getBoundingClientRect();
      if (!box || box.width <= 0 || box.height <= 0) return;
      const dx = (e.clientX - cropDrag.startClientX) / box.width;
      const dy = (e.clientY - cropDrag.startClientY) / box.height;
      const s = cropDrag.startCrop;

      if (cropDrag.handle === 'move') {
        const nx = Math.min(1 - s.w, Math.max(0, s.x + dx));
        const ny = Math.min(1 - s.h, Math.max(0, s.y + dy));
        setCrop({ x: nx, y: ny, w: s.w, h: s.h });
        return;
      }

      let x1 = s.x;
      let y1 = s.y;
      let x2 = s.x + s.w;
      let y2 = s.y + s.h;

      if (cropDrag.handle === 'nw') {
        x1 = Math.min(x2 - 0.12, Math.max(0, s.x + dx));
        y1 = Math.min(y2 - 0.12, Math.max(0, s.y + dy));
      } else if (cropDrag.handle === 'ne') {
        x2 = Math.max(x1 + 0.12, Math.min(1, s.x + s.w + dx));
        y1 = Math.min(y2 - 0.12, Math.max(0, s.y + dy));
      } else if (cropDrag.handle === 'sw') {
        x1 = Math.min(x2 - 0.12, Math.max(0, s.x + dx));
        y2 = Math.max(y1 + 0.12, Math.min(1, s.y + s.h + dy));
      } else if (cropDrag.handle === 'se') {
        x2 = Math.max(x1 + 0.12, Math.min(1, s.x + s.w + dx));
        y2 = Math.max(y1 + 0.12, Math.min(1, s.y + s.h + dy));
      }

      let nw = x2 - x1;
      let nh = y2 - y1;

      if (lockedCropRatio && asset.width > 0 && asset.height > 0) {
        // Maintain visual pixel ratio: (asset.width * nw) / (asset.height * nh) = lockedCropRatio
        const desiredNh = (asset.width * nw) / (asset.height * lockedCropRatio);
        if (y1 + desiredNh <= 1) {
          nh = desiredNh;
        } else {
          nh = 1 - y1;
          nw = Math.min(1 - x1, (asset.height * nh * lockedCropRatio) / asset.width);
        }
      }

      setCrop({
        x: Math.max(0, x1),
        y: Math.max(0, y1),
        w: Math.max(0.1, Math.min(1 - x1, nw)),
        h: Math.max(0.1, Math.min(1 - y1, nh)),
      });
    };

    const onUp = () => setCropDrag(null);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [cropDrag, lockedCropRatio, asset.width, asset.height]);

  // Timeline Trim handle drag
  useEffect(() => {
    if (!trimDrag) return;
    const onMove = (e: MouseEvent) => {
      const bar = timelineRef.current?.getBoundingClientRect();
      if (!bar || bar.width <= 0) return;
      const ratio = Math.min(1, Math.max(0, (e.clientX - bar.left) / bar.width));
      const sec = Math.round(ratio * asset.duration * 20) / 20; // 0.05s precision

      if (trimDrag === 'start') {
        const nextStart = Math.min(trimEnd - 0.2, Math.max(0, sec));
        setTrimStart(nextStart);
        if (videoRef.current) videoRef.current.currentTime = nextStart;
        setCurrentTime(nextStart);
      } else if (trimDrag === 'end') {
        const nextEnd = Math.max(trimStart + 0.2, Math.min(asset.duration, sec));
        setTrimEnd(nextEnd);
        if (videoRef.current) videoRef.current.currentTime = Math.max(trimStart, nextEnd - 0.05);
        setCurrentTime(nextEnd);
      } else if (trimDrag === 'playhead') {
        const clamped = Math.min(trimEnd, Math.max(trimStart, sec));
        if (videoRef.current) videoRef.current.currentTime = clamped;
        setCurrentTime(clamped);
      }
    };
    const onUp = () => setTrimDrag(null);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [trimDrag, trimStart, trimEnd, asset.duration]);

  const applyPresetCropRatio = (targetVisualRatio: number | null) => {
    setLockedCropRatio(targetVisualRatio);
    if (targetVisualRatio === null) return;
    const srcW = asset.width || 1080;
    const srcH = asset.height || 1920;
    const srcRatio = srcW / srcH;

    if (srcRatio > targetVisualRatio) {
      // Source wider than target -> full height, centered width
      const w = Math.min(1, targetVisualRatio / srcRatio);
      setCrop({ x: (1 - w) / 2, y: 0, w, h: 1 });
    } else {
      const h = Math.min(1, srcRatio / targetVisualRatio);
      setCrop({ x: 0, y: (1 - h) / 2, w: 1, h });
    }
  };

  const resetAll = () => {
    setTrimStart(0);
    setTrimEnd(asset.duration);
    setSpeed(1.0);
    setCrop({ ...FULL_CROP });
    setLockedCropRatio(null);
  };

  const rawDuration = Math.max(0.2, trimEnd - trimStart);
  const effectiveDuration = rawDuration / speed;

  // Compute source stage aspect ratio display dimensions
  const srcRatio = (asset.width || 1080) / (asset.height || 1920);

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-5xl bg-[#181920] border border-[#2C303D] rounded-xl shadow-2xl flex flex-col max-h-[92vh] overflow-hidden">
        {/* Header */}
        <div className="px-5 py-3.5 border-b border-[#262934] flex items-center justify-between bg-[#14151B]">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-[#00E5FF]/15 border border-[#00E5FF]/40 flex items-center justify-center text-[#00E5FF]">
              <Scissors className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                精准裁剪工作台 · {asset.name}
                <span className="text-[11px] font-normal px-2 py-0.5 rounded bg-[#252834] text-[#9CA3AF]">
                  {mode === 'clip' ? `编辑片段 (${groupName || '视频组'})` : '编辑素材库默认裁剪'}
                </span>
              </h3>
              <p className="text-[11px] text-[#8A90A2]">
                原始尺寸 {asset.width}×{asset.height} · 原片时长 {formatShortSec(asset.duration)} · 拖拽画面黄框可裁切构图，拖拽下方滑块截取起止时间
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={resetAll}
              className="px-2.5 py-1.5 rounded-md text-xs text-[#A6ADBB] hover:text-white hover:bg-[#252834] flex items-center gap-1 transition"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              重置全部
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-md text-[#8A90A2] hover:text-white hover:bg-[#252834]"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Main Workspace Body */}
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 min-h-0 overflow-y-auto">
          {/* Left/Center: Interactive Visual Crop Stage */}
          <div className="lg:col-span-8 p-4 flex flex-col items-center justify-center stage-grid border-b lg:border-b-0 lg:border-r border-[#262934] min-h-[340px]">
            <div
              ref={frameBoxRef}
              className="relative shadow-2xl bg-black select-none overflow-hidden rounded"
              style={{
                aspectRatio: `${asset.width || 9} / ${asset.height || 16}`,
                maxHeight: '380px',
                maxWidth: '100%',
                height: srcRatio <= 1 ? '370px' : 'auto',
                width: srcRatio > 1 ? '540px' : 'auto',
              }}
            >
              {asset.type === 'image' ? (
                <img
                  src={asset.url}
                  alt={asset.name}
                  className="w-full h-full object-fill pointer-events-none"
                />
              ) : (
                <video
                  ref={videoRef}
                  src={asset.url}
                  className="w-full h-full object-fill pointer-events-none"
                  playsInline
                  onTimeUpdate={handleTimeUpdate}
                />
              )}

              {/* Darkened Outside Mask + Interactive Jianying Crop Box */}
              <div
                className="absolute border-2 border-[#FFB800] cursor-move"
                style={{
                  left: `${crop.x * 100}%`,
                  top: `${crop.y * 100}%`,
                  width: `${crop.w * 100}%`,
                  height: `${crop.h * 100}%`,
                  boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.62)',
                }}
                onMouseDown={(e) => {
                  e.stopPropagation();
                  setCropDrag({
                    handle: 'move',
                    startClientX: e.clientX,
                    startClientY: e.clientY,
                    startCrop: { ...crop },
                  });
                }}
              >
                {/* Rule of Thirds Grid */}
                <div className="absolute inset-0 grid grid-cols-3 grid-rows-3 pointer-events-none">
                  {Array.from({ length: 9 }).map((_, idx) => (
                    <div key={idx} className="border border-white/20" />
                  ))}
                </div>

                {/* Dimensions pill */}
                <div className="absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded bg-black/75 text-[10px] text-[#FFB800] font-mono pointer-events-none">
                  {Math.round((asset.width || 1080) * crop.w)}×
                  {Math.round((asset.height || 1920) * crop.h)}
                </div>

                {/* 4 Corner Handles */}
                {(['nw', 'ne', 'sw', 'se'] as const).map((h) => {
                  const posCls =
                    h === 'nw'
                      ? '-top-1.5 -left-1.5 cursor-nwse-resize'
                      : h === 'ne'
                      ? '-top-1.5 -right-1.5 cursor-nesw-resize'
                      : h === 'sw'
                      ? '-bottom-1.5 -left-1.5 cursor-nesw-resize'
                      : '-bottom-1.5 -right-1.5 cursor-nwse-resize';
                  return (
                    <div
                      key={h}
                      className={`absolute w-3.5 h-3.5 bg-[#FFB800] border-2 border-[#14151B] rounded-sm ${posCls}`}
                      onMouseDown={(e) => {
                        e.stopPropagation();
                        setCropDrag({
                          handle: h,
                          startClientX: e.clientX,
                          startClientY: e.clientY,
                          startCrop: { ...crop },
                        });
                      }}
                    />
                  );
                })}
              </div>
            </div>

            {/* Playback bar below stage */}
            {asset.type === 'video' && (
              <div className="mt-3 flex items-center gap-3 text-xs">
                <button
                  onClick={togglePlay}
                  className="px-3 py-1.5 rounded-full bg-[#00E5FF] text-[#091016] font-semibold flex items-center gap-1.5 hover:brightness-110 transition"
                >
                  {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                  {isPlaying ? '暂停预览' : '循环预览截取段'}
                </button>
                <span className="font-mono text-[#D1D5DB]">
                  当前 {formatDuration(currentTime)}
                </span>
                <button
                  onClick={() => {
                    const next = Math.min(trimEnd - 0.2, Math.max(0, currentTime));
                    setTrimStart(Math.round(next * 20) / 20);
                  }}
                  className="px-2 py-1 rounded bg-[#252834] hover:bg-[#313646] text-[#FFB800] font-mono text-[11px]"
                  title="将当前播放时间设为入点 ["
                >
                  [ 设为入点
                </button>
                <button
                  onClick={() => {
                    const next = Math.max(trimStart + 0.2, Math.min(asset.duration, currentTime));
                    setTrimEnd(Math.round(next * 20) / 20);
                  }}
                  className="px-2 py-1 rounded bg-[#252834] hover:bg-[#313646] text-[#FFB800] font-mono text-[11px]"
                  title="将当前播放时间设为出点 ]"
                >
                  设为出点 ]
                </button>
              </div>
            )}
          </div>

          {/* Right Column: Spatial Crop Presets & Fit Mode & Speed */}
          <div className="lg:col-span-4 p-4 space-y-4 bg-[#181920]">
            <div>
              <div className="flex items-center gap-1.5 text-xs font-semibold text-white mb-2">
                <CropIcon className="w-3.5 h-3.5 text-[#00E5FF]" />
                画面构图框选比例
              </div>
              <div className="grid grid-cols-3 gap-1.5">
                {[
                  { label: '满画幅 100%', action: () => { setLockedCropRatio(null); setCrop({ ...FULL_CROP }); } },
                  { label: '自由比例', action: () => setLockedCropRatio(null) },
                  { label: '9:16 竖屏', action: () => applyPresetCropRatio(9 / 16) },
                  { label: '16:9 横屏', action: () => applyPresetCropRatio(16 / 9) },
                  { label: '1:1 方形', action: () => applyPresetCropRatio(1) },
                  { label: '4:3 经典', action: () => applyPresetCropRatio(4 / 3) },
                ].map((btn) => (
                  <button
                    key={btn.label}
                    onClick={btn.action}
                    className="px-2 py-1.5 rounded bg-[#232632] hover:bg-[#2E3242] border border-[#303444] text-[11px] text-[#E5E7EB] transition"
                  >
                    {btn.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <div className="flex items-center gap-1.5 text-xs font-semibold text-white mb-2">
                <Sparkles className="w-3.5 h-3.5 text-[#00E5FF]" />
                目标成片画布适配方式
              </div>
              <div className="space-y-1.5">
                {(['cover', 'blur', 'contain'] as FitMode[]).map((fm) => (
                  <button
                    key={fm}
                    onClick={() => setFitMode(fm)}
                    className={`w-full text-left px-3 py-2 rounded-lg border text-xs transition flex items-center justify-between ${
                      fitMode === fm
                        ? 'bg-[#00E5FF]/12 border-[#00E5FF] text-white'
                        : 'bg-[#21242F] border-[#2C303F] text-[#A6ADBB] hover:text-white'
                    }`}
                  >
                    <span>{FIT_MODE_LABELS[fm]}</span>
                    {fitMode === fm && <Check className="w-3.5 h-3.5 text-[#00E5FF]" />}
                  </button>
                ))}
              </div>
            </div>

            {asset.type === 'video' ? (
              <div>
                <div className="flex items-center justify-between text-xs font-semibold text-white mb-2">
                  <span>片段变速 (Speed)</span>
                  <span className="text-[#00E5FF] font-mono">{speed.toFixed(2)}x</span>
                </div>
                <div className="grid grid-cols-6 gap-1">
                  {[0.5, 0.75, 1.0, 1.25, 1.5, 2.0].map((spd) => (
                    <button
                      key={spd}
                      onClick={() => setSpeed(spd)}
                      className={`py-1.5 rounded text-[11px] font-mono border transition ${
                        Math.abs(speed - spd) < 0.01
                          ? 'bg-[#00E5FF] text-[#091016] font-bold border-[#00E5FF]'
                          : 'bg-[#21242F] border-[#2C303F] text-[#B8C0D0] hover:text-white'
                      }`}
                    >
                      {spd}x
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div>
                <div className="flex items-center justify-between text-xs font-semibold text-white mb-2">
                  <span>图片展示时长</span>
                  <span className="text-[#00E5FF] font-mono">{trimEnd.toFixed(1)}s</span>
                </div>
                <input
                  type="range"
                  min={0.5}
                  max={12}
                  step={0.5}
                  value={trimEnd}
                  onChange={(e) => {
                    setTrimStart(0);
                    setTrimEnd(parseFloat(e.target.value));
                  }}
                  className="w-full jy-slider"
                />
              </div>
            )}

            <div className="p-3 rounded-lg bg-[#13141A] border border-[#252836] space-y-1.5 text-xs">
              <div className="flex justify-between text-[#9CA3AF]">
                <span>截取区间：</span>
                <span className="font-mono text-white">
                  {formatShortSec(trimStart)} → {formatShortSec(trimEnd)}
                </span>
              </div>
              <div className="flex justify-between text-[#9CA3AF]">
                <span>成片实际净时长：</span>
                <span className="font-mono text-[#00E5FF] font-semibold">
                  {formatShortSec(effectiveDuration)}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom Jianying Filmstrip Time Trimmer */}
        {asset.type === 'video' && (
          <div className="px-5 py-3.5 bg-[#13141A] border-t border-[#262934] space-y-2">
            <div className="flex items-center justify-between text-[11px] text-[#9CA3AF]">
              <div className="flex items-center gap-3">
                <span>
                  入点 <strong className="text-[#FFB800] font-mono">{trimStart.toFixed(2)}s</strong>
                </span>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setTrimStart((s) => Math.max(0, +(s - 0.1).toFixed(2)))}
                    className="px-1.5 py-0.5 rounded bg-[#222530] hover:bg-[#2F3342] text-white"
                  >
                    -0.1s
                  </button>
                  <button
                    onClick={() =>
                      setTrimStart((s) => Math.min(trimEnd - 0.2, +(s + 0.1).toFixed(2)))
                    }
                    className="px-1.5 py-0.5 rounded bg-[#222530] hover:bg-[#2F3342] text-white"
                  >
                    +0.1s
                  </button>
                </div>
              </div>

              <span className="text-[#00E5FF] font-medium">
                已选定区间：{rawDuration.toFixed(2)}s (变速后 {effectiveDuration.toFixed(2)}s)
              </span>

              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1">
                  <button
                    onClick={() =>
                      setTrimEnd((e) => Math.max(trimStart + 0.2, +(e - 0.1).toFixed(2)))
                    }
                    className="px-1.5 py-0.5 rounded bg-[#222530] hover:bg-[#2F3342] text-white"
                  >
                    -0.1s
                  </button>
                  <button
                    onClick={() =>
                      setTrimEnd((e) => Math.min(asset.duration, +(e + 0.1).toFixed(2)))
                    }
                    className="px-1.5 py-0.5 rounded bg-[#222530] hover:bg-[#2F3342] text-white"
                  >
                    +0.1s
                  </button>
                </div>
                <span>
                  出点 <strong className="text-[#FFB800] font-mono">{trimEnd.toFixed(2)}s</strong>
                </span>
              </div>
            </div>

            {/* Filmstrip Track */}
            <div
              ref={timelineRef}
              className="relative h-14 rounded-lg bg-[#1D202A] overflow-hidden select-none cursor-pointer border border-[#2D3140]"
              onMouseDown={(e) => {
                const bar = timelineRef.current?.getBoundingClientRect();
                if (!bar) return;
                const ratio = Math.min(1, Math.max(0, (e.clientX - bar.left) / bar.width));
                const sec = Math.min(trimEnd, Math.max(trimStart, ratio * asset.duration));
                if (videoRef.current) videoRef.current.currentTime = sec;
                setCurrentTime(sec);
                setTrimDrag('playhead');
              }}
            >
              {/* Filmstrip frames */}
              <div className="absolute inset-0 flex">
                {(asset.filmstripUrls?.length ? asset.filmstripUrls : [asset.thumbnailUrl]).map(
                  (u, idx) =>
                    u ? (
                      <img
                        key={idx}
                        src={u}
                        alt=""
                        className="flex-1 h-full object-cover opacity-80 pointer-events-none"
                      />
                    ) : (
                      <div key={idx} className="flex-1 h-full bg-[#242836]" />
                    )
                )}
              </div>

              {/* Left trimmed-out dim region */}
              <div
                className="absolute inset-y-0 left-0 bg-black/72 pointer-events-none"
                style={{ width: `${(trimStart / asset.duration) * 100}%` }}
              />
              {/* Right trimmed-out dim region */}
              <div
                className="absolute inset-y-0 right-0 bg-black/72 pointer-events-none"
                style={{ width: `${Math.max(0, 1 - trimEnd / asset.duration) * 100}%` }}
              />

              {/* Active Jianying Golden Trim Bracket */}
              <div
                className="absolute inset-y-0 border-y-[3px] border-[#FFB800] pointer-events-none"
                style={{
                  left: `${(trimStart / asset.duration) * 100}%`,
                  width: `${((trimEnd - trimStart) / asset.duration) * 100}%`,
                }}
              />

              {/* Left Handle [ */}
              <div
                className="absolute inset-y-0 w-3.5 -ml-1.5 bg-[#FFB800] rounded-l flex items-center justify-center cursor-ew-resize z-10 shadow"
                style={{ left: `${(trimStart / asset.duration) * 100}%` }}
                onMouseDown={(e) => {
                  e.stopPropagation();
                  setTrimDrag('start');
                }}
              >
                <div className="w-0.5 h-5 bg-[#14151B] rounded" />
              </div>

              {/* Right Handle ] */}
              <div
                className="absolute inset-y-0 w-3.5 -ml-2 bg-[#FFB800] rounded-r flex items-center justify-center cursor-ew-resize z-10 shadow"
                style={{ left: `${(trimEnd / asset.duration) * 100}%` }}
                onMouseDown={(e) => {
                  e.stopPropagation();
                  setTrimDrag('end');
                }}
              >
                <div className="w-0.5 h-5 bg-[#14151B] rounded" />
              </div>

              {/* Playhead Needle */}
              <div
                className="absolute inset-y-0 w-0.5 bg-white shadow-[0_0_6px_#fff] z-20 pointer-events-none"
                style={{ left: `${(currentTime / asset.duration) * 100}%` }}
              >
                <div className="w-2.5 h-2.5 -ml-1 -mt-0.5 rounded-full bg-white" />
              </div>
            </div>
          </div>
        )}

        {/* Footer Actions */}
        <div className="px-5 py-3 bg-[#14151B] border-t border-[#262934] flex flex-wrap items-center justify-between gap-3">
          <label className="flex items-center gap-2 text-xs text-[#B8C0D0] cursor-pointer">
            <input
              type="checkbox"
              checked={syncAll}
              onChange={(e) => setSyncAll(e.target.checked)}
              className="rounded border-[#383D4E] accent-[#00E5FF]"
            />
            {mode === 'clip'
              ? '同时设为该原素材默认裁剪，并同步更新其他视频组中的同源片段'
              : '同步更新所有视频组中已引用该素材的片段'}
          </label>

          <div className="flex items-center gap-2.5">
            <button
              onClick={onClose}
              className="px-4 py-1.5 rounded-lg bg-[#252834] hover:bg-[#303443] text-xs text-[#D1D5DB] transition"
            >
              取消
            </button>
            <button
              onClick={() =>
                onSave({
                  trimStart,
                  trimEnd,
                  speed,
                  crop,
                  fitMode,
                  applyToAllInstances: syncAll,
                })
              }
              className="px-5 py-1.5 rounded-lg bg-gradient-to-r from-[#00E5FF] to-[#00B8D9] text-[#071016] font-semibold text-xs hover:brightness-110 transition flex items-center gap-1.5"
            >
              <Check className="w-4 h-4" />
              确认应用裁剪
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
