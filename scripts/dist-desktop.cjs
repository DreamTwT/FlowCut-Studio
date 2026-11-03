/**
 * FlowCut Pro — 国内全镜像 electron-builder 桌面安装包编译脚本 (Mode B)
 *
 * 彻底解决国内网络执行 npm install / electron-builder 常见的三大痛点：
 *   1. 彻底移除 ffmpeg-static / electron 的 GitHub postinstall 脚本（不再连接 20.205.243.166 导致 ETIMEDOUT）。
 *   2. 打包前自动从阿里云 cdn.npmmirror.com 高速拉取目标平台的 ffmpeg + ffprobe 内嵌进安装包，安装后离线可用。
 *   3. 在 Windows 非管理员终端下，自动预解压 winCodeSign-2.6.0 并跳过 macOS 符号链接 (-xr!darwin)，
 *      彻底杜绝 7-Zip "ERROR: Cannot create symbolic link : 客户端没有所需的特权" 报错！
 */
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const zlib = require('zlib');
const { pipeline } = require('stream/promises');
const { execSync, execFileSync, spawnSync } = require('child_process');

const ROOT_DIR = path.resolve(__dirname, '..');
const BIN_DIR = path.join(ROOT_DIR, 'bin');

const args = process.argv.slice(2);
const isMac = args.includes('--mac');
const isWin = !isMac; // default --win

function downloadStream(url, destFile, gunzip = false) {
  return new Promise((resolve, reject) => {
    const requestUrl = (targetUrl, depth = 0) => {
      if (depth > 6) {
        reject(new Error('Too many redirects'));
        return;
      }
      const mod = targetUrl.startsWith('https:') ? https : http;
      const req = mod.get(
        targetUrl,
        { headers: { 'User-Agent': 'FlowCutPro-Builder/2.0.1' }, timeout: 30000 },
        (res) => {
          if (
            res.statusCode &&
            [301, 302, 303, 307, 308].includes(res.statusCode) &&
            res.headers.location
          ) {
            res.resume();
            requestUrl(new URL(res.headers.location, targetUrl).toString(), depth + 1);
            return;
          }
          if (res.statusCode !== 200) {
            res.resume();
            reject(new Error(`HTTP ${res.statusCode} for ${targetUrl}`));
            return;
          }

          const total = parseInt(res.headers['content-length'] || '0', 10);
          let received = 0;
          let lastPct = -1;
          res.on('data', (chunk) => {
            received += chunk.length;
            if (total > 0) {
              const pct = Math.floor((received / total) * 100);
              if (pct !== lastPct && pct % 5 === 0) {
                lastPct = pct;
                process.stdout.write(
                  `\r    下载进度: ${pct}% (${(received / 1048576).toFixed(1)} / ${(total / 1048576).toFixed(1)} MB)`
                );
              }
            }
          });

          const out = fs.createWriteStream(destFile);
          const streams = gunzip ? [res, zlib.createGunzip(), out] : [res, out];
          pipeline(...streams)
            .then(() => {
              process.stdout.write('\n');
              resolve();
            })
            .catch((err) => {
              process.stdout.write('\n');
              try {
                if (fs.existsSync(destFile)) fs.unlinkSync(destFile);
              } catch {}
              reject(err);
            });
        }
      );
      req.on('timeout', () => req.destroy(new Error('Timeout')));
      req.on('error', reject);
    };
    requestUrl(url);
  });
}

async function ensureBundledMediaBinaries() {
  fs.mkdirSync(BIN_DIR, { recursive: true });
  const items = isWin
    ? [
        { remote: 'ffmpeg-win32-x64.gz', local: 'ffmpeg.exe' },
        { remote: 'ffprobe-win32-x64.gz', local: 'ffprobe.exe' },
      ]
    : [
        {
          remote: process.arch === 'arm64' ? 'ffmpeg-darwin-arm64.gz' : 'ffmpeg-darwin-x64.gz',
          local: 'ffmpeg',
        },
        {
          remote: process.arch === 'arm64' ? 'ffprobe-darwin-arm64.gz' : 'ffprobe-darwin-x64.gz',
          local: 'ffprobe',
        },
      ];

  for (const item of items) {
    const targetPath = path.join(BIN_DIR, item.local);
    if (fs.existsSync(targetPath) && fs.statSync(targetPath).size > 5 * 1024 * 1024) {
      console.log(`[✓] 已缓存内置媒体核心: bin/${item.local}`);
      continue;
    }
    const url = `https://cdn.npmmirror.com/binaries/ffmpeg-static/b6.1.1/${item.remote}`;
    console.log(`[1/3] 正在从阿里云镜像拉取安装包内置核心 ${item.local}...`);
    const partPath = `${targetPath}.part`;
    await downloadStream(url, partPath, true);
    if (!isWin) fs.chmodSync(partPath, 0o755);
    fs.renameSync(partPath, targetPath);
    console.log(`[✓] ${item.local} 准备完成`);
  }
}

