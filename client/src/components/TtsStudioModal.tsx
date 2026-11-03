import React, { useState } from 'react';
import {
  CheckCircle2,
  Loader2,
  Mic,
  Scissors,
  Sliders,
  Sparkles,
  Volume2,
  Wand2,
  X,
  Zap,
} from 'lucide-react';
import {
  BREATH_PRESETS,
  BreathPresetId,
  MediaAsset,
  ProjectData,
  TTS_VOICES,
  VideoGroup,
} from '@shared/schema';
import { BreathStatsDto, synthesizeTtsApi } from '../api';
import { formatShortSec } from '../utils/format';

interface Props {
  project: ProjectData;
  activeGroup: VideoGroup | null;
  defaultAssignMode?: 'library_only' | 'active_group' | 'dispatch_groups' | 'matrix_pool';
  onClose: () => void;
  onProjectUpdated: (
    updatedProject: ProjectData,
    createdAssets: MediaAsset[],
    toastMsg: string
  ) => void;
  onOpenAudioEditor: (asset: MediaAsset) => void;
}

const SAMPLE_SCRIPTS = [
  {
    label: '痛点种草模板',
    text: '早八打工人赶时间？试试这款四秒碎冰随行榨汁杯！两万两千转暴风动力，细腻无渣免过滤。放进包包说走就走，点击下方小黄车抢限时买一送一！',
  },
  {
    label: '硬核测评模板',
    text: '实测三零四六叶精钢刀头，冰块硬果秒碎不卡机！双击直接开启龙卷风自动水洗，再也不用抠刀头洗杯子了。今天源头直供立减一半，闭眼入不踩雷！',
  },
  {
    label: '大促逼单模板',
    text: '别再买贵了！同款随行榨汁杯今天工厂清仓直发，买一杯直接发两杯，还送运费险和吸管盖！库存只剩最后八十单，刷到赶紧点下方链接锁单！',
  },
];

