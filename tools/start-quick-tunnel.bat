@echo off
chcp 65001 > nul
title ScienceON NTIS Quick Tunnel
echo This starts a temporary public tunnel for the local proxy at 127.0.0.1:3737.
echo Keep this window open. Copy the displayed https://*.trycloudflare.com URL
echo into the Worker ORIGIN_API_BASE variable after every tunnel restart.
echo.
npx wrangler tunnel quick-start http://127.0.0.1:3737
