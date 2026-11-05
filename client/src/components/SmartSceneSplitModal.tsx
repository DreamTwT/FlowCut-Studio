import React, { useEffect, useRef, useState } from 'react';
import {
  CheckSquare,
  Film,
  Grid,
  Loader2,
  Pause,
  Play,
  PlusCircle,
  RefreshCw,
  Scissors,
  Sparkles,
  Square,
  X,
} from 'lucide-react';
import {
  DetectedSceneSegment,
  MediaAsset,
  ProjectData,
  SCENE_TAGS,
  SceneSplitDispatchMode,
  SceneSplitMode,
  SceneSplitSensitivity,
  SceneTag,
  VideoGroup,
} from '@shared/schema';
import { commitSceneSplitApi, detectVideoScenesApi } from '../api';
import { formatShortSec } from '../utils/format';
import { CustomSelect } from './CustomSelect';

interface Props {
  project: ProjectData;
  asset: MediaAsset;
  activeGroup: VideoGroup | null;
  onClose: () => void;
  onSplitCommitted: (
    updatedProject: ProjectData,
    createdAssets: MediaAsset[],
    dispatchMode: SceneSplitDispatchMode,
    toastMsg: string
  ) => void;
}

function autoNarrativeTag(idx: number, total: number): SceneTag {
  if (total <= 1) return '核心卖点';
  if (idx === 0) return '吸睛开头';
  if (idx === total - 1) return '促销CTA';
  if (idx === 1 && total >= 4) return '痛点场景';
  return idx % 2 === 0 ? '核心卖点' : '产品特写';
}

