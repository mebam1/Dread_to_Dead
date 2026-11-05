@echo off
setlocal
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js 20 or later is required.
  pause
  exit /b 1
)
node "%~dp0cli.mjs" play %*
if errorlevel 1 (
  pause
  exit /b 1
)