export const TtsStudioModal: React.FC<Props> = ({
  project,
  activeGroup,
  defaultAssignMode = 'active_group',
  onClose,
  onProjectUpdated,
  onOpenAudioEditor,
}) => {
  const [scriptMode, setScriptMode] = useState<'single' | 'batch'>('single');
  const [singleText, setSingleText] = useState<string>(SAMPLE_SCRIPTS[0].text);
  const [batchText, setBatchText] = useState<string>(
    `${SAMPLE_SCRIPTS[0].text}\n\n${SAMPLE_SCRIPTS[1].text}\n\n${SAMPLE_SCRIPTS[2].text}`
  );
  const [titleName, setTitleName] = useState('');

  const [voiceId, setVoiceId] = useState<string>(TTS_VOICES[0].id);
  const [ratePct, setRatePct] = useState<number>(8);
  const [pitchHz, setPitchHz] = useState<number>(0);

  // Smart Breath Removal Settings
  const [removeBreath, setRemoveBreath] = useState<boolean>(true);
  const [breathPreset, setBreathPreset] = useState<BreathPresetId>('standard');
  const [thresholdDb, setThresholdDb] = useState<number>(BREATH_PRESETS.standard.thresholdDb);
  const [minPauseSec, setMinPauseSec] = useState<number>(BREATH_PRESETS.standard.minPauseSec);
  const [keepGapSec, setKeepGapSec] = useState<number>(BREATH_PRESETS.standard.keepGapSec);
  const [showAdvBreath, setShowAdvBreath] = useState<boolean>(false);

  const [assignMode, setAssignMode] = useState<
    'library_only' | 'active_group' | 'dispatch_groups' | 'matrix_pool'
  >(defaultAssignMode);
  const [autoSubtitles, setAutoSubtitles] = useState<boolean>(true);

  const [generating, setGenerating] = useState(false);
  const [results, setResults] = useState<
    Array<{ asset: MediaAsset; stats?: BreathStatsDto }>
  >([]);

  const parsedBatchScripts = batchText
    .split(/\n\s*\n|^---+$/m)
    .map((s) => s.trim())
    .filter(Boolean);

  const selectPreset = (id: Exclude<BreathPresetId, 'custom'>) => {
    setBreathPreset(id);
    setThresholdDb(BREATH_PRESETS[id].thresholdDb);
    setMinPauseSec(BREATH_PRESETS[id].minPauseSec);
    setKeepGapSec(BREATH_PRESETS[id].keepGapSec);
  };

  const estDurationSec = (() => {
    const cleanLen = singleText.replace(/\s+/g, '').length;
    const rawSec = cleanLen / (4.3 * (1 + ratePct / 100));
    return removeBreath ? Math.max(0.5, rawSec * 0.84) : Math.max(0.5, rawSec);
  })();

  const handleGenerate = async () => {
    const scripts = scriptMode === 'single' ? [singleText.trim()] : parsedBatchScripts;
    if (scripts.length === 0 || !scripts[0]) {
      alert('请先输入口播文案内容');
      return;
    }

    setGenerating(true);
    try {
      const res = await synthesizeTtsApi(project, {
        scripts,
        voiceId,
        ratePct,
        pitchHz,
        titleName: scriptMode === 'single' ? titleName : undefined,
        removeBreath,
        breathOptions: {
          preset: breathPreset,
          thresholdDb,
          minPauseSec,
          keepGapSec,
        },
        assignMode,
        targetGroupId: activeGroup?.id,
        autoSubtitles,
      });

      const combined = res.assets.map((asset, i) => ({
        asset,
        stats: res.breathStats[i],
      }));
      setResults(combined);

      const savedTotal = res.breathStats.reduce((s, x) => s + (x?.savedSec || 0), 0);
      const cutTotal = res.breathStats.reduce((s, x) => s + (x?.cutCount || 0), 0);
      const msg = removeBreath
        ? `🎙️ 已生成 ${res.assets.length} 条配音并切除 ${cutTotal} 处气口（共缩短 ${savedTotal.toFixed(1)}s）`
        : `🎙️ 已成功生成 ${res.assets.length} 条 AI 语音配音`;

      onProjectUpdated(res.project, res.assets, msg);
    } catch (err: any) {
      alert(err?.message || '文字生成音频失败');
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 select-none">
      <div className="w-full max-w-5xl max-h-[92vh] rounded-2xl bg-[#151821] border border-[#2D3348] shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-5 py-3.5 bg-[#11131B] border-b border-[#252A3A] flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#00E5FF] to-[#7C3AED] flex items-center justify-center text-white shadow">
              <Mic className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white flex items-center gap-2">
                AI 文字转口播语音 & 智能去气口工作台
                <span className="px-2 py-0.5 rounded-full bg-[#00E5FF]/15 text-[#00E5FF] text-[10px] font-semibold">
                  神经网络真人音色 · 24kHz无损切除换气停顿
                </span>
              </h2>
              <p className="text-[11px] text-[#8A90A2]">
                支持单条精制或批量多话术裂变合成，自动切除句间拖沓空白与呼吸声，一键绑定成片组并开启 BGM 智能闪避
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

        {/* Main Body */}
        <div className="flex-1 min-h-0 overflow-y-auto p-5 grid grid-cols-1 lg:grid-cols-12 gap-5">
          {/* Left 7 Cols: Script Input + Voice Picker */}
          <div className="lg:col-span-7 space-y-4">
            {/* Single vs Batch Mode Switch */}
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center bg-[#0D0F15] p-0.5 rounded-lg border border-[#262B3D]">
                <button
                  onClick={() => {
                    setScriptMode('single');
                    if (assignMode === 'dispatch_groups' || assignMode === 'matrix_pool') {
                      setAssignMode('active_group');
                    }
                  }}
                  className={`px-3 py-1.5 rounded-md text-xs font-semibold whitespace-nowrap transition ${
                    scriptMode === 'single'
                      ? 'bg-[#252A3D] text-[#00E5FF]'
                      : 'text-[#8A90A2] hover:text-white'
                  }`}
                >
                  单条口播文案生成
                </button>
                <button
                  onClick={() => {
                    setScriptMode('batch');
                    setAssignMode('dispatch_groups');
                  }}
                  className={`px-3 py-1.5 rounded-md text-xs font-semibold whitespace-nowrap transition ${
                    scriptMode === 'batch'
                      ? 'bg-[#252A3D] text-[#FFB800]'
                      : 'text-[#8A90A2] hover:text-white'
                  }`}
                >
                  批量多话术裂变生成 ({parsedBatchScripts.length}条)
                </button>
              </div>

              {scriptMode === 'single' && (
                <div className="flex items-center gap-1 flex-wrap">
                  {activeGroup &&
                    (activeGroup.overlay.topTitle || activeGroup.overlay.bottomTitle) && (
                      <button
                        onClick={() => {
                          const merged = [
                            activeGroup.overlay.topTitle,
                            activeGroup.overlay.bottomTitle,
                          ]
                            .filter(Boolean)
                            .join('，');
                          setSingleText(merged);
                        }}
                        className="px-2 py-1 rounded bg-[#212638] hover:bg-[#2C334B] text-[11px] text-[#00E5FF] whitespace-nowrap transition"
                      >
                        带入当前组花字
                      </button>
                    )}
                  {SAMPLE_SCRIPTS.map((tpl) => (
                    <button
                      key={tpl.label}
                      onClick={() => setSingleText(tpl.text)}
                      className="px-2 py-1 rounded bg-[#1D2130] hover:bg-[#282E42] text-[11px] text-[#CBD5E1] whitespace-nowrap transition"
                    >
                      {tpl.label}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Textarea */}
            {scriptMode === 'single' ? (
              <div className="space-y-2">
                <textarea
                  rows={4}
                  value={singleText}
                  onChange={(e) => setSingleText(e.target.value)}
                  placeholder="在此输入信息流口播带货文案（标点符号处会产生自然停顿，开启下方「自动去气口」即可自动切紧凑）..."
                  className="w-full rounded-xl bg-[#0E1017] border border-[#2B3145] focus:border-[#00E5FF] p-3 text-xs text-white leading-relaxed outline-none resize-none"
                />
                <div className="flex items-center justify-between gap-2 text-[11px] text-[#8A90A2]">
                  <span>
                    当前字数：<strong className="text-white">{singleText.trim().length}</strong> 字 ·
                    预计成片口播时长约{' '}
                    <strong className="text-[#00E5FF]">{estDurationSec.toFixed(1)}s</strong>
                    {activeGroup && activeGroup.clips.length > 0 && (
                      <span className="ml-2 text-[#9CA3AF]">
                        (当前组「{activeGroup.name}」画面长{' '}
                        {formatShortSec(
                          activeGroup.clips.reduce(
                            (s, c) => s + Math.max(0.2, (c.trimEnd - c.trimStart) / (c.speed || 1)),
                            0
                          )
                        )}
                        )
                      </span>
                    )}
                  </span>
                  <input
                    type="text"
                    value={titleName}
                    onChange={(e) => setTitleName(e.target.value)}
                    placeholder="可选：自定义保存音频名称"
                    className="bg-[#0E1017] border border-[#282D40] rounded px-2 py-1 text-[11px] text-white outline-none w-44"
                  />
                </div>
              </div>
            ) : (
              <div className="space-y-1.5">
                <textarea
                  rows={5}
                  value={batchText}
                  onChange={(e) => setBatchText(e.target.value)}
                  placeholder="每段文案之间用「空行」隔开，每段将独立生成一条高清口播音频..."
                  className="w-full rounded-xl bg-[#0E1017] border border-[#FFB800]/50 focus:border-[#FFB800] p-3 text-xs text-white leading-relaxed outline-none resize-none"
                />
                <div className="text-[11px] text-[#9CA3AF]">
                  提示：用<strong>空行</strong>分隔不同话术，当前共识别出{' '}
                  <strong className="text-[#FFB800]">{parsedBatchScripts.length} 条</strong>{' '}
                  独立口播脚本，可一键批量配音并去气口。
                </div>
              </div>
            )}

            {/* 8 Neural Voices Grid */}
            <div className="space-y-2">
              <div className="text-xs font-bold text-white flex items-center justify-between">
                <span>选择主播音色 ({TTS_VOICES.length} 款高转化模型)</span>
                <span className="text-[11px] font-normal text-[#8A90A2]">
                  语速 {ratePct >= 0 ? `+${ratePct}%` : `${ratePct}%`} · 音调{' '}
                  {pitchHz >= 0 ? `+${pitchHz}Hz` : `${pitchHz}Hz`}
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {TTS_VOICES.map((v) => {
                  const active = voiceId === v.id;
                  return (
                    <button
                      key={v.id}
                      onClick={() => setVoiceId(v.id)}
                      className={`p-2.5 rounded-xl border text-left transition flex flex-col justify-between gap-1 ${
                        active
                          ? 'bg-[#1D283A] border-[#00E5FF] ring-1 ring-[#00E5FF]/40'
                          : 'bg-[#12151E] border-[#262B3D] hover:border-[#3D4663]'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-1">
                        <span className="text-xs font-bold text-white truncate">
                          {v.name.split('·')[0].trim()}
                        </span>
                        <span
                          className={`px-1.5 py-0.2 rounded text-[9px] font-semibold whitespace-nowrap ${
                            v.gender === 'female'
                              ? 'bg-pink-500/20 text-pink-300'
                              : 'bg-sky-500/20 text-sky-300'
                          }`}
                        >
                          {v.badge}
                        </span>
                      </div>
                      <div className="text-[10px] text-[#00E5FF] font-medium truncate">
                        {v.name.split('·')[1]?.trim()}
                      </div>
                      <div className="text-[10px] text-[#7E8596] line-clamp-2 leading-tight">
                        {v.desc}
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Rate & Pitch Sliders */}
              <div className="grid grid-cols-2 gap-3 pt-1">
                <div className="p-2.5 rounded-lg bg-[#11131B] border border-[#24293A] space-y-1">
                  <div className="flex justify-between text-[11px]">
                    <span className="text-[#CBD5E1]">口播语速 (信息流推荐 +8%~+18%)</span>
                    <span className="font-mono text-[#00E5FF]">
                      {ratePct >= 0 ? `+${ratePct}%` : `${ratePct}%`}
                    </span>
                  </div>
                  <input
                    type="range"
                    min={-30}
                    max={50}
                    step={2}
                    value={ratePct}
                    onChange={(e) => setRatePct(Number(e.target.value))}
                    className="w-full accent-[#00E5FF]"
                  />
                </div>

                <div className="p-2.5 rounded-lg bg-[#11131B] border border-[#24293A] space-y-1">
                  <div className="flex justify-between text-[11px]">
                    <span className="text-[#CBD5E1]">声线音调微调</span>
                    <span className="font-mono text-[#00E5FF]">
                      {pitchHz >= 0 ? `+${pitchHz}Hz` : `${pitchHz}Hz`}
                    </span>
                  </div>
                  <input
                    type="range"
                    min={-15}
                    max={15}
                    step={1}
                    value={pitchHz}
                    onChange={(e) => setPitchHz(Number(e.target.value))}
                    className="w-full accent-[#00E5FF]"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Right 5 Cols: Smart Breath Removal + Auto-Assign + Live Audition */}
          <div className="lg:col-span-5 space-y-4 flex flex-col">
            {/* Smart Breath Removal Panel */}
            <div
              className={`p-3.5 rounded-xl border transition space-y-3 ${
                removeBreath
                  ? 'bg-[#192131] border-[#00E5FF]/60'
                  : 'bg-[#12141D] border-[#252A3A]'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={removeBreath}
                    onChange={(e) => setRemoveBreath(e.target.checked)}
                    className="w-4 h-4 accent-[#00E5FF]"
                  />
                  <span className="text-xs font-bold text-white flex items-center gap-1">
                    <Zap className="w-3.5 h-3.5 text-[#FFB800] fill-current" />
                    生成后自动「去气口 / 切停顿」
                  </span>
                </label>

                {removeBreath && (
                  <button
                    onClick={() => setShowAdvBreath((v) => !v)}
                    className="text-[11px] text-[#00E5FF] hover:underline flex items-center gap-1 whitespace-nowrap"
                  >
                    <Sliders className="w-3 h-3" />
                    {showAdvBreath ? '收起参数' : '精调阈值'}
                  </button>
                )}
              </div>

              {removeBreath && (
                <>
                  <div className="grid grid-cols-3 gap-1.5">
                    {(['gentle', 'standard', 'tight'] as const).map((pid) => {
                      const p = BREATH_PRESETS[pid];
                      const active = breathPreset === pid;
                      return (
                        <button
                          key={pid}
                          onClick={() => selectPreset(pid)}
                          className={`p-2 rounded-lg border text-left transition ${
                            active
                              ? 'bg-[#00E5FF]/18 border-[#00E5FF] text-white'
                              : 'bg-[#10131B] border-[#262B3D] text-[#9CA3AF] hover:text-white'
                          }`}
                        >
                          <div className="text-[11px] font-bold whitespace-nowrap truncate">
                            {p.label.replace(' (推荐)', '')}
                          </div>
                          <div className="text-[9px] text-[#7E8596] mt-0.5">
                            阈值 {p.thresholdDb}dB
                          </div>
                        </button>
                      );
                    })}
                  </div>

                  <p className="text-[11px] text-[#A6ADBB] leading-snug">
                    {breathPreset !== 'custom'
                      ? BREATH_PRESETS[breathPreset].desc
                      : '自定义能量门限与最小停顿间隔，自动保留首尾辅音防吞字包络'}
                  </p>

                  {showAdvBreath && (
                    <div className="pt-2 border-t border-[#2A334B] space-y-2 text-[11px]">
                      <div>
                        <div className="flex justify-between text-[#CBD5E1]">
                          <span>气口能量门限 (越往右切得越狠)</span>
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
                          }}
                          className="w-full accent-[#FFB800]"
                        />
                      </div>

                      <div>
                        <div className="flex justify-between text-[#CBD5E1]">
                          <span>最短停顿触发时长</span>
                          <span className="font-mono text-[#FFB800]">
                            {minPauseSec.toFixed(2)}s
                          </span>
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

                      <div>
                        <div className="flex justify-between text-[#CBD5E1]">
                          <span>句间保留自然微停顿 (防吞字粘连)</span>
                          <span className="font-mono text-[#00E5FF]">
                            {(keepGapSec * 1000).toFixed(0)} ms
                          </span>
                        </div>
                        <input
                          type="range"
                          min={0}
                          max={0.16}
                          step={0.01}
                          value={keepGapSec}
                          onChange={(e) => {
                            setBreathPreset('custom');
                            setKeepGapSec(Number(e.target.value));
                          }}
                          className="w-full accent-[#00E5FF]"
                        />
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Post-Generate Assignment Strategy */}
            <div className="p-3.5 rounded-xl bg-[#11131B] border border-[#252A3A] space-y-2">
              <div className="text-xs font-bold text-white">生成后自动投递位置</div>
              <div className="space-y-1.5 text-xs">
                <label className="flex items-center gap-2 text-[#CBD5E1] cursor-pointer">
                  <input
                    type="radio"
                    name="ttsAssign"
                    checked={assignMode === 'active_group'}
                    onChange={() => setAssignMode('active_group')}
                    className="accent-[#00E5FF]"
                  />
                  <span>
                    直接设为当前组「{activeGroup?.name || '成片组#01'}」口播配音 (自动开启BGM闪避)
                  </span>
                </label>
                <label className="flex items-center gap-2 text-[#CBD5E1] cursor-pointer">
                  <input
                    type="radio"
                    name="ttsAssign"
                    checked={assignMode === 'dispatch_groups'}
                    onChange={() => setAssignMode('dispatch_groups')}
                    className="accent-[#00E5FF]"
                  />
                  <span>
                    按顺序自动分配给全部成片视频组 ({project.videoGroups.length}组)
                  </span>
                </label>
                <label className="flex items-center gap-2 text-[#CBD5E1] cursor-pointer">
                  <input
                    type="radio"
                    name="ttsAssign"
                    checked={assignMode === 'matrix_pool'}
                    onChange={() => setAssignMode('matrix_pool')}
                    className="accent-[#00E5FF]"
                  />
                  <span>加入「分镜矩阵 · 口播配音池」参与批量裂变混剪</span>
                </label>
                <label className="flex items-center gap-2 text-[#CBD5E1] cursor-pointer">
                  <input
                    type="radio"
                    name="ttsAssign"
                    checked={assignMode === 'library_only'}
                    onChange={() => setAssignMode('library_only')}
                    className="accent-[#00E5FF]"
                  />
                  <span>仅存入左侧素材库备用</span>
                </label>
              </div>

              {(assignMode === 'active_group' || assignMode === 'dispatch_groups') && (
                <div className="pt-2 border-t border-[#23283A]">
                  <label className="flex items-center gap-2 text-xs text-[#FFB800] font-semibold cursor-pointer">
                    <input
                      type="checkbox"
                      checked={autoSubtitles}
                      onChange={(e) => setAutoSubtitles(e.target.checked)}
                      className="accent-[#FFB800]"
                    />
                    同时自动切分并生成口播同步动态字幕（硬字幕烧录就绪）
                  </label>
                </div>
              )}
            </div>

            {/* Primary CTA Button */}
            <button
              onClick={handleGenerate}
              disabled={generating}
              className="w-full py-3 rounded-xl bg-gradient-to-r from-[#00E5FF] to-[#00B4D8] text-[#061017] font-black text-xs sm:text-sm shadow-[0_0_24px_rgba(0,229,255,0.3)] hover:brightness-110 transition flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {generating ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  正在合成语音并执行 PCM 去气口精修...
                </>
              ) : (
                <>
                  <Wand2 className="w-4 h-4" />
                  {scriptMode === 'single'
                    ? `立即生成口播音频${removeBreath ? ' + 自动去气口' : ''}`
                    : `批量合成 ${parsedBatchScripts.length} 条口播音频${
                        removeBreath ? ' + 自动去气口' : ''
                      }`}
                </>
              )}
            </button>

            {/* Generated Audition List & Breath Stats Report */}
            {results.length > 0 && (
              <div className="p-3 rounded-xl bg-[#0F131D] border border-emerald-500/40 space-y-2.5 max-h-56 overflow-y-auto">
                <div className="flex items-center justify-between text-xs font-bold text-emerald-400">
                  <span className="flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4" />
                    已生成 {results.length} 条配音（可直接试听或波形精剪）
                  </span>
                </div>

                {results.map(({ asset, stats }) => (
                  <div
                    key={asset.id}
                    className="p-2.5 rounded-lg bg-[#171C29] border border-[#2B3248] space-y-1.5"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-white truncate">
                        {asset.name}
                      </span>
                      <button
                        onClick={() => {
                          onClose();
                          onOpenAudioEditor(asset);
                        }}
                        className="px-2 py-0.5 rounded bg-[#FFB800]/20 hover:bg-[#FFB800] text-[#FFB800] hover:text-[#111318] text-[10px] font-bold whitespace-nowrap flex items-center gap-1 transition"
                      >
                        <Scissors className="w-3 h-3" />
                        波形精剪
                      </button>
                    </div>

                    {stats && (
                      <div className="flex flex-wrap items-center gap-1.5 text-[10px]">
                        <span className="px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-300 font-medium">
                          ⚡ 已切除 {stats.cutCount} 处气口与停顿
                        </span>
                        <span className="text-[#9CA3AF] font-mono">
                          原长 {stats.originalDuration.toFixed(2)}s → 紧凑{' '}
                          <strong className="text-[#00E5FF]">{stats.newDuration.toFixed(2)}s</strong>{' '}
                          (省 {stats.savedSec.toFixed(2)}s)
                        </span>
                      </div>
                    )}

                    <audio
                      controls
                      src={asset.url}
                      className="w-full h-8 rounded"
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
