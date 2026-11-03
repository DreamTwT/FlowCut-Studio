@echo off
cd /d "%~dp0"
chcp 65001 >nul
title FlowCut Pro v2.0.2 - Mode B Windows Installer Builder
where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js was not found in PATH. Please install Node.js LTS from https://nodejs.org
  pause
  exit /b 1
)
node "%~dp0scripts\build-mode-b.cjs"
echo.
pause
