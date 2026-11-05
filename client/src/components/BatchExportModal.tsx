import React, { useEffect, useState } from 'react';
import {
  Archive,
  CheckCircle2,
  Cpu,
  Download,
  Film,
  FolderOpen,
  Gauge,
  Image as ImageIcon,
  Loader2,
  Play,
  RefreshCw,
  Sparkles,
  StopCircle,
  X,
  AlertCircle,
  Zap,
} from 'lucide-react';
import {
  AspectRatio,
  COVER_EXPORT_MODES,
  CoverExportMode,
  ExportQuality,
  getTargetDimensions,
  HardwareAccelerationReport,
  ProjectData,
  RenderBatchJob,
  VideoEncoderId,
} from '@shared/schema';
import {
  cancelBatchApi,
  isStandaloneBrowserMode,
  pollBatchStatusApi,
  startBatchRenderApi,
} from '../api';
import { formatBytes } from '../utils/format';
import { CustomSelect, SelectOption } from './CustomSelect';

interface Props {
  project: ProjectData;
  hardware: HardwareAccelerationReport | null;
  probingHardware?: boolean;
  onRefreshHardware?: () => void;
  specificGroupIds?: string[];
  initialBatch?: RenderBatchJob | null;
  onClose: () => void;
  onProjectExportSettingsChange: (patch: Partial<ProjectData>) => void;
}

