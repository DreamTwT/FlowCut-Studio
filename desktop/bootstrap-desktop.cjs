/**
 * FlowCut Pro 零 npm 绿色便携桌面端自动引导器 (Zero-npm Portable Desktop Launcher)
 *
 * 工作原理：
 * 1. 无需任何 npm install、无需 Python / Visual Studio 编译环境。
 * 2. 检查本地 `./runtime/electron-<platform>-<arch>/` 是否已缓存 Electron 运行壳。
 * 3. 若首次启动尚未缓存，自动从国内高速【阿里云 npmmirror 镜像源】拉取对应系统的
 *    Electron v33.2.0 绿色运行时压缩包并解压，随后直接拉起原生桌面客户端窗口！
 * 4. 若首次启动处于纯离线内网环境，自动无缝降级为【本地引擎 + Edge/Chrome 原生无边框桌面应用窗口 (--app)】！
 */
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const { spawn, execFileSync } = require('child_process');

const ROOT_DIR = path.resolve(__dirname, '..');
const ELECTRON_VER = '33.2.0';
const plat = process.platform;
const arch = process.arch === 'arm64' ? 'arm64' : 'x64';

const RUNTIME_DIR = path.join(ROOT_DIR, 'runtime', `electron-${plat}-${arch}`);

function getElectronBinaryPath() {
  if (plat === 'win32') {
    return path.join(RUNTIME_DIR, 'electron.exe');
  }
  if (plat === 'darwin') {
    return path.join(RUNTIME_DIR, 'Electron.app', 'Contents', 'MacOS', 'Electron');
  }
  return path.join(RUNTIME_DIR, 'electron');
}

// Also check node_modules/.bin/electron if developer ran npm install
function getLocalInstalledElectron() {
  if (plat === 'win32') {
    const p = path.join(ROOT_DIR, 'node_modules', 'electron', 'dist', 'electron.exe');
    if (fs.existsSync(p)) return p;
  } else if (plat === 'darwin') {
    const p = path.join(
      ROOT_DIR,
      'node_modules',
      'electron',
      'dist',
      'Electron.app',
      'Contents',
      'MacOS',
      'Electron'
    );
    if (fs.existsSync(p)) return p;
  } else {
    const p = path.join(ROOT_DIR, 'node_modules', 'electron', 'dist', 'electron');
    if (fs.existsSync(p)) return p;
  }
  return null;
}

function downloadWithRedirect(url, destFile) {
  return new Promise((resolve, reject) => {
    const request = (targetUrl, redirects = 0) => {
      if (redirects > 6) {
        reject(new Error('Too many redirects'));
        return;
      }
      const mod = targetUrl.startsWith('https') ? https : http;
      const req = mod.get(
        targetUrl,
        { headers: { 'User-Agent': 'FlowCutPro-Desktop-Bootstrap/2.0' } },
        (res) => {
          if (
            res.statusCode &&
            res.statusCode >= 300 &&
            res.statusCode < 400 &&
            res.headers.location
          ) {
            res.resume();
            const nextUrl = new URL(res.headers.location, targetUrl).toString();
            request(nextUrl, redirects + 1);
            return;
          }
          if (res.statusCode !== 200) {
            res.resume();
            reject(new Error(`HTTP ${res.statusCode}`));
            return;
          }

          const total = Number(res.headers['content-length'] || 0);
          let received = 0;
          let lastPct = -1;
          const out = fs.createWriteStream(destFile);

          res.on('data', (chunk) => {
            received += chunk.length;
            if (total > 0) {
              const pct = Math.floor((received / total) * 100);
              if (pct !== lastPct && pct % 2 === 0) {
                lastPct = pct;
                const mb = (received / 1048576).toFixed(1);
                const totalMb = (total / 1048576).toFixed(1);
                process.stdout.write(
                  `\r[桌面端引导] 正在高速下载原生桌面外壳: ${pct}% (${mb} MB / ${totalMb} MB)...`
                );
              }
            }
          });

          res.pipe(out);
          out.on('finish', () => {
            out.close(() => {
              process.stdout.write('\n');
              resolve();
            });
          });
          out.on('error', reject);
        }
      );
      req.on('error', reject);
      req.setTimeout(30000, () => {
        req.destroy(new Error('Connection timeout'));
      });
    };
    request(url);
  });
}

