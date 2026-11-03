import React, { useRef, useState } from 'react';
import {
  CopyCheck,
  Download,
  FlipHorizontal2,
  Image as ImageIcon,
  MessageSquareText,
  Mic,
  Music,
  Plus,
  Scissors,
  ShieldCheck,
  Sliders,
  Sparkles,
  Stamp,
  Trash2,
  Type,
  Upload,
  Volume2,
  VolumeX,
  Wand2,
  Zap,
} from 'lucide-react';
import {
  buildSyncedSubtitlesFromScript,
  createDefaultDedupConfig,
  createDefaultSubtitleConfig,
  createDefaultWatermarkConfig,
  DedupConfig,
  exportCuesToSrt,
  FIT_MODE_LABELS,
  FitMode,
  getGroupTotalDuration,
  GroupOverlayConfig,
  MediaAsset,
  SUBTITLE_STYLES,
  SubtitleConfig,
  SubtitleStyleId,
  TimelineClip,
  TITLE_STYLES,
  TitleStyleId,
  TRANSITION_LABELS,
  TransitionType,
  VideoGroup,
  WatermarkConfig,
  WatermarkCorner,
} from '@shared/schema';
import { formatShortSec, uid } from '../utils/format';
import { CustomSelect } from './CustomSelect';

interface Props {
  activeGroup: VideoGroup | null;
  selectedClip: TimelineClip | null;
  selectedClipAsset: MediaAsset | null;
  audioAssets: MediaAsset[];
  imageAssets: MediaAsset[];
  onUpdateClip: (groupId: string, clipId: string, patch: Partial<TimelineClip>) => void;
  onApplyTransitionToGroup: (groupId: string, transition: TransitionType) => void;
  onOpenTrimClip: (group: VideoGroup, clip: TimelineClip) => void;
  onUpdateOverlay: (groupId: string, patch: Partial<GroupOverlayConfig>) => void;
  onSyncOverlayStyleAllGroups: (overlay: GroupOverlayConfig, includeText: boolean) => void;
  onUpdateSubtitles: (groupId: string, next: SubtitleConfig) => void;
  onSyncSubtitleStyleAllGroups: (sub: SubtitleConfig) => void;
  onUpdateWatermark: (groupId: string, next: WatermarkConfig) => void;
  onSyncWatermarkAllGroups: (wm: WatermarkConfig) => void;
  onUploadWatermarkLogo: (file: File) => void;
  onUpdateDedup: (groupId: string, next: DedupConfig) => void;
  onBatchRandomizeDedupAllGroups: (allowMirror: boolean) => void;
  onUpdateGroupAudio: (
    groupId: string,
    patch: Partial<VideoGroup>
  ) => void;
  onSyncAudioAllGroups: (source: VideoGroup) => void;
  onOpenAudioEditor: (asset: MediaAsset) => void;
  onOpenTtsStudio: () => void;
}

