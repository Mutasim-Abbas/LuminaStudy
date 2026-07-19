@echo off
setlocal
cd /d "%~dp0"

echo ============================================
echo    Lumina Study
echo ============================================
echo.

REM --- Build the website if it hasn't been built yet (first run only) ---
if not exist "%~dp0dist\index.html" (
  echo First run: building the website...
  call npm run build
)

REM --- Build the server if it hasn't been compiled yet (first run only) ---
if not exist "%~dp0server\dist\index.js" (
  echo First run: building the server...
  pushd "%~dp0server"
  call npm run build
  popd
)

REM --- Start the compiled server (boots in ~1s) in its own window ---
start "Lumina Study - keep me open" cmd /k "cd /d %~dp0server && npm start"

REM --- Wait until the server actually responds, THEN open the browser ---
echo Waiting for the server to be ready...
set /a tries=0
:waitloop
curl -s -o nul http://localhost:3001/api/health
if "%errorlevel%"=="0" goto ready
set /a tries+=1
if %tries% geq 40 goto failed
timeout /t 1 >nul
goto waitloop

:ready
echo.
echo Server is up. Opening the app...
start http://localhost:3001
echo.
echo    The app is open at:  http://localhost:3001
echo    Keep the "Lumina Study" window OPEN while you use it.
goto end

:failed
echo.
echo The server did not start. Look at the "Lumina Study" window
echo for a red error message and send it to Claude.

:end
echo.
pause
