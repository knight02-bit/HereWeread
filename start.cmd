@echo off
chcp 65001 >nul
cd /d "%~dp0"

rem 从 .env 读取 PORT（默认 5177），这样改端口后仍能自动打开正确地址
set "PORT=5177"
if exist ".env" (
  for /f "usebackq tokens=1,* delims==" %%a in (".env") do (
    if /i "%%a"=="PORT" set "PORT=%%b"
  )
)

echo 正在启动「微信读书个人数据看板」...
echo 地址：http://127.0.0.1:%PORT%/
start "" http://127.0.0.1:%PORT%/
node server\index.js
pause
