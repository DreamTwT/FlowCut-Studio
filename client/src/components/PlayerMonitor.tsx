import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Film,
  Mic,
  Music,
  Pause,
  Play,
  Scissors,
  ShieldAlert,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
  Zap,
} from 'lucide-react';
import {
  AspectRatio,
  getClipEffectiveDuration,
  MediaAsset,
  TimelineClip,
  VideoGroup,
} from '@shared/schema';
import { SequenceClipLayer } from './SequenceClipLayer';
import { buildTransitionTimeline, buildTimelineSfxEvents, activeTimelineIndex, getMasterSpeedFactor } from '@shared/previewTimeline';
import { getPreviewLayers } from '../utils/transitionPreview';
import { OverlayPreviewLayer } from './OverlayPreviewLayer';
import { formatDuration, formatShortSec } from '../utils/format';
import { playBuiltinSfxPreview } from '../utils/motionAndSfx';

export type MonitorMode = 'program' | 'source';

interface Props {
  mode: MonitorMode;
  onChangeMode: (m: MonitorMode) => void;
  aspectRatio: AspectRatio;
  sourceAsset: MediaAsset | null;
  activeGroup: VideoGroup | null;
  selectedClipId: string | null;
  assetMap: Map<string, MediaAsset>;
  showSafeZone: boolean;
  onToggleSafeZone: () => void;
  onOpenTrimAsset: (asset: MediaAsset) => void;
  onSmartSplitVideo?: (asset: MediaAsset) => void;
  onOpenEditAudio?: (asset: MediaAsset) => void;
  onOpenTrimClip: (group: VideoGroup, clip: TimelineClip) => void;
  onSelectClip: (clipId: string) => void;
}

