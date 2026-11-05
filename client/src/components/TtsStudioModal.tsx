import React, { useEffect, useState } from 'react';
import {
  ArrowRight,
  Check,
  CheckCircle2,
  Eye,
  EyeOff,
  Grid,
  KeyRound,
  Loader2,
  Mic,
  Scissors,
  Sliders,
  Sparkles,
  Wand2,
  X,
  Zap,
} from 'lucide-react';
import {
  AI_PROVIDER_PRESETS,
  AI_SCRIPT_STYLES,
  AiEngineSettings,
  AiProviderId,
  AiScriptStyleId,
  AsrEngineMode,
  BREATH_PRESETS,
  BreathPresetId,
  createDefaultAiSettings,
  GeneratedAdScriptItem,
  LocalWhisperModelId,
  MediaAsset,
  ProjectData,
  TTS_VOICES,
  VideoGroup,
} from '@shared/schema';
import {
  BreathStatsDto,
  fetchAiSettingsApi,
  generateAiScriptsApi,
  saveAiSettingsApi,
  synthesizeTtsApi,
  testAiConnectionApi,
  testCloudAsrApi,
} from '../api';
import { formatShortSec } from '../utils/format';
import { CustomSelect } from './CustomSelect';

export type AiStudioInitialTab = 'ai_script' | 'tts' | 'settings';

