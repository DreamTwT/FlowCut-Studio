import React, { useRef, useState } from 'react';
import {
  CloudLightning,
  CopyCheck,
  Cpu,
  Download,
  FlipHorizontal2,
  Image as ImageIcon,
  KeyRound,
  Loader2,
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
  BeatDensityMode,
  BeatSyncStrategy,
  buildDedupFromPreset,
  buildSyncedSubtitlesFromScript,
  createDefaultDedupConfig,
  createDefaultSfxConfig,
  createDefaultSubtitleConfig,
  createDefaultWatermarkConfig,
  DEDUP_PRESETS,
  DedupConfig,
  DedupPresetId,
  DURATION_ALIGN_MODES,
  DurationAlignMode,
  exportCuesToSrt,
  FIT_MODE_LABELS,
  FitMode,
  getGroupTotalDuration,
  GroupOverlayConfig,
  GroupSfxConfig,
  MediaAsset,
  MOTION_MATRIX_STRATEGIES,
  MOTION_PRESET_LABELS,
  MotionMatrixStrategy,
  MotionPresetId,
  PictureInPictureConfig,
  SFX_PRESETS,
  SfxPresetId,
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
import { playBuiltinSfxPreview } from '../utils/motionAndSfx';
import { CustomSelect } from './CustomSelect';
import { PictureInPicturePanel } from './PictureInPicturePanel';

interface Props {
  activeGroup: VideoGroup | null;
  selectedClip: TimelineClip | null;
  selectedClipAsset: MediaAsset | null;
  audioAssets: MediaAsset[];
  imageAssets: MediaAsset[];
  visualAssets: MediaAsset[];
  onUpdatePictureInPicture: (groupId: string, next: PictureInPictureConfig) => void;
  onSyncPictureInPictureAllGroups: (value: PictureInPictureConfig) => void;
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
  onBatchRandomizeDedupAllGroups: (
    allowMirror: boolean,
    preset: Exclude<DedupPresetId, 'custom'>
  ) => void;
  onUpdateGroupAudio: (
    groupId: string,
    patch: Partial<VideoGroup>
  ) => void;
  onSyncAudioAllGroups: (source: VideoGroup) => void;
  onOpenAudioEditor: (asset: MediaAsset) => void;
  onOpenTtsStudio: (initialTab?: 'ai_script' | 'tts' | 'settings') => void;
  asrState?: { running: boolean; text: string; pct: number } | null;
  onRunGroupAsr?: (
    groupId: string,
    mode: 'cloud' | 'local_wasm',
    sourceTrack: 'auto' | 'voiceover' | 'video_clips'
  ) => void;
  onAlignGroupDuration?: (groupId: string, mode: DurationAlignMode, applyAll: boolean) => void;
  beatSyncBusy?: boolean;
  lastBeatInfo?: { bpm: number; beatCount: number } | null;
  onBeatSyncGroup?: (
    groupId: string,
    density: BeatDensityMode,
    strategy: BeatSyncStrategy,
    applyAll: boolean
  ) => void;
  onSmartMotionGroup?: (
    groupId: string,
    strategy: MotionMatrixStrategy,
    applyAll: boolean
  ) => void;
}

export const InspectorPanel: React.FC<Props> = ({
  activeGroup,
  selectedClip,
  selectedClipAsset,
  audioAssets,
  imageAssets,
  visualAssets,
  onUpdatePictureInPicture,
  onSyncPictureInPictureAllGroups,
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
  asrState = null,
  onRunGroupAsr,
  onAlignGroupDuration,
  beatSyncBusy = false,
  lastBeatInfo = null,
  onBeatSyncGroup,
  onSmartMotionGroup,
}) => {
  const [motionStrategy, setMotionStrategy] = useState<MotionMatrixStrategy>('smart_alternating');
  const [tab, setTab] = useState<'clip' | 'overlay' | 'audio' | 'brand_dedup'>('overlay');
  const [textSubTab, setTextSubTab] = useState<'subtitles' | 'stickers'>('subtitles');
  const [customSubScript, setCustomSubScript] = useState('');
  const [asrSourceTrack, setAsrSourceTrack] = useState<'auto' | 'voiceover' | 'video_clips'>(
    'auto'
  );
  const [alignMode, setAlignMode] = useState<DurationAlignMode>('hybrid_smart');
  const [beatDensity, setBeatDensity] = useState<BeatDensityMode>('standard');
  const [beatStrategy, setBeatStrategy] = useState<BeatSyncStrategy>('trim_first');
  const [protectTextNoMirror, setProtectTextNoMirror] = useState(true);
  const [batchDedupPreset, setBatchDedupPreset] =
    useState<Exclude<DedupPresetId, 'custom'>>('standard');
  const [showAdvancedDedup, setShowAdvancedDedup] = useState(false);
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

                {/* Dynamic Camera Motion (Ken Burns / Hook Punch) */}
                <div className="p-2.5 rounded-xl bg-[#181C28] border border-[#27304A] space-y-2">
                  <div className="flex items-center justify-between gap-1">
                    <label className="text-xs font-semibold text-[#00E5FF] flex items-center gap-1">
                      <Sparkles className="w-3.5 h-3.5 shrink-0" />
                      动态运镜预设
                    </label>
                    <span className="text-[10px] text-[#94A3B8]">图片/视频通用</span>
                  </div>

                  <CustomSelect<MotionPresetId>
                    value={selectedClip.motion || 'none'}
                    options={(Object.keys(MOTION_PRESET_LABELS) as MotionPresetId[]).map((mId) => ({
                      value: mId,
                      label: MOTION_PRESET_LABELS[mId].label,
                      rightMeta: MOTION_PRESET_LABELS[mId].badge,
                      metaTone: mId === 'none' ? 'muted' : 'cyan',
                    }))}
                    onChange={(val) =>
                      onUpdateClip(activeGroup.id, selectedClip.id, {
                        motion: val,
                      })
                    }
                  />

                  {onSmartMotionGroup && (
                    <div className="pt-1 border-t border-[#252D44] space-y-1.5">
                      <CustomSelect<MotionMatrixStrategy>
                        size="sm"
                        value={motionStrategy}
                        options={MOTION_MATRIX_STRATEGIES.filter((s) => s.id !== 'none').map((s) => ({
                          value: s.id,
                          label: `批量策略：${s.label}`,
                        }))}
                        onChange={(val) => setMotionStrategy(val)}
                      />
                      <div className="grid grid-cols-2 gap-1.5">
                        <button
                          type="button"
                          onClick={() => onSmartMotionGroup(activeGroup.id, motionStrategy, false)}
                          className="h-8 px-2 rounded-lg bg-[#00E5FF]/15 hover:bg-[#00E5FF]/25 border border-[#00E5FF]/35 text-[#00E5FF] font-semibold text-[11px] whitespace-nowrap flex items-center justify-center gap-1 transition"
                        >
                          <Wand2 className="w-3 h-3 shrink-0" />
                          智能编排本组
                        </button>
                        <button
                          type="button"
                          onClick={() => onSmartMotionGroup(activeGroup.id, motionStrategy, true)}
                          className="h-8 px-2 rounded-lg bg-[#22283A] hover:bg-[#2C344D] border border-[#343E5C] text-[#CBD5E1] font-semibold text-[11px] whitespace-nowrap flex items-center justify-center gap-1 transition"
                        >
                          同步全部成片组
                        </button>
                      </div>
                    </div>
                  )}
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
                        onClick={() => onOpenTtsStudio('ai_script')}
                        className="w-full py-1.5 px-2.5 rounded-lg bg-[#241E38] hover:bg-[#31294D] border border-purple-400/40 text-purple-200 font-semibold text-[11px] flex items-center justify-center gap-1.5 transition whitespace-nowrap"
                      >
                        <Sparkles className="w-3.5 h-3.5 text-[#00E5FF] shrink-0" />
                        AI 脚本裂变 / 配音并自动挂同步字幕
                      </button>
                    )}

                    {/* Dual-Mode Real Speech-to-Subtitle (ASR + 16kHz VAD Alignment) */}
                    {onRunGroupAsr && (
                      <div className="p-2 rounded-lg bg-[#11141E] border border-[#2A334D] space-y-2">
                        <div className="flex items-center justify-between gap-1">
                          <span className="text-[11px] font-bold text-[#00E5FF] flex items-center gap-1">
                            <Mic className="w-3 h-3 shrink-0" />
                            原声语音识别转字幕 (16kHz 开口对轴)
                          </span>
                          <button
                            type="button"
                            onClick={() => onOpenTtsStudio('settings')}
                            title="配置硅基流动免费 SenseVoice / Whisper API Key 或离线模型规格"
                            className="p-1 rounded hover:bg-[#232A3E] text-[#9CA3AF] hover:text-[#00E5FF] transition"
                          >
                            <KeyRound className="w-3 h-3" />
                          </button>
                        </div>

                        <CustomSelect<'auto' | 'voiceover' | 'video_clips'>
                          size="sm"
                          value={asrSourceTrack}
                          options={[
                            {
                              value: 'auto',
                              label: '智能音轨 (有配音识配音，无配音识原片)',
                            },
                            {
                              value: 'video_clips',
                              label: '仅识别本组视频片段真人原声',
                            },
                            {
                              value: 'voiceover',
                              label: '仅识别本组外录/挂载口播配音轨',
                            },
                          ]}
                          onChange={(v) => setAsrSourceTrack(v)}
                          menuMinWidth={240}
                          className="w-full"
                        />

                        {asrState?.running ? (
                          <div className="space-y-1.5 py-0.5">
                            <div className="flex items-center justify-between text-[10px] text-[#00E5FF]">
                              <span className="flex items-center gap-1 truncate">
                                <Loader2 className="w-3 h-3 animate-spin shrink-0" />
                                <span className="truncate">{asrState.text}</span>
                              </span>
                              <span className="font-mono shrink-0">{asrState.pct}%</span>
                            </div>
                            <div className="h-1.5 rounded-full bg-[#1C2132] overflow-hidden">
                              <div
                                className="h-full bg-gradient-to-r from-[#00E5FF] to-[#10B981] transition-all duration-300"
                                style={{ width: `${Math.max(5, asrState.pct)}%` }}
                              />
                            </div>
                          </div>
                        ) : (
                          <div className="grid grid-cols-2 gap-1.5">
                            <button
                              type="button"
                              onClick={() =>
                                onRunGroupAsr(activeGroup.id, 'cloud', asrSourceTrack)
                              }
                              title="调用云端 SenseVoiceSmall / Whisper 极速识别（硅基流动免费额度1秒出字）"
                              className="h-8 px-2 rounded-lg bg-[#00E5FF]/15 hover:bg-[#00E5FF] border border-[#00E5FF]/40 text-[#00E5FF] hover:text-[#071016] font-bold text-[11px] whitespace-nowrap flex items-center justify-center gap-1 transition"
                            >
                              <CloudLightning className="w-3 h-3 shrink-0" />
                              云端极速识别
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                onRunGroupAsr(activeGroup.id, 'local_wasm', asrSourceTrack)
                              }
                              title="使用本机 WebAssembly 离线 Whisper 模型识别（完全免API Key，首次使用自动缓存模型）"
                              className="h-8 px-2 rounded-lg bg-[#22283C] hover:bg-[#FFB800] border border-[#343D58] text-[#E2E8F0] hover:text-[#111318] font-bold text-[11px] whitespace-nowrap flex items-center justify-center gap-1 transition"
                            >
                              <Cpu className="w-3 h-3 shrink-0" />
                              本地免Key识别
                            </button>
                          </div>
                        )}
                      </div>
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
                    onClick={() => onOpenTtsStudio('tts')}
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

                    {/* Smart Audio-Video Duration Auto-Align Block */}
                    {onAlignGroupDuration && activeGroup.clips.length > 0 && (() => {
                      const vidDur = getGroupTotalDuration(activeGroup);
                      const voStart =
                        activeGroup.voiceoverTrimStart ?? activeVoAsset.defaultTrimStart ?? 0;
                      const voEnd = Math.max(
                        voStart + 0.1,
                        activeGroup.voiceoverTrimEnd ||
                          activeVoAsset.defaultTrimEnd ||
                          activeVoAsset.duration
                      );
                      const voSpd =
                        activeGroup.voiceoverSpeed || activeVoAsset.defaultSpeed || 1;
                      const voTotal =
                        (activeGroup.voiceoverDelaySec || 0) + (voEnd - voStart) / voSpd;
                      const diff = vidDur - (voTotal + 0.2);

                      return (
                        <div className="mt-2 pt-2.5 border-t border-[#2D334A] space-y-2">
                          <div className="flex items-center justify-between gap-1 text-[11px]">
                            <span className="font-bold text-white flex items-center gap-1">
                              <Sparkles className="w-3 h-3 text-[#FFB800]" />
                              音画时长自动对齐
                            </span>
                            <span
                              className={`font-mono text-[10px] ${
                                Math.abs(diff) > 0.55 ? 'text-rose-300' : 'text-emerald-300'
                              }`}
                            >
                              画面 {vidDur.toFixed(1)}s / 口播 {voTotal.toFixed(1)}s
                            </span>
                          </div>

                          <CustomSelect<DurationAlignMode>
                            size="sm"
                            accent="amber"
                            value={alignMode}
                            options={(Object.keys(DURATION_ALIGN_MODES) as DurationAlignMode[]).map(
                              (k) => ({
                                value: k,
                                label: DURATION_ALIGN_MODES[k].label,
                                rightMeta: DURATION_ALIGN_MODES[k].badge,
                                metaTone: k === 'hybrid_smart' ? 'emerald' : 'amber',
                              })
                            )}
                            onChange={(m) => setAlignMode(m)}
                            menuMinWidth={270}
                            className="w-full"
                          />

                          <div className="grid grid-cols-2 gap-1.5">
                            <button
                              type="button"
                              onClick={() =>
                                onAlignGroupDuration(activeGroup.id, alignMode, false)
                              }
                              className="h-8 px-2 rounded-lg bg-[#FFB800] text-[#111318] font-bold text-[11px] whitespace-nowrap flex items-center justify-center gap-1 hover:brightness-110 transition"
                            >
                              <Zap className="w-3 h-3 shrink-0" />
                              对齐本组时长
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                onAlignGroupDuration(activeGroup.id, alignMode, true)
                              }
                              className="h-8 px-2 rounded-lg bg-[#23293E] hover:bg-[#2E3650] border border-[#384262] text-[#FFB800] font-semibold text-[11px] whitespace-nowrap flex items-center justify-center gap-1 transition"
                            >
                              全组批量对齐
                            </button>
                          </div>
                        </div>
                      );
                    })()}
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

                    {/* BGM Drum Beat Auto-Cut Sync Block */}
                    {onBeatSyncGroup && activeGroup.clips.length > 0 && (
                      <div className="mt-2 pt-2.5 border-t border-[#2A324B] space-y-2">
                        <div className="flex items-center justify-between gap-1 text-[11px]">
                          <span className="font-bold text-[#00E5FF] flex items-center gap-1">
                            <Music className="w-3 h-3 shrink-0" />
                            音乐鼓点自动卡点切画面
                          </span>
                          {lastBeatInfo && (
                            <span className="px-1.5 py-0.5 rounded bg-[#00E5FF]/14 text-[#00E5FF] font-mono text-[10px]">
                              {lastBeatInfo.bpm} BPM · {lastBeatInfo.beatCount}拍
                            </span>
                          )}
                        </div>

                        <div className="grid grid-cols-2 gap-1.5">
                          <CustomSelect<BeatDensityMode>
                            size="sm"
                            value={beatDensity}
                            options={[
                              {
                                value: 'dense',
                                label: '🔥 密集快剪踩点',
                                rightMeta: '~1.2s/刀',
                                metaTone: 'amber',
                              },
                              {
                                value: 'standard',
                                label: '⚡ 标准节拍卡点',
                                rightMeta: '~2.0s/刀',
                                metaTone: 'emerald',
                              },
                              {
                                value: 'relaxed',
                                label: '🌊 舒缓重拍卡点',
                                rightMeta: '~3.2s/刀',
                                metaTone: 'cyan',
                              },
                            ]}
                            onChange={(d) => setBeatDensity(d)}
                            menuMinWidth={210}
                          />

                          <CustomSelect<BeatSyncStrategy>
                            size="sm"
                            value={beatStrategy}
                            options={[
                              {
                                value: 'trim_first',
                                label: '优先裁剪时长踩点',
                                rightMeta: '1x自然',
                                metaTone: 'emerald',
                              },
                              {
                                value: 'speed_fit',
                                label: '保持动作变速踩点',
                                rightMeta: '自动变速',
                                metaTone: 'cyan',
                              },
                            ]}
                            onChange={(s) => setBeatStrategy(s)}
                            menuMinWidth={210}
                          />
                        </div>

                        <div className="grid grid-cols-2 gap-1.5">
                          <button
                            type="button"
                            disabled={beatSyncBusy}
                            onClick={() =>
                              onBeatSyncGroup(
                                activeGroup.id,
                                beatDensity,
                                beatStrategy,
                                false
                              )
                            }
                            className="h-8 px-2 rounded-lg bg-[#00E5FF] text-[#071016] font-bold text-[11px] whitespace-nowrap flex items-center justify-center gap-1 hover:brightness-110 transition disabled:opacity-50"
                          >
                            {beatSyncBusy ? (
                              <Loader2 className="w-3 h-3 animate-spin shrink-0" />
                            ) : (
                              <Zap className="w-3 h-3 shrink-0" />
                            )}
                            本组按鼓点卡点
                          </button>

                          <button
                            type="button"
                            disabled={beatSyncBusy}
                            onClick={() =>
                              onBeatSyncGroup(
                                activeGroup.id,
                                beatDensity,
                                beatStrategy,
                                true
                              )
                            }
                            className="h-8 px-2 rounded-lg bg-[#21273B] hover:bg-[#2C344F] border border-[#35405E] text-[#00E5FF] font-semibold text-[11px] whitespace-nowrap flex items-center justify-center gap-1 transition disabled:opacity-50"
                          >
                            全部组批量卡点
                          </button>
                        </div>
                      </div>
                    )}
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

              {/* 4. Viral Ad SFX Pack (Opening Hook / Transitions / Closing CTA) */}
              {(() => {
                const sfxCfg: GroupSfxConfig = activeGroup.sfx || {
                  ...createDefaultSfxConfig(),
                };
                const patchSfx = (patch: Partial<GroupSfxConfig>) => {
                  onUpdateGroupAudio(activeGroup.id, {
                    sfx: {
                      ...sfxCfg,
                      ...patch,
                    },
                  });
                };
                const sfxOptions = [
                  { value: 'none' as const, label: '无音效', rightMeta: '', metaTone: 'muted' as const },
                  ...Object.values(SFX_PRESETS).map((p) => ({
                    value: p.id,
                    label: p.name,
                    rightMeta: p.badge,
                    metaTone: 'amber' as const,
                  })),
                ];

                return (
                  <div className="p-3 rounded-xl bg-[#1A1826] border border-fuchsia-500/25 space-y-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <label className="flex items-center gap-1.5 text-xs font-bold text-fuchsia-300 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={sfxCfg.enabled}
                          onChange={(e) => {
                            const nextOn = e.target.checked;
                            if (
                              nextOn &&
                              sfxCfg.hookSfxId === 'none' &&
                              sfxCfg.transitionSfxId === 'none' &&
                              sfxCfg.ctaSfxId === 'none'
                            ) {
                              onUpdateGroupAudio(activeGroup.id, {
                                sfx: { ...createDefaultSfxConfig(), enabled: true },
                              });
                            } else {
                              patchSfx({ enabled: nextOn });
                            }
                          }}
                          className="accent-fuchsia-400"
                        />
                        <span>💥 爆款网感音效包</span>
                      </label>

                      <button
                        type="button"
                        onClick={() => {
                          const preset = { ...createDefaultSfxConfig(), enabled: true };
                          onUpdateGroupAudio(activeGroup.id, { sfx: preset });
                          playBuiltinSfxPreview(preset.hookSfxId, preset.volume);
                        }}
                        className="h-7 px-2 rounded-md bg-fuchsia-500/15 hover:bg-fuchsia-500/25 border border-fuchsia-400/30 text-fuchsia-300 text-[10px] font-semibold whitespace-nowrap transition"
                      >
                        一键带货音效
                      </button>
                    </div>

                    {sfxCfg.enabled ? (
                      <div className="space-y-2 pt-0.5">
                        {/* Opening Hook SFX */}
                        <div className="space-y-1">
                          <span className="text-[11px] text-[#CBD5E1] font-medium block">
                            开场黄金3秒钩子音效
                          </span>
                          <div className="flex items-center gap-1.5">
                            <CustomSelect<SfxPresetId>
                              size="sm"
                              accent="amber"
                              value={sfxCfg.hookSfxId}
                              options={sfxOptions}
                              onChange={(val) => {
                                patchSfx({ hookSfxId: val });
                                if (val !== 'none') playBuiltinSfxPreview(val, sfxCfg.volume);
                              }}
                              className="flex-1 min-w-0"
                            />
                            <button
                              type="button"
                              disabled={sfxCfg.hookSfxId === 'none'}
                              onClick={() =>
                                playBuiltinSfxPreview(sfxCfg.hookSfxId, sfxCfg.volume)
                              }
                              title="试听开场音效"
                              className="h-8 px-2 rounded-lg bg-[#252238] hover:bg-fuchsia-500/25 border border-[#383254] text-fuchsia-300 text-[11px] whitespace-nowrap flex items-center gap-1 shrink-0 disabled:opacity-40 transition"
                            >
                              <Volume2 className="w-3.5 h-3.5" />
                              试听
                            </button>
                          </div>
                        </div>

                        {/* Clip Cut Transition SFX */}
                        <div className="space-y-1">
                          <span className="text-[11px] text-[#CBD5E1] font-medium block">
                            分镜切点转场音效（自动对齐切镜）
                          </span>
                          <div className="flex items-center gap-1.5">
                            <CustomSelect<SfxPresetId>
                              size="sm"
                              accent="amber"
                              value={sfxCfg.transitionSfxId}
                              options={sfxOptions}
                              onChange={(val) => {
                                patchSfx({ transitionSfxId: val });
                                if (val !== 'none') playBuiltinSfxPreview(val, sfxCfg.volume);
                              }}
                              className="flex-1 min-w-0"
                            />
                            <button
                              type="button"
                              disabled={sfxCfg.transitionSfxId === 'none'}
                              onClick={() =>
                                playBuiltinSfxPreview(sfxCfg.transitionSfxId, sfxCfg.volume)
                              }
                              title="试听转场音效"
                              className="h-8 px-2 rounded-lg bg-[#252238] hover:bg-fuchsia-500/25 border border-[#383254] text-fuchsia-300 text-[11px] whitespace-nowrap flex items-center gap-1 shrink-0 disabled:opacity-40 transition"
                            >
                              <Volume2 className="w-3.5 h-3.5" />
                              试听
                            </button>
                          </div>
                        </div>

                        {/* Closing CTA SFX */}
                        <div className="space-y-1">
                          <span className="text-[11px] text-[#CBD5E1] font-medium block">
                            结尾转化促单音效（最后一段触发）
                          </span>
                          <div className="flex items-center gap-1.5">
                            <CustomSelect<SfxPresetId>
                              size="sm"
                              accent="amber"
                              value={sfxCfg.ctaSfxId}
                              options={sfxOptions}
                              onChange={(val) => {
                                patchSfx({ ctaSfxId: val });
                                if (val !== 'none') playBuiltinSfxPreview(val, sfxCfg.volume);
                              }}
                              className="flex-1 min-w-0"
                            />
                            <button
                              type="button"
                              disabled={sfxCfg.ctaSfxId === 'none'}
                              onClick={() =>
                                playBuiltinSfxPreview(sfxCfg.ctaSfxId, sfxCfg.volume)
                              }
                              title="试听结尾音效"
                              className="h-8 px-2 rounded-lg bg-[#252238] hover:bg-fuchsia-500/25 border border-[#383254] text-fuchsia-300 text-[11px] whitespace-nowrap flex items-center gap-1 shrink-0 disabled:opacity-40 transition"
                            >
                              <Volume2 className="w-3.5 h-3.5" />
                              试听
                            </button>
                          </div>
                        </div>

                        {/* SFX Volume */}
                        <div className="pt-1">
                          <div className="flex justify-between text-[11px] text-[#B8C0D0]">
                            <span>网感音效混音音量</span>
                            <span className="font-mono text-fuchsia-300">
                              {Math.round((sfxCfg.volume ?? 0.65) * 100)}%
                            </span>
                          </div>
                          <input
                            type="range"
                            min={0.1}
                            max={1.3}
                            step={0.05}
                            value={sfxCfg.volume ?? 0.65}
                            onChange={(e) => patchSfx({ volume: parseFloat(e.target.value) })}
                            className="w-full accent-fuchsia-400"
                          />
                        </div>
                      </div>
                    ) : (
                      <p className="text-[11px] text-[#8E96AA] leading-relaxed">
                        开启后自动在开场钩子、分镜切点与结尾转化处混入无版权高网感音效（支持预览与导出）。
                      </p>
                    )}
                  </div>
                );
              })()}

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
              <PictureInPicturePanel value={activeGroup.pip} assets={visualAssets}
                onChange={next => onUpdatePictureInPicture(activeGroup.id, next)}
                onSync={onSyncPictureInPictureAllGroups} />
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

              {/* 2. 4D Deep Anti-Duplicate Engine v2.1 (四维过审级深度防重引擎) */}
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
                    <span>四维过审防重引擎 v2.1</span>
                  </label>
                  <span className="px-1.5 py-0.5 rounded bg-[#FFB800]/15 text-[#FFB800] text-[10px] font-semibold">
                    不伤花字/字幕
                  </span>
                </div>

                {/* 3-Tier Quick Strategy Presets */}
                <div className="space-y-1">
                  <div className="text-[10px] text-[#9CA3AF] flex items-center justify-between">
                    <span>一键切换防重强度预设</span>
                    <span>
                      {dedup.preset && dedup.preset !== 'custom'
                        ? DEDUP_PRESETS[dedup.preset].badge
                        : '自定义微调'}
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-1">
                    {(
                      [
                        { id: 'light', dot: '🟢', short: '轻度自然' },
                        { id: 'standard', dot: '🟡', short: '标准投流' },
                        { id: 'strong', dot: '🔴', short: '强力过审' },
                      ] as const
                    ).map((p) => {
                      const active = dedup.enabled && dedup.preset === p.id;
                      return (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => {
                            setBatchDedupPreset(p.id);
                            onUpdateDedup(
                              activeGroup.id,
                              buildDedupFromPreset(p.id, 0, !protectTextNoMirror)
                            );
                          }}
                          title={DEDUP_PRESETS[p.id].desc}
                          className={`py-1.5 px-1.5 rounded-lg border text-[11px] font-semibold transition flex items-center justify-center gap-1 whitespace-nowrap ${
                            active
                              ? 'bg-[#FFB800]/20 border-[#FFB800] text-[#FFB800]'
                              : 'bg-[#12141D] border-[#262B3D] text-[#B8C0D0] hover:text-white'
                          }`}
                        >
                          <span>{p.dot}</span>
                          <span>{p.short}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Core Quick Summary + Collapsible 4D Fine-Tune */}
                <div className="space-y-2 text-[11px]">
                  <label className="flex items-center justify-between gap-2 p-2 rounded-lg bg-[#11131B] border border-[#262B3D] cursor-pointer">
                    <span className="flex items-center gap-1.5 text-[#E5E7EB]">
                      <FlipHorizontal2 className="w-3.5 h-3.5 text-[#FFB800] shrink-0" />
                      <span>底层画面水平镜像 (不翻转花字/字幕/LOGO)</span>
                    </span>
                    <input
                      type="checkbox"
                      checked={dedup.mirrorFlip}
                      onChange={(e) =>
                        onUpdateDedup(activeGroup.id, {
                          ...dedup,
                          enabled: true,
                          preset: 'custom',
                          mirrorFlip: e.target.checked,
                        })
                      }
                      className="accent-[#FFB800]"
                    />
                  </label>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <div className="flex justify-between text-[#B8C0D0]">
                        <span>微缩放裁边</span>
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
                            preset: 'custom',
                            zoomPunchPct: parseFloat(e.target.value),
                          })
                        }
                        className="w-full accent-[#FFB800]"
                      />
                    </div>

                    <div>
                      <div className="flex justify-between text-[#B8C0D0]" title="在花字与动态字幕烧录完成后同倍率作用于音视频，保证口播与字幕100%对齐！">
                        <span>音字同步微变速</span>
                        <span className="font-mono text-[#00E5FF]">
                          {(dedup.speedJitterPct || 0) >= 0 ? '+' : ''}
                          {(dedup.speedJitterPct || 0).toFixed(1)}%
                        </span>
                      </div>
                      <input
                        type="range"
                        min={-3.0}
                        max={3.5}
                        step={0.5}
                        value={dedup.speedJitterPct || 0}
                        onChange={(e) =>
                          onUpdateDedup(activeGroup.id, {
                            ...dedup,
                            enabled: true,
                            preset: 'custom',
                            speedJitterPct: parseFloat(e.target.value),
                          })
                        }
                        className="w-full accent-[#00E5FF]"
                      />
                    </div>
                  </div>

                  {/* 4D Checkboxes: Audio Chromaprint + Metadata Scrub + Random GOP */}
                  <div className="p-2 rounded-lg bg-[#11131B] border border-[#24293B] space-y-1.5 text-[11px]">
                    <label className="flex items-center justify-between cursor-pointer text-[#E5E7EB]">
                      <span>🎵 音频声纹无感微均衡去重 (防同款BGM撞库)</span>
                      <input
                        type="checkbox"
                        checked={dedup.audioFingerprint !== false}
                        onChange={(e) =>
                          onUpdateDedup(activeGroup.id, {
                            ...dedup,
                            enabled: true,
                            audioFingerprint: e.target.checked,
                          })
                        }
                        className="accent-[#FFB800]"
                      />
                    </label>
                    <label className="flex items-center justify-between cursor-pointer text-[#E5E7EB]">
                      <span>🧹 MP4 容器清洗 + 随机自然拍摄时间戳伪装</span>
                      <input
                        type="checkbox"
                        checked={dedup.scrubMetadata !== false}
                        onChange={(e) =>
                          onUpdateDedup(activeGroup.id, {
                            ...dedup,
                            enabled: true,
                            scrubMetadata: e.target.checked,
                          })
                        }
                        className="accent-[#FFB800]"
                      />
                    </label>
                    <label className="flex items-center justify-between cursor-pointer text-[#E5E7EB]">
                      <span>⏱️ 随机 GOP 关键帧间距 (错开平台抽检I帧)</span>
                      <input
                        type="checkbox"
                        checked={dedup.randomGop !== false}
                        onChange={(e) =>
                          onUpdateDedup(activeGroup.id, {
                            ...dedup,
                            enabled: true,
                            randomGop: e.target.checked,
                          })
                        }
                        className="accent-[#FFB800]"
                      />
                    </label>
                  </div>

                  {/* Expandable Advanced Spatial Controls */}
                  <button
                    type="button"
                    onClick={() => setShowAdvancedDedup((s) => !s)}
                    className="w-full py-1 rounded bg-[#141722] hover:bg-[#1E2334] border border-[#262C40] text-[10px] text-[#9CA3AF] hover:text-white flex items-center justify-center gap-1 transition"
                  >
                    <Sliders className="w-3 h-3 text-[#FFB800]" />
                    {showAdvancedDedup
                      ? '收起高阶像素/颗粒/旋转精调'
                      : '展开高阶像素/胶片微颗粒/微旋转精调'}
                  </button>

                  {showAdvancedDedup && (
                    <div className="p-2 rounded-lg bg-[#11131B] border border-[#262B3D] space-y-2">
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <div className="flex justify-between text-[10px] text-[#9CA3AF]">
                            <span>时变胶片微颗粒</span>
                            <span className="font-mono text-[#FFB800]">
                              Lv.{dedup.temporalGrain || 0}
                            </span>
                          </div>
                          <input
                            type="range"
                            min={0}
                            max={6}
                            step={1}
                            value={dedup.temporalGrain || 0}
                            onChange={(e) =>
                              onUpdateDedup(activeGroup.id, {
                                ...dedup,
                                enabled: true,
                                preset: 'custom',
                                temporalGrain: parseInt(e.target.value, 10),
                              })
                            }
                            className="w-full accent-[#FFB800]"
                          />
                        </div>
                        <div>
                          <div className="flex justify-between text-[10px] text-[#9CA3AF]">
                            <span>隐形微旋转(自动扩边)</span>
                            <span className="font-mono text-[#FFB800]">
                              {(dedup.rotateDeg || 0) >= 0 ? '+' : ''}
                              {(dedup.rotateDeg || 0).toFixed(1)}°
                            </span>
                          </div>
                          <input
                            type="range"
                            min={-1.2}
                            max={1.2}
                            step={0.2}
                            value={dedup.rotateDeg || 0}
                            onChange={(e) =>
                              onUpdateDedup(activeGroup.id, {
                                ...dedup,
                                enabled: true,
                                preset: 'custom',
                                rotateDeg: parseFloat(e.target.value),
                              })
                            }
                            className="w-full accent-[#FFB800]"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-4 gap-1.5">
                        <div>
                          <div className="flex justify-between text-[10px] text-[#9CA3AF]">
                            <span>亮度</span>
                            <span className="font-mono text-white">
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
                                preset: 'custom',
                                brightness: parseFloat(e.target.value),
                              })
                            }
                            className="w-full accent-[#FFB800]"
                          />
                        </div>
                        <div>
                          <div className="flex justify-between text-[10px] text-[#9CA3AF]">
                            <span>对比</span>
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
                                preset: 'custom',
                                contrast: parseFloat(e.target.value),
                              })
                            }
                            className="w-full accent-[#FFB800]"
                          />
                        </div>
                        <div>
                          <div className="flex justify-between text-[10px] text-[#9CA3AF]">
                            <span>饱和</span>
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
                                preset: 'custom',
                                saturation: parseFloat(e.target.value),
                              })
                            }
                            className="w-full accent-[#FFB800]"
                          />
                        </div>
                        <div>
                          <div className="flex justify-between text-[10px] text-[#9CA3AF]">
                            <span>色相</span>
                            <span className="font-mono text-white">
                              {(dedup.hueDeg || 0).toFixed(0)}°
                            </span>
                          </div>
                          <input
                            type="range"
                            min={-5}
                            max={5}
                            step={0.5}
                            value={dedup.hueDeg || 0}
                            onChange={(e) =>
                              onUpdateDedup(activeGroup.id, {
                                ...dedup,
                                enabled: true,
                                preset: 'custom',
                                hueDeg: parseFloat(e.target.value),
                              })
                            }
                            className="w-full accent-[#FFB800]"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2 pt-0.5">
                        <label className="flex items-center gap-1.5 text-[10px] text-[#CBD5E1] cursor-pointer">
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
                          微锐化宏块重构
                        </label>
                        <label className="flex items-center gap-1.5 text-[10px] text-[#CBD5E1] cursor-pointer">
                          <input
                            type="checkbox"
                            checked={Boolean(dedup.vignette)}
                            onChange={(e) =>
                              onUpdateDedup(activeGroup.id, {
                                ...dedup,
                                enabled: true,
                                vignette: e.target.checked,
                              })
                            }
                            className="accent-[#FFB800]"
                          />
                          自然光学暗角
                        </label>
                      </div>
                    </div>
                  )}
                </div>

                {/* One-Click Batch Differentiated Anti-Duplicate Generator! */}
                <div className="pt-2 border-t border-[#2A3045] space-y-2">
                  <label className="flex items-center gap-1.5 text-[11px] text-[#E5E7EB] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={protectTextNoMirror}
                      onChange={(e) => setProtectTextNoMirror(e.target.checked)}
                      className="accent-[#00E5FF]"
                    />
                    <span>🔒 商品包装文字保护（禁止水平镜像，防止包装字翻反）</span>
                  </label>

                  <button
                    onClick={() =>
                      onBatchRandomizeDedupAllGroups(!protectTextNoMirror, batchDedupPreset)
                    }
                    className="w-full py-2 rounded-lg bg-gradient-to-r from-[#FFB800] to-[#FF9500] text-[#111318] font-bold text-xs flex items-center justify-center gap-1.5 hover:brightness-110 transition whitespace-nowrap"
                  >
                    <Zap className="w-3.5 h-3.5 fill-current shrink-0" />
                    一键按「{DEDUP_PRESETS[batchDedupPreset].label}」分配全组差异化指纹
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
