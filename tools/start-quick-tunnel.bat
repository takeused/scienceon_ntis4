@echo off
chcp 65001 > nul
title ScienceON NTIS Quick Tunnel
echo This starts a temporary public tunnel for the local proxy at 127.0.0.1:3737.
echo Keep this window open. Copy the displayed https://*.trycloudflare.com URL
echo into the Worker ORIGIN_API_BASE variable after every tunnel restart.
echo.
set "CLOUDFLARED=%~dp0cloudflared.exe"
if not exist "%CLOUDFLARED%" (
  echo cloudflared.exe was not found next to this script.
  echo Download the official Windows amd64 binary from Cloudflare, save it as tools\cloudflared.exe, then run this script again.
  exit /b 1
)

"%CLOUDFLARED%" tunnel --url http://127.0.0.1:3737
