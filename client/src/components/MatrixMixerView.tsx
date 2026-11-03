import React, { useMemo, useState } from 'react';
import {
  GripVertical,
  Mic,
  Music,
  Plus,
  Scissors,
  Sparkles,
  Trash2,
  Wand2,
  X,
} from 'lucide-react';
import {
  FIT_MODE_LABELS,
  FitMode,
  MatrixConfig,
  MediaAsset,
  TITLE_STYLES,
  TitleStyleId,
  TRANSITION_LABELS,
  TransitionType,
} from '@shared/schema';
import { formatShortSec, uid } from '../utils/format';
import {
  clearDragPayload,
  peekDragPayload,
  readDragPayload,
  setDragPayload,
} from '../utils/dnd';
import { CustomSelect } from './CustomSelect';

interface Props {
  matrix: MatrixConfig;
  assets: MediaAsset[];
  assetMap: Map<string, MediaAsset>;
  isGenerating: boolean;
  onUpdateMatrix: (next: MatrixConfig) => void;
  onGenerateToGroups: () => void;
  onOpenTrimAsset: (asset: MediaAsset) => void;
  onPreviewAsset: (asset: MediaAsset) => void;
  onOpenTtsStudio?: () => void;
}

const SLOT_COLORS = ['#FF4D4F', '#FFB800', '#00E5FF', '#A855F7', '#10B981', '#EC4899'];

