import React, { useEffect, useRef, useState } from 'react';
import { MediaAsset, normalizePictureInPicture, PictureInPictureConfig } from '@shared/schema';
import { applyPictureInPictureColorKey, getPictureInPictureRect } from '@shared/pictureInPicture';

interface Props {
  asset: MediaAsset;
  config: PictureInPictureConfig;
  frameWidth: number;
  frameHeight: number;
  time: number;
  playing: boolean;
  masterSpeedFactor: number;
}

export const PictureInPicturePreview: React.FC<Props> = ({ asset, config, frameWidth, frameHeight, time, playing, masterSpeedFactor }) => {
  const cfg = normalizePictureInPicture(config);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const pending = useRef(false);
  const wantsPlayback = useRef(false);
  const [revision, setRevision] = useState(0);
  const [keyError, setKeyError] = useState(false);
  const active = cfg.enabled && time >= cfg.startSec && (!cfg.endSec || time < cfg.endSec);
  const rect = getPictureInPictureRect(cfg, frameWidth, frameHeight, asset.width, asset.height);
  const mediaTime = Math.max(0, time - cfg.startSec);
  wantsPlayback.current = active && playing;

  useEffect(() => () => { wantsPlayback.current = false; videoRef.current?.pause(); }, []);
  useEffect(() => {
    const video = videoRef.current;
    if (!video || asset.type !== 'video') return;
    video.playbackRate = masterSpeedFactor;
    const duration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : asset.duration;
    const target = duration > 0 ? mediaTime % duration : 0;
    if (video.readyState >= 1 && Math.abs(video.currentTime - target) > 0.15) {
      try { video.currentTime = target; } catch { /* wait for metadata */ }
    }
    if (wantsPlayback.current && video.paused && !pending.current) {
      pending.current = true;
      void video.play().then(() => { if (!wantsPlayback.current) video.pause(); }).catch(() => {}).finally(() => { pending.current = false; });
    } else if (!wantsPlayback.current && !video.paused) video.pause();
  }, [asset, active, playing, mediaTime, masterSpeedFactor]);

  useEffect(() => {
    if (!cfg.chromaEnabled || !active) return;
    const canvas = canvasRef.current;
    const media = asset.type === 'video' ? videoRef.current : imageRef.current;
    if (!canvas || !media || (asset.type === 'video' && (media as HTMLVideoElement).readyState < 2) ||
        (asset.type === 'image' && !(media as HTMLImageElement).complete)) return;
    const sourceW = asset.width || 320, sourceH = asset.height || 320;
    const scale = Math.min(1, 512 / Math.max(sourceW, sourceH));
    const width = Math.max(1, Math.round(sourceW * scale));
    const height = Math.max(1, Math.round(sourceH * scale));
    if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;
    try {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(media, 0, 0, canvas.width, canvas.height);
      const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
      applyPictureInPictureColorKey(pixels.data, cfg.chromaColor, cfg.similarity, cfg.blend);
      ctx.putImageData(pixels, 0, 0);
      if (keyError) setKeyError(false);
    } catch {
      if (!keyError) setKeyError(true);
    }
  }, [asset, active, cfg.chromaEnabled, cfg.chromaColor, cfg.similarity, cfg.blend, time, revision, keyError]);

  const update = () => setRevision(v => v + 1);
  return <div data-pip-preview className="absolute overflow-hidden pointer-events-none" style={{
    left: rect.x, top: rect.y, width: rect.width, height: rect.height,
    opacity: cfg.opacity, visibility: active ? 'visible' : 'hidden',
  }}>
    {asset.type === 'video' ? <video ref={videoRef} src={asset.url} muted loop playsInline preload="auto"
      onLoadedData={update} onSeeked={update}
      className="w-full h-full object-fill" style={{ display: cfg.chromaEnabled ? 'none' : 'block' }} /> :
      <img ref={imageRef} src={asset.url} alt="画中画" onLoad={update} className="w-full h-full object-fill"
        style={{ display: cfg.chromaEnabled ? 'none' : 'block' }} />}
    {cfg.chromaEnabled && <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />}
    {keyError && <span className="absolute inset-0 text-xs text-white bg-black/70">素材无法在浏览器抠像，导出以服务端结果为准</span>}
  </div>;
};
