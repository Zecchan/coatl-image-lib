@echo off
setlocal EnableDelayedExpansion

REM Check if .venv exists
if exist ".venv" (
    echo Existing virtual environment ^(.venv^) found.
    set /p confirm="Do you want to delete and recreate it? (y/N): "

    REM Normalize input
    if /I not "!confirm:~0,1!"=="y" (
        echo Aborting setup.
        exit /b 0
    )

    echo Deleting .venv...
    rmdir /s /q .venv
)

echo Creating virtual environment...
python -m venv .venv

echo Activating virtual environment...
call .venv\Scripts\activate

echo Installing dependencies...
pip install --upgrade pip
pip install fastapi uvicorn pillow imagehash numpy torch torchvision open_clip_torch transformers onnxruntime pandas huggingface_hub

echo.
echo Setup complete!

set /p startNow="Do you want to start the service now? (Y/n): "
if /I "%startNow%"=="n" (
    echo You can start the service later by running start.bat
    pause
    exit /b 0
)

echo.
echo Starting coatl-image-lib API...
uvicorn app.main:app --host 127.0.0.1 --port 8000