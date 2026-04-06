@echo off
setlocal EnableDelayedExpansion

if not exist ".env" (
    echo .env not found. Please run install.bat first.
    pause
    exit /b 1
)

REM Load .env (skip comment lines starting with #)
for /f "usebackq eol=# tokens=1,2 delims==" %%a in (".env") do set "%%a=%%b"

echo.
echo  Coatl Image Lib
echo  ---------------
echo  API : http://127.0.0.1:!API_PORT!
echo  UI  : http://127.0.0.1:!UI_PORT!
echo.

REM Launch Python API in new window
start "Coatl API" cmd /k "cd /d %~dp0 && call .venv\Scripts\activate && set ORT_PROVIDER=!ORT_PROVIDER! && uvicorn app.main:app --host 127.0.0.1 --port !API_PORT!"

REM Wait for API to initialise
timeout /t 3 /nobreak >nul

REM Launch Node UI + Vite dev server in new window (npm run dev runs both via concurrently)
start "Coatl UI" cmd /k "cd /d %~dp0\ui && npm run dev"

REM Wait then open browser
timeout /t 4 /nobreak >nul
start "" http://127.0.0.1:!UI_PORT!
