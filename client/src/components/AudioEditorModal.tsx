import React, { useEffect, useRef, useState } from 'react';
import {
  Check,
  CopyPlus,
  Loader2,
  Mic,
  Music,
  Pause,
  Play,
  RotateCcw,
  Scissors,
  X,
  Zap,
} from 'lucide-react';
import {
  AudioRole,
  BREATH_PRESETS,
  BreathPresetId,
  MediaAsset,
  ProjectData,
} from '@shared/schema';
import { removeAudioBreathApi, renderEditedAudioApi } from '../api';
import { decodeWaveformFromUrl, WaveformData } from '../utils/audioWaveform';
import { formatDuration as formatTime } from '../utils/format';

export interface NonDestructiveAudioSave {
  audioRole: AudioRole;
  trimStart: number;
  trimEnd: number;
  speed: number;
  fadeInSec: number;
  fadeOutSec: number;
  syncToActiveGroup: boolean;
}

interface Props {
  project: ProjectData;
  asset: MediaAsset;
  onClose: () => void;
  onSaveNonDestructive: (assetId: string, patch: NonDestructiveAudioSave) => void;
  onProjectReplaced: (updatedProject: ProjectData, updatedAsset: MediaAsset, msg: string) => void;
}

export const AudioEditorModal: React.FC<Props> = ({
  project,
  asset,
  onClose,
  onSaveNonDestructive,
  onProjectReplaced,
}) => {
  const [currentAsset, setCurrentAsset] = useState<MediaAsset>(asset);
  const [audioRole, setAudioRole] = useState<AudioRole>(
    asset.audioRole || (asset.name.includes('配音') ? 'voiceover' : 'bgm')
  );
  const [trimStart, setTrimStart] = useState<number>(asset.defaultTrimStart || 0);
  const [trimEnd, setTrimEnd] = useState<number>(asset.defaultTrimEnd || asset.duration);
  const [speed, setSpeed] = useState<number>(asset.defaultSpeed || 1.0);
  const [fadeInSec, setFadeInSec] = useState<number>(asset.fadeInSec || 0);
  const [fadeOutSec, setFadeOutSec] = useState<number>(asset.fadeOutSec || 0);
  const [syncToGroup, setSyncToGroup] = useState<boolean>(true);

  // Breath removal controls
  const [breathPreset, setBreathPreset] = useState<BreathPresetId>('standard');
  const [thresholdDb, setThresholdDb] = useState<number>(BREATH_PRESETS.standard.thresholdDb);
  const [minPauseSec, setMinPauseSec] = useState<number>(BREATH_PRESETS.standard.minPauseSec);
  const [keepGapSec, setKeepGapSec] = useState<number>(BREATH_PRESETS.standard.keepGapSec);
  const [previewBreathOverlay, setPreviewBreathOverlay] = useState<boolean>(
    (asset.audioRole || '') === 'voiceover' || asset.name.includes('配音')
  );
  const [processingBreath, setProcessingBreath] = useState(false);
  const [renderingCopy, setRenderingCopy] = useState(false);
  const [lastBreathBanner, setLastBreathBanner] = useState<string | null>(null);

  // Waveform & playback state
  const [waveform, setWaveform] = useState<WaveformData | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playhead, setPlayhead] = useState<number>(asset.defaultTrimStart || 0);
  const [dragHandle, setDragHandle] = useState<'start' | 'end' | 'playhead' | null>(null);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const waveTrackRef = useRef<HTMLDivElement | null>(null);

  // Decode real audio waveform when URL changes
  useEffect(() => {
    let cancelled = false;
    decodeWaveformFromUrl(currentAsset.url, 180)
      .then((wf) => {
        if (!cancelled) setWaveform(wf);
      })
      .catch(() => {
        if (!cancelled) {
          setWaveform({
            peaks: Array.from({ length: 140 }, (_, i) => 0.25 + 0.55 * Math.abs(Math.sin(i * 0.23))),
            rmsDbs: Array.from({ length: 140 }, () => -22),
            duration: currentAsset.duration,
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [currentAsset.url, currentAsset.duration]);

  // Audition loop enforcement
  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    a.playbackRate = speed;
  }, [speed]);

  useEffect(() => {
    if (!isPlaying) return;
    const timer = window.setInterval(() => {
      const a = audioRef.current;
      if (!a) return;
      if (a.currentTime >= trimEnd - 0.03) {
        a.currentTime = trimStart;
        setPlayhead(trimStart);
      } else {
        setPlayhead(a.currentTime);
      }
    }, 35);
    return () => window.clearInterval(timer);
  }, [isPlaying, trimStart, trimEnd]);

  // Mouse drag for waveform [ In / Out ] handles and playhead
  useEffect(() => {
    if (!dragHandle) return;
    const dur = Math.max(0.2, currentAsset.duration);
    const onMove = (ev: MouseEvent) => {
      const el = waveTrackRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (ev.clientX - rect.left) / Math.max(1, rect.width)));
      const sec = Math.round(ratio * dur * 100) / 100;

      if (dragHandle === 'start') {
        const nextS = Math.min(sec, trimEnd - 0.2);
        setTrimStart(Math.max(0, nextS));
        if (audioRef.current) audioRef.current.currentTime = Math.max(0, nextS);
        setPlayhead(Math.max(0, nextS));
      } else if (dragHandle === 'end') {
        const nextE = Math.max(sec, trimStart + 0.2);
        setTrimEnd(Math.min(dur, nextE));
      } else {
        setPlayhead(sec);
        if (audioRef.current) audioRef.current.currentTime = sec;
      }
    };
    const onUp = () => setDragHandle(null);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [dragHandle, currentAsset.duration, trimStart, trimEnd]);

  const togglePlay = () => {
    const a = audioRef.current;
    if (!a) return;
    if (isPlaying) {
      a.pause();
      setIsPlaying(false);
    } else {
      if (a.currentTime < trimStart || a.currentTime >= trimEnd - 0.05) {
        a.currentTime = trimStart;
      }
      a.playbackRate = speed;
      a.play()
        .then(() => setIsPlaying(true))
        .catch(() => setIsPlaying(false));
    }
  };

  const applyBreathPreset = (pid: Exclude<BreathPresetId, 'custom'>) => {
    setBreathPreset(pid);
    setThresholdDb(BREATH_PRESETS[pid].thresholdDb);
    setMinPauseSec(BREATH_PRESETS[pid].minPauseSec);
    setKeepGapSec(BREATH_PRESETS[pid].keepGapSec);
    setPreviewBreathOverlay(true);
  };

  const handleRunBreathRemoval = async (replaceInPlace: boolean) => {
    if (audioRef.current) {
      audioRef.current.pause();
      setIsPlaying(false);
    }
    setProcessingBreath(true);
    try {
      const res = await removeAudioBreathApi(project, currentAsset.id, {
        replaceInPlace,
        breathOptions: {
          preset: breathPreset,
          thresholdDb,
          minPauseSec,
          keepGapSec,
        },
      });
      const st = res.breathStats;
      const msg = `⚡ 去气口完成：切除 ${st.cutCount} 处气口与停顿，原长 ${st.originalDuration.toFixed(
        2
      )}s → 紧凑 ${st.newDuration.toFixed(2)}s (省 ${st.savedSec.toFixed(2)}s)`;
      setLastBreathBanner(msg);
      setCurrentAsset(res.asset);
      setTrimStart(0);
      setTrimEnd(res.asset.duration);
      setPlayhead(0);
      onProjectReplaced(res.project, res.asset, msg);
    } catch (err: any) {
      alert(err?.message || '去气口处理失败');
    } finally {
      setProcessingBreath(false);
    }
  };

  const handleRenderStandaloneCopy = async (withBreathRemoval: boolean) => {
    if (audioRef.current) {
      audioRef.current.pause();
      setIsPlaying(false);
    }
    setRenderingCopy(true);
    try {
      const res = await renderEditedAudioApi(project, currentAsset.id, {
        trimStart,
        trimEnd,
        speed,
        fadeInSec,
        fadeOutSec,
        removeBreath: withBreathRemoval,
        breathOptions: {
          preset: breathPreset,
          thresholdDb,
          minPauseSec,
          keepGapSec,
        },
      });
      onProjectReplaced(
        res.project,
        res.asset,
        `🎵 已渲染生成精剪音频「${res.asset.name}」并放入素材库`
      );
      onClose();
    } catch (err: any) {
      alert(err?.message || '渲染新音频失败');
    } finally {
      setRenderingCopy(false);
    }
  };

  const dur = Math.max(0.2, currentAsset.duration);
  const startPct = Math.max(0, Math.min(100, (trimStart / dur) * 100));
  const endPct = Math.max(0, Math.min(100, (trimEnd / dur) * 100));
  const playPct = Math.max(0, Math.min(100, (playhead / dur) * 100));
  const netSelectedDur = Math.max(0.1, (trimEnd - trimStart) / speed);

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 select-none">
      <audio
        ref={audioRef}
        src={currentAsset.url}
        onEnded={() => setIsPlaying(false)}
        className="hidden"
      />

      <div className="w-full max-w-4xl max-h-[92vh] rounded-2xl bg-[#151821] border border-[#2D3348] shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-5 py-3.5 bg-[#11131B] border-b border-[#252A3A] flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-[#FFB800]/20 text-[#FFB800] flex items-center justify-center shrink-0">
              <Scissors className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm font-bold text-white truncate">
                音频可视波形剪辑 & 智能去气口 · {currentAsset.name}
              </h2>
              <p className="text-[11px] text-[#8A90A2]">
                拖拽金黄色入出点精准截取 BGM 高潮副歌或口播区间，支持淡入淡出、变速与 24kHz 智能切除气口停顿
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-[#252A3A] text-[#9CA3AF] hover:text-white transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 min-h-0 overflow-y-auto p-5 space-y-4">
          {lastBreathBanner && (
            <div className="px-3.5 py-2 rounded-xl bg-emerald-500/15 border border-emerald-500/40 text-xs text-emerald-300 font-medium flex items-center justify-between">
              <span>{lastBreathBanner}</span>
            </div>
          )}

          {/* Top Audio Role & Transport Bar */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="text-xs text-[#9CA3AF]">音频用途：</span>
              <div className="flex items-center bg-[#0D0F15] p-0.5 rounded-lg border border-[#262B3D]">
                <button
                  onClick={() => setAudioRole('bgm')}
                  className={`px-2.5 py-1 rounded-md text-xs font-semibold flex items-center gap-1 whitespace-nowrap transition ${
                    audioRole === 'bgm'
                      ? 'bg-[#00E5FF]/20 text-[#00E5FF]'
                      : 'text-[#8A90A2] hover:text-white'
                  }`}
                >
                  <Music className="w-3.5 h-3.5" />
                  背景配乐 (BGM)
                </button>
                <button
                  onClick={() => {
                    setAudioRole('voiceover');
                    setPreviewBreathOverlay(true);
                  }}
                  className={`px-2.5 py-1 rounded-md text-xs font-semibold flex items-center gap-1 whitespace-nowrap transition ${
                    audioRole === 'voiceover'
                      ? 'bg-[#FFB800]/20 text-[#FFB800]'
                      : 'text-[#8A90A2] hover:text-white'
                  }`}
                >
                  <Mic className="w-3.5 h-3.5" />
                  口播配音 (人声)
                </button>
              </div>
            </div>

            <div className="flex items-center gap-2 text-xs font-mono">
              <span className="text-[#9CA3AF]">
                原总长 <strong className="text-white">{formatTime(dur)}</strong>
              </span>
              <span className="text-[#4B5563]">|</span>
              <span className="text-[#00E5FF]">
                截取后净时长 <strong>{formatTime(netSelectedDur)}</strong> ({speed}x)
              </span>
            </div>
          </div>

          {/* Interactive Waveform Track */}
          <div className="p-4 rounded-xl bg-[#0D0F16] border border-[#272D40] space-y-3">
            <div className="flex items-center justify-between text-[11px] text-[#9CA3AF]">
              <span className="font-mono">
                入点 [ <strong className="text-[#FFB800]">{formatTime(trimStart)}</strong>
              </span>
              <span className="font-mono text-white">
                指针 {formatTime(playhead)}
              </span>
              <span className="font-mono">
                <strong className="text-[#FFB800]">{formatTime(trimEnd)}</strong> ] 出点
              </span>
            </div>

            <div
              ref={waveTrackRef}
              onMouseDown={(e) => {
                if (e.target === e.currentTarget || (e.target as HTMLElement).dataset.wavebar) {
                  setDragHandle('playhead');
                  const rect = e.currentTarget.getBoundingClientRect();
                  const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
                  const sec = ratio * dur;
                  setPlayhead(sec);
                  if (audioRef.current) audioRef.current.currentTime = sec;
                }
              }}
              className="relative h-28 rounded-xl bg-[#131722] border border-[#262C3F] overflow-hidden cursor-pointer flex items-center px-1"
            >
              {/* Waveform Bars */}
              <div className="w-full h-20 flex items-center justify-between gap-[1px] pointer-events-none">
                {(waveform?.peaks || []).map((pk, idx) => {
                  const barPct = (idx / Math.max(1, (waveform?.peaks.length || 1) - 1)) * 100;
                  const inRange = barPct >= startPct && barPct <= endPct;
                  const rmsDb = waveform?.rmsDbs[idx] ?? -20;
                  const isBreathGap = previewBreathOverlay && rmsDb < thresholdDb;

                  return (
                    <div
                      key={idx}
                      data-wavebar="1"
                      style={{ height: `${Math.max(8, Math.round(pk * 100))}%` }}
                      className={`flex-1 rounded-full transition-colors ${
                        !inRange
                          ? 'bg-[#2B3144]/50'
                          : isBreathGap
                          ? 'bg-rose-500/75'
                          : audioRole === 'voiceover'
                          ? 'bg-[#FFB800]'
                          : 'bg-[#00E5FF]'
                      }`}
                    />
                  );
                })}
              </div>

              {/* Dimmed Masks Outside [trimStart, trimEnd] */}
              <div
                style={{ width: `${startPct}%` }}
                className="absolute inset-y-0 left-0 bg-black/65 pointer-events-none"
              />
              <div
                style={{ width: `${Math.max(0, 100 - endPct)}%` }}
                className="absolute inset-y-0 right-0 bg-black/65 pointer-events-none"
              />

              {/* Active Selection Frame */}
              <div
                style={{ left: `${startPct}%`, width: `${Math.max(0.5, endPct - startPct)}%` }}
                className="absolute inset-y-0 border-y-2 border-[#FFB800] pointer-events-none"
              />

              {/* Left Handle [ */}
              <div
                style={{ left: `${startPct}%` }}
                onMouseDown={(e) => {
                  e.stopPropagation();
                  setDragHandle('start');
                }}
                className="absolute inset-y-0 -ml-2 w-4 bg-[#FFB800] hover:brightness-110 cursor-ew-resize flex items-center justify-center rounded-l-md shadow-lg z-20"
                title="拖动调整音频开始入点"
              >
                <div className="w-0.5 h-8 bg-[#111318] rounded" />
              </div>

              {/* Right Handle ] */}
              <div
                style={{ left: `${endPct}%` }}
                onMouseDown={(e) => {
                  e.stopPropagation();
                  setDragHandle('end');
                }}
                className="absolute inset-y-0 -ml-2 w-4 bg-[#FFB800] hover:brightness-110 cursor-ew-resize flex items-center justify-center rounded-r-md shadow-lg z-20"
                title="拖动调整音频结束出点"
              >
                <div className="w-0.5 h-8 bg-[#111318] rounded" />
              </div>

              {/* Playhead Line */}
              <div
                style={{ left: `${playPct}%` }}
                className="absolute inset-y-0 w-0.5 bg-white shadow-[0_0_8px_#fff] z-10 pointer-events-none"
              />
            </div>

            {/* Audition & Fine-Tune Bar */}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <button
                  onClick={togglePlay}
                  className="px-3.5 py-1.5 rounded-lg bg-[#00E5FF] text-[#061017] font-bold text-xs flex items-center gap-1.5 hover:brightness-110 transition whitespace-nowrap"
                >
                  {isPlaying ? (
                    <>
                      <Pause className="w-3.5 h-3.5 fill-current" />
                      暂停试听
                    </>
                  ) : (
                    <>
                      <Play className="w-3.5 h-3.5 fill-current" />
                      循环试听截取段
                    </>
                  )}
                </button>

                <button
                  onClick={() => setTrimStart(Math.min(playhead, trimEnd - 0.2))}
                  className="px-2.5 py-1.5 rounded-lg bg-[#1E2333] hover:bg-[#293046] text-xs text-[#E5E7EB] whitespace-nowrap"
                >
                  [ 设当前指针为入点
                </button>
                <button
                  onClick={() => setTrimEnd(Math.max(playhead, trimStart + 0.2))}
                  className="px-2.5 py-1.5 rounded-lg bg-[#1E2333] hover:bg-[#293046] text-xs text-[#E5E7EB] whitespace-nowrap"
                >
                  设当前指针为出点 ]
                </button>
                <button
                  onClick={() => {
                    setTrimStart(0);
                    setTrimEnd(dur);
                    setSpeed(1.0);
                    setFadeInSec(0);
                    setFadeOutSec(0);
                  }}
                  className="px-2 py-1.5 rounded-lg bg-[#1A1E2B] hover:bg-[#252A3B] text-xs text-[#9CA3AF] hover:text-white flex items-center gap-1 whitespace-nowrap"
                >
                  <RotateCcw className="w-3 h-3" />
                  重置全段
                </button>
              </div>

              <label className="flex items-center gap-1.5 text-[11px] text-rose-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={previewBreathOverlay}
                  onChange={(e) => setPreviewBreathOverlay(e.target.checked)}
                  className="accent-rose-500"
                />
                在声波图上红色标示可切除的气口/低音量停顿
              </label>
            </div>
          </div>

          {/* Two-Column Controls: Left = Speed + Fade In/Out; Right = Smart Breath Removal */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Speed & Fade Controls */}
            <div className="p-3.5 rounded-xl bg-[#11131B] border border-[#252A3A] space-y-3">
              <div className="text-xs font-bold text-white">音频变速与淡入淡出</div>

              <div>
                <div className="flex justify-between text-[11px] mb-1">
                  <span className="text-[#CBD5E1]">播放倍速 (自动保持音高不变调)</span>
                  <span className="font-mono text-[#00E5FF]">{speed.toFixed(2)}x</span>
                </div>
                <div className="flex items-center gap-1.5 mb-1.5">
                  {[0.8, 1.0, 1.1, 1.2, 1.35, 1.5].map((s) => (
                    <button
                      key={s}
                      onClick={() => setSpeed(s)}
                      className={`px-2 py-0.5 rounded text-[10px] font-mono transition ${
                        Math.abs(speed - s) < 0.02
                          ? 'bg-[#00E5FF] text-[#081016] font-bold'
                          : 'bg-[#1D2130] text-[#9CA3AF] hover:text-white'
                      }`}
                    >
                      {s}x
                    </button>
                  ))}
                </div>
                <input
                  type="range"
                  min={0.75}
                  max={1.6}
                  step={0.05}
                  value={speed}
                  onChange={(e) => setSpeed(Number(e.target.value))}
                  className="w-full accent-[#00E5FF]"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="flex justify-between text-[11px]">
                    <span className="text-[#CBD5E1]">开头淡入</span>
                    <span className="font-mono text-[#00E5FF]">{fadeInSec.toFixed(1)}s</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={3.0}
                    step={0.2}
                    value={fadeInSec}
                    onChange={(e) => setFadeInSec(Number(e.target.value))}
                    className="w-full accent-[#00E5FF]"
                  />
                </div>

                <div>
                  <div className="flex justify-between text-[11px]">
                    <span className="text-[#CBD5E1]">结尾淡出</span>
                    <span className="font-mono text-[#00E5FF]">{fadeOutSec.toFixed(1)}s</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={3.0}
                    step={0.2}
                    value={fadeOutSec}
                    onChange={(e) => setFadeOutSec(Number(e.target.value))}
                    className="w-full accent-[#00E5FF]"
                  />
                </div>
              </div>
            </div>

            {/* Smart Breath / Silence Removal Studio */}
            <div className="p-3.5 rounded-xl bg-[#181E2E] border border-[#FFB800]/45 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-white flex items-center gap-1.5">
                  <Zap className="w-3.5 h-3.5 text-[#FFB800] fill-current" />
                  智能去气口 / 切除停顿空白
                </span>
                <div className="flex items-center gap-1">
                  {(['gentle', 'standard', 'tight'] as const).map((pid) => (
                    <button
                      key={pid}
                      onClick={() => applyBreathPreset(pid)}
                      className={`px-2 py-0.5 rounded text-[10px] whitespace-nowrap transition ${
                        breathPreset === pid
                          ? 'bg-[#FFB800] text-[#111318] font-bold'
                          : 'bg-[#101420] text-[#9CA3AF] hover:text-white'
                      }`}
                    >
                      {BREATH_PRESETS[pid].label.replace(' (推荐)', '')}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2.5 text-[11px]">
                <div>
                  <div className="flex justify-between text-[#CBD5E1]">
                    <span>静音/气口识别门限</span>
                    <span className="font-mono text-[#FFB800]">{thresholdDb} dB</span>
                  </div>
                  <input
                    type="range"
                    min={-48}
                    max={-24}
                    step={1}
                    value={thresholdDb}
                    onChange={(e) => {
                      setBreathPreset('custom');
                      setThresholdDb(Number(e.target.value));
                      setPreviewBreathOverlay(true);
                    }}
                    className="w-full accent-[#FFB800]"
                  />
                </div>
                <div>
                  <div className="flex justify-between text-[#CBD5E1]">
                    <span>最短切除停顿</span>
                    <span className="font-mono text-[#FFB800]">{minPauseSec.toFixed(2)}s</span>
                  </div>
                  <input
                    type="range"
                    min={0.08}
                    max={0.5}
                    step={0.02}
                    value={minPauseSec}
                    onChange={(e) => {
                      setBreathPreset('custom');
                      setMinPauseSec(Number(e.target.value));
                    }}
                    className="w-full accent-[#FFB800]"
                  />
                </div>
              </div>

              <div className="flex items-center gap-2 pt-1">
                <button
                  onClick={() => handleRunBreathRemoval(true)}
                  disabled={processingBreath}
                  className="flex-1 py-2 rounded-lg bg-[#FFB800] text-[#111318] font-bold text-xs flex items-center justify-center gap-1 hover:brightness-110 transition whitespace-nowrap disabled:opacity-50"
                >
                  {processingBreath ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Zap className="w-3.5 h-3.5 fill-current" />
                  )}
                  一键去气口覆盖原音频
                </button>
                <button
                  onClick={() => handleRunBreathRemoval(false)}
                  disabled={processingBreath}
                  className="px-3 py-2 rounded-lg bg-[#252B3F] hover:bg-[#313954] text-xs text-white font-medium whitespace-nowrap transition disabled:opacity-50"
                >
                  去气口并另存副本
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 bg-[#11131B] border-t border-[#252A3A] flex flex-wrap items-center justify-between gap-2 shrink-0">
          <label className="flex items-center gap-2 text-xs text-[#CBD5E1] cursor-pointer">
            <input
              type="checkbox"
              checked={syncToGroup}
              onChange={(e) => setSyncToGroup(e.target.checked)}
              className="accent-[#00E5FF]"
            />
            保存后同步应用到当前选中成片组的{audioRole === 'voiceover' ? '「口播配音轨」' : '「BGM背景音乐轨」'}
          </label>

          <div className="flex items-center gap-2">
            <button
              onClick={() => handleRenderStandaloneCopy(false)}
              disabled={renderingCopy}
              className="px-3 py-1.5 rounded-lg bg-[#23283B] hover:bg-[#2F364F] border border-[#38415E] text-xs text-white flex items-center gap-1.5 whitespace-nowrap transition disabled:opacity-50"
            >
              {renderingCopy ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <CopyPlus className="w-3.5 h-3.5 text-[#00E5FF]" />
              )}
              渲染另存为独立精剪 MP3
            </button>

            <button
              onClick={() => {
                if (audioRef.current) audioRef.current.pause();
                onSaveNonDestructive(currentAsset.id, {
                  audioRole,
                  trimStart,
                  trimEnd,
                  speed,
                  fadeInSec,
                  fadeOutSec,
                  syncToActiveGroup: syncToGroup,
                });
                onClose();
              }}
              className="px-4 py-1.5 rounded-lg bg-[#00E5FF] text-[#061017] font-bold text-xs flex items-center gap-1.5 whitespace-nowrap hover:brightness-110 transition"
            >
              <Check className="w-3.5 h-3.5 stroke-[2.5]" />
              保存裁剪与混音参数
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
