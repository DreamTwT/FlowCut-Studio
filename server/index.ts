import express from 'express';
import cors from 'cors';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import {
  ensureStorageDirs,
  EXPORTS_DIR,
  FFMPEG_BIN,
  refreshMediaBinaries,
  ROOT_DIR,
  STORAGE_DIR,
  UPLOADS_DIR,
} from './paths.js';
import { ensureFfmpegReady } from './ffmpegBootstrap.js';
import { probeHardwareAcceleration } from './gpuDetector.js';
import {
  generateAdScripts,
  loadAiSettings,
  saveAiSettings,
  testAiConnection,
} from './aiScriptService.js';
import {
  prepareGroupSegmentsForLocalWasm,
  serveCachedHfModelFile,
  testCloudAsrConnection,
  transcribeGroupViaCloudAsr,
} from './asrService.js';
import {
  commitSceneSplitToProject,
  detectAudioBeats,
  detectVideoScenes,
} from './smartSplitBeatService.js';
import { ensureBuiltinSfxReady } from './sfxGenerator.js';
import { decodeUploadFilename, probeAndProcessFile } from './mediaService.js';
import {
  BreathRemovalResult,
  processEditedAudioAsset,
  removeAudioBreaths,
  synthesizeTtsToAsset,
} from './audioTtsService.js';
import {
  createBlankProject,
  deleteAssetFromProject,
  deleteProjectById,
  generateGroupsFromMatrix,
  getActiveProject,
  listProjects,
  loadProject,
  saveProject,
} from './projectStore.js';
import { ensureDemoProjectExists } from './seedDemo.js';
import {
  cancelBatchJob,
  getBatchJob,
  listRecentBatches,
  startBatchRender,
  streamBatchZip,
} from './renderEngine.js';
import {
  buildSyncedSubtitlesFromScript,
  MediaAsset,
  ProjectData,
} from '../shared/schema.js';

ensureStorageDirs();
ensureBuiltinSfxReady();

const app = express();
app.use(cors());
app.use(express.json({ limit: '100mb' }));

// Serve uploaded media, thumbnails, and exported MP4s with Range support for video scrubbing
app.use(
  '/storage',
  express.static(STORAGE_DIR, {
    acceptRanges: true,
    maxAge: '1h',
  })
);

// Multer disk storage for large production video/image/audio files
const uploadStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, UPLOADS_DIR);
  },
  filename: (_req, file, cb) => {
    const cleanOrig = decodeUploadFilename(file.originalname);
    const ext = path.extname(cleanOrig).toLowerCase() || '.mp4';
    cb(null, `up_${Date.now()}_${uuidv4().slice(0, 8)}${ext}`);
  },
});

const upload = multer({
  storage: uploadStorage,
  limits: {
    fileSize: 2 * 1024 * 1024 * 1024, // 2GB per file
    files: 40,
  },
});

app.get('/api/health', (_req, res) => {
  const bins = refreshMediaBinaries();
  res.json({
    ok: true,
    version: '2.1.0',
    isDesktop: process.env.FLOWCUT_DESKTOP === '1',
    ffmpeg: bins.ffmpegPath || FFMPEG_BIN,
    ffmpegFound: bins.ffmpegFound,
    storageDir: STORAGE_DIR,
    exportsDir: EXPORTS_DIR,
  });
});

app.get('/api/hardware', async (req, res) => {
  try {
    const force = req.query.refresh === '1';
    const report = await probeHardwareAcceleration(force);
    res.json({ hardware: report });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || '硬件加速探测失败' });
  }
});

// ============================================================================
// AI Engine Settings, Ad Script Fission & Dual-Mode ASR Speech-to-Subtitles
// ============================================================================
app.get('/api/ai/settings', (_req, res) => {
  res.json({ settings: loadAiSettings() });
});

app.put('/api/ai/settings', (req, res) => {
  try {
    const saved = saveAiSettings(req.body?.settings || req.body || {});
    res.json({ settings: saved });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || '保存 AI 配置失败' });
  }
});

app.post('/api/ai/test', async (req, res) => {
  try {
    const result = await testAiConnection(req.body?.settings);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ ok: false, latencyMs: 0, message: err?.message || '连接测试失败' });
  }
});

