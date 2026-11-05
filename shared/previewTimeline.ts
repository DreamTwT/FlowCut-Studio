import { GroupSfxConfig, SFX_PRESETS, SfxPresetId } from './schema.js';
import type { TimelineSegment } from './timeline.js';
export { buildTransitionTimeline, activeTimelineIndex, transitionProgress, getMasterSpeedFactor } from './timeline.js';
export type { TimelineSegment } from './timeline.js';

export interface TimelineSfxEvent {
  sfxId: Exclude<SfxPresetId, 'none'>;
  timeSec: number;
  gainMul: number;
}

/** Same cue positions, priority and cap as the server mixer. */
export function buildTimelineSfxEvents(
  config: GroupSfxConfig | undefined,
  timeline: { segments: TimelineSegment[]; totalDuration: number }
): TimelineSfxEvent[] {
  if (!config?.enabled || !timeline.segments.length) return [];
  const events: TimelineSfxEvent[] = [];
  const { segments, totalDuration } = timeline;
  if (config.hookSfxId && config.hookSfxId !== 'none') {
    events.push({ sfxId: config.hookSfxId, timeSec: 0.03, gainMul: 1 });
  }
  const hasCta = Boolean(config.ctaSfxId && config.ctaSfxId !== 'none');
  if (config.transitionSfxId && config.transitionSfxId !== 'none') {
    for (let i = 1; i < segments.length; i++) {
      if (i === segments.length - 1 && hasCta) continue;
      if (events.length >= 15) break;
      const cut = segments[i].start;
      if (cut > 0.12 && cut < totalDuration - 0.12) {
        events.push({ sfxId: config.transitionSfxId, timeSec: Math.max(0.02, cut - 0.04), gainMul: 0.88 });
      }
    }
  }
  if (hasCta && config.ctaSfxId && config.ctaSfxId !== 'none') {
    if (segments.length >= 2) {
      const last = segments[segments.length - 1].start;
      if (last < totalDuration - 0.12) {
        events.push({ sfxId: config.ctaSfxId, timeSec: Math.max(0.12, last + 0.02), gainMul: 1 });
      }
    } else if (totalDuration >= 2) {
      events.push({ sfxId: config.ctaSfxId, timeSec: Math.max(0.5, totalDuration - 1.4), gainMul: 1 });
    }
  }
  return events.filter(event => Object.prototype.hasOwnProperty.call(SFX_PRESETS, event.sfxId)).slice(0, 16);
}

