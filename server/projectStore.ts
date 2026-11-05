import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { PROJECTS_DIR, UPLOADS_DIR, THUMBS_DIR } from './paths.js';
import {
  buildSyncedSubtitlesFromScript,
  FULL_CROP,
  generateDedupVariant,
  MatrixConfig,
  MediaAsset,
  ProjectData,
  TimelineClip,
  VideoGroup,
} from '../shared/schema.js';

const ACTIVE_META_FILE = path.join(PROJECTS_DIR, '_active.json');

export function createBlankProject(name = '新建信息流混剪项目'): ProjectData {
  const id = uuidv4();
  return {
    id,
    name,
    updatedAt: new Date().toISOString(),
    aspectRatio: '9:16',
    exportQuality: '1080p',
    exportFps: 30,
    exportCrf: 23,
    filenamePattern: '{project}_{index}_{group}',
    assets: [],
    videoGroups: [
      {
        id: uuidv4(),
        name: '信息流成片 #01',
        selectedForExport: true,
        clips: [],
        overlay: {
          topTitle: '',
          bottomTitle: '',
          styleId: 'douyin_yellow',
          topY: 13,
          bottomY: 83,
          fontScale: 1.0,
        },
        bgmAssetId: null,
        bgmVolume: 0.35,
        clipMasterVolume: 1.0,
        audioFadeOut: true,
      },
    ],
    matrix: {
      slots: [
        { id: uuidv4(), name: '🔥 前3秒吸睛开头', badgeColor: '#FF4D4F', assetIds: [] },
        { id: uuidv4(), name: '💡 痛点/场景引入', badgeColor: '#FFB800', assetIds: [] },
        { id: uuidv4(), name: '💎 核心卖点实测', badgeColor: '#00E5FF', assetIds: [] },
        { id: uuidv4(), name: '🎯 促销福利CTA', badgeColor: '#A855F7', assetIds: [] },
      ],
      topTitlePool: [
        '后悔没早入！实测太惊艳了',
        '源头直供价！立省一半预算',
        '同品类天花板！细节拉满',
      ],
      bottomTitlePool: [
        '👇 点击下方链接 抢限时福利',
        '🔥 今日下单享买1送1特权',
      ],
      styleId: 'douyin_yellow',
      bgmPoolAssetIds: [],
      defaultTransition: 'fade',
      defaultFitMode: 'cover',
      strategy: 'balanced_limit',
      targetCount: 6,
      appendMode: 'append',
    },
  };
}

export function listProjects(): Array<{ id: string; name: string; updatedAt: string; groupCount: number; assetCount: number }> {
  if (!fs.existsSync(PROJECTS_DIR)) return [];
  const files = fs.readdirSync(PROJECTS_DIR).filter((f) => f.endsWith('.json') && !f.startsWith('_'));
  const items: Array<{ id: string; name: string; updatedAt: string; groupCount: number; assetCount: number }> = [];
  for (const f of files) {
    try {
      const data = JSON.parse(fs.readFileSync(path.join(PROJECTS_DIR, f), 'utf8')) as ProjectData;
      items.push({
        id: data.id,
        name: data.name,
        updatedAt: data.updatedAt,
        groupCount: data.videoGroups?.length || 0,
        assetCount: data.assets?.length || 0,
      });
    } catch {
      // ignore corrupted
    }
  }
  return items.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function saveProject(project: ProjectData): ProjectData {
  project.updatedAt = new Date().toISOString();
  const filePath = path.join(PROJECTS_DIR, `${project.id}.json`);
  fs.writeFileSync(filePath, JSON.stringify(project, null, 2), 'utf8');
  fs.writeFileSync(ACTIVE_META_FILE, JSON.stringify({ activeProjectId: project.id }), 'utf8');
  return project;
}

function readProjectRaw(id: string): ProjectData | null {
  const filePath = path.join(PROJECTS_DIR, `${id}.json`);
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8')) as ProjectData;
  } catch {
    return null;
  }
}

export function loadProject(id: string): ProjectData | null {
  const project = readProjectRaw(id);
  if (!project) return null;
  fs.writeFileSync(ACTIVE_META_FILE, JSON.stringify({ activeProjectId: project.id }), 'utf8');
  return project;
}