app.post('/api/ai/test-asr', async (req, res) => {
  try {
    const result = await testCloudAsrConnection(req.body?.settings);
    res.json(result);
  } catch (err: any) {
    res
      .status(500)
      .json({ ok: false, latencyMs: 0, message: err?.message || '云端语音识别连接测试失败' });
  }
});

app.post('/api/ai/scripts/generate', async (req, res) => {
  try {
    const result = await generateAdScripts(req.body);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'AI 脚本生成失败' });
  }
});

app.post('/api/projects/:id/groups/:groupId/asr/cloud', async (req, res) => {
  try {
    let proj = loadProject(req.params.id);
    if (req.body?.project) {
      proj = saveProject(req.body.project as ProjectData);
    }
    if (!proj) {
      res.status(404).json({ error: '找不到目标项目' });
      return;
    }
    const group = proj.videoGroups.find((g) => g.id === req.params.groupId);
    if (!group) {
      res.status(404).json({ error: '找不到目标视频组' });
      return;
    }
    const sourceTrack = req.body?.sourceTrack || 'auto';
    const result = await transcribeGroupViaCloudAsr(proj, group, sourceTrack);
    group.subtitles = {
      enabled: true,
      styleId: group.subtitles?.styleId || 'douyin_yellow',
      yPercent: group.subtitles?.yPercent || 74,
      fontScale: group.subtitles?.fontScale || 1.0,
      cues: result.cues,
    };
    const saved = saveProject(proj);
    res.json({
      ...result,
      project: saved,
    });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || '云端语音识别失败' });
  }
});

app.post('/api/projects/:id/groups/:groupId/asr/prepare-local', async (req, res) => {
  try {
    let proj = loadProject(req.params.id);
    if (req.body?.project) {
      proj = saveProject(req.body.project as ProjectData);
    }
    if (!proj) {
      res.status(404).json({ error: '找不到目标项目' });
      return;
    }
    const group = proj.videoGroups.find((g) => g.id === req.params.groupId);
    if (!group) {
      res.status(404).json({ error: '找不到目标视频组' });
      return;
    }
    const sourceTrack = req.body?.sourceTrack || 'auto';
    const prepared = await prepareGroupSegmentsForLocalWasm(proj, group, sourceTrack);
    res.json(prepared);
  } catch (err: any) {
    res.status(500).json({ error: err?.message || '初始化本地离线语音识别失败' });
  }
});

app.use('/api/asr/hf-model', (req, res) => {
  void serveCachedHfModelFile(req.path, res);
});

// ============================================================================
// v2.3 Smart Long-Video Scene Split & BGM Beat-Sync Endpoints
// ============================================================================

app.post('/api/projects/:id/assets/:assetId/scene-detect', async (req, res) => {
  try {
    let proj = loadProject(req.params.id);
    if (req.body?.project) {
      proj = saveProject(req.body.project as ProjectData);
    }
    if (!proj) {
      res.status(404).json({ error: '找不到目标项目' });
      return;
    }
    const asset = proj.assets.find((a) => a.id === req.params.assetId);
    if (!asset) {
      res.status(404).json({ error: '找不到目标视频素材' });
      return;
    }
    const result = await detectVideoScenes(asset, {
      mode: req.body?.mode || 'smart_scdet',
      sensitivity: req.body?.sensitivity || 'standard',
      minShotSec: req.body?.minShotSec ?? 1.5,
      fixedIntervalSec: req.body?.fixedIntervalSec ?? 3.0,
    });
    res.json(result);
  } catch (err: any) {
    console.error('[SceneDetect Error]', err);
    res.status(500).json({ error: err?.message || '智能镜头切点扫描失败' });
  }
});

app.post('/api/projects/:id/assets/:assetId/scene-split-commit', (req, res) => {
  try {
    let proj = loadProject(req.params.id);
    if (req.body?.project) {
      proj = saveProject(req.body.project as ProjectData);
    }
    if (!proj) {
      res.status(404).json({ error: '找不到目标项目' });
      return;
    }
    const result = commitSceneSplitToProject(proj, req.params.assetId, {
      segments: req.body?.segments || [],
      dispatchMode: req.body?.dispatchMode || 'library_only',
      targetGroupId: req.body?.targetGroupId,
      removeOriginalAsset: Boolean(req.body?.removeOriginalAsset),
    });
    res.json(result);
  } catch (err: any) {
    console.error('[SceneSplitCommit Error]', err);
    res.status(500).json({ error: err?.message || '保存拆分镜头失败' });
  }
});

