@echo off
cd /d "%~dp0"
set /p NAME=Customer name exactly as on Future Jobs (First Last): 
set /p DAY=Date (e.g. Nov 13): 
node src\cli.js precall --mode dry --customer "%NAME%" --date "%DAY%"
pause
