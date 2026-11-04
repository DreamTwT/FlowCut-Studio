import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Check,
  ChevronDown,
  Cpu,
  Download,
  FilePlus2,
  FolderOpen,
  Mic,
  Monitor,
  Redo2,
  RefreshCw,
  Smartphone,
  Sparkles,
  Trash2,
  Undo2,
  Upload,
  Wand2,
  Zap,
} from 'lucide-react';
import { AspectRatio, HardwareAccelerationReport, ProjectData } from '@shared/schema';
import { ProjectSummary } from '../api';

export type WorkspaceLayout = 'vertical' | 'horizontal';

interface Props {
  project: ProjectData;
  projects: ProjectSummary[];
  hardware: HardwareAccelerationReport | null;
  probingHardware?: boolean;
  onRefreshHardware?: () => void;
  workspaceLayout: WorkspaceLayout;
  canUndo: boolean;
  canRedo: boolean;
  saveState: 'saved' | 'saving' | 'unsaved';
  onChangeWorkspaceLayout: (layout: WorkspaceLayout) => void;
  onUndo: () => void;
  onRedo: () => void;
  onRenameProject: (name: string) => void;
  onChangeAspectRatio: (ar: AspectRatio) => void;
  onSelectProject: (id: string) => void;
  onDeleteProject: (id: string) => void;
  onNewBlankProject: () => void;
  onLoadDemoProject: () => void;
  onExportProjectJson: () => void;
  onImportProjectJson: (file: File) => void;
  onOpenTtsStudio: () => void;
  onOpenBatchExport: () => void;
}