app.post('/api/projects/:id/assets/:assetId/beats', async (req, res) => {
  try {
    let proj = loadProject(req.params.id);
    if (req.body?.project) {
      proj = saveProject(req.body.project as ProjectData);
    }
    if (!proj) {
      res.status(404).json({ error: '找不到目标项目' });
      return;
    }
    const asset = proj.assets.find((a) => a.id === req.params.assetId);
    if (!asset) {
      res.status(404).json({ error: '找不到目标音乐素材' });
      return;
    }
    const result = await detectAudioBeats(asset, {
      trimStart: req.body?.trimStart,
      trimEnd: req.body?.trimEnd,
      speed: req.body?.speed,
      density: req.body?.density || 'standard',
    });
    res.json(result);
  } catch (err: any) {
    console.error('[BeatDetect Error]', err);
    res.status(500).json({ error: err?.message || '音乐鼓点节拍分析失败' });
  }
});

app.post('/api/system/open-exports', async (req, res) => {
  const rawBatchId = String(req.body?.batchId || '').replace(/[^a-zA-Z0-9_-]/g, '');
  const targetDir =
    rawBatchId && fs.existsSync(path.join(EXPORTS_DIR, rawBatchId))
      ? path.join(EXPORTS_DIR, rawBatchId)
      : EXPORTS_DIR;

  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  try {
    const { execFile } = await import('child_process');
    if (process.platform === 'win32') {
      execFile('explorer.exe', [targetDir]);
    } else if (process.platform === 'darwin') {
      execFile('open', [targetDir]);
    } else {
      execFile('xdg-open', [targetDir]);
    }
    res.json({ ok: true, openedPath: targetDir });
  } catch (err: any) {
    res.json({ ok: false, openedPath: targetDir, error: err?.message });
  }
});

app.get('/api/bootstrap', async (_req, res) => {
  try {
    let active = getActiveProject();
    if (!active) {
      active = await ensureDemoProjectExists();
    }
    res.json({
      project: active,
      projects: listProjects(),
      recentBatches: listRecentBatches().slice(0, 5),
    });
  } catch (err: any) {
    console.error('Bootstrap error:', err);
    res.status(500).json({ error: err?.message || '初始化工程失败' });
  }
});

app.get('/api/projects', (_req, res) => {
  res.json({ projects: listProjects() });
});

app.post('/api/projects/new', (req, res) => {
  const name = (req.body?.name || '').trim() || '新建信息流生产项目';
  const proj = saveProject(createBlankProject(name));
  res.json({ project: proj, projects: listProjects() });
});

app.post('/api/projects/demo', async (_req, res) => {
  try {
    const proj = await ensureDemoProjectExists();
    res.json({ project: proj, projects: listProjects() });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || '创建演示工程失败' });
  }
});

app.post('/api/projects/import', (req, res) => {
  try {
    const incoming = req.body?.project as ProjectData;
    if (!incoming || !Array.isArray(incoming.videoGroups)) {
      res.status(400).json({ error: '无效的工程文件格式' });
      return;
    }
    incoming.id = uuidv4();
    incoming.name = `${incoming.name || '导入项目'} (导入)`;
    const saved = saveProject(incoming);
    res.json({ project: saved, projects: listProjects() });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || '导入失败' });
  }
});

app.get('/api/projects/:id', (req, res) => {
  const proj = loadProject(req.params.id);
  if (!proj) {
    res.status(404).json({ error: '找不到该项目' });
    return;
  }
  res.json({ project: proj, projects: listProjects() });
});

app.put('/api/projects/:id', (req, res) => {
  const body = req.body as ProjectData;
  if (!body || body.id !== req.params.id) {
    res.status(400).json({ error: '项目数据不匹配' });
    return;
  }
  const saved = saveProject(body);
  res.json({ project: saved, projects: listProjects() });
});

app.delete('/api/projects/:id', (req, res) => {
  try {
    const activeId =
      typeof req.query.activeId === 'string' ? req.query.activeId : undefined;
    const result = deleteProjectById(req.params.id, activeId);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err?.message || '删除工程失败' });
  }
});