export function deleteProjectById(
  targetId: string,
  currentActiveId?: string
): {
  project: ProjectData;
  projects: Array<{
    id: string;
    name: string;
    updatedAt: string;
    groupCount: number;
    assetCount: number;
  }>;
  switchedActive: boolean;
  deletedName: string;
} {
  const targetData = readProjectRaw(targetId);
  const deletedName = targetData?.name || '未命名工程';
  const targetFile = path.join(PROJECTS_DIR, `${targetId}.json`);
  if (fs.existsSync(targetFile)) {
    fs.unlinkSync(targetFile);
  }

  const remainingSummaries = listProjects();

  // Clean up uploaded/synthesized media files exclusively owned by the deleted project
  // (preserve shared files and built-in demo_* seed files so reloading demo stays instant)
  if (targetData?.assets?.length) {
    const referencedFilenames = new Set<string>();
    for (const summary of remainingSummaries) {
      const other = readProjectRaw(summary.id);
      if (other?.assets) {
        for (const a of other.assets) {
          if (a.filename) referencedFilenames.add(a.filename);
        }
      }
    }

    for (const asset of targetData.assets) {
      if (
        asset.filename &&
        !asset.filename.startsWith('demo_') &&
        !referencedFilenames.has(asset.filename)
      ) {
        const upPath = path.join(UPLOADS_DIR, asset.filename);
        if (fs.existsSync(upPath)) {
          try {
            fs.unlinkSync(upPath);
          } catch {
            // ignore
          }
        }
        const thumbPath = path.join(THUMBS_DIR, `thumb_${asset.id}.jpg`);
        if (fs.existsSync(thumbPath)) {
          try {
            fs.unlinkSync(thumbPath);
          } catch {
            // ignore
          }
        }
      }
    }
  }

  // Decide which project should be active after deletion
  if (currentActiveId && currentActiveId !== targetId) {
    const stillActive = loadProject(currentActiveId);
    if (stillActive) {
      return {
        project: stillActive,
        projects: listProjects(),
        switchedActive: false,
        deletedName,
      };
    }
  }

  if (remainingSummaries.length > 0) {
    const nextProj = loadProject(remainingSummaries[0].id)!;
    return {
      project: nextProj,
      projects: listProjects(),
      switchedActive: true,
      deletedName,
    };
  }

  // All projects were deleted -> create a clean blank project so workspace stays ready
  const fresh = saveProject(createBlankProject('新建信息流生产项目'));
  return {
    project: fresh,
    projects: listProjects(),
    switchedActive: true,
    deletedName,
  };
}

export function getActiveProject(): ProjectData | null {
  if (fs.existsSync(ACTIVE_META_FILE)) {
    try {
      const { activeProjectId } = JSON.parse(fs.readFileSync(ACTIVE_META_FILE, 'utf8'));
      if (activeProjectId) {
        const proj = loadProject(activeProjectId);
        if (proj) return proj;
      }
    } catch {
      // ignore
    }
  }
  const all = listProjects();
  if (all.length > 0) {
    return loadProject(all[0].id);
  }
  return null;
}

