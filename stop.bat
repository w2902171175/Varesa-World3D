@echo off
setlocal
chcp 65001 >nul
title Rainy Corner - Stop All Game Services
pushd "%~dp0"
set "GAME_NODE="
where node.exe >nul 2>&1
if not errorlevel 1 set "GAME_NODE=node.exe"
if not defined GAME_NODE if exist "%LOCALAPPDATA%\hermes\node\node.exe" set "GAME_NODE=%LOCALAPPDATA%\hermes\node\node.exe"
if not defined GAME_NODE if exist "%ProgramFiles%\nodejs\node.exe" set "GAME_NODE=%ProgramFiles%\nodejs\node.exe"
if not defined GAME_NODE (
  echo Node.js is required. Please install the LTS version from https://nodejs.org/
  pause
  popd
  exit /b 1
)
"%GAME_NODE%" "%~dp0scripts\stop.mjs" %*
set "GAME_EXIT=%ERRORLEVEL%"
if /i not "%~1"=="--quiet" pause
popd
exit /b %GAME_EXIT%
