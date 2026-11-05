import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { PlayerMonitor } from '../client/src/components/PlayerMonitor';
import { FULL_CROP, MediaAsset, TimelineClip, VideoGroup } from '../shared/schema';

const asset = { id: 'image', type: 'image', name: '测试图', url: '/image.jpg',
  width: 1080, height: 1920, duration: 2 } as MediaAsset;
const clip: TimelineClip = { id: 'a', assetId: asset.id, trimStart: 0, trimEnd: 2,
  speed: 1, volume: 1, muted: false, crop: { ...FULL_CROP }, fitMode: 'cover',
  motion: 'hook_punch', transition: 'fade' };
const group = { id: 'group', name: '测试组', clips: [clip, { ...clip, id: 'b', transition: 'none' }],
  overlay: { topTitle: '', bottomTitle: '', styleId: 'douyin_yellow', topY: 13, bottomY: 83, fontScale: 1 },
  clipMasterVolume: 1, bgmAssetId: null, bgmVolume: 0.35 } as VideoGroup;
function markup(g: VideoGroup) {
  return renderToStaticMarkup(<PlayerMonitor mode="program" onChangeMode={() => {}} aspectRatio="9:16"
    sourceAsset={null} activeGroup={g} selectedClipId={null} assetMap={new Map([[asset.id, asset]])}
    showSafeZone={false} onToggleSafeZone={() => {}} onOpenTrimAsset={() => {}}
    onOpenTrimClip={() => {}} onSelectClip={() => {}} />);
}
test('program preview exposes initial motion and warns when transitions are approximated', () => {
  const html = markup(group);
  assert.match(html, /scale\(1\.2400\)/);
  assert.match(html, /预览硬切 · 转场以导出为准/);
});
test('hard-cut sequences do not show the transition warning', () => {
  const hardCut = { ...group, clips: group.clips.map(c => ({ ...c, transition: 'none' as const })) };
  assert.doesNotMatch(markup(hardCut), /预览硬切 · 转场以导出为准/);
});
