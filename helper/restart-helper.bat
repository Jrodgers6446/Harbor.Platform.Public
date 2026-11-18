@echo off
title Restarting Harbor Helper
cd /d "%~dp0"
call "%~dp0stop.bat"
timeout /t 3 /nobreak >nul
if exist "%~dp0stop.flag" del "%~dp0stop.flag"
wscript.exe "%~dp0start-hidden.vbs"
timeout /t 3 /nobreak >nul
node src\cli.js status
echo.
echo Harbor Helper restarted. You can close this window.
timeout /t 8
