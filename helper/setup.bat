@echo off
title Harbor Helper setup
cd /d "%~dp0"
echo === Harbor Helper setup ===
echo.
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js not found - installing it...
  winget install -e --id OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements
  set "PATH=%PATH%;C:\Program Files\nodejs"
)
where node >nul 2>nul || (echo Node install failed. Install from nodejs.org then run this again. & pause & exit /b 1)
for /f "delims=" %%v in ('node -v') do echo Node %%v OK
where adb >nul 2>nul
if errorlevel 1 (
  echo adb not found - installing Android platform tools...
  winget install -e --id Google.PlatformTools --accept-source-agreements --accept-package-agreements
  set "PATH=%PATH%;%LOCALAPPDATA%\Microsoft\WinGet\Links"
)
where adb >nul 2>nul && (echo adb OK) || (echo WARNING: adb still not found. Install Android platform tools, then run this again.)
where python >nul 2>nul && (python -m pip install --quiet --disable-pip-version-check uiautomator2 >nul 2>nul && echo Fast phone driver OK) || (echo Python not found: using plain adb, a little slower. That's fine.)
echo.
echo Adding Harbor Helper to Windows startup...
powershell -NoProfile -Command "$s=(New-Object -ComObject WScript.Shell).CreateShortcut([Environment]::GetFolderPath('Startup')+'\Harbor Helper.lnk'); $s.TargetPath='%~dp0start-hidden.vbs'; $s.WorkingDirectory='%~dp0'; $s.Save()"
echo Starting Harbor Helper in the background...
call "%~dp0stop.bat" >nul 2>nul
wscript.exe "%~dp0start-hidden.vbs"
timeout /t 3 /nobreak >nul
echo.
node src\cli.js status
echo.
echo Token for Harbor settings (website: gear ^> Harbor Helper ^> Helper token):
node src\cli.js token
echo.
echo Done. It now starts automatically when you log in.
echo Log file: %USERPROFILE%\.harbor-helper\helper.log
pause
