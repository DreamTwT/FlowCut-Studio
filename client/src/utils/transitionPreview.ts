import type { CSSProperties } from 'react';
import { TimelineSegment, transitionProgress } from '@shared/previewTimeline';

export interface PreviewLayer {
  index: number;
  elapsed: number;
  audioGain: number;
  style: CSSProperties;
}

/** Layered browser approximation of FFmpeg's transitions. Times and audio envelopes use the same timeline. */
export function getPreviewLayers(segments: TimelineSegment[], time: number): PreviewLayer[] {
  const layers: PreviewLayer[] = [];
  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i];
    const elapsed = time - segment.start;
    if (elapsed < 0) {
      // Preload the incoming media before overlap without showing or playing it.
      if (elapsed >= -1 && i > 0) layers.push({ index: i, elapsed: 0, audioGain: 0, style: { visibility: 'hidden' } });
      continue;
    }
    if (elapsed >= segment.duration && i < segments.length - 1) continue;
    if (elapsed > segment.duration) continue;
    const progress = transitionProgress(segment, time);
    const next = segments[i + 1];
    const nextProgress = next?.overlapIn && time >= next.start && time < next.start + next.overlapIn
      ? transitionProgress(next, time) : null;
    const style: CSSProperties = {};
    if (segment.overlapIn && progress < 1) {
      switch (segment.transitionIn) {
        case 'fade': style.opacity = progress; break;
        case 'wipeleft': style.clipPath = `inset(0 0 0 ${(100 * (1 - progress)).toFixed(3)}%)`; break;
        case 'smoothup': {
          const start = 100 - 200 * progress;
          style.maskImage = `linear-gradient(to bottom, transparent ${start.toFixed(3)}%, black ${(start + 100).toFixed(3)}%)`;
          break;
        }
        case 'circleopen': {
          const center = Math.min(1, progress * 2);
          const edge = Math.max(0, progress * 2 - 1);
          style.maskImage = `radial-gradient(ellipse 100% 100% at center, rgba(0,0,0,${center.toFixed(4)}) 0%, rgba(0,0,0,${edge.toFixed(4)}) 100%)`;
          break;
        }
      }
    }
    if (style.maskImage) style.WebkitMaskImage = style.maskImage;
    const audioGain = progress * (nextProgress === null ? 1 : 1 - nextProgress);
    layers.push({ index: i, elapsed: Math.max(0, elapsed), audioGain, style });
  }
  return layers;
}
