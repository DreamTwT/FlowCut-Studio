import fs from 'fs';
import path from 'path';
import https from 'https';
import http from 'http';
import zlib from 'zlib';
import { pipeline } from 'stream/promises';
import { BIN_DIR, refreshMediaBinaries } from './paths.js';

function getPlatformBinaryNames(): { ffmpeg: string; ffprobe: string } | null {
  const plat = process.platform;
  const arch = process.arch;
  if (plat === 'win32' && (arch === 'x64' || arch === 'arm64')) {
    return { ffmpeg: 'ffmpeg-win32-x64', ffprobe: 'ffprobe-win32-x64' };
  }
  if (plat === 'darwin' && arch === 'arm64') {
    return { ffmpeg: 'ffmpeg-darwin-arm64', ffprobe: 'ffprobe-darwin-arm64' };
  }
  if (plat === 'darwin' && arch === 'x64') {
    return { ffmpeg: 'ffmpeg-darwin-x64', ffprobe: 'ffprobe-darwin-x64' };
  }
  if (plat === 'linux' && arch === 'x64') {
    return { ffmpeg: 'ffmpeg-linux-x64', ffprobe: 'ffprobe-linux-x64' };
  }
  if (plat === 'linux' && arch === 'arm64') {
    return { ffmpeg: 'ffmpeg-linux-arm64', ffprobe: 'ffprobe-linux-arm64' };
  }
  return null;
}

function downloadGunzipWithProgress(url: string, destFile: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const requestUrl = (targetUrl: string, redirectDepth = 0) => {
      if (redirectDepth > 6) {
        reject(new Error('重定向次数过多'));
        return;
      }

      const client = targetUrl.startsWith('https:') ? https : http;
      const req = client.get(
        targetUrl,
        {
          headers: {
            'User-Agent': 'FlowCut-Pro-Updater/1.2',
          },
          timeout: 30000,
        },
        (res) => {
          if (
            res.statusCode &&
            [301, 302, 303, 307, 308].includes(res.statusCode) &&
            res.headers.location
          ) {
            res.resume();
            const nextUrl = new URL(res.headers.location, targetUrl).toString();
            requestUrl(nextUrl, redirectDepth + 1);
            return;
          }

          if (res.statusCode !== 200) {
            res.resume();
            reject(new Error(`HTTP 状态码 ${res.statusCode}`));
            return;
          }

          const totalBytes = parseInt(res.headers['content-length'] || '0', 10);
          let receivedBytes = 0;
          let lastPrint = 0;

          res.on('data', (chunk: Buffer) => {
            receivedBytes += chunk.length;
            const now = Date.now();
            if (now - lastPrint > 250 || (totalBytes > 0 && receivedBytes >= totalBytes)) {
              lastPrint = now;
              if (totalBytes > 0) {
                const pct = Math.min(100, Math.round((receivedBytes / totalBytes) * 100));
                const filled = Math.round((pct / 100) * 20);
                const bar = '█'.repeat(filled) + '░'.repeat(20 - filled);
                const mbDone = (receivedBytes / 1024 / 1024).toFixed(1);
                const mbTotal = (totalBytes / 1024 / 1024).toFixed(1);
                process.stdout.write(
                  `\r  下载进度 [${bar}] ${pct}% (${mbDone} / ${mbTotal} MB)`
                );
              } else {
                const mbDone = (receivedBytes / 1024 / 1024).toFixed(1);
                process.stdout.write(`\r  已下载 ${mbDone} MB...`);
              }
            }
          });

          const gunzip = zlib.createGunzip();
          const outStream = fs.createWriteStream(destFile);

          pipeline(res, gunzip, outStream)
            .then(() => {
              process.stdout.write('\n');
              resolve();
            })
            .catch((err) => {
              process.stdout.write('\n');
              try {
                if (fs.existsSync(destFile)) fs.unlinkSync(destFile);
              } catch {
                // ignore
              }
              reject(err);
            });
        }
      );

      req.on('timeout', () => {
        req.destroy(new Error('连接超时'));
      });
      req.on('error', (err) => {
        reject(err);
      });
    };

    requestUrl(url);
  });
}

/**
 * Ensures FFmpeg binary is ready without EVER invoking `npm install` or `github.com`.
 * Downloads compressed binary (~28MB) directly from Alibaba Cloud Domestic Mirror (`cdn.npmmirror.com`)
 * on first launch if no local/system FFmpeg is present.
 */
async function downloadSingleMediaTool(assetName: string, localExeName: string): Promise<boolean> {
  fs.mkdirSync(BIN_DIR, { recursive: true });
  const finalPath = path.join(BIN_DIR, localExeName);
  const partPath = `${finalPath}.part`;

  const mirrorUrls = [
    `https://cdn.npmmirror.com/binaries/ffmpeg-static/b6.1.1/${assetName}.gz`,
    `https://registry.npmmirror.com/-/binary/ffmpeg-static/b6.1.1/${assetName}.gz`,
  ];

  for (let attempt = 1; attempt <= 3; attempt++) {
    const mirrorUrl = mirrorUrls[(attempt - 1) % mirrorUrls.length];
    try {
      if (fs.existsSync(partPath)) fs.unlinkSync(partPath);
      await downloadGunzipWithProgress(mirrorUrl, partPath);
      if (process.platform !== 'win32') {
        fs.chmodSync(partPath, 0o755);
      }
      fs.renameSync(partPath, finalPath);
      return true;
    } catch (err: any) {
      console.warn(
        `  [重试 ${attempt}/3] 镜像下载异常 (${err?.message || '网络波动'})，正在切换备用节点重试...`
      );
      await new Promise((r) => setTimeout(r, 1200));
    }
  }
  return false;
}

export async function ensureFfmpegReady(): Promise<boolean> {
  const status = refreshMediaBinaries();
  if (status.ffmpegFound && status.ffprobeFound) {
    return true;
  }

  const names = getPlatformBinaryNames();
  if (!names) {
    console.warn('[FlowCut] 当前系统架构未匹配自动下载源，请确保系统已安装 ffmpeg。');
    return status.ffmpegFound;
  }

  const isWin = process.platform === 'win32';
  console.log('--------------------------------------------------------');
  console.log('[首次运行初始化] 正在从阿里云国内高速镜像准备本地音视频处理核心...');

  if (!status.ffmpegFound) {
    console.log('  -> 正在下载 FFmpeg 渲染核心 (约 28MB，仅首次下载)...');
    await downloadSingleMediaTool(names.ffmpeg, isWin ? 'ffmpeg.exe' : 'ffmpeg');
  }
  if (!status.ffprobeFound) {
    console.log('  -> 正在下载 FFprobe 媒体探测核心 (约 28MB，仅首次下载)...');
    await downloadSingleMediaTool(names.ffprobe, isWin ? 'ffprobe.exe' : 'ffprobe');
  }

  const updated = refreshMediaBinaries();
  if (updated.ffmpegFound) {
    console.log(`[✓] 音视频引擎就绪: ${updated.ffmpegPath}`);
    console.log('--------------------------------------------------------');
    return true;
  }

  console.warn('--------------------------------------------------------');
  console.warn('[提示] 自动下载 FFmpeg 未成功（可能当前处于离线或内网环境）。');
  console.warn(`工作台依然可以正常打开编排！如需导出 MP4，可将 ffmpeg 放入: ${BIN_DIR}`);
  console.warn('--------------------------------------------------------');
  return false;
}
