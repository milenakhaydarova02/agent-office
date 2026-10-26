@echo off
chcp 65001 >nul
rem Launch the Agent Office window (always on top)
cd /d "%~dp0"
if not exist "node_modules\electron\dist\electron.exe" (
  echo Electron not found. Run "npm install" in this folder first.
  pause
  exit /b 1
)
start "" "node_modules\electron\dist\electron.exe" .
