import path from 'path';
import fs from 'fs';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

// Compatible with both ESM (`tsx server/index.ts`) and bundled CJS (`node runtime/server.cjs`)
const currentDir =
  typeof __dirname !== 'undefined'
    ? __dirname
    : path.dirname(fileURLToPath(import.meta.url));

const customRequire =
  typeof require !== 'undefined' ? require : createRequire(import.meta.url);

export const ROOT_DIR = process.env.FLOWCUT_ROOT_DIR
  ? path.resolve(process.env.FLOWCUT_ROOT_DIR)
  : path.resolve(currentDir, '..');

export const BIN_DIR = process.env.FLOWCUT_BIN_DIR
  ? path.resolve(process.env.FLOWCUT_BIN_DIR)
  : path.join(ROOT_DIR, 'bin');

// Allows Electron Desktop shell or custom env to point user data to OS AppData/Application Support
export const STORAGE_DIR = process.env.FLOWCUT_DATA_DIR
  ? path.resolve(process.env.FLOWCUT_DATA_DIR)
  : path.join(ROOT_DIR, 'storage');

export const UPLOADS_DIR = path.join(STORAGE_DIR, 'uploads');
export const THUMBS_DIR = path.join(STORAGE_DIR, 'thumbnails');
export const EXPORTS_DIR = path.join(STORAGE_DIR, 'exports');
export const PROJECTS_DIR = path.join(STORAGE_DIR, 'projects');
export const TEMP_DIR = path.join(STORAGE_DIR, 'temp');

export function ensureStorageDirs() {
  for (const dir of [
    BIN_DIR,
    STORAGE_DIR,
    UPLOADS_DIR,
    THUMBS_DIR,
    EXPORTS_DIR,
    PROJECTS_DIR,
    TEMP_DIR,
  ]) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }
}

export function resolveMediaBinary(
  envKey: string,
  binName: string,
  staticPkg: string
): { path: string; found: boolean } {
  // 1. Explicit env override
  if (process.env[envKey] && fs.existsSync(process.env[envKey]!)) {
    return { path: process.env[envKey]!, found: true };
  }

  // 2. Local portable ./bin/ directory (auto-downloaded from domestic CDN or user-placed)
  const exeName = process.platform === 'win32' ? `${binName}.exe` : binName;
  const localBin = path.join(BIN_DIR, exeName);
  if (fs.existsSync(localBin)) {
    try {
      const st = fs.statSync(localBin);
      if (st.size > 1024 * 1024) {
        return { path: localBin, found: true };
      }
    } catch {
      // ignore
    }
  }

  // 3. System-installed ffmpeg/ffprobe in OS PATH
  try {
    const cmd = process.platform === 'win32' ? `where ${binName}` : `which ${binName}`;
    const out = execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
      .split(/\r?\n/)[0]
      ?.trim();
    if (out && fs.existsSync(out)) {
      return { path: out, found: true };
    }
  } catch {
    // Not in system PATH
  }

  // 4. Optional node_modules static binary (dev workspace)
  try {
    const mod = customRequire(staticPkg);
    const binPath: string | undefined = typeof mod === 'string' ? mod : mod?.path;
    if (binPath && fs.existsSync(binPath)) {
      return { path: binPath, found: true };
    }
  } catch {
    // ignore when running zero-node_modules standalone bundle
  }

  return { path: binName, found: false };
}

export let FFMPEG_BIN = resolveMediaBinary('FFMPEG_PATH', 'ffmpeg', 'ffmpeg-static').path;
export let FFPROBE_BIN = resolveMediaBinary('FFPROBE_PATH', 'ffprobe', 'ffprobe-static').path;

export function refreshMediaBinaries() {
  const ff = resolveMediaBinary('FFMPEG_PATH', 'ffmpeg', 'ffmpeg-static');
  const fp = resolveMediaBinary('FFPROBE_PATH', 'ffprobe', 'ffprobe-static');
  FFMPEG_BIN = ff.path;
  FFPROBE_BIN = fp.path;
  return { ffmpegFound: ff.found, ffprobeFound: fp.found, ffmpegPath: ff.path };
}