app.post('/api/projects/:id/assets/upload', upload.array('files', 40), async (req, res) => {
  try {
    const proj = loadProject(String(req.params.id));
    if (!proj) {
      res.status(404).json({ error: '找不到目标项目' });
      return;
    }
    const files = (req.files as Express.Multer.File[]) || [];
    const sceneTag = (req.body?.sceneTag as any) || '未分类';
    const createdAssets = [];

    for (const f of files) {
      const displayName = decodeUploadFilename(f.originalname);
      const asset = await probeAndProcessFile(f.path, f.filename, displayName, f.mimetype);
      if (sceneTag && sceneTag !== '未分类') {
        asset.sceneTag = sceneTag;
      }
      proj.assets.unshift(asset);
      createdAssets.push(asset);
    }

    saveProject(proj);
    res.json({ assets: createdAssets, project: proj });
  } catch (err: any) {
    console.error('Upload error:', err);
    res.status(500).json({ error: err?.message || '素材解析入库失败' });
  }
});

app.delete('/api/projects/:id/assets/:assetId', (req, res) => {
  const proj = loadProject(req.params.id);
  if (!proj) {
    res.status(404).json({ error: '找不到目标项目' });
    return;
  }
  const updated = deleteAssetFromProject(proj, req.params.assetId);
  res.json({ project: updated });
});

// AI Text-to-Speech (Single or Batch Scripts + Optional Immediate Breath Removal)
app.post('/api/projects/:id/tts', async (req, res) => {
  try {
    let proj = loadProject(req.params.id);
    if (req.body?.project) {
      proj = saveProject(req.body.project as ProjectData);
    }
    if (!proj) {
      res.status(404).json({ error: '找不到目标项目' });
      return;
    }

    const rawScripts: string[] = Array.isArray(req.body?.scripts)
      ? req.body.scripts
      : req.body?.text
      ? [String(req.body.text)]
      : [];

    const scripts = rawScripts.map((s) => String(s || '').trim()).filter(Boolean);
    if (scripts.length === 0) {
      res.status(400).json({ error: '请输入至少一条口播文案' });
      return;
    }

    const createdAssets: MediaAsset[] = [];
    const statsList: Array<BreathRemovalResult | undefined> = [];

    for (let i = 0; i < scripts.length; i++) {
      const result = await synthesizeTtsToAsset({
        text: scripts[i],
        voiceId: req.body?.voiceId,
        ratePct: req.body?.ratePct,
        pitchHz: req.body?.pitchHz,
        titleName: scripts.length === 1 ? req.body?.titleName : undefined,
        removeBreath: Boolean(req.body?.removeBreath),
        breathOptions: req.body?.breathOptions,
      });
      proj.assets.unshift(result.asset);
      createdAssets.push(result.asset);
      statsList.push(result.breathStats);
    }

    const assignMode: string = req.body?.assignMode || 'library_only';
    const targetGroupId: string | undefined = req.body?.targetGroupId;
    const autoSubtitles = req.body?.autoSubtitles !== false;
    const scriptOverlays: Array<{ topTitle?: string; bottomTitle?: string }> | undefined =
      Array.isArray(req.body?.scriptOverlays) ? req.body.scriptOverlays : undefined;

    if (assignMode === 'active_group' && createdAssets[0]) {
      const grp =
        proj.videoGroups.find((g) => g.id === targetGroupId) || proj.videoGroups[0];
      if (grp) {
        grp.voiceoverAssetId = createdAssets[0].id;
        grp.voiceoverVolume = grp.voiceoverVolume ?? 1.15;
        grp.bgmDucking = true;
        if (scriptOverlays?.[0]) {
          if (scriptOverlays[0].topTitle) grp.overlay.topTitle = scriptOverlays[0].topTitle;
          if (scriptOverlays[0].bottomTitle) {
            grp.overlay.bottomTitle = scriptOverlays[0].bottomTitle;
          }
        }
        if (autoSubtitles && createdAssets[0].ttsSourceText) {
          grp.subtitles = {
            enabled: true,
            styleId: grp.subtitles?.styleId || 'douyin_yellow',
            yPercent: grp.subtitles?.yPercent || 74,
            fontScale: grp.subtitles?.fontScale || 1.0,
            cues: buildSyncedSubtitlesFromScript(
              createdAssets[0].ttsSourceText,
              createdAssets[0].duration,
              grp.voiceoverDelaySec || 0
            ),
          };
        }
      }
    } else if (assignMode === 'dispatch_groups' && createdAssets.length > 0) {
      proj.videoGroups.forEach((g, idx) => {
        const pickedIdx = idx % createdAssets.length;
        const picked = createdAssets[pickedIdx];
        g.voiceoverAssetId = picked.id;
        g.voiceoverVolume = g.voiceoverVolume ?? 1.15;
        g.bgmDucking = true;
        if (scriptOverlays?.[pickedIdx]) {
          if (scriptOverlays[pickedIdx].topTitle) {
            g.overlay.topTitle = scriptOverlays[pickedIdx].topTitle!;
          }
          if (scriptOverlays[pickedIdx].bottomTitle) {
            g.overlay.bottomTitle = scriptOverlays[pickedIdx].bottomTitle!;
          }
        }
        if (autoSubtitles && picked.ttsSourceText) {
          g.subtitles = {
            enabled: true,
            styleId: g.subtitles?.styleId || 'douyin_yellow',
            yPercent: g.subtitles?.yPercent || 74,
            fontScale: g.subtitles?.fontScale || 1.0,
            cues: buildSyncedSubtitlesFromScript(
              picked.ttsSourceText,
              picked.duration,
              g.voiceoverDelaySec || 0
            ),
          };
        }
      });
    } else if (assignMode === 'matrix_pool' && createdAssets.length > 0) {
      const existing = proj.matrix.voiceoverPoolAssetIds || [];
      proj.matrix.voiceoverPoolAssetIds = Array.from(
        new Set([...existing, ...createdAssets.map((a) => a.id)])
      );
      if (scriptOverlays && scriptOverlays.length > 0) {
        const newTops = scriptOverlays.map((o) => o.topTitle?.trim()).filter(Boolean) as string[];
        const newBots = scriptOverlays
          .map((o) => o.bottomTitle?.trim())
          .filter(Boolean) as string[];
        if (newTops.length > 0) {
          proj.matrix.topTitlePool = Array.from(new Set([...newTops, ...proj.matrix.topTitlePool]));
        }
        if (newBots.length > 0) {
          proj.matrix.bottomTitlePool = Array.from(
            new Set([...newBots, ...proj.matrix.bottomTitlePool])
          );
        }
      }
    }

    const saved = saveProject(proj);
    res.json({
      assets: createdAssets,
      breathStats: statsList,
      project: saved,
    });
  } catch (err: any) {
    console.error('TTS error:', err);
    res.status(500).json({ error: err?.message || '文字转语音失败' });
  }
});

