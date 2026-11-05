import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTransitionTimeline, buildTimelineSfxEvents, getMasterSpeedFactor, activeTimelineIndex } from '../shared/previewTimeline';
import { getPreviewLayers } from '../client/src/utils/transitionPreview';
import { getGroupTotalDuration, TimelineClip, VideoGroup } from '../shared/schema';

const near = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-8, `${a} != ${b}`);
test('transition timeline matches FFmpeg chaining, including short-clip hard cuts', () => {
  const timeline = buildTransitionTimeline([
    { duration: 2, transition: 'fade' }, { duration: 2, transition: 'wipeleft' },
    { duration: 0.3, transition: 'fade' }, { duration: 1, transition: 'none' },
  ]);
  assert.deepEqual(timeline.segments.map(s => s.transitionIn), ['none', 'fade', 'none', 'fade']);
  near(timeline.segments[1].start, 1.65);
  near(timeline.segments[2].start, 3.65);
  near(timeline.segments[3].start, 3.65 + 0.3 - 0.3);
  near(timeline.totalDuration, 4.65);
  const clips = [{ trimStart: 0, trimEnd: 2, speed: 1, transition: 'fade' },
    { trimStart: 0, trimEnd: 2, speed: 1, transition: 'wipeleft' },
    { trimStart: 0, trimEnd: 0.3, speed: 1, transition: 'fade' },
    { trimStart: 0, trimEnd: 1, speed: 1, transition: 'none' }] as TimelineClip[];
  near(getGroupTotalDuration({ clips } as VideoGroup), timeline.totalDuration);
  const nonMonotonic = buildTransitionTimeline([{ duration: 2, transition: 'none' },
    { duration: 0.1, transition: 'fade' }, { duration: 2, transition: 'none' }]);
  assert.ok(nonMonotonic.segments[2].start < nonMonotonic.segments[1].start);
  assert.equal(activeTimelineIndex(nonMonotonic.segments, 1.9), 2);

});

test('visual layers and audio crossfade follow overlap progress', () => {
  const timeline = buildTransitionTimeline([{ duration: 2, transition: 'fade' }, { duration: 2, transition: 'none' }]);
  const before = getPreviewLayers(timeline.segments, 1.3);
  assert.equal(before[1].style.visibility, 'hidden'); // incoming media preloads
  const layers = getPreviewLayers(timeline.segments, 1.825);
  assert.equal(layers.length, 2);
  near(layers[0].audioGain, 0.5);
  near(layers[1].audioGain, 0.5);
  near(Number(layers[1].style.opacity), 0.5);
  const wiped = buildTransitionTimeline([{ duration: 2, transition: 'wipeleft' }, { duration: 2, transition: 'none' }]);
  assert.equal(getPreviewLayers(wiped.segments, 1.825)[1].style.clipPath, 'inset(0 0 0 50.000%)');
  for (const transition of ['smoothup', 'circleopen'] as const) {
    const t = buildTransitionTimeline([{ duration: 2, transition }, { duration: 2, transition: 'none' }]);
    assert.match(String(getPreviewLayers(t.segments, 1.825)[1].style.maskImage), /gradient/);
  }
});

test('SFX cues and master speed are shared with the render pipeline', () => {
  const timeline = buildTransitionTimeline([{ duration: 2, transition: 'fade' }, { duration: 2, transition: 'fade' }, { duration: 2, transition: 'none' }]);
  const events = buildTimelineSfxEvents({ enabled: true, volume: 0.65, hookSfxId: 'impact_boom', transitionSfxId: 'whoosh_hook', ctaSfxId: 'cash_register' }, timeline);
  assert.deepEqual(events.map(e => e.sfxId), ['impact_boom', 'whoosh_hook', 'cash_register']);
  near(events[0].timeSec, 0.03);
  near(events[1].timeSec, 1.61);
  near(events[2].timeSec, 3.32);
  near(getMasterSpeedFactor({ enabled: true, speedJitterPct: 4 } as any), 1.04);
  near(getMasterSpeedFactor({ enabled: true, speedJitterPct: -100 } as any), 0.955);
});
