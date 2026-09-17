@echo off
title Stop NeumoRemind Background Service
echo Stopping NeumoRemind background service on port 3001...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":3001" ^| findstr "LISTENING"') do (
    echo Terminating process with PID: %%a
    taskkill /F /PID %%a >nul 2>&1
)
echo Service stopped.
pause
