/**
 * FlowCut Pro — 免 npm 本地 Web 生产服务启动引导脚本
 */
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT_DIR = path.resolve(__dirname, '..');

console.log('================================================================');
console.log('  流剪矩阵 FlowCut Pro v2.0.2 · 本地 Web 生产服务引擎 (免 npm 版)');
console.log('================================================================');

const res = spawnSync(process.execPath, [path.join(ROOT_DIR, 'runtime', 'server.cjs')], {
  cwd: ROOT_DIR,
  env: {
    ...process.env,
    NODE_ENV: 'production',
    AUTO_OPEN_BROWSER: '1',
  },
  stdio: 'inherit',
});

process.exit(res.status || 0);