interface Props {
  project: ProjectData;
  activeGroup: VideoGroup | null;
  initialTab?: AiStudioInitialTab;
  defaultAssignMode?: 'library_only' | 'active_group' | 'dispatch_groups' | 'matrix_pool';
  onClose: () => void;
  onProjectUpdated: (
    updatedProject: ProjectData,
    createdAssets: MediaAsset[],
    toastMsg: string
  ) => void;
  onOpenAudioEditor: (asset: MediaAsset) => void;
  onAiSettingsSaved?: (settings: AiEngineSettings) => void;
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
  initialTab = 'ai_script',
  defaultAssignMode = 'active_group',
  onClose,
  onProjectUpdated,
  onOpenAudioEditor,
  onAiSettingsSaved,
}) => {
  const [studioTab, setStudioTab] = useState<'ai_script' | 'tts'>(
    initialTab === 'tts' ? 'tts' : 'ai_script'
  );
  const [showSettingsDrawer, setShowSettingsDrawer] = useState<boolean>(
    initialTab === 'settings'
  );

  // =========================================================================
  // AI Engine Settings State (stored locally in storage/_ai_config.json)
  // =========================================================================
  const [aiSettings, setAiSettings] = useState<AiEngineSettings>(createDefaultAiSettings());
  const [showKeyPlain, setShowKeyPlain] = useState(false);
  const [showAsrKeyPlain, setShowAsrKeyPlain] = useState(false);
  const [testingConn, setTestingConn] = useState(false);
  const [testingAsrConn, setTestingAsrConn] = useState(false);
  const [savingCfg, setSavingCfg] = useState(false);
  const [connStatus, setConnStatus] = useState<{ ok: boolean; msg: string } | null>(null);

  useEffect(() => {
    fetchAiSettingsApi()
      .then((cfg) => setAiSettings(cfg))
      .catch(() => {});
  }, []);

  const hasCloudKeyConfigured =
    aiSettings.providerId === 'ollama_local' || Boolean(aiSettings.apiKey?.trim());

  const handleSelectProvider = (pid: AiProviderId) => {
    const preset = AI_PROVIDER_PRESETS[pid];
    setAiSettings((prev) => ({
      ...prev,
      providerId: pid,
      baseUrl: preset.baseUrl,
      llmModel: preset.defaultLlmModel,
      ...(preset.supportsCloudAsr && preset.defaultAsrModel
        ? {
            asrBaseUrl: preset.baseUrl,
            asrModel: preset.defaultAsrModel,
          }
        : {}),
    }));
    setConnStatus(null);
  };

  const handleSaveSettings = async () => {
    setSavingCfg(true);
    try {
      const saved = await saveAiSettingsApi(aiSettings);
      setAiSettings(saved);
      onAiSettingsSaved?.(saved);
      setConnStatus({ ok: true, msg: '✓ 配置已加密保存在本机（不会上传 Git 仓库）' });
    } catch (err: any) {
      setConnStatus({ ok: false, msg: err?.message || '保存配置失败' });
    } finally {
      setSavingCfg(false);
    }
  };

  const handleTestConnection = async () => {
    setTestingConn(true);
    setConnStatus(null);
    try {
      await saveAiSettingsApi(aiSettings);
      const res = await testAiConnectionApi(aiSettings);
      setConnStatus({ ok: res.ok, msg: res.message });
    } catch (err: any) {
      setConnStatus({ ok: false, msg: err?.message || '测试请求异常' });
    } finally {
      setTestingConn(false);
    }
  };

  const handleTestAsrConnection = async () => {
    setTestingAsrConn(true);
    setConnStatus(null);
    try {
      await saveAiSettingsApi(aiSettings);
      const res = await testCloudAsrApi(aiSettings);
      setConnStatus({ ok: res.ok, msg: res.message });
    } catch (err: any) {
      setConnStatus({ ok: false, msg: err?.message || '云端 ASR 测试请求异常' });
    } finally {
      setTestingAsrConn(false);
    }
  };
  const [productName, setProductName] = useState<string>(
    project.name.split('·')[0]?.trim() || '极光随行碎冰榨汁杯'
  );
  const [sellingPoints, setSellingPoints] = useState<string>(
    '十叶304精钢刀头4秒碎冰，细腻免过滤，双击自动水洗，Type-C车载便携充电'
  );
  const [painPoints, setPainPoints] = useState<string>(
    '早八通勤来不及吃早餐、点奶茶贵又长胖、传统榨汁机难清洗闲置吃灰'
  );
  const [ctaOffer, setCtaOffer] = useState<string>('点击下方链接抢源头工厂买1送1+运费险');
  const [scriptStyle, setScriptStyle] = useState<AiScriptStyleId>('mixed_horse_race');
  const [fissionCount, setFissionCount] = useState<number>(6);
  const [targetDurSec, setTargetDurSec] = useState<12 | 20 | 32>(20);

  const [generatingScripts, setGeneratingScripts] = useState(false);
  const [fissionItems, setFissionItems] = useState<GeneratedAdScriptItem[]>([]);
  const [selectedScriptIds, setSelectedScriptIds] = useState<Set<string>>(new Set());
  const [fissionMeta, setFissionMeta] = useState<{
    engineUsed: string;
    modelName: string;
    fallbackNote?: string;
  } | null>(null);
  const [synthesizingFromAi, setSynthesizingFromAi] = useState(false);

  const handleRunFission = async (forceFormula = false) => {
    if (!productName.trim() && !sellingPoints.trim()) {
      alert('请先填写商品名称或核心卖点');
      return;
    }
    setGeneratingScripts(true);
    try {
      const res = await generateAiScriptsApi({
        productName,
        sellingPoints,
        painPoints,
        ctaOffer,
        styleId: scriptStyle,
        count: fissionCount,
        targetDurationSec: targetDurSec,
        useOfflineFormulaOnly: forceFormula,
      });
      setFissionItems(res.scripts);
      setSelectedScriptIds(new Set(res.scripts.map((s) => s.id)));
      setFissionMeta({
        engineUsed: res.engineUsed,
        modelName: res.modelName,
        fallbackNote: res.fallbackNote,
      });
    } catch (err: any) {
      alert(err?.message || 'AI 脚本生成失败');
    } finally {
      setGeneratingScripts(false);
    }
  };

  // =========================================================================
  // Tab 2: Neural TTS & Breath Removal State
  // =========================================================================
  const [scriptMode, setScriptMode] = useState<'single' | 'batch'>('single');
  const [singleText, setSingleText] = useState<string>(SAMPLE_SCRIPTS[0].text);
  const [batchText, setBatchText] = useState<string>(
    `${SAMPLE_SCRIPTS[0].text}\n\n${SAMPLE_SCRIPTS[1].text}\n\n${SAMPLE_SCRIPTS[2].text}`
  );
  const [pendingOverlays, setPendingOverlays] = useState<
    Array<{ topTitle?: string; bottomTitle?: string }> | undefined
  >(undefined);
  const [titleName, setTitleName] = useState('');

  const [voiceId, setVoiceId] = useState<string>(TTS_VOICES[0].id);
  const [ratePct, setRatePct] = useState<number>(8);
  const [pitchHz, setPitchHz] = useState<number>(0);

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

  const [generatingTts, setGeneratingTts] = useState(false);
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

  const handleGenerateTts = async () => {
    const scripts = scriptMode === 'single' ? [singleText.trim()] : parsedBatchScripts;
    if (scripts.length === 0 || !scripts[0]) {
      alert('请先输入口播文案内容');
      return;
    }

    setGeneratingTts(true);
    try {
      const res = await synthesizeTtsApi(project, {
        scripts,
        scriptOverlays:
          scriptMode === 'batch' &&
          pendingOverlays &&
          pendingOverlays.length === scripts.length
            ? pendingOverlays
            : undefined,
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
      setGeneratingTts(false);
    }
  };

  /**
   * 1-Click Direct Pipeline from AI Script Fission -> Neural TTS + Breath Removal + Group/Matrix Dispatch!
   */
  const handleOneClickDispatchFromAi = async (
    targetMode: 'dispatch_groups' | 'matrix_pool' | 'active_group'
  ) => {
    const picked = fissionItems.filter((it) => selectedScriptIds.has(it.id));
    if (picked.length === 0) {
      alert('请至少勾选 1 套要投递的脚本');
      return;
    }

    setSynthesizingFromAi(true);
    try {
      const res = await synthesizeTtsApi(project, {
        scripts: picked.map((p) => p.spokenScript),
        scriptOverlays: picked.map((p) => ({
          topTitle: p.topTitle,
          bottomTitle: p.bottomTitle,
        })),
        voiceId,
        ratePct,
        pitchHz,
        removeBreath: true,
        breathOptions: BREATH_PRESETS.standard,
        assignMode: targetMode,
        targetGroupId: activeGroup?.id,
        autoSubtitles: true,
      });

      const toastMsg =
        targetMode === 'matrix_pool'
          ? `🧩 已将 ${picked.length} 套 AI 花字与去气口配音全部导入「分镜矩阵池」！`
          : targetMode === 'active_group'
          ? `⚡ 已为当前视频组自动配齐 AI 口播、同步字幕与上下花字！`
          : `⚡ 已批量合成 ${picked.length} 套 AI 配音并同步灌入各成片组（配音+动态字幕+上下花字全就绪）！`;

      onProjectUpdated(res.project, res.assets, toastMsg);
      onClose();
    } catch (err: any) {
      alert(err?.message || '批量合成投递失败');
    } finally {
      setSynthesizingFromAi(false);
    }
  };

  const checkedCount = fissionItems.filter((i) => selectedScriptIds.has(i.id)).length;

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 select-none">
      <div className="w-full max-w-5xl max-h-[92vh] rounded-2xl bg-[#151821] border border-[#2D3348] shadow-2xl flex flex-col overflow-hidden">
        {/* Unified Studio Header — Single Non-Wrapping Row with Top-Right Close Button */}
        <div className="px-5 py-3 bg-[#11131B] border-b border-[#252A3A] flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#00E5FF] to-[#7C3AED] flex items-center justify-center text-white shadow shrink-0">
              <Sparkles className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm font-bold text-white flex items-center gap-2 whitespace-nowrap">
                <span>AI 脚本裂变与智能配音中心</span>
                <span className="px-1.5 py-0.5 rounded bg-[#00E5FF]/15 text-[#00E5FF] text-[10px] font-mono">
                  v2.3 全链路
                </span>
              </h2>
              <p className="text-[11px] text-[#8A90A2] truncate">
                卖点裂变脚本花字 → 神经配音去气口 → 动态字幕灌入视频组
              </p>
            </div>
          </div>

          {/* Right Controls: Dual-Tab Switcher + AI Engine Config + Top-Right Close */}
          <div className="flex items-center gap-2 shrink-0">
            <div className="flex items-center bg-[#0B0D13] p-1 rounded-xl border border-[#272D42]">
              <button
                type="button"
                onClick={() => {
                  setShowSettingsDrawer(false);
                  setStudioTab('ai_script');
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 whitespace-nowrap transition ${
                  !showSettingsDrawer && studioTab === 'ai_script'
                    ? 'bg-gradient-to-r from-[#00E5FF]/20 to-purple-500/20 text-[#00E5FF] border border-[#00E5FF]/40'
                    : 'text-[#8A90A2] hover:text-white'
                }`}
              >
                <Sparkles className="w-3.5 h-3.5 shrink-0" />
                1. AI 爆款脚本裂变
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowSettingsDrawer(false);
                  setStudioTab('tts');
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 whitespace-nowrap transition ${
                  !showSettingsDrawer && studioTab === 'tts'
                    ? 'bg-[#FFB800]/18 text-[#FFB800] border border-[#FFB800]/40'
                    : 'text-[#8A90A2] hover:text-white'
                }`}
              >
                <Mic className="w-3.5 h-3.5 shrink-0" />
                2. 语音合成 & 去气口
              </button>
            </div>

            <button
              type="button"
              onClick={() => setShowSettingsDrawer((s) => !s)}
              className={`h-8 px-3 rounded-lg border text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap transition ${
                showSettingsDrawer
                  ? 'bg-[#00E5FF]/20 border-[#00E5FF] text-[#00E5FF]'
                  : hasCloudKeyConfigured
                  ? 'bg-emerald-500/12 border-emerald-500/35 text-emerald-300 hover:bg-emerald-500/20'
                  : 'bg-[#1D2232] border-[#323A54] text-[#CBD5E1] hover:text-white'
              }`}
            >
              <KeyRound className="w-3.5 h-3.5 shrink-0" />
              <span>
                {hasCloudKeyConfigured
                  ? `已接入 ${AI_PROVIDER_PRESETS[aiSettings.providerId]?.name.split(' ')[0]}`
                  : '配置 Key'}
              </span>
            </button>

            <div className="h-4 w-px bg-[#283048] shrink-0" />

            <button
              type="button"
              onClick={onClose}
              title="关闭窗口"
              className="w-8 h-8 rounded-lg bg-[#1A1E2B] hover:bg-red-500/20 border border-[#2B3247] hover:border-red-500/40 text-[#9CA3AF] hover:text-red-300 flex items-center justify-center shrink-0 transition"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* =====================================================================
            VIEW A: AI Engine & Dual-Mode ASR Settings Panel
           ===================================================================== */}
        {showSettingsDrawer ? (
          <div className="flex-1 min-h-0 overflow-y-auto p-5 space-y-4">
            <div className="p-4 rounded-xl bg-[#11141E] border border-[#2A324B] space-y-4">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <h3 className="text-xs font-bold text-white flex items-center gap-2">
                    <KeyRound className="w-4 h-4 text-[#00E5FF]" />
                    大模型脚本引擎 & 原声语音识别 (ASR) 统一配置
                  </h3>
                  <p className="text-[11px] text-[#8A90A2] mt-0.5">
                    密钥仅加密保存在您电脑本地 <code className="text-[#00E5FF]">storage/_ai_config.json</code>（已加入 .gitignore，绝不上传 GitHub）
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowSettingsDrawer(false)}
                  className="px-3 py-1.5 rounded-lg bg-[#23293D] hover:bg-[#2D354F] text-xs text-white whitespace-nowrap"
                >
                  返回工作台
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-[#CBD5E1]">
                    选择 AI 服务商预设
                  </label>
                  <CustomSelect<AiProviderId>
                    value={aiSettings.providerId}
                    options={(Object.keys(AI_PROVIDER_PRESETS) as AiProviderId[]).map((pid) => ({
                      value: pid,
                      label: AI_PROVIDER_PRESETS[pid].name,
                      rightMeta: AI_PROVIDER_PRESETS[pid].badge,
                      metaTone: pid === 'siliconflow' ? 'emerald' : 'cyan',
                    }))}
                    onChange={handleSelectProvider}
                    menuMinWidth={340}
                    className="w-full h-9"
                  />
                  <p className="text-[11px] text-[#8A90A2]">
                    {AI_PROVIDER_PRESETS[aiSettings.providerId]?.keyHint}
                  </p>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-[#CBD5E1]">
                    API Base URL (OpenAI 兼容接口地址)
                  </label>
                  <input
                    type="text"
                    value={aiSettings.baseUrl}
                    onChange={(e) =>
                      setAiSettings((s) => ({ ...s, baseUrl: e.target.value }))
                    }
                    placeholder="https://api.siliconflow.cn/v1"
                    className="w-full h-9 bg-[#171B28] border border-[#2E3650] focus:border-[#00E5FF] rounded-lg px-3 text-xs text-white font-mono outline-none"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-[#CBD5E1]">
                    API Key 密钥 {aiSettings.providerId === 'ollama_local' ? '(本地 Ollama 免填)' : ''}
                  </label>
                  <div className="relative flex items-center">
                    <input
                      type={showKeyPlain ? 'text' : 'password'}
                      value={aiSettings.apiKey}
                      onChange={(e) =>
                        setAiSettings((s) => ({ ...s, apiKey: e.target.value }))
                      }
                      placeholder={
                        aiSettings.providerId === 'ollama_local'
                          ? '本地离线模式无需填写 Key'
                          : 'sk-...'
                      }
                      className="w-full h-9 bg-[#171B28] border border-[#2E3650] focus:border-[#00E5FF] rounded-lg pl-3 pr-9 text-xs text-white font-mono outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => setShowKeyPlain((v) => !v)}
                      className="absolute right-2.5 text-[#8A90A2] hover:text-white"
                    >
                      {showKeyPlain ? (
                        <EyeOff className="w-3.5 h-3.5" />
                      ) : (
                        <Eye className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-[#CBD5E1]">
                    文案裂变模型名称 (可手动输入任意模型 ID)
                  </label>
                  <input
                    type="text"
                    value={aiSettings.llmModel}
                    onChange={(e) =>
                      setAiSettings((s) => ({ ...s, llmModel: e.target.value }))
                    }
                    className="w-full h-9 bg-[#171B28] border border-[#2E3650] focus:border-[#00E5FF] rounded-lg px-3 text-xs text-white font-mono outline-none"
                  />
                  <div className="flex flex-wrap gap-1 pt-0.5">
                    {(AI_PROVIDER_PRESETS[aiSettings.providerId]?.suggestedModels || []).map(
                      (m) => (
                        <button
                          key={m}
                          type="button"
                          onClick={() => setAiSettings((s) => ({ ...s, llmModel: m }))}
                          className={`px-2 py-0.5 rounded text-[10px] font-mono border transition ${
                            aiSettings.llmModel === m
                              ? 'bg-[#00E5FF]/15 border-[#00E5FF] text-[#00E5FF]'
                              : 'bg-[#171B28] border-[#2A3147] text-[#9CA3AF] hover:text-white'
                          }`}
                        >
                          {m}
                        </button>
                      )
                    )}
                  </div>
                </div>
              </div>

              {/* Dual-Mode ASR Configuration */}
              <div className="pt-4 border-t border-[#252C42] space-y-3">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="text-xs font-bold text-white flex items-center gap-2">
                    <Mic className="w-3.5 h-3.5 text-[#FFB800]" />
                    原声语音识别转字幕 (ASR) 双模引擎偏好
                  </div>
                  <span className="text-[11px] text-[#8A90A2]">
                    硅基流动 / 智谱 / 阿里百炼可自动共用上方 Key；若主模型选 DeepSeek/豆包，请在下方单独填硅基流动免费 Key
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-[11px] text-[#B8C0D0]">默认语音识别引擎</label>
                    <CustomSelect<AsrEngineMode>
                      value={aiSettings.asrMode}
                      options={[
                        {
                          value: 'auto',
                          label: '⚡ 智能双模 (有Key走云端，无Key走本地离线)',
                          rightMeta: '推荐',
                          metaTone: 'emerald',
                        },
                        {
                          value: 'cloud',
                          label: '☁️ 云端极速识别 (SenseVoice / Whisper)',
                          rightMeta: '1秒出字',
                          metaTone: 'cyan',
                        },
                        {
                          value: 'local_wasm',
                          label: '💻 本地免Key离线识别 (WASM Whisper)',
                          rightMeta: '免Key离线',
                          metaTone: 'amber',
                        },
                      ]}
                      onChange={(v) => setAiSettings((s) => ({ ...s, asrMode: v }))}
                      menuMinWidth={330}
                      className="w-full h-9"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[11px] text-[#B8C0D0]">
                      本地免Key离线 Whisper 模型规格
                    </label>
                    <CustomSelect<LocalWhisperModelId>
                      value={aiSettings.localWhisperModel}
                      options={[
                        {
                          value: 'Xenova/whisper-base',
                          label: 'Whisper-Base 轻量极速版',
                          rightMeta: '~74MB',
                          metaTone: 'emerald',
                        },
                        {
                          value: 'Xenova/whisper-small',
                          label: 'Whisper-Small 高准度中文版',
                          rightMeta: '~240MB',
                          metaTone: 'cyan',
                        },
                      ]}
                      onChange={(v) =>
                        setAiSettings((s) => ({ ...s, localWhisperModel: v }))
                      }
                      menuMinWidth={260}
                      className="w-full h-9"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div className="space-y-1">
                    <label className="text-[11px] text-[#B8C0D0]">
                      独立云端 ASR 接口地址 (默认硅基流动)
                    </label>
                    <input
                      type="text"
                      value={aiSettings.asrBaseUrl}
                      onChange={(e) =>
                        setAiSettings((s) => ({ ...s, asrBaseUrl: e.target.value }))
                      }
                      placeholder="https://api.siliconflow.cn/v1"
                      className="w-full h-9 bg-[#171B28] border border-[#2E3650] focus:border-[#00E5FF] rounded-lg px-2.5 text-xs text-white font-mono outline-none"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[11px] text-[#B8C0D0]">
                      独立云端 ASR 密钥 (留空则复用上方同源 Key)
                    </label>
                    <div className="relative flex items-center">
                      <input
                        type={showAsrKeyPlain ? 'text' : 'password'}
                        value={aiSettings.asrApiKey}
                        onChange={(e) =>
                          setAiSettings((s) => ({ ...s, asrApiKey: e.target.value }))
                        }
                        placeholder="选填：如硅基流动免费 sk-..."
                        className="w-full h-9 bg-[#171B28] border border-[#2E3650] focus:border-[#00E5FF] rounded-lg pl-2.5 pr-8 text-xs text-white font-mono outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => setShowAsrKeyPlain((v) => !v)}
                        className="absolute right-2 text-[#8A90A2] hover:text-white"
                      >
                        {showAsrKeyPlain ? (
                          <EyeOff className="w-3.5 h-3.5" />
                        ) : (
                          <Eye className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[11px] text-[#B8C0D0]">云端 ASR 模型名称</label>
                    <input
                      type="text"
                      value={aiSettings.asrModel}
                      onChange={(e) =>
                        setAiSettings((s) => ({ ...s, asrModel: e.target.value }))
                      }
                      placeholder="FunAudioLLM/SenseVoiceSmall"
                      className="w-full h-9 bg-[#171B28] border border-[#2E3650] focus:border-[#00E5FF] rounded-lg px-2.5 text-xs text-white font-mono outline-none"
                    />
                    <div className="flex flex-wrap gap-1 pt-0.5">
                      {[
                        'FunAudioLLM/SenseVoiceSmall',
                        'TeleAI/TeleSpeechASR',
                        'glm-asr',
                        'qwen-omni-turbo',
                        'whisper-1',
                      ].map((m) => (
                        <button
                          key={m}
                          type="button"
                          onClick={() => setAiSettings((s) => ({ ...s, asrModel: m }))}
                          className={`px-1.5 py-0.5 rounded text-[9px] font-mono border transition ${
                            aiSettings.asrModel === m
                              ? 'bg-[#FFB800]/18 border-[#FFB800] text-[#FFB800]'
                              : 'bg-[#171B28] border-[#2A3147] text-[#9CA3AF] hover:text-white'
                          }`}
                        >
                          {m.split('/').pop()}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* Test & Save Footer */}
              <div className="pt-3 border-t border-[#252C42] flex items-center justify-between gap-3 flex-wrap">
                <div className="text-xs max-w-xl">
                  {connStatus && (
                    <span
                      className={
                        connStatus.ok ? 'text-emerald-400 font-medium' : 'text-red-400 font-medium'
                      }
                    >
                      {connStatus.msg}
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    type="button"
                    onClick={handleTestConnection}
                    disabled={testingConn || testingAsrConn}
                    className="h-9 px-3.5 rounded-lg bg-[#21273B] hover:bg-[#2B334D] border border-[#36405E] text-xs text-[#00E5FF] font-semibold flex items-center gap-1.5 whitespace-nowrap transition"
                  >
                    {testingConn && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                    测试大模型
                  </button>
                  <button
                    type="button"
                    onClick={handleTestAsrConnection}
                    disabled={testingConn || testingAsrConn}
                    className="h-9 px-3.5 rounded-lg bg-[#25221B] hover:bg-[#332E22] border border-[#FFB800]/45 text-xs text-[#FFB800] font-semibold flex items-center gap-1.5 whitespace-nowrap transition"
                  >
                    {testingAsrConn && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                    测试云端 ASR
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveSettings}
                    disabled={savingCfg}
                    className="h-9 px-5 rounded-lg bg-gradient-to-r from-[#00E5FF] to-[#00B4D8] text-[#071016] font-bold text-xs flex items-center gap-1.5 whitespace-nowrap hover:brightness-110 transition"
                  >
                    <Check className="w-4 h-4" />
                    保存本机 AI 配置
                  </button>
                </div>
              </div>
            </div>
          </div>
        ) : studioTab === 'ai_script' ? (
          /* =====================================================================
             VIEW B: Tab 1 — AI Ad Script & Title Fission Workbench
             ===================================================================== */
          <div className="flex-1 min-h-0 overflow-y-auto p-5 grid grid-cols-1 lg:grid-cols-12 gap-5">
            {/* Left 5 Cols: Product & Selling Points Input */}
            <div className="lg:col-span-5 space-y-3.5">
              <div className="p-3.5 rounded-xl bg-[#11141E] border border-[#282F45] space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-white flex items-center gap-1.5">
                    <Wand2 className="w-3.5 h-3.5 text-[#00E5FF]" />
                    商品卖点与投流方向输入
                  </span>
                  <span className="text-[10px] px-2 py-0.5 rounded bg-[#1D2336] text-[#9CA3AF]">
                    {hasCloudKeyConfigured
                      ? `当前模型: ${aiSettings.llmModel.split('/').pop()}`
                      : '未配Key · 将使用内置爆款公式'}
                  </span>
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-medium text-[#CBD5E1]">
                    商品 / 服务名称
                  </label>
                  <input
                    type="text"
                    value={productName}
                    onChange={(e) => setProductName(e.target.value)}
                    placeholder="例如：极光随行碎冰榨汁杯 / 同城双人烤肉套餐"
                    className="w-full h-9 bg-[#171B28] border border-[#2C334B] focus:border-[#00E5FF] rounded-lg px-2.5 text-xs text-white outline-none"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-medium text-[#CBD5E1]">
                    核心卖点与差异化参数 (越具体越有网感)
                  </label>
                  <textarea
                    rows={3}
                    value={sellingPoints}
                    onChange={(e) => setSellingPoints(e.target.value)}
                    placeholder="例如：304十叶精钢刀头、4秒碎冰免过滤、双击龙卷风自动清洗、充一次电榨15杯..."
                    className="w-full bg-[#171B28] border border-[#2C334B] focus:border-[#00E5FF] rounded-lg p-2.5 text-xs text-white outline-none resize-none leading-relaxed"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-medium text-[#CBD5E1]">
                    目标人群痛点 (用于生成前3秒黄金钩子)
                  </label>
                  <input
                    type="text"
                    value={painPoints}
                    onChange={(e) => setPainPoints(e.target.value)}
                    placeholder="例如：早八赶时间、点果茶太贵、普通料理机难刷洗"
                    className="w-full h-9 bg-[#171B28] border border-[#2C334B] focus:border-[#00E5FF] rounded-lg px-2.5 text-xs text-white outline-none"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-medium text-[#CBD5E1]">
                    促销福利与转化指令 (CTA)
                  </label>
                  <input
                    type="text"
                    value={ctaOffer}
                    onChange={(e) => setCtaOffer(e.target.value)}
                    placeholder="例如：点击下方链接抢源头工厂买1送1+运费险"
                    className="w-full h-9 bg-[#171B28] border border-[#2C334B] focus:border-[#00E5FF] rounded-lg px-2.5 text-xs text-white outline-none"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-medium text-[#CBD5E1]">脚本爆款流派</label>
                  <CustomSelect<AiScriptStyleId>
                    value={scriptStyle}
                    options={(Object.keys(AI_SCRIPT_STYLES) as AiScriptStyleId[]).map((sid) => ({
                      value: sid,
                      label: AI_SCRIPT_STYLES[sid].label,
                      rightMeta: AI_SCRIPT_STYLES[sid].badge,
                      metaTone: sid === 'mixed_horse_race' ? 'emerald' : 'cyan',
                    }))}
                    onChange={(v) => setScriptStyle(v)}
                    menuMinWidth={290}
                    className="w-full h-9"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-[11px] font-medium text-[#CBD5E1]">裂变生成套数</label>
                    <div className="grid grid-cols-4 gap-1">
                      {[3, 6, 10, 15].map((n) => (
                        <button
                          key={n}
                          type="button"
                          onClick={() => setFissionCount(n)}
                          className={`h-8 rounded-lg border text-xs font-mono font-semibold whitespace-nowrap transition ${
                            fissionCount === n
                              ? 'bg-[#00E5FF]/18 border-[#00E5FF] text-[#00E5FF]'
                              : 'bg-[#171B28] border-[#2B3248] text-[#9CA3AF] hover:text-white'
                          }`}
                        >
                          {n}套
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[11px] font-medium text-[#CBD5E1]">目标单条时长</label>
                    <div className="grid grid-cols-3 gap-1">
                      {(
                        [
                          { s: 12, label: '12s短钩' },
                          { s: 20, label: '20s标准' },
                          { s: 32, label: '32s种草' },
                        ] as const
                      ).map((d) => (
                        <button
                          key={d.s}
                          type="button"
                          onClick={() => setTargetDurSec(d.s)}
                          className={`h-8 rounded-lg border text-[11px] font-semibold whitespace-nowrap transition ${
                            targetDurSec === d.s
                              ? 'bg-[#00E5FF]/18 border-[#00E5FF] text-[#00E5FF]'
                              : 'bg-[#171B28] border-[#2B3248] text-[#9CA3AF] hover:text-white'
                          }`}
                        >
                          {d.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => void handleRunFission(false)}
                  disabled={generatingScripts}
                  className="w-full py-2.5 rounded-xl bg-gradient-to-r from-[#00E5FF] to-[#00B4D8] text-[#061017] font-black text-xs shadow-[0_0_20px_rgba(0,229,255,0.28)] hover:brightness-110 transition flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {generatingScripts ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      正在裂变生成 {fissionCount} 套不重复带货脚本与花字...
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4" />
                      一键 AI 裂变生成 {fissionCount} 套爆款脚本 + 上下花字
                    </>
                  )}
                </button>
              </div>

              {/* Voice Quick Selector for 1-Click Direct Synthesis */}
              <div className="p-3 rounded-xl bg-[#11141E] border border-[#282F45] space-y-2">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="font-semibold text-[#CBD5E1]">
                    一键成片配音主播音色 (自动开启去气口)
                  </span>
                  <span className="text-[#00E5FF] font-mono">语速 +{ratePct}%</span>
                </div>
                <CustomSelect<string>
                  value={voiceId}
                  options={TTS_VOICES.map((v) => ({
                    value: v.id,
                    label: v.name,
                    rightMeta: v.badge,
                    metaTone: v.gender === 'female' ? 'amber' : 'cyan',
                  }))}
                  onChange={(val) => setVoiceId(val)}
                  menuMinWidth={300}
                  className="w-full h-9"
                />
              </div>
            </div>

            {/* Right 7 Cols: Generated Script Cards + 1-Click Full-Pipeline Actions */}
            <div className="lg:col-span-7 flex flex-col min-h-[420px] rounded-xl bg-[#10131C] border border-[#272E44] overflow-hidden">
              <div className="px-4 py-2.5 bg-[#141824] border-b border-[#252C42] flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-xs font-bold text-white">
                  <span>裂变脚本与花字池 ({fissionItems.length} 套)</span>
                  {fissionMeta && (
                    <span className="px-2 py-0.5 rounded bg-[#00E5FF]/14 text-[#00E5FF] text-[10px] font-normal">
                      {fissionMeta.modelName}
                    </span>
                  )}
                </div>

                {fissionItems.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      if (checkedCount === fissionItems.length) {
                        setSelectedScriptIds(new Set());
                      } else {
                        setSelectedScriptIds(new Set(fissionItems.map((i) => i.id)));
                      }
                    }}
                    className="text-[11px] text-[#00E5FF] hover:underline"
                  >
                    {checkedCount === fissionItems.length ? '取消全选' : '全选全部'}
                  </button>
                )}
              </div>

              {fissionMeta?.fallbackNote && (
                <div className="px-4 py-1.5 bg-amber-500/12 border-b border-amber-500/30 text-[11px] text-amber-300">
                  {fissionMeta.fallbackNote}
                </div>
              )}

              <div className="flex-1 overflow-y-auto p-3.5 space-y-2.5">
                {fissionItems.length === 0 ? (
                  <div className="h-full min-h-[300px] flex flex-col items-center justify-center text-center px-6 space-y-2">
                    <div className="w-11 h-11 rounded-2xl bg-[#191F30] border border-[#2C3550] flex items-center justify-center text-[#00E5FF]">
                      <Sparkles className="w-5 h-5" />
                    </div>
                    <div className="text-xs font-semibold text-white">
                      输入左侧商品卖点，一键裂变多套「黄金3秒钩子口播 + 上下吸睛花字」
                    </div>
                    <p className="text-[11px] text-[#7E8596] max-w-md leading-relaxed">
                      未配置 API Key 时可直接体验内置千川爆款公式；点击右上角「配置大模型 / ASR Key」填入硅基流动或 DeepSeek 密钥即可调用千亿参数大模型深度创作。
                    </p>
                  </div>
                ) : (
                  fissionItems.map((item, idx) => {
                    const checked = selectedScriptIds.has(item.id);
                    return (
                      <div
                        key={item.id}
                        className={`p-3 rounded-xl border transition space-y-2 ${
                          checked
                            ? 'bg-[#171C2B] border-[#00E5FF]/50'
                            : 'bg-[#131722] border-[#252B3E] opacity-65'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={(e) => {
                                const next = new Set(selectedScriptIds);
                                if (e.target.checked) next.add(item.id);
                                else next.delete(item.id);
                                setSelectedScriptIds(next);
                              }}
                              className="accent-[#00E5FF]"
                            />
                            <span className="text-xs font-bold text-white font-mono">
                              #{String(idx + 1).padStart(2, '0')}
                            </span>
                            <span className="px-2 py-0.5 rounded bg-[#FFB800]/18 text-[#FFB800] text-[10px] font-semibold">
                              {item.angleBadge}
                            </span>
                          </label>
                          <span className="text-[10px] font-mono text-[#8A90A2]">
                            {item.spokenScript.length}字 · 约 {item.estDurationSec}s
                          </span>
                        </div>

                        {/* Editable Top & Bottom Fancy Titles */}
                        <div className="grid grid-cols-2 gap-2">
                          <div className="flex items-center gap-1.5 bg-[#0E111A] border border-[#262D42] rounded-lg px-2 py-1">
                            <span className="text-[10px] text-[#00E5FF] shrink-0">顶花字</span>
                            <input
                              type="text"
                              value={item.topTitle}
                              onChange={(e) => {
                                const v = e.target.value;
                                setFissionItems((list) =>
                                  list.map((x) => (x.id === item.id ? { ...x, topTitle: v } : x))
                                );
                              }}
                              className="w-full bg-transparent text-[11px] text-white outline-none"
                            />
                          </div>
                          <div className="flex items-center gap-1.5 bg-[#0E111A] border border-[#262D42] rounded-lg px-2 py-1">
                            <span className="text-[10px] text-[#FFB800] shrink-0">底CTA</span>
                            <input
                              type="text"
                              value={item.bottomTitle}
                              onChange={(e) => {
                                const v = e.target.value;
                                setFissionItems((list) =>
                                  list.map((x) =>
                                    x.id === item.id ? { ...x, bottomTitle: v } : x
                                  )
                                );
                              }}
                              className="w-full bg-transparent text-[11px] text-white outline-none"
                            />
                          </div>
                        </div>

                        {/* Editable Spoken Script */}
                        <textarea
                          rows={2}
                          value={item.spokenScript}
                          onChange={(e) => {
                            const v = e.target.value;
                            setFissionItems((list) =>
                              list.map((x) =>
                                x.id === item.id
                                  ? {
                                      ...x,
                                      spokenScript: v,
                                      estDurationSec:
                                        Math.round((v.length / 4.5) * 10) / 10,
                                    }
                                  : x
                              )
                            );
                          }}
                          className="w-full bg-[#0E111A] border border-[#262D42] focus:border-[#00E5FF] rounded-lg p-2 text-xs text-[#E5E7EB] outline-none resize-none leading-relaxed"
                        />
                      </div>
                    );
                  })
                )}
              </div>

              {/* Bottom 1-Click Pipeline Action Bar */}
              {fissionItems.length > 0 && (
                <div className="p-3 bg-[#141824] border-t border-[#262E45] flex flex-wrap items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      const picked = fissionItems.filter((i) => selectedScriptIds.has(i.id));
                      if (picked.length === 0) return;
                      if (picked.length === 1) {
                        setScriptMode('single');
                        setSingleText(picked[0].spokenScript);
                      } else {
                        setScriptMode('batch');
                        setBatchText(picked.map((p) => p.spokenScript).join('\n\n'));
                        setPendingOverlays(
                          picked.map((p) => ({
                            topTitle: p.topTitle,
                            bottomTitle: p.bottomTitle,
                          }))
                        );
                        setAssignMode('dispatch_groups');
                      }
                      setStudioTab('tts');
                    }}
                    disabled={checkedCount === 0 || synthesizingFromAi}
                    className="h-9 px-3 rounded-lg bg-[#22283C] hover:bg-[#2C344E] border border-[#36405E] text-xs text-[#CBD5E1] hover:text-white flex items-center gap-1.5 whitespace-nowrap transition disabled:opacity-40"
                  >
                    <span>送入配音台微调参数</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>

                  <div className="flex items-center gap-2 flex-wrap">
                    <button
                      type="button"
                      onClick={() => void handleOneClickDispatchFromAi('matrix_pool')}
                      disabled={checkedCount === 0 || synthesizingFromAi}
                      className="h-9 px-3.5 rounded-lg bg-[#FFB800]/16 hover:bg-[#FFB800] border border-[#FFB800]/45 text-[#FFB800] hover:text-[#111318] font-bold text-xs flex items-center gap-1.5 whitespace-nowrap transition disabled:opacity-40"
                    >
                      <Grid className="w-3.5 h-3.5" />
                      合成并导入矩阵池 ({checkedCount}套)
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        void handleOneClickDispatchFromAi(
                          checkedCount === 1 ? 'active_group' : 'dispatch_groups'
                        )
                      }
                      disabled={checkedCount === 0 || synthesizingFromAi}
                      className="h-9 px-4 rounded-lg bg-gradient-to-r from-[#00E5FF] to-[#00B4D8] text-[#061017] font-black text-xs flex items-center gap-1.5 whitespace-nowrap hover:brightness-110 transition disabled:opacity-40"
                    >
                      {synthesizingFromAi ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          正在合成配音并灌入视频组...
                        </>
                      ) : (
                        <>
                          <Zap className="w-3.5 h-3.5 fill-current" />
                          一键合成配音并灌入视频组 ({checkedCount}套全配齐)
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : (
          /* =====================================================================
             VIEW C: Tab 2 — Neural TTS & Smart Breath Removal Workbench
             ===================================================================== */
          <div className="flex-1 min-h-0 overflow-y-auto p-5 grid grid-cols-1 lg:grid-cols-12 gap-5">
            {/* Left 7 Cols: Script Input + Voice Picker */}
            <div className="lg:col-span-7 space-y-4">
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
                      当前字数：<strong className="text-white">{singleText.trim().length}</strong>{' '}
                      字 · 预计成片口播时长约{' '}
                      <strong className="text-[#00E5FF]">{estDurationSec.toFixed(1)}s</strong>
                      {activeGroup && activeGroup.clips.length > 0 && (
                        <span className="ml-2 text-[#9CA3AF]">
                          (当前组画面长{' '}
                          {formatShortSec(
                            activeGroup.clips.reduce(
                              (s, c) =>
                                s + Math.max(0.2, (c.trimEnd - c.trimStart) / (c.speed || 1)),
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
                    onChange={(e) => {
                      setBatchText(e.target.value);
                      setPendingOverlays(undefined);
                    }}
                    placeholder="每段文案之间用「空行」隔开，每段将独立生成一条高清口播音频..."
                    className="w-full rounded-xl bg-[#0E1017] border border-[#FFB800]/50 focus:border-[#FFB800] p-3 text-xs text-white leading-relaxed outline-none resize-none"
                  />
                  <div className="text-[11px] text-[#9CA3AF] flex items-center justify-between">
                    <span>
                      用<strong>空行</strong>分隔不同话术，当前共识别出{' '}
                      <strong className="text-[#FFB800]">{parsedBatchScripts.length} 条</strong>{' '}
                      独立口播脚本
                    </span>
                    {pendingOverlays && (
                      <span className="text-emerald-400">
                        ✓ 已携带 AI 生成的对应上下花字标题
                      </span>
                    )}
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
                            <span>气口能量门限</span>
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
                            <span>句间保留自然微停顿</span>
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

              <button
                onClick={handleGenerateTts}
                disabled={generatingTts}
                className="w-full py-3 rounded-xl bg-gradient-to-r from-[#00E5FF] to-[#00B4D8] text-[#061017] font-black text-xs sm:text-sm shadow-[0_0_24px_rgba(0,229,255,0.3)] hover:brightness-110 transition flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {generatingTts ? (
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
                            <strong className="text-[#00E5FF]">
                              {stats.newDuration.toFixed(2)}s
                            </strong>{' '}
                            (省 {stats.savedSec.toFixed(2)}s)
                          </span>
                        </div>
                      )}

                      <audio controls src={asset.url} className="w-full h-8 rounded" />
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
