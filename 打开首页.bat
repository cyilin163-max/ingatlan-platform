@echo off
cd /d "%~dp0"
set "SERVERDIR=%~dp0server"

:: 用 Node 启动后端并打开浏览器（路径用变量避免引号错误）
start "Ingatlan Server" cmd /k "cd /d "%SERVERDIR%" && npm start"
timeout /t 3 /nobreak >nul

:: 若未安装 Node，直接打开本地 index.html 也能看页面（登录功能需后端）
start "" "http://localhost:3000"
exit
