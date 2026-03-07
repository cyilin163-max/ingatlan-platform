@echo off
cd /d "%~dp0"
echo 正在从项目目录启动，访问 http://localhost:8080 即可看到首页（不会出现目录列表）
echo 按 Ctrl+C 可停止服务器
start "" "http://localhost:8080"
python -m http.server 8080
pause
