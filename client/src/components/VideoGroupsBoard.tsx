import React, { useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  CheckSquare,
  Copy,
  Crop,
  Download,
  Film,
  GripVertical,
  MessageSquareText,
  Mic,
  Music,
  Play,
  Plus,
  Scissors,
  ShieldCheck,
  Sparkles,
  Square,
  Stamp,
  Trash2,
  Type,
  VolumeX,
} from 'lucide-react';
import {
  getClipEffectiveDuration,
  getGroupTotalDuration,
  isCustomCropped,
  MediaAsset,
  TimelineClip,
  TRANSITION_LABELS,
  VideoGroup,
} from '@shared/schema';
import { formatShortSec } from '../utils/format';
import {
  clearDragPayload,
  peekDragPayload,
  readDragPayload,
  setDragPayload,
} from '../utils/dnd';

interface Props {
  groups: VideoGroup[];
  activeGroupId: string | null;
  selectedClipId: string | null;
  assetMap: Map<string, MediaAsset>;
  onSelectGroup: (groupId: string, autoPlay?: boolean) => void;
  onSelectClip: (groupId: string, clipId: string) => void;
  onCreateGroup: (withAssetIds?: string[]) => void;
  onDuplicateGroup: (groupId: string) => void;
  onDeleteGroup: (groupId: string) => void;
  onDeleteSelectedGroups: () => void;
  onRenameGroup: (groupId: string, name: string) => void;
  onToggleGroupExport: (groupId: string) => void;
  onToggleAllGroupsExport: (checked: boolean) => void;
  onReorderGroups: (fromIdx: number, toIdx: number) => void;
  onInsertLibraryAssetsAt: (groupId: string, insertIdx: number, assetIds: string[]) => void;
  onMoveOrCopyClip: (
    fromGroupId: string,
    clipId: string,
    toGroupId: string,
    insertIdx: number,
    copy: boolean
  ) => void;
  onMoveClipToNewGroup: (fromGroupId: string, clipId: string, copy: boolean) => void;
  onNudgeClip: (groupId: string, clipIdx: number, delta: -1 | 1) => void;
  onDuplicateClip: (groupId: string, clipId: string) => void;
  onRemoveClip: (groupId: string, clipId: string) => void;
  onToggleMuteClip: (groupId: string, clipId: string) => void;
  onOpenTrimClip: (group: VideoGroup, clip: TimelineClip) => void;
  onQuickExportSingleGroup: (groupId: string) => void;
}

