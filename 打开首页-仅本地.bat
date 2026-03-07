@echo off
cd /d "%~dp0"
:: 直接打开 index.html（不启动后端，登录/注册不可用，但页面能看）
start "" "%~dp0index.html"
exit
