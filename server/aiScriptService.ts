import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { AI_CONFIG_FILE } from './paths.js';
import {
  AI_PROVIDER_PRESETS,
  AI_SCRIPT_STYLES,
  AiEngineSettings,
  AiScriptGenerateRequest,
  createDefaultAiSettings,
  GeneratedAdScriptItem,
} from '../shared/schema.js';

export function loadAiSettings(): AiEngineSettings {
  const defaults = createDefaultAiSettings();
  if (!fs.existsSync(AI_CONFIG_FILE)) {
    return defaults;
  }
  try {
    const raw = JSON.parse(fs.readFileSync(AI_CONFIG_FILE, 'utf8'));
    return { ...defaults, ...raw };
  } catch {
    return defaults;
  }
}

export function saveAiSettings(patch: Partial<AiEngineSettings>): AiEngineSettings {
  const merged: AiEngineSettings = {
    ...loadAiSettings(),
    ...patch,
  };
  fs.writeFileSync(AI_CONFIG_FILE, JSON.stringify(merged, null, 2), 'utf8');
  return merged;
}

function normalizeBaseUrl(raw: string): string {
  return (raw || '').trim().replace(/\/+$/, '');
}

export async function testAiConnection(
  candidate?: Partial<AiEngineSettings>
): Promise<{ ok: boolean; latencyMs: number; message: string }> {
  const cfg: AiEngineSettings = { ...loadAiSettings(), ...(candidate || {}) };
  const baseUrl = normalizeBaseUrl(cfg.baseUrl || AI_PROVIDER_PRESETS[cfg.providerId]?.baseUrl);
  if (!baseUrl) {
    return { ok: false, latencyMs: 0, message: '请填写有效的接口 Base URL' };
  }
  if (cfg.providerId !== 'ollama_local' && !cfg.apiKey?.trim()) {
    return { ok: false, latencyMs: 0, message: '请先填写对应服务商的 API Key' };
  }

  const t0 = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);

  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (cfg.apiKey?.trim()) {
      headers.Authorization = `Bearer ${cfg.apiKey.trim()}`;
    }

    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers,
      signal: controller.signal,
      body: JSON.stringify({
        model: cfg.llmModel.trim(),
        messages: [{ role: 'user', content: '请仅回复OK两个字母' }],
        max_tokens: 12,
        temperature: 0.1,
      }),
    });

    clearTimeout(timer);
    const latencyMs = Date.now() - t0;

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      if (res.status === 401 || res.status === 403) {
        return { ok: false, latencyMs, message: 'API Key 无效或无权限，请检查密钥是否正确' };
      }
      if (res.status === 404) {
        return { ok: false, latencyMs, message: `找不到模型「${cfg.llmModel}」或接口路径不匹配` };
      }
      return {
        ok: false,
        latencyMs,
        message: `接口返回 HTTP ${res.status}: ${errText.slice(0, 100)}`,
      };
    }

    return {
      ok: true,
      latencyMs,
      message: `连接成功！模型「${cfg.llmModel}」响应耗时 ${latencyMs}ms`,
    };
  } catch (err: any) {
    clearTimeout(timer);
    return {
      ok: false,
      latencyMs: Date.now() - t0,
      message:
        err?.name === 'AbortError'
          ? '请求超时（12s），请检查网络或接口地址是否可达'
          : `网络连接失败：${err?.message || '未知错误'}`,
    };
  }
}

/**
 * Offline Qianchuan 6-Archetype Smart Formula Fission Engine
 * Works instantaneously with ZERO API Key, calibrating script length to targetDurationSec!
 */
