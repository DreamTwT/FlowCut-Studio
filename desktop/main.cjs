/**
 * 流剪矩阵 FlowCut Pro v2.0 — 桌面客户端主进程 (Electron Main Process)
 *
 * 同时兼容两种桌面运行形态：
 *   形态 A (免 npm 绿色便携桌面版)：双击 `一键启动-Windows桌面客户端(免npm).bat` 直接运行
 *   形态 B (electron-builder 安装包版)：通过 `npm run dist:win` 编译生成的 NSIS 安装版 / 单文件便携版 .exe
 */
const { app, BrowserWindow, ipcMain, Menu, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const net = require('net');
const http = require('http');
const { spawn } = require('child_process');

let mainWindow = null;
let serverProc = null;
let activePort = 18765;
let resolvedStorageDir = '';

// Prevent duplicate desktop instances
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

function resolveAppBaseDir() {
  // In electron-builder packaged .asar, unpacked assets live in app.asar.unpacked
  const rawRoot = path.resolve(__dirname, '..');
  if (rawRoot.includes('app.asar') && !rawRoot.includes('app.asar.unpacked')) {
    const unpacked = rawRoot.replace('app.asar', 'app.asar.unpacked');
    if (fs.existsSync(unpacked)) return unpacked;
  }
  return rawRoot;
}

function isDirWritable(dirPath) {
  try {
    fs.mkdirSync(dirPath, { recursive: true });
    const probe = path.join(dirPath, `.write_probe_${process.pid}`);
    fs.writeFileSync(probe, 'ok');
    fs.unlinkSync(probe);
    return true;
  } catch {
    return false;
  }
}

function findAvailablePort(preferred = 18765) {
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.unref();
    srv.on('error', () => {
      const fallback = net.createServer();
      fallback.unref();
      fallback.listen(0, '127.0.0.1', () => {
        const p = fallback.address().port;
        fallback.close(() => resolve(p));
      });
    });
    srv.listen(preferred, '127.0.0.1', () => {
      const p = srv.address().port;
      srv.close(() => resolve(p));
    });
  });
}

function waitForBackendReady(port, timeoutMs = 45000) {
  const start = Date.now();
  return new Promise((resolve) => {
    const check = () => {
      const req = http.get(`http://127.0.0.1:${port}/api/health`, (res) => {
        if (res.statusCode === 200) {
          res.resume();
          resolve(true);
        } else {
          res.resume();
          retry();
        }
      });
      req.on('error', retry);
      req.setTimeout(1200, () => {
        req.destroy();
        retry();
      });
    };
    const retry = () => {
      if (Date.now() - start >= timeoutMs) {
        resolve(false);
      } else {
        setTimeout(check, 220);
      }
    };
    check();
  });
}