export const VideoGroupsBoard: React.FC<Props> = ({
  groups,
  activeGroupId,
  selectedClipId,
  assetMap,
  onSelectGroup,
  onSelectClip,
  onCreateGroup,
  onDuplicateGroup,
  onDeleteGroup,
  onDeleteSelectedGroups,
  onRenameGroup,
  onToggleGroupExport,
  onToggleAllGroupsExport,
  onReorderGroups,
  onInsertLibraryAssetsAt,
  onMoveOrCopyClip,
  onMoveClipToNewGroup,
  onNudgeClip,
  onDuplicateClip,
  onRemoveClip,
  onToggleMuteClip,
  onOpenTrimClip,
  onQuickExportSingleGroup,
}) => {
  const [dropHint, setDropHint] = useState<{
    groupId: string;
    insertIdx: number;
  } | null>(null);

  const [rowDropIdx, setRowDropIdx] = useState<number | null>(null);
  const [newZoneHover, setNewZoneHover] = useState(false);

  const allSelected = groups.length > 0 && groups.every((g) => g.selectedForExport);
  const selectedCount = groups.filter((g) => g.selectedForExport).length;

  const handleTrackDragOver = (
    e: React.DragEvent,
    groupId: string,
    defaultInsertIdx: number
  ) => {
    const payload = peekDragPayload();
    if (!payload || (payload.kind !== 'library-assets' && payload.kind !== 'group-clip')) {
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    setDropHint({ groupId, insertIdx: defaultInsertIdx });
  };

  const handleClipCardDragOver = (
    e: React.DragEvent,
    groupId: string,
    clipIdx: number
  ) => {
    const payload = peekDragPayload();
    if (!payload || (payload.kind !== 'library-assets' && payload.kind !== 'group-clip')) {
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    const isRightHalf = e.clientX > rect.left + rect.width / 2;
    setDropHint({ groupId, insertIdx: isRightHalf ? clipIdx + 1 : clipIdx });
  };

  const handleTrackDrop = (
    e: React.DragEvent,
    targetGroupId: string,
    fallbackIdx: number
  ) => {
    const payload = readDragPayload(e);
    if (!payload) return;
    if (payload.kind !== 'library-assets' && payload.kind !== 'group-clip') return;

    e.preventDefault();
    e.stopPropagation();
    const insertIdx =
      dropHint && dropHint.groupId === targetGroupId ? dropHint.insertIdx : fallbackIdx;
    setDropHint(null);
    clearDragPayload();

    if (payload.kind === 'library-assets') {
      onInsertLibraryAssetsAt(targetGroupId, insertIdx, payload.assetIds);
    } else if (payload.kind === 'group-clip') {
      const isCopy = e.altKey || e.ctrlKey || e.metaKey;
      onMoveOrCopyClip(
        payload.fromGroupId,
        payload.clipId,
        targetGroupId,
        insertIdx,
        isCopy
      );
    }
  };

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Sub-toolbar */}
      <div className="px-3 py-1.5 bg-[#14161D] border-b border-[#232632] flex items-center justify-between gap-2 shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <button
            onClick={() => onToggleAllGroupsExport(!allSelected)}
            className="text-xs text-[#CBD5E1] hover:text-white flex items-center gap-1.5 whitespace-nowrap shrink-0"
          >
            {allSelected ? (
              <CheckSquare className="w-4 h-4 text-[#00E5FF] shrink-0" />
            ) : (
              <Square className="w-4 h-4 text-[#8A90A2] shrink-0" />
            )}
            已选 {selectedCount}/{groups.length} 组
          </button>

          {selectedCount > 0 && groups.length > 1 && (
            <button
              onClick={onDeleteSelectedGroups}
              className="px-2 py-0.5 rounded bg-[#231B20] hover:bg-red-500/20 border border-red-500/30 text-[11px] text-red-300 flex items-center gap-1 whitespace-nowrap shrink-0 transition"
            >
              <Trash2 className="w-3 h-3 shrink-0" />
              删除勾选
            </button>
          )}

          <span className="text-[11px] text-[#7E8596] truncate hidden lg:inline">
            可拖拽片段调序或跨组移动（按住 Alt 拖拽复制）
          </span>
        </div>

        <button
          onClick={() => onCreateGroup()}
          className="px-2.5 py-1 rounded-lg bg-[#00E5FF]/15 hover:bg-[#00E5FF]/25 border border-[#00E5FF]/50 text-[#00E5FF] font-semibold text-xs whitespace-nowrap shrink-0 flex items-center gap-1 transition"
        >
          <Plus className="w-3.5 h-3.5 shrink-0" />
          新建视频组
        </button>
      </div>

      {/* Multi-Group Storyboard Tracks */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
        {groups.map((group, gIdx) => {
          const isActive = group.id === activeGroupId;
          const totalDur = getGroupTotalDuration(group);
          const bgmAsset = group.bgmAssetId ? assetMap.get(group.bgmAssetId) : null;
          const voAsset = group.voiceoverAssetId
            ? assetMap.get(group.voiceoverAssetId)
            : null;
          const hasTitle = Boolean(
            group.overlay.topTitle?.trim() || group.overlay.bottomTitle?.trim()
          );

          return (
            <div
              key={group.id}
              onClick={() => onSelectGroup(group.id)}
              onDragOver={(e) => {
                const p = peekDragPayload();
                if (p?.kind === 'group-row') {
                  e.preventDefault();
                  setRowDropIdx(gIdx);
                }
              }}
              onDragLeave={() => {
                if (rowDropIdx === gIdx) setRowDropIdx(null);
              }}
              onDrop={(e) => {
                const p = readDragPayload(e);
                if (p?.kind === 'group-row') {
                  e.preventDefault();
                  setRowDropIdx(null);
                  clearDragPayload();
                  if (p.fromIndex !== gIdx) {
                    onReorderGroups(p.fromIndex, gIdx);
                  }
                }
              }}
              className={`rounded-xl border transition flex flex-col md:flex-row overflow-hidden ${
                rowDropIdx === gIdx ? 'ring-2 ring-[#FFB800]' : ''
              } ${
                isActive
                  ? 'bg-[#1B1E29] border-[#00E5FF]/70 shadow-[0_0_0_1px_rgba(0,229,255,0.2)]'
                  : 'bg-[#161821] border-[#252938] hover:border-[#363B4E]'
              }`}
            >
              {/* Left Group Control Header */}
              <div className="w-full md:w-[245px] shrink-0 p-2.5 bg-[#13151D] border-b md:border-b-0 md:border-r border-[#242836] flex flex-col justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  <div
                    draggable
                    onDragStart={(e) => {
                      e.stopPropagation();
                      setDragPayload(e, {
                        kind: 'group-row',
                        groupId: group.id,
                        fromIndex: gIdx,
                      });
                    }}
                    onDragEnd={clearDragPayload}
                    className="p-0.5 text-[#5E6577] hover:text-white cursor-grab active:cursor-grabbing"
                    title="上下拖动调整视频组排列顺序"
                  >
                    <GripVertical className="w-3.5 h-3.5" />
                  </div>

                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleGroupExport(group.id);
                    }}
                    className="shrink-0"
                    title="勾选是否加入批量合成导出"
                  >
                    {group.selectedForExport ? (
                      <CheckSquare className="w-4 h-4 text-[#00E5FF]" />
                    ) : (
                      <Square className="w-4 h-4 text-[#6B7280]" />
                    )}
                  </button>

                  <span className="text-[11px] font-mono text-[#00E5FF] font-bold shrink-0">
                    #{String(gIdx + 1).padStart(2, '0')}
                  </span>

                  <input
                    type="text"
                    value={group.name}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => onRenameGroup(group.id, e.target.value)}
                    className="bg-transparent hover:bg-[#1E2230] focus:bg-[#1E2230] rounded px-1.5 py-0.5 text-xs font-semibold text-white outline-none min-w-0 flex-1 border border-transparent focus:border-[#00E5FF]/50"
                  />
                </div>

                {/* Group Metadata Pills */}
                <div className="flex flex-wrap items-center gap-1 text-[10px]">
                  <span className="px-1.5 py-0.5 rounded bg-[#212534] text-[#E2E8F0] font-mono">
                    {group.clips.length}段 · {formatShortSec(totalDur)}
                  </span>
                  {hasTitle && (
                    <span className="px-1.5 py-0.5 rounded bg-[#FFB800]/15 text-[#FFB800] flex items-center gap-0.5">
                      <Type className="w-2.5 h-2.5" />
                      花字
                    </span>
                  )}
                  {group.subtitles?.enabled && group.subtitles.cues.length > 0 && (
                    <span className="px-1.5 py-0.5 rounded bg-emerald-400/15 text-emerald-300 flex items-center gap-0.5">
                      <MessageSquareText className="w-2.5 h-2.5" />
                      字幕{group.subtitles.cues.length}句
                    </span>
                  )}
                  {group.watermark?.enabled && (
                    <span className="px-1.5 py-0.5 rounded bg-sky-400/15 text-sky-300 flex items-center gap-0.5">
                      <Stamp className="w-2.5 h-2.5" />
                      角标
                    </span>
                  )}
                  {group.dedup?.enabled && (
                    <span
                      className="px-1.5 py-0.5 rounded bg-purple-400/15 text-purple-300 flex items-center gap-0.5"
                      title={`防重：${group.dedup.mirrorFlip ? '镜像+' : ''}缩放+${group.dedup.zoomPunchPct}%`}
                    >
                      <ShieldCheck className="w-2.5 h-2.5" />
                      已防重
                    </span>
                  )}
                  {voAsset && (
                    <span
                      className="px-1.5 py-0.5 rounded bg-amber-400/20 text-amber-300 flex items-center gap-0.5 max-w-[95px] truncate"
                      title={`口播配音：${voAsset.name}`}
                    >
                      <Mic className="w-2.5 h-2.5 shrink-0" />
                      <span className="truncate">{voAsset.name}</span>
                    </span>
                  )}
                  {bgmAsset && (
                    <span
                      className="px-1.5 py-0.5 rounded bg-[#00E5FF]/12 text-[#00E5FF] flex items-center gap-0.5 max-w-[90px] truncate"
                      title={bgmAsset.name}
                    >
                      <Music className="w-2.5 h-2.5 shrink-0" />
                      <span className="truncate">{bgmAsset.name}</span>
                    </span>
                  )}
                </div>

                {/* Group Quick Action Bar */}
                <div className="flex items-center justify-between pt-1 border-t border-[#1F2330]">
                  <div className="flex items-center gap-1">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectGroup(group.id, true);
                      }}
                      className="px-2 py-1 rounded bg-[#232838] hover:bg-[#00E5FF] text-[#E5E7EB] hover:text-[#081016] text-[10px] font-medium flex items-center gap-1 transition"
                    >
                      <Play className="w-2.5 h-2.5 fill-current" />
                      预览
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onQuickExportSingleGroup(group.id);
                      }}
                      disabled={group.clips.length === 0}
                      className="px-2 py-1 rounded bg-[#232838] hover:bg-[#2F364C] text-[#00E5FF] text-[10px] font-medium flex items-center gap-1 transition disabled:opacity-40"
                      title="单独快速导出本条视频组 MP4"
                    >
                      <Sparkles className="w-2.5 h-2.5" />
                      单导
                    </button>
                    {group.lastExportUrl && (
                      <a
                        href={group.lastExportUrl}
                        download={group.lastExportFilename || `${group.name}.mp4`}
                        onClick={(e) => e.stopPropagation()}
                        className="px-1.5 py-1 rounded bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30 text-[10px] flex items-center gap-0.5"
                        title="下载最近一次导出的成片 MP4"
                      >
                        <Download className="w-2.5 h-2.5" />
                      </a>
                    )}
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onDuplicateGroup(group.id);
                      }}
                      className="p-1 rounded hover:bg-[#252A3A] text-[#8A90A2] hover:text-white"
                      title="复制整条视频组创建变体"
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteGroup(group.id);
                      }}
                      className="p-1 rounded hover:bg-red-500/15 text-[#8A90A2] hover:text-red-400"
                      title="删除该视频组"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>

              {/* Right Horizontal Sequence Clip Track */}
              <div
                className="flex-1 p-2.5 flex items-center gap-2 overflow-x-auto min-h-[108px]"
                onDragOver={(e) => handleTrackDragOver(e, group.id, group.clips.length)}
                onDragLeave={(e) => {
                  if (e.currentTarget === e.target) setDropHint(null);
                }}
                onDrop={(e) => handleTrackDrop(e, group.id, group.clips.length)}
              >
                {group.clips.map((clip, cIdx) => {
                  const asset = assetMap.get(clip.assetId);
                  if (!asset) return null;
                  const effDur = getClipEffectiveDuration(clip);
                  const isClipSelected = isActive && selectedClipId === clip.id;
                  const showLeftIndicator =
                    dropHint?.groupId === group.id && dropHint.insertIdx === cIdx;
                  const showRightIndicator =
                    dropHint?.groupId === group.id &&
                    cIdx === group.clips.length - 1 &&
                    dropHint.insertIdx === group.clips.length;

                  return (
                    <React.Fragment key={clip.id}>
                      {showLeftIndicator && (
                        <div className="w-1 h-20 rounded-full bg-[#00E5FF] shadow-[0_0_10px_#00E5FF] shrink-0 animate-pulse" />
                      )}

                      <div
                        draggable
                        onDragStart={(e) => {
                          e.stopPropagation();
                          setDragPayload(e, {
                            kind: 'group-clip',
                            fromGroupId: group.id,
                            clipId: clip.id,
                            fromIndex: cIdx,
                          });
                        }}
                        onDragEnd={() => {
                          setDropHint(null);
                          clearDragPayload();
                        }}
                        onDragOver={(e) => handleClipCardDragOver(e, group.id, cIdx)}
                        onDrop={(e) => handleTrackDrop(e, group.id, cIdx)}
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectGroup(group.id);
                          onSelectClip(group.id, clip.id);
                        }}
                        className={`group/clip relative w-[148px] shrink-0 rounded-lg overflow-hidden border transition cursor-grab active:cursor-grabbing select-none ${
                          isClipSelected
                            ? 'bg-[#252B3D] border-[#FFB800] ring-1 ring-[#FFB800]/50'
                            : 'bg-[#1D202C] border-[#2C3144] hover:border-[#49516D]'
                        }`}
                      >
                        {/* Clip Thumbnail */}
                        <div className="relative h-[64px] bg-[#0E1016] overflow-hidden">
                          {asset.thumbnailUrl ? (
                            <img
                              src={asset.thumbnailUrl}
                              alt=""
                              className="w-full h-full object-cover pointer-events-none"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-[#565E73]">
                              <Film className="w-5 h-5" />
                            </div>
                          )}

                          {/* Sequence Order Pill */}
                          <span className="absolute top-1 left-1 px-1.5 py-0.2 rounded bg-black/75 text-[10px] font-mono font-bold text-[#00E5FF]">
                            {String(cIdx + 1).padStart(2, '0')}
                          </span>

                          {/* Badges (Muted / Cropped / Speed) */}
                          <div className="absolute bottom-1 left-1 flex items-center gap-0.5 pointer-events-none">
                            {clip.muted && (
                              <span className="p-0.5 rounded bg-red-500/85 text-white">
                                <VolumeX className="w-2.5 h-2.5" />
                              </span>
                            )}
                            {isCustomCropped(clip.crop) && (
                              <span className="p-0.5 rounded bg-[#00E5FF] text-[#081016]">
                                <Crop className="w-2.5 h-2.5" />
                              </span>
                            )}
                            {Math.abs(clip.speed - 1) > 0.02 && (
                              <span className="px-1 rounded bg-[#FFB800] text-[#111318] text-[9px] font-bold">
                                {clip.speed}x
                              </span>
                            )}
                          </div>

                          <span className="absolute bottom-1 right-1 px-1 py-0.2 rounded bg-black/75 text-[10px] font-mono text-white">
                            {formatShortSec(effDur)}
                          </span>

                          {/* Hover Quick Controls */}
                          <div className="absolute inset-0 bg-black/60 opacity-0 group-hover/clip:opacity-100 transition flex items-center justify-center gap-1">
                            {cIdx > 0 && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onNudgeClip(group.id, cIdx, -1);
                                }}
                                className="p-1 rounded bg-[#232736] hover:bg-[#343A50] text-white"
                                title="前移一位"
                              >
                                <ArrowLeft className="w-3 h-3" />
                              </button>
                            )}
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                onOpenTrimClip(group, clip);
                              }}
                              className="p-1 rounded bg-[#FFB800] text-[#111318] hover:brightness-110"
                              title="精准裁剪该片段时长与画面"
                            >
                              <Scissors className="w-3 h-3" />
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                onToggleMuteClip(group.id, clip.id);
                              }}
                              className="p-1 rounded bg-[#232736] hover:bg-[#343A50] text-white"
                              title={clip.muted ? '恢复原声' : '静音该段'}
                            >
                              <VolumeX className="w-3 h-3" />
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                onDuplicateClip(group.id, clip.id);
                              }}
                              className="p-1 rounded bg-[#232736] hover:bg-[#343A50] text-white"
                              title="复制该片段"
                            >
                              <Copy className="w-3 h-3" />
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                onRemoveClip(group.id, clip.id);
                              }}
                              className="p-1 rounded bg-red-500/80 hover:bg-red-500 text-white"
                              title="从本组移除"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                            {cIdx < group.clips.length - 1 && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onNudgeClip(group.id, cIdx, 1);
                                }}
                                className="p-1 rounded bg-[#232736] hover:bg-[#343A50] text-white"
                                title="后移一位"
                              >
                                <ArrowRight className="w-3 h-3" />
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Clip Label Footer */}
                        <div className="px-2 py-1 flex items-center justify-between gap-1 text-[10px]">
                          <span className="text-[#D1D5DB] truncate">{asset.name}</span>
                          {cIdx < group.clips.length - 1 && clip.transition !== 'none' && (
                            <span
                              className="text-[9px] px-1 rounded bg-[#00E5FF]/15 text-[#00E5FF] shrink-0"
                              title={TRANSITION_LABELS[clip.transition]}
                            >
                              转场
                            </span>
                          )}
                        </div>
                      </div>

                      {showRightIndicator && (
                        <div className="w-1 h-20 rounded-full bg-[#00E5FF] shadow-[0_0_10px_#00E5FF] shrink-0 animate-pulse" />
                      )}
                    </React.Fragment>
                  );
                })}

                {/* Empty / Append Drop Slot inside Group */}
                <div
                  className={`h-[84px] min-w-[130px] px-3 rounded-lg border border-dashed flex flex-col items-center justify-center text-center shrink-0 transition ${
                    dropHint?.groupId === group.id && dropHint.insertIdx === group.clips.length
                      ? 'border-[#00E5FF] bg-[#00E5FF]/10 text-[#00E5FF]'
                      : 'border-[#2D3244] text-[#6B7280] hover:border-[#434A63] hover:text-[#9CA3AF]'
                  }`}
                >
                  <Plus className="w-4 h-4 mb-0.5" />
                  <span className="text-[10px]">
                    {group.clips.length === 0 ? '拖入素材或从左侧添加' : '拖入追加片段'}
                  </span>
                </div>
              </div>
            </div>
          );
        })}

        {/* Dropzone to Auto-Create a Brand New Video Group */}
        <div
          onDragOver={(e) => {
            const p = peekDragPayload();
            if (p?.kind === 'library-assets' || p?.kind === 'group-clip') {
              e.preventDefault();
              setNewZoneHover(true);
            }
          }}
          onDragLeave={() => setNewZoneHover(false)}
          onDrop={(e) => {
            const p = readDragPayload(e);
            setNewZoneHover(false);
            clearDragPayload();
            if (!p) return;
            e.preventDefault();
            if (p.kind === 'library-assets') {
              onCreateGroup(p.assetIds);
            } else if (p.kind === 'group-clip') {
              const isCopy = e.altKey || e.ctrlKey || e.metaKey;
              onMoveClipToNewGroup(p.fromGroupId, p.clipId, isCopy);
            }
          }}
          onClick={() => onCreateGroup()}
          className={`py-4 px-4 rounded-xl border-2 border-dashed transition cursor-pointer flex items-center justify-center gap-2 text-xs ${
            newZoneHover
              ? 'border-[#00E5FF] bg-[#00E5FF]/15 text-[#00E5FF] font-semibold'
              : 'border-[#282C3C] hover:border-[#3D445C] text-[#8A90A2] hover:text-white bg-[#13151C]/60'
          }`}
        >
          <Plus className="w-4 h-4" />
          点击新建空白视频组，或直接将素材/片段拖拽到此处自动创建新视频组
        </div>
      </div>
    </div>
  );
};