export function buildOfflineFormulaScripts(
  req: AiScriptGenerateRequest
): GeneratedAdScriptItem[] {
  const prod = (req.productName || '这款宝藏好物').trim();
  const rawPoints = (req.sellingPoints || '高颜值实用，细节做工扎实，用过都夸好')
    .split(/[，,；;、\n]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const p1 = rawPoints[0] || '硬核升级配置';
  const p2 = rawPoints[1] || rawPoints[0] || '省心耐用免打理';
  const p3 = rawPoints[2] || '细节质感拉满';
  const pain = (req.painPoints || '平时费时费力还容易踩雷').trim();
  const cta = (req.ctaOffer || '点击下方链接抢源头限时福利').trim();
  const count = Math.max(1, Math.min(16, Number(req.count || 6)));
  const dur = req.targetDurationSec || 20;

  const extraDetail =
    dur >= 32
      ? `不管是日常高频使用还是送人都特别拿得出手，${p3}，身边同事朋友全都被我安利了一遍，口碑复购率拉满。`
      : dur >= 20
      ? `而且${p3}，上手体验感直接甩普通款几条街。`
      : '';

  const archetypes = [
    {
      badge: '痛点直击',
      top: `告别${pain.slice(0, 6)}！太香了`,
      bottom: `👇 ${cta.slice(0, 12)}`,
      spoken: `还在为${pain}发愁吗？快试试我挖到的${prod}！它主打${p1}，而且${p2}。${extraDetail}趁现在活动划算，${cta}！`,
    },
    {
      badge: '反向避坑',
      top: `别再乱买交智商税了！`,
      bottom: `🔥 ${p1.slice(0, 11)}`,
      spoken: `听句劝，买之前一定要看准配置！市面普通款太容易闲置，而这款${prod}直接做到${p1}，实测${p2}。${extraDetail}今天${cta}！`,
    },
    {
      badge: '硬核实测',
      top: `暴力实测！${p1.slice(0, 7)}`,
      bottom: `⚡ 实测不虚标 闭眼入`,
      spoken: `不吹不黑直接上实测！看看这款${prod}的表现，${p1}，再看细节${p2}！${extraDetail}真正经得起检验，赶紧${cta}！`,
    },
    {
      badge: '源头逼单',
      top: `源头工厂直发！省一半`,
      bottom: `🎁 ${cta.slice(0, 12)}`,
      spoken: `别去中间商那买贵了！同品质的${prod}今天源头直发，不仅${p1}，还支持${p2}。${extraDetail}库存不多，刷到赶紧${cta}！`,
    },
    {
      badge: '场景种草',
      top: `后悔没早入的效率神器！`,
      bottom: `✨ 每天省心又治愈`,
      spoken: `自从换上了这款${prod}，幸福感直接飙升！以前总遇到${pain}，现在${p1}加上${p2}，省时又省力。${extraDetail}${cta}！`,
    },
    {
      badge: '对比封神',
      top: `同价位天花板！细节绝了`,
      bottom: `👇 戳下方链接锁福利`,
      spoken: `挑来挑去还是这款${prod}最能打！对比了好几家，只有它同时兼顾${p1}和${p2}。${extraDetail}好价不等人，现在就${cta}！`,
    },
  ];

  // Reorder if user picked a specific style focus
  const styleOrderMap: Record<string, number[]> = {
    pain_point_hook: [0, 4, 1, 2, 3, 5],
    hardcore_test: [2, 5, 0, 1, 4, 3],
    anti_pitfall: [1, 2, 5, 0, 3, 4],
    promo_urgency: [3, 0, 5, 2, 1, 4],
    local_store: [4, 3, 0, 2, 5, 1],
  };
  const order = styleOrderMap[req.styleId] || [0, 1, 2, 3, 4, 5];

  const results: GeneratedAdScriptItem[] = [];
  const hookPrefixes = ['', '真没想到，', '姐妹们看过来，', '讲真的，', '实话实说，'];

  for (let i = 0; i < count; i++) {
    const base = archetypes[order[i % order.length]];
    const prefix = i >= order.length ? hookPrefixes[i % hookPrefixes.length] : '';
    const spoken = `${prefix}${base.spoken}`.replace(/！！+/g, '！');
    const cleanLen = spoken.replace(/\s+/g, '').length;
    results.push({
      id: `ai_scr_${uuidv4().slice(0, 8)}`,
      angleBadge: base.badge,
      topTitle: base.top.slice(0, 14),
      bottomTitle: base.bottom.slice(0, 16),
      spokenScript: spoken,
      estDurationSec: Math.max(4, Math.round((cleanLen / 4.5) * 10) / 10),
    });
  }

  return results;
}

function extractJsonArrayFromLlmText(raw: string): any[] | null {
  // Strip <think>...</think> blocks from reasoning models (DeepSeek-R1 / QwQ)
  const cleaned = raw
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/```json/gi, '')
    .replace(/```/g, '')
    .trim();

  const startBracket = cleaned.indexOf('[');
  const endBracket = cleaned.lastIndexOf(']');
  if (startBracket >= 0 && endBracket > startBracket) {
    try {
      const parsed = JSON.parse(cleaned.slice(startBracket, endBracket + 1));
      if (Array.isArray(parsed)) return parsed;
    } catch {
      // try object wrapper below
    }
  }

  try {
    const obj = JSON.parse(cleaned);
    if (Array.isArray(obj)) return obj;
    if (Array.isArray(obj?.scripts)) return obj.scripts;
    if (Array.isArray(obj?.items)) return obj.items;
  } catch {
    // ignore
  }
  return null;
}

