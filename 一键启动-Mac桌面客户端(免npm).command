#!/bin/bash
cd "$(dirname "$0")"
echo "================================================================"
echo "  流剪矩阵 FlowCut Pro v2.0 (macOS / Linux 原生桌面工作台 · 免 npm 版)"
echo "================================================================"

if ! command -v node >/dev/null 2>&1; then
  echo "[提示] 未检测到 Node.js 环境，请先安装 Node.js (https://nodejs.org) 后重试。"
  read -p "按回车键退出..."
  exit 1
fi

node desktop/bootstrap-desktop.cjs
