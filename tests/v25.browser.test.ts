import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { createServer } from 'node:net';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import sharp from 'sharp';
import { resolveMediaBinary } from '../server/paths';
import type { ProjectData, TimelineClip } from '../shared/schema';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
async function freePort() {
  const server = createServer().listen(0, '127.0.0.1');
  await once(server, 'listening');
  const port = (server.address() as { port: number }).port;
  await new Promise<void>((resolve, reject) => server.close(err => err ? reject(err) : resolve()));
  return port;
}

test('browser playback, overlap, audio cues, pause and seek', { timeout: 150_000 }, async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'flowcut-browser-test-'));
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
    const deadline = Date.now() + 90_000;
    let ready = false;
    while (Date.now() < deadline && !ready) {
      if (child.exitCode !== null) throw new Error(`server exited: ${logs}`);
      try { ready = (await fetch(base + '/api/projects')).ok; } catch { await delay(250); }
    }
    assert.ok(ready, `server did not start: ${logs}`);
    const list = await api('/api/projects');
    const project: ProjectData = (await api(`/api/projects/${list.projects[0].id}`)).project;
    const videos = project.assets.filter(a => a.type === 'video');
    const image = project.assets.find(a => a.type === 'image');
    const audio = project.assets.find(a => a.type === 'audio');
    assert.ok(videos.length >= 2 && image && audio);
    const group = project.videoGroups[0];
    const template = group.clips[0];
    const makeClip = (id: string, assetId: string, transition: TimelineClip['transition']): TimelineClip => ({
      ...template, id, assetId, trimStart: 0, trimEnd: 2, speed: 1, volume: 1, muted: false,
      transition, motion: 'none',
    });
    group.clips = [makeClip('preview-one', videos[0].id, 'fade'), makeClip('preview-two', videos[1].id, 'wipeleft'),
      makeClip('preview-three', image.id, 'none')];
    group.bgmAssetId = null;
    group.voiceoverAssetId = audio.id;
    group.voiceoverDelaySec = 0.7;
    group.voiceoverVolume = 0.5;
    group.clipMasterVolume = 1;
    group.dedup = undefined;
    group.sfx = { enabled: true, volume: 0.5, hookSfxId: 'impact_boom', transitionSfxId: 'whoosh_hook', ctaSfxId: 'cash_register' };
    project.videoGroups = [group];
    await api(`/api/projects/${project.id}`, 'PUT', project);
    browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
    const page = await browser.newPage({ viewport: { width: 1500, height: 950 } });
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => {
      const state = window as unknown as { __sounds: Array<{ src: string; time: number }> };
      state.__sounds = [];
      const original = HTMLMediaElement.prototype.play;
      HTMLMediaElement.prototype.play = function () {
        if (this.src?.includes('/storage/sfx/')) state.__sounds.push({ src: this.src, time: performance.now() });
        return original.call(this);
      };
    });
    await page.goto(base, { waitUntil: 'networkidle' });
    await page.waitForSelector('[data-sequence-clip="preview-one"]');
    const slider = page.getByRole('slider', { name: '成片预览进度' });
    assert.equal(Number(await slider.getAttribute('aria-valuemax')), 5.3);
    await page.getByTitle('播放/暂停 (空格键)').click();
    await page.waitForTimeout(250);
    assert.equal(await page.locator('audio').last().evaluate(el => (el as HTMLAudioElement).paused), true, 'voiceover must wait for its delay');
    await page.waitForFunction(() => {
      const el = document.querySelector('[data-sequence-clip="preview-two"]');
      return el && getComputedStyle(el).visibility === 'visible' && Number(getComputedStyle(el).opacity) > 0.2 && Number(getComputedStyle(el).opacity) < 0.8;
    }, undefined, { timeout: 8_000 });
    const states = await page.locator('[data-sequence-clip] video').evaluateAll(elements => elements.map(el => ({
      volume: (el as HTMLVideoElement).volume, paused: (el as HTMLVideoElement).paused,
    })));
    assert.equal(states.length, 2, 'both video clips must coexist during overlap');
    assert.ok(states.every(s => !s.paused), 'both videos should play during overlap');
    assert.ok(states[0].volume > 0 && states[1].volume > 0 && Math.abs(states[0].volume + states[1].volume - 1) < 0.1,
      `clip audio should crossfade: ${JSON.stringify(states)}`);
    assert.equal(await page.locator('audio').last().evaluate(el => (el as HTMLAudioElement).paused), false, 'delayed voiceover should start');
    await page.getByTitle('播放/暂停 (空格键)').click();
    const second = page.locator('[data-sequence-clip="preview-two"]');
    const opacity = await second.evaluate(el => getComputedStyle(el).opacity);
    await page.waitForTimeout(400);
    assert.equal(await second.evaluate(el => getComputedStyle(el).opacity), opacity, 'transition must freeze on pause');
    assert.ok(await page.locator('[data-sequence-clip] video').evaluateAll(els => els.every(e => (e as HTMLVideoElement).paused)));
    // Click into the middle of the wipe while paused; it should immediately show both frames.
    const box = await slider.boundingBox();
    assert.ok(box);
    await page.mouse.click(box.x + box.width * (3.475 / 5.3), box.y + box.height / 2);
    await page.waitForSelector('[data-sequence-clip="preview-three"]');
    const wipe = await page.locator('[data-sequence-clip="preview-three"]').evaluate(el => getComputedStyle(el).clipPath);
    assert.match(wipe, /^inset\(/);
    await page.getByTitle('回到开头').click();
    await page.evaluate(() => { (window as any).__sounds = []; });
    await page.getByTitle('播放/暂停 (空格键)').click();
    await page.waitForFunction(() => (window as any).__sounds.length >= 3, undefined, { timeout: 8_000 });
    const sounds: Array<{ src: string; time: number }> = await page.evaluate(() => (window as any).__sounds);
    assert.deepEqual(sounds.slice(0, 3).map(s => s.src.split('/').pop()), ['impact_boom.wav', 'whoosh_hook.wav', 'cash_register.wav']);
    assert.ok(Math.abs((sounds[1].time - sounds[0].time) / 1000 - 1.58) < 0.3);
    assert.ok(Math.abs((sounds[2].time - sounds[0].time) / 1000 - 3.29) < 0.3);
    assert.deepEqual(errors, []);

    // Compare the actual browser fade against a real FFmpeg export using controlled solid images.
    const form = new FormData();
    for (const [name, color] of [['red', '#ff0000'], ['blue', '#0000ff']] as const) {
      const png = await sharp({ create: { width: 128, height: 128, channels: 3, background: color } }).png().toBuffer();
      form.append('files', new Blob([new Uint8Array(png)], { type: 'image/png' }), `${name}.png`);
    }
    const uploadResponse = await fetch(`${base}/api/projects/${project.id}/assets/upload`, { method: 'POST', body: form });
    assert.ok(uploadResponse.ok);
    const uploaded = await uploadResponse.json() as { assets: Array<{ id: string }>; project: ProjectData };
    project.assets = uploaded.project.assets;
    project.aspectRatio = '1:1';
    group.clips = [makeClip('red-clip', uploaded.assets[0].id, 'fade'), makeClip('blue-clip', uploaded.assets[1].id, 'none')];
    group.bgmAssetId = null;
    group.voiceoverAssetId = null;
    group.sfx = undefined;
    group.subtitles = undefined;
    group.watermark = undefined;
    group.overlay = { ...group.overlay, topTitle: '', bottomTitle: '' };
    const ffmpeg = resolveMediaBinary('FFMPEG_PATH', 'ffmpeg', 'ffmpeg-static').path;
    for (const transition of ['fade', 'wipeleft'] as const) {
      group.clips[0].transition = transition;
      await api(`/api/projects/${project.id}`, 'PUT', project);
      let render = (await api(`/api/projects/${project.id}/render`, 'POST', { project, options: {
        groupIds: [group.id], aspectRatio: '1:1', quality: '720p', fps: 30, videoEncoder: 'libx264', concurrency: 1,
      } })).batch;
      while (render.status === 'running') {
        await delay(250);
        render = (await api(`/api/renders/${render.batchId}`)).batch;
      }
      assert.equal(render.status, 'completed', JSON.stringify(render));
      await page.reload({ waitUntil: 'networkidle' });
      await page.waitForSelector('[data-sequence-clip="red-clip"] img');
      const progress = page.getByRole('slider', { name: '成片预览进度' });
      const bounds = await progress.boundingBox();
      assert.ok(bounds);
      await page.mouse.click(bounds.x + bounds.width * 0.5, bounds.y + bounds.height / 2);
      await page.waitForFunction(() => {
        const el = document.querySelector('[data-sequence-clip="blue-clip"] img') as HTMLImageElement | null;
        return el?.complete && el.naturalWidth > 0;
      });
      const imageBytes = await page.locator('[data-sequence-clip="red-clip"]').locator('..').screenshot();
      const previewPixels = await sharp(imageBytes).resize(32, 32).removeAlpha().raw().toBuffer();
      const output = path.join(dir, 'exports', render.batchId, render.items[0].outputFilename);
      const exportPixels = execFileSync(ffmpeg, ['-v', 'error', '-ss', '1.825', '-i', output, '-frames:v', '1',
        '-vf', 'scale=32:32', '-pix_fmt', 'rgb24', '-f', 'rawvideo', 'pipe:1']);
      const pixel = (buf: Buffer, x: number) => Array.from(buf.subarray((16 * 32 + x) * 3, (16 * 32 + x) * 3 + 3));
      for (const x of transition === 'fade' ? [16] : [8, 24]) {
        const previewPixel = pixel(previewPixels, x), exportPixel = pixel(exportPixels, x);
        assert.ok(previewPixel.every((c, i) => Math.abs(c - exportPixel[i]) < 24),
          `${transition} browser/export mismatch at ${x}: preview=${previewPixel}, export=${exportPixel}`);
      }
    }
  } finally {
    await browser?.close();
    child.kill('SIGTERM');
    if (child.exitCode === null) await Promise.race([once(child, 'exit'), new Promise(resolve => { const timer = setTimeout(resolve, 5000); timer.unref(); })]);
    if (child.exitCode === null) child.kill('SIGKILL');
    await rm(dir, { recursive: true, force: true });
  }
});
