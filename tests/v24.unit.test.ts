import test from 'node:test';
import assert from 'node:assert/strict';
import { assignSmartMotionToClips, FULL_CROP, TimelineClip, MediaAsset } from '../shared/schema';
import { computeClipMotionCssTransform, playBuiltinSfxPreview } from '../client/src/utils/motionAndSfx';
import { isBuiltinSfxId } from '../server/sfxGenerator';

function clip(assetId: string): TimelineClip {
  return { id: assetId, assetId, trimStart: 0, trimEnd: 1, speed: 1, volume: 1,
    muted: false, crop: { ...FULL_CROP }, fitMode: 'cover', transition: 'none' };
}

test('smart motion respects image-only, variants and clearing', () => {
  const assets = new Map<string, MediaAsset>([
    ['video', { id: 'video', type: 'video' } as MediaAsset],
    ['image', { id: 'image', type: 'image' } as MediaAsset],
  ]);
  const clips = [clip('video'), clip('image'), clip('image')];
  assignSmartMotionToClips(clips, assets, 'images_only', 0);
  assert.equal(clips[0].motion, 'none');
  assert.notEqual(clips[1].motion, 'none');
  assignSmartMotionToClips(clips, assets, 'smart_alternating', 1);
  assert.deepEqual(clips.map(c => c.motion), ['hook_punch', 'pan_right', 'zoom_out']);
  assignSmartMotionToClips(clips, assets, 'none');
  assert.ok(clips.every(c => c.motion === 'none'));
});

test('motion preview respects endpoints and short hook timing', () => {
  assert.equal(computeClipMotionCssTransform('zoom_in', 0, 0), 'scale(1.0000)');
  assert.equal(computeClipMotionCssTransform('zoom_in', 1, 1), 'scale(1.1600)');
  assert.equal(computeClipMotionCssTransform('zoom_out', 1, 1), 'scale(1.0000)');
  assert.equal(computeClipMotionCssTransform('hook_punch', 0, 0), 'scale(1.2400)');
  assert.equal(computeClipMotionCssTransform('hook_punch', 1, 1), 'scale(1.1000)');
  assert.equal(computeClipMotionCssTransform('hook_punch', 0.5, 0.1), 'scale(1.1829)');
  assert.equal(computeClipMotionCssTransform('none', 0, 0), 'none');
});

test('zero-volume SFX preview is silent and unknown IDs are rejected', () => {
  let constructed = 0;
  const original = globalThis.Audio;
  globalThis.Audio = class { constructor() { constructed++; } } as unknown as typeof Audio;
  try {
    playBuiltinSfxPreview('impact_boom', 0);
    playBuiltinSfxPreview('impact_boom', -1);
    playBuiltinSfxPreview('impact_boom', NaN);
    assert.equal(constructed, 0);
  } finally { globalThis.Audio = original; }
  assert.equal(isBuiltinSfxId('whoosh_hook'), true);
  assert.equal(isBuiltinSfxId('../../outside'), false);
  assert.equal(isBuiltinSfxId('toString'), false);
});