export const PlayerMonitor: React.FC<Props> = ({
  mode,
  onChangeMode,
  aspectRatio,
  sourceAsset,
  activeGroup,
  selectedClipId,
  assetMap,
  showSafeZone,
  onToggleSafeZone,
  onOpenTrimAsset,
  onSmartSplitVideo,
  onOpenEditAudio,
  onOpenTrimClip,
  onSelectClip,
}) => {
  const [globalProgramTime, setGlobalProgramTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [previewMuted, setPreviewMuted] = useState(false);
  const [srcTime, setSrcTime] = useState(0);
  const [srcPlaying, setSrcPlaying] = useState(false);
  const bgmAudioRef = useRef<HTMLAudioElement | null>(null);
  const voAudioRef = useRef<HTMLAudioElement | null>(null);
  const srcMediaRef = useRef<HTMLVideoElement | HTMLAudioElement | null>(null);
  const stageHostRef = useRef<HTMLDivElement | null>(null);
  const programTimeRef = useRef(0);
  const sfxCursorRef = useRef(0);
  const internallySelectedRef = useRef<string | null>(null);
  const pendingAudioRef = useRef(new WeakSet<HTMLAudioElement>());
  const desiredAudioRef = useRef(new WeakMap<HTMLAudioElement, boolean>());
  const [stageBounds, setStageBounds] = useState<{ w: number; h: number }>({ w: 360, h: 640 });

  useEffect(() => {
    const el = stageHostRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (rect && rect.width > 20 && rect.height > 20) setStageBounds({ w: rect.width, h: rect.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const playableClips = useMemo(() => {
    if (!activeGroup) return [];
    return activeGroup.clips.map((clip) => {
      const asset = assetMap.get(clip.assetId);
      if (!asset || asset.type === 'audio') return null;
      return { clip, asset, effDur: getClipEffectiveDuration(clip) };
    }).filter((x): x is NonNullable<typeof x> => Boolean(x));
  }, [activeGroup, assetMap]);
  const timeline = useMemo(() => buildTransitionTimeline(playableClips.map(entry => ({
    duration: entry.effDur, transition: entry.clip.transition,
  }))), [playableClips]);
  const totalProgramDur = timeline.totalDuration;
  const masterSpeedFactor = getMasterSpeedFactor(activeGroup?.dedup);
  const progClipIdx = activeTimelineIndex(timeline.segments, globalProgramTime);
  const currentEntry = playableClips[progClipIdx] || null;
  const previewLayers = getPreviewLayers(timeline.segments, globalProgramTime);
  const bgmAsset = activeGroup?.bgmAssetId ? assetMap.get(activeGroup.bgmAssetId) || null : null;
  const voAsset = activeGroup?.voiceoverAssetId ? assetMap.get(activeGroup.voiceoverAssetId) || null : null;
  const sfxEvents = useMemo(() => buildTimelineSfxEvents(activeGroup?.sfx, timeline), [activeGroup?.sfx, timeline]);

  const seekProgramGlobal = (requested: number, select = true) => {
    if (!timeline.segments.length) return;
    const target = Math.max(0, Math.min(Math.max(0, totalProgramDur - 0.001), requested));
    programTimeRef.current = target;
    sfxCursorRef.current = target;
    setGlobalProgramTime(target);
    const idx = activeTimelineIndex(timeline.segments, target);
    const id = playableClips[idx]?.clip.id;
    if (select && id && id !== selectedClipId) {
      internallySelectedRef.current = id;
      onSelectClip(id);
    }
  };

  useEffect(() => {
    programTimeRef.current = 0;
    sfxCursorRef.current = 0;
    setGlobalProgramTime(0);
    setIsPlaying(false);
  }, [activeGroup?.id]);

  // A click on the board is an explicit seek; selections produced by playback are not.
  useEffect(() => {
    if (mode !== 'program' || !selectedClipId) return;
    if (internallySelectedRef.current === selectedClipId) {
      internallySelectedRef.current = null;
      return;
    }
    const idx = playableClips.findIndex(entry => entry.clip.id === selectedClipId);
    if (idx >= 0 && idx !== activeTimelineIndex(timeline.segments, programTimeRef.current)) {
      setIsPlaying(false);
      seekProgramGlobal(timeline.segments[idx].start, false);
    }
  }, [selectedClipId, activeGroup?.id, mode]);

  useEffect(() => {
    if (!isPlaying || mode !== 'program' || !currentEntry || selectedClipId === currentEntry.clip.id) return;
    internallySelectedRef.current = currentEntry.clip.id;
    onSelectClip(currentEntry.clip.id);
  }, [isPlaying, mode, currentEntry?.clip.id, selectedClipId]);

  useEffect(() => {
    if (programTimeRef.current >= totalProgramDur && totalProgramDur > 0) {
      programTimeRef.current = 0;
      sfxCursorRef.current = 0;
      setGlobalProgramTime(0);
      setIsPlaying(false);
    }
  }, [totalProgramDur]);
  useEffect(() => {
    setSrcPlaying(false);
    setSrcTime(sourceAsset?.defaultTrimStart || 0);
  }, [sourceAsset?.id]);
  useEffect(() => {
    if (mode === 'source') {
      setIsPlaying(false);
      bgmAudioRef.current?.pause();
      voAudioRef.current?.pause();
    } else {
      setSrcPlaying(false);
      srcMediaRef.current?.pause();
    }
  }, [mode]);

  // One monotonic clock drives both clips during overlaps, subtitles and SFX.
  useEffect(() => {
    if (!isPlaying || mode !== 'program' || totalProgramDur <= 0) return;
    let last = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const next = programTimeRef.current + Math.max(0, now - last) / 1000 * masterSpeedFactor;
      last = now;
      if (next >= totalProgramDur) {
        programTimeRef.current = 0;
        sfxCursorRef.current = 0;
        setGlobalProgramTime(0);
        setIsPlaying(false);
        return;
      }
      programTimeRef.current = next;
      setGlobalProgramTime(next);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [isPlaying, mode, totalProgramDur, masterSpeedFactor]);

  useEffect(() => {
    const previous = sfxCursorRef.current;
    sfxCursorRef.current = globalProgramTime;
    if (mode !== 'program' || !isPlaying || previewMuted || !activeGroup?.sfx?.enabled) return;
    const volume = Math.min(1, Math.max(0, activeGroup.sfx.volume ?? 0.65));
    if (volume <= 0.01 || globalProgramTime < previous) return;
    for (const event of sfxEvents) {
      if (event.timeSec > previous && event.timeSec <= globalProgramTime) {
        playBuiltinSfxPreview(event.sfxId, volume * event.gainMul, masterSpeedFactor);
      }
    }
  }, [globalProgramTime, isPlaying, mode, previewMuted, activeGroup?.sfx, sfxEvents, masterSpeedFactor]);

  // Approximate HTML audio playback, including trim, looping, delay and fades, against the same clock.
  useEffect(() => {
    const sync = (el: HTMLAudioElement | null, target: number, speed: number, volume: number, shouldPlay: boolean) => {
      if (!el) return;
      el.playbackRate = Math.max(0.25, Math.min(4, speed * masterSpeedFactor));
      el.volume = Math.max(0, Math.min(1, volume));
      if (el.readyState >= 1 && Math.abs(el.currentTime - target) > 0.16) {
        try { el.currentTime = target; } catch { /* metadata not yet available */ }
      }
      desiredAudioRef.current.set(el, shouldPlay);
      if (shouldPlay && el.paused && !pendingAudioRef.current.has(el)) {
        pendingAudioRef.current.add(el);
        void el.play().then(() => { if (!desiredAudioRef.current.get(el)) el.pause(); }).catch(() => {}).finally(() => pendingAudioRef.current.delete(el));
      } else if (!shouldPlay && !el.paused) el.pause();
    };
    const playing = mode === 'program' && isPlaying;
    const delay = Math.max(0, activeGroup?.voiceoverDelaySec || 0);
    let voiceActive = false;
    if (voAsset) {
      const start = Math.max(0, activeGroup?.voiceoverTrimStart ?? voAsset.defaultTrimStart ?? 0);
      const end = Math.max(start + 0.15, Math.min(voAsset.duration, activeGroup?.voiceoverTrimEnd || voAsset.defaultTrimEnd || voAsset.duration));
      const speed = Math.max(0.5, Math.min(2, activeGroup?.voiceoverSpeed ?? voAsset.defaultSpeed ?? 1));
      const position = start + Math.max(0, globalProgramTime - delay) * speed;
      voiceActive = globalProgramTime >= delay && position < end;
      sync(voAudioRef.current, Math.min(end, position), speed, previewMuted ? 0 : (activeGroup?.voiceoverVolume ?? 1), playing && voiceActive);
    }
    if (bgmAsset) {
      const start = Math.max(0, activeGroup?.bgmTrimStart ?? bgmAsset.defaultTrimStart ?? 0);
      const end = Math.max(start + 0.2, Math.min(bgmAsset.duration, activeGroup?.bgmTrimEnd || bgmAsset.defaultTrimEnd || bgmAsset.duration));
      const speed = Math.max(0.5, Math.min(2, activeGroup?.bgmSpeed ?? bgmAsset.defaultSpeed ?? 1));
      const span = Math.max(0.01, end - start);
      const consumed = globalProgramTime * speed;
      const loop = activeGroup?.bgmLoop !== false;
      const position = start + (loop ? consumed % span : Math.min(span, consumed));
      const fadeIn = Math.min(totalProgramDur * 0.4, Math.max(0, activeGroup?.bgmFadeInSec ?? bgmAsset.fadeInSec ?? 0));
      const fadeOut = Math.min(totalProgramDur * 0.45, Math.max(0, activeGroup?.bgmFadeOutSec ?? (activeGroup?.audioFadeOut && totalProgramDur > 1.5 ? 1.2 : 0)));
      const envelope = (fadeIn > 0.03 ? Math.min(1, globalProgramTime / fadeIn) : 1) *
        (fadeOut > 0.03 ? Math.min(1, Math.max(0, (totalProgramDur - globalProgramTime) / fadeOut)) : 1);
      const duck = voiceActive && activeGroup?.bgmDucking !== false ? 0.42 : 1;
      sync(bgmAudioRef.current, position, speed, previewMuted ? 0 : (activeGroup?.bgmVolume ?? 0.35) * envelope * duck,
        playing && (loop || consumed < span));
    }
  }, [globalProgramTime, mode, isPlaying, previewMuted, activeGroup, bgmAsset, voAsset, totalProgramDur, masterSpeedFactor]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (e.code === 'Space') {
        e.preventDefault();
        if (mode === 'program') {
          if (playableClips.length > 0) setIsPlaying((p) => !p);
        } else if (sourceAsset) toggleSourcePlay();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mode, playableClips.length, sourceAsset, srcPlaying]);

  const toggleSourcePlay = () => {
    const el = srcMediaRef.current;
    if (!el || !sourceAsset) return;
    if (el.paused) {
      if (el.currentTime >= (sourceAsset.defaultTrimEnd || sourceAsset.duration) - 0.05) el.currentTime = sourceAsset.defaultTrimStart || 0;
      el.play().then(() => setSrcPlaying(true)).catch(() => {});
    } else {
      el.pause();
      setSrcPlaying(false);
    }
  };

  // Compute exact pixel fitted box inside stageBounds so video maximizes cleanly at any dock size!
  const targetRatio =
    mode === 'program'
      ? aspectRatio === '9:16'
        ? 9 / 16
        : aspectRatio === '16:9'
        ? 16 / 9
        : 1
      : (sourceAsset?.width || 9) / (sourceAsset?.height || 16);

  const availW = Math.max(80, stageBounds.w - 16);
  const availH = Math.max(80, stageBounds.h - 16);
  let fittedW = availW;
  let fittedH = availW / targetRatio;
  if (fittedH > availH) {
    fittedH = availH;
    fittedW = availH * targetRatio;
  }

  return (
    <div className="flex flex-col h-full w-full bg-[#13151C] min-w-0 min-h-0 select-none">
      {/* Top Mode Switcher Bar */}
      <div className="h-9 px-2.5 border-b border-[#232632] flex items-center justify-between gap-1.5 shrink-0">
        <div className="flex items-center bg-[#0D0E13] p-0.5 rounded-lg border border-[#242733] shrink-0">
          <button
            onClick={() => onChangeMode('program')}
            className={`px-2.5 py-1 rounded-md text-[11px] font-semibold whitespace-nowrap transition flex items-center gap-1 ${
              mode === 'program'
                ? 'bg-[#252936] text-[#00E5FF] shadow-sm'
                : 'text-[#8A90A2] hover:text-white'
            }`}
          >
            <Film className="w-3 h-3 shrink-0" />
            成片预览
          </button>
          <button
            onClick={() => onChangeMode('source')}
            className={`px-2.5 py-1 rounded-md text-[11px] font-semibold whitespace-nowrap transition flex items-center gap-1 ${
              mode === 'source'
                ? 'bg-[#252936] text-[#FFB800] shadow-sm'
                : 'text-[#8A90A2] hover:text-white'
            }`}
          >
            <Scissors className="w-3 h-3 shrink-0" />
            素材监视
          </button>
        </div>

        {/* Right Quick Controls */}
        <div className="flex items-center gap-1 shrink-0">
          {mode === 'program' && aspectRatio === '9:16' && (
            <button
              onClick={onToggleSafeZone}
              className={`px-2 py-1 rounded text-[11px] whitespace-nowrap border flex items-center gap-1 transition ${
                showSafeZone
                  ? 'bg-[#00E5FF]/15 border-[#00E5FF]/60 text-[#00E5FF]'
                  : 'bg-[#1D202A] border-[#2A2E3D] text-[#9CA3AF] hover:text-white'
              }`}
              title="显示抖音/快手竖屏信息流右侧互动栏与底部文案安全区参考线"
            >
              <ShieldAlert className="w-3 h-3 shrink-0" />
              安全区
            </button>
          )}

          {mode === 'program' && currentEntry && activeGroup && (
            <button
              onClick={() => onOpenTrimClip(activeGroup, currentEntry.clip)}
              className="px-2 py-1 rounded bg-[#232734] hover:bg-[#2F3446] border border-[#32374A] text-[11px] whitespace-nowrap text-[#FFB800] flex items-center gap-1 transition"
            >
              <Scissors className="w-3 h-3 shrink-0" />
              裁剪本段
            </button>
          )}

          {mode === 'source' && sourceAsset && sourceAsset.type === 'video' && onSmartSplitVideo && (
            <button
              onClick={() => onSmartSplitVideo(sourceAsset)}
              className="px-2 py-1 rounded bg-[#232734] hover:bg-[#FFB800] border border-[#FFB800]/45 text-[#FFB800] hover:text-[#111318] font-semibold text-[11px] whitespace-nowrap flex items-center gap-1 transition"
            >
              <Zap className="w-3 h-3 shrink-0" />
              智能拆条
            </button>
          )}

          {mode === 'source' && sourceAsset && sourceAsset.type !== 'audio' && (
            <button
              onClick={() => onOpenTrimAsset(sourceAsset)}
              className="px-2.5 py-1 rounded bg-[#FFB800] text-[#111318] font-semibold text-[11px] whitespace-nowrap flex items-center gap-1 hover:brightness-110 transition"
            >
              <Scissors className="w-3 h-3 shrink-0" />
              裁剪构图
            </button>
          )}

          {mode === 'source' && sourceAsset && sourceAsset.type === 'audio' && onOpenEditAudio && (
            <button
              onClick={() => onOpenEditAudio(sourceAsset)}
              className="px-2.5 py-1 rounded bg-[#FFB800] text-[#111318] font-semibold text-[11px] whitespace-nowrap flex items-center gap-1 hover:brightness-110 transition"
            >
              <Scissors className="w-3 h-3 shrink-0" />
              声波剪辑/去气口
            </button>
          )}
        </div>
      </div>

      {/* Dedicated Non-Intrusive Info Strip OUTSIDE Video Frame (Never covers video picture!) */}
      <div className="h-6 px-3 bg-[#0F1117] border-b border-[#1E212D] flex items-center justify-between gap-2 text-[11px] text-[#9CA3AF] shrink-0">
        {mode === 'program' ? (
          currentEntry && activeGroup ? (
            <>
              <div className="flex items-center gap-1.5 min-w-0 truncate">
                <span className="w-1.5 h-1.5 rounded-full bg-[#00E5FF] shrink-0" />
                <span className="text-[#CBD5E1] font-medium shrink-0">
                  {activeGroup.name}
                </span>
                <span className="text-[#52586A]">·</span>
                <span className="text-[#00E5FF] font-mono shrink-0">
                  [{progClipIdx + 1}/{playableClips.length}]
                </span>
                <span className="truncate text-[#9CA3AF]" title={currentEntry.asset.name}>
                  {currentEntry.asset.name}
                </span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {playableClips.some((entry, i) => i < playableClips.length - 1 && entry.clip.transition !== 'none') && (
                  <span className="text-[10px] text-amber-300 whitespace-nowrap" title="浏览器预览采用近似过渡，画面、混音及防重效果以 FFmpeg 导出为准。">
                    转场预览 · 成片以导出为准
                  </span>
                )}
                <span className="font-mono text-[10px] text-[#6B7280] whitespace-nowrap">{aspectRatio}</span>
              </div>
            </>
          ) : (
            <span className="text-[#6B7280]">未添加画面片段</span>
          )
        ) : sourceAsset ? (
          <>
            <div className="flex items-center gap-1.5 min-w-0 truncate">
              <span className="w-1.5 h-1.5 rounded-full bg-[#FFB800] shrink-0" />
              <span className="text-[#E5E7EB] truncate" title={sourceAsset.name}>
                {sourceAsset.name}
              </span>
            </div>
            {sourceAsset.type !== 'audio' && (
              <span className="font-mono text-[10px] text-[#FFB800] whitespace-nowrap shrink-0">
                {sourceAsset.width}×{sourceAsset.height} · 截取{' '}
                {formatShortSec(sourceAsset.defaultTrimStart)}~
                {formatShortSec(sourceAsset.defaultTrimEnd)}
              </span>
            )}
          </>
        ) : (
          <span className="text-[#6B7280]">未选择预览素材</span>
        )}
      </div>

      {/* Pure Unobstructed Center Video Stage */}
      <div
        ref={stageHostRef}
        className="flex-1 min-h-0 flex items-center justify-center stage-grid relative overflow-hidden p-2"
      >
        {mode === 'program' ? (
          playableClips.length > 0 && currentEntry ? (
            <div
              className="relative rounded-md overflow-hidden shadow-[0_12px_40px_rgba(0,0,0,0.8)] ring-1 ring-white/12 bg-black shrink-0"
              style={{
                width: `${Math.round(fittedW)}px`,
                height: `${Math.round(fittedH)}px`,
              }}
            >
              <div
                className="w-full h-full overflow-hidden relative"
                style={
                  activeGroup?.dedup?.enabled
                    ? (() => {
                        const d = activeGroup.dedup;
                        const rotDeg = Number(d.rotateDeg || 0);
                        const rotRad = (Math.abs(rotDeg) * Math.PI) / 180;
                        const ratio = Math.max(fittedW, fittedH) / Math.max(1, Math.min(fittedW, fittedH));
                        const minRotZoom =
                          Math.abs(rotDeg) >= 0.08
                            ? (Math.cos(rotRad) + ratio * Math.sin(rotRad) - 1) * 100 + 0.45
                            : 0;
                        const effZoom = Math.max(Number(d.zoomPunchPct || 0), minRotZoom);
                        return {
                          transform: `${d.mirrorFlip ? 'scaleX(-1) ' : ''}${
                            Math.abs(rotDeg) >= 0.08 ? `rotate(${rotDeg.toFixed(2)}deg) ` : ''
                          }scale(${(1 + effZoom / 100).toFixed(3)})`,
                          filter: `brightness(${(1 + (d.brightness || 0)).toFixed(
                            3
                          )}) contrast(${(d.contrast ?? 1).toFixed(3)}) saturate(${(
                            d.saturation ?? 1
                          ).toFixed(3)})${
                            Math.abs(d.hueDeg || 0) >= 0.2
                              ? ` hue-rotate(${(d.hueDeg || 0).toFixed(1)}deg)`
                              : ''
                          }`,
                        };
                      })()
                    : undefined
                }
              >
                {previewLayers.map(layer => {
                  const entry = playableClips[layer.index];
                  return <SequenceClipLayer key={entry.clip.id} clip={entry.clip} asset={entry.asset}
                    duration={entry.effDur} elapsed={layer.elapsed} playing={isPlaying && globalProgramTime >= timeline.segments[layer.index].start}
                    muted={previewMuted} gain={layer.audioGain * (activeGroup?.clipMasterVolume ?? 1)}
                    aspectRatio={aspectRatio} masterSpeedFactor={masterSpeedFactor} style={layer.style} />;
                })}
                {activeGroup?.dedup?.enabled && activeGroup.dedup.vignette && (
                  <div
                    className="pointer-events-none absolute inset-0"
                    style={{
                      background:
                        'radial-gradient(ellipse at center, rgba(0,0,0,0) 58%, rgba(0,0,0,0.34) 100%)',
                    }}
                  />
                )}
              </div>

              {/* Live CapCut Fancy Titles + Synced Subtitles + Brand Watermark + Safe Zone */}
              <OverlayPreviewLayer
                overlay={activeGroup?.overlay}
                subtitles={activeGroup?.subtitles}
                currentTimeSec={globalProgramTime}
                watermark={activeGroup?.watermark}
                watermarkImageUrl={
                  activeGroup?.watermark?.imageAssetId
                    ? assetMap.get(activeGroup.watermark.imageAssetId)?.url || null
                    : null
                }
                aspectRatio={aspectRatio}
                showSafeZone={showSafeZone}
              />

              {bgmAsset && <audio ref={bgmAudioRef} src={bgmAsset.url} preload="auto" />}
              {voAsset && <audio ref={voAudioRef} src={voAsset.url} preload="auto" />}

            </div>
          ) : (
            <div className="text-center max-w-xs space-y-2 text-[#7E8596] px-4">
              <Film className="w-9 h-9 mx-auto opacity-40" />
              <p className="text-xs font-medium text-[#B8C0D0]">当前视频组暂无画面片段</p>
              <p className="text-[11px]">
                从素材库勾选或拖拽素材到「成片视频组」，或使用「分镜矩阵混剪」一键批量生成
              </p>
            </div>
          )
        ) : sourceAsset ? (
          sourceAsset.type === 'audio' ? (
            <div className="w-full max-w-sm p-5 rounded-xl bg-[#1A1D26] border border-[#2C3142] text-center space-y-3">
              <div
                className={`w-12 h-12 mx-auto rounded-2xl border flex items-center justify-center ${
                  sourceAsset.audioRole === 'voiceover'
                    ? 'bg-[#FFB800]/15 border-[#FFB800]/40 text-[#FFB800]'
                    : 'bg-[#00E5FF]/15 border-[#00E5FF]/40 text-[#00E5FF]'
                }`}
              >
                {sourceAsset.audioRole === 'voiceover' ? (
                  <Mic className="w-6 h-6" />
                ) : (
                  <Music className="w-6 h-6" />
                )}
              </div>
              <div>
                <h4 className="text-sm font-semibold text-white break-all">{sourceAsset.name}</h4>
                <p className="text-xs text-[#8A90A2] mt-1">
                  {sourceAsset.audioRole === 'voiceover' ? 'AI/人声口播配音' : '背景音乐 BGM'} · 时长{' '}
                  {formatDuration(sourceAsset.duration)}
                  {sourceAsset.breathRemoved ? ' · ⚡已去气口' : ''}
                </p>
                {sourceAsset.ttsSourceText && (
                  <p className="mt-2 p-2 rounded-lg bg-[#11131B] text-[11px] text-[#CBD5E1] text-left line-clamp-3">
                    “{sourceAsset.ttsSourceText}”
                  </p>
                )}
              </div>
              <audio
                ref={srcMediaRef as React.RefObject<HTMLAudioElement>}
                src={sourceAsset.url}
                controls
                className="w-full h-9"
                onPlay={() => setSrcPlaying(true)}
                onPause={() => setSrcPlaying(false)}
                onTimeUpdate={(e) => setSrcTime(e.currentTarget.currentTime)}
              />
              {onOpenEditAudio && (
                <button
                  onClick={() => onOpenEditAudio(sourceAsset)}
                  className="w-full py-2 rounded-lg bg-[#FFB800] text-[#111318] font-bold text-xs flex items-center justify-center gap-1.5 hover:brightness-110 transition"
                >
                  <Zap className="w-3.5 h-3.5 fill-current" />
                  打开可视声波剪辑 / 截取副歌 / 智能去气口
                </button>
              )}
            </div>
          ) : (
            <div
              className="relative rounded-md overflow-hidden shadow-2xl ring-1 ring-[#FFB800]/45 bg-black shrink-0"
              style={{
                width: `${Math.round(fittedW)}px`,
                height: `${Math.round(fittedH)}px`,
              }}
            >
              {sourceAsset.type === 'image' ? (
                <img
                  src={sourceAsset.url}
                  alt={sourceAsset.name}
                  className="w-full h-full object-contain"
                />
              ) : (
                <video
                  ref={srcMediaRef as React.RefObject<HTMLVideoElement>}
                  src={sourceAsset.url}
                  className="w-full h-full object-contain"
                  playsInline
                  onTimeUpdate={(e) => {
                    const t = e.currentTarget.currentTime;
                    setSrcTime(t);
                    const maxT = sourceAsset.defaultTrimEnd || sourceAsset.duration;
                    if (t >= maxT) {
                      e.currentTarget.pause();
                      e.currentTarget.currentTime = sourceAsset.defaultTrimStart || 0;
                      setSrcPlaying(false);
                    }
                  }}
                  onEnded={() => setSrcPlaying(false)}
                />
              )}
            </div>
          )
        ) : (
          <div className="text-center text-xs text-[#7E8596] px-4">
            点击素材库中任意视频/图片/配乐即可在此预览原片
          </div>
        )}
      </div>

      {/* Bottom Transport Scrubber Bar */}
      <div className="px-3 py-2 bg-[#101218] border-t border-[#232632] shrink-0 space-y-1.5">
        {mode === 'program' ? (
          <>
            <div
              role="slider"
              aria-label="成片预览进度"
              aria-valuemin={0}
              aria-valuemax={Math.round(totalProgramDur / masterSpeedFactor * 1000) / 1000}
              aria-valuenow={Math.round(globalProgramTime / masterSpeedFactor * 1000) / 1000}
              tabIndex={0}
              className="relative h-2 rounded-full bg-[#232633] overflow-hidden cursor-pointer flex gap-0.5"
              onKeyDown={(e) => {
                if (e.key === 'ArrowRight') { e.preventDefault(); seekProgramGlobal(globalProgramTime + 0.5); }
                else if (e.key === 'ArrowLeft') { e.preventDefault(); seekProgramGlobal(globalProgramTime - 0.5); }
                else if (e.key === 'Home') { e.preventDefault(); seekProgramGlobal(0); }
                else if (e.key === 'End') { e.preventDefault(); seekProgramGlobal(totalProgramDur); }
              }}
              onClick={(e) => {
                if (totalProgramDur <= 0) return;
                const rect = e.currentTarget.getBoundingClientRect();
                const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
                seekProgramGlobal(ratio * totalProgramDur);
              }}
            >
              {playableClips.map((entry, idx) => {
                const start = timeline.segments[idx].start;
                const left = totalProgramDur > 0 ? (start / totalProgramDur) * 100 : 0;
                const width = totalProgramDur > 0 ? (entry.effDur / totalProgramDur) * 100 : 0;
                return <div key={entry.clip.id} style={{ left: `${left}%`, width: `${width}%` }} className={`absolute inset-y-0 ${
                  idx === progClipIdx ? 'bg-[#2E3548]' : 'bg-[#1F2330]'
                } border-r border-black/50 last:border-r-0`} />;
              })}
              <div
                className="absolute inset-y-0 left-0 bg-gradient-to-r from-[#00E5FF] to-[#00B8D9] pointer-events-none"
                style={{
                  width: `${
                    totalProgramDur > 0
                      ? Math.min(100, (globalProgramTime / totalProgramDur) * 100)
                      : 0
                  }%`,
                }}
              />
            </div>

            <div className="flex items-center justify-between text-xs gap-2">
              <span className="font-mono text-[11px] text-[#9CA3AF] whitespace-nowrap">
                <strong className="text-white">{formatDuration(globalProgramTime / masterSpeedFactor)}</strong>
                <span className="text-[#5E6577]"> / </span>
                {formatDuration(totalProgramDur / masterSpeedFactor)}
              </span>

              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  onClick={() => seekProgramGlobal(0)}
                  disabled={playableClips.length === 0}
                  className="p-1 rounded hover:bg-[#232734] text-[#A6ADBB] hover:text-white disabled:opacity-35"
                  title="回到开头"
                >
                  <SkipBack className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => playableClips.length > 0 && setIsPlaying((p) => !p)}
                  disabled={playableClips.length === 0}
                  className="w-7 h-7 rounded-full bg-[#00E5FF] text-[#081016] flex items-center justify-center hover:brightness-110 transition disabled:opacity-40 shadow"
                  title="播放/暂停 (空格键)"
                >
                  {isPlaying ? (
                    <Pause className="w-3.5 h-3.5" />
                  ) : (
                    <Play className="w-3.5 h-3.5 ml-0.5" />
                  )}
                </button>
                <button
                  onClick={() => {
                    if (progClipIdx < playableClips.length - 1) {
                      seekProgramGlobal(timeline.segments[progClipIdx + 1].start + 0.001);
                    }
                  }}
                  disabled={progClipIdx >= playableClips.length - 1}
                  className="p-1 rounded hover:bg-[#232734] text-[#A6ADBB] hover:text-white disabled:opacity-35"
                  title="下一片段"
                >
                  <SkipForward className="w-3.5 h-3.5" />
                </button>
              </div>

              <button
                onClick={() => setPreviewMuted((m) => !m)}
                className="p-1 rounded hover:bg-[#232734] text-[#A6ADBB] hover:text-white shrink-0"
                title={previewMuted ? '取消预览静音' : '预览静音'}
              >
                {previewMuted ? (
                  <VolumeX className="w-3.5 h-3.5 text-red-400" />
                ) : (
                  <Volume2 className="w-3.5 h-3.5" />
                )}
              </button>
            </div>
          </>
        ) : (
          <div className="flex items-center justify-between text-xs gap-2.5">
            <span className="font-mono text-[11px] text-[#9CA3AF] whitespace-nowrap">
              <strong className="text-white">{formatDuration(srcTime)}</strong> /{' '}
              {formatDuration(sourceAsset?.duration || 0)}
            </span>

            {sourceAsset?.type === 'video' && (
              <>
                <input
                  type="range"
                  min={0}
                  max={sourceAsset.duration || 1}
                  step={0.05}
                  value={srcTime}
                  onChange={(e) => {
                    const t = parseFloat(e.target.value);
                    setSrcTime(t);
                    if (srcMediaRef.current) srcMediaRef.current.currentTime = t;
                  }}
                  className="flex-1 jy-slider min-w-0"
                />
                <button
                  onClick={toggleSourcePlay}
                  className="w-7 h-7 rounded-full bg-[#FFB800] text-[#111318] flex items-center justify-center hover:brightness-110 shrink-0"
                >
                  {srcPlaying ? (
                    <Pause className="w-3.5 h-3.5" />
                  ) : (
                    <Play className="w-3.5 h-3.5 ml-0.5" />
                  )}
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
