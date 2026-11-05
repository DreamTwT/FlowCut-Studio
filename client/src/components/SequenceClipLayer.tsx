import React, { useEffect, useRef } from 'react';
import { AspectRatio, MediaAsset, TimelineClip } from '@shared/schema';
import { CroppedMediaFrame } from './CroppedMediaFrame';

interface Props {
  clip: TimelineClip;
  asset: MediaAsset;
  duration: number;
  elapsed: number;
  playing: boolean;
  muted: boolean;
  gain: number;
  aspectRatio: AspectRatio;
  masterSpeedFactor: number;
  style: React.CSSProperties;
}

/** A persistent keyed layer. The timeline is the clock; videos drift-correct against it. */
export const SequenceClipLayer: React.FC<Props> = ({ clip, asset, duration, elapsed, playing, muted, gain, aspectRatio, masterSpeedFactor, style }) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const pendingPlay = useRef(false);
  const wantsPlayback = useRef(playing);
  wantsPlayback.current = playing;
  useEffect(() => () => { wantsPlayback.current = false; videoRef.current?.pause(); }, []);
  useEffect(() => {
    const video = videoRef.current;
    if (!video || asset.type !== 'video') return;
    const speed = Math.max(0.5, Math.min(2, clip.speed || 1));
    const target = (clip.trimStart || 0) + Math.max(0, Math.min(duration, elapsed)) * speed;
    video.playbackRate = speed * masterSpeedFactor;
    video.volume = muted || clip.muted ? 0 : Math.max(0, Math.min(1, gain * (clip.volume ?? 1)));
    if (video.readyState >= 1 && Math.abs(video.currentTime - target) > 0.12) {
      try { video.currentTime = target; } catch { /* metadata is not ready */ }
    }
    if (playing && video.paused && !pendingPlay.current) {
      pendingPlay.current = true;
      void video.play().then(() => { if (!wantsPlayback.current) video.pause(); }).catch(() => {}).finally(() => { pendingPlay.current = false; });
    } else if (!playing && !video.paused) video.pause();
  }, [asset.type, clip, duration, elapsed, playing, muted, gain, masterSpeedFactor]);

  return (
    <div className="absolute inset-0 overflow-hidden" style={style} data-sequence-clip={clip.id}>
      <CroppedMediaFrame asset={asset} crop={clip.crop} fitMode={clip.fitMode} aspectRatio={aspectRatio}
        motion={clip.motion} clipElapsedSec={elapsed} clipDurationSec={duration} videoRef={videoRef}
        muted={muted || clip.muted} onLoadedMetadata={() => {
          const video = videoRef.current;
          if (!video) return;
          const speed = Math.max(0.5, Math.min(2, clip.speed || 1));
          video.currentTime = (clip.trimStart || 0) + Math.max(0, Math.min(duration, elapsed)) * speed;
        }} />
    </div>
  );
};
