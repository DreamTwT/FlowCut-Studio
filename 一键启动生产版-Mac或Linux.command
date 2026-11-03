#!/usr/bin/env bash
cd "$(dirname "$0")"
echo "========================================================"
echo "  流剪矩阵 FlowCut Pro v1.2 · 信息流视频批量生产系统"
echo "  [免 npm install 独立打包内核 · 零依赖秒级直启]"
echo "========================================================"
if ! command -v node >/dev/null 2>&1; then
  echo "[提示] 未检测到 Node.js 环境！"
  echo "您可直接打开同目录下的【双击直接打开-免环境体验版.html】，或安装 Node.js (https://nodejs.org/)。"
  read -p "按回车键退出..."
  exit 1
fi
export NODE_ENV=production
export AUTO_OPEN_BROWSER=1
node "./runtime/server.cjs"
