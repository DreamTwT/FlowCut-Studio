import test from 'node:test';
import assert from 'node:assert/strict';
import { createDefaultPictureInPicture, normalizePictureInPicture } from '../shared/schema';
import { applyPictureInPictureColorKey, getPictureInPictureRect } from '../shared/pictureInPicture';

test('picture-in-picture settings reject malformed imported values', () => {
  const cfg = normalizePictureInPicture({ enabled: true, chromaColor: '#00ff00:enable=1',
    opacity: Number.NaN, widthPercent: 1000, xPercent: -5, similarity: -3, blend: 12 });
  assert.equal(cfg.chromaColor, '#00ff00');
  assert.equal(cfg.opacity, 1);
  assert.equal(cfg.widthPercent, 100);
  assert.equal(cfg.xPercent, 0);
  assert.equal(cfg.similarity, 0.01);
  assert.equal(cfg.blend, 1);
  assert.equal(normalizePictureInPicture().enabled, false);
});

test('picture-in-picture rectangle preserves aspect and stays inside the output', () => {
  const cfg = { ...createDefaultPictureInPicture(), widthPercent: 50, xPercent: 100, yPercent: 0 };
  assert.deepEqual(getPictureInPictureRect(cfg, 720, 720, 128, 128), { x: 360, y: 0, width: 360, height: 360 });
  const tall = getPictureInPictureRect({ ...cfg, widthPercent: 100, yPercent: 100 }, 1920, 1080, 200, 1200);
  assert.ok(tall.height <= 1080 && tall.width <= 1920 && tall.x >= 0 && tall.y >= 0);
  assert.equal(tall.height, 1080);
});

test('preview color key removes green without erasing the foreground or existing alpha', () => {
  const data = new Uint8ClampedArray([0, 255, 0, 255, 255, 0, 0, 120, 0, 250, 0, 255]);
  applyPictureInPictureColorKey(data, '#00ff00', 0.15, 0.08);
  assert.deepEqual([...data], [0, 255, 0, 0, 255, 0, 0, 120, 0, 250, 0, 0]);
});
