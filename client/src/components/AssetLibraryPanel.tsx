import React, { useMemo, useRef, useState } from 'react';
import {
  CheckSquare,
  Crop,
  Film,
  FolderPlus,
  Image as ImageIcon,
  Layers,
  LayoutGrid,
  List,
  Mic,
  Music,
  Play,
  Plus,
  Scissors,
  Search,
  Send,
  Square,
  Trash2,
  Upload,
  Zap,
} from 'lucide-react';
import {
  AssetType,
  isCustomCropped,
  MatrixSlot,
  MediaAsset,
  SCENE_TAGS,
  SceneTag,
  VideoGroup,
} from '@shared/schema';
import { formatBytes, formatShortSec } from '../utils/format';
import { clearDragPayload, setDragPayload } from '../utils/dnd';
import { CustomSelect } from './CustomSelect';

interface Props {
  assets: MediaAsset[];
  videoGroups: VideoGroup[];
  activeGroupId: string | null;
  matrixSlots: MatrixSlot[];
  selectedSourceId: string | null;
  uploadingPct: number | null;
  wideMode?: boolean;
  onUploadFiles: (files: File[], tag: SceneTag) => void;
  onPreviewAsset: (asset: MediaAsset) => void;
  onTrimAsset: (asset: MediaAsset) => void;
  onSmartSplitVideo?: (asset: MediaAsset) => void;
  onEditAudio: (asset: MediaAsset) => void;
  onQuickRemoveBreath: (asset: MediaAsset) => void;
  onOpenTtsStudio: () => void;
  onDeleteAsset: (assetId: string) => void;
  onChangeAssetTag: (assetId: string, tag: SceneTag) => void;
  onAddAssetsToGroups: (
    assetIds: string[],
    targetGroupIds: string[],
    mode: 'append_all' | 'distribute_round_robin' | 'insert_head'
  ) => void;
  onCreateGroupsPerAsset: (assetIds: string[]) => void;
  onAddAssetsToMatrixSlot: (assetIds: string[], slotId: string) => void;
  onSetGroupBgm: (assetId: string, applyAll: boolean) => void;
  onSetGroupVoiceover: (assetId: string, applyAll: boolean) => void;
}