export function deleteAssetFromProject(project: ProjectData, assetId: string): ProjectData {
  const asset = project.assets.find((a) => a.id === assetId);
  project.assets = project.assets.filter((a) => a.id !== assetId);

  // Remove references from video groups & matrix
  for (const g of project.videoGroups) {
    g.clips = g.clips.filter((c) => c.assetId !== assetId);
    if (g.bgmAssetId === assetId) {
      g.bgmAssetId = null;
    }
    if (g.voiceoverAssetId === assetId) {
      g.voiceoverAssetId = null;
    }
    if (g.watermark?.imageAssetId === assetId) {
      g.watermark.imageAssetId = null;
    }
  }
  for (const s of project.matrix.slots) {
    s.assetIds = s.assetIds.filter((id) => id !== assetId);
  }
  project.matrix.bgmPoolAssetIds = project.matrix.bgmPoolAssetIds.filter((id) => id !== assetId);
  if (project.matrix.voiceoverPoolAssetIds) {
    project.matrix.voiceoverPoolAssetIds = project.matrix.voiceoverPoolAssetIds.filter(
      (id) => id !== assetId
    );
  }

  // Check if any asset in the SAME project (e.g. zero-copy split sub-clips) or OTHER projects
  // still references this physical file before unlinking
  if (asset) {
    const usedInSameProject = project.assets.some((a) => a.filename === asset.filename);
    let usedElsewhere = usedInSameProject;
    if (!usedElsewhere) {
      const others = listProjects().filter((p) => p.id !== project.id);
      for (const op of others) {
        const otherData = readProjectRaw(op.id);
        if (otherData?.assets.some((a) => a.filename === asset.filename)) {
          usedElsewhere = true;
          break;
        }
      }
    }
    if (!usedElsewhere) {
      const upPath = path.join(UPLOADS_DIR, asset.filename);
      if (fs.existsSync(upPath)) fs.unlinkSync(upPath);
    }

    // Clean up this asset's dedicated thumbnail if no remaining asset points to it
    const thumbBasename = asset.thumbnailUrl
      ? path.basename(asset.thumbnailUrl)
      : `thumb_${asset.id}.jpg`;
    const thumbStillUsed = project.assets.some(
      (a) => a.thumbnailUrl && path.basename(a.thumbnailUrl) === thumbBasename
    );
    if (!thumbStillUsed) {
      const thumbPath = path.join(THUMBS_DIR, thumbBasename);
      if (fs.existsSync(thumbPath)) fs.unlinkSync(thumbPath);
    }
  }

  return saveProject(project);
}

export function makeClipFromAsset(
  asset: MediaAsset,
  overrideFit?: ProjectData['matrix']['defaultFitMode'],
  transition: ProjectData['matrix']['defaultTransition'] = 'none'
): TimelineClip {
  return {
    id: uuidv4(),
    assetId: asset.id,
    trimStart: asset.defaultTrimStart ?? 0,
    trimEnd: asset.defaultTrimEnd ?? asset.duration,
    speed: 1.0,
    volume: 1.0,
    muted: false,
    crop: asset.defaultCrop ? { ...asset.defaultCrop } : { ...FULL_CROP },
    fitMode: overrideFit || asset.defaultFitMode || 'cover',
    transition,
  };
}

/**
 * Generate N unique/balanced feed video groups from Matrix Scene Slots
 */
