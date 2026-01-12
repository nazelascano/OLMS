@echo off
REM =====================================================
REM OLMS - Offline Library Management System
REM Single File Launcher - Just double-click to run!
REM =====================================================

title OLMS - Offline Library Management System

echo.
echo ========================================================
echo  OLMS - Offline Library Management System
echo  Single File Launcher
echo ========================================================
echo.

REM Check if we're in the right directory
if not exist "backend\server.js" (
    echo ERROR: Please run this file from the OLMS root directory
    echo Expected: backend\server.js should exist
    pause
    exit /b 1
)

if not exist "frontend\package.json" (
    echo ERROR: Please run this file from the OLMS root directory  
    echo Expected: frontend\package.json should exist
    pause
    exit /b 1
)

echo [1/6] Checking Node.js installation...
node --version >nul 2>&1
if errorlevel 1 (
    echo ERROR: Node.js is not installed!
    echo Please download and install Node.js from: https://nodejs.org/
    pause
    exit /b 1
)
echo ✓ Node.js found

echo.
echo [2/6] Stopping any existing servers...
taskkill /F /IM node.exe >nul 2>&1
timeout /t 2 /nobreak >nul

echo.
echo [3/6] Installing backend dependencies...
cd backend
if not exist "node_modules" (
    echo Installing backend packages...
    npm install
) else (
    echo ✓ Backend dependencies already installed
)

echo.
echo [4/6] Installing frontend dependencies...
cd ..\frontend
if not exist "node_modules" (
    echo Installing frontend packages...
    npm install
) else (
    echo ✓ Frontend dependencies already installed
)

cd ..

echo.
echo [5/6] Starting backend server...
start /B "OLMS Backend" cmd /c "cd backend && node server.js"
timeout /t 3 /nobreak >nul

echo.
echo [6/6] Starting frontend server...
set "HOST=0.0.0.0"
set "PORT=3001"
set "BROWSER=none"
start /B "OLMS Frontend" cmd /c "cd frontend && npm start"
set "HOST="
set "PORT="
set "BROWSER="

echo.
echo ========================================================
echo  OLMS System Starting...
echo ========================================================
echo.
echo  Backend API:     http://localhost:5001
echo  Frontend App:    http://localhost:3001  
echo  Admin Login:     admin / admin123456
echo.
echo  The system is starting up...
echo  Your browser will open automatically in a few seconds.
echo.
echo  Press any key to open the application now, or
echo  wait 15 seconds for automatic opening...
echo ========================================================

REM Wait for servers to start, then open browser
timeout /t 15 /nobreak
start http://localhost:3001

echo.
echo OLMS is now running!
echo.
echo To stop the system:
echo 1. Close this window
echo 2. Or press Ctrl+C in the server windows
echo.
pause