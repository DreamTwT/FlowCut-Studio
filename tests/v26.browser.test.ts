import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { createServer } from 'node:net';
import { once } from 'node:events';
import { mkdtemp, rm, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { chromium } from 'playwright';
import { createDefaultPictureInPicture, type ProjectData } from '../shared/schema';
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

test('inspector controls, live green screen preview, sync and looping video', { timeout: 150_000 }, async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'flowcut-pip-browser-'));
  const port = await freePort();
  const base = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, ['--import', 'tsx', 'server/index.ts'], {
    cwd: root, env: { ...process.env, PORT: String(port), FLOWCUT_DATA_DIR: dir, NODE_ENV: 'development', AUTO_OPEN_BROWSER: '0' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let logs = '';
  child.stdout.on('data', chunk => { logs += chunk.toString(); });
  child.stderr.on('data', chunk => { logs += chunk.toString(); });
  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
  const api = async (route: string, method = 'GET', body?: unknown): Promise<any> => {
    const res = await fetch(base + route, { method, headers: body ? { 'content-type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined });
    assert.ok(res.ok, `${route}: ${res.status}`);
    return res.json();
  };
  try {
    let ready = false;
    const deadline = Date.now() + 90_000;
    while (!ready && Date.now() < deadline) {
      if (child.exitCode !== null) throw new Error(`server exited: ${logs}`);
      try { ready = (await fetch(base + '/api/projects')).ok; } catch { await wait(250); }
    }
    assert.ok(ready, logs);
    const blue = await sharp({ create: { width: 128, height: 128, channels: 3, background: '#0000ff' } }).png().toBuffer();
    const red = await sharp({ create: { width: 40, height: 40, channels: 3, background: '#ff0000' } }).png().toBuffer();
    const green = await sharp({ create: { width: 128, height: 128, channels: 3, background: '#00ff00' } })
      .composite([{ input: red, left: 44, top: 44 }]).png().toBuffer();
    const pngPath = path.join(dir, 'pip.png'), videoPath = path.join(dir, 'pip.mp4');
    await writeFile(pngPath, green);
    const ffmpeg = resolveMediaBinary('FFMPEG_PATH', 'ffmpeg', 'ffmpeg-static').path;
    execFileSync(ffmpeg, ['-v', 'error', '-y', '-loop', '1', '-framerate', '30', '-i', pngPath, '-t', '0.6', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', videoPath]);
    const project: ProjectData = (await api(`/api/projects/${(await api('/api/projects')).projects[0].id}`)).project;
    const form = new FormData();
    form.append('files', new Blob([new Uint8Array(blue)], { type: 'image/png' }), 'background.png');
    form.append('files', new Blob([new Uint8Array(green)], { type: 'image/png' }), 'green-screen.png');
    form.append('files', new Blob([new Uint8Array(await readFile(videoPath))], { type: 'video/mp4' }), 'pip-video.mp4');
    const uploadedResponse = await fetch(`${base}/api/projects/${project.id}/assets/upload`, { method: 'POST', body: form });
    assert.ok(uploadedResponse.ok);
    const upload = await uploadedResponse.json() as { assets: Array<{ id: string }>; project: ProjectData };
    project.assets = upload.project.assets; project.aspectRatio = '1:1';
    const group = project.videoGroups[0];
    group.clips = [{ ...group.clips[0], id: 'base-clip', assetId: upload.assets[0].id, trimStart: 0,
      trimEnd: 2, speed: 1, motion: 'none', transition: 'none', fitMode: 'cover', muted: true }];
    group.overlay = { ...group.overlay, topTitle: '', bottomTitle: '' };
    group.subtitles = undefined; group.watermark = undefined; group.dedup = undefined; group.sfx = undefined;
    group.bgmAssetId = null; group.voiceoverAssetId = null;
    group.pip = { ...createDefaultPictureInPicture(), enabled: false, assetId: upload.assets[1].id,
      xPercent: 100, yPercent: 0, widthPercent: 50, startSec: 0.5, endSec: 1.5 };
    const other = structuredClone(group); other.id = 'other-group'; other.name = '同步目标组';
    project.videoGroups = [group, other];
    await api(`/api/projects/${project.id}`, 'PUT', project);
    browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
    const page = await browser.newPage({ viewport: { width: 1500, height: 950 } });
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(base, { waitUntil: 'networkidle' });
    await page.waitForSelector('[data-sequence-clip="base-clip"]');
    await page.getByRole('button', { name: '水印防重' }).click();
    const panel = page.locator('[data-pip-panel]');
    await panel.getByLabel('启用画中画').check();
    const pip = page.locator('[data-pip-preview]');
    assert.equal(await pip.evaluate(el => getComputedStyle(el).visibility), 'hidden', 'PiP must be hidden before start');
    const slider = page.getByRole('slider', { name: '成片预览进度' });
    const bounds = await slider.boundingBox(); assert.ok(bounds);
    await page.mouse.click(bounds.x + bounds.width * 0.4, bounds.y + bounds.height / 2);
    await pip.waitFor({ state: 'visible' });
    await page.waitForFunction(() => {
      const el = document.querySelector('[data-pip-preview] img') as HTMLImageElement | null;
      return el?.complete && el.naturalWidth > 0;
    });
    const sample = async (x: number, y: number) => {
      const pixels = await sharp(await pip.screenshot()).resize(128, 128).removeAlpha().raw().toBuffer();
      return [...pixels.subarray((y * 128 + x) * 3, (y * 128 + x) * 3 + 3)];
    };
    const unkeyed = await sample(20, 20);
    assert.ok(unkeyed[1] > 180 && unkeyed[2] < 70, `unkeyed corner: ${unkeyed}`);
    await panel.getByLabel('启用绿幕抠像').check();
    await page.waitForFunction(() => {
      const canvas = document.querySelector('[data-pip-preview] canvas') as HTMLCanvasElement | null;
      return canvas && canvas.width > 0 && canvas.getContext('2d')?.getImageData(5, 5, 1, 1).data[3] === 0;
    });
    const transparent = await sample(20, 20), subject = await sample(64, 64);
    assert.ok(transparent[2] > 180 && transparent[1] < 70, `keyed corner: ${transparent}`);
    assert.ok(subject[0] > 180 && subject[1] < 70, `keyed subject: ${subject}`);
    await panel.getByRole('button', { name: '同步画中画到全部视频组' }).click();
    let saved: ProjectData | undefined;
    for (let i = 0; i < 20; i++) {
      await wait(150); saved = (await api(`/api/projects/${project.id}`)).project;
      if (saved?.videoGroups[1].pip?.chromaEnabled) break;
    }
    assert.ok(saved?.videoGroups[1].pip?.enabled && saved.videoGroups[1].pip?.chromaEnabled);
    assert.equal(saved.videoGroups[1].pip?.assetId, upload.assets[1].id);
    await panel.getByTitle('图片 · green-screen').click();
    await page.getByRole('button', { name: '视频 · pip-video' }).click();
    const video = pip.locator('video');
    await video.waitFor({ state: 'attached' });
    assert.equal(await video.evaluate(el => (el as HTMLVideoElement).muted), true, 'PiP original audio must not play');
    await page.getByTitle('播放/暂停 (空格键)').click();
    await page.waitForTimeout(400);
    assert.equal(await video.evaluate(el => (el as HTMLVideoElement).paused), false);
    assert.equal(await video.evaluate(el => (el as HTMLVideoElement).loop), true);
    const firstTime = await video.evaluate(el => (el as HTMLVideoElement).currentTime);
    await page.waitForTimeout(120);
    const nextTime = await video.evaluate(el => (el as HTMLVideoElement).currentTime);
    assert.ok(Math.abs(nextTime - firstTime) > 0.03, `PiP video should advance: ${firstTime} -> ${nextTime}`);
    await page.getByTitle('播放/暂停 (空格键)').click();
    await page.waitForTimeout(150);
    assert.equal(await video.evaluate(el => (el as HTMLVideoElement).paused), true);
    assert.deepEqual(errors, []);
  } finally {
    await browser?.close();
    child.kill('SIGTERM');
    if (child.exitCode === null) await Promise.race([once(child, 'exit'), new Promise(resolve => { const timer = setTimeout(resolve, 5000); timer.unref(); })]);
    if (child.exitCode === null) child.kill('SIGKILL');
    await rm(dir, { recursive: true, force: true });
  }
});