export function generateGroupsFromMatrix(
  project: ProjectData,
  overrideMatrix?: MatrixConfig
): { project: ProjectData; generatedCount: number; totalPossible: number } {
  const matrix = overrideMatrix || project.matrix;
  project.matrix = matrix;

  const assetMap = new Map<string, MediaAsset>(project.assets.map((a) => [a.id, a]));
  const activeSlots = matrix.slots
    .map((s) => ({
      ...s,
      validAssetIds: s.assetIds.filter((id) => {
        const a = assetMap.get(id);
        return a && a.type !== 'audio';
      }),
    }))
    .filter((s) => s.validAssetIds.length > 0);

  if (activeSlots.length === 0) {
    return { project, generatedCount: 0, totalPossible: 0 };
  }

  const totalPossible = activeSlots.reduce((acc, s) => acc * s.validAssetIds.length, 1);

  // Build Cartesian combinations up to reasonable ceiling
  const allCombos: string[][] = [];
  const maxCartesianCap = 240;

  function backtrack(slotIdx: number, current: string[]) {
    if (allCombos.length >= maxCartesianCap) return;
    if (slotIdx === activeSlots.length) {
      allCombos.push([...current]);
      return;
    }
    for (const aid of activeSlots[slotIdx].validAssetIds) {
      current.push(aid);
      backtrack(slotIdx + 1, current);
      current.pop();
      if (allCombos.length >= maxCartesianCap) return;
    }
  }
  backtrack(0, []);

  let selectedCombos: string[][] = [];
  if (matrix.strategy === 'all_cartesian') {
    selectedCombos = allCombos.slice(0, 60);
  } else {
    const target = Math.max(1, Math.min(60, matrix.targetCount || 6));
    if (allCombos.length <= target) {
      selectedCombos = [...allCombos];
      // If user explicitly asked for more than totalPossible, cycle varied copy/BGM on remaining
      while (selectedCombos.length < target && allCombos.length > 0) {
        selectedCombos.push(allCombos[selectedCombos.length % allCombos.length]);
      }
    } else {
      // Stratified selection so Slot 0 (opening hook) & subsequent slots are maximally spread!
      const step = allCombos.length / target;
      const usedIdx = new Set<number>();
      for (let i = 0; i < target; i++) {
        // Interleave across opening hooks first
        const rawIdx = Math.floor(i * step) % allCombos.length;
        let idx = rawIdx;
        while (usedIdx.has(idx)) {
          idx = (idx + 1) % allCombos.length;
        }
        usedIdx.add(idx);
        selectedCombos.push(allCombos[idx]);
      }
    }
  }

  const validBgms = matrix.bgmPoolAssetIds.filter((id) => assetMap.get(id)?.type === 'audio');
  const fallbackAudio = project.assets
    .filter((a) => a.type === 'audio' && a.audioRole !== 'voiceover')
    .map((a) => a.id);
  const bgmCandidates = validBgms.length > 0 ? validBgms : fallbackAudio;

  const validVoiceovers = (matrix.voiceoverPoolAssetIds || []).filter(
    (id) => assetMap.get(id)?.type === 'audio'
  );

  const topPool = matrix.topTitlePool.map((t) => t.trim()).filter(Boolean);
  const bottomPool = matrix.bottomTitlePool.map((t) => t.trim()).filter(Boolean);

  const startIndex = matrix.appendMode === 'replace' ? 1 : project.videoGroups.length + 1;
  const templateWm = project.videoGroups.find((g) => g.watermark?.enabled)?.watermark;

  const newGroups: VideoGroup[] = selectedCombos.map((comboAssetIds, idx) => {
    const seqNum = String(startIndex + idx).padStart(2, '0');
    const firstAsset = assetMap.get(comboAssetIds[0]);
    const shortHookName = firstAsset ? firstAsset.name.slice(0, 8) : '混剪';

    const clips: TimelineClip[] = comboAssetIds.map((aid, cIdx) => {
      const asset = assetMap.get(aid)!;
      const isLast = cIdx === comboAssetIds.length - 1;
      return makeClipFromAsset(
        asset,
        matrix.defaultFitMode,
        isLast ? 'none' : matrix.defaultTransition
      );
    });

    const chosenVo =
      validVoiceovers.length > 0 ? validVoiceovers[idx % validVoiceovers.length] : null;
    const voAsset = chosenVo ? assetMap.get(chosenVo) : null;
    const autoSubCues =
      voAsset?.ttsSourceText && matrix.autoSyncSubtitles !== false
        ? buildSyncedSubtitlesFromScript(voAsset.ttsSourceText, voAsset.duration, 0)
        : [];

    return {
      id: uuidv4(),
      name: `矩阵成片 #${seqNum} (${shortHookName})`,
      selectedForExport: true,
      clips,
      overlay: {
        topTitle: topPool.length > 0 ? topPool[idx % topPool.length] : '',
        bottomTitle: bottomPool.length > 0 ? bottomPool[idx % bottomPool.length] : '',
        styleId: matrix.styleId || 'douyin_yellow',
        topY: 13,
        bottomY: 83,
        fontScale: 1.0,
      },
      subtitles:
        autoSubCues.length > 0
          ? {
              enabled: true,
              styleId: 'douyin_yellow',
              yPercent: 74,
              fontScale: 1.0,
              cues: autoSubCues,
            }
          : undefined,
      watermark: templateWm ? structuredClone(templateWm) : undefined,
      dedup: matrix.autoDedup
        ? generateDedupVariant(
            idx,
            matrix.protectPackagingText === false,
            matrix.dedupPreset || 'standard'
          )
        : undefined,
      bgmAssetId: bgmCandidates.length > 0 ? bgmCandidates[idx % bgmCandidates.length] : null,
      bgmVolume: chosenVo ? 0.26 : 0.35,
      bgmDucking: true,
      voiceoverAssetId: chosenVo,
      voiceoverVolume: 1.15,
      clipMasterVolume: chosenVo ? 0.45 : 1.0,
      audioFadeOut: true,
    };
  });

  if (matrix.appendMode === 'replace') {
    project.videoGroups = newGroups;
  } else {
    project.videoGroups = [...project.videoGroups, ...newGroups];
  }

  saveProject(project);
  return {
    project,
    generatedCount: newGroups.length,
    totalPossible,
  };
}