// One-click Smart Breath / Pause Removal on ANY existing Audio Asset
app.post('/api/projects/:id/assets/:assetId/remove-breath', async (req, res) => {
  try {
    let proj = loadProject(req.params.id);
    if (req.body?.project) {
      proj = saveProject(req.body.project as ProjectData);
    }
    if (!proj) {
      res.status(404).json({ error: '找不到目标项目' });
      return;
    }

    const srcAsset = proj.assets.find((a) => a.id === req.params.assetId);
    if (!srcAsset || srcAsset.type !== 'audio') {
      res.status(404).json({ error: '找不到目标音频素材' });
      return;
    }

    const srcPath = path.join(UPLOADS_DIR, srcAsset.filename);
    if (!fs.existsSync(srcPath)) {
      res.status(404).json({ error: '原始音频文件不存在' });
      return;
    }

    const newStoredName = `clean_${Date.now()}_${uuidv4().slice(0, 8)}.mp3`;
    const newPath = path.join(UPLOADS_DIR, newStoredName);
    const stats = await removeAudioBreaths(srcPath, newPath, req.body?.breathOptions);

    const replaceInPlace = req.body?.replaceInPlace !== false;
    if (replaceInPlace) {
      const probed = await probeAndProcessFile(
        newPath,
        newStoredName,
        srcAsset.name.includes('去气口') ? srcAsset.name : `${srcAsset.name}(已去气口)`,
        'audio/mpeg',
        srcAsset.id
      );
      srcAsset.filename = newStoredName;
      srcAsset.url = probed.url;
      srcAsset.duration = probed.duration;
      srcAsset.sizeBytes = probed.sizeBytes;
      srcAsset.defaultTrimStart = 0;
      srcAsset.defaultTrimEnd = probed.duration;
      srcAsset.name = probed.name;
      srcAsset.breathRemoved = true;
      srcAsset.breathSavedSec = stats.savedSec;
      srcAsset.breathCutCount = stats.cutCount;

      // Update any group trim end that pointed past new duration
      for (const g of proj.videoGroups) {
        if (g.voiceoverAssetId === srcAsset.id) {
          g.voiceoverTrimStart = 0;
          g.voiceoverTrimEnd = probed.duration;
        }
        if (g.bgmAssetId === srcAsset.id) {
          g.bgmTrimStart = 0;
          g.bgmTrimEnd = probed.duration;
        }
      }

      const saved = saveProject(proj);
      res.json({ asset: srcAsset, breathStats: stats, project: saved });
    } else {
      const cleanName = srcAsset.name.includes('去气口')
        ? `${srcAsset.name}_副本`
        : `${srcAsset.name}(已去气口)`;
      const newAsset = await probeAndProcessFile(newPath, newStoredName, cleanName, 'audio/mpeg');
      newAsset.audioRole = srcAsset.audioRole;
      newAsset.ttsSourceText = srcAsset.ttsSourceText;
      newAsset.ttsVoiceId = srcAsset.ttsVoiceId;
      newAsset.breathRemoved = true;
      newAsset.breathSavedSec = stats.savedSec;
      newAsset.breathCutCount = stats.cutCount;
      proj.assets.unshift(newAsset);
      const saved = saveProject(proj);
      res.json({ asset: newAsset, breathStats: stats, project: saved });
    }
  } catch (err: any) {
    console.error('Remove breath error:', err);
    res.status(500).json({ error: err?.message || '去气口处理失败' });
  }
});