function buildSplashDataUrl() {
  const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8" />
<style>
  html, body {
    margin: 0; padding: 0; width: 100%; height: 100%;
    background: radial-gradient(circle at 50% 35%, #191E2E 0%, #0D0F16 75%);
    color: #F3F4F6;
    font-family: "Microsoft YaHei", "PingFang SC", system-ui, sans-serif;
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    user-select: none; overflow: hidden;
  }
  .logo {
    width: 68px; height: 68px; border-radius: 18px;
    background: linear-gradient(135deg, #00E5FF 0%, #0077FF 55%, #FFB800 100%);
    display: flex; align-items: center; justify-content: center;
    box-shadow: 0 12px 38px rgba(0, 229, 255, 0.28);
    margin-bottom: 20px;
    font-size: 30px; font-weight: 900; color: #091018;
  }
  h1 { margin: 0 0 8px; font-size: 20px; letter-spacing: 0.5px; }
  p { margin: 0 0 22px; font-size: 12px; color: #94A3B8; }
  .bar {
    width: 240px; height: 4px; border-radius: 99px;
    background: rgba(255,255,255,0.09); overflow: hidden;
  }
  .fill {
    width: 45%; height: 100%; border-radius: 99px;
    background: linear-gradient(90deg, #00E5FF, #FFB800);
    animation: slide 1.15s ease-in-out infinite alternate;
  }
  @keyframes slide {
    from { transform: translateX(-20%); }
    to { transform: translateX(140%); }
  }
</style>
</head>
<body>
  <div class="logo">流</div>
  <h1>流剪矩阵 FlowCut Pro</h1>
  <p>正在初始化本地 FFmpeg 混剪与 AI 语音合成引擎（首次启动若需下载组件请稍候）...</p>
  <div class="bar"><div class="fill"></div></div>
</body>
</html>`;
  return `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
}

function startEmbeddedBackend(port) {
  const baseDir = resolveAppBaseDir();
  const portableStorage = path.join(baseDir, 'storage');
  const portableBin = path.join(baseDir, 'bin');

  // If portable folder is writable (green portable desktop mode), keep storage & bin side-by-side!
  // Otherwise (e.g. installed in C:\Program Files), store user data in %APPDATA%/FlowCut Pro
  const usePortable = !app.isPackaged && isDirWritable(portableStorage);
  const userDataRoot = app.getPath('userData');
  resolvedStorageDir = usePortable ? portableStorage : path.join(userDataRoot, 'storage');
  const resolvedBinDir = usePortable
    ? portableBin
    : fs.existsSync(path.join(portableBin, process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg'))
    ? portableBin
    : path.join(userDataRoot, 'bin');

  const serverEntry = path.join(baseDir, 'runtime', 'server.cjs');

  const env = {
    ...process.env,
    ELECTRON_RUN_AS_NODE: '1',
    NODE_ENV: 'production',
    FLOWCUT_DESKTOP: '1',
    AUTO_OPEN_BROWSER: '0',
    PORT: String(port),
    FLOWCUT_ROOT_DIR: baseDir,
    FLOWCUT_DATA_DIR: resolvedStorageDir,
    FLOWCUT_BIN_DIR: resolvedBinDir,
  };

  serverProc = spawn(process.execPath, [serverEntry], {
    cwd: baseDir,
    env,
    stdio: 'inherit',
    windowsHide: true,
  });

  serverProc.on('exit', (code) => {
    console.log(`[FlowCut Desktop] Embedded server exited with code ${code}`);
  });
}

function stopEmbeddedBackend() {
  if (!serverProc) return;
  try {
    serverProc.kill();
  } catch {
    // ignore
  }
  serverProc = null;
}

ipcMain.handle('flowcut:open-exports', async (_evt, batchId) => {
  const cleanId = String(batchId || '').replace(/[^a-zA-Z0-9_-]/g, '');
  const exportsBase = path.join(resolvedStorageDir, 'exports');
  const target =
    cleanId && fs.existsSync(path.join(exportsBase, cleanId))
      ? path.join(exportsBase, cleanId)
      : exportsBase;
  fs.mkdirSync(target, { recursive: true });
  await shell.openPath(target);
  return { ok: true, path: target };
});

async function createDesktopWorkbench() {
  Menu.setApplicationMenu(null);
  activePort = await findAvailablePort(18765);
  startEmbeddedBackend(activePort);

  const iconCandidate = path.join(__dirname, process.platform === 'win32' ? 'icon.ico' : 'icon.png');

  mainWindow = new BrowserWindow({
    width: 1540,
    height: 940,
    minWidth: 1120,
    minHeight: 700,
    backgroundColor: '#0F1014',
    title: '流剪矩阵 FlowCut Pro v2.0 — 短视频批量混剪生产桌面工作台',
    icon: fs.existsSync(iconCandidate) ? iconCandidate : undefined,
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: false,
    },
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http://127.0.0.1:') || url.startsWith('http://localhost:')) {
      return { action: 'allow' };
    }
    shell.openExternal(url);
    return { action: 'deny' };
  });

  // Show sleek native dark splash immediately while embedded backend & FFmpeg initialize
  await mainWindow.loadURL(buildSplashDataUrl());

  await waitForBackendReady(activePort, 90000);
  if (mainWindow && !mainWindow.isDestroyed()) {
    await mainWindow.loadURL(`http://127.0.0.1:${activePort}`);
  }
}

app.whenReady().then(createDesktopWorkbench);

app.on('before-quit', () => {
  stopEmbeddedBackend();
});

app.on('window-all-closed', () => {
  stopEmbeddedBackend();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createDesktopWorkbench();
  }
});
