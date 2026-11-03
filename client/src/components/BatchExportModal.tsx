import React, { useEffect, useState } from 'react';
import {
  Archive,
  CheckCircle2,
  Download,
  Film,
  FolderOpen,
  Loader2,
  Play,
  Sparkles,
  StopCircle,
  X,
  AlertCircle,
} from 'lucide-react';
import {
  AspectRatio,
  ExportQuality,
  getTargetDimensions,
  ProjectData,
  RenderBatchJob,
} from '@shared/schema';
import {
  cancelBatchApi,
  isStandaloneBrowserMode,
  pollBatchStatusApi,
  startBatchRenderApi,
} from '../api';
import { formatBytes } from '../utils/format';

interface Props {
  project: ProjectData;
  specificGroupIds?: string[];
  initialBatch?: RenderBatchJob | null;
  onClose: () => void;
  onProjectExportSettingsChange: (patch: Partial<ProjectData>) => void;
}

export const BatchExportModal: React.FC<Props> = ({
  project,
  specificGroupIds,
  initialBatch = null,
  onClose,
  onProjectExportSettingsChange,
}) => {
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>(project.aspectRatio || '9:16');
  const [quality, setQuality] = useState<ExportQuality>(project.exportQuality || '1080p');
  const [fps, setFps] = useState<30 | 60>(project.exportFps || 30);
  const [crf, setCrf] = useState<20 | 23>(project.exportCrf || 23);
  const [pattern, setPattern] = useState(
    project.filenamePattern || '{project}_{index}_{group}'
  );

  const [batch, setBatch] = useState<RenderBatchJob | null>(initialBatch);
  const [starting, setStarting] = useState(false);
  const [previewMp4Url, setPreviewMp4Url] = useState<{ url: string; title: string } | null>(
    null
  );

  const targetGroups = project.videoGroups.filter((g) => {
    if (g.clips.length === 0) return false;
    if (specificGroupIds && specificGroupIds.length > 0) {
      return specificGroupIds.includes(g.id);
    }
    return g.selectedForExport;
  });

  // Auto-start immediately if opened from "单导" (specificGroupIds)
  useEffect(() => {
    if (specificGroupIds && specificGroupIds.length > 0 && !batch) {
      void handleStartRender();
    }
  }, []);

  // Poll FFmpeg progress while batch is running
  useEffect(() => {
    if (!batch || batch.status !== 'running') return;
    const timer = setInterval(async () => {
      try {
        const updated = await pollBatchStatusApi(batch.batchId);
        setBatch(updated);
      } catch {
        // ignore transient network hiccup
      }
    }, 650);
    return () => clearInterval(timer);
  }, [batch?.batchId, batch?.status]);

  const handleStartRender = async () => {
    if (targetGroups.length === 0) return;
    setStarting(true);
    try {
      onProjectExportSettingsChange({
        aspectRatio,
        exportQuality: quality,
        exportFps: fps,
        exportCrf: crf,
        filenamePattern: pattern,
      });
      const updatedProject: ProjectData = {
        ...project,
        aspectRatio,
        exportQuality: quality,
        exportFps: fps,
        exportCrf: crf,
        filenamePattern: pattern,
      };
      const started = await startBatchRenderApi(updatedProject, {
        groupIds: specificGroupIds,
        aspectRatio,
        quality,
        fps,
        crf,
        filenamePattern: pattern,
      });
      setBatch(started);
    } catch (err: any) {
      alert(err?.message || '启动导出失败');
    } finally {
      setStarting(false);
    }
  };

  const dims = getTargetDimensions(aspectRatio, quality);
  const doneCount = batch ? batch.items.filter((i) => i.status === 'done').length : 0;
  const overallProgress = batch
    ? batch.items.length > 0
      ? Math.round(
          batch.items.reduce((acc, i) => acc + (i.progress || 0), 0) / batch.items.length
        )
      : 100
    : 0;

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-3xl bg-[#171922] border border-[#2C3144] rounded-2xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="px-5 py-3.5 bg-[#12141B] border-b border-[#252938] flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#00E5FF] to-[#0099CC] text-[#071016] flex items-center justify-center font-bold">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">
                FFmpeg 批量生产渲染中心
              </h3>
              <p className="text-[11px] text-[#8A90A2]">
                H.264 (libx264) + AAC 192kbps · 硬件友好流式合成 · 支持投放平台即传即播
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-[#8A90A2] hover:text-white hover:bg-[#242836]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {!batch ? (
            /* Configuration View before Start */
            <div className="space-y-4">
              <div className="p-3.5 rounded-xl bg-[#1E2230] border border-[#2F354A] flex items-center justify-between">
                <div>
                  <div className="text-xs font-semibold text-white">
                    本次待批量合成成片数量：
                    <span className="text-[#00E5FF] text-sm font-bold ml-1">
                      {targetGroups.length} 条
                    </span>
                  </div>
                  <div className="text-[11px] text-[#9CA3AF] mt-0.5">
                    输出像素尺寸：{dims.width} × {dims.height} px · 编码格式 MP4 (yuv420p + faststart)
                  </div>
                </div>
                <span className="px-2.5 py-1 rounded-full bg-[#00E5FF]/15 text-[#00E5FF] text-xs font-semibold">
                  生产就绪
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-[#D1D5DB]">成片画幅比例</label>
                  <div className="grid grid-cols-3 gap-2">
                    {(
                      [
                        { id: '9:16', label: '9:16 竖屏信息流' },
                        { id: '16:9', label: '16:9 横屏视频' },
                        { id: '1:1', label: '1:1 电商主图' },
                      ] as const
                    ).map((opt) => (
                      <button
                        key={opt.id}
                        onClick={() => setAspectRatio(opt.id)}
                        className={`py-2 px-2 rounded-lg border text-xs font-medium transition ${
                          aspectRatio === opt.id
                            ? 'bg-[#00E5FF]/15 border-[#00E5FF] text-[#00E5FF]'
                            : 'bg-[#1C1F2B] border-[#2B3042] text-[#9CA3AF] hover:text-white'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-[#D1D5DB]">输出清晰度规格</label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => setQuality('1080p')}
                      className={`py-2 px-3 rounded-lg border text-xs font-medium transition ${
                        quality === '1080p'
                          ? 'bg-[#00E5FF]/15 border-[#00E5FF] text-[#00E5FF]'
                          : 'bg-[#1C1F2B] border-[#2B3042] text-[#9CA3AF] hover:text-white'
                      }`}
                    >
                      1080P 全高清投放级
                    </button>
                    <button
                      onClick={() => setQuality('720p')}
                      className={`py-2 px-3 rounded-lg border text-xs font-medium transition ${
                        quality === '720p'
                          ? 'bg-[#00E5FF]/15 border-[#00E5FF] text-[#00E5FF]'
                          : 'bg-[#1C1F2B] border-[#2B3042] text-[#9CA3AF] hover:text-white'
                      }`}
                    >
                      720P 极速审片级
                    </button>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-[#D1D5DB]">帧率 (FPS)</label>
                  <div className="grid grid-cols-2 gap-2">
                    {([30, 60] as const).map((f) => (
                      <button
                        key={f}
                        onClick={() => setFps(f)}
                        className={`py-2 rounded-lg border text-xs font-mono transition ${
                          fps === f
                            ? 'bg-[#00E5FF]/15 border-[#00E5FF] text-[#00E5FF]'
                            : 'bg-[#1C1F2B] border-[#2B3042] text-[#9CA3AF]'
                        }`}
                      >
                        {f} FPS
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-[#D1D5DB]">画质码率控制</label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => setCrf(20)}
                      className={`py-2 rounded-lg border text-xs transition ${
                        crf === 20
                          ? 'bg-[#00E5FF]/15 border-[#00E5FF] text-[#00E5FF]'
                          : 'bg-[#1C1F2B] border-[#2B3042] text-[#9CA3AF]'
                      }`}
                    >
                      高画质码率 (CRF 20)
                    </button>
                    <button
                      onClick={() => setCrf(23)}
                      className={`py-2 rounded-lg border text-xs transition ${
                        crf === 23
                          ? 'bg-[#00E5FF]/15 border-[#00E5FF] text-[#00E5FF]'
                          : 'bg-[#1C1F2B] border-[#2B3042] text-[#9CA3AF]'
                      }`}
                    >
                      均衡轻量体积 (CRF 23)
                    </button>
                  </div>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-[#D1D5DB]">
                  批量文件自动命名规则 (支持变量 {'{project}'} {'{index}'} {'{group}'})
                </label>
                <input
                  type="text"
                  value={pattern}
                  onChange={(e) => setPattern(e.target.value)}
                  className="w-full bg-[#11131A] border border-[#2B3042] focus:border-[#00E5FF] rounded-lg px-3 py-2 text-xs text-white font-mono outline-none"
                />
              </div>
            </div>
          ) : (
            /* Live Batch Render Queue View */
            <div className="space-y-4">
              {/* Overall Progress Card */}
              <div className="p-4 rounded-xl bg-[#12141C] border border-[#282D3E] space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs font-bold text-white">
                    {batch.status === 'running' ? (
                      <>
                        <Loader2 className="w-4 h-4 text-[#00E5FF] animate-spin" />
                        正在并行合成视频 ({doneCount}/{batch.items.length})...
                      </>
                    ) : batch.status === 'completed' ? (
                      <>
                        <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                        全部成片渲染完成！共 {doneCount} 条 MP4 视频
                      </>
                    ) : batch.status === 'cancelled' ? (
                      <span className="text-amber-400">已取消批量任务</span>
                    ) : (
                      <span className="text-amber-300">
                        渲染结束（已完成 {doneCount}/{batch.items.length} 条）
                      </span>
                    )}
                  </div>
                  <span className="font-mono text-sm font-bold text-[#00E5FF]">
                    {overallProgress}%
                  </span>
                </div>

                <div className="h-2 rounded-full bg-[#222634] overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-[#00E5FF] to-[#10B981] transition-all duration-300"
                    style={{ width: `${overallProgress}%` }}
                  />
                </div>
              </div>

              {/* Per-Video Item List */}
              <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
                {batch.items.map((item, idx) => (
                  <div
                    key={item.jobItemId}
                    className="p-3 rounded-xl bg-[#1C1F2B] border border-[#2A2F42] flex items-center justify-between gap-3"
                  >
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex items-center gap-2 text-xs font-semibold text-white">
                        <span className="font-mono text-[#00E5FF]">
                          #{String(idx + 1).padStart(2, '0')}
                        </span>
                        <span className="truncate">{item.outputFilename}</span>
                      </div>

                      {item.status === 'rendering' || item.status === 'queued' ? (
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-1.5 rounded-full bg-[#11131A] overflow-hidden">
                            <div
                              className="h-full bg-[#00E5FF] transition-all duration-300"
                              style={{ width: `${item.progress}%` }}
                            />
                          </div>
                          <span className="text-[10px] font-mono text-[#9CA3AF] w-9 text-right">
                            {item.status === 'queued' ? '排队中' : `${item.progress}%`}
                          </span>
                        </div>
                      ) : item.status === 'done' ? (
                        <div className="text-[11px] text-emerald-400 flex items-center gap-2">
                          <span>✓ 合成完毕</span>
                          <span className="text-[#8A90A2]">
                            时长 {item.durationSec}s · 大小 {formatBytes(item.fileSizeBytes)}
                          </span>
                        </div>
                      ) : (
                        <div className="text-[11px] text-red-400 flex items-center gap-1">
                          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                          <span className="truncate">{item.error || '已取消'}</span>
                        </div>
                      )}
                    </div>

                    {/* Item Actions */}
                    {item.status === 'done' && item.outputUrl && (
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          onClick={() =>
                            setPreviewMp4Url({
                              url: item.outputUrl!,
                              title: item.outputFilename,
                            })
                          }
                          className="px-2.5 py-1.5 rounded-lg bg-[#272C3D] hover:bg-[#32384E] text-xs text-white flex items-center gap-1 transition"
                        >
                          <Play className="w-3 h-3 fill-current text-[#00E5FF]" />
                          验片
                        </button>
                        <a
                          href={
                            item.outputUrl.startsWith('blob:')
                              ? item.outputUrl
                              : `/api/download/export/${batch.batchId}/${encodeURIComponent(
                                  item.outputFilename
                                )}`
                          }
                          download={item.outputFilename}
                          className="px-2.5 py-1.5 rounded-lg bg-[#00E5FF]/15 hover:bg-[#00E5FF] text-[#00E5FF] hover:text-[#081016] font-semibold text-xs flex items-center gap-1 transition"
                        >
                          <Download className="w-3.5 h-3.5" />
                          下载
                        </a>
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* Inline Rendered MP4 Verification Player */}
              {previewMp4Url && (
                <div className="p-3 rounded-xl bg-black border border-[#00E5FF]/50 space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-[#00E5FF] font-semibold flex items-center gap-1.5">
                      <Film className="w-3.5 h-3.5" />
                      成片实机播放验片：{previewMp4Url.title}
                    </span>
                    <button
                      onClick={() => setPreviewMp4Url(null)}
                      className="text-[#9CA3AF] hover:text-white text-xs"
                    >
                      收起播放器
                    </button>
                  </div>
                  <video
                    src={previewMp4Url.url}
                    controls
                    autoPlay
                    className="w-full max-h-[300px] rounded bg-black object-contain"
                  />
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3.5 bg-[#12141B] border-t border-[#252938] flex items-center justify-between gap-3">
          {!batch ? (
            <>
              <span className="text-[11px] text-[#8A90A2]">
                点击开始后将调用后端 FFmpeg 并发合成真实 MP4 文件
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={onClose}
                  className="px-4 py-2 rounded-lg bg-[#252938] text-xs text-[#CBD5E1]"
                >
                  取消
                </button>
                <button
                  onClick={handleStartRender}
                  disabled={targetGroups.length === 0 || starting}
                  className="px-5 py-2 rounded-lg bg-gradient-to-r from-[#00E5FF] to-[#00B4D8] text-[#071016] font-bold text-xs flex items-center gap-1.5 hover:brightness-110 transition disabled:opacity-40"
                >
                  <Sparkles className="w-4 h-4" />
                  {starting ? '正在提交队列...' : `开始批量渲染 (${targetGroups.length}条)`}
                </button>
              </div>
            </>
          ) : (
            <>
              <div>
                {batch.status === 'running' ? (
                  <button
                    onClick={async () => {
                      const updated = await cancelBatchApi(batch.batchId);
                      setBatch(updated);
                    }}
                    className="px-3 py-1.5 rounded-lg bg-red-500/15 hover:bg-red-500/25 border border-red-500/40 text-red-300 text-xs flex items-center gap-1"
                  >
                    <StopCircle className="w-3.5 h-3.5" />
                    中止渲染
                  </button>
                ) : (
                  <button
                    onClick={() => setBatch(null)}
                    className="px-3 py-1.5 rounded-lg bg-[#242836] hover:bg-[#2F3547] text-xs text-[#CBD5E1]"
                  >
                    调整参数重新导出
                  </button>
                )}
              </div>

              <div className="flex items-center gap-2.5">
                {doneCount > 0 &&
                  (isStandaloneBrowserMode ? (
                    <button
                      onClick={() => {
                        batch.items
                          .filter((i) => i.status === 'done' && i.outputUrl)
                          .forEach((item, i) => {
                            setTimeout(() => {
                              const a = document.createElement('a');
                              a.href = item.outputUrl!;
                              a.download = item.outputFilename;
                              a.click();
                            }, i * 350);
                          });
                      }}
                      className="px-4 py-2 rounded-lg bg-gradient-to-r from-[#00E5FF] to-[#00B4D8] text-[#071016] font-bold text-xs flex items-center gap-1.5 hover:brightness-110 shadow transition"
                    >
                      <Archive className="w-4 h-4" />
                      一键批量下载全部成片 ({doneCount}条)
                    </button>
                  ) : (
                    <div className="flex items-center gap-2">
                      {(window.location.hostname === '127.0.0.1' ||
                        window.location.hostname === 'localhost' ||
                        Boolean((window as any).flowcutDesktop)) && (
                        <button
                          onClick={async () => {
                            if ((window as any).flowcutDesktop?.openExportsFolder) {
                              await (window as any).flowcutDesktop.openExportsFolder(batch.batchId);
                              return;
                            }
                            await fetch('/api/system/open-exports', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ batchId: batch.batchId }),
                            });
                          }}
                          className="px-3.5 py-2 rounded-lg bg-[#23283A] hover:bg-[#2F364E] border border-[#38405C] text-[#00E5FF] font-semibold text-xs flex items-center gap-1.5 whitespace-nowrap transition"
                          title="直接在系统资源管理器中定位已渲染的本地 MP4 成片目录"
                        >
                          <FolderOpen className="w-4 h-4 shrink-0" />
                          打开本地成片目录
                        </button>
                      )}
                      <a
                        href={`/api/renders/${batch.batchId}/zip`}
                        className="px-4 py-2 rounded-lg bg-gradient-to-r from-[#00E5FF] to-[#00B4D8] text-[#071016] font-bold text-xs flex items-center gap-1.5 hover:brightness-110 shadow whitespace-nowrap transition"
                      >
                        <Archive className="w-4 h-4 shrink-0" />
                        一键打包下载全部成片 ZIP ({doneCount}条)
                      </a>
                    </div>
                  ))}
                <button
                  onClick={onClose}
                  className="px-4 py-2 rounded-lg bg-[#252938] hover:bg-[#31364A] text-xs text-white"
                >
                  完成关闭
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
