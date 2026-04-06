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
pip install fastapi uvicorn pillow imagehash numpy torch torchvision open_clip_torch transformers pandas huggingface_hub onnxscript

echo.
echo Select GPU backend for ONNX Runtime:
echo   [1] DirectML  (AMD / Intel / any Windows GPU) ^<recommended^>
echo   [2] CUDA      (NVIDIA only)
echo   [3] CPU       (no GPU)
echo.
set /p gpuChoice="Enter choice (1/2/3) [default: 1]: "
if "!gpuChoice!"=="" set gpuChoice=1

pip uninstall -y onnxruntime onnxruntime-gpu onnxruntime-directml 2>nul

if "!gpuChoice!"=="2" (
    echo Installing onnxruntime-gpu...
    pip install onnxruntime-gpu
    set ORT_PROVIDER=cuda
) else if "!gpuChoice!"=="3" (
    echo Installing onnxruntime ^(CPU^)...
    pip install onnxruntime
    set ORT_PROVIDER=cpu
) else (
    echo Installing onnxruntime-directml...
    pip install onnxruntime-directml
    set ORT_PROVIDER=dml
)

REM Save provider choice for start.bat to pick up
echo set ORT_PROVIDER=!ORT_PROVIDER!> .env.bat

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