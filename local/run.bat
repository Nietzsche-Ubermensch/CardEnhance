@echo off
REM CardEnhance local - one-command launcher (Windows)
cd /d "%~dp0"

if not exist .venv (
  echo [cardenhance] creating virtualenv...
  py -3 -m venv .venv 2>nul || python -m venv .venv
)
call .venv\Scripts\activate.bat

echo [cardenhance] installing dependencies (first run takes a few minutes)...
python -m pip install --quiet --upgrade pip
python -m pip install --quiet -r requirements.txt

REM Repo-clone convenience: pull models/tessdata from the web app's public assets
if not exist models\card-det.onnx if exist ..\public\models\card-det.onnx (
  echo [cardenhance] copying models from ..\public\models...
  mkdir models 2>nul
  copy /b ..\public\models\*.onnx models\ >nul
)
if not exist tessdata\eng.traineddata if exist ..\public\tess\eng.traineddata.gz (
  echo [cardenhance] unpacking tessdata...
  mkdir tessdata 2>nul
  python -c "import gzip, shutil; shutil.copyfileobj(gzip.open(r'../public/tess/eng.traineddata.gz','rb'), open(r'tessdata/eng.traineddata','wb'))"
)

echo.
echo   CardEnhance -^> http://127.0.0.1:8000
echo.
python app.py