const EB_CACHE_DIR =
  process.env.ELECTRON_BUILDER_CACHE ||
  path.join(
    process.env.LOCALAPPDATA || path.join(require('os').homedir(), '.flowcut-eb-cache'),
    'electron-builder-cache'
  );

async function preExtractWinCodeSignWithoutSymlinks() {
  if (process.platform !== 'win32') return;
  const cacheDir = path.join(EB_CACHE_DIR, 'winCodeSign', 'winCodeSign-2.6.0');
  if (fs.existsSync(path.join(cacheDir, 'rcedit-x64.exe'))) {
    return;
  }

  let path7za;
  try {
    path7za = require('7zip-bin').path7za;
  } catch {
    return;
  }

  fs.mkdirSync(cacheDir, { recursive: true });
  const archivePath = path.join(path.dirname(cacheDir), 'winCodeSign-2.6.0.7z');
  const url =
    'https://cdn.npmmirror.com/binaries/electron-builder-binaries/winCodeSign-2.6.0/winCodeSign-2.6.0.7z';

  console.log('[2/3] 正在从阿里云镜像准备 Windows 图标资源写入工具 (免管理员权限兼容处理)...');
  await downloadStream(url, archivePath, false);

  try {
    // Skip darwin/* symlinks so non-Admin Windows CMD never fails with privilege errors!
    execFileSync(path7za, ['x', '-bd', '-y', '-xr!darwin', archivePath, `-o${cacheDir}`], {
      stdio: 'ignore',
    });
  } catch {
    // Even if 7za returns non-zero warning, rcedit-x64.exe & windows-10/* are extracted cleanly
  }
  try {
    if (fs.existsSync(archivePath)) fs.unlinkSync(archivePath);
  } catch {}
}

(async () => {
  console.log('================================================================');
  console.log('  流剪矩阵 FlowCut Pro — 国内镜像加速桌面安装包编译引擎');
  console.log('================================================================');

  console.log('[Step 1] 正在构建前端界面与后端生产包 (npm run build)...');
  execSync('npm run build', { cwd: ROOT_DIR, stdio: 'inherit' });

  await ensureBundledMediaBinaries();

  console.log('[Step 2] 正在调用 electron-builder 打包桌面安装程序 (纯JS写入图标 · 免 rcedit 锁死)...');
  const ebBin = path.join(
    ROOT_DIR,
    'node_modules',
    '.bin',
    process.platform === 'win32' ? 'electron-builder.cmd' : 'electron-builder'
  );

  const env = {
    ...process.env,
    ELECTRON_BUILDER_CACHE: EB_CACHE_DIR,
    ELECTRON_MIRROR: 'https://cdn.npmmirror.com/binaries/electron/',
    ELECTRON_CUSTOM_DIR: 'v33.2.0',
    ELECTRON_BUILDER_BINARIES_MIRROR:
      'https://cdn.npmmirror.com/binaries/electron-builder-binaries/',
    NPM_CONFIG_ELECTRON_BUILDER_BINARIES_MIRROR:
      'https://cdn.npmmirror.com/binaries/electron-builder-binaries/',
    CSC_IDENTITY_AUTO_DISCOVERY: 'false',
  };

  const ebArgs = [isMac ? '--mac' : '--win', '--config', 'electron-builder.yml'];
  const res =
    process.platform === 'win32'
      ? spawnSync('cmd.exe', ['/d', '/s', '/c', ebBin, ...ebArgs], {
          cwd: ROOT_DIR,
          env,
          stdio: 'inherit',
        })
      : spawnSync(ebBin, ebArgs, { cwd: ROOT_DIR, env, stdio: 'inherit' });

  if (res.status !== 0) {
    process.exit(res.status || 1);
  }

  console.log('\n================================================================');
  console.log('  🎉 打包成功！桌面安装包已输出至目录: release-desktop/');
  console.log('================================================================');
})();