export async function generateAdScripts(
  req: AiScriptGenerateRequest
): Promise<{
  scripts: GeneratedAdScriptItem[];
  engineUsed: 'cloud_llm' | 'offline_formula';
  modelName: string;
  fallbackNote?: string;
}> {
  const count = Math.max(1, Math.min(16, Number(req.count || 6)));
  const cfg = loadAiSettings();

  const hasUsableLlm =
    !req.useOfflineFormulaOnly &&
    (cfg.providerId === 'ollama_local' || Boolean(cfg.apiKey && cfg.apiKey.trim()));

  if (!hasUsableLlm) {
    return {
      scripts: buildOfflineFormulaScripts({ ...req, count }),
      engineUsed: 'offline_formula',
      modelName: '内置千川爆款公式引擎 (免Key)',
    };
  }

  const baseUrl = normalizeBaseUrl(cfg.baseUrl || AI_PROVIDER_PRESETS[cfg.providerId]?.baseUrl);
  const targetChars =
    req.targetDurationSec <= 12 ? '45~62字' : req.targetDurationSec <= 20 ? '75~98字' : '125~155字';
  const styleMeta = AI_SCRIPT_STYLES[req.styleId] || AI_SCRIPT_STYLES.mixed_horse_race;

  const systemPrompt = `你是顶尖巨量千川信息流广告编导与抖音爆款带货文案专家。
请严格根据用户提供的产品信息，裂变生成 ${count} 套互不重复、前3秒黄金钩子极强的短视频口播脚本与花字标题。
硬性要求：
1. spokenScript 必须是纯真人自然口播台词（禁止包含【画面】、(镜头)、emoji表情或舞台提示词，以便直接送入TTS语音合成），每条字数严格控制在 ${targetChars}（对应约 ${req.targetDurationSec} 秒语速）。
2. topTitle 为顶部吸睛大花字（不超过12个汉字，直击痛点或反差利益）；bottomTitle 为底部促销引导花字（不超过14个汉字）。
3. 每套脚本的切入角度必须明显不同（涵盖痛点引入、实测对比、避坑揭秘、人群场景、源头福利等）。
4. 仅输出合法的 JSON 数组，不要输出任何额外解释文字。数组元素格式如下：
[
  {
    "angleBadge": "痛点引入",
    "topTitle": "早八人4秒鲜榨自由！",
    "bottomTitle": "👇 源头直发 抢限时买1送1",
    "spokenScript": "纯口播台词内容..."
  }
]`;

  const userPrompt = `产品/品牌名称：${req.productName || '热销好物'}
核心卖点与参数：${req.sellingPoints || '品质升级，高性价比'}
目标人群痛点：${req.painPoints || '日常使用不便、传统产品易踩坑'}
促销福利与转化引导(CTA)：${req.ctaOffer || '点击下方链接抢限时特惠'}
脚本流派方向：${styleMeta.label}（${styleMeta.desc}）
需要生成套数：${count} 套（每套口播目标时长约 ${req.targetDurationSec} 秒，约 ${targetChars}）`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 45000);

  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (cfg.apiKey?.trim()) {
      headers.Authorization = `Bearer ${cfg.apiKey.trim()}`;
    }

    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers,
      signal: controller.signal,
      body: JSON.stringify({
        model: cfg.llmModel.trim(),
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.82,
      }),
    });
    clearTimeout(timer);

    if (!res.ok) {
      const errBody = await res.text().catch(() => '');
      throw new Error(`HTTP ${res.status}: ${errBody.slice(0, 120)}`);
    }

    const data: any = await res.json();
    const content = String(data?.choices?.[0]?.message?.content || '');
    const arr = extractJsonArrayFromLlmText(content);
    if (!arr || arr.length === 0) {
      throw new Error('模型返回格式无法解析为脚本数组');
    }

    const scripts: GeneratedAdScriptItem[] = arr.slice(0, count).map((raw: any, i: number) => {
      const spoken = String(raw?.spokenScript || raw?.script || raw?.text || '')
        .replace(/【[^】]*】/g, '')
        .replace(/\([^)]*\)/g, '')
        .trim();
      const cleanLen = spoken.replace(/\s+/g, '').length;
      return {
        id: `ai_scr_${uuidv4().slice(0, 8)}_${i}`,
        angleBadge: String(raw?.angleBadge || raw?.angle || `赛马方案#${i + 1}`).slice(0, 8),
        topTitle: String(raw?.topTitle || '').slice(0, 16),
        bottomTitle: String(raw?.bottomTitle || '').slice(0, 18),
        spokenScript: spoken,
        estDurationSec: Math.max(3, Math.round((cleanLen / 4.5) * 10) / 10),
      };
    });

    return {
      scripts,
      engineUsed: 'cloud_llm',
      modelName: cfg.llmModel,
    };
  } catch (err: any) {
    clearTimeout(timer);
    // Graceful fallback to formula engine if cloud call fails, while surfacing the reason!
    return {
      scripts: buildOfflineFormulaScripts({ ...req, count }),
      engineUsed: 'offline_formula',
      modelName: '内置千川公式引擎 (自动兜底)',
      fallbackNote: `大模型接口调用异常 (${err?.message || '连接超时'})，已自动使用本地爆款公式引擎生成`,
    };
  }
}