// Physical Audio Clip Render (Trim + Speed + Fade In/Out + Optional Breath Removal)
app.post('/api/projects/:id/assets/:assetId/audio-edit', async (req, res) => {
  try {
    let proj = loadProject(req.params.id);
    if (req.body?.project) {
      proj = saveProject(req.body.project as ProjectData);
    }
    if (!proj) {
      res.status(404).json({ error: '找不到目标项目' });
      return;
    }

    const srcAsset = proj.assets.find((a) => a.id === req.params.assetId);
    if (!srcAsset || srcAsset.type !== 'audio') {
      res.status(404).json({ error: '找不到目标音频素材' });
      return;
    }

    const result = await processEditedAudioAsset({
      sourceAsset: srcAsset,
      trimStart: Number(req.body?.trimStart ?? 0),
      trimEnd: Number(req.body?.trimEnd ?? srcAsset.duration),
      speed: Number(req.body?.speed ?? 1.0),
      fadeInSec: Number(req.body?.fadeInSec ?? 0),
      fadeOutSec: Number(req.body?.fadeOutSec ?? 0),
      removeBreath: Boolean(req.body?.removeBreath),
      breathOptions: req.body?.breathOptions,
      newName: req.body?.newName,
    });

    proj.assets.unshift(result.asset);
    const saved = saveProject(proj);
    res.json({ asset: result.asset, breathStats: result.breathStats, project: saved });
  } catch (err: any) {
    console.error('Audio edit error:', err);
    res.status(500).json({ error: err?.message || '音频剪辑导出失败' });
  }
});

app.post('/api/projects/:id/matrix/generate', (req, res) => {
  const proj = loadProject(req.params.id);
  if (!proj) {
    res.status(404).json({ error: '找不到目标项目' });
    return;
  }
  if (req.body?.project) {
    // Sync latest client state first
    Object.assign(proj, req.body.project);
  }
  const result = generateGroupsFromMatrix(proj, req.body?.matrix);
  res.json(result);
});

app.post('/api/projects/:id/render', (req, res) => {
  let proj = loadProject(req.params.id);
  if (req.body?.project) {
    proj = saveProject(req.body.project as ProjectData);
  }
  if (!proj) {
    res.status(404).json({ error: '找不到目标项目' });
    return;
  }
  const batch = startBatchRender(proj, req.body?.options || {});
  res.json({ batch });
});

app.get('/api/renders', (_req, res) => {
  res.json({ batches: listRecentBatches() });
});