export const MatrixMixerView: React.FC<Props> = ({
  matrix,
  assets,
  assetMap,
  isGenerating,
  onUpdateMatrix,
  onGenerateToGroups,
  onOpenTrimAsset,
  onPreviewAsset,
  onOpenTtsStudio,
}) => {
  const [hoverSlotId, setHoverSlotId] = useState<string | null>(null);
  const [slotDropIdx, setSlotDropIdx] = useState<number | null>(null);

  const nonEmptySlotCounts = useMemo(() => {
    return matrix.slots
      .map((s) => s.assetIds.filter((id) => assetMap.get(id)?.type !== 'audio' && assetMap.has(id)).length)
      .filter((n) => n > 0);
  }, [matrix.slots, assetMap]);

  const totalCombinations = useMemo(() => {
    if (nonEmptySlotCounts.length === 0) return 0;
    return nonEmptySlotCounts.reduce((acc, n) => acc * n, 1);
  }, [nonEmptySlotCounts]);

  const handleAddSlot = () => {
    const idx = matrix.slots.length;
    onUpdateMatrix({
      ...matrix,
      slots: [
        ...matrix.slots,
        {
          id: uid(),
          name: `分镜段落 #${idx + 1}`,
          badgeColor: SLOT_COLORS[idx % SLOT_COLORS.length],
          assetIds: [],
        },
      ],
    });
  };

  const handleAutoFillByTags = () => {
    const visualAssets = assets.filter((a) => a.type !== 'audio');
    if (visualAssets.length === 0) return;

    const hooks = visualAssets.filter((a) => a.sceneTag === '吸睛开头').map((a) => a.id);
    const scenes = visualAssets
      .filter((a) => a.sceneTag === '痛点场景' || a.sceneTag === '产品特写')
      .map((a) => a.id);
    const features = visualAssets.filter((a) => a.sceneTag === '核心卖点').map((a) => a.id);
    const ctas = visualAssets.filter((a) => a.sceneTag === '促销CTA').map((a) => a.id);

    const nextSlots = [...matrix.slots];
    while (nextSlots.length < 4) {
      nextSlots.push({
        id: uid(),
        name: `分镜段落 #${nextSlots.length + 1}`,
        badgeColor: SLOT_COLORS[nextSlots.length % SLOT_COLORS.length],
        assetIds: [],
      });
    }

    if (hooks.length) nextSlots[0] = { ...nextSlots[0], assetIds: Array.from(new Set([...nextSlots[0].assetIds, ...hooks])) };
    if (scenes.length) nextSlots[1] = { ...nextSlots[1], assetIds: Array.from(new Set([...nextSlots[1].assetIds, ...scenes])) };
    if (features.length) nextSlots[2] = { ...nextSlots[2], assetIds: Array.from(new Set([...nextSlots[2].assetIds, ...features])) };
    if (ctas.length) nextSlots[3] = { ...nextSlots[3], assetIds: Array.from(new Set([...nextSlots[3].assetIds, ...ctas])) };

    onUpdateMatrix({ ...matrix, slots: nextSlots });
  };

  const handleDropIntoSlot = (e: React.DragEvent, targetSlotId: string) => {
    const payload = readDragPayload(e);
    setHoverSlotId(null);
    clearDragPayload();
    if (!payload) return;

    if (payload.kind === 'library-assets') {
      e.preventDefault();
      const validIds = payload.assetIds.filter((id) => assetMap.get(id)?.type !== 'audio');
      onUpdateMatrix({
        ...matrix,
        slots: matrix.slots.map((s) =>
          s.id === targetSlotId
            ? { ...s, assetIds: Array.from(new Set([...s.assetIds, ...validIds])) }
            : s
        ),
      });
    } else if (payload.kind === 'matrix-slot-asset') {
      e.preventDefault();
      if (payload.fromSlotId === targetSlotId) return;
      onUpdateMatrix({
        ...matrix,
        slots: matrix.slots.map((s) => {
          if (s.id === payload.fromSlotId) {
            return { ...s, assetIds: s.assetIds.filter((id) => id !== payload.assetId) };
          }
          if (s.id === targetSlotId && !s.assetIds.includes(payload.assetId)) {
            return { ...s, assetIds: [...s.assetIds, payload.assetId] };
          }
          return s;
        }),
      });
    }
  };

  return (
    <div className="flex flex-col lg:flex-row h-full min-h-0 overflow-hidden">
      {/* Left: Scene Slots Matrix Board */}
      <div className="flex-1 flex flex-col min-w-0 border-b lg:border-b-0 lg:border-r border-[#232632]">
        <div className="px-4 py-2 bg-[#14161D] border-b border-[#232632] flex flex-wrap items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-2 text-xs">
            <span className="font-bold text-white">分镜段落槽位 ({matrix.slots.length}组)</span>
            <span className="text-[11px] text-[#8A90A2]">
              从左侧拖拽多个候选素材到各个分镜段落，系统将自动跨组交叉排列生成信息流视频组
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleAutoFillByTags}
              className="px-2.5 py-1 rounded-md bg-[#232736] hover:bg-[#2F3549] border border-[#343B52] text-[11px] text-[#FFB800] flex items-center gap-1 transition"
              title="将素材库中标有【吸睛开头/痛点场景/核心卖点/促销CTA】的素材自动归入对应分镜槽"
            >
              <Wand2 className="w-3 h-3" />
              按素材标签智能归组
            </button>
            <button
              onClick={handleAddSlot}
              className="px-2.5 py-1 rounded-md bg-[#232736] hover:bg-[#2F3549] border border-[#343B52] text-[11px] text-white flex items-center gap-1 transition"
            >
              <Plus className="w-3 h-3" />
              新增分镜段落
            </button>
          </div>
        </div>

        {/* Horizontal Columns of Scene Slots */}
        <div className="flex-1 overflow-x-auto overflow-y-hidden p-3 flex items-stretch gap-3">
          {matrix.slots.map((slot, sIdx) => {
            const validAssets = slot.assetIds
              .map((id) => assetMap.get(id))
              .filter((a): a is MediaAsset => Boolean(a && a.type !== 'audio'));

            return (
              <div
                key={slot.id}
                onDragOver={(e) => {
                  const p = peekDragPayload();
                  if (p?.kind === 'library-assets' || p?.kind === 'matrix-slot-asset') {
                    e.preventDefault();
                    setHoverSlotId(slot.id);
                  } else if (p?.kind === 'matrix-slot') {
                    e.preventDefault();
                    setSlotDropIdx(sIdx);
                  }
                }}
                onDragLeave={() => {
                  if (hoverSlotId === slot.id) setHoverSlotId(null);
                  if (slotDropIdx === sIdx) setSlotDropIdx(null);
                }}
                onDrop={(e) => {
                  const p = readDragPayload(e);
                  if (p?.kind === 'matrix-slot') {
                    e.preventDefault();
                    setSlotDropIdx(null);
                    clearDragPayload();
                    if (p.fromIndex !== sIdx) {
                      const next = [...matrix.slots];
                      const [moved] = next.splice(p.fromIndex, 1);
                      next.splice(sIdx, 0, moved);
                      onUpdateMatrix({ ...matrix, slots: next });
                    }
                    return;
                  }
                  handleDropIntoSlot(e, slot.id);
                }}
                className={`w-[235px] shrink-0 rounded-xl border flex flex-col overflow-hidden transition ${
                  slotDropIdx === sIdx ? 'ring-2 ring-[#FFB800]' : ''
                } ${
                  hoverSlotId === slot.id
                    ? 'bg-[#1D2434] border-[#00E5FF]'
                    : 'bg-[#161922] border-[#262A39]'
                }`}
              >
                {/* Slot Header */}
                <div
                  className="px-2.5 py-2 bg-[#12141C] border-b border-[#242836] flex items-center justify-between gap-1"
                  style={{ borderTop: `3px solid ${slot.badgeColor}` }}
                >
                  <div className="flex items-center gap-1 min-w-0 flex-1">
                    <div
                      draggable
                      onDragStart={(e) => {
                        e.stopPropagation();
                        setDragPayload(e, {
                          kind: 'matrix-slot',
                          slotId: slot.id,
                          fromIndex: sIdx,
                        });
                      }}
                      onDragEnd={clearDragPayload}
                      className="text-[#5E6577] hover:text-white cursor-grab"
                      title="拖动更改分镜先后顺序"
                    >
                      <GripVertical className="w-3.5 h-3.5" />
                    </div>
                    <input
                      type="text"
                      value={slot.name}
                      onChange={(e) => {
                        const val = e.target.value;
                        onUpdateMatrix({
                          ...matrix,
                          slots: matrix.slots.map((s) =>
                            s.id === slot.id ? { ...s, name: val } : s
                          ),
                        });
                      }}
                      className="bg-transparent focus:bg-[#1E2230] rounded px-1 py-0.5 text-xs font-bold text-white outline-none min-w-0 flex-1"
                    />
                  </div>
                  <span className="px-1.5 py-0.5 rounded bg-[#232736] text-[10px] font-mono text-[#00E5FF] shrink-0">
                    {validAssets.length}项
                  </span>
                  {matrix.slots.length > 1 && (
                    <button
                      onClick={() =>
                        onUpdateMatrix({
                          ...matrix,
                          slots: matrix.slots.filter((s) => s.id !== slot.id),
                        })
                      }
                      className="p-0.5 text-[#6B7280] hover:text-red-400"
                      title="删除此分镜槽"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                {/* Assets inside Slot */}
                <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
                  {validAssets.map((asset, aIdx) => (
                    <div
                      key={asset.id}
                      draggable
                      onDragStart={(e) => {
                        e.stopPropagation();
                        setDragPayload(e, {
                          kind: 'matrix-slot-asset',
                          fromSlotId: slot.id,
                          assetId: asset.id,
                          fromIndex: aIdx,
                        });
                      }}
                      onDragEnd={clearDragPayload}
                      onClick={() => onPreviewAsset(asset)}
                      className="group p-1.5 rounded-lg bg-[#1E222E] hover:bg-[#262B3B] border border-[#2C3144] flex items-center gap-2 cursor-grab"
                    >
                      {asset.thumbnailUrl ? (
                        <img
                          src={asset.thumbnailUrl}
                          alt=""
                          className="w-11 h-8 rounded object-cover shrink-0 bg-black"
                        />
                      ) : (
                        <div className="w-11 h-8 rounded bg-black shrink-0" />
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="text-[11px] text-white truncate">{asset.name}</div>
                        <div className="text-[10px] text-[#8A90A2] font-mono">
                          {formatShortSec(
                            (asset.defaultTrimEnd || asset.duration) -
                              (asset.defaultTrimStart || 0)
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-0.5 opacity-80 group-hover:opacity-100">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onOpenTrimAsset(asset);
                          }}
                          className="p-1 rounded hover:bg-[#FFB800] text-[#9CA3AF] hover:text-[#111318]"
                          title="裁剪该候选素材"
                        >
                          <Scissors className="w-3 h-3" />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onUpdateMatrix({
                              ...matrix,
                              slots: matrix.slots.map((s) =>
                                s.id === slot.id
                                  ? {
                                      ...s,
                                      assetIds: s.assetIds.filter((id) => id !== asset.id),
                                    }
                                  : s
                              ),
                            });
                          }}
                          className="p-1 rounded hover:bg-red-500/20 text-[#9CA3AF] hover:text-red-400"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  ))}

                  {validAssets.length === 0 && (
                    <div className="h-24 rounded-lg border border-dashed border-[#2C3142] flex items-center justify-center text-center p-3 text-[11px] text-[#6B7280]">
                      从左侧素材库拖拽或批量投递多个视频/图片到此分镜槽
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Right: Copy Pool & Combination Generator Controls */}
      <div className="w-full lg:w-[360px] shrink-0 bg-[#14161E] p-3.5 overflow-y-auto space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <label className="text-[11px] font-semibold text-[#CBD5E1]">
              顶部标题池 (每行1条轮询)
            </label>
            <textarea
              rows={3}
              value={matrix.topTitlePool.join('\n')}
              onChange={(e) =>
                onUpdateMatrix({
                  ...matrix,
                  topTitlePool: e.target.value.split('\n'),
                })
              }
              placeholder="每行输入一条吸睛标题"
              className="w-full bg-[#0F1117] border border-[#292E3E] rounded-lg p-2 text-[11px] text-white outline-none resize-none"
            />
          </div>
          <div className="space-y-1">
            <label className="text-[11px] font-semibold text-[#CBD5E1]">
              底部转化文案池 (每行1条)
            </label>
            <textarea
              rows={3}
              value={matrix.bottomTitlePool.join('\n')}
              onChange={(e) =>
                onUpdateMatrix({
                  ...matrix,
                  bottomTitlePool: e.target.value.split('\n'),
                })
              }
              placeholder="每行输入一条促销CTA"
              className="w-full bg-[#0F1117] border border-[#292E3E] rounded-lg p-2 text-[11px] text-white outline-none resize-none"
            />
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <div>
            <label className="block text-[10px] text-[#8A90A2] mb-1">默认花字风格</label>
            <CustomSelect
              size="sm"
              value={matrix.styleId}
              options={(Object.keys(TITLE_STYLES) as TitleStyleId[]).map((sid) => ({
                value: sid,
                label: TITLE_STYLES[sid].name,
              }))}
              onChange={(val) =>
                onUpdateMatrix({ ...matrix, styleId: val as TitleStyleId })
              }
              menuMinWidth={165}
              className="w-full"
            />
          </div>

          <div>
            <label className="block text-[10px] text-[#8A90A2] mb-1">默认转场</label>
            <CustomSelect
              size="sm"
              value={matrix.defaultTransition}
              options={(Object.keys(TRANSITION_LABELS) as TransitionType[]).map((tr) => ({
                value: tr,
                label: TRANSITION_LABELS[tr].split(' ')[0],
              }))}
              onChange={(val) =>
                onUpdateMatrix({
                  ...matrix,
                  defaultTransition: val as TransitionType,
                })
              }
              menuMinWidth={155}
              className="w-full"
            />
          </div>

          <div>
            <label className="block text-[10px] text-[#8A90A2] mb-1">画面适配</label>
            <CustomSelect
              size="sm"
              value={matrix.defaultFitMode}
              options={(['cover', 'blur', 'contain'] as FitMode[]).map((fm) => ({
                value: fm,
                label: FIT_MODE_LABELS[fm].split(' ')[0],
              }))}
              onChange={(val) =>
                onUpdateMatrix({ ...matrix, defaultFitMode: val as FitMode })
              }
              menuMinWidth={165}
              className="w-full"
            />
          </div>
        </div>

        {/* Voiceover Pool & BGM Pool for Matrix Auto-Distribution */}
        <div className="p-2.5 rounded-xl bg-[#191C27] border border-[#2B3042] space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-[#FFB800] flex items-center gap-1">
              <Mic className="w-3.5 h-3.5" />
              矩阵口播配音池 ({(matrix.voiceoverPoolAssetIds || []).length} 条)
            </span>
            {onOpenTtsStudio && (
              <button
                onClick={onOpenTtsStudio}
                className="px-2 py-0.5 rounded bg-[#FFB800]/20 hover:bg-[#FFB800] text-[#FFB800] hover:text-[#111318] text-[10px] font-bold transition"
              >
                + 批量文字转配音
              </button>
            )}
          </div>
          <div className="flex flex-wrap gap-1 max-h-20 overflow-y-auto">
            {assets.filter((a) => a.type === 'audio').length === 0 ? (
              <span className="text-[10px] text-[#7E8596]">
                点击右上角「+ 批量文字转配音」输入多条话术即可自动加入矩阵池
              </span>
            ) : (
              assets
                .filter((a) => a.type === 'audio')
                .map((a) => {
                  const inVo = (matrix.voiceoverPoolAssetIds || []).includes(a.id);
                  return (
                    <button
                      key={a.id}
                      onClick={() => {
                        const prev = matrix.voiceoverPoolAssetIds || [];
                        const next = inVo
                          ? prev.filter((id) => id !== a.id)
                          : [...prev, a.id];
                        onUpdateMatrix({ ...matrix, voiceoverPoolAssetIds: next });
                      }}
                      className={`px-2 py-0.5 rounded text-[10px] border truncate max-w-[160px] transition ${
                        inVo
                          ? 'bg-[#FFB800]/20 border-[#FFB800] text-[#FFB800]'
                          : 'bg-[#12141C] border-[#292E40] text-[#8A90A2] hover:text-white'
                      }`}
                    >
                      {inVo ? '✓ ' : '+ '}
                      {a.name}
                    </button>
                  );
                })
            )}
          </div>
        </div>

        {/* Strategy & Count */}
        <div className="p-2.5 rounded-xl bg-[#1A1D28] border border-[#2B3042] space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-[#9CA3AF]">可组合不重复矩阵总数：</span>
            <span className="font-mono font-bold text-[#FFB800]">{totalCombinations} 种</span>
          </div>

          <div className="flex items-center gap-2 text-[11px]">
            <CustomSelect
              size="sm"
              value={matrix.strategy}
              options={[
                { value: 'balanced_limit', label: '智能去重均衡生成指定条数' },
                { value: 'all_cartesian', label: '全量排列组合生成 (上限60条)' },
              ]}
              onChange={(val) =>
                onUpdateMatrix({
                  ...matrix,
                  strategy: val as MatrixConfig['strategy'],
                })
              }
              menuMinWidth={210}
              className="flex-1 min-w-0"
            />

            {matrix.strategy === 'balanced_limit' && (
              <div className="flex items-center gap-1 shrink-0">
                <input
                  type="number"
                  min={1}
                  max={60}
                  value={matrix.targetCount}
                  onChange={(e) =>
                    onUpdateMatrix({
                      ...matrix,
                      targetCount: Math.max(1, Math.min(60, parseInt(e.target.value || '6', 10))),
                    })
                  }
                  className="w-14 bg-[#12141C] border border-[#2C3144] rounded px-2 py-1.5 text-center font-mono text-[#00E5FF] outline-none"
                />
                <span className="text-[#9CA3AF]">条</span>
              </div>
            )}
          </div>

          <div className="flex items-center gap-4 text-[11px] text-[#B8C0D0]">
            <label className="flex items-center gap-1 cursor-pointer">
              <input
                type="radio"
                checked={matrix.appendMode === 'append'}
                onChange={() => onUpdateMatrix({ ...matrix, appendMode: 'append' })}
                className="accent-[#00E5FF]"
              />
              追加到现有视频组
            </label>
            <label className="flex items-center gap-1 cursor-pointer">
              <input
                type="radio"
                checked={matrix.appendMode === 'replace'}
                onChange={() => onUpdateMatrix({ ...matrix, appendMode: 'replace' })}
                className="accent-[#00E5FF]"
              />
              覆盖替换现有视频组
            </label>
          </div>

          <div className="pt-2 border-t border-[#262B3D] grid grid-cols-2 gap-2 text-[11px] text-[#E5E7EB]">
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={matrix.autoSyncSubtitles !== false}
                onChange={(e) =>
                  onUpdateMatrix({ ...matrix, autoSyncSubtitles: e.target.checked })
                }
                className="accent-[#FFB800]"
              />
              <span>自动挂配音动态字幕</span>
            </label>
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={!!matrix.autoDedup}
                onChange={(e) => onUpdateMatrix({ ...matrix, autoDedup: e.target.checked })}
                className="accent-[#FFB800]"
              />
              <span>裂变同步差异化防重</span>
            </label>
          </div>
        </div>

        <button
          onClick={onGenerateToGroups}
          disabled={totalCombinations === 0 || isGenerating}
          className="w-full py-2.5 rounded-xl bg-gradient-to-r from-[#FFB800] to-[#FF8A00] text-[#111318] font-bold text-xs shadow-lg hover:brightness-110 transition flex items-center justify-center gap-1.5 disabled:opacity-40"
        >
          <Sparkles className="w-4 h-4" />
          {isGenerating
            ? '正在裂变生成视频组...'
            : `一键裂变生成成片视频组 (${
                matrix.strategy === 'all_cartesian'
                  ? Math.min(60, totalCombinations)
                  : matrix.targetCount
              }条)`}
        </button>
      </div>
    </div>
  );
};
