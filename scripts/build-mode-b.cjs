/**
 * FlowCut Pro — 模式 B 一键自动清理 + 国内镜像安装 + 编译 Windows 安装包引导脚本
 * 由纯 ASCII 的 .bat 调用，彻底规避 Windows cmd.exe 的 GBK/UTF-8 换行符错位乱码问题！
 */
const fs = require('fs');
const path = require('path');
const { spawnSync, execFile } = require('child_process');

const ROOT_DIR = path.resolve(__dirname, '..');

function runCmd(commandLine, extraEnv = {}) {
  const env = {
    ...process.env,
    ELECTRON_MIRROR: 'https://cdn.npmmirror.com/binaries/electron/',
    ELECTRON_CUSTOM_DIR: 'v33.2.0',
    ELECTRON_BUILDER_BINARIES_MIRROR:
      'https://cdn.npmmirror.com/binaries/electron-builder-binaries/',
    NPM_CONFIG_ELECTRON_BUILDER_BINARIES_MIRROR:
      'https://cdn.npmmirror.com/binaries/electron-builder-binaries/',
    CSC_IDENTITY_AUTO_DISCOVERY: 'false',
    ...extraEnv,
  };

  if (process.platform === 'win32') {
    return spawnSync('cmd.exe', ['/d', '/s', '/c', commandLine], {
      cwd: ROOT_DIR,
      env,
      stdio: 'inherit',
    });
  }
  return spawnSync('sh', ['-c', commandLine], {
    cwd: ROOT_DIR,
    env,
    stdio: 'inherit',
  });
}

(async () => {
  console.log('====================================================================');
  console.log('  流剪矩阵 FlowCut Pro v2.0.3 — 模式 B：编译标准 Windows 桌面安装包');
  console.log('  纯 JS 内存写入图标 · 免 rcedit · 兼容 360/管家防误锁 · 阿里云镜像');
  console.log('====================================================================\n');

  const ebBin = path.join(
    ROOT_DIR,
    'node_modules',
    '.bin',
    process.platform === 'win32' ? 'electron-builder.cmd' : 'electron-builder'
  );
  const viteBin = path.join(
    ROOT_DIR,
    'node_modules',
    '.bin',
    process.platform === 'win32' ? 'vite.cmd' : 'vite'
  );

  // Clean up any half-broken node_modules from earlier interrupted installs
  if (!fs.existsSync(ebBin) || !fs.existsSync(viteBin)) {
    const nmDir = path.join(ROOT_DIR, 'node_modules');
    const lockFile = path.join(ROOT_DIR, 'package-lock.json');
    if (fs.existsSync(nmDir)) {
      console.log('[自动修复] 检测到残留的不完整 node_modules，正在安全清理...');
      try {
        fs.rmSync(nmDir, { recursive: true, force: true, maxRetries: 6, retryDelay: 600 });
      } catch {
        runCmd('rmdir /s /q node_modules');
      }
    }
    if (fs.existsSync(lockFile)) {
      try {
        fs.unlinkSync(lockFile);
      } catch {}
    }
  }

  console.log('[步骤 1/2] 正在通过阿里云 npmmirror 镜像安装工程依赖 (npm install)...');
  const installRes = runCmd(
    'npm install --registry=https://registry.npmmirror.com --no-audit --no-fund'
  );
  if (installRes.status !== 0) {
    console.error(
      '\n[异常] npm install 未成功完成（退出码 ' +
        installRes.status +
        '）。若提示 EPERM 文件占用，请关闭正在扫描该文件夹的杀毒软件或编辑器后重试。'
    );
    process.exit(installRes.status || 1);
  }

  console.log('\n[步骤 2/2] 正在编译 Windows 安装包 (.exe) 与单文件绿色便携版 (.exe)...');
  const distRes = spawnSync(
    process.execPath,
    [path.join(ROOT_DIR, 'scripts', 'dist-desktop.cjs'), '--win'],
    { cwd: ROOT_DIR, stdio: 'inherit' }
  );

  if (distRes.status !== 0) {
    console.error('\n[异常] 安装包编译失败，请查看上方具体日志信息。');
    process.exit(distRes.status || 1);
  }

  const outDir = path.join(ROOT_DIR, 'release-desktop');
  console.log('\n====================================================================');
  console.log('  🎉 Windows 桌面安装包编译完成！输出目录: ' + outDir);
  console.log('====================================================================');
  if (process.platform === 'win32' && fs.existsSync(outDir)) {
    execFile('explorer.exe', [outDir]);
  }
})();