app.get('/api/renders/:batchId', (req, res) => {
  const batch = getBatchJob(req.params.batchId);
  if (!batch) {
    res.status(404).json({ error: '找不到该渲染批次' });
    return;
  }
  res.json({ batch });
});

app.post('/api/renders/:batchId/cancel', (req, res) => {
  const batch = cancelBatchJob(req.params.batchId);
  if (!batch) {
    res.status(404).json({ error: '找不到该渲染批次' });
    return;
  }
  res.json({ batch });
});

app.get('/api/renders/:batchId/zip', (req, res) => {
  streamBatchZip(req.params.batchId, res);
});

app.get('/api/download/export/:batchId/:filename', (req, res) => {
  const safeName = path.basename(req.params.filename);
  const filePath = path.join(EXPORTS_DIR, path.basename(req.params.batchId), safeName);
  if (!fs.existsSync(filePath)) {
    res.status(404).send('文件不存在');
    return;
  }
  const encoded = encodeURIComponent(safeName);
  const ext = path.extname(safeName).toLowerCase();
  const mime =
    ext === '.jpg' || ext === '.jpeg'
      ? 'image/jpeg'
      : ext === '.png'
      ? 'image/png'
      : 'video/mp4';
  res.setHeader('Content-Type', mime);
  res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encoded}`);
  fs.createReadStream(filePath).pipe(res);
});

async function startServer() {
  const PORT = Number(process.env.PORT || 3000);
  const isProd = process.env.NODE_ENV === 'production';

  // Ensure local/system FFmpeg is ready (auto-downloads from Alibaba Domestic CDN on first launch if needed)
  await ensureFfmpegReady();
  // Warm up hardware GPU encoder cache in background
  void probeHardwareAcceleration(true);

  // Pre-seed demo project before listening so initial page load is instantaneous
  if (!getActiveProject()) {
    console.log('[FlowCut] Generating realistic demo media assets on first launch...');
    try {
      await ensureDemoProjectExists();
      console.log('[FlowCut] Demo project ready.');
    } catch (e: any) {
      console.warn('[FlowCut] Demo seed skipped:', e?.message);
    }
  }

  const http = await import('http');
  const httpServer = http.createServer(app);

  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      configFile: path.join(ROOT_DIR, 'vite.config.ts'),
      server: {
        middlewareMode: true,
        allowedHosts: true,
        hmr: {
          server: httpServer,
        },
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const clientDist = path.join(ROOT_DIR, 'public-app');
    app.use(express.static(clientDist));
    app.use((_req, res) => {
      res.sendFile(path.join(clientDist, 'index.html'));
    });
  }

  const openBrowserIfRequested = async (boundPort: number) => {
    if (process.env.AUTO_OPEN_BROWSER !== '1') return;
    const url = `http://localhost:${boundPort}`;
    try {
      const { exec } = await import('child_process');
      if (process.platform === 'win32') {
        exec(`cmd /c start "" "${url}"`);
      } else if (process.platform === 'darwin') {
        exec(`open "${url}"`);
      } else {
        exec(`xdg-open "${url}"`);
      }
    } catch {
      // ignore
    }
  };

  const listenWithFallback = (portToTry: number, maxPort: number) => {
    const onListening = () => {
      httpServer.removeListener('error', onError);
      console.log(
        `[FlowCut Pro] Unified Production Workbench listening on http://0.0.0.0:${portToTry}`
      );
      if (isProd) {
        console.log('========================================================');
        console.log(`  [✓] 生产工作台已就绪: http://localhost:${portToTry}`);
        console.log('  [!] 使用及批量导出 MP4 期间，请保持本窗口开启');
        console.log('========================================================');
      }
      void openBrowserIfRequested(portToTry);
    };
    const onError = (err: any) => {
      httpServer.removeListener('listening', onListening);
      if (isProd && err?.code === 'EADDRINUSE' && portToTry < maxPort) {
        console.log(`[提示] 端口 ${portToTry} 已被占用，正在自动切换至端口 ${portToTry + 1}...`);
        listenWithFallback(portToTry + 1, maxPort);
      } else {
        console.error('[启动失败]', err?.message || err);
        process.exit(1);
      }
    };
    httpServer.once('error', onError);
    httpServer.once('listening', onListening);
    httpServer.listen(portToTry, '0.0.0.0');
  };

  listenWithFallback(PORT, isProd ? PORT + 10 : PORT);
}

void startServer();
