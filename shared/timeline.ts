import type { DedupConfig, TransitionType } from './schema.js';

export function getMasterSpeedFactor(dedup?: DedupConfig): number {
  const pct = dedup?.enabled ? Math.max(-4.5, Math.min(4.5, Number(dedup.speedJitterPct || 0))) : 0;
  return Math.abs(pct) >= 0.15 ? 1 + pct / 100 : 1;
}

export interface TimelineSegment {
  start: number;
  duration: number;
  overlapIn: number;
  transitionIn: TransitionType;
}

/** Matches renderEngine's chained xfade/concat timing, including short-clip fallback. */
export function buildTransitionTimeline(
  clips: ReadonlyArray<{ duration: number; transition: TransitionType }>
): { segments: TimelineSegment[]; totalDuration: number } {
  if (!clips.length) return { segments: [], totalDuration: 0 };
  const segments: TimelineSegment[] = [{ start: 0, duration: clips[0].duration, overlapIn: 0, transitionIn: 'none' }];
  let total = clips[0].duration;
  for (let i = 1; i < clips.length; i++) {
    const tr = clips[i - 1].transition;
    const duration = clips[i].duration;
    const overlap = tr && tr !== 'none' && total >= 0.45 && duration >= 0.45
      ? Math.min(0.35, total * 0.3, duration * 0.3) : 0;
    const start = overlap ? Math.max(0.05, total - overlap) : total;
    segments.push({ start, duration, overlapIn: overlap, transitionIn: overlap ? tr : 'none' });
    total = total + duration - overlap;
  }
  return { segments, totalDuration: total };
}

export function activeTimelineIndex(segments: TimelineSegment[], time: number): number {
  let index = 0;
  for (let i = 1; i < segments.length; i++) {
    // Chained FFmpeg transitions can start before a preceding very short clip.
    if (time >= segments[i].start) index = i;
  }
  return index;
}

export function transitionProgress(segment: TimelineSegment, time: number): number {
  return segment.overlapIn > 0 ? Math.min(1, Math.max(0, (time - segment.start) / segment.overlapIn)) : 1;
}
