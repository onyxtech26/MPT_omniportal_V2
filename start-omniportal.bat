@echo off
setlocal
title MPT OmniPortal - Local Server

REM Always run from this file's own folder, whatever folder it is launched from.
cd /d "%~dp0"

echo ==========================================================
echo    MPT OmniPortal  -  starting local server
echo ==========================================================
echo.

REM ---- 1. Check Node.js is installed -----------------------
where node >nul 2>nul
if errorlevel 1 (
    echo  [ERROR] Node.js was not found on this computer.
    echo.
    echo  Please install Node.js version 18 or newer from:
    echo      https://nodejs.org
    echo  then run this file again.
    echo.
    pause
    exit /b 1
)

for /f "delims=" %%v in ('node --version') do set "NODEVER=%%v"
echo  Node.js %NODEVER% detected.
echo.

REM ---- 2. Install dependencies on first run ----------------
if not exist "node_modules\" (
    echo  First run detected - installing dependencies.
    echo  This takes a few minutes, and only happens once.
    echo.
    call npm install
    if errorlevel 1 (
        echo.
        echo  [ERROR] Installation failed. Check the messages above.
        echo.
        pause
        exit /b 1
    )
    echo.
    echo  Dependencies installed.
    echo.
)

REM ---- 3. Open the browser shortly after the server boots ---
start "" /min powershell -NoProfile -WindowStyle Hidden -Command "Start-Sleep -Seconds 8; Start-Process 'http://localhost:3000'"

echo  ----------------------------------------------------------
echo    The app will open automatically at:
echo        http://localhost:3000
echo.
echo    Your sales data is read on THIS computer only.
echo    Nothing is uploaded to any server.
echo.
echo    To stop the server: press Ctrl+C, then answer Y
echo  ----------------------------------------------------------
echo.

REM ---- 4. Start the development server ----------------------
call npm run dev

echo.
echo  Server stopped.
pause
