@echo off
setlocal
chcp 65001 >nul
title Rainy Corner - Game Launcher
pushd "%~dp0"
set "GAME_NODE="
where node.exe >nul 2>&1
if not errorlevel 1 set "GAME_NODE=node.exe"
if not defined GAME_NODE if exist "%LOCALAPPDATA%\hermes\node\node.exe" set "GAME_NODE=%LOCALAPPDATA%\hermes\node\node.exe"
if not defined GAME_NODE if exist "%ProgramFiles%\nodejs\node.exe" set "GAME_NODE=%ProgramFiles%\nodejs\node.exe"
if not defined GAME_NODE (
  echo Node.js 20 or newer is required. Install the LTS version from https://nodejs.org/
  echo Then double-click start.bat again.
  pause
  popd
  exit /b 1
)
"%GAME_NODE%" "%~dp0scripts\start.mjs" %*
set "GAME_EXIT=%ERRORLEVEL%"
if not "%GAME_EXIT%"=="0" pause
popd
exit /b %GAME_EXIT%
