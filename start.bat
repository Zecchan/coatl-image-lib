@echo off
setlocal

echo Starting coatl-image-lib API...
call .venv\Scripts\activate

REM Load GPU provider set during install
if exist ".env.bat" call .env.bat

uvicorn app.main:app --host 127.0.0.1 --port 8000
