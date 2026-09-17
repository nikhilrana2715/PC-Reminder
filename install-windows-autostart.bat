@echo off
title NeumoRemind Background Service Installer
echo =========================================================
echo   NeumoRemind - Windows Background Service Installer
echo =========================================================
echo.
echo Installing silent background service into Windows Startup...
set "SCRIPT_DIR=%~dp0"
set "TARGET_VBS=%SCRIPT_DIR%NeumoRemind-Background-Start.vbs"
set "STARTUP_DIR=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"

if not exist "%TARGET_VBS%" (
    echo [ERROR] NeumoRemind-Background-Start.vbs not found in %SCRIPT_DIR%
    pause
    exit /b 1
)

copy /Y "%TARGET_VBS%" "%STARTUP_DIR%\NeumoRemind-Background-Start.vbs" >nul 2>&1
if %ERRORLEVEL% EQU 0 (
    echo.
    echo [OK] Background service installed successfully to Windows Startup!
    echo.
    echo The reminder scheduler will now run automatically in the background
    echo whenever your PC turns on. No command prompt or terminal will show.
    echo.
    echo Starting the background service now...
    wscript "%STARTUP_DIR%\NeumoRemind-Background-Start.vbs"
    echo [OK] Background service is active on http://localhost:3001
    echo.
    echo You can now open http://localhost:3001 in Chrome/Edge and click
    echo 'Install App' to use NeumoRemind with 100%% background notifications!
    echo.
) else (
    echo [ERROR] Could not copy file to Startup folder.
)
pause
