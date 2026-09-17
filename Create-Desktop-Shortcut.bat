@echo off
setlocal
echo ====================================================
echo   NeumoRemind - Windows Desktop Installer & Setup
echo ====================================================
echo.
echo Creating Desktop Shortcut...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\create_desktop_shortcut.ps1"
echo.
echo ====================================================
echo   NeumoRemind is ready!
echo   Target: %~dp0dist\NeumoRemind-win32-x64\NeumoRemind.exe
echo   You can also launch it anytime from your Desktop!
echo ====================================================
echo.
pause