export const BatchExportModal: React.FC<Props> = ({
  project,
  hardware,
  probingHardware = false,
  onRefreshHardware,
  specificGroupIds,
  initialBatch = null,
  onClose,
  onProjectExportSettingsChange,
}) => {
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>(project.aspectRatio || '9:16');
  const [quality, setQuality] = useState<ExportQuality>(project.exportQuality || '1080p');
  const [fps, setFps] = useState<30 | 60>(project.exportFps || 30);
  const [crf, setCrf] = useState<20 | 23>(project.exportCrf || 23);
  const [videoEncoder, setVideoEncoder] = useState<VideoEncoderId>(
    project.videoEncoder || 'auto'
  );
  const [concurrency, setConcurrency] = useState<1 | 2 | 3 | 4>(
    project.renderConcurrency || hardware?.recommendedConcurrency || 2
  );
  const [exportCoverMode, setExportCoverMode] = useState<CoverExportMode>(
    project.exportCoverMode || 'none'
  );
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

  const dedupEnabledCount = targetGroups.filter((g) => g.dedup?.enabled).length;

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
        videoEncoder,
        renderConcurrency: concurrency,
        exportCoverMode,
        filenamePattern: pattern,
      });
      const updatedProject: ProjectData = {
        ...project,
        aspectRatio,
        exportQuality: quality,
        exportFps: fps,
        exportCrf: crf,
        videoEncoder,
        renderConcurrency: concurrency,
        exportCoverMode,
        filenamePattern: pattern,
      };
      const started = await startBatchRenderApi(updatedProject, {
        groupIds: specificGroupIds,
        aspectRatio,
        quality,
        fps,
        crf,
        videoEncoder,
        concurrency,
        exportCoverMode,
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

  const autoResolvedLabel =
    hardware?.encoders.find((e) => e.id === hardware.recommendedEncoder)?.shortLabel ||
    'CPU x264';

  const encoderOptions: SelectOption<VideoEncoderId>[] = [
    {
      value: 'auto',
      label: '⚡ 自动优选硬件加速',
      rightMeta: `当前调用: ${autoResolvedLabel}`,
      metaTone: 'cyan',
    },
    ...(hardware?.encoders || []).map((enc): SelectOption<VideoEncoderId> => {
      const isAvail = enc.available || enc.id === 'libx264';
      let shortReason = '未检测到该显卡';
      if (enc.reason) {
        if (enc.reason.includes('macOS')) shortReason = '仅 macOS';
        else if (enc.reason.includes('AMD') && enc.reason.includes('Windows')) shortReason = '仅 Windows';
        else if (enc.reason.includes('驱动')) shortReason = '需更新驱动';
        else if (enc.reason.length <= 12) shortReason = enc.reason;
      }
      return {
        value: enc.id,
        label: enc.name,
        rightMeta: isAvail ? '✓ 已就绪' : shortReason,
        metaTone: isAvail ? 'emerald' : 'muted',
        disabled: !isAvail,
      };
    }),
  ];

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-3xl bg-[#171922] border border-[#2C3144] rounded-2xl shadow-2xl flex flex-col max-h-[92vh] overflow-hidden">
        {/* Header */}
        <div className="px-5 py-3.5 bg-[#12141B] border-b border-[#252938] flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#00E5FF] to-[#0099CC] text-[#071016] flex items-center justify-center font-bold">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <span>FFmpeg 批量生产渲染中心</span>
                <span className="px-1.5 py-0.5 rounded bg-[#00E5FF]/15 text-[#00E5FF] text-[10px] font-mono">
                  v2.6 GPU加速引擎
                </span>
              </h3>
              <p className="text-[11px] text-[#8A90A2]">
                支持 NVIDIA NVENC / Intel QSV / AMD AMF / Apple 硬件加速 + 异常无感热回退保护
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
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {!batch ? (
            /* Configuration View before Start */
            <div className="space-y-4">
              <div className="p-3.5 rounded-xl bg-[#1E2230] border border-[#2F354A] flex items-center justify-between gap-3">
                <div>
                  <div className="text-xs font-semibold text-white">
                    本次待批量合成成片数量：
                    <span className="text-[#00E5FF] text-sm font-bold ml-1">
                      {targetGroups.length} 条
                    </span>
                    {dedupEnabledCount > 0 && (
                      <span className="ml-2 px-2 py-0.5 rounded bg-[#FFB800]/15 text-[#FFB800] text-[11px]">
                        🛡️ 已启用 {dedupEnabledCount} 条四维防重
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-[#9CA3AF] mt-0.5">
                    输出像素尺寸：{dims.width} × {dims.height} px · H.264 (yuv420p + faststart) · AAC 192kbps
                  </div>
                </div>
                <span className="px-2.5 py-1 rounded-full bg-[#00E5FF]/15 text-[#00E5FF] text-xs font-semibold shrink-0">
                  生产就绪
                </span>
              </div>

              {/* GPU Hardware Encoder & Worker Concurrency Card */}
              {!isStandaloneBrowserMode && (
                <div className="p-3.5 rounded-xl bg-[#131722] border border-[#2A334B] space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-white">
                      <Zap className="w-3.5 h-3.5 text-emerald-400 fill-current" />
                      <span>编码加速引擎与多线程并发</span>
                      {hardware?.gpuNames?.length ? (
                        <span className="text-[11px] font-normal text-[#8A90A2] truncate max-w-[280px]">
                          ({hardware.gpuNames.join(' / ')})
                        </span>
                      ) : null}
                    </div>
                    {onRefreshHardware && (
                      <button
                        type="button"
                        onClick={onRefreshHardware}
                        className="px-2 py-1 rounded bg-[#1E2436] hover:bg-[#283048] text-[11px] text-[#00E5FF] flex items-center gap-1 transition"
                      >
                        <RefreshCw
                          className={`w-3 h-3 ${probingHardware ? 'animate-spin' : ''}`}
                        />
                        重测显卡驱动
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
                    {/* Custom Dark Jianying-Style Encoder Selector */}
                    <div className="md:col-span-7 space-y-1.5 min-w-0">
                      <label className="text-[11px] text-[#B8C0D0] block truncate">
                        H.264 视频编码器（显卡异常时自动无感回退 x264）
                      </label>
                      <CustomSelect<VideoEncoderId>
                        value={videoEncoder}
                        options={encoderOptions}
                        onChange={(val) => setVideoEncoder(val)}
                        menuMinWidth={360}
                        className="w-full h-9 !bg-[#1B2030] !border-[#313954] hover:!border-[#455073]"
                      />
                    </div>

                    {/* Concurrency Selector */}
                    <div className="md:col-span-5 space-y-1.5">
                      <label className="text-[11px] text-[#B8C0D0] flex items-center gap-1">
                        <Gauge className="w-3 h-3 text-[#00E5FF]" />
                        同时并行渲染路数
                      </label>
                      <div className="grid grid-cols-4 gap-1.5">
                        {(
                          [
                            { n: 1, tag: '1路稳' },
                            { n: 2, tag: '2路均' },
                            { n: 3, tag: '3路快' },
                            { n: 4, tag: '4路满' },
                          ] as const
                        ).map((c) => (
                          <button
                            key={c.n}
                            type="button"
                            onClick={() => setConcurrency(c.n)}
                            className={`h-9 rounded-lg border text-xs font-semibold whitespace-nowrap flex items-center justify-center transition ${
                              concurrency === c.n
                                ? 'bg-[#00E5FF]/18 border-[#00E5FF] text-[#00E5FF]'
                                : 'bg-[#1B2030] border-[#2C334A] text-[#9CA3AF] hover:text-white'
                            }`}
                          >
                            {c.tag}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}

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
                        className={`h-9 px-2 rounded-lg border text-xs font-medium whitespace-nowrap flex items-center justify-center transition ${
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
                      className={`h-9 px-3 rounded-lg border text-xs font-medium whitespace-nowrap flex items-center justify-center transition ${
                        quality === '1080p'
                          ? 'bg-[#00E5FF]/15 border-[#00E5FF] text-[#00E5FF]'
                          : 'bg-[#1C1F2B] border-[#2B3042] text-[#9CA3AF] hover:text-white'
                      }`}
                    >
                      1080P 全高清投放级
                    </button>
                    <button
                      onClick={() => setQuality('720p')}
                      className={`h-9 px-3 rounded-lg border text-xs font-medium whitespace-nowrap flex items-center justify-center transition ${
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
                        className={`h-9 rounded-lg border text-xs font-mono whitespace-nowrap flex items-center justify-center transition ${
                          fps === f
                            ? 'bg-[#00E5FF]/15 border-[#00E5FF] text-[#00E5FF]'
                            : 'bg-[#1C1F2B] border-[#2B3042] text-[#9CA3AF] hover:text-white'
                        }`}
                      >
                        {f} FPS
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label
                    className="text-xs font-semibold text-[#D1D5DB] block truncate"
                    title="自动将 CRF 20/23 等画质映射为 GPU 硬件编码器的 CQ/VBR 参数或 CPU x264 CRF"
                  >
                    画质码率档位 (自动适配 GPU / CPU)
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => setCrf(20)}
                      title="GPU NVENC CQ 21 (VBR HQ) / CPU CRF 20 高画质投流码率"
                      className={`h-9 px-2.5 rounded-lg border text-xs font-medium whitespace-nowrap flex items-center justify-center transition ${
                        crf === 20
                          ? 'bg-[#00E5FF]/15 border-[#00E5FF] text-[#00E5FF]'
                          : 'bg-[#1C1F2B] border-[#2B3042] text-[#9CA3AF] hover:text-white'
                      }`}
                    >
                      高画质投流 (CRF 20)
                    </button>
                    <button
                      onClick={() => setCrf(23)}
                      title="GPU NVENC CQ 24 (VBR HQ) / CPU CRF 23 均衡轻量码率"
                      className={`h-9 px-2.5 rounded-lg border text-xs font-medium whitespace-nowrap flex items-center justify-center transition ${
                        crf === 23
                          ? 'bg-[#00E5FF]/15 border-[#00E5FF] text-[#00E5FF]'
                          : 'bg-[#1C1F2B] border-[#2B3042] text-[#9CA3AF] hover:text-white'
                      }`}
                    >
                      均衡轻量 (CRF 23)
                    </button>
                  </div>
                </div>
              </div>

              {isStandaloneBrowserMode && (
                <p className="text-xs text-amber-300">浏览器独立预览模式暂不支持画中画、运镜、音效或封面导出；请使用桌面版或本地服务。</p>
              )}
              <div className="space-y-1">
                <label className="text-xs font-semibold text-[#FFB800] flex items-center gap-1.5">
                  <ImageIcon className="w-3.5 h-3.5" /> 投流封面同步导出
                </label>
                <CustomSelect<CoverExportMode>
                  accent="amber"
                  value={exportCoverMode}
                  options={(Object.keys(COVER_EXPORT_MODES) as CoverExportMode[]).map((id) => ({
                    value: id, label: COVER_EXPORT_MODES[id].label,
                    rightMeta: COVER_EXPORT_MODES[id].badge,
                    metaTone: id === 'none' ? 'muted' : 'amber',
                  }))}
                  onChange={setExportCoverMode}
                  className="w-full"
                />
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
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-xs font-bold text-white flex-wrap">
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
                    {batch.encoderResolved && (
                      <span className="px-2 py-0.5 rounded bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-[10px] font-mono flex items-center gap-1">
                        <Cpu className="w-3 h-3" />
                        {batch.encoderResolved} · {batch.concurrency || 2}路并发
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
                        <div className="text-[11px] text-emerald-400 flex items-center gap-2 flex-wrap">
                          <span>✓ 合成完毕</span>
                          <span className="text-[#8A90A2]">
                            时长 {item.durationSec}s · 大小 {formatBytes(item.fileSizeBytes)}
                            {item.elapsedMs
                              ? ` · 耗时 ${(item.elapsedMs / 1000).toFixed(1)}s`
                              : ''}
                          </span>
                          {item.encoderUsed && (
                            <span className="px-1.5 py-0.2 rounded bg-[#252B3D] text-[#00E5FF] text-[10px] font-mono">
                              {item.encoderUsed}
                            </span>
                          )}
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
                        {item.coverError && <span className="text-xs text-amber-300" title={item.coverError}>封面失败</span>}
                        {item.coverUrl && item.coverFilename && (
                          <a
                            href={
                              item.coverUrl.startsWith('blob:') || item.coverUrl.startsWith('data:')
                                ? item.coverUrl
                                : `/api/download/export/${batch.batchId}/${encodeURIComponent(
                                    item.coverFilename
                                  )}`
                            }
                            download={item.coverFilename}
                            title={`点击下载高清投流封面图：${item.coverFilename}`}
                            className="h-8 pl-1.5 pr-2.5 rounded-lg bg-[#FFB800]/15 hover:bg-[#FFB800] border border-[#FFB800]/35 text-[#FFB800] hover:text-[#111318] font-semibold text-xs whitespace-nowrap flex items-center gap-1.5 transition"
                          >
                            <img
                              src={item.coverUrl}
                              alt=""
                              className="w-5 h-5 rounded object-cover border border-black/30 shrink-0"
                            />
                            <span>封面</span>
                          </a>
                        )}
                        <button
                          onClick={() =>
                            setPreviewMp4Url({
                              url: item.outputUrl!,
                              title: item.outputFilename,
                            })
                          }
                          className="h-8 px-2.5 rounded-lg bg-[#272C3D] hover:bg-[#32384E] text-xs text-white whitespace-nowrap flex items-center gap-1 transition"
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
                          className="h-8 px-2.5 rounded-lg bg-[#00E5FF]/15 hover:bg-[#00E5FF] text-[#00E5FF] hover:text-[#081016] font-semibold text-xs whitespace-nowrap flex items-center gap-1 transition"
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
                点击开始后将按所选引擎 ({videoEncoder === 'auto' ? autoResolvedLabel : videoEncoder}) 并发合成真实 MP4
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