export const AssetLibraryPanel: React.FC<Props> = ({
  assets,
  videoGroups,
  activeGroupId,
  matrixSlots,
  selectedSourceId,
  uploadingPct,
  wideMode = false,
  onUploadFiles,
  onPreviewAsset,
  onTrimAsset,
  onSmartSplitVideo,
  onEditAudio,
  onQuickRemoveBreath,
  onOpenTtsStudio,
  onDeleteAsset,
  onChangeAssetTag,
  onAddAssetsToGroups,
  onCreateGroupsPerAsset,
  onAddAssetsToMatrixSlot,
  onSetGroupBgm,
  onSetGroupVoiceover,
}) => {
  const [typeFilter, setTypeFilter] = useState<'all' | AssetType>('all');
  const [tagFilter, setTagFilter] = useState<'全部' | SceneTag>('全部');
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');
  const [uploadDefaultTag, setUploadDefaultTag] = useState<SceneTag>('未分类');
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());
  const [isFileHover, setIsFileHover] = useState(false);

  const [showGroupPicker, setShowGroupPicker] = useState(false);
  const [targetGroupSet, setTargetGroupSet] = useState<Set<string>>(new Set());
  const [dispatchMode, setDispatchMode] = useState<
    'append_all' | 'insert_head' | 'distribute_round_robin'
  >('append_all');

  const [showSlotPicker, setShowSlotPicker] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const filteredAssets = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return assets.filter((a) => {
      if (typeFilter !== 'all' && a.type !== typeFilter) return false;
      if (tagFilter !== '全部' && a.type !== 'audio' && a.sceneTag !== tagFilter) return false;
      if (q && !a.name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [assets, typeFilter, tagFilter, searchQuery]);

  const visualCheckedIds = useMemo(() => {
    const valid = new Set(assets.filter((a) => a.type !== 'audio').map((a) => a.id));
    return Array.from(checkedIds).filter((id) => valid.has(id));
  }, [checkedIds, assets]);

  const toggleCheck = (id: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setCheckedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAllVisible = () => {
    const visIds = filteredAssets.filter((a) => a.type !== 'audio').map((a) => a.id);
    if (visIds.every((id) => checkedIds.has(id)) && visIds.length > 0) {
      setCheckedIds(new Set());
    } else {
      setCheckedIds(new Set(visIds));
    }
  };

  const openGroupDispatcher = () => {
    const initial = new Set<string>();
    if (activeGroupId) initial.add(activeGroupId);
    else if (videoGroups[0]) initial.add(videoGroups[0].id);
    setTargetGroupSet(initial);
    setShowSlotPicker(false);
    setShowGroupPicker((v) => !v);
  };

  const handleExternalDrop = (e: React.DragEvent) => {
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      e.preventDefault();
      setIsFileHover(false);
      onUploadFiles(Array.from(e.dataTransfer.files), uploadDefaultTag);
    }
  };

  return (
    <div
      className="h-full w-full bg-[#15171E] flex flex-col relative select-none min-w-0 min-h-0 overflow-hidden"
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes('Files')) {
          e.preventDefault();
          setIsFileHover(true);
        }
      }}
      onDragLeave={(e) => {
        if (e.currentTarget === e.target) setIsFileHover(false);
      }}
      onDrop={handleExternalDrop}
    >
      {isFileHover && (
        <div className="absolute inset-2 z-40 rounded-xl bg-[#00E5FF]/15 border-2 border-dashed border-[#00E5FF] backdrop-blur-sm flex flex-col items-center justify-center text-center p-4 pointer-events-none">
          <Upload className="w-8 h-8 text-[#00E5FF] mb-2 animate-bounce" />
          <p className="text-sm font-bold text-white">松开鼠标批量导入本地素材</p>
          <p className="text-xs text-[#A6ADBB] mt-1">支持 MP4 / MOV / JPG / PNG / MP3 / WAV</p>
        </div>
      )}

      {/* Header: Compact 2-Row Layout — Zero Overflow in Both 365px Horizontal & Wide Vertical Modes! */}
      <div className="px-2.5 pt-2 pb-2 border-b border-[#232632] space-y-1.5 shrink-0 min-w-0 overflow-hidden">
        {/* Row 1: Title + View Switcher on Left | TTS + Import on Right */}
        <div className="flex items-center justify-between gap-1.5 min-w-0">
          <div className="flex items-center gap-1.5 whitespace-nowrap shrink-0">
            <Layers className="w-3.5 h-3.5 text-[#00E5FF] shrink-0" />
            <span className="text-xs font-bold text-white">素材库</span>
            <span className="px-1.5 py-0.5 rounded-full bg-[#222634] text-[10px] font-mono text-[#00E5FF]">
              {assets.length}
            </span>

            {/* List vs Grid View Switcher */}
            <div className="flex items-center bg-[#0F1014] p-0.5 rounded-md border border-[#252936] ml-0.5">
              <button
                onClick={() => setViewMode('list')}
                className={`p-1 rounded transition ${
                  viewMode === 'list'
                    ? 'bg-[#262B3B] text-[#00E5FF]'
                    : 'text-[#7E8596] hover:text-white'
                }`}
                title="详细列表视图（完整显示文件名与分辨率，适合笔记本屏幕）"
              >
                <List className="w-3 h-3" />
              </button>
              <button
                onClick={() => setViewMode('grid')}
                className={`p-1 rounded transition ${
                  viewMode === 'grid'
                    ? 'bg-[#262B3B] text-[#00E5FF]'
                    : 'text-[#7E8596] hover:text-white'
                }`}
                title="缩略图网格视图"
              >
                <LayoutGrid className="w-3 h-3" />
              </button>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              onClick={onOpenTtsStudio}
              className="px-2 py-1 rounded-md bg-[#241E38] hover:bg-[#31284D] border border-purple-400/40 text-purple-200 font-bold text-[11px] whitespace-nowrap shrink-0 flex items-center gap-1 transition"
              title="文字生成口播音频 & 自动去气口"
            >
              <Mic className="w-3 h-3 text-[#00E5FF] shrink-0" />
              文字配音
            </button>

            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploadingPct !== null}
              className="px-2 py-1 rounded-md bg-[#00E5FF] text-[#081016] font-bold text-[11px] whitespace-nowrap shrink-0 flex items-center gap-1 hover:brightness-110 transition disabled:opacity-50"
            >
              <Upload className="w-3 h-3 shrink-0" />
              导入素材
            </button>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="video/*,image/*,audio/*"
              className="hidden"
              onChange={(e) => {
                const files = e.target.files ? Array.from(e.target.files) : [];
                if (files.length > 0) onUploadFiles(files, uploadDefaultTag);
                e.currentTarget.value = '';
              }}
            />
          </div>
        </div>

        {/* Upload Progress */}
        {uploadingPct !== null && (
          <div className="p-2 rounded-lg bg-[#1E222E] border border-[#00E5FF]/40 space-y-1">
            <div className="flex justify-between text-[11px] text-[#00E5FF]">
              <span className="truncate">正在解析帧信息并生成缩略图...</span>
              <span className="font-mono shrink-0">{uploadingPct}%</span>
            </div>
            <div className="h-1.5 rounded-full bg-[#11131A] overflow-hidden">
              <div
                className="h-full bg-[#00E5FF] transition-all duration-200"
                style={{ width: `${uploadingPct}%` }}
              />
            </div>
          </div>
        )}

        {/* Row 2: Search Box (fluid flex-1) + Default Upload Category Dropdown */}
        <div className="flex items-center gap-1.5 min-w-0">
          <div className="relative flex-1 min-w-0">
            <Search className="w-3 h-3 text-[#6B7280] absolute left-2 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="搜索素材名称..."
              className="w-full bg-[#0F1014] border border-[#232632] focus:border-[#00E5FF]/60 rounded-md pl-6 pr-2 py-1 text-[11px] text-white outline-none"
            />
          </div>

          <CustomSelect
            size="sm"
            value={uploadDefaultTag}
            prefixLabel="归类:"
            options={SCENE_TAGS.map((t) => ({ value: t, label: t }))}
            onChange={(val) => setUploadDefaultTag(val as SceneTag)}
            title="导入新素材时自动归类的标签"
            menuMinWidth={140}
            className="whitespace-nowrap shrink-0 max-w-[122px]"
          />
        </div>

        {/* Row 3: Media Type Tabs */}
        <div className="grid grid-cols-4 gap-0.5 bg-[#0F1014] p-0.5 rounded-md border border-[#232632]">
          {(
            [
              { id: 'all', label: '全部' },
              { id: 'video', label: '视频' },
              { id: 'image', label: '图片' },
              { id: 'audio', label: '音频' },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              onClick={() => setTypeFilter(tab.id)}
              className={`py-0.5 rounded text-[11px] font-medium whitespace-nowrap text-center transition ${
                typeFilter === tab.id
                  ? 'bg-[#252936] text-white shadow-sm'
                  : 'text-[#8A90A2] hover:text-white'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Scene Tag Filter Pills */}
        {typeFilter !== 'audio' && (
          <div className="flex items-center gap-1 overflow-x-auto pb-0.5">
            {(['全部', ...SCENE_TAGS] as const).map((tag) => (
              <button
                key={tag}
                onClick={() => setTagFilter(tag)}
                className={`px-2 py-0.5 rounded-full text-[10px] whitespace-nowrap shrink-0 border transition ${
                  tagFilter === tag
                    ? 'bg-[#00E5FF]/15 border-[#00E5FF]/60 text-[#00E5FF]'
                    : 'bg-[#1B1E28] border-[#282C3A] text-[#8E95A8] hover:text-white'
                }`}
              >
                {tag}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Multi-Select Batch Action Toolbar */}
      <div className="px-3 py-1.5 bg-[#12141B] border-b border-[#232632] flex items-center justify-between gap-1.5 shrink-0 relative">
        <button
          onClick={selectAllVisible}
          className="text-[11px] text-[#A6ADBB] hover:text-white flex items-center gap-1 whitespace-nowrap shrink-0"
        >
          {visualCheckedIds.length > 0 ? (
            <CheckSquare className="w-3.5 h-3.5 text-[#00E5FF] shrink-0" />
          ) : (
            <Square className="w-3.5 h-3.5 shrink-0" />
          )}
          {visualCheckedIds.length > 0 ? `已选 ${visualCheckedIds.length} 项` : '多选素材'}
        </button>

        {visualCheckedIds.length > 0 ? (
          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={() => {
                if (activeGroupId) {
                  onAddAssetsToGroups(visualCheckedIds, [activeGroupId], 'append_all');
                  setCheckedIds(new Set());
                } else {
                  openGroupDispatcher();
                }
              }}
              className="px-2 py-0.5 rounded bg-[#232838] hover:bg-[#2E354A] text-[11px] text-white border border-[#343B52] whitespace-nowrap transition"
            >
              +当前组
            </button>
            <button
              onClick={openGroupDispatcher}
              className="px-2 py-0.5 rounded bg-[#00E5FF] text-[#081016] font-semibold text-[11px] flex items-center gap-1 whitespace-nowrap hover:brightness-110 transition"
            >
              <Send className="w-3 h-3 shrink-0" />
              分发到各组
            </button>
            <button
              onClick={() => {
                setShowGroupPicker(false);
                setShowSlotPicker((v) => !v);
              }}
              className="px-2 py-0.5 rounded bg-[#FFB800]/20 border border-[#FFB800]/50 text-[#FFB800] text-[11px] whitespace-nowrap hover:bg-[#FFB800]/30 transition"
            >
              入矩阵
            </button>
          </div>
        ) : (
          <span className="text-[10px] text-[#6B7280] truncate">
            点击预览 · 拖拽或勾选投递到各视频组
          </span>
        )}

        {/* Popover: Multi-Group Dispatcher */}
        {showGroupPicker && visualCheckedIds.length > 0 && (
          <div className="absolute left-2 right-2 top-full mt-1 z-30 p-3 rounded-xl bg-[#1C1F2B] border border-[#363C52] shadow-2xl space-y-2.5 max-w-sm">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-bold text-white whitespace-nowrap">
                投递 {visualCheckedIds.length} 个素材到视频组
              </span>
              <button
                onClick={() => {
                  if (targetGroupSet.size === videoGroups.length) {
                    setTargetGroupSet(new Set());
                  } else {
                    setTargetGroupSet(new Set(videoGroups.map((g) => g.id)));
                  }
                }}
                className="text-[11px] text-[#00E5FF] hover:underline whitespace-nowrap"
              >
                {targetGroupSet.size === videoGroups.length ? '取消全选' : '全选所有组'}
              </button>
            </div>

            <div className="max-h-32 overflow-y-auto space-y-1 pr-1">
              {videoGroups.map((g, i) => (
                <label
                  key={g.id}
                  className="flex items-center justify-between px-2 py-1.5 rounded bg-[#14161F] hover:bg-[#232736] cursor-pointer text-xs"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <input
                      type="checkbox"
                      checked={targetGroupSet.has(g.id)}
                      onChange={() => {
                        setTargetGroupSet((prev) => {
                          const next = new Set(prev);
                          if (next.has(g.id)) next.delete(g.id);
                          else next.add(g.id);
                          return next;
                        });
                      }}
                      className="accent-[#00E5FF] shrink-0"
                    />
                    <span className="truncate text-[#E5E7EB]">
                      #{String(i + 1).padStart(2, '0')} {g.name}
                    </span>
                  </div>
                  <span className="text-[10px] text-[#8A90A2] shrink-0 ml-2">
                    {g.clips.length}段
                  </span>
                </label>
              ))}
            </div>

            <div className="space-y-1 text-[11px]">
              <label className="flex items-center gap-1.5 text-[#CBD5E1] cursor-pointer">
                <input
                  type="radio"
                  name="dmode"
                  checked={dispatchMode === 'append_all'}
                  onChange={() => setDispatchMode('append_all')}
                  className="accent-[#00E5FF]"
                />
                全部追加到所选各组末尾 (如统一加片尾CTA)
              </label>
              <label className="flex items-center gap-1.5 text-[#CBD5E1] cursor-pointer">
                <input
                  type="radio"
                  name="dmode"
                  checked={dispatchMode === 'insert_head'}
                  onChange={() => setDispatchMode('insert_head')}
                  className="accent-[#00E5FF]"
                />
                插入到所选各组最开头 (如统一加前3秒引子)
              </label>
              <label className="flex items-center gap-1.5 text-[#CBD5E1] cursor-pointer">
                <input
                  type="radio"
                  name="dmode"
                  checked={dispatchMode === 'distribute_round_robin'}
                  onChange={() => setDispatchMode('distribute_round_robin')}
                  className="accent-[#00E5FF]"
                />
                轮询均匀分配到所选各组
              </label>
            </div>

            <div className="pt-1 flex items-center justify-between gap-2 border-t border-[#2B3042]">
              <button
                onClick={() => {
                  onCreateGroupsPerAsset(visualCheckedIds);
                  setShowGroupPicker(false);
                  setCheckedIds(new Set());
                }}
                className="px-2 py-1.5 rounded bg-[#262B3C] hover:bg-[#32384E] text-[11px] text-[#00E5FF] flex items-center gap-1 whitespace-nowrap"
              >
                <FolderPlus className="w-3.5 h-3.5 shrink-0" />
                每素材各建新组
              </button>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setShowGroupPicker(false)}
                  className="px-2.5 py-1.5 rounded bg-[#252834] text-[11px] text-[#9CA3AF] whitespace-nowrap"
                >
                  关闭
                </button>
                <button
                  disabled={targetGroupSet.size === 0}
                  onClick={() => {
                    onAddAssetsToGroups(
                      visualCheckedIds,
                      Array.from(targetGroupSet),
                      dispatchMode
                    );
                    setShowGroupPicker(false);
                    setCheckedIds(new Set());
                  }}
                  className="px-3 py-1.5 rounded bg-[#00E5FF] text-[#081016] font-semibold text-[11px] whitespace-nowrap disabled:opacity-40"
                >
                  确认投递 ({targetGroupSet.size}组)
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Popover: Matrix Slot Picker */}
        {showSlotPicker && visualCheckedIds.length > 0 && (
          <div className="absolute left-2 right-2 top-full mt-1 z-30 p-3 rounded-xl bg-[#1C1F2B] border border-[#FFB800]/50 shadow-2xl space-y-2 max-w-sm">
            <div className="text-xs font-bold text-white">
              将 {visualCheckedIds.length} 个素材放入分镜矩阵段落：
            </div>
            <div className="space-y-1 max-h-40 overflow-y-auto">
              {matrixSlots.map((slot) => (
                <button
                  key={slot.id}
                  onClick={() => {
                    onAddAssetsToMatrixSlot(visualCheckedIds, slot.id);
                    setShowSlotPicker(false);
                    setCheckedIds(new Set());
                  }}
                  className="w-full px-2.5 py-1.5 rounded bg-[#14161F] hover:bg-[#262B3C] flex items-center justify-between text-xs text-white transition"
                >
                  <span className="truncate">{slot.name}</span>
                  <span className="text-[10px] text-[#9CA3AF] shrink-0 ml-2">
                    已有 {slot.assetIds.length} 项
                  </span>
                </button>
              ))}
            </div>
            <button
              onClick={() => setShowSlotPicker(false)}
              className="w-full py-1 rounded bg-[#252834] text-[11px] text-[#9CA3AF]"
            >
              取消
            </button>
          </div>
        )}
      </div>

      {/* Scrollable Asset Container — @container + auto-rows-max prevents squish at any width! */}
      <div
        className={
          viewMode === 'list'
            ? '@container flex-1 min-h-0 overflow-y-auto p-2 flex flex-col gap-1.5'
            : `@container flex-1 min-h-0 overflow-y-auto p-2.5 grid ${
                wideMode ? 'grid-cols-2 lg:grid-cols-3' : 'grid-cols-2'
              } gap-2 auto-rows-max items-start`
        }
      >
        {filteredAssets.map((asset) => {
          const isSelected = selectedSourceId === asset.id;
          const isChecked = checkedIds.has(asset.id);
          const trimmedCustom =
            asset.type === 'video' &&
            (asset.defaultTrimStart > 0.05 ||
              Math.abs(asset.defaultTrimEnd - asset.duration) > 0.08);
          const croppedCustom = isCustomCropped(asset.defaultCrop);
          const netDur = (asset.defaultTrimEnd || asset.duration) - (asset.defaultTrimStart || 0);

          if (asset.type === 'audio') {
            const isVoice =
              asset.audioRole === 'voiceover' || asset.name.includes('配音');
            const audioTrimmed =
              asset.defaultTrimStart > 0.05 ||
              Math.abs((asset.defaultTrimEnd || asset.duration) - asset.duration) > 0.08;
            const audioNetDur =
              Math.max(0.1, (asset.defaultTrimEnd || asset.duration) - (asset.defaultTrimStart || 0)) /
              (asset.defaultSpeed || 1);

            return (
              <div
                key={asset.id}
                onClick={() => onPreviewAsset(asset)}
                className={`${
                  viewMode === 'grid' ? (wideMode ? 'col-span-2 lg:col-span-3' : 'col-span-2') : ''
                } shrink-0 p-2 rounded-lg border transition cursor-pointer flex flex-col @[460px]:flex-row @[460px]:items-center justify-between gap-2 ${
                  isSelected
                    ? 'bg-[#1F2536] border-[#00E5FF]'
                    : 'bg-[#1B1E27] border-[#262A38] hover:border-[#3A4054]'
                }`}
              >
                <div className="flex items-center gap-2.5 min-w-0 flex-1">
                  <div
                    className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                      isVoice
                        ? 'bg-[#FFB800]/15 text-[#FFB800]'
                        : 'bg-[#00E5FF]/15 text-[#00E5FF]'
                    }`}
                  >
                    {isVoice ? <Mic className="w-4 h-4" /> : <Music className="w-4 h-4" />}
                  </div>
                  <div className="min-w-0 flex-1 space-y-0.5">
                    <div className="text-xs font-medium text-white truncate" title={asset.name}>
                      {asset.name}
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5 text-[10px] text-[#8A90A2]">
                      <span
                        className={`px-1 rounded whitespace-nowrap ${
                          isVoice
                            ? 'bg-[#FFB800]/15 text-[#FFB800]'
                            : 'bg-[#00E5FF]/15 text-[#00E5FF]'
                        }`}
                      >
                        {isVoice ? '口播配音' : '背景BGM'}
                      </span>
                      <span className="font-mono whitespace-nowrap">
                        {formatShortSec(audioNetDur)}
                      </span>
                      {asset.breathRemoved && (
                        <span className="px-1 rounded bg-emerald-500/20 text-emerald-300 whitespace-nowrap font-medium">
                          ⚡已去气口
                          {asset.breathSavedSec ? ` -${asset.breathSavedSec.toFixed(1)}s` : ''}
                        </span>
                      )}
                      {audioTrimmed && (
                        <span className="px-1 rounded bg-purple-500/20 text-purple-300 whitespace-nowrap">
                          已截取
                        </span>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeleteAsset(asset.id);
                    }}
                    className="p-1 text-[#6B7280] hover:text-red-400 shrink-0 @[460px]:hidden"
                    title="移除该音频"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="flex items-center justify-between @[460px]:justify-end gap-1.5 pt-1.5 @[460px]:pt-0 border-t border-white/[0.06] @[460px]:border-t-0 shrink-0">
                  <span className="text-[10px] font-mono text-[#7E8596] whitespace-nowrap @[460px]:mr-1">
                    {formatBytes(asset.sizeBytes)}
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onEditAudio(asset);
                      }}
                      className="px-2 py-1 rounded bg-[#252A3A] hover:bg-[#FFB800] text-[#E5E7EB] hover:text-[#111318] text-[10px] font-semibold whitespace-nowrap flex items-center gap-0.5 transition"
                      title="打开音频可视波形剪辑、截取副歌、淡入淡出与去气口"
                    >
                      <Scissors className="w-3 h-3 shrink-0" />
                      剪辑
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onQuickRemoveBreath(asset);
                      }}
                      className="px-1.5 py-1 rounded bg-[#252A3A] hover:bg-emerald-400 text-[#FFB800] hover:text-[#081016] text-[10px] font-semibold whitespace-nowrap flex items-center gap-0.5 transition"
                      title="一键切除音频中的呼吸换气与长停顿空白"
                    >
                      <Zap className="w-3 h-3 shrink-0" />
                      去气口
                    </button>
                    {isVoice ? (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onSetGroupVoiceover(asset.id, false);
                        }}
                        className="px-2 py-1 rounded bg-[#FFB800]/20 hover:bg-[#FFB800] text-[#FFB800] hover:text-[#111318] text-[10px] font-bold whitespace-nowrap transition"
                        title="设为当前选中视频组的口播配音"
                      >
                        +设口播
                      </button>
                    ) : (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onSetGroupBgm(asset.id, false);
                        }}
                        className="px-2 py-1 rounded bg-[#00E5FF]/15 hover:bg-[#00E5FF] text-[#00E5FF] hover:text-[#081016] text-[10px] font-bold whitespace-nowrap transition"
                        title="设为当前选中视频组的背景音乐 BGM"
                      >
                        +设BGM
                      </button>
                    )}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteAsset(asset.id);
                      }}
                      className="hidden @[460px]:inline-flex p-1 text-[#6B7280] hover:text-red-400"
                      title="移除该音频"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            );
          }

          /* LIST DETAIL MODE — Responsive Container-Query Layout!
             - Narrow sidebar (< 460px, e.g. 横屏布局): Clean 2-tier layout so title + specs NEVER get squeezed!
             - Wide sidebar (>= 460px, e.g. 竖屏布局): Smooth single-row layout! */
          if (viewMode === 'list') {
            return (
              <div
                key={asset.id}
                draggable
                onDragStart={(e) => {
                  const dragIds =
                    isChecked && visualCheckedIds.length > 0 ? visualCheckedIds : [asset.id];
                  setDragPayload(e, { kind: 'library-assets', assetIds: dragIds });
                }}
                onDragEnd={clearDragPayload}
                onClick={() => onPreviewAsset(asset)}
                className={`group shrink-0 p-2 rounded-lg border transition cursor-grab active:cursor-grabbing flex flex-col @[460px]:flex-row @[460px]:items-center gap-2 bg-[#1B1E27] ${
                  isSelected
                    ? 'border-[#FFB800] bg-[#212432]'
                    : isChecked
                    ? 'border-[#00E5FF] bg-[#192231]'
                    : 'border-[#262A38] hover:border-[#3D4358]'
                }`}
              >
                {/* Top / Left Main Info Section (Always has full breathing room!) */}
                <div className="flex items-center gap-2.5 min-w-0 flex-1">
                  {/* Checkbox */}
                  <button
                    onClick={(e) => toggleCheck(asset.id, e)}
                    className={`w-4 h-4 rounded flex items-center justify-center shrink-0 transition ${
                      isChecked ? 'text-[#00E5FF]' : 'text-[#6B7280] hover:text-white'
                    }`}
                  >
                    {isChecked ? (
                      <CheckSquare className="w-4 h-4" />
                    ) : (
                      <Square className="w-4 h-4" />
                    )}
                  </button>

                  {/* Crisp Fixed-Size Thumbnail */}
                  <div className="relative w-[72px] h-[48px] rounded-md bg-[#0E1016] overflow-hidden shrink-0 border border-white/10">
                    {asset.thumbnailUrl ? (
                      <img
                        src={asset.thumbnailUrl}
                        alt=""
                        className="w-full h-full object-cover pointer-events-none"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-[#52586A]">
                        {asset.type === 'image' ? (
                          <ImageIcon className="w-4 h-4" />
                        ) : (
                          <Film className="w-4 h-4" />
                        )}
                      </div>
                    )}
                    <span className="absolute bottom-0.5 right-0.5 px-1 rounded bg-black/80 text-[9px] font-mono text-white">
                      {formatShortSec(netDur)}
                    </span>
                  </div>

                  {/* Full Un-Squeezed Title + Resolution */}
                  <div className="min-w-0 flex-1 space-y-1">
                    <div
                      className="text-xs font-medium text-[#EEF2F6] leading-snug truncate"
                      title={asset.name}
                    >
                      {asset.name}
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5 text-[10px]">
                      <span className="font-mono text-[#8A90A2] whitespace-nowrap">
                        {asset.width}×{asset.height}
                      </span>
                      <span className="px-1 rounded bg-[#252938] text-[#9CA3AF] whitespace-nowrap">
                        {asset.height >= asset.width ? '竖屏' : '横屏'}
                      </span>
                      {trimmedCustom && (
                        <span className="px-1 rounded bg-[#FFB800]/20 text-[#FFB800] font-medium whitespace-nowrap">
                          已截取
                        </span>
                      )}
                      {croppedCustom && (
                        <span className="px-1 rounded bg-[#00E5FF]/20 text-[#00E5FF] font-medium whitespace-nowrap">
                          已裁切
                        </span>
                      )}
                      <div className="hidden @[460px]:block">
                        <CustomSelect
                          size="xs"
                          stopPropagation
                          value={(asset.sceneTag || '未分类') as SceneTag}
                          options={SCENE_TAGS.map((t) => ({ value: t, label: t }))}
                          onChange={(val) => onChangeAssetTag(asset.id, val as SceneTag)}
                          menuMinWidth={132}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Top-Right Delete on Narrow Sidebar */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeleteAsset(asset.id);
                    }}
                    className="p-1 text-[#6B7280] hover:text-red-400 shrink-0 @[460px]:hidden"
                    title="移除该素材"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Bottom / Right Action Bar */}
                <div className="flex items-center justify-between @[460px]:justify-end gap-1.5 pt-1.5 @[460px]:pt-0 border-t border-white/[0.06] @[460px]:border-t-0 shrink-0">
                  <div className="@[460px]:hidden">
                    <CustomSelect
                      size="xs"
                      stopPropagation
                      value={(asset.sceneTag || '未分类') as SceneTag}
                      options={SCENE_TAGS.map((t) => ({ value: t, label: t }))}
                      onChange={(val) => onChangeAssetTag(asset.id, val as SceneTag)}
                      menuMinWidth={132}
                    />
                  </div>

                  <div className="flex items-center gap-1 shrink-0 ml-auto @[460px]:ml-0">
                    {asset.type === 'video' && onSmartSplitVideo && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onSmartSplitVideo(asset);
                        }}
                        className="px-2 py-1 rounded bg-[#27221B] hover:bg-[#FFB800] border border-[#FFB800]/35 text-[#FFB800] hover:text-[#111318] text-[10px] font-semibold whitespace-nowrap flex items-center gap-0.5 transition"
                        title="智能识别镜头切点并拆分为独立分镜"
                      >
                        <Zap className="w-3 h-3 shrink-0" />
                        拆条
                      </button>
                    )}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onTrimAsset(asset);
                      }}
                      className="px-2 py-1 rounded bg-[#252938] hover:bg-[#FFB800] text-[#E5E7EB] hover:text-[#111318] text-[10px] font-medium whitespace-nowrap flex items-center gap-0.5 transition"
                      title="裁剪素材时长与构图"
                    >
                      <Scissors className="w-3 h-3 shrink-0" />
                      裁剪
                    </button>
                    {activeGroupId && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onAddAssetsToGroups([asset.id], [activeGroupId], 'append_all');
                        }}
                        className="px-2 py-1 rounded bg-[#00E5FF] text-[#081016] font-bold text-[10px] whitespace-nowrap flex items-center gap-0.5 hover:brightness-110 transition"
                        title="添加到当前选中的视频组"
                      >
                        <Plus className="w-3 h-3 stroke-[2.5] shrink-0" />
                        入组
                      </button>
                    )}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteAsset(asset.id);
                      }}
                      className="hidden @[460px]:inline-flex p-1 text-[#6B7280] hover:text-red-400"
                      title="移除该素材"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            );
          }

          /* GRID MODE — With auto-rows-max & fixed thumbnail height so it NEVER collapses! */
          return (
            <div
              key={asset.id}
              draggable
              onDragStart={(e) => {
                const dragIds =
                  isChecked && visualCheckedIds.length > 0 ? visualCheckedIds : [asset.id];
                setDragPayload(e, { kind: 'library-assets', assetIds: dragIds });
              }}
              onDragEnd={clearDragPayload}
              onClick={() => onPreviewAsset(asset)}
              className={`group rounded-lg border transition cursor-grab active:cursor-grabbing flex flex-col bg-[#1B1E27] ${
                isSelected
                  ? 'border-[#FFB800] ring-1 ring-[#FFB800]/40'
                  : isChecked
                  ? 'border-[#00E5FF] ring-1 ring-[#00E5FF]/35'
                  : 'border-[#262A38] hover:border-[#3D4358]'
              }`}
            >
              {/* Explicit h-[92px] thumbnail prevents CSS Grid min-height:0 collapse! */}
              <div className="relative h-[92px] w-full rounded-t-lg bg-[#0F1117] overflow-hidden shrink-0">
                {asset.thumbnailUrl ? (
                  <img
                    src={asset.thumbnailUrl}
                    alt=""
                    className="w-full h-full object-cover group-hover:scale-105 transition duration-300 pointer-events-none"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-[#52586A]">
                    {asset.type === 'image' ? (
                      <ImageIcon className="w-6 h-6" />
                    ) : (
                      <Film className="w-6 h-6" />
                    )}
                  </div>
                )}

                <button
                  onClick={(e) => toggleCheck(asset.id, e)}
                  className={`absolute top-1.5 left-1.5 w-5 h-5 rounded flex items-center justify-center transition ${
                    isChecked
                      ? 'bg-[#00E5FF] text-[#081016]'
                      : 'bg-black/60 text-white/80 hover:bg-black/85'
                  }`}
                >
                  {isChecked ? (
                    <CheckSquare className="w-3.5 h-3.5" />
                  ) : (
                    <Square className="w-3.5 h-3.5" />
                  )}
                </button>

                <div className="absolute top-1.5 right-1.5 flex items-center gap-1">
                  {asset.type === 'video' && onSmartSplitVideo && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onSmartSplitVideo(asset);
                      }}
                      className="px-1.5 py-0.5 rounded bg-black/75 hover:bg-[#FFB800] text-[#FFB800] hover:text-[#111318] border border-[#FFB800]/45 text-[9px] font-bold whitespace-nowrap flex items-center gap-0.5 transition"
                      title="智能识别转场拆条"
                    >
                      <Zap className="w-2.5 h-2.5" />
                      拆条
                    </button>
                  )}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onTrimAsset(asset);
                    }}
                    className="p-1 rounded bg-black/70 hover:bg-[#FFB800] text-white hover:text-[#111318] transition"
                    title="裁剪素材时长与画面构图"
                  >
                    <Scissors className="w-3 h-3" />
                  </button>
                  {activeGroupId && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onAddAssetsToGroups([asset.id], [activeGroupId], 'append_all');
                      }}
                      className="p-1 rounded bg-[#00E5FF] text-[#081016] hover:brightness-110 transition shadow"
                      title="添加到当前选中的视频组"
                    >
                      <Plus className="w-3 h-3 stroke-[2.5]" />
                    </button>
                  )}
                </div>

                <div className="absolute bottom-1 inset-x-1.5 flex items-center justify-between pointer-events-none">
                  <div className="flex items-center gap-1">
                    {trimmedCustom && (
                      <span className="px-1 rounded bg-[#FFB800] text-[#111318] text-[9px] font-bold">
                        已截取
                      </span>
                    )}
                    {croppedCustom && (
                      <span className="p-0.5 rounded bg-[#00E5FF] text-[#081016]">
                        <Crop className="w-2.5 h-2.5" />
                      </span>
                    )}
                  </div>
                  <span className="px-1.5 py-0.5 rounded bg-black/75 text-[10px] font-mono text-white flex items-center gap-0.5">
                    <Play className="w-2.5 h-2.5 fill-current" />
                    {formatShortSec(netDur)}
                  </span>
                </div>
              </div>

              <div className="p-2 space-y-1.5">
                <div
                  className="text-[11px] font-medium text-[#E5E7EB] leading-tight line-clamp-2 min-h-[28px] break-all"
                  title={asset.name}
                >
                  {asset.name}
                </div>
                <div className="flex items-center justify-between gap-1">
                  <CustomSelect
                    size="xs"
                    stopPropagation
                    value={(asset.sceneTag || '未分类') as SceneTag}
                    options={SCENE_TAGS.map((t) => ({ value: t, label: t }))}
                    onChange={(val) => onChangeAssetTag(asset.id, val as SceneTag)}
                    menuMinWidth={132}
                    className="max-w-[92px]"
                  />
                  <div className="flex items-center gap-1 text-[10px] text-[#6B7280] whitespace-nowrap">
                    <span>
                      {asset.width}×{asset.height}
                    </span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteAsset(asset.id);
                      }}
                      className="text-[#6B7280] hover:text-red-400 p-0.5"
                      title="移除素材"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          );
        })}

        {filteredAssets.length === 0 && (
          <div className="col-span-full py-10 text-center space-y-1.5 text-[#6B7280]">
            <Upload className="w-7 h-7 mx-auto opacity-40" />
            <p className="text-xs">暂无符合条件的素材</p>
            <p className="text-[11px]">支持将电脑文件夹中的多个视频/图片/音频直接拖入此处</p>
          </div>
        )}
      </div>
    </div>
  );
};