export const SmartSceneSplitModal: React.FC<Props> = ({
  project,
  asset,
  activeGroup,
  onClose,
  onSplitCommitted,
}) => {
  const [mode, setMode] = useState<SceneSplitMode>('smart_scdet');
  const [sensitivity, setSensitivity] = useState<SceneSplitSensitivity>('standard');
  const [minShotSec, setMinShotSec] = useState<number>(1.5);
  const [fixedIntervalSec, setFixedIntervalSec] = useState<number>(3.0);
  const [removeOriginal, setRemoveOriginal] = useState<boolean>(false);

  const [scanning, setScanning] = useState<boolean>(true);
  const [committing, setCommitting] = useState<boolean>(false);
  const [segments, setSegments] = useState<DetectedSceneSegment[]>([]);
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());
  const [fallbackNote, setFallbackNote] = useState<string | undefined>(undefined);

  // Preview state for active sub-shot
  const [previewSegId, setPreviewSegId] = useState<string | null>(null);
  const [isPlayingShot, setIsPlayingShot] = useState<boolean>(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const runScan = async (
    overrideMode?: SceneSplitMode,
    overrideSens?: SceneSplitSensitivity,
    overrideFixed?: number
  ) => {
    setScanning(true);
    setIsPlayingShot(false);
    try {
      const res = await detectVideoScenesApi(project, asset.id, {
        mode: overrideMode ?? mode,
        sensitivity: overrideSens ?? sensitivity,
        minShotSec,
        fixedIntervalSec: overrideFixed ?? fixedIntervalSec,
      });
      setSegments(res.segments);
      setCheckedIds(new Set(res.segments.map((s) => s.id)));
      setFallbackNote(res.autoFallbackNote);
      if (res.segments[0]) {
        setPreviewSegId(res.segments[0].id);
      }
    } catch (err: any) {
      alert(err?.message || '智能镜头扫描失败');
    } finally {
      setScanning(false);
    }
  };

  useEffect(() => {
    void runScan();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [asset.id]);

  const activeSeg = segments.find((s) => s.id === previewSegId) || segments[0] || null;

  useEffect(() => {
    const v = videoRef.current;
    if (!v || !activeSeg) return;
    v.currentTime = activeSeg.startSec;
  }, [activeSeg?.id]);

  const handlePreviewShot = (seg: DetectedSceneSegment) => {
    setPreviewSegId(seg.id);
    const v = videoRef.current;
    if (!v) return;
    v.currentTime = seg.startSec;
    v.play()
      .then(() => setIsPlayingShot(true))
      .catch(() => setIsPlayingShot(false));
  };

  const handleAutoNarrativeTags = () => {
    setSegments((prev) =>
      prev.map((seg, idx) => ({
        ...seg,
        sceneTag: autoNarrativeTag(idx, prev.length),
      }))
    );
  };

  const handleCommit = async (dispatchMode: SceneSplitDispatchMode) => {
    const picked = segments.filter((s) => checkedIds.has(s.id));
    if (picked.length === 0) {
      alert('请至少勾选 1 个要拆分的镜头');
      return;
    }

    setCommitting(true);
    try {
      const res = await commitSceneSplitApi(project, asset.id, {
        segments: picked.map((s) => ({
          startSec: s.startSec,
          endSec: s.endSec,
          name: s.name,
          sceneTag: s.sceneTag,
          thumbnailUrl: s.thumbnailUrl,
        })),
        dispatchMode,
        targetGroupId: activeGroup?.id,
        removeOriginalAsset: removeOriginal,
      });

      const toastMsg =
        dispatchMode === 'matrix_slots_by_tag'
          ? `✂️ 已将长视频拆分为 ${res.createdAssets.length} 个独立镜头，并按标签自动塞入分镜矩阵槽！`
          : dispatchMode === 'active_group'
          ? `✂️ 已拆分为 ${res.createdAssets.length} 个独立镜头，并按顺序放入「${activeGroup?.name || '当前组'}」！`
          : `✂️ 已零拷贝极速拆分为 ${res.createdAssets.length} 个独立子素材入库！`;

      onSplitCommitted(res.project, res.createdAssets, dispatchMode, toastMsg);
      onClose();
    } catch (err: any) {
      alert(err?.message || '拆分镜头提交失败');
    } finally {
      setCommitting(false);
    }
  };

  const checkedCount = segments.filter((s) => checkedIds.has(s.id)).length;

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 select-none">
      <div className="w-full max-w-5xl max-h-[92vh] rounded-2xl bg-[#151821] border border-[#2D3348] shadow-2xl flex flex-col overflow-hidden">
        {/* Top Header */}
        <div className="px-5 py-3 bg-[#11131B] border-b border-[#252A3A] flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#FFB800] to-[#FF6B00] flex items-center justify-center text-[#111318] shadow shrink-0">
              <Scissors className="w-4 h-4 stroke-[2.4]" />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm font-bold text-white flex items-center gap-2 truncate">
                <span>长视频智能镜头拆条工作台</span>
                <span className="px-1.5 py-0.5 rounded bg-[#FFB800]/18 text-[#FFB800] text-[10px] font-mono shrink-0">
                  FFmpeg scdet · 零拷贝秒拆
                </span>
              </h2>
              <p className="text-[11px] text-[#8A90A2] truncate">
                源片：{asset.name}（总长 {formatShortSec(asset.duration)} · {asset.width}×{asset.height}）
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

        {/* Main 2-Column Workbench */}
        <div className="flex-1 min-h-0 overflow-y-auto p-5 grid grid-cols-1 lg:grid-cols-12 gap-5">
          {/* Left 4 Cols: Shot Video Preview + Detection Parameters */}
          <div className="lg:col-span-4 space-y-3.5">
            {/* Live Sub-Shot Video Previewer */}
            <div className="rounded-xl bg-[#0D0F16] border border-[#272D42] overflow-hidden">
              <div className="relative h-48 bg-black flex items-center justify-center">
                <video
                  ref={videoRef}
                  src={asset.url}
                  className="max-h-full max-w-full object-contain"
                  onTimeUpdate={(e) => {
                    const v = e.currentTarget;
                    if (activeSeg && v.currentTime >= activeSeg.endSec) {
                      v.pause();
                      v.currentTime = activeSeg.startSec;
                      setIsPlayingShot(false);
                    }
                  }}
                  onPause={() => setIsPlayingShot(false)}
                  onPlay={() => setIsPlayingShot(true)}
                />
                {activeSeg && (
                  <button
                    type="button"
                    onClick={() => {
                      const v = videoRef.current;
                      if (!v) return;
                      if (isPlayingShot) {
                        v.pause();
                      } else {
                        if (
                          v.currentTime < activeSeg.startSec ||
                          v.currentTime >= activeSeg.endSec - 0.05
                        ) {
                          v.currentTime = activeSeg.startSec;
                        }
                        void v.play();
                      }
                    }}
                    className="absolute bottom-2.5 right-2.5 px-2.5 py-1 rounded-lg bg-black/75 hover:bg-[#00E5FF] text-white hover:text-[#081016] border border-white/20 text-[11px] font-bold flex items-center gap-1 transition"
                  >
                    {isPlayingShot ? (
                      <>
                        <Pause className="w-3 h-3" />
                        暂停
                      </>
                    ) : (
                      <>
                        <Play className="w-3 h-3 fill-current" />
                        试看该镜头
                      </>
                    )}
                  </button>
                )}
              </div>

              {activeSeg && (
                <div className="px-3 py-2 bg-[#121622] border-t border-[#242B40] flex items-center justify-between text-[11px]">
                  <span className="text-white font-semibold truncate">
                    #{String(activeSeg.index + 1).padStart(2, '0')} · {activeSeg.name}
                  </span>
                  <span className="font-mono text-[#00E5FF] shrink-0">
                    {activeSeg.startSec.toFixed(1)}s ~ {activeSeg.endSec.toFixed(1)}s (
                    {activeSeg.durationSec.toFixed(1)}s)
                  </span>
                </div>
              )}
            </div>

            {/* Detection Controls */}
            <div className="p-3.5 rounded-xl bg-[#11141E] border border-[#282F45] space-y-3">
              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-[#CBD5E1]">拆条检测模式</label>
                <CustomSelect<SceneSplitMode>
                  value={mode}
                  options={[
                    {
                      value: 'smart_scdet',
                      label: '🎬 智能镜头转场识别 (scdet)',
                      rightMeta: 'AI视觉',
                      metaTone: 'emerald',
                    },
                    {
                      value: 'fixed_interval',
                      label: '⏱️ 固定秒数节奏均分拆条',
                      rightMeta: '一镜到底',
                      metaTone: 'amber',
                    },
                  ]}
                  onChange={(m) => {
                    setMode(m);
                    void runScan(m);
                  }}
                  menuMinWidth={260}
                  className="w-full h-9"
                />
              </div>

              {mode === 'smart_scdet' ? (
                <>
                  <div className="space-y-1">
                    <label className="text-[11px] font-semibold text-[#CBD5E1]">
                      画面突变灵敏度
                    </label>
                    <div className="grid grid-cols-3 gap-1.5">
                      {(
                        [
                          { id: 'high', label: '高灵敏·细拆' },
                          { id: 'standard', label: '标准推荐' },
                          { id: 'low', label: '仅大转场' },
                        ] as const
                      ).map((opt) => (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => {
                            setSensitivity(opt.id);
                            void runScan('smart_scdet', opt.id);
                          }}
                          className={`h-8 rounded-lg border text-[11px] font-semibold whitespace-nowrap transition ${
                            sensitivity === opt.id
                              ? 'bg-[#00E5FF]/18 border-[#00E5FF] text-[#00E5FF]'
                              : 'bg-[#171B28] border-[#2C334A] text-[#9CA3AF] hover:text-white'
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-1">
                    <div className="flex justify-between text-[11px]">
                      <span className="text-[#CBD5E1]">最短成片镜头过滤</span>
                      <span className="font-mono text-[#FFB800]">{minShotSec.toFixed(1)}s</span>
                    </div>
                    <input
                      type="range"
                      min={0.8}
                      max={4.0}
                      step={0.2}
                      value={minShotSec}
                      onChange={(e) => setMinShotSec(parseFloat(e.target.value))}
                      className="w-full accent-[#FFB800]"
                    />
                    <p className="text-[10px] text-[#7E8596]">
                      短于该时长的闪切碎帧将自动并入相邻镜头，避免产生废片
                    </p>
                  </div>
                </>
              ) : (
                <div className="space-y-1.5">
                  <label className="text-[11px] font-semibold text-[#CBD5E1]">
                    每段固定切分时长
                  </label>
                  <div className="grid grid-cols-4 gap-1.5">
                    {[2.0, 3.0, 4.0, 5.0].map((sec) => (
                      <button
                        key={sec}
                        type="button"
                        onClick={() => {
                          setFixedIntervalSec(sec);
                          void runScan('fixed_interval', sensitivity, sec);
                        }}
                        className={`h-8 rounded-lg border text-xs font-mono font-semibold whitespace-nowrap transition ${
                          Math.abs(fixedIntervalSec - sec) < 0.05
                            ? 'bg-[#FFB800]/18 border-[#FFB800] text-[#FFB800]'
                            : 'bg-[#171B28] border-[#2C334A] text-[#9CA3AF] hover:text-white'
                        }`}
                      >
                        {sec}s
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <button
                type="button"
                onClick={() => void runScan()}
                disabled={scanning}
                className="w-full h-9 rounded-lg bg-[#1E2436] hover:bg-[#272F46] border border-[#343E5C] text-xs font-semibold text-[#00E5FF] flex items-center justify-center gap-1.5 whitespace-nowrap transition disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${scanning ? 'animate-spin' : ''}`} />
                重新扫描视频切点
              </button>

              <label className="pt-2 border-t border-[#242B40] flex items-center gap-2 text-[11px] text-[#CBD5E1] cursor-pointer">
                <input
                  type="checkbox"
                  checked={removeOriginal}
                  onChange={(e) => setRemoveOriginal(e.target.checked)}
                  className="accent-[#00E5FF]"
                />
                <span>拆分入库后移除原长视频条目（节省列表空间）</span>
              </label>
            </div>
          </div>

          {/* Right 8 Cols: Visual Shot Storyboard & 1-Click Dispatch */}
          <div className="lg:col-span-8 flex flex-col min-h-[420px] rounded-xl bg-[#10131C] border border-[#272E44] overflow-hidden">
            <div className="px-4 py-2.5 bg-[#141824] border-b border-[#252C42] flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2 text-xs font-bold text-white">
                <Film className="w-3.5 h-3.5 text-[#FFB800]" />
                <span>识别出的独立镜头 ({segments.length} 段)</span>
              </div>

              <div className="flex items-center gap-2">
                {segments.length > 0 && (
                  <button
                    type="button"
                    onClick={handleAutoNarrativeTags}
                    className="px-2.5 py-1 rounded-md bg-[#20263A] hover:bg-[#2B334E] border border-[#353F5E] text-[11px] text-[#00E5FF] flex items-center gap-1 whitespace-nowrap transition"
                  >
                    <Sparkles className="w-3 h-3" />
                    按千川叙事顺序一键打标
                  </button>
                )}

                {segments.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      if (checkedCount === segments.length) {
                        setCheckedIds(new Set());
                      } else {
                        setCheckedIds(new Set(segments.map((s) => s.id)));
                      }
                    }}
                    className="text-[11px] text-[#00E5FF] hover:underline whitespace-nowrap"
                  >
                    {checkedCount === segments.length ? '取消全选' : '全选全部'}
                  </button>
                )}
              </div>
            </div>

            {fallbackNote && (
              <div className="px-4 py-1.5 bg-amber-500/12 border-b border-amber-500/30 text-[11px] text-amber-300">
                {fallbackNote}
              </div>
            )}

            <div className="flex-1 overflow-y-auto p-3.5 space-y-2">
              {scanning ? (
                <div className="h-full min-h-[300px] flex flex-col items-center justify-center gap-2.5 text-[#9CA3AF]">
                  <Loader2 className="w-7 h-7 text-[#00E5FF] animate-spin" />
                  <span className="text-xs text-white font-semibold">
                    正在高速扫描画面转场帧并提取各镜头封面...
                  </span>
                </div>
              ) : segments.length === 0 ? (
                <div className="h-full min-h-[280px] flex flex-col items-center justify-center text-xs text-[#8A90A2]">
                  暂未识别到可用分镜，请尝试切换为「固定秒数节奏均分拆条」
                </div>
              ) : (
                segments.map((seg, idx) => {
                  const checked = checkedIds.has(seg.id);
                  const isPreviewing = activeSeg?.id === seg.id;
                  return (
                    <div
                      key={seg.id}
                      onClick={() => handlePreviewShot(seg)}
                      className={`p-2.5 rounded-xl border transition flex items-center gap-3 cursor-pointer ${
                        isPreviewing
                          ? 'bg-[#1A2134] border-[#FFB800]'
                          : checked
                          ? 'bg-[#161B29] border-[#2C3550] hover:border-[#00E5FF]/50'
                          : 'bg-[#121520] border-[#222739] opacity-60'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          const next = new Set(checkedIds);
                          if (next.has(seg.id)) next.delete(seg.id);
                          else next.add(seg.id);
                          setCheckedIds(next);
                        }}
                        className={`shrink-0 ${
                          checked ? 'text-[#00E5FF]' : 'text-[#6B7280] hover:text-white'
                        }`}
                      >
                        {checked ? (
                          <CheckSquare className="w-4 h-4" />
                        ) : (
                          <Square className="w-4 h-4" />
                        )}
                      </button>

                      {/* Midpoint Thumbnail */}
                      <div className="relative w-24 h-14 rounded-lg bg-black overflow-hidden shrink-0 border border-white/10">
                        {seg.thumbnailUrl ? (
                          <img
                            src={seg.thumbnailUrl}
                            alt=""
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-[#64748B]">
                            <Film className="w-4 h-4" />
                          </div>
                        )}
                        <span className="absolute top-1 left-1 px-1 rounded bg-black/80 text-[9px] font-mono text-[#FFB800] font-bold">
                          #{String(idx + 1).padStart(2, '0')}
                        </span>
                        <span className="absolute bottom-1 right-1 px-1 rounded bg-black/80 text-[9px] font-mono text-white">
                          {seg.durationSec.toFixed(1)}s
                        </span>
                      </div>

                      {/* Editable Shot Name & Time Range */}
                      <div
                        className="flex-1 min-w-0 space-y-1"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <input
                          type="text"
                          value={seg.name}
                          onChange={(e) => {
                            const val = e.target.value;
                            setSegments((list) =>
                              list.map((x) => (x.id === seg.id ? { ...x, name: val } : x))
                            );
                          }}
                          className="w-full bg-[#0E1119] border border-[#262D42] focus:border-[#00E5FF] rounded px-2 py-1 text-xs text-white outline-none"
                        />
                        <div className="flex items-center gap-2 text-[10px] text-[#8A90A2] font-mono">
                          <span>
                            起止：{seg.startSec.toFixed(2)}s → {seg.endSec.toFixed(2)}s
                          </span>
                          {seg.score > 0 && seg.score < 100 && (
                            <span className="text-emerald-400">
                              转场强度 {seg.score.toFixed(1)}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Scene Tag Selector */}
                      <div className="shrink-0" onClick={(e) => e.stopPropagation()}>
                        <CustomSelect<SceneTag>
                          size="sm"
                          stopPropagation
                          value={seg.sceneTag}
                          options={SCENE_TAGS.map((t) => ({ value: t, label: t }))}
                          onChange={(val) => {
                            setSegments((list) =>
                              list.map((x) => (x.id === seg.id ? { ...x, sceneTag: val } : x))
                            );
                          }}
                          menuMinWidth={136}
                        />
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Bottom 1-Click Commit Action Bar */}
            <div className="p-3 bg-[#141824] border-t border-[#262E45] flex flex-wrap items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => void handleCommit('library_only')}
                disabled={checkedCount === 0 || scanning || committing}
                className="h-9 px-3.5 rounded-lg bg-[#22283C] hover:bg-[#2C344E] border border-[#36405E] text-xs font-semibold text-white flex items-center gap-1.5 whitespace-nowrap transition disabled:opacity-40"
              >
                <Scissors className="w-3.5 h-3.5 text-[#00E5FF]" />
                仅拆分入素材库 ({checkedCount}段)
              </button>

              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={() => void handleCommit('active_group')}
                  disabled={checkedCount === 0 || scanning || committing}
                  className="h-9 px-3.5 rounded-lg bg-[#00E5FF]/15 hover:bg-[#00E5FF] border border-[#00E5FF]/45 text-[#00E5FF] hover:text-[#071016] font-bold text-xs flex items-center gap-1.5 whitespace-nowrap transition disabled:opacity-40"
                >
                  <PlusCircle className="w-3.5 h-3.5" />
                  拆分并放入当前组
                </button>

                <button
                  type="button"
                  onClick={() => void handleCommit('matrix_slots_by_tag')}
                  disabled={checkedCount === 0 || scanning || committing}
                  className="h-9 px-4 rounded-lg bg-gradient-to-r from-[#FFB800] to-[#FF8A00] text-[#111318] font-black text-xs flex items-center gap-1.5 whitespace-nowrap hover:brightness-110 transition disabled:opacity-40"
                >
                  {committing ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      正在极速拆分入槽...
                    </>
                  ) : (
                    <>
                      <Grid className="w-3.5 h-3.5" />
                      拆分并按标签自动塞入矩阵槽 ({checkedCount}段)
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
