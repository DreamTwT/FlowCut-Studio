import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { once } from 'node:events';
import type { ProjectData, RenderBatchJob, VideoGroup } from '../shared/schema';
import { resolveMediaBinary } from '../server/paths';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
async function freePort(): Promise<number> {
  const server = createServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const port = (server.address() as { port: number }).port;
  await new Promise<void>((resolve, reject) => server.close(err => err ? reject(err) : resolve()));
  return port;
}
async function waitFor(condition: () => Promise<boolean>, timeoutMs: number) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await condition()) return;
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  throw new Error('Timed out waiting for server or render');
}
function zipNames(data: Buffer): string[] {
  // Read the central directory; names use ZIP's UTF-8 flag for non-ASCII filenames.
  const names: string[] = [];
  for (let i = 0; i + 46 <= data.length;) {
    if (data.readUInt32LE(i) !== 0x02014b50) { i++; continue; }
    const nameLen = data.readUInt16LE(i + 28);
    const extraLen = data.readUInt16LE(i + 30);
    const commentLen = data.readUInt16LE(i + 32);
    const end = i + 46 + nameLen + extraLen + commentLen;
    if (end > data.length) break;
    names.push(data.subarray(i + 46, i + 46 + nameLen).toString('utf8'));
    i = end;
  }
  return names;
}