export const TopHeader: React.FC<Props> = ({
  project,
  projects,
  hardware,
  probingHardware = false,
  onRefreshHardware,
  workspaceLayout,
  canUndo,
  canRedo,
  saveState,
  onChangeWorkspaceLayout,
  onUndo,
  onRedo,
  onRenameProject,
  onChangeAspectRatio,
  onSelectProject,
  onDeleteProject,
  onNewBlankProject,
  onLoadDemoProject,
  onExportProjectJson,
  onImportProjectJson,
  onOpenTtsStudio,
  onOpenBatchExport,
}) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const menuWrapRef = useRef<HTMLDivElement | null>(null);
  const importInputRef = useRef<HTMLInputElement | null>(null);

  const exportableCount = project.videoGroups.filter(
    (g) => g.selectedForExport && g.clips.length > 0
  ).length;

  // Ensure the active project always reflects live name/groupCount/assetCount in the list
  const mergedProjects = useMemo(() => {
    const liveEntry: ProjectSummary = {
      id: project.id,
      name: project.name,
      updatedAt: project.updatedAt,
      groupCount: project.videoGroups.length,
      assetCount: project.assets.length,
    };
    const exists = projects.some((p) => p.id === project.id);
    if (!exists) return [liveEntry, ...projects];
    return projects.map((p) => (p.id === project.id ? liveEntry : p));
  }, [projects, project]);

  // Close project menu cleanly on outside click or Escape (never jumpy onMouseLeave!)
  useEffect(() => {
    if (!menuOpen) {
      setConfirmDeleteId(null);
      return;
    }
    const onPointerDown = (e: MouseEvent) => {
      if (menuWrapRef.current && !menuWrapRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    window.addEventListener('mousedown', onPointerDown);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('mousedown', onPointerDown);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [menuOpen]);

  return (
    <header className="h-11 px-3 bg-[#121319] border-b border-[#232632] flex items-center justify-between gap-2 shrink-0 select-none z-30">
      {/* Left: Brand + Project Switcher & Delete Manager */}
      <div className="flex items-center gap-2 min-w-0">
        <div className="flex items-center gap-1.5 shrink-0 whitespace-nowrap">
          <div className="w-6 h-6 rounded-md bg-gradient-to-br from-[#00E5FF] to-[#0099CC] flex items-center justify-center shadow-[0_0_12px_rgba(0,229,255,0.28)]">
            <Sparkles className="w-3.5 h-3.5 text-[#071016] stroke-[2.5]" />
          </div>
          <span className="font-black text-xs sm:text-sm tracking-tight text-white">
            流剪矩阵{' '}
            <span className="text-[#00E5FF] font-semibold text-[11px] hidden xl:inline">
              FlowCut
            </span>
          </span>
        </div>

        <div className="h-4 w-px bg-[#262A38] shrink-0" />

        <div ref={menuWrapRef} className="relative flex items-center gap-1.5 min-w-0">
          <input
            type="text"
            value={project.name}
            onChange={(e) => onRenameProject(e.target.value)}
            title="直接修改当前工程名称"
            className="bg-[#161923] hover:bg-[#1E2332] focus:bg-[#1E2332] border border-[#2C3144] focus:border-[#00E5FF] rounded-md px-2 py-1 text-xs font-medium text-white outline-none w-36 md:w-48 truncate transition"
          />

          <button
            type="button"
            onClick={() => setMenuOpen((o) => !o)}
            className={`px-2.5 py-1 rounded-md border text-xs whitespace-nowrap shrink-0 flex items-center gap-1 transition ${
              menuOpen
                ? 'bg-[#1E2332] border-[#00E5FF] text-white shadow-[0_0_0_2px_rgba(0,229,255,0.16)]'
                : 'bg-[#161923] hover:bg-[#1E2332] border-[#2C3144] hover:border-[#3E4660] text-[#CBD5E1]'
            }`}
          >
            <FolderOpen className="w-3.5 h-3.5 text-[#00E5FF] shrink-0" />
            工程管理
            <ChevronDown
              className={`w-3 h-3 shrink-0 transition-transform duration-150 ${
                menuOpen ? 'rotate-180 text-[#00E5FF]' : 'text-[#8A90A2]'
              }`}
            />
          </button>

          {menuOpen && (
            <div className="absolute left-0 top-full mt-1.5 w-80 rounded-xl bg-[#171A25]/98 backdrop-blur-md border border-[#343C55] shadow-[0_18px_48px_rgba(0,0,0,0.85)] p-2.5 z-50 space-y-2">
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    onNewBlankProject();
                  }}
                  className="px-2.5 py-2 rounded-lg bg-[#00E5FF]/14 hover:bg-[#00E5FF]/24 border border-[#00E5FF]/35 text-xs text-[#00E5FF] font-semibold flex items-center justify-center gap-1.5 whitespace-nowrap transition"
                >
                  <FilePlus2 className="w-3.5 h-3.5 shrink-0" />
                  新建空白工程
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    onLoadDemoProject();
                  }}
                  className="px-2.5 py-2 rounded-lg bg-[#FFB800]/12 hover:bg-[#FFB800]/22 border border-[#FFB800]/30 text-xs text-[#FFB800] font-semibold flex items-center justify-center gap-1.5 whitespace-nowrap transition"
                >
                  <Wand2 className="w-3.5 h-3.5 shrink-0" />
                  载入演示工程
                </button>
              </div>

              <div className="grid grid-cols-2 gap-1.5 pt-1.5 border-t border-[#282E42]">
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    onExportProjectJson();
                  }}
                  className="px-2.5 py-1.5 rounded-lg bg-[#1F2434] hover:bg-[#293046] text-[11px] text-[#CBD5E1] hover:text-white flex items-center justify-center gap-1.5 whitespace-nowrap transition"
                >
                  <Download className="w-3.5 h-3.5 shrink-0" />
                  导出工程备份
                </button>
                <button
                  type="button"
                  onClick={() => importInputRef.current?.click()}
                  className="px-2.5 py-1.5 rounded-lg bg-[#1F2434] hover:bg-[#293046] text-[11px] text-[#CBD5E1] hover:text-white flex items-center justify-center gap-1.5 whitespace-nowrap transition"
                >
                  <Upload className="w-3.5 h-3.5 shrink-0" />
                  导入工程备份
                </button>
                <input
                  ref={importInputRef}
                  type="file"
                  accept=".json"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) {
                      setMenuOpen(false);
                      onImportProjectJson(f);
                    }
                    e.currentTarget.value = '';
                  }}
                />
              </div>

              {/* Quick Delete Current Active Project */}
              <div className="pt-1.5 border-t border-[#282E42]">
                {confirmDeleteId === `__current__:${project.id}` ? (
                  <div className="p-2 rounded-lg bg-red-500/12 border border-red-500/40 space-y-1.5">
                    <div className="flex items-center gap-1.5 text-[11px] text-red-300 font-medium">
                      <AlertTriangle className="w-3.5 h-3.5 text-red-400 shrink-0" />
                      <span className="truncate">确认删除「{project.name}」？</span>
                    </div>
                    <div className="flex items-center justify-end gap-1.5">
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteId(null)}
                        className="px-2.5 py-1 rounded bg-[#252A3A] hover:bg-[#31384E] text-[11px] text-[#CBD5E1] whitespace-nowrap"
                      >
                        取消
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const targetId = project.id;
                          setConfirmDeleteId(null);
                          setMenuOpen(false);
                          onDeleteProject(targetId);
                        }}
                        className="px-2.5 py-1 rounded bg-red-500 hover:bg-red-600 text-[11px] text-white font-semibold whitespace-nowrap"
                      >
                        确认永久删除
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmDeleteId(`__current__:${project.id}`)}
                    className="w-full px-2.5 py-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 border border-red-500/25 text-[11px] text-red-300 hover:text-red-200 flex items-center justify-center gap-1.5 whitespace-nowrap transition"
                  >
                    <Trash2 className="w-3.5 h-3.5 shrink-0" />
                    删除当前打开的工程
                  </button>
                )}
              </div>

              {/* Saved Projects Switcher + Per-Project Delete Action */}
              {mergedProjects.length > 0 && (
                <div className="pt-1.5 border-t border-[#282E42]">
                  <div className="px-1.5 pb-1.5 flex items-center justify-between text-[10px] text-[#8A90A2]">
                    <span>全部已保存工程 ({mergedProjects.length})</span>
                    <span>点击切换 / 右侧删除</span>
                  </div>
                  <div className="max-h-52 overflow-y-auto space-y-1 pr-0.5">
                    {mergedProjects.map((p) => {
                      const isCurrent = p.id === project.id;
                      const isConfirming = confirmDeleteId === p.id;

                      if (isConfirming) {
                        return (
                          <div
                            key={p.id}
                            className="px-2.5 py-1.5 rounded-lg bg-red-500/15 border border-red-500/45 flex items-center justify-between gap-2"
                          >
                            <span className="text-[11px] text-red-200 truncate">
                              删除「{p.name}」？
                            </span>
                            <div className="flex items-center gap-1 shrink-0">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setConfirmDeleteId(null);
                                }}
                                className="px-2 py-0.5 rounded bg-[#252A3A] text-[10px] text-[#CBD5E1] hover:text-white whitespace-nowrap"
                              >
                                取消
                              </button>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setConfirmDeleteId(null);
                                  if (isCurrent) setMenuOpen(false);
                                  onDeleteProject(p.id);
                                }}
                                className="px-2 py-0.5 rounded bg-red-500 hover:bg-red-600 text-[10px] text-white font-semibold whitespace-nowrap"
                              >
                                确认删除
                              </button>
                            </div>
                          </div>
                        );
                      }

                      return (
                        <div
                          key={p.id}
                          className={`group rounded-lg flex items-center justify-between gap-1 px-2 py-1.5 transition ${
                            isCurrent
                              ? 'bg-[#00E5FF]/14 border border-[#00E5FF]/35 text-white'
                              : 'hover:bg-[#23283A] border border-transparent text-[#CBD5E1]'
                          }`}
                        >
                          <button
                            type="button"
                            onClick={() => {
                              setMenuOpen(false);
                              if (!isCurrent) onSelectProject(p.id);
                            }}
                            className="flex-1 min-w-0 text-left flex items-center justify-between gap-2"
                          >
                            <span className="flex items-center gap-1.5 min-w-0 truncate">
                              <span
                                className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                                  isCurrent ? 'bg-[#00E5FF]' : 'bg-[#52586A]'
                                }`}
                              />
                              <span
                                className={`text-xs truncate ${
                                  isCurrent ? 'font-semibold text-[#00E5FF]' : 'hover:text-white'
                                }`}
                                title={p.name}
                              >
                                {p.name}
                              </span>
                            </span>
                            <span className="text-[10px] font-mono text-[#7E8596] shrink-0">
                              {p.groupCount}组
                            </span>
                          </button>

                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setConfirmDeleteId(p.id);
                            }}
                            title={`删除工程「${p.name}」`}
                            className="p-1 rounded-md text-[#6B7280] hover:text-red-400 hover:bg-red-500/15 shrink-0 transition"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <span className="text-[11px] text-[#6B7280] hidden 2xl:flex items-center gap-1 whitespace-nowrap shrink-0">
          <Check className="w-3 h-3 text-emerald-400" />
          {saveState === 'saving' ? '保存中' : '已保存'}
        </span>
      </div>

      {/* Center: Canvas Aspect Ratio + Jianying Vertical/Horizontal Layout Switcher! */}
      <div className="flex items-center gap-2 shrink-0">
        {/* Aspect Ratio */}
        <div className="flex items-center bg-[#0B0C10] p-0.5 rounded-lg border border-[#242836]">
          {(
            [
              { id: '9:16', label: '9:16 竖屏' },
              { id: '16:9', label: '16:9 横屏' },
              { id: '1:1', label: '1:1 方形' },
            ] as const
          ).map((r) => (
            <button
              key={r.id}
              onClick={() => onChangeAspectRatio(r.id)}
              className={`px-2 py-1 rounded-md text-[11px] font-medium whitespace-nowrap transition ${
                project.aspectRatio === r.id
                  ? 'bg-[#252A3A] text-[#00E5FF] shadow-sm'
                  : 'text-[#8A90A2] hover:text-white'
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>

        {/* Jianying Workspace Layout Mode Switcher! */}
        <div
          className="flex items-center bg-[#0B0C10] p-0.5 rounded-lg border border-[#2B3145]"
          title="切换剪映竖屏创作布局（右侧全高大竖屏预览）或经典横屏剪辑布局"
        >
          <button
            onClick={() => onChangeWorkspaceLayout('vertical')}
            className={`px-2.5 py-1 rounded-md text-[11px] font-semibold whitespace-nowrap flex items-center gap-1 transition ${
              workspaceLayout === 'vertical'
                ? 'bg-[#00E5FF]/18 text-[#00E5FF] border border-[#00E5FF]/40'
                : 'text-[#8A90A2] hover:text-white'
            }`}
          >
            <Smartphone className="w-3 h-3 shrink-0" />
            竖屏布局
          </button>
          <button
            onClick={() => onChangeWorkspaceLayout('horizontal')}
            className={`px-2.5 py-1 rounded-md text-[11px] font-semibold whitespace-nowrap flex items-center gap-1 transition ${
              workspaceLayout === 'horizontal'
                ? 'bg-[#00E5FF]/18 text-[#00E5FF] border border-[#00E5FF]/40'
                : 'text-[#8A90A2] hover:text-white'
            }`}
          >
            <Monitor className="w-3 h-3 shrink-0" />
            横屏布局
          </button>
        </div>

        {/* Undo / Redo */}
        <div className="hidden lg:flex items-center gap-0.5">
          <button
            onClick={onUndo}
            disabled={!canUndo}
            className="p-1.5 rounded-md hover:bg-[#232736] text-[#A6ADBB] hover:text-white disabled:opacity-30"
            title="撤销 (Ctrl+Z)"
          >
            <Undo2 className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={onRedo}
            disabled={!canRedo}
            className="p-1.5 rounded-md hover:bg-[#232736] text-[#A6ADBB] hover:text-white disabled:opacity-30"
            title="重做 (Ctrl+Y)"
          >
            <Redo2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Right: GPU Acceleration Status + AI TTS + Primary Batch Export CTA */}
      <div className="flex items-center gap-2 shrink-0">
        {hardware && (
          <button
            type="button"
            onClick={onRefreshHardware}
            title={
              hardware.hasHardwareGpu
                ? `已启用硬件编码加速: ${
                    hardware.encoders.find((e) => e.id === hardware.recommendedEncoder)?.name ||
                    hardware.recommendedEncoder
                  }${
                    hardware.gpuNames.length > 0 ? `\n检测到显卡: ${hardware.gpuNames.join(' / ')}` : ''
                  }\n点击可重新探测硬件驱动`
                : `当前使用 CPU 多核 x264 高兼容编码${
                    hardware.gpuNames.length > 0 ? `\n检测到显卡: ${hardware.gpuNames.join(' / ')}` : ''
                  }\n点击重新探测 NVIDIA NVENC / Intel QSV / AMD AMF 硬件加速`
            }
            className={`hidden xl:flex items-center gap-1 px-2 py-1 rounded-md border text-[11px] font-medium whitespace-nowrap transition ${
              hardware.hasHardwareGpu
                ? 'bg-emerald-500/12 hover:bg-emerald-500/20 border-emerald-400/40 text-emerald-300'
                : 'bg-[#171A24] hover:bg-[#222736] border-[#2C3144] text-[#9CA3AF] hover:text-white'
            }`}
          >
            {probingHardware ? (
              <RefreshCw className="w-3 h-3 animate-spin text-[#00E5FF] shrink-0" />
            ) : hardware.hasHardwareGpu ? (
              <Zap className="w-3 h-3 text-emerald-400 fill-current shrink-0" />
            ) : (
              <Cpu className="w-3 h-3 text-[#8A90A2] shrink-0" />
            )}
            <span>
              {hardware.hasHardwareGpu
                ? `GPU加速 · ${
                    hardware.encoders.find((e) => e.id === hardware.recommendedEncoder)
                      ?.shortLabel || hardware.recommendedEncoder
                  }`
                : 'CPU 软编'}
            </span>
          </button>
        )}

        <button
          onClick={onOpenTtsStudio}
          className="px-3 py-1.5 rounded-lg bg-gradient-to-r from-[#231E3B] to-[#1A2639] hover:brightness-115 border border-[#00E5FF]/45 text-white font-bold text-xs whitespace-nowrap transition flex items-center gap-1.5 shadow-[0_0_12px_rgba(124,58,237,0.2)]"
          title="打开 AI 爆款脚本裂变 & 神经语音配音中心"
        >
          <Sparkles className="w-3.5 h-3.5 text-[#00E5FF] shrink-0" />
          AI 脚本与配音
        </button>

        <button
          onClick={onOpenBatchExport}
          className="px-3.5 py-1.5 rounded-lg bg-gradient-to-r from-[#00E5FF] to-[#00B4D8] text-[#061017] font-bold text-xs whitespace-nowrap shadow-[0_0_18px_rgba(0,229,255,0.28)] hover:brightness-110 transition flex items-center gap-1.5"
        >
          <Sparkles className="w-3.5 h-3.5 fill-current shrink-0" />
          批量导出 ({exportableCount}条)
        </button>
      </div>
    </header>
  );
};
