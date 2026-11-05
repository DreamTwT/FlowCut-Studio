import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { createServer } from 'node:net';
import { once } from 'node:events';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { createDefaultPictureInPicture, type ProjectData, type RenderBatchJob } from '../shared/schema';
import { resolveMediaBinary } from '../server/paths';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
async function freePort() {
  const server = createServer().listen(0, '127.0.0.1');
  await once(server, 'listening');
  const port = (server.address() as { port: number }).port;
  await new Promise<void>((resolve, reject) => server.close(err => err ? reject(err) : resolve()));
  return port;
}

test('picture-in-picture, keying, timing, looping, cover and missing asset', { timeout: 180_000 }, async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'flowcut-pip-test-'));
  const port = await freePort();
  const base = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, ['--import', 'tsx', 'server/index.ts'], {
    cwd: root, env: { ...process.env, PORT: String(port), FLOWCUT_DATA_DIR: dir, NODE_ENV: 'development', AUTO_OPEN_BROWSER: '0' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let logs = '';
  child.stdout.on('data', chunk => { logs += chunk.toString(); });
  child.stderr.on('data', chunk => { logs += chunk.toString(); });
  const api = async (route: string, method = 'GET', body?: unknown): Promise<any> => {
    const res = await fetch(base + route, { method, headers: body ? { 'content-type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined });
    assert.ok(res.ok, `${route}: ${res.status}`);
    return res.json();
  };
  try {
    let ready = false;
    const until = Date.now() + 90_000;
    while (Date.now() < until && !ready) {
      if (child.exitCode !== null) throw new Error(`server exited: ${logs}`);
      try { ready = (await fetch(base + '/api/projects')).ok; } catch { await wait(250); }
    }
    assert.ok(ready, logs);
    const ffmpeg = resolveMediaBinary('FFMPEG_PATH', 'ffmpeg', 'ffmpeg-static').path;
    const blue = await sharp({ create: { width: 128, height: 128, channels: 3, background: '#0000ff' } }).png().toBuffer();
    const redRect = await sharp({ create: { width: 40, height: 40, channels: 3, background: '#ff0000' } }).png().toBuffer();
    const foreground = await sharp({ create: { width: 128, height: 128, channels: 3, background: '#00ff00' } })
      .composite([{ input: redRect, left: 44, top: 44 }]).png().toBuffer();
    const sourceImage = path.join(dir, 'pip-test.png'), sourceVideo = path.join(dir, 'pip-test.mp4');
    await writeFile(sourceImage, foreground);
    execFileSync(ffmpeg, ['-v', 'error', '-y', '-loop', '1', '-framerate', '30', '-i', sourceImage, '-t', '0.6', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', sourceVideo]);
    const project: ProjectData = (await api(`/api/projects/${(await api('/api/projects')).projects[0].id}`)).project;
    const form = new FormData();
    form.append('files', new Blob([new Uint8Array(blue)], { type: 'image/png' }), 'background.png');
    form.append('files', new Blob([new Uint8Array(foreground)], { type: 'image/png' }), 'green-screen.png');
    const { readFile } = await import('node:fs/promises');
    form.append('files', new Blob([new Uint8Array(await readFile(sourceVideo))], { type: 'video/mp4' }), 'green-video.mp4');
    const response = await fetch(`${base}/api/projects/${project.id}/assets/upload`, { method: 'POST', body: form });
    assert.ok(response.ok);
    const upload = await response.json() as { assets: Array<{ id: string }>; project: ProjectData };
    project.assets = upload.project.assets;
    project.aspectRatio = '1:1';
    const group = project.videoGroups[0];
    group.clips = [{ ...group.clips[0], id: 'background', assetId: upload.assets[0].id, trimStart: 0,
      trimEnd: 2, speed: 1, motion: 'none', transition: 'none', fitMode: 'cover', muted: true }];
    group.overlay = { ...group.overlay, topTitle: '', bottomTitle: '' };
    group.subtitles = undefined; group.watermark = undefined; group.dedup = undefined; group.sfx = undefined;
    group.bgmAssetId = null; group.voiceoverAssetId = null;
    group.pip = { ...createDefaultPictureInPicture(), enabled: true, assetId: upload.assets[1].id,
      xPercent: 100, yPercent: 0, widthPercent: 50, opacity: 1, startSec: 0.5, endSec: 1.5 };
    project.videoGroups = [group];
    const render = async (cover = 'none') => {
      let batch: RenderBatchJob = (await api(`/api/projects/${project.id}/render`, 'POST', { project, options: {
        groupIds: [group.id], aspectRatio: '1:1', quality: '720p', fps: 30, videoEncoder: 'libx264', concurrency: 1, exportCoverMode: cover,
      } })).batch;
      const deadline = Date.now() + 90_000;
      while (batch.status === 'running' && Date.now() < deadline) {
        await wait(250); batch = (await api(`/api/renders/${batch.batchId}`)).batch;
      }
      return batch;
    };
    const pixel = (file: string, seconds: number, x: number, y: number) => {
      const data = execFileSync(ffmpeg, ['-v', 'error', '-ss', String(seconds), '-i', file, '-frames:v', '1', '-vf', 'scale=128:128', '-pix_fmt', 'rgb24', '-f', 'rawvideo', 'pipe:1']);
      return [...data.subarray((y * 128 + x) * 3, (y * 128 + x) * 3 + 3)];
    };
    const isBlue = (p: number[]) => p[2] > 180 && p[0] < 60 && p[1] < 70;
    const isGreen = (p: number[]) => p[1] > 180 && p[0] < 70 && p[2] < 70;
    const isRed = (p: number[]) => p[0] > 180 && p[1] < 70 && p[2] < 70;

    let batch = await render();
    assert.equal(batch.status, 'completed', JSON.stringify(batch.items));
    let output = path.join(dir, 'exports', batch.batchId, batch.items[0].outputFilename);
    assert.ok(isBlue(pixel(output, 0.2, 80, 10)), 'angle window must not appear before start');
    assert.ok(isGreen(pixel(output, 0.8, 80, 10)), 'unkeyed green should be visible');
    assert.ok(isRed(pixel(output, 0.8, 96, 32)), 'foreground subject should appear');
    assert.ok(isBlue(pixel(output, 1.7, 80, 10)), 'angle window must disappear at end');

    group.pip!.opacity = 0.5;
    batch = await render();
    assert.equal(batch.status, 'completed', JSON.stringify(batch.items));
    output = path.join(dir, 'exports', batch.batchId, batch.items[0].outputFilename);
    const translucent = pixel(output, 0.8, 80, 10);
    assert.ok(translucent[1] > 90 && translucent[1] < 170 && translucent[2] > 90 && translucent[2] < 170,
      `opacity should blend green over blue: ${translucent}`);
    group.pip!.opacity = 1;

    group.pip!.chromaEnabled = true;
    group.pip!.startSec = 0;
    batch = await render('first_highlight');
    assert.equal(batch.status, 'completed', JSON.stringify(batch.items));
    assert.ok(batch.items[0].coverFilename);
    output = path.join(dir, 'exports', batch.batchId, batch.items[0].outputFilename);
    assert.ok(isBlue(pixel(output, 0.8, 80, 10)), 'green should be keyed to the blue background');
    assert.ok(isRed(pixel(output, 0.8, 96, 32)), 'red subject must survive the key');
    const cover = path.join(dir, 'exports', batch.batchId, batch.items[0].coverFilename!);
    const coverPixels = await sharp(cover).resize(128, 128).removeAlpha().raw().toBuffer();
    assert.ok(isRed([...coverPixels.subarray((32 * 128 + 96) * 3, (32 * 128 + 96) * 3 + 3)]), 'exported cover should contain the keyed subject');

    group.pip!.chromaColor = '#ff0000';
    batch = await render();
    assert.equal(batch.status, 'completed', JSON.stringify(batch.items));
    output = path.join(dir, 'exports', batch.batchId, batch.items[0].outputFilename);
    assert.ok(isGreen(pixel(output, 0.8, 80, 10)), 'a different key color must preserve green');
    assert.ok(isBlue(pixel(output, 0.8, 96, 32)), 'custom red key should reveal the blue background');
    group.pip!.chromaColor = '#00ff00';

    group.pip!.assetId = upload.assets[2].id;
    group.pip!.endSec = 0;
    batch = await render();
    assert.equal(batch.status, 'completed', JSON.stringify(batch.items));
    output = path.join(dir, 'exports', batch.batchId, batch.items[0].outputFilename);
    assert.ok(isBlue(pixel(output, 1.6, 80, 10)), 'video green should be removed after looping');
    assert.ok(isRed(pixel(output, 1.6, 96, 32)), 'short PiP video must loop until the group ends');

    group.pip!.startSec = 1.5;
    group.pip!.endSec = 0.5;
    batch = await render();
    assert.equal(batch.status, 'partial_error');
    assert.match(batch.items[0].error || '', /结束时间/);
    group.pip!.startSec = 0; group.pip!.endSec = 0;

    group.pip!.assetId = 'missing-asset';
    batch = await render();
    assert.equal(batch.status, 'partial_error');
    assert.match(batch.items[0].error || '', /画中画/);

    group.pip!.assetId = upload.assets[1].id;
    project.matrix.slots.forEach((slot, i) => { slot.assetIds = i === 0 ? [upload.assets[0].id] : []; });
    project.matrix.strategy = 'balanced_limit'; project.matrix.targetCount = 2; project.matrix.appendMode = 'append';
    const generated = await api(`/api/projects/${project.id}/matrix/generate`, 'POST', { project, matrix: project.matrix });
    assert.ok(generated.generatedCount >= 1);
    assert.deepEqual(generated.project.videoGroups.at(-1).pip, group.pip, 'matrix groups inherit PiP configuration');
    const removed = await api(`/api/projects/${project.id}/assets/${upload.assets[1].id}`, 'DELETE');
    assert.ok(removed.project.videoGroups.every((g: any) => !g.pip || g.pip.assetId === null), 'deleting a PiP source clears references');
  } finally {
    child.kill('SIGTERM');
    if (child.exitCode === null) await Promise.race([once(child, 'exit'), new Promise(resolve => { const timer = setTimeout(resolve, 5000); timer.unref(); })]);
    if (child.exitCode === null) child.kill('SIGKILL');
    await rm(dir, { recursive: true, force: true });
  }
});
