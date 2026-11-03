import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronDown,
  ChevronUp,
  Film,
  Grid,
  Loader2,
} from 'lucide-react';
import {
  buildSyncedSubtitlesFromScript,
  createDefaultDedupConfig,
  createDefaultSubtitleConfig,
  createDefaultWatermarkConfig,
  DEDUP_PRESETS,
  DedupConfig,
  DedupPresetId,
  FULL_CROP,
  generateDedupVariant,
  GroupOverlayConfig,
  HardwareAccelerationReport,
  MediaAsset,
  ProjectData,
  SceneTag,
  SubtitleConfig,
  TimelineClip,
  TransitionType,
  VideoGroup,
  WatermarkConfig,
} from '@shared/schema';
import {
  createDemoProject,
  createNewProject,
  deleteAssetApi,
  deleteProjectApi,
  fetchBootstrap,
  fetchHardwareReportApi,
  generateMatrixGroupsApi,
  importProjectJson,
  loadProjectById,
  ProjectSummary,
  removeAudioBreathApi,
  saveProjectApi,
  uploadAssetsWithProgress,
} from './api';
import { TopHeader, WorkspaceLayout } from './components/TopHeader';
import { AssetLibraryPanel } from './components/AssetLibraryPanel';
import { MonitorMode, PlayerMonitor } from './components/PlayerMonitor';
import { InspectorPanel } from './components/InspectorPanel';
import { VideoGroupsBoard } from './components/VideoGroupsBoard';
import { MatrixMixerView } from './components/MatrixMixerView';
import { TrimCropModal, TrimCropResult } from './components/TrimCropModal';
import { BatchExportModal } from './components/BatchExportModal';
import { TtsStudioModal } from './components/TtsStudioModal';
import { AudioEditorModal, NonDestructiveAudioSave } from './components/AudioEditorModal';
import { uid } from './utils/format';

function makeClip(asset: MediaAsset): TimelineClip {
  return {
    id: uid(),
    assetId: asset.id,
    trimStart: asset.defaultTrimStart ?? 0,
    trimEnd: asset.defaultTrimEnd ?? asset.duration,
    speed: 1.0,
    volume: 1.0,
    muted: false,
    crop: asset.defaultCrop ? { ...asset.defaultCrop } : { ...FULL_CROP },
    fitMode: asset.defaultFitMode || 'cover',
    transition: 'none',
  };
}