test('isolated API: duplicate names, motion, sound, covers and ZIP', { timeout: 180_000 }, async () => {
  const dataDir = await mkdtemp(path.join(tmpdir(), 'flowcut-v24-test-'));
  const port = await freePort();
  const base = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, ['--import', 'tsx', 'server/index.ts'], {
    cwd: root, env: { ...process.env, PORT: String(port), FLOWCUT_DATA_DIR: dataDir,
      NODE_ENV: 'development', AUTO_OPEN_BROWSER: '0' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let log = '';
  child.stdout.on('data', chunk => { log += chunk.toString(); });
  child.stderr.on('data', chunk => { log += chunk.toString(); });
  const request = async (route: string, body?: unknown) => {
    const res = await fetch(base + route, body === undefined ? undefined : {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
    });
    assert.equal(res.ok, true, `${route}: HTTP ${res.status}`);
    return res.json() as Promise<any>;
  };
  try {
    await waitFor(async () => {
      if (child.exitCode !== null) throw new Error(`Server exited early: ${log}`);
      try { return (await fetch(`${base}/api/projects`)).ok; } catch { return false; }
    }, 90_000);
    const projects = await request('/api/projects');
    assert.ok(projects.projects.length, 'test server should seed its isolated demo');
    const project: ProjectData = (await request(`/api/projects/${projects.projects[0].id}`)).project;
    const video = project.assets.find(a => a.type === 'video');
    const image = project.assets.find(a => a.type === 'image');
    assert.ok(video && image);
    const original = project.videoGroups[0];
    const baseClip = original.clips[0];
    const first = { ...baseClip, id: 'reg-video', assetId: video.id, trimStart: 0, trimEnd: 1.3,
      speed: 1, muted: true, motion: 'none' as const, transition: 'fade' as const };
    const second = { ...baseClip, id: 'reg-image', assetId: image.id, trimStart: 0, trimEnd: 1.3,
      speed: 1, muted: true, motion: 'none' as const, transition: 'none' as const };
    const quiet: VideoGroup = { ...original, id: 'quiet', name: 'same', clips: [first, second],
      bgmAssetId: null, voiceoverAssetId: null, dedup: undefined, subtitles: undefined,
      overlay: { ...original.overlay, topTitle: '', bottomTitle: '' },
      sfx: { enabled: false, volume: 0.7, hookSfxId: 'whoosh_hook' as const,
        transitionSfxId: 'whoosh_hook' as const, ctaSfxId: 'whoosh_hook' as const } };
    const edited = structuredClone(quiet);
    edited.id = 'edited';
    edited.clips[0].motion = 'pan_right';
    edited.clips[1].motion = 'tilt_up';
    edited.sfx!.enabled = true;
    project.videoGroups = [quiet, edited];
    const options = { groupIds: ['quiet', 'edited'], quality: '720p', fps: 30,
      videoEncoder: 'libx264', concurrency: 2, filenamePattern: 'same', exportCoverMode: 'golden_3s' };
    let batch: RenderBatchJob = (await request(`/api/projects/${project.id}/render`, { project, options })).batch;
    assert.equal(new Set(batch.items.map(i => i.outputFilename.toLowerCase())).size, 2,
      'identical naming patterns must not overwrite output files');
    await waitFor(async () => {
      batch = (await request(`/api/renders/${batch.batchId}`)).batch;
      return batch.status !== 'running';
    }, 90_000);
    assert.equal(batch.status, 'completed', JSON.stringify(batch.items));
    const [a, b] = batch.items;
    assert.ok(a.coverFilename && a.coverUrl && b.coverFilename && b.coverUrl);
    assert.notEqual(a.coverFilename, b.coverFilename);
    const cover = await fetch(base + a.coverUrl);
    assert.equal(cover.status, 200);
    assert.match(cover.headers.get('content-type') || '', /^image\/jpeg/);
    const coverBytes = Buffer.from(await cover.arrayBuffer());
    assert.equal(coverBytes.readUInt16BE(0), 0xffd8);
    const download = await fetch(`${base}/api/download/export/${batch.batchId}/${encodeURIComponent(a.coverFilename)}`);
    assert.match(download.headers.get('content-type') || '', /^image\/jpeg/);
    const zip = await fetch(`${base}/api/renders/${batch.batchId}/zip`);
    assert.equal(zip.status, 200);
    const names = zipNames(Buffer.from(await zip.arrayBuffer()));
    for (const name of [a.outputFilename, a.coverFilename, b.outputFilename, b.coverFilename]) {
      assert.ok(names.includes(name), `ZIP missing ${name}: ${names}`);
    }
    const ffmpeg = resolveMediaBinary('FFMPEG_PATH', 'ffmpeg', 'ffmpeg-static').path;
    const outDir = path.join(dataDir, 'exports', batch.batchId);
    const expectedCover = execFileSync(ffmpeg,
      ['-v', 'error', '-ss', '1.800', '-i', path.join(outDir, a.outputFilename),
        '-frames:v', '1', '-q:v', '2', '-f', 'image2pipe', '-vcodec', 'mjpeg', 'pipe:1']);
    assert.deepEqual(coverBytes, expectedCover, 'golden cover must come from 1.8 seconds');
    const digest = (name: string, args: string[]) => execFileSync(ffmpeg,
      ['-v', 'error', '-i', path.join(outDir, name), ...args, '-f', 'md5', '-'],
      { encoding: 'utf8' }).trim();
    assert.notEqual(digest(a.outputFilename, ['-map', '0:a', '-c:a', 'pcm_s16le']),
      digest(b.outputFilename, ['-map', '0:a', '-c:a', 'pcm_s16le']), 'SFX must change audio');
    assert.notEqual(digest(a.outputFilename, ['-map', '0:v', '-vf', 'fps=3,scale=72:128', '-c:v', 'rawvideo']),
      digest(b.outputFilename, ['-map', '0:v', '-vf', 'fps=3,scale=72:128', '-c:v', 'rawvideo']),
      'motion must change video');

    async function renderOne(mode: string, short = false) {
      const group = structuredClone(quiet);
      if (short) {
        group.clips = [group.clips[0]];
        group.clips[0].trimEnd = 0.2;
        group.clips[0].speed = 2;
        group.clips[0].transition = 'none';
      }
      project.videoGroups = [group];
      let run: RenderBatchJob = (await request(`/api/projects/${project.id}/render`, {
        project, options: { ...options, groupIds: [group.id], concurrency: 1, exportCoverMode: mode },
      })).batch;
      await waitFor(async () => {
        run = (await request(`/api/renders/${run.batchId}`)).batch;
        return run.status !== 'running';
      }, 90_000);
      assert.equal(run.status, 'completed', JSON.stringify(run.items));
      return run;
    }
    for (const [mode, timestamp] of [['first_highlight', '0.350'], ['middle_frame', '1.125']] as const) {
      const run = await renderOne(mode);
      const item = run.items[0];
      assert.ok(item.coverUrl && item.coverFilename, JSON.stringify(item));
      const actual = Buffer.from(await (await fetch(base + item.coverUrl)).arrayBuffer());
      const expected = execFileSync(ffmpeg,
        ['-v', 'error', '-ss', timestamp, '-i', path.join(dataDir, 'exports', run.batchId, item.outputFilename),
          '-frames:v', '1', '-q:v', '2', '-f', 'image2pipe', '-vcodec', 'mjpeg', 'pipe:1']);
      assert.deepEqual(actual, expected, `${mode} should extract the requested frame`);
    }
    const noCover = await renderOne('none');
    assert.equal(noCover.items[0].coverUrl, undefined);
    const shortCover = await renderOne('golden_3s', true);
    assert.ok(shortCover.items[0].coverUrl, `short video cover missing: ${JSON.stringify(shortCover.items[0])}`);
  } finally {
    child.kill('SIGTERM');
    if (child.exitCode === null) await Promise.race([once(child, 'exit'), new Promise(resolve => { const timer = setTimeout(resolve, 5000); timer.unref(); })]);
    if (child.exitCode === null) child.kill('SIGKILL');
    await rm(dataDir, { recursive: true, force: true });
  }
});
