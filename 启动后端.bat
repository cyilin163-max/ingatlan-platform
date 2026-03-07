@echo off
chcp 65001 >nul
echo ========================================
echo   Ingatlan 后端启动
echo ========================================

set "ROOT=%~dp0"
set "ROOT=%ROOT:~0,-1%"
set "SERVER=%ROOT%\server"

if not exist "%SERVER%\server.js" (
  echo [错误] 找不到 server\server.js，请确认在项目根目录运行本文件。
  echo 当前目录: %CD%
  pause
  exit /b 1
)

pushd "%SERVER%"

where node >nul 2>nul
if errorlevel 1 (
  echo [错误] 未找到 Node.js。请先安装： https://nodejs.org
  echo 安装后关闭此窗口，重新双击本文件。
  popd
  pause
  exit /b 1
)

if not exist "node_modules" (
  echo 首次运行，正在安装依赖...
  call npm install
  if errorlevel 1 (
    echo [错误] npm install 失败
    popd
    pause
    exit /b 1
  )
)

echo.
echo 正在启动服务器，成功后用浏览器打开：
echo   http://localhost:3000
echo.
echo 关闭此窗口即可停止服务器。
echo ========================================
node server.js
if errorlevel 1 (
  echo.
  echo [错误] 服务器异常退出。若端口 3000 已被占用，请关闭占用程序后重试。
)
popd
pause