export const InspectorPanel: React.FC<Props> = ({
  activeGroup,
  selectedClip,
  selectedClipAsset,
  audioAssets,
  imageAssets,
  onUpdateClip,
  onApplyTransitionToGroup,
  onOpenTrimClip,
  onUpdateOverlay,
  onSyncOverlayStyleAllGroups,
  onUpdateSubtitles,
  onSyncSubtitleStyleAllGroups,
  onUpdateWatermark,
  onSyncWatermarkAllGroups,
  onUploadWatermarkLogo,
  onUpdateDedup,
  onBatchRandomizeDedupAllGroups,
  onUpdateGroupAudio,
  onSyncAudioAllGroups,
  onOpenAudioEditor,
  onOpenTtsStudio,
}) => {
  const [tab, setTab] = useState<'clip' | 'overlay' | 'audio' | 'brand_dedup'>('overlay');
  const [textSubTab, setTextSubTab] = useState<'subtitles' | 'stickers'>('subtitles');
  const [customSubScript, setCustomSubScript] = useState('');
  const [allowBatchMirror, setAllowBatchMirror] = useState(false);
  const logoInputRef = useRef<HTMLInputElement | null>(null);

  if (!activeGroup) {
    return (
      <div className="w-full h-full min-w-0 min-h-0 bg-[#15171E] p-5 flex items-center justify-center text-center text-xs text-[#7E8596]">
        在下方选择任意「成片视频组」即可配置片段裁剪、花字贴片与配乐混音
      </div>
    );
  }

  return (
    <div className="w-full h-full min-w-0 min-h-0 bg-[#15171E] flex flex-col select-none overflow-hidden">
      {/* Top 4 Compact Non-Overflowing Tabs */}
      <div className="p-2 border-b border-[#232632] shrink-0">
        <div className="grid grid-cols-4 gap-0.5 bg-[#0F1014] p-0.5 rounded-lg border border-[#232632]">
          <button
            onClick={() => setTab('clip')}
            className={`py-1.5 px-1 rounded-md text-[11px] font-medium whitespace-nowrap flex items-center justify-center gap-1 transition ${
              tab === 'clip'
                ? 'bg-[#252936] text-[#00E5FF] shadow-sm'
                : 'text-[#8A90A2] hover:text-white'
            }`}
          >
            <Sliders className="w-3 h-3 shrink-0" />
            片段
          </button>
          <button
            onClick={() => setTab('overlay')}
            className={`py-1.5 px-1 rounded-md text-[11px] font-medium whitespace-nowrap flex items-center justify-center gap-1 transition ${
              tab === 'overlay'
                ? 'bg-[#252936] text-[#00E5FF] shadow-sm'
                : 'text-[#8A90A2] hover:text-white'
            }`}
          >
            <Type className="w-3 h-3 shrink-0" />
            字幕花字
          </button>
          <button
            onClick={() => setTab('audio')}
            className={`py-1.5 px-1 rounded-md text-[11px] font-medium whitespace-nowrap flex items-center justify-center gap-1 transition ${
              tab === 'audio'
                ? 'bg-[#252936] text-[#00E5FF] shadow-sm'
                : 'text-[#8A90A2] hover:text-white'
            }`}
          >
            <Music className="w-3 h-3 shrink-0" />
            配音音乐
          </button>
          <button
            onClick={() => setTab('brand_dedup')}
            className={`py-1.5 px-1 rounded-md text-[11px] font-medium whitespace-nowrap flex items-center justify-center gap-1 transition ${
              tab === 'brand_dedup'
                ? 'bg-[#252936] text-[#FFB800] shadow-sm'
                : 'text-[#8A90A2] hover:text-white'
            }`}
          >
            <ShieldCheck className="w-3 h-3 shrink-0" />
            水印防重
          </button>
        </div>
      </div>

      {/* Scrollable Inspector Content */}
      <div className="flex-1 overflow-y-auto p-3.5 space-y-4">
        {tab === 'clip' && (
          <>
            {selectedClip && selectedClipAsset ? (
              <div className="space-y-4">
                <div className="p-2.5 rounded-lg bg-[#1C1F2A] border border-[#2C3142] flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-xs font-semibold text-white truncate">
                      {selectedClipAsset.name}
                    </div>
                    <div className="text-[10px] text-[#8A90A2]">
                      区间 {formatShortSec(selectedClip.trimStart)}~
                      {formatShortSec(selectedClip.trimEnd)} · 速度 {selectedClip.speed}x
                    </div>
                  </div>
                  <button
                    onClick={() => onOpenTrimClip(activeGroup, selectedClip)}
                    className="px-2.5 py-1.5 rounded-md bg-[#FFB800] text-[#111318] font-semibold text-[11px] flex items-center gap-1 shrink-0 hover:brightness-110"
                  >
                    <Scissors className="w-3 h-3" />
                    裁剪构图
                  </button>
                </div>

                {/* Fit Mode */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-[#D1D5DB]">画面适配与留边处理</label>
                  <div className="space-y-1">
                    {(['cover', 'blur', 'contain'] as FitMode[]).map((fm) => (
                      <button
                        key={fm}
                        onClick={() =>
                          onUpdateClip(activeGroup.id, selectedClip.id, { fitMode: fm })
                        }
                        className={`w-full text-left px-2.5 py-1.5 rounded-md border text-[11px] transition ${
                          selectedClip.fitMode === fm
                            ? 'bg-[#00E5FF]/15 border-[#00E5FF] text-white'
                            : 'bg-[#1B1E28] border-[#282C3C] text-[#9CA3AF] hover:text-white'
                        }`}
                      >
                        {FIT_MODE_LABELS[fm]}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Speed */}
                {selectedClipAsset.type === 'video' && (
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-xs">
                      <span className="font-semibold text-[#D1D5DB]">片段变速</span>
                      <span className="font-mono text-[#00E5FF]">{selectedClip.speed.toFixed(2)}x</span>
                    </div>
                    <input
                      type="range"
                      min={0.5}
                      max={2.0}
                      step={0.05}
                      value={selectedClip.speed}
                      onChange={(e) =>
                        onUpdateClip(activeGroup.id, selectedClip.id, {
                          speed: parseFloat(e.target.value),
                        })
                      }
                      className="w-full jy-slider"
                    />
                  </div>
                )}

                {/* Clip Volume */}
                {selectedClipAsset.type === 'video' && (
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-[#D1D5DB]">片段原声音量</span>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() =>
                            onUpdateClip(activeGroup.id, selectedClip.id, {
                              muted: !selectedClip.muted,
                            })
                          }
                          className={`p-1 rounded ${
                            selectedClip.muted
                              ? 'bg-red-500/20 text-red-400'
                              : 'bg-[#232735] text-[#CBD5E1]'
                          }`}
                        >
                          {selectedClip.muted ? (
                            <VolumeX className="w-3.5 h-3.5" />
                          ) : (
                            <Volume2 className="w-3.5 h-3.5" />
                          )}
                        </button>
                        <span className="font-mono text-[#00E5FF] w-10 text-right">
                          {selectedClip.muted ? '0%' : `${Math.round(selectedClip.volume * 100)}%`}
                        </span>
                      </div>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={1.5}
                      step={0.05}
                      value={selectedClip.muted ? 0 : selectedClip.volume}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value);
                        onUpdateClip(activeGroup.id, selectedClip.id, {
                          volume: val,
                          muted: val === 0,
                        });
                      }}
                      className="w-full jy-slider"
                    />
                  </div>
                )}

                {/* Transition to Next Clip */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-[#D1D5DB]">衔接下一段转场动画</label>
                    <button
                      onClick={() =>
                        onApplyTransitionToGroup(activeGroup.id, selectedClip.transition)
                      }
                      className="text-[10px] text-[#00E5FF] hover:underline"
                    >
                      应用到本组全部
                    </button>
                  </div>
                  <CustomSelect
                    value={selectedClip.transition}
                    options={(Object.keys(TRANSITION_LABELS) as TransitionType[]).map((tr) => ({
                      value: tr,
                      label: TRANSITION_LABELS[tr],
                    }))}
                    onChange={(val) =>
                      onUpdateClip(activeGroup.id, selectedClip.id, {
                        transition: val as TransitionType,
                      })
                    }
                    className="w-full"
                  />
                </div>
              </div>
            ) : (
              <div className="py-10 text-center text-xs text-[#7E8596] space-y-2">
                <Scissors className="w-7 h-7 mx-auto opacity-40" />
                <p>点击下方视频组轨道中的任意片段卡片，即可在此精修变速、原声、转场与画面构图</p>
              </div>
            )}
          </>
        )}

        {tab === 'overlay' && (() => {
          const subCfg = activeGroup.subtitles || createDefaultSubtitleConfig();
          const groupVoAsset =
            audioAssets.find((a) => a.id === activeGroup.voiceoverAssetId) || null;
          const groupDur = Math.max(2, getGroupTotalDuration(activeGroup) || 8);

          const generateCuesFromText = (rawText: string) => {
            const targetDur = groupVoAsset
              ? Math.max(0.8, groupVoAsset.duration / (activeGroup.voiceoverSpeed || 1))
              : groupDur;
            const cues = buildSyncedSubtitlesFromScript(
              rawText,
              targetDur,
              activeGroup.voiceoverDelaySec || 0
            );
            onUpdateSubtitles(activeGroup.id, {
              ...subCfg,
              enabled: true,
              cues,
            });
          };

          return (
            <div className="space-y-3">
              {/* Sub-mode Switcher: Synced Spoken Subtitles vs Fixed Top/Bottom Fancy Stickers */}
              <div className="grid grid-cols-2 gap-1 bg-[#0F1014] p-0.5 rounded-lg border border-[#242838]">
                <button
                  onClick={() => setTextSubTab('subtitles')}
                  className={`py-1 px-2 rounded-md text-[11px] font-semibold whitespace-nowrap flex items-center justify-center gap-1 transition ${
                    textSubTab === 'subtitles'
                      ? 'bg-[#FFB800]/18 text-[#FFB800] border border-[#FFB800]/40'
                      : 'text-[#8A90A2] hover:text-white'
                  }`}
                >
                  <MessageSquareText className="w-3 h-3 shrink-0" />
                  口播动态字幕 ({subCfg.cues.length})
                </button>
                <button
                  onClick={() => setTextSubTab('stickers')}
                  className={`py-1 px-2 rounded-md text-[11px] font-semibold whitespace-nowrap flex items-center justify-center gap-1 transition ${
                    textSubTab === 'stickers'
                      ? 'bg-[#00E5FF]/16 text-[#00E5FF] border border-[#00E5FF]/40'
                      : 'text-[#8A90A2] hover:text-white'
                  }`}
                >
                  <Sparkles className="w-3 h-3 shrink-0" />
                  上下固定花字
                </button>
              </div>

              {textSubTab === 'subtitles' ? (
                <div className="space-y-3">
                  {/* Enable & SRT Export Header */}
                  <div className="p-2.5 rounded-xl bg-[#191C27] border border-[#FFB800]/35 space-y-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <label className="flex items-center gap-1.5 text-xs font-bold text-white cursor-pointer">
                        <input
                          type="checkbox"
                          checked={subCfg.enabled}
                          onChange={(e) =>
                            onUpdateSubtitles(activeGroup.id, {
                              ...subCfg,
                              enabled: e.target.checked,
                            })
                          }
                          className="accent-[#FFB800]"
                        />
                        开启口播同步动态字幕
                      </label>

                      {subCfg.cues.length > 0 && (
                        <button
                          onClick={() => {
                            const srt = exportCuesToSrt(subCfg.cues);
                            const blob = new Blob([srt], { type: 'text/plain;charset=utf-8' });
                            const url = URL.createObjectURL(blob);
                            const a = document.createElement('a');
                            a.href = url;
                            a.download = `${activeGroup.name}_字幕.srt`;
                            a.click();
                            URL.revokeObjectURL(url);
                          }}
                          className="px-2 py-0.5 rounded bg-[#252A3C] hover:bg-[#313850] text-[10px] text-[#00E5FF] whitespace-nowrap flex items-center gap-1"
                          title="导出标准 SRT 字幕文件"
                        >
                          <Download className="w-3 h-3" />
                          导出SRT
                        </button>
                      )}
                    </div>

                    {/* 1-Click Sync from Active Voiceover */}
                    {groupVoAsset?.ttsSourceText ? (
                      <button
                        onClick={() => generateCuesFromText(groupVoAsset.ttsSourceText!)}
                        className="w-full py-1.5 px-2.5 rounded-lg bg-[#FFB800] text-[#111318] font-bold text-[11px] flex items-center justify-center gap-1.5 hover:brightness-110 transition whitespace-nowrap"
                      >
                        <Wand2 className="w-3.5 h-3.5 shrink-0" />
                        从本组口播配音一键重新切轴对齐字幕
                      </button>
                    ) : (
                      <button
                        onClick={onOpenTtsStudio}
                        className="w-full py-1.5 px-2.5 rounded-lg bg-[#241E38] hover:bg-[#31294D] border border-purple-400/40 text-purple-200 font-semibold text-[11px] flex items-center justify-center gap-1.5 transition whitespace-nowrap"
                      >
                        <Mic className="w-3.5 h-3.5 text-[#00E5FF] shrink-0" />
                        文字生成配音并自动挂上同步字幕
                      </button>
                    )}

                    {/* Custom Script Paste -> Auto Split & Align */}
                    <div className="space-y-1.5 pt-1 border-t border-[#262B3D]">
                      <textarea
                        rows={2}
                        value={customSubScript}
                        onChange={(e) => setCustomSubScript(e.target.value)}
                        placeholder="或直接粘贴口播台词，按本组配音/成片时长智能切句生成动态字幕..."
                        className="w-full bg-[#101219] border border-[#2A2F42] focus:border-[#FFB800] rounded-lg px-2 py-1.5 text-[11px] text-white outline-none resize-none"
                      />
                      <button
                        disabled={!customSubScript.trim()}
                        onClick={() => {
                          generateCuesFromText(customSubScript);
                          setCustomSubScript('');
                        }}
                        className="w-full py-1.5 rounded-lg bg-[#252A3C] hover:bg-[#FFB800] text-[#FFB800] hover:text-[#111318] font-semibold text-[11px] disabled:opacity-40 transition"
                      >
                        按台词自动切分并对齐时间轴
                      </button>
                    </div>
                  </div>

                  {/* Subtitle Visual Style & Position */}
                  <div className="p-2.5 rounded-xl bg-[#181B25] border border-[#272C3F] space-y-2">
                    <div className="space-y-1">
                      <label className="text-[11px] text-[#B8C0D0]">动态字幕花字预设</label>
                      <CustomSelect
                        size="sm"
                        accent="amber"
                        value={subCfg.styleId}
                        options={(Object.keys(SUBTITLE_STYLES) as SubtitleStyleId[]).map((sid) => ({
                          value: sid,
                          label: SUBTITLE_STYLES[sid].name,
                        }))}
                        onChange={(val) =>
                          onUpdateSubtitles(activeGroup.id, {
                            ...subCfg,
                            styleId: val as SubtitleStyleId,
                          })
                        }
                        className="w-full"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-[11px]">
                      <div>
                        <div className="flex justify-between text-[#9CA3AF]">
                          <span>垂直位置Y</span>
                          <span className="font-mono text-[#FFB800]">{subCfg.yPercent}%</span>
                        </div>
                        <input
                          type="range"
                          min={18}
                          max={90}
                          step={1}
                          value={subCfg.yPercent}
                          onChange={(e) =>
                            onUpdateSubtitles(activeGroup.id, {
                              ...subCfg,
                              yPercent: parseInt(e.target.value, 10),
                            })
                          }
                          className="w-full accent-[#FFB800]"
                        />
                      </div>
                      <div>
                        <div className="flex justify-between text-[#9CA3AF]">
                          <span>字号大小</span>
                          <span className="font-mono text-[#FFB800]">
                            {Math.round((subCfg.fontScale || 1) * 100)}%
                          </span>
                        </div>
                        <input
                          type="range"
                          min={0.7}
                          max={1.45}
                          step={0.05}
                          value={subCfg.fontScale || 1}
                          onChange={(e) =>
                            onUpdateSubtitles(activeGroup.id, {
                              ...subCfg,
                              fontScale: parseFloat(e.target.value),
                            })
                          }
                          className="w-full accent-[#FFB800]"
                        />
                      </div>
                    </div>

                    <button
                      onClick={() => onSyncSubtitleStyleAllGroups(subCfg)}
                      className="w-full py-1.5 rounded-lg bg-[#222634] hover:bg-[#2C3144] border border-[#31374B] text-[11px] text-[#00E5FF] flex items-center justify-center gap-1 whitespace-nowrap transition"
                    >
                      <CopyCheck className="w-3.5 h-3.5 shrink-0" />
                      同步此动态字幕样式与高度到全部组
                    </button>
                  </div>

                  {/* Cue-by-Cue Timeline Fine Editor */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-[11px] text-[#9CA3AF]">
                      <span>逐句字幕时间轴 ({subCfg.cues.length} 句)</span>
                      <button
                        onClick={() => {
                          const lastEnd =
                            subCfg.cues.length > 0
                              ? subCfg.cues[subCfg.cues.length - 1].endSec
                              : 0;
                          const nextCues = [
                            ...subCfg.cues,
                            {
                              id: `sub_${uid()}`,
                              startSec: Math.round(lastEnd * 10) / 10,
                              endSec: Math.round((lastEnd + 2.0) * 10) / 10,
                              text: '新增口播字幕文案',
                            },
                          ];
                          onUpdateSubtitles(activeGroup.id, {
                            ...subCfg,
                            enabled: true,
                            cues: nextCues,
                          });
                        }}
                        className="px-2 py-0.5 rounded bg-[#23283A] hover:bg-[#2E354C] text-[#00E5FF] flex items-center gap-0.5 text-[10px]"
                      >
                        <Plus className="w-3 h-3" />
                        加一句
                      </button>
                    </div>

                    {subCfg.cues.length === 0 ? (
                      <div className="p-3 rounded-lg bg-[#12141C] border border-[#242838] text-[11px] text-[#7E8596] text-center">
                        暂无动态字幕句。使用「文字转配音」会自动生成，也可在上方粘贴台词一键切轴。
                      </div>
                    ) : (
                      <div className="max-h-56 overflow-y-auto space-y-1.5 pr-0.5">
                        {subCfg.cues.map((cue, idx) => (
                          <div
                            key={cue.id}
                            className="p-2 rounded-lg bg-[#131620] border border-[#262B3D] space-y-1"
                          >
                            <div className="flex items-center justify-between gap-1 text-[10px] font-mono text-[#9CA3AF]">
                              <div className="flex items-center gap-1">
                                <span className="text-[#FFB800]">#{idx + 1}</span>
                                <input
                                  type="number"
                                  step={0.1}
                                  min={0}
                                  value={cue.startSec}
                                  onChange={(e) => {
                                    const val = Math.max(0, parseFloat(e.target.value || '0'));
                                    const next = subCfg.cues.map((c) =>
                                      c.id === cue.id ? { ...c, startSec: val } : c
                                    );
                                    onUpdateSubtitles(activeGroup.id, { ...subCfg, cues: next });
                                  }}
                                  className="w-12 bg-[#0D0F16] border border-[#2B3145] rounded px-1 py-0.5 text-center text-white outline-none"
                                />
                                <span>~</span>
                                <input
                                  type="number"
                                  step={0.1}
                                  min={0.1}
                                  value={cue.endSec}
                                  onChange={(e) => {
                                    const val = Math.max(0.1, parseFloat(e.target.value || '1'));
                                    const next = subCfg.cues.map((c) =>
                                      c.id === cue.id ? { ...c, endSec: val } : c
                                    );
                                    onUpdateSubtitles(activeGroup.id, { ...subCfg, cues: next });
                                  }}
                                  className="w-12 bg-[#0D0F16] border border-[#2B3145] rounded px-1 py-0.5 text-center text-white outline-none"
                                />
                                <span>s</span>
                              </div>
                              <button
                                onClick={() => {
                                  const next = subCfg.cues.filter((c) => c.id !== cue.id);
                                  onUpdateSubtitles(activeGroup.id, { ...subCfg, cues: next });
                                }}
                                className="text-[#6B7280] hover:text-red-400 p-0.5"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </div>
                            <input
                              type="text"
                              value={cue.text}
                              onChange={(e) => {
                                const next = subCfg.cues.map((c) =>
                                  c.id === cue.id ? { ...c, text: e.target.value } : c
                                );
                                onUpdateSubtitles(activeGroup.id, { ...subCfg, cues: next });
                              }}
                              className="w-full bg-[#0D0F16] border border-[#262B3D] focus:border-[#FFB800] rounded px-2 py-1 text-xs text-white outline-none"
                            />
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="space-y-3.5">
                  {/* Top Hook Title */}
                  <div className="space-y-1">
                    <label className="text-[11px] font-medium text-[#B8C0D0]">
                      顶部吸睛大标题 (支持换行，留空不显示)
                    </label>
                    <textarea
                      rows={2}
                      value={activeGroup.overlay.topTitle}
                      placeholder="例如：4秒碎冰榨汁！细腻免过滤"
                      onChange={(e) =>
                        onUpdateOverlay(activeGroup.id, { topTitle: e.target.value })
                      }
                      className="w-full bg-[#11131A] border border-[#2A2F40] focus:border-[#00E5FF] rounded-lg px-2.5 py-1.5 text-xs text-white outline-none resize-none"
                    />
                  </div>

                  {/* Bottom CTA Caption */}
                  <div className="space-y-1">
                    <label className="text-[11px] font-medium text-[#B8C0D0]">
                      底部促销转化引导语 (CTA)
                    </label>
                    <textarea
                      rows={2}
                      value={activeGroup.overlay.bottomTitle}
                      placeholder="例如：👇 点击下方链接 抢限时买1送1"
                      onChange={(e) =>
                        onUpdateOverlay(activeGroup.id, { bottomTitle: e.target.value })
                      }
                      className="w-full bg-[#11131A] border border-[#2A2F40] focus:border-[#00E5FF] rounded-lg px-2.5 py-1.5 text-xs text-white outline-none resize-none"
                    />
                  </div>

                  {/* 6 CapCut Fancy Title Presets */}
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-medium text-[#B8C0D0]">剪映爆款花字预设</label>
                    <div className="grid grid-cols-2 gap-1.5">
                      {(Object.keys(TITLE_STYLES) as TitleStyleId[]).map((sid) => {
                        const st = TITLE_STYLES[sid];
                        const active = activeGroup.overlay.styleId === sid;
                        return (
                          <button
                            key={sid}
                            onClick={() => onUpdateOverlay(activeGroup.id, { styleId: sid })}
                            className={`p-2 rounded-lg border text-left transition ${
                              active
                                ? 'bg-[#212636] border-[#00E5FF] ring-1 ring-[#00E5FF]/30'
                                : 'bg-[#191C25] border-[#272B3A] hover:border-[#3A4054]'
                            }`}
                          >
                            <div
                              className="h-7 rounded flex items-center justify-center text-xs font-black tracking-wide mb-1"
                              style={{
                                backgroundColor: st.bgColor || '#111318',
                                color: st.textColor,
                                WebkitTextStroke:
                                  st.strokeWidth > 0 ? `1px ${st.strokeColor}` : undefined,
                                border: st.borderColor ? `1px solid ${st.borderColor}` : undefined,
                              }}
                            >
                              爆款花字
                            </div>
                            <div className="flex items-center justify-between text-[10px]">
                              <span className="text-[#E5E7EB] font-medium truncate">{st.name}</span>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Position & Font Scale Sliders */}
                  <div className="space-y-2.5 pt-1 border-t border-[#232632]">
                    <div className="space-y-1">
                      <div className="flex justify-between text-[11px] text-[#9CA3AF]">
                        <span>花字整体字号缩放</span>
                        <span className="font-mono text-white">
                          {Math.round((activeGroup.overlay.fontScale || 1) * 100)}%
                        </span>
                      </div>
                      <input
                        type="range"
                        min={0.7}
                        max={1.45}
                        step={0.05}
                        value={activeGroup.overlay.fontScale || 1}
                        onChange={(e) =>
                          onUpdateOverlay(activeGroup.id, { fontScale: parseFloat(e.target.value) })
                        }
                        className="w-full jy-slider"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-2.5">
                      <div className="space-y-1">
                        <div className="flex justify-between text-[10px] text-[#9CA3AF]">
                          <span>顶部位置Y</span>
                          <span className="font-mono text-white">{activeGroup.overlay.topY}%</span>
                        </div>
                        <input
                          type="range"
                          min={7}
                          max={35}
                          step={1}
                          value={activeGroup.overlay.topY}
                          onChange={(e) =>
                            onUpdateOverlay(activeGroup.id, { topY: parseInt(e.target.value, 10) })
                          }
                          className="w-full jy-slider"
                        />
                      </div>
                      <div className="space-y-1">
                        <div className="flex justify-between text-[10px] text-[#9CA3AF]">
                          <span>底部位置Y</span>
                          <span className="font-mono text-white">{activeGroup.overlay.bottomY}%</span>
                        </div>
                        <input
                          type="range"
                          min={62}
                          max={92}
                          step={1}
                          value={activeGroup.overlay.bottomY}
                          onChange={(e) =>
                            onUpdateOverlay(activeGroup.id, {
                              bottomY: parseInt(e.target.value, 10),
                            })
                          }
                          className="w-full jy-slider"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Batch Sync Buttons */}
                  <div className="pt-2 flex flex-col gap-1.5">
                    <button
                      onClick={() => onSyncOverlayStyleAllGroups(activeGroup.overlay, false)}
                      className="w-full py-1.5 rounded-lg bg-[#222634] hover:bg-[#2C3144] border border-[#31374B] text-[11px] text-[#00E5FF] flex items-center justify-center gap-1.5 transition"
                    >
                      <CopyCheck className="w-3.5 h-3.5" />
                      仅将花字样式与排版位置同步到全部组
                    </button>
                    <button
                      onClick={() => onSyncOverlayStyleAllGroups(activeGroup.overlay, true)}
                      className="w-full py-1.5 rounded-lg bg-[#222634] hover:bg-[#2C3144] border border-[#31374B] text-[11px] text-[#CBD5E1] flex items-center justify-center gap-1.5 transition"
                    >
                      <CopyCheck className="w-3.5 h-3.5" />
                      将文案 + 样式一并覆盖到全部视频组
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })()}

        {tab === 'audio' && (() => {
          const activeVoAsset =
            audioAssets.find((a) => a.id === activeGroup.voiceoverAssetId) || null;
          const activeBgmAsset =
            audioAssets.find((a) => a.id === activeGroup.bgmAssetId) || null;

          const bgmStart = activeGroup.bgmTrimStart ?? activeBgmAsset?.defaultTrimStart ?? 0;
          const bgmEnd =
            activeGroup.bgmTrimEnd ||
            activeBgmAsset?.defaultTrimEnd ||
            activeBgmAsset?.duration ||
            0;

          return (
            <div className="space-y-3.5">
              {/* 1. Oral Voiceover / AI TTS Track */}
              <div className="p-3 rounded-xl bg-[#191C27] border border-[#FFB800]/35 space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold text-white flex items-center gap-1.5">
                    <Mic className="w-3.5 h-3.5 text-[#FFB800]" />
                    口播配音轨 (AI配音/人声)
                  </span>
                  <button
                    onClick={onOpenTtsStudio}
                    className="px-2 py-0.5 rounded bg-[#FFB800] text-[#111318] font-bold text-[10px] whitespace-nowrap hover:brightness-110 transition"
                  >
                    + 文字生成配音
                  </button>
                </div>

                <div className="flex items-center gap-1.5">
                  <CustomSelect
                    accent="amber"
                    value={activeGroup.voiceoverAssetId || ''}
                    options={[
                      { value: '', label: '无独立口播配音' },
                      ...audioAssets.map((a) => ({
                        value: a.id,
                        label: `${
                          a.audioRole === 'voiceover' || a.name.includes('配音') ? '🎙️' : '🎵'
                        } ${a.name}`,
                        rightMeta: formatShortSec(a.duration),
                      })),
                    ]}
                    onChange={(val) =>
                      onUpdateGroupAudio(activeGroup.id, {
                        voiceoverAssetId: val || null,
                        voiceoverVolume: activeGroup.voiceoverVolume ?? 1.15,
                        bgmDucking: true,
                      })
                    }
                    menuMinWidth={240}
                    className="flex-1 min-w-0"
                  />

                  {activeVoAsset && (
                    <button
                      onClick={() => onOpenAudioEditor(activeVoAsset)}
                      className="px-2 py-1.5 rounded-lg bg-[#252A3D] hover:bg-[#FFB800] text-[#FFB800] hover:text-[#111318] text-[11px] font-semibold whitespace-nowrap flex items-center gap-1 transition"
                      title="打开声波剪辑与去气口"
                    >
                      <Zap className="w-3 h-3" />
                      去气口/剪辑
                    </button>
                  )}
                </div>

                {activeVoAsset && (
                  <div className="space-y-2 pt-1 text-[11px]">
                    <div>
                      <div className="flex justify-between text-[#B8C0D0]">
                        <span>口播人声音量</span>
                        <span className="font-mono text-[#FFB800]">
                          {Math.round((activeGroup.voiceoverVolume ?? 1.15) * 100)}%
                        </span>
                      </div>
                      <input
                        type="range"
                        min={0}
                        max={1.8}
                        step={0.05}
                        value={activeGroup.voiceoverVolume ?? 1.15}
                        onChange={(e) =>
                          onUpdateGroupAudio(activeGroup.id, {
                            voiceoverVolume: parseFloat(e.target.value),
                          })
                        }
                        className="w-full accent-[#FFB800]"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <div className="flex justify-between text-[#B8C0D0]">
                          <span>起播延迟</span>
                          <span className="font-mono text-[#FFB800]">
                            {(activeGroup.voiceoverDelaySec || 0).toFixed(1)}s
                          </span>
                        </div>
                        <input
                          type="range"
                          min={0}
                          max={5}
                          step={0.1}
                          value={activeGroup.voiceoverDelaySec || 0}
                          onChange={(e) =>
                            onUpdateGroupAudio(activeGroup.id, {
                              voiceoverDelaySec: parseFloat(e.target.value),
                            })
                          }
                          className="w-full accent-[#FFB800]"
                        />
                      </div>

                      <div>
                        <div className="flex justify-between text-[#B8C0D0]">
                          <span>口播倍速</span>
                          <span className="font-mono text-[#FFB800]">
                            {(activeGroup.voiceoverSpeed || activeVoAsset.defaultSpeed || 1).toFixed(2)}x
                          </span>
                        </div>
                        <input
                          type="range"
                          min={0.8}
                          max={1.5}
                          step={0.05}
                          value={activeGroup.voiceoverSpeed || activeVoAsset.defaultSpeed || 1}
                          onChange={(e) =>
                            onUpdateGroupAudio(activeGroup.id, {
                              voiceoverSpeed: parseFloat(e.target.value),
                            })
                          }
                          className="w-full accent-[#FFB800]"
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* 2. BGM Music Track with Trim / Loop / Fade / Ducking */}
              <div className="p-3 rounded-xl bg-[#181B25] border border-[#2A3044] space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold text-white flex items-center gap-1.5">
                    <Music className="w-3.5 h-3.5 text-[#00E5FF]" />
                    背景音乐轨 (BGM剪辑)
                  </span>
                  {activeBgmAsset && (
                    <button
                      onClick={() => onOpenAudioEditor(activeBgmAsset)}
                      className="px-2 py-0.5 rounded bg-[#00E5FF]/15 hover:bg-[#00E5FF] text-[#00E5FF] hover:text-[#081016] text-[10px] font-bold whitespace-nowrap flex items-center gap-1 transition"
                    >
                      <Scissors className="w-3 h-3" />
                      声波精剪副歌
                    </button>
                  )}
                </div>

                <CustomSelect
                  value={activeGroup.bgmAssetId || ''}
                  options={[
                    { value: '', label: '不使用背景音乐' },
                    ...audioAssets.map((a) => ({
                      value: a.id,
                      label: `🎵 ${a.name}`,
                      rightMeta: formatShortSec(a.duration),
                    })),
                  ]}
                  onChange={(val) =>
                    onUpdateGroupAudio(activeGroup.id, {
                      bgmAssetId: val || null,
                      bgmTrimStart: undefined,
                      bgmTrimEnd: undefined,
                    })
                  }
                  menuMinWidth={240}
                  className="w-full"
                />

                {activeBgmAsset && (
                  <div className="space-y-2 pt-1 text-[11px]">
                    <div>
                      <div className="flex justify-between text-[#B8C0D0]">
                        <span>BGM 音量</span>
                        <span className="font-mono text-[#00E5FF]">
                          {Math.round(activeGroup.bgmVolume * 100)}%
                        </span>
                      </div>
                      <input
                        type="range"
                        min={0}
                        max={1.4}
                        step={0.05}
                        value={activeGroup.bgmVolume}
                        onChange={(e) =>
                          onUpdateGroupAudio(activeGroup.id, {
                            bgmVolume: parseFloat(e.target.value),
                          })
                        }
                        className="w-full jy-slider"
                      />
                    </div>

                    {/* Quick Chorus Offset Slider right inside Inspector! */}
                    <div>
                      <div className="flex justify-between text-[#B8C0D0]">
                        <span>截取起点 (跳过前奏直切高潮)</span>
                        <span className="font-mono text-[#00E5FF]">
                          从 {bgmStart.toFixed(1)}s 播至 {bgmEnd.toFixed(1)}s
                        </span>
                      </div>
                      <input
                        type="range"
                        min={0}
                        max={Math.max(0.2, activeBgmAsset.duration - 0.5)}
                        step={0.2}
                        value={bgmStart}
                        onChange={(e) => {
                          const nextS = parseFloat(e.target.value);
                          onUpdateGroupAudio(activeGroup.id, {
                            bgmTrimStart: nextS,
                            bgmTrimEnd: Math.max(nextS + 0.5, bgmEnd),
                          });
                        }}
                        className="w-full jy-slider"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <div className="flex justify-between text-[#B8C0D0]">
                          <span>开头淡入</span>
                          <span className="font-mono text-[#00E5FF]">
                            {(activeGroup.bgmFadeInSec ?? activeBgmAsset.fadeInSec ?? 0).toFixed(1)}s
                          </span>
                        </div>
                        <input
                          type="range"
                          min={0}
                          max={3}
                          step={0.2}
                          value={activeGroup.bgmFadeInSec ?? activeBgmAsset.fadeInSec ?? 0}
                          onChange={(e) =>
                            onUpdateGroupAudio(activeGroup.id, {
                              bgmFadeInSec: parseFloat(e.target.value),
                            })
                          }
                          className="w-full jy-slider"
                        />
                      </div>

                      <div>
                        <div className="flex justify-between text-[#B8C0D0]">
                          <span>结尾淡出</span>
                          <span className="font-mono text-[#00E5FF]">
                            {(
                              activeGroup.bgmFadeOutSec ??
                              (activeGroup.audioFadeOut ? 1.2 : 0)
                            ).toFixed(1)}
                            s
                          </span>
                        </div>
                        <input
                          type="range"
                          min={0}
                          max={3}
                          step={0.2}
                          value={
                            activeGroup.bgmFadeOutSec ??
                            (activeGroup.audioFadeOut ? 1.2 : 0)
                          }
                          onChange={(e) => {
                            const val = parseFloat(e.target.value);
                            onUpdateGroupAudio(activeGroup.id, {
                              bgmFadeOutSec: val,
                              audioFadeOut: val > 0.05,
                            });
                          }}
                          className="w-full jy-slider"
                        />
                      </div>
                    </div>

                    <div className="flex flex-col gap-1.5 pt-1">
                      <label className="flex items-center gap-2 text-[#CBD5E1] cursor-pointer">
                        <input
                          type="checkbox"
                          checked={activeGroup.bgmLoop !== false}
                          onChange={(e) =>
                            onUpdateGroupAudio(activeGroup.id, { bgmLoop: e.target.checked })
                          }
                          className="accent-[#00E5FF]"
                        />
                        BGM 不足成片时长时自动无缝循环
                      </label>

                      <label className="flex items-center gap-2 text-[#FFB800] cursor-pointer">
                        <input
                          type="checkbox"
                          checked={activeGroup.bgmDucking !== false}
                          onChange={(e) =>
                            onUpdateGroupAudio(activeGroup.id, { bgmDucking: e.target.checked })
                          }
                          className="accent-[#FFB800]"
                        />
                        智能闪避：有口播人声时自动压低背景乐
                      </label>
                    </div>
                  </div>
                )}
              </div>

              {/* 3. Video Original Sound Master */}
              <div className="p-2.5 rounded-xl bg-[#181B25] border border-[#252A3A] space-y-1.5">
                <div className="flex justify-between text-xs">
                  <span className="text-[#B8C0D0]">视频画面原声总音量</span>
                  <span className="font-mono text-[#00E5FF]">
                    {Math.round(activeGroup.clipMasterVolume * 100)}%
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={1.4}
                  step={0.05}
                  value={activeGroup.clipMasterVolume}
                  onChange={(e) =>
                    onUpdateGroupAudio(activeGroup.id, {
                      clipMasterVolume: parseFloat(e.target.value),
                    })
                  }
                  className="w-full jy-slider"
                />
              </div>

              <button
                onClick={() => onSyncAudioAllGroups(activeGroup)}
                className="w-full py-2 rounded-lg bg-[#222634] hover:bg-[#2D3347] border border-[#32384E] text-xs text-[#00E5FF] font-medium flex items-center justify-center gap-1.5 whitespace-nowrap transition"
              >
                <CopyCheck className="w-3.5 h-3.5 shrink-0" />
                同步本组配音与音乐混音配置到全部组
              </button>
            </div>
          );
        })()}

        {tab === 'brand_dedup' && (() => {
          const wm = activeGroup.watermark || createDefaultWatermarkConfig();
          const dedup = activeGroup.dedup || createDefaultDedupConfig();

          const cornerOptions: Array<{ id: WatermarkCorner; label: string }> = [
            { id: 'top_left', label: '左上角' },
            { id: 'top_right', label: '右上角' },
            { id: 'bottom_left', label: '左下角' },
            { id: 'bottom_right', label: '右下角' },
          ];

          return (
            <div className="space-y-3.5">
              {/* 1. Brand Corner Watermark / Logo */}
              <div className="p-3 rounded-xl bg-[#181B25] border border-[#2C334A] space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <label className="flex items-center gap-1.5 text-xs font-bold text-white cursor-pointer">
                    <input
                      type="checkbox"
                      checked={wm.enabled}
                      onChange={(e) =>
                        onUpdateWatermark(activeGroup.id, { ...wm, enabled: e.target.checked })
                      }
                      className="accent-[#00E5FF]"
                    />
                    <Stamp className="w-3.5 h-3.5 text-[#00E5FF]" />
                    品牌角标 / LOGO 水印
                  </label>
                </div>

                {/* Mode Switcher: Text Badge vs Image PNG Logo */}
                <div className="grid grid-cols-2 gap-1 bg-[#101219] p-0.5 rounded-lg border border-[#252A3C]">
                  <button
                    onClick={() =>
                      onUpdateWatermark(activeGroup.id, { ...wm, enabled: true, mode: 'text' })
                    }
                    className={`py-1 rounded text-[11px] font-medium transition ${
                      wm.mode === 'text'
                        ? 'bg-[#252B3E] text-[#00E5FF]'
                        : 'text-[#8A90A2] hover:text-white'
                    }`}
                  >
                    文字角标水印
                  </button>
                  <button
                    onClick={() =>
                      onUpdateWatermark(activeGroup.id, { ...wm, enabled: true, mode: 'image' })
                    }
                    className={`py-1 rounded text-[11px] font-medium transition flex items-center justify-center gap-1 ${
                      wm.mode === 'image'
                        ? 'bg-[#252B3E] text-[#00E5FF]'
                        : 'text-[#8A90A2] hover:text-white'
                    }`}
                  >
                    <ImageIcon className="w-3 h-3" />
                    透明LOGO图
                  </button>
                </div>

                {wm.mode === 'text' ? (
                  <input
                    type="text"
                    value={wm.text}
                    onChange={(e) =>
                      onUpdateWatermark(activeGroup.id, {
                        ...wm,
                        enabled: true,
                        text: e.target.value,
                      })
                    }
                    placeholder="例如：@极光官方旗舰店 · 原创实拍"
                    className="w-full bg-[#101219] border border-[#2B3044] focus:border-[#00E5FF] rounded-lg px-2.5 py-1.5 text-xs text-white outline-none"
                  />
                ) : (
                  <div className="flex items-center gap-1.5">
                    <CustomSelect
                      size="sm"
                      value={wm.imageAssetId || ''}
                      options={[
                        { value: '', label: '选择图片素材作LOGO...' },
                        ...imageAssets.map((img) => ({
                          value: img.id,
                          label: `🖼️ ${img.name}`,
                        })),
                      ]}
                      onChange={(val) =>
                        onUpdateWatermark(activeGroup.id, {
                          ...wm,
                          enabled: true,
                          mode: 'image',
                          imageAssetId: val || null,
                        })
                      }
                      menuMinWidth={200}
                      className="flex-1 min-w-0"
                    />
                    <button
                      onClick={() => logoInputRef.current?.click()}
                      className="px-2 py-1 rounded-md bg-[#00E5FF]/15 hover:bg-[#00E5FF] text-[#00E5FF] hover:text-[#081016] text-[11px] font-semibold whitespace-nowrap flex items-center gap-1 shrink-0 transition"
                    >
                      <Upload className="w-3 h-3" />
                      传LOGO
                    </button>
                    <input
                      ref={logoInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) onUploadWatermarkLogo(f);
                        e.currentTarget.value = '';
                      }}
                    />
                  </div>
                )}

                {/* 4-Corner Quick Selector */}
                <div className="grid grid-cols-4 gap-1">
                  {cornerOptions.map((c) => (
                    <button
                      key={c.id}
                      onClick={() =>
                        onUpdateWatermark(activeGroup.id, { ...wm, enabled: true, corner: c.id })
                      }
                      className={`py-1 rounded text-[10px] border transition ${
                        wm.corner === c.id
                          ? 'bg-[#00E5FF]/15 border-[#00E5FF] text-[#00E5FF] font-semibold'
                          : 'bg-[#12141D] border-[#262B3D] text-[#8A90A2] hover:text-white'
                      }`}
                    >
                      {c.label}
                    </button>
                  ))}
                </div>

                {/* Size, Opacity & Margins */}
                <div className="grid grid-cols-2 gap-2 text-[11px]">
                  <div>
                    <div className="flex justify-between text-[#9CA3AF]">
                      <span>水印缩放</span>
                      <span className="font-mono text-[#00E5FF]">
                        {Math.round((wm.scale || 1) * 100)}%
                      </span>
                    </div>
                    <input
                      type="range"
                      min={0.5}
                      max={1.8}
                      step={0.05}
                      value={wm.scale || 1}
                      onChange={(e) =>
                        onUpdateWatermark(activeGroup.id, {
                          ...wm,
                          scale: parseFloat(e.target.value),
                        })
                      }
                      className="w-full jy-slider"
                    />
                  </div>
                  <div>
                    <div className="flex justify-between text-[#9CA3AF]">
                      <span>不透明度</span>
                      <span className="font-mono text-[#00E5FF]">
                        {Math.round((wm.opacity ?? 0.82) * 100)}%
                      </span>
                    </div>
                    <input
                      type="range"
                      min={0.15}
                      max={1.0}
                      step={0.05}
                      value={wm.opacity ?? 0.82}
                      onChange={(e) =>
                        onUpdateWatermark(activeGroup.id, {
                          ...wm,
                          opacity: parseFloat(e.target.value),
                        })
                      }
                      className="w-full jy-slider"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 text-[11px]">
                  <div>
                    <div className="flex justify-between text-[#9CA3AF]">
                      <span>横向边距X</span>
                      <span className="font-mono text-white">{(wm.offsetX ?? 4.5).toFixed(1)}%</span>
                    </div>
                    <input
                      type="range"
                      min={1.5}
                      max={25}
                      step={0.5}
                      value={wm.offsetX ?? 4.5}
                      onChange={(e) =>
                        onUpdateWatermark(activeGroup.id, {
                          ...wm,
                          offsetX: parseFloat(e.target.value),
                        })
                      }
                      className="w-full jy-slider"
                    />
                  </div>
                  <div>
                    <div className="flex justify-between text-[#9CA3AF]">
                      <span>纵向边距Y</span>
                      <span className="font-mono text-white">{(wm.offsetY ?? 4.0).toFixed(1)}%</span>
                    </div>
                    <input
                      type="range"
                      min={1.5}
                      max={25}
                      step={0.5}
                      value={wm.offsetY ?? 4.0}
                      onChange={(e) =>
                        onUpdateWatermark(activeGroup.id, {
                          ...wm,
                          offsetY: parseFloat(e.target.value),
                        })
                      }
                      className="w-full jy-slider"
                    />
                  </div>
                </div>

                <button
                  onClick={() => onSyncWatermarkAllGroups(wm)}
                  className="w-full py-1.5 rounded-lg bg-[#222634] hover:bg-[#2C3144] border border-[#31374B] text-[11px] text-[#00E5FF] flex items-center justify-center gap-1 whitespace-nowrap transition"
                >
                  <CopyCheck className="w-3.5 h-3.5 shrink-0" />
                  同步此品牌角标/水印到全部视频组
                </button>
              </div>

              {/* 2. Anti-Duplicate / Smart Matrix Dedup Filters */}
              <div className="p-3 rounded-xl bg-[#191C27] border border-[#FFB800]/35 space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <label className="flex items-center gap-1.5 text-xs font-bold text-white cursor-pointer">
                    <input
                      type="checkbox"
                      checked={dedup.enabled}
                      onChange={(e) =>
                        onUpdateDedup(activeGroup.id, { ...dedup, enabled: e.target.checked })
                      }
                      className="accent-[#FFB800]"
                    />
                    <ShieldCheck className="w-3.5 h-3.5 text-[#FFB800]" />
                    本组画面防重去重微调
                  </label>
                </div>

                <div className="space-y-2 text-[11px]">
                  <label className="flex items-center justify-between gap-2 p-2 rounded-lg bg-[#11131B] border border-[#262B3D] cursor-pointer">
                    <span className="flex items-center gap-1.5 text-[#E5E7EB]">
                      <FlipHorizontal2 className="w-3.5 h-3.5 text-[#FFB800] shrink-0" />
                      <span>水平镜像画面 (不翻转花字/字幕/水印)</span>
                    </span>
                    <input
                      type="checkbox"
                      checked={dedup.mirrorFlip}
                      onChange={(e) =>
                        onUpdateDedup(activeGroup.id, {
                          ...dedup,
                          enabled: true,
                          mirrorFlip: e.target.checked,
                        })
                      }
                      className="accent-[#FFB800]"
                    />
                  </label>

                  <div>
                    <div className="flex justify-between text-[#B8C0D0]">
                      <span>微缩放裁边去重 (改变帧像素哈希)</span>
                      <span className="font-mono text-[#FFB800]">
                        +{(dedup.zoomPunchPct || 0).toFixed(1)}%
                      </span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={8}
                      step={0.5}
                      value={dedup.zoomPunchPct || 0}
                      onChange={(e) =>
                        onUpdateDedup(activeGroup.id, {
                          ...dedup,
                          enabled: true,
                          zoomPunchPct: parseFloat(e.target.value),
                        })
                      }
                      className="w-full accent-[#FFB800]"
                    />
                  </div>

                  <div className="grid grid-cols-3 gap-1.5">
                    <div>
                      <div className="flex justify-between text-[10px] text-[#9CA3AF]">
                        <span>亮度</span>
                        <span className="font-mono text-white">
                          {dedup.brightness >= 0 ? '+' : ''}
                          {Math.round((dedup.brightness || 0) * 100)}%
                        </span>
                      </div>
                      <input
                        type="range"
                        min={-0.08}
                        max={0.08}
                        step={0.01}
                        value={dedup.brightness || 0}
                        onChange={(e) =>
                          onUpdateDedup(activeGroup.id, {
                            ...dedup,
                            enabled: true,
                            brightness: parseFloat(e.target.value),
                          })
                        }
                        className="w-full accent-[#FFB800]"
                      />
                    </div>
                    <div>
                      <div className="flex justify-between text-[10px] text-[#9CA3AF]">
                        <span>对比度</span>
                        <span className="font-mono text-white">
                          {Math.round((dedup.contrast ?? 1) * 100)}%
                        </span>
                      </div>
                      <input
                        type="range"
                        min={0.92}
                        max={1.12}
                        step={0.01}
                        value={dedup.contrast ?? 1}
                        onChange={(e) =>
                          onUpdateDedup(activeGroup.id, {
                            ...dedup,
                            enabled: true,
                            contrast: parseFloat(e.target.value),
                          })
                        }
                        className="w-full accent-[#FFB800]"
                      />
                    </div>
                    <div>
                      <div className="flex justify-between text-[10px] text-[#9CA3AF]">
                        <span>饱和度</span>
                        <span className="font-mono text-white">
                          {Math.round((dedup.saturation ?? 1) * 100)}%
                        </span>
                      </div>
                      <input
                        type="range"
                        min={0.9}
                        max={1.15}
                        step={0.01}
                        value={dedup.saturation ?? 1}
                        onChange={(e) =>
                          onUpdateDedup(activeGroup.id, {
                            ...dedup,
                            enabled: true,
                            saturation: parseFloat(e.target.value),
                          })
                        }
                        className="w-full accent-[#FFB800]"
                      />
                    </div>
                  </div>

                  <label className="flex items-center gap-2 text-[#CBD5E1] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={dedup.sharpen}
                      onChange={(e) =>
                        onUpdateDedup(activeGroup.id, {
                          ...dedup,
                          enabled: true,
                          sharpen: e.target.checked,
                        })
                      }
                      className="accent-[#FFB800]"
                    />
                    开启微锐化重构视频编码宏块指纹
                  </label>
                </div>

                {/* One-Click Batch Differentiated Anti-Duplicate Generator! */}
                <div className="pt-2 border-t border-[#2A3045] space-y-2">
                  <label className="flex items-center gap-1.5 text-[11px] text-[#B8C0D0] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={allowBatchMirror}
                      onChange={(e) => setAllowBatchMirror(e.target.checked)}
                      className="accent-[#FFB800]"
                    />
                    批量防重时允许隔组穿插水平镜像 (画面无文字时推荐)
                  </label>

                  <button
                    onClick={() => onBatchRandomizeDedupAllGroups(allowBatchMirror)}
                    className="w-full py-2 rounded-lg bg-gradient-to-r from-[#FFB800] to-[#FF9500] text-[#111318] font-bold text-xs flex items-center justify-center gap-1.5 hover:brightness-110 transition whitespace-nowrap"
                  >
                    <Zap className="w-3.5 h-3.5 fill-current shrink-0" />
                    一键为全部视频组分配差异化防重参数
                  </button>
                </div>
              </div>
            </div>
          );
        })()}
      </div>
    </div>
  );
};
