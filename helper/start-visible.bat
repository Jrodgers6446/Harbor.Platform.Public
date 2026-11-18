@echo off
title Harbor Helper
cd /d "%~dp0"
call "%~dp0stop.bat" >nul 2>nul
node src\server.js
pause