function extractZipArchive(zipPath, targetDir) {
  fs.mkdirSync(targetDir, { recursive: true });
  if (plat === 'win32') {
    execFileSync(
      'powershell.exe',
      [
        '-NoProfile',
        '-ExecutionPolicy',
        'Bypass',
        '-Command',
        `Expand-Archive -LiteralPath '${zipPath.replace(/'/g, "''")}' -DestinationPath '${targetDir.replace(/'/g, "''")}' -Force`,
      ],
      { stdio: 'inherit' }
    );
  } else {
    execFileSync('unzip', ['-q', '-o', zipPath, '-d', targetDir], { stdio: 'inherit' });
  }
}

function launchNativeElectron(electronBin) {
  console.log('[FlowCut Desktop] 正在启动原生桌面工作台窗口...');
  const child = spawn(electronBin, [path.join(ROOT_DIR, 'desktop', 'main.cjs')], {
    cwd: ROOT_DIR,
    detached: true,
    stdio: 'ignore',
  });
  child.unref();
  setTimeout(() => process.exit(0), 600);
}

function launchOfflineBrowserAppFallback() {
  console.log('\n[离线桌面模式] 当前网络无法连接镜像源，正在以本地服务器 + Edge/Chrome 独立桌面应用窗口启动...');
  const port = 18766;
  const srv = spawn(process.execPath, [path.join(ROOT_DIR, 'runtime', 'server.cjs')], {
    cwd: ROOT_DIR,
    env: {
      ...process.env,
      NODE_ENV: 'production',
      FLOWCUT_DESKTOP: '1',
      AUTO_OPEN_BROWSER: '0',
      PORT: String(port),
    },
    stdio: 'inherit',
  });

  setTimeout(() => {
    const url = `http://127.0.0.1:${port}`;
    if (plat === 'win32') {
      const candidates = [
        'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
        'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
        'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      ];
      const browser = candidates.find((p) => fs.existsSync(p));
      if (browser) {
        spawn(browser, [`--app=${url}`, '--window-size=1540,940'], {
          detached: true,
          stdio: 'ignore',
        }).unref();
        return;
      }
      spawn('cmd.exe', ['/c', 'start', '', url], { detached: true, stdio: 'ignore' }).unref();
    } else if (plat === 'darwin') {
      spawn('open', [url], { detached: true, stdio: 'ignore' }).unref();
    }
  }, 1500);

  process.on('SIGINT', () => {
    srv.kill();
    process.exit(0);
  });
}

(async () => {
  const existing = getLocalInstalledElectron() || (fs.existsSync(getElectronBinaryPath()) ? getElectronBinaryPath() : null);
  if (existing) {
    launchNativeElectron(existing);
    return;
  }

  const zipName = `electron-v${ELECTRON_VER}-${plat}-${arch}.zip`;
  const mirrorUrls = [
    `https://registry.npmmirror.com/-/binary/electron/v${ELECTRON_VER}/${zipName}`,
    `https://npmmirror.com/mirrors/electron/v${ELECTRON_VER}/${zipName}`,
    `https://github.com/electron/electron/releases/download/v${ELECTRON_VER}/${zipName}`,
  ];

  const tmpZip = path.join(ROOT_DIR, 'runtime', `${zipName}.download`);
  fs.mkdirSync(path.dirname(tmpZip), { recursive: true });

  console.log('==============================================================');
  console.log(' 流剪矩阵 FlowCut Pro v2.0 — 首次初始化绿色原生桌面客户端');
  console.log(' 无需 npm install，仅首次启动自动从阿里云镜像缓存桌面运行时');
  console.log('==============================================================');

  let downloaded = false;
  for (const url of mirrorUrls) {
    try {
      console.log(`[镜像节点] ${url}`);
      await downloadWithRedirect(url, tmpZip);
      downloaded = true;
      break;
    } catch (err) {
      console.warn(`[切换备用节点] 当前节点连接失败: ${err.message}`);
    }
  }

  if (!downloaded) {
    try {
      if (fs.existsSync(tmpZip)) fs.unlinkSync(tmpZip);
    } catch {}
    launchOfflineBrowserAppFallback();
    return;
  }

  try {
    console.log('[桌面端引导] 下载完成，正在解压本地绿色桌面运行环境 (约 5~10 秒)...');
    extractZipArchive(tmpZip, RUNTIME_DIR);
    try {
      fs.unlinkSync(tmpZip);
    } catch {}
    const bin = getElectronBinaryPath();
    if (plat !== 'win32' && fs.existsSync(bin)) {
      fs.chmodSync(bin, 0o755);
    }
    launchNativeElectron(bin);
  } catch (err) {
    console.error('[解压异常]', err.message);
    launchOfflineBrowserAppFallback();
  }
})();
