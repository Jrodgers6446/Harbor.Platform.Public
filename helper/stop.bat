@echo off
rem Stops Harbor Helper (and its auto-restart loop).
echo stop> "%~dp0stop.flag"
for /f "tokens=5" %%p in ('netstat -ano ^| findstr "127.0.0.1:47800" ^| findstr LISTENING') do taskkill /PID %%p /F >nul 2>nul && echo Harbor Helper stopped.
