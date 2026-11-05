import React from 'react';
import { CopyCheck, Layers } from 'lucide-react';
import { MediaAsset, normalizePictureInPicture, PictureInPictureConfig } from '@shared/schema';
import { CustomSelect } from './CustomSelect';

interface Props {
  value?: PictureInPictureConfig;
  assets: MediaAsset[];
  onChange: (value: PictureInPictureConfig) => void;
  onSync: (value: PictureInPictureConfig) => void;
}

export const PictureInPicturePanel: React.FC<Props> = ({ value, assets, onChange, onSync }) => {
  const cfg = normalizePictureInPicture(value);
  const patch = (update: Partial<PictureInPictureConfig>) => onChange(normalizePictureInPicture({ ...cfg, ...update }));
  const badRange = cfg.endSec > 0 && cfg.endSec <= cfg.startSec;
  const selectedMissing = cfg.assetId && !assets.some(asset => asset.id === cfg.assetId);
  const range = (label: string, key: 'xPercent' | 'yPercent' | 'widthPercent' | 'opacity' | 'similarity' | 'blend', min: number, max: number, step: number) => (
    <label className="block space-y-1" key={key}>
      <span className="flex justify-between text-[11px] text-[#B8C0D0]"><span>{label}</span>
        <span className="font-mono text-[#00E5FF]">{key === 'opacity' || key === 'similarity' || key === 'blend' ? Math.round(cfg[key] * 100) : Math.round(cfg[key])}%</span></span>
      <input aria-label={label} type="range" min={min} max={max} step={step} value={cfg[key]}
        onChange={e => patch({ [key]: Number(e.target.value) })} className="w-full jy-slider" />
    </label>
  );
  return <div data-pip-panel className="p-3 rounded-xl bg-[#181B25] border border-cyan-500/25 space-y-2.5">
    <label className="flex items-center gap-1.5 text-xs font-bold text-white cursor-pointer">
      <input aria-label="启用画中画" type="checkbox" checked={cfg.enabled} className="accent-cyan-400" onChange={e =>
        patch({ enabled: e.target.checked, assetId: cfg.assetId || assets[0]?.id || null })} />
      <Layers className="w-3.5 h-3.5 text-[#00E5FF]" /> 画中画 / 绿幕抠像
    </label>
    {cfg.enabled && <div className="space-y-2.5">
      <label className="text-[11px] text-[#B8C0D0] block">角窗素材（视频循环播放，不使用其原声）</label>
      <CustomSelect<string> value={cfg.assetId || ''} options={[
        { value: '', label: '请选择图片或视频素材' },
        ...(selectedMissing ? [{ value: cfg.assetId!, label: '素材已缺失，请重新选择' }] : []),
        ...assets.map(asset => ({ value: asset.id, label: `${asset.type === 'video' ? '视频' : '图片'} · ${asset.name}` })),
      ]} onChange={id => patch({ assetId: id || null })} className="w-full" />
      {!cfg.assetId && <p className="text-[11px] text-amber-300">请先从素材库导入并选择角窗素材。</p>}
      {selectedMissing && <p className="text-[11px] text-red-400">角窗素材已缺失，导出前请重新选择。</p>}
      <div className="grid grid-cols-2 gap-2">
        {range('水平位置', 'xPercent', 0, 100, 1)}{range('垂直位置', 'yPercent', 0, 100, 1)}
        {range('画中画宽度', 'widthPercent', 5, 100, 1)}{range('画中画不透明度', 'opacity', 0, 1, 0.01)}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <label className="text-[11px] text-[#B8C0D0]">开始时间（秒）<input aria-label="画中画开始时间" type="number" min={0} step={0.1} value={cfg.startSec}
          onChange={e => patch({ startSec: Number(e.target.value) })} className="mt-1 w-full px-2 py-1 rounded bg-[#11131A] border border-[#30364A] text-white outline-none" /></label>
        <label className="text-[11px] text-[#B8C0D0]">结束时间（0 表示结尾）<input aria-label="画中画结束时间" type="number" min={0} step={0.1} value={cfg.endSec}
          onChange={e => patch({ endSec: Number(e.target.value) })} className="mt-1 w-full px-2 py-1 rounded bg-[#11131A] border border-[#30364A] text-white outline-none" /></label>
      </div>
      {badRange && <p className="text-[11px] text-red-400">结束时间必须晚于开始时间。</p>}
      <p className="text-[10px] text-[#8A90A2]">时间按防重变速前的时间轴计算；导出时与成片同步变速。</p>
      <label className="flex items-center gap-1.5 text-xs font-semibold text-emerald-300 cursor-pointer">
        <input aria-label="启用绿幕抠像" type="checkbox" className="accent-emerald-400" checked={cfg.chromaEnabled}
          onChange={e => patch({ chromaEnabled: e.target.checked })} /> 启用颜色抠像
      </label>
      {cfg.chromaEnabled && <div className="space-y-2">
        <label className="text-[11px] text-[#B8C0D0] flex items-center gap-2">抠除颜色
          <input aria-label="抠除颜色" type="color" value={cfg.chromaColor} onChange={e => patch({ chromaColor: e.target.value })}
            className="w-8 h-7 p-0 bg-transparent border-0 cursor-pointer" /><span className="font-mono">{cfg.chromaColor}</span></label>
        <div className="grid grid-cols-2 gap-2">{range('抠像容差', 'similarity', 0.01, 1, 0.01)}{range('边缘柔化', 'blend', 0, 1, 0.01)}</div>
        <p className="text-[10px] text-[#8A90A2]">浏览器抠像为近似预览，最终以 FFmpeg 导出为准；避免选择人物主体颜色。</p>
      </div>}
      <button type="button" onClick={() => onSync(cfg)} className="w-full py-2 rounded-lg bg-[#222634] hover:bg-[#2D3347] border border-[#32384E] text-xs text-[#00E5FF] font-medium flex items-center justify-center gap-1.5">
        <CopyCheck className="w-3.5 h-3.5" /> 同步画中画到全部视频组
      </button>
    </div>}
  </div>;
};