export const App: React.FC = () => {
  const [project, setProject] = useState<ProjectData | null>(null);
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [hardware, setHardware] = useState<HardwareAccelerationReport | null>(null);
  const [probingHardware, setProbingHardware] = useState(false);
  const [loading, setLoading] = useState(true);

  // Undo / Redo stacks
  const [undoStack, setUndoStack] = useState<ProjectData[]>([]);
  const [redoStack, setRedoStack] = useState<ProjectData[]>([]);
  const [saveState, setSaveState] = useState<'saved' | 'saving' | 'unsaved'>('saved');

  // Workbench UI & Jianying Dual Layout states
  const [workspaceLayout, setWorkspaceLayout] = useState<WorkspaceLayout>('vertical');
  const [topSplitPct, setTopSplitPct] = useState<number>(53);
  const [verticalMonitorWidth, setVerticalMonitorWidth] = useState<number>(395);
  const [monitorMode, setMonitorMode] = useState<MonitorMode>('program');
  const [selectedSourceId, setSelectedSourceId] = useState<string | null>(null);
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);
  const [selectedClipId, setSelectedClipId] = useState<string | null>(null);
  const [bottomTab, setBottomTab] = useState<'groups' | 'matrix'>('groups');
  const [bottomExpanded, setBottomExpanded] = useState(false);
  const [showSafeZone, setShowSafeZone] = useState(false);

  // Modals & async flags
  const [uploadingPct, setUploadingPct] = useState<number | null>(null);
  const [isGeneratingMatrix, setIsGeneratingMatrix] = useState(false);
  const [trimModalState, setTrimModalState] = useState<
    | { kind: 'asset'; asset: MediaAsset }
    | { kind: 'clip'; group: VideoGroup; clip: TimelineClip; asset: MediaAsset }
    | null
  >(null);
  const [exportModalState, setExportModalState] = useState<{
    open: boolean;
    specificGroupIds?: string[];
  }>({ open: false });
  const [ttsModalState, setTtsModalState] = useState<{
    open: boolean;
    defaultAssignMode?: 'library_only' | 'active_group' | 'dispatch_groups' | 'matrix_pool';
  }>({ open: false });
  const [audioEditorAsset, setAudioEditorAsset] = useState<MediaAsset | null>(null);

  const [toast, setToast] = useState<string | null>(null);
  const saveTimerRef = useRef<number | null>(null);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    window.setTimeout(() => {
      setToast((curr) => (curr === msg ? null : curr));
    }, 3200);
  }, []);

  const refreshHardware = useCallback(
    async (notify = false) => {
      setProbingHardware(true);
      try {
        const rep = await fetchHardwareReportApi(notify);
        setHardware(rep);
        if (notify) {
          const encName =
            rep.encoders.find((e) => e.id === rep.recommendedEncoder)?.name ||
            rep.recommendedEncoder;
          showToast(
            rep.hasHardwareGpu
              ? `⚡ 显卡加速已就绪：${encName}`
              : `ℹ️ 当前使用 CPU 多核 x264 编码（未检测到可用 GPU 硬件编码会话）`
          );
        }
      } catch {
        // ignore
      } finally {
        setProbingHardware(false);
      }
    },
    [showToast]
  );

  // Initial load
  useEffect(() => {
    void refreshHardware(false);
    fetchBootstrap()
      .then((data) => {
        setProject(data.project);
        setProjects(data.projects);
        setWorkspaceLayout(data.project.aspectRatio === '16:9' ? 'horizontal' : 'vertical');
        setActiveGroupId(data.project.videoGroups[0]?.id || null);
        setSelectedClipId(data.project.videoGroups[0]?.clips[0]?.id || null);
        setSelectedSourceId(data.project.assets[0]?.id || null);
      })
      .catch((err) => {
        console.error(err);
      })
      .finally(() => setLoading(false));
  }, []);

  // Commit helper with Undo history & debounced server persistence
  const updateProject = useCallback(
    (updater: (prev: ProjectData) => ProjectData, recordUndo = true) => {
      setProject((prev) => {
        if (!prev) return prev;
        if (recordUndo) {
          setUndoStack((u) => [...u.slice(-24), structuredClone(prev)]);
          setRedoStack([]);
        }
        const next = updater(structuredClone(prev));
        setSaveState('saving');

        if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
        saveTimerRef.current = window.setTimeout(() => {
          saveProjectApi(next)
            .then(() => setSaveState('saved'))
            .catch(() => setSaveState('unsaved'));
        }, 450);

        return next;
      });
    },
    []
  );

  const handleUndo = useCallback(() => {
    if (!project || undoStack.length === 0) return;
    const prev = undoStack[undoStack.length - 1];
    setUndoStack((u) => u.slice(0, -1));
    setRedoStack((r) => [...r, structuredClone(project)]);
    setProject(prev);
    void saveProjectApi(prev);
  }, [project, undoStack]);

  const handleRedo = useCallback(() => {
    if (!project || redoStack.length === 0) return;
    const next = redoStack[redoStack.length - 1];
    setRedoStack((r) => r.slice(0, -1));
    setUndoStack((u) => [...u, structuredClone(project)]);
    setProject(next);
    void saveProjectApi(next);
  }, [project, redoStack]);

  // Global keyboard shortcuts (Ctrl+Z / Ctrl+Y)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) handleRedo();
        else handleUndo();
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        handleRedo();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleUndo, handleRedo]);

  const assetMap = useMemo(() => {
    const m = new Map<string, MediaAsset>();
    if (project) {
      for (const a of project.assets) m.set(a.id, a);
    }
    return m;
  }, [project]);

  const audioAssets = useMemo(
    () => (project ? project.assets.filter((a) => a.type === 'audio') : []),
    [project]
  );

  const imageAssets = useMemo(
    () => (project ? project.assets.filter((a) => a.type === 'image') : []),
    [project]
  );

  const activeGroup = useMemo(() => {
    if (!project) return null;
    return (
      project.videoGroups.find((g) => g.id === activeGroupId) ||
      project.videoGroups[0] ||
      null
    );
  }, [project, activeGroupId]);

  const selectedClip = useMemo(() => {
    if (!activeGroup || !selectedClipId) return null;
    return activeGroup.clips.find((c) => c.id === selectedClipId) || null;
  }, [activeGroup, selectedClipId]);

  const selectedSourceAsset = useMemo(
    () => (selectedSourceId ? assetMap.get(selectedSourceId) || null : null),
    [selectedSourceId, assetMap]
  );

  // Project Management Handlers
  const applySwitchedProject = (proj: ProjectData, list: ProjectSummary[]) => {
    setUndoStack([]);
    setRedoStack([]);
    setProject(proj);
    setProjects(list);
    setWorkspaceLayout(proj.aspectRatio === '16:9' ? 'horizontal' : 'vertical');
    setActiveGroupId(proj.videoGroups[0]?.id || null);
    setSelectedClipId(proj.videoGroups[0]?.clips[0]?.id || null);
    setSelectedSourceId(proj.assets[0]?.id || null);
  };

  const handleUploadFiles = async (files: File[], tag: SceneTag) => {
    if (!project || files.length === 0) return;
    setUploadingPct(5);
    try {
      await saveProjectApi(project);
      const res = await uploadAssetsWithProgress(project.id, files, tag, (pct) =>
        setUploadingPct(pct)
      );
      setProject(res.project);
      if (res.assets[0]) {
        setSelectedSourceId(res.assets[0].id);
        setMonitorMode('source');
      }
      showToast(`✓ 成功导入并解析 ${res.assets.length} 个本地素材`);
    } catch (err: any) {
      alert(err?.message || '上传素材失败');
    } finally {
      setUploadingPct(null);
    }
  };

  const handleDeleteAsset = async (assetId: string) => {
    if (!project) return;
    try {
      await saveProjectApi(project);
      const updated = await deleteAssetApi(project.id, assetId);
      setProject(updated);
      if (selectedSourceId === assetId) {
        setSelectedSourceId(updated.assets[0]?.id || null);
      }
      showToast('已从工程移除该素材');
    } catch (err: any) {
      alert(err?.message || '删除失败');
    }
  };

  // Multi-Group Asset Dispatch Handlers
  const handleAddAssetsToGroups = (
    assetIds: string[],
    targetGroupIds: string[],
    mode: 'append_all' | 'distribute_round_robin' | 'insert_head'
  ) => {
    updateProject((draft) => {
      const targetSet = new Set(targetGroupIds);
      const validAssets = assetIds
        .map((id) => draft.assets.find((a) => a.id === id))
        .filter((a): a is MediaAsset => Boolean(a && a.type !== 'audio'));

      if (validAssets.length === 0) return draft;

      if (mode === 'distribute_round_robin') {
        const targetGroups = draft.videoGroups.filter((g) => targetSet.has(g.id));
        if (targetGroups.length > 0) {
          validAssets.forEach((asset, idx) => {
            const g = targetGroups[idx % targetGroups.length];
            g.clips.push(makeClip(asset));
          });
        }
      } else {
        for (const g of draft.videoGroups) {
          if (!targetSet.has(g.id)) continue;
          const newClips = validAssets.map(makeClip);
          if (mode === 'insert_head') {
            g.clips = [...newClips, ...g.clips];
          } else {
            g.clips = [...g.clips, ...newClips];
          }
        }
      }
      return draft;
    });
    showToast(`✓ 已将 ${assetIds.length} 个素材投递至 ${targetGroupIds.length} 条视频组`);
  };

  const handleCreateGroupsPerAsset = (assetIds: string[]) => {
    updateProject((draft) => {
      const validAssets = assetIds
        .map((id) => draft.assets.find((a) => a.id === id))
        .filter((a): a is MediaAsset => Boolean(a && a.type !== 'audio'));

      const baseIdx = draft.videoGroups.length + 1;
      const created: VideoGroup[] = validAssets.map((asset, i) => ({
        id: uid(),
        name: `视频组 #${String(baseIdx + i).padStart(2, '0')} (${asset.name.slice(0, 8)})`,
        selectedForExport: true,
        clips: [makeClip(asset)],
        overlay: {
          topTitle: '',
          bottomTitle: '',
          styleId: 'douyin_yellow',
          topY: 13,
          bottomY: 83,
          fontScale: 1.0,
        },
        bgmAssetId: draft.assets.find((a) => a.type === 'audio')?.id || null,
        bgmVolume: 0.35,
        clipMasterVolume: 1.0,
        audioFadeOut: true,
      }));
      draft.videoGroups.push(...created);
      return draft;
    });
    setBottomTab('groups');
    showToast(`✓ 已按所选素材新建 ${assetIds.length} 条独立视频组`);
  };

  const handleTrimModalSave = (res: TrimCropResult) => {
    if (!trimModalState) return;
    updateProject((draft) => {
      if (trimModalState.kind === 'asset') {
        const target = draft.assets.find((a) => a.id === trimModalState.asset.id);
        if (target) {
          target.defaultTrimStart = res.trimStart;
          target.defaultTrimEnd = res.trimEnd;
          target.defaultCrop = { ...res.crop };
          target.defaultFitMode = res.fitMode;
        }
        if (res.applyToAllInstances) {
          for (const g of draft.videoGroups) {
            for (const c of g.clips) {
              if (c.assetId === trimModalState.asset.id) {
                c.trimStart = res.trimStart;
                c.trimEnd = res.trimEnd;
                c.speed = res.speed;
                c.crop = { ...res.crop };
                c.fitMode = res.fitMode;
              }
            }
          }
        }
      } else {
        const g = draft.videoGroups.find((x) => x.id === trimModalState.group.id);
        const c = g?.clips.find((x) => x.id === trimModalState.clip.id);
        if (c) {
          c.trimStart = res.trimStart;
          c.trimEnd = res.trimEnd;
          c.speed = res.speed;
          c.crop = { ...res.crop };
          c.fitMode = res.fitMode;
        }
        if (res.applyToAllInstances) {
          const srcAsset = draft.assets.find((a) => a.id === trimModalState.asset.id);
          if (srcAsset) {
            srcAsset.defaultTrimStart = res.trimStart;
            srcAsset.defaultTrimEnd = res.trimEnd;
            srcAsset.defaultCrop = { ...res.crop };
            srcAsset.defaultFitMode = res.fitMode;
          }
          for (const grp of draft.videoGroups) {
            for (const clp of grp.clips) {
              if (clp.assetId === trimModalState.asset.id) {
                clp.trimStart = res.trimStart;
                clp.trimEnd = res.trimEnd;
                clp.speed = res.speed;
                clp.crop = { ...res.crop };
                clp.fitMode = res.fitMode;
              }
            }
          }
        }
      }
      return draft;
    });
    setTrimModalState(null);
    showToast('✂️ 裁剪与构图参数已保存');
  };

  // Mouse-draggable horizontal splitter (between Upper Panels & Bottom Timeline)
  const startRowResize = (e: React.MouseEvent) => {
    e.preventDefault();
    const startY = e.clientY;
    const startPct = bottomExpanded ? 34 : topSplitPct;
    if (bottomExpanded) setBottomExpanded(false);
    const totalH = Math.max(400, window.innerHeight - 44);
    const onMove = (ev: MouseEvent) => {
      const deltaPct = ((ev.clientY - startY) / totalH) * 100;
      setTopSplitPct(Math.max(28, Math.min(72, startPct + deltaPct)));
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  // Mouse-draggable vertical monitor width splitter (in Jianying Vertical Layout)
  const startVerticalDockResize = (e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = verticalMonitorWidth;
    const onMove = (ev: MouseEvent) => {
      const nextW = startW - (ev.clientX - startX);
      const maxW = Math.min(620, Math.floor(window.innerWidth * 0.42));
      setVerticalMonitorWidth(Math.max(300, Math.min(maxW, nextW)));
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  if (loading || !project) {
    return (
      <div className="h-screen w-screen bg-[#0F1014] flex flex-col items-center justify-center gap-3 text-white">
        <Loader2 className="w-8 h-8 text-[#00E5FF] animate-spin" />
        <p className="text-sm font-medium text-[#CBD5E1]">
          正在启动流剪矩阵 FlowCut Pro 引擎...
        </p>
      </div>
    );
  }

  const effectiveTopPct = bottomExpanded ? 34 : topSplitPct;

  const assetLibraryElement = (
    <AssetLibraryPanel
      assets={project.assets}
      videoGroups={project.videoGroups}
      activeGroupId={activeGroup?.id || null}
      matrixSlots={project.matrix.slots}
      selectedSourceId={selectedSourceId}
      uploadingPct={uploadingPct}
      wideMode={workspaceLayout === 'vertical'}
      onUploadFiles={handleUploadFiles}
      onPreviewAsset={(asset) => {
        setSelectedSourceId(asset.id);
        setMonitorMode('source');
      }}
      onTrimAsset={(asset) => setTrimModalState({ kind: 'asset', asset })}
      onEditAudio={(asset) => setAudioEditorAsset(asset)}
      onQuickRemoveBreath={async (asset) => {
        showToast(`⚡ 正在对「${asset.name}」执行智能去气口分析...`);
        try {
          const res = await removeAudioBreathApi(project, asset.id, {
            replaceInPlace: true,
          });
          setUndoStack((u) => [...u.slice(-24), structuredClone(project)]);
          setProject(res.project);
          setSelectedSourceId(res.asset.id);
          showToast(
            `⚡ 去气口完成！切除了 ${res.breathStats.cutCount} 处换气空白，紧凑缩短 ${res.breathStats.savedSec.toFixed(2)}s`
          );
        } catch (err: any) {
          alert(err?.message || '去气口处理失败');
        }
      }}
      onOpenTtsStudio={() =>
        setTtsModalState({ open: true, defaultAssignMode: 'active_group' })
      }
      onDeleteAsset={handleDeleteAsset}
      onChangeAssetTag={(assetId, tag) =>
        updateProject((d) => {
          const a = d.assets.find((x) => x.id === assetId);
          if (a) a.sceneTag = tag;
          return d;
        })
      }
      onAddAssetsToGroups={handleAddAssetsToGroups}
      onCreateGroupsPerAsset={handleCreateGroupsPerAsset}
      onAddAssetsToMatrixSlot={(assetIds, slotId) => {
        updateProject((d) => {
          const s = d.matrix.slots.find((x) => x.id === slotId);
          if (s) {
            const valid = assetIds.filter((id) => assetMap.get(id)?.type !== 'audio');
            s.assetIds = Array.from(new Set([...s.assetIds, ...valid]));
          }
          return d;
        });
        setBottomTab('matrix');
        showToast(`✓ 已加入分镜矩阵槽`);
      }}
      onSetGroupBgm={(bgmId, applyAll) => {
        updateProject((d) => {
          if (applyAll) {
            for (const g of d.videoGroups) g.bgmAssetId = bgmId;
          } else if (activeGroup) {
            const g = d.videoGroups.find((x) => x.id === activeGroup.id);
            if (g) g.bgmAssetId = bgmId;
          }
          return d;
        });
        setMonitorMode('program');
        showToast(applyAll ? '🎵 已将该配乐应用到全部视频组' : '🎵 已设为当前视频组配乐');
      }}
      onSetGroupVoiceover={(voId, applyAll) => {
        updateProject((d) => {
          const voAsset = d.assets.find((a) => a.id === voId);
          const applyVo = (g: VideoGroup) => {
            g.voiceoverAssetId = voId;
            g.bgmDucking = true;
            if (voAsset?.ttsSourceText) {
              const effDur = Math.max(0.8, voAsset.duration / (g.voiceoverSpeed || 1));
              const cues = buildSyncedSubtitlesFromScript(
                voAsset.ttsSourceText,
                effDur,
                g.voiceoverDelaySec || 0
              );
              g.subtitles = {
                ...(g.subtitles || createDefaultSubtitleConfig()),
                enabled: true,
                cues,
              };
            }
          };
          if (applyAll) {
            for (const g of d.videoGroups) applyVo(g);
          } else if (activeGroup) {
            const g = d.videoGroups.find((x) => x.id === activeGroup.id);
            if (g) applyVo(g);
          }
          return d;
        });
        setMonitorMode('program');
        showToast(
          applyAll
            ? '🎙️ 已将该口播配音（及同步动态字幕）应用到全部视频组'
            : '🎙️ 已设为当前组口播配音（自动开启BGM闪避与同步字幕）'
        );
      }}
    />
  );

  const playerMonitorElement = (
    <PlayerMonitor
      mode={monitorMode}
      onChangeMode={setMonitorMode}
      aspectRatio={project.aspectRatio}
      sourceAsset={selectedSourceAsset}
      activeGroup={activeGroup}
      selectedClipId={selectedClipId}
      assetMap={assetMap}
      showSafeZone={showSafeZone}
      onToggleSafeZone={() => setShowSafeZone((v) => !v)}
      onOpenTrimAsset={(asset) => setTrimModalState({ kind: 'asset', asset })}
      onOpenEditAudio={(asset) => setAudioEditorAsset(asset)}
      onOpenTrimClip={(group, clip) => {
        const a = assetMap.get(clip.assetId);
        if (a) setTrimModalState({ kind: 'clip', group, clip, asset: a });
      }}
      onSelectClip={(clipId) => setSelectedClipId(clipId)}
    />
  );

  const inspectorElement = (
    <InspectorPanel
      activeGroup={activeGroup}
      selectedClip={selectedClip}
      selectedClipAsset={selectedClip ? assetMap.get(selectedClip.assetId) || null : null}
      audioAssets={audioAssets}
      imageAssets={imageAssets}
      onUpdateClip={(groupId, clipId, patch) =>
        updateProject((d) => {
          const g = d.videoGroups.find((x) => x.id === groupId);
          const c = g?.clips.find((x) => x.id === clipId);
          if (c) Object.assign(c, patch);
          return d;
        })
      }
      onApplyTransitionToGroup={(groupId, transition: TransitionType) => {
        updateProject((d) => {
          const g = d.videoGroups.find((x) => x.id === groupId);
          if (g) {
            g.clips.forEach((c, i) => {
              c.transition = i === g.clips.length - 1 ? 'none' : transition;
            });
          }
          return d;
        });
        showToast('✓ 已将该转场应用到本组所有衔接处');
      }}
      onOpenTrimClip={(group, clip) => {
        const a = assetMap.get(clip.assetId);
        if (a) setTrimModalState({ kind: 'clip', group, clip, asset: a });
      }}
      onUpdateOverlay={(groupId, patch: Partial<GroupOverlayConfig>) =>
        updateProject((d) => {
          const g = d.videoGroups.find((x) => x.id === groupId);
          if (g) Object.assign(g.overlay, patch);
          return d;
        })
      }
      onSyncOverlayStyleAllGroups={(overlay, includeText) => {
        updateProject((d) => {
          for (const g of d.videoGroups) {
            g.overlay.styleId = overlay.styleId;
            g.overlay.topY = overlay.topY;
            g.overlay.bottomY = overlay.bottomY;
            g.overlay.fontScale = overlay.fontScale;
            if (includeText) {
              g.overlay.topTitle = overlay.topTitle;
              g.overlay.bottomTitle = overlay.bottomTitle;
            }
          }
          return d;
        });
        showToast(
          includeText
            ? '✓ 已将花字文案与样式同步至全部视频组'
            : '✓ 已将花字视觉样式与排版同步至全部视频组'
        );
      }}
      onUpdateSubtitles={(groupId, next: SubtitleConfig) =>
        updateProject((d) => {
          const g = d.videoGroups.find((x) => x.id === groupId);
          if (g) g.subtitles = structuredClone(next);
          return d;
        })
      }
      onSyncSubtitleStyleAllGroups={(sub: SubtitleConfig) => {
        updateProject((d) => {
          for (const g of d.videoGroups) {
            const cur = g.subtitles || createDefaultSubtitleConfig();
            g.subtitles = {
              ...cur,
              styleId: sub.styleId,
              yPercent: sub.yPercent,
              fontScale: sub.fontScale,
            };
          }
          return d;
        });
        showToast('💬 已将动态字幕花字样式与排版高度同步至全部视频组');
      }}
      onUpdateWatermark={(groupId, next: WatermarkConfig) =>
        updateProject((d) => {
          const g = d.videoGroups.find((x) => x.id === groupId);
          if (g) g.watermark = structuredClone(next);
          return d;
        })
      }
      onSyncWatermarkAllGroups={(wm: WatermarkConfig) => {
        updateProject((d) => {
          for (const g of d.videoGroups) {
            g.watermark = structuredClone(wm);
          }
          return d;
        });
        showToast('🏷️ 已将品牌角标/LOGO水印配置一键挂载到全部视频组');
      }}
      onUploadWatermarkLogo={async (file: File) => {
        if (!project || !activeGroup) return;
        try {
          setUploadingPct(10);
          await saveProjectApi(project);
          const res = await uploadAssetsWithProgress(project.id, [file], '产品特写', (pct) =>
            setUploadingPct(pct)
          );
          const updated = res.project;
          const latestImg =
            res.assets.find((a) => a.type === 'image') ||
            [...updated.assets].reverse().find((a) => a.type === 'image');
          if (latestImg) {
            const g = updated.videoGroups.find((x) => x.id === activeGroup.id);
            if (g) {
              g.watermark = {
                ...(g.watermark || createDefaultWatermarkConfig()),
                enabled: true,
                mode: 'image',
                imageAssetId: latestImg.id,
              };
            }
            await saveProjectApi(updated);
          }
          setProject(updated);
          setMonitorMode('program');
          showToast('🏷️ 品牌 LOGO 上传成功并已挂载到当前视频组角标');
        } catch (err: any) {
          alert(err?.message || 'LOGO上传失败');
        } finally {
          setUploadingPct(null);
        }
      }}
      onUpdateDedup={(groupId, next: DedupConfig) =>
        updateProject((d) => {
          const g = d.videoGroups.find((x) => x.id === groupId);
          if (g) g.dedup = structuredClone(next);
          return d;
        })
      }
      onBatchRandomizeDedupAllGroups={(allowMirror, preset) => {
        updateProject((d) => {
          d.videoGroups.forEach((g, idx) => {
            g.dedup = generateDedupVariant(
              idx + Math.floor(Math.random() * 7),
              allowMirror,
              preset
            );
          });
          return d;
        });
        setMonitorMode('program');
        showToast(
          `🛡️ 已按「${DEDUP_PRESETS[preset].label}」为全部 ${project.videoGroups.length} 条成片组生成四维差异化指纹！`
        );
      }}
      onUpdateGroupAudio={(groupId, patch) =>
        updateProject((d) => {
          const g = d.videoGroups.find((x) => x.id === groupId);
          if (g) Object.assign(g, patch);
          return d;
        })
      }
      onSyncAudioAllGroups={(src) => {
        updateProject((d) => {
          for (const g of d.videoGroups) {
            g.bgmAssetId = src.bgmAssetId;
            g.bgmVolume = src.bgmVolume;
            g.bgmTrimStart = src.bgmTrimStart;
            g.bgmTrimEnd = src.bgmTrimEnd;
            g.bgmSpeed = src.bgmSpeed;
            g.bgmLoop = src.bgmLoop;
            g.bgmFadeInSec = src.bgmFadeInSec;
            g.bgmFadeOutSec = src.bgmFadeOutSec;
            g.bgmDucking = src.bgmDucking;
            g.voiceoverAssetId = src.voiceoverAssetId;
            g.voiceoverVolume = src.voiceoverVolume;
            g.voiceoverDelaySec = src.voiceoverDelaySec;
            g.voiceoverSpeed = src.voiceoverSpeed;
            g.clipMasterVolume = src.clipMasterVolume;
            g.audioFadeOut = src.audioFadeOut;
          }
          return d;
        });
        showToast('🎵 已将本组口播配音与背景音乐混音配置同步至全部视频组');
      }}
      onOpenAudioEditor={(asset) => setAudioEditorAsset(asset)}
      onOpenTtsStudio={() =>
        setTtsModalState({ open: true, defaultAssignMode: 'active_group' })
      }
    />
  );

  const bottomWorkbenchElement = (
    <div className="flex-1 min-h-0 flex flex-col bg-[#111218]">
      {/* Mode Switcher Bar */}
      <div className="h-9 px-3 bg-[#161821] border-b border-[#232632] flex items-center justify-between gap-2 shrink-0 select-none">
        <div className="flex items-center gap-1.5 min-w-0">
          <button
            onClick={() => setBottomTab('groups')}
            className={`px-2.5 py-1 rounded-md text-xs font-bold whitespace-nowrap shrink-0 flex items-center gap-1.5 transition ${
              bottomTab === 'groups'
                ? 'bg-[#00E5FF]/15 text-[#00E5FF] border border-[#00E5FF]/40'
                : 'text-[#8A90A2] hover:text-white'
            }`}
          >
            <Film className="w-3.5 h-3.5 shrink-0" />
            多条成片视频组 ({project.videoGroups.length})
          </button>

          <button
            onClick={() => setBottomTab('matrix')}
            className={`px-2.5 py-1 rounded-md text-xs font-bold whitespace-nowrap shrink-0 flex items-center gap-1.5 transition ${
              bottomTab === 'matrix'
                ? 'bg-[#FFB800]/15 text-[#FFB800] border border-[#FFB800]/40'
                : 'text-[#8A90A2] hover:text-white'
            }`}
          >
            <Grid className="w-3.5 h-3.5 shrink-0" />
            分镜矩阵混剪器
          </button>
        </div>

        <button
          onClick={() => setBottomExpanded((e) => !e)}
          className="px-2 py-1 rounded bg-[#212533] hover:bg-[#2C3144] text-[11px] text-[#B8C0D0] whitespace-nowrap shrink-0 flex items-center gap-1 transition"
        >
          {bottomExpanded ? (
            <>
              <ChevronDown className="w-3.5 h-3.5 shrink-0" />
              标准高度
            </>
          ) : (
            <>
              <ChevronUp className="w-3.5 h-3.5 shrink-0" />
              展开轨道区
            </>
          )}
        </button>
      </div>

      {/* Active Bottom Workbench Content */}
      <div className="flex-1 min-h-0">
        {bottomTab === 'groups' ? (
          <VideoGroupsBoard
            groups={project.videoGroups}
            activeGroupId={activeGroup?.id || null}
            selectedClipId={selectedClipId}
            assetMap={assetMap}
            onSelectGroup={(gid, autoPlay) => {
              setActiveGroupId(gid);
              setMonitorMode('program');
              const g = project.videoGroups.find((x) => x.id === gid);
              if (g && g.clips[0] && autoPlay) {
                setSelectedClipId(g.clips[0].id);
              }
            }}
            onSelectClip={(gid, cid) => {
              setActiveGroupId(gid);
              setSelectedClipId(cid);
              setMonitorMode('program');
            }}
            onCreateGroup={(withAssetIds) => {
              let newId = '';
              updateProject((d) => {
                const idx = d.videoGroups.length + 1;
                const clips: TimelineClip[] = (withAssetIds || [])
                  .map((id) => d.assets.find((a) => a.id === id))
                  .filter((a): a is MediaAsset => Boolean(a && a.type !== 'audio'))
                  .map(makeClip);

                const grp: VideoGroup = {
                  id: uid(),
                  name: `信息流成片 #${String(idx).padStart(2, '0')}`,
                  selectedForExport: true,
                  clips,
                  overlay: {
                    topTitle: '',
                    bottomTitle: '',
                    styleId: 'douyin_yellow',
                    topY: 13,
                    bottomY: 83,
                    fontScale: 1.0,
                  },
                  bgmAssetId: d.assets.find((a) => a.type === 'audio')?.id || null,
                  bgmVolume: 0.35,
                  clipMasterVolume: 1.0,
                  audioFadeOut: true,
                };
                newId = grp.id;
                d.videoGroups.push(grp);
                return d;
              });
              if (newId) setActiveGroupId(newId);
            }}
            onDuplicateGroup={(gid) => {
              updateProject((d) => {
                const idx = d.videoGroups.findIndex((x) => x.id === gid);
                if (idx < 0) return d;
                const orig = d.videoGroups[idx];
                const clone: VideoGroup = structuredClone(orig);
                clone.id = uid();
                clone.name = `${orig.name} (副本)`;
                clone.clips = clone.clips.map((c) => ({ ...c, id: uid() }));
                delete clone.lastExportUrl;
                d.videoGroups.splice(idx + 1, 0, clone);
                return d;
              });
              showToast('✓ 已复制视频组');
            }}
            onDeleteGroup={(gid) => {
              updateProject((d) => {
                if (d.videoGroups.length <= 1) {
                  d.videoGroups[0].clips = [];
                  return d;
                }
                d.videoGroups = d.videoGroups.filter((x) => x.id !== gid);
                return d;
              });
            }}
            onDeleteSelectedGroups={() => {
              updateProject((d) => {
                const remaining = d.videoGroups.filter((g) => !g.selectedForExport);
                if (remaining.length === 0) {
                  const blank = d.videoGroups[0];
                  blank.clips = [];
                  blank.name = '信息流成片 #01';
                  blank.selectedForExport = true;
                  d.videoGroups = [blank];
                } else {
                  d.videoGroups = remaining;
                }
                return d;
              });
            }}
            onRenameGroup={(gid, name) =>
              updateProject((d) => {
                const g = d.videoGroups.find((x) => x.id === gid);
                if (g) g.name = name;
                return d;
              }, false)
            }
            onToggleGroupExport={(gid) =>
              updateProject((d) => {
                const g = d.videoGroups.find((x) => x.id === gid);
                if (g) g.selectedForExport = !g.selectedForExport;
                return d;
              }, false)
            }
            onToggleAllGroupsExport={(checked) =>
              updateProject((d) => {
                for (const g of d.videoGroups) g.selectedForExport = checked;
                return d;
              }, false)
            }
            onReorderGroups={(fromIdx, toIdx) =>
              updateProject((d) => {
                const [moved] = d.videoGroups.splice(fromIdx, 1);
                d.videoGroups.splice(toIdx, 0, moved);
                return d;
              })
            }
            onInsertLibraryAssetsAt={(gid, insertIdx, assetIds) => {
              updateProject((d) => {
                const g = d.videoGroups.find((x) => x.id === gid);
                if (!g) return d;
                const newClips = assetIds
                  .map((id) => d.assets.find((a) => a.id === id))
                  .filter((a): a is MediaAsset => Boolean(a && a.type !== 'audio'))
                  .map(makeClip);
                g.clips.splice(insertIdx, 0, ...newClips);
                return d;
              });
              setActiveGroupId(gid);
              setMonitorMode('program');
            }}
            onMoveOrCopyClip={(fromGid, clipId, toGid, insertIdx, copy) => {
              updateProject((d) => {
                const fromG = d.videoGroups.find((x) => x.id === fromGid);
                const toG = d.videoGroups.find((x) => x.id === toGid);
                if (!fromG || !toG) return d;
                const oldIdx = fromG.clips.findIndex((c) => c.id === clipId);
                if (oldIdx < 0) return d;

                if (copy) {
                  const cloned: TimelineClip = {
                    ...structuredClone(fromG.clips[oldIdx]),
                    id: uid(),
                  };
                  toG.clips.splice(insertIdx, 0, cloned);
                } else {
                  const [moved] = fromG.clips.splice(oldIdx, 1);
                  const adjIdx =
                    fromGid === toGid && oldIdx < insertIdx ? insertIdx - 1 : insertIdx;
                  toG.clips.splice(Math.max(0, adjIdx), 0, moved);
                }
                return d;
              });
              setActiveGroupId(toGid);
            }}
            onMoveClipToNewGroup={(fromGid, clipId, copy) => {
              let createdId = '';
              updateProject((d) => {
                const fromG = d.videoGroups.find((x) => x.id === fromGid);
                if (!fromG) return d;
                const idx = fromG.clips.findIndex((c) => c.id === clipId);
                if (idx < 0) return d;
                const clipItem = copy
                  ? { ...structuredClone(fromG.clips[idx]), id: uid() }
                  : fromG.clips.splice(idx, 1)[0];

                const newGrp: VideoGroup = {
                  id: uid(),
                  name: `信息流成片 #${String(d.videoGroups.length + 1).padStart(2, '0')}`,
                  selectedForExport: true,
                  clips: [clipItem],
                  overlay: {
                    ...structuredClone(fromG.overlay),
                  },
                  bgmAssetId: fromG.bgmAssetId,
                  bgmVolume: fromG.bgmVolume,
                  clipMasterVolume: fromG.clipMasterVolume,
                  audioFadeOut: fromG.audioFadeOut,
                };
                createdId = newGrp.id;
                d.videoGroups.push(newGrp);
                return d;
              });
              if (createdId) setActiveGroupId(createdId);
              showToast('✓ 已新建视频组并放入该片段');
            }}
            onNudgeClip={(gid, clipIdx, delta) =>
              updateProject((d) => {
                const g = d.videoGroups.find((x) => x.id === gid);
                if (!g) return d;
                const target = clipIdx + delta;
                if (target < 0 || target >= g.clips.length) return d;
                const [item] = g.clips.splice(clipIdx, 1);
                g.clips.splice(target, 0, item);
                return d;
              })
            }
            onDuplicateClip={(gid, cid) =>
              updateProject((d) => {
                const g = d.videoGroups.find((x) => x.id === gid);
                if (!g) return d;
                const idx = g.clips.findIndex((c) => c.id === cid);
                if (idx < 0) return d;
                const clone: TimelineClip = {
                  ...structuredClone(g.clips[idx]),
                  id: uid(),
                };
                g.clips.splice(idx + 1, 0, clone);
                return d;
              })
            }
            onRemoveClip={(gid, cid) =>
              updateProject((d) => {
                const g = d.videoGroups.find((x) => x.id === gid);
                if (g) g.clips = g.clips.filter((c) => c.id !== cid);
                return d;
              })
            }
            onToggleMuteClip={(gid, cid) =>
              updateProject((d) => {
                const g = d.videoGroups.find((x) => x.id === gid);
                const c = g?.clips.find((x) => x.id === cid);
                if (c) c.muted = !c.muted;
                return d;
              })
            }
            onOpenTrimClip={(group, clip) => {
              const a = assetMap.get(clip.assetId);
              if (a) setTrimModalState({ kind: 'clip', group, clip, asset: a });
            }}
            onQuickExportSingleGroup={(gid) =>
              setExportModalState({ open: true, specificGroupIds: [gid] })
            }
          />
        ) : (
          <MatrixMixerView
            matrix={project.matrix}
            assets={project.assets}
            assetMap={assetMap}
            isGenerating={isGeneratingMatrix}
            onUpdateMatrix={(nextMatrix) =>
              updateProject((d) => {
                d.matrix = nextMatrix;
                return d;
              })
            }
            onGenerateToGroups={async () => {
              setIsGeneratingMatrix(true);
              try {
                const res = await generateMatrixGroupsApi(project, project.matrix);
                setUndoStack((u) => [...u.slice(-24), structuredClone(project)]);
                setProject(res.project);
                setActiveGroupId(
                  res.project.videoGroups[res.project.videoGroups.length - 1]?.id || null
                );
                setBottomTab('groups');
                setMonitorMode('program');
                showToast(
                  `⚡ 已从 ${res.totalPossible} 种矩阵组合中智能生成 ${res.generatedCount} 条成片视频组！`
                );
              } catch (err: any) {
                alert(err?.message || '矩阵裂变生成失败');
              } finally {
                setIsGeneratingMatrix(false);
              }
            }}
            onOpenTrimAsset={(asset) => setTrimModalState({ kind: 'asset', asset })}
            onPreviewAsset={(asset) => {
              setSelectedSourceId(asset.id);
              setMonitorMode('source');
            }}
            onOpenTtsStudio={() =>
              setTtsModalState({ open: true, defaultAssignMode: 'matrix_pool' })
            }
          />
        )}
      </div>
    </div>
  );

  return (
    <div className="h-screen w-screen flex flex-col bg-[#0F1014] text-[#ECEEF2] overflow-hidden">
      {/* Floating Toast Notification */}
      {toast && (
        <div className="fixed top-14 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-full bg-[#1C2130]/95 border border-[#00E5FF]/60 shadow-2xl text-xs font-medium text-white flex items-center gap-2 pointer-events-none whitespace-nowrap">
          <span className="w-2 h-2 rounded-full bg-[#00E5FF]" />
          {toast}
        </div>
      )}

      {/* Top Header with Aspect Ratio & Jianying Vertical/Horizontal Layout Switcher */}
      <TopHeader
        project={project}
        projects={projects}
        hardware={hardware}
        probingHardware={probingHardware}
        onRefreshHardware={() => void refreshHardware(true)}
        workspaceLayout={workspaceLayout}
        canUndo={undoStack.length > 0}
        canRedo={redoStack.length > 0}
        saveState={saveState}
        onChangeWorkspaceLayout={(layout) => {
          setWorkspaceLayout(layout);
          showToast(
            layout === 'vertical'
              ? '📱 已切换为「竖屏制作布局」：右侧全高大屏预览 9:16 信息流视频'
              : '🖥️ 已切换为「横屏制作布局」：经典三栏宽屏剪辑界面'
          );
        }}
        onUndo={handleUndo}
        onRedo={handleRedo}
        onRenameProject={(name) =>
          updateProject((d) => {
            d.name = name;
            return d;
          }, false)
        }
        onChangeAspectRatio={(ar) => {
          updateProject((d) => {
            d.aspectRatio = ar;
            return d;
          });
          if (ar === '9:16' && workspaceLayout !== 'vertical') {
            setWorkspaceLayout('vertical');
            showToast('📱 已自动适配 9:16 竖屏制作布局（也可随时点击顶部切换横屏布局）');
          } else if (ar === '16:9' && workspaceLayout !== 'horizontal') {
            setWorkspaceLayout('horizontal');
            showToast('🖥️ 已自动适配 16:9 横屏剪辑布局（也可随时点击顶部切换竖屏布局）');
          }
        }}
        onSelectProject={async (id) => {
          const data = await loadProjectById(id);
          applySwitchedProject(data.project, data.projects);
        }}
        onDeleteProject={async (targetId) => {
          try {
            const res = await deleteProjectApi(targetId, project.id);
            if (res.switchedActive) {
              applySwitchedProject(res.project, res.projects);
              showToast(
                `🗑️ 已删除工程「${res.deletedName}」，已切换至「${res.project.name}」`
              );
            } else {
              setProjects(res.projects);
              showToast(`🗑️ 已删除工程「${res.deletedName}」`);
            }
          } catch (err: any) {
            alert(err?.message || '删除工程失败');
          }
        }}
        onNewBlankProject={async () => {
          const data = await createNewProject('新建信息流生产项目');
          applySwitchedProject(data.project, data.projects);
          showToast('已创建全新空白生产工程，可直接导入您的本地素材');
        }}
        onLoadDemoProject={async () => {
          const data = await createDemoProject();
          applySwitchedProject(data.project, data.projects);
          showToast('已载入内置演示样例工程');
        }}
        onExportProjectJson={() => {
          const blob = new Blob([JSON.stringify(project, null, 2)], {
            type: 'application/json',
          });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `${project.name || 'flowcut_project'}.flowcut.json`;
          a.click();
          URL.revokeObjectURL(url);
        }}
        onImportProjectJson={async (file) => {
          try {
            const text = await file.text();
            const parsed = JSON.parse(text) as ProjectData;
            const res = await importProjectJson(parsed);
            applySwitchedProject(res.project, res.projects);
            showToast('✓ 工程文件导入成功');
          } catch {
            alert('工程文件解析失败，请确认是有效的 .json 工程文件');
          }
        }}
        onOpenTtsStudio={() =>
          setTtsModalState({ open: true, defaultAssignMode: 'active_group' })
        }
        onOpenBatchExport={() => setExportModalState({ open: true })}
      />

      {/* =====================================================================
          JIANYING DUAL WORKSPACE LAYOUT ENGINE
          1) workspaceLayout === 'vertical'   -> 竖屏制作布局 (Full-height tall 9:16 preview dock on right!)
          2) workspaceLayout === 'horizontal' -> 横屏制作布局 (Classic 3-col top + full-width bottom timeline)
         ===================================================================== */}
      {workspaceLayout === 'vertical' ? (
        <div className="flex-1 min-h-0 flex overflow-hidden">
          {/* Left Main Workbench: [Asset Library + Inspector] on top, [Multi-Group Timeline] on bottom */}
          <div className="flex-1 min-w-0 flex flex-col min-h-0">
            <div
              style={{ height: `${effectiveTopPct}%` }}
              className="flex min-h-0 shrink-0 overflow-hidden"
            >
              <div className="flex-1 min-w-[290px] h-full border-r border-[#232632]">
                {assetLibraryElement}
              </div>
              <div className="w-[320px] xl:w-[350px] shrink-0 h-full">{inspectorElement}</div>
            </div>

            {/* Draggable Horizontal Splitter */}
            <div
              onMouseDown={startRowResize}
              className="h-1.5 bg-[#1B1E29] hover:bg-[#00E5FF]/60 cursor-row-resize shrink-0 flex items-center justify-center transition group"
              title="上下拖动调节素材区与成片组轨道区高度"
            >
              <div className="w-10 h-0.5 rounded-full bg-[#3A4158] group-hover:bg-[#00E5FF]" />
            </div>

            {bottomWorkbenchElement}
          </div>

          {/* Draggable Vertical Dock Splitter */}
          <div
            onMouseDown={startVerticalDockResize}
            className="w-1.5 bg-[#1B1E29] hover:bg-[#00E5FF]/60 cursor-col-resize shrink-0 flex items-center justify-center transition group"
            title="左右拖动调节竖屏预览窗口宽度"
          >
            <div className="h-10 w-0.5 rounded-full bg-[#3A4158] group-hover:bg-[#00E5FF]" />
          </div>

          {/* Right Full-Height Tall Preview Dock (Tailor-made for 9:16 Feed Videos!) */}
          <div
            style={{ width: `${verticalMonitorWidth}px` }}
            className="shrink-0 h-full min-h-0 flex flex-col"
          >
            {playerMonitorElement}
          </div>
        </div>
      ) : (
        <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
          {/* Classic Horizontal Layout: 3-Column Upper Studio */}
          <div
            style={{ height: `${effectiveTopPct}%` }}
            className="flex min-h-0 shrink-0 overflow-hidden"
          >
            <div className="w-[365px] xl:w-[410px] shrink-0 h-full border-r border-[#232632]">
              {assetLibraryElement}
            </div>
            <div className="flex-1 min-w-0 h-full border-r border-[#232632]">
              {playerMonitorElement}
            </div>
            <div className="w-[310px] xl:w-[335px] shrink-0 h-full">{inspectorElement}</div>
          </div>

          {/* Draggable Horizontal Splitter */}
          <div
            onMouseDown={startRowResize}
            className="h-1.5 bg-[#1B1E29] hover:bg-[#00E5FF]/60 cursor-row-resize shrink-0 flex items-center justify-center transition group"
            title="上下拖动调节预览区与轨道区高度"
          >
            <div className="w-10 h-0.5 rounded-full bg-[#3A4158] group-hover:bg-[#00E5FF]" />
          </div>

          {bottomWorkbenchElement}
        </div>
      )}

      {/* Precision Trim & Spatial Crop Studio Modal */}
      {trimModalState && (
        <TrimCropModal
          asset={trimModalState.asset}
          initialTrimStart={
            trimModalState.kind === 'clip'
              ? trimModalState.clip.trimStart
              : trimModalState.asset.defaultTrimStart
          }
          initialTrimEnd={
            trimModalState.kind === 'clip'
              ? trimModalState.clip.trimEnd
              : trimModalState.asset.defaultTrimEnd
          }
          initialSpeed={trimModalState.kind === 'clip' ? trimModalState.clip.speed : 1.0}
          initialCrop={
            trimModalState.kind === 'clip'
              ? trimModalState.clip.crop
              : trimModalState.asset.defaultCrop
          }
          initialFitMode={
            trimModalState.kind === 'clip'
              ? trimModalState.clip.fitMode
              : trimModalState.asset.defaultFitMode
          }
          mode={trimModalState.kind}
          groupName={trimModalState.kind === 'clip' ? trimModalState.group.name : undefined}
          onClose={() => setTrimModalState(null)}
          onSave={handleTrimModalSave}
        />
      )}

      {/* AI Neural Text-to-Speech & Post-TTS Smart Breath Removal Modal */}
      {ttsModalState.open && (
        <TtsStudioModal
          project={project}
          activeGroup={activeGroup}
          defaultAssignMode={ttsModalState.defaultAssignMode}
          onClose={() => setTtsModalState({ open: false })}
          onProjectUpdated={(updatedProject, createdAssets, toastMsg) => {
            setUndoStack((u) => [...u.slice(-24), structuredClone(project)]);
            setProject(updatedProject);
            if (createdAssets[0]) {
              setSelectedSourceId(createdAssets[0].id);
            }
            saveProjectApi(updatedProject).catch(() => {});
            showToast(toastMsg);
          }}
          onOpenAudioEditor={(asset) => {
            setTtsModalState({ open: false });
            setAudioEditorAsset(asset);
          }}
        />
      )}

      {/* Visual Waveform Audio Trimmer, Chorus Selector & Smart Breath Removal Modal */}
      {audioEditorAsset && (
        <AudioEditorModal
          project={project}
          asset={audioEditorAsset}
          onClose={() => setAudioEditorAsset(null)}
          onSaveNonDestructive={(assetId, patch: NonDestructiveAudioSave) => {
            updateProject((d) => {
              const target = d.assets.find((a) => a.id === assetId);
              if (target) {
                target.audioRole = patch.audioRole;
                target.defaultTrimStart = patch.trimStart;
                target.defaultTrimEnd = patch.trimEnd;
                target.defaultSpeed = patch.speed;
                target.fadeInSec = patch.fadeInSec;
                target.fadeOutSec = patch.fadeOutSec;
              }
              if (patch.syncToActiveGroup && activeGroup) {
                const grp = d.videoGroups.find((g) => g.id === activeGroup.id);
                if (grp) {
                  if (patch.audioRole === 'voiceover') {
                    grp.voiceoverAssetId = assetId;
                    grp.voiceoverTrimStart = patch.trimStart;
                    grp.voiceoverTrimEnd = patch.trimEnd;
                    grp.voiceoverSpeed = patch.speed;
                    grp.bgmDucking = true;
                  } else {
                    grp.bgmAssetId = assetId;
                    grp.bgmTrimStart = patch.trimStart;
                    grp.bgmTrimEnd = patch.trimEnd;
                    grp.bgmSpeed = patch.speed;
                    grp.bgmFadeInSec = patch.fadeInSec;
                    grp.bgmFadeOutSec = patch.fadeOutSec;
                  }
                }
              }
              return d;
            });
            setAudioEditorAsset(null);
            showToast('✓ 已保存音频声波截取范围、淡入淡出与倍速参数');
          }}
          onProjectReplaced={(updatedProject, updatedAsset, msg) => {
            setUndoStack((u) => [...u.slice(-24), structuredClone(project)]);
            setProject(updatedProject);
            setAudioEditorAsset(updatedAsset);
            setSelectedSourceId(updatedAsset.id);
            showToast(msg);
          }}
        />
      )}

      {/* Production FFmpeg Batch Render Center Modal */}
      {exportModalState.open && (
        <BatchExportModal
          project={project}
          hardware={hardware}
          probingHardware={probingHardware}
          onRefreshHardware={() => void refreshHardware(true)}
          specificGroupIds={exportModalState.specificGroupIds}
          onClose={() => setExportModalState({ open: false })}
          onProjectExportSettingsChange={(patch) =>
            updateProject((d) => {
              Object.assign(d, patch);
              return d;
            }, false)
          }
        />
      )}
    </div>
  );
};
