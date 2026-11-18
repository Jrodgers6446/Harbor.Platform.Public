@echo off
rem Keeps Harbor Helper running: if it exits (restart, crash, update) it starts again in 2 seconds.
cd /d "%~dp0"
if exist "%~dp0stop.flag" del "%~dp0stop.flag"
:loop
node src\server.js >> "%USERPROFILE%\.harbor-helper\helper.log" 2>&1
if exist "%~dp0stop.flag" (del "%~dp0stop.flag" & exit /b)
timeout /t 2 /nobreak >nul
goto loop
