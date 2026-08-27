#!/usr/bin/env bash
# CardEnhance local — one-command launcher (macOS / Linux)
set -e
cd "$(dirname "$0")"

PY=python3
command -v python3 >/dev/null 2>&1 || PY=python

if [ ! -d .venv ]; then
  echo "[cardenhance] creating virtualenv…"
  "$PY" -m venv .venv
fi
# shellcheck disable=SC1091
source .venv/bin/activate

echo "[cardenhance] installing dependencies (first run takes a few minutes)…"
pip install --quiet --upgrade pip
pip install --quiet -r requirements.txt

# Repo-clone convenience: models/tessdata ship in the web app's public assets;
# copy them across if this folder doesn't have its own (zip users already do).
if [ ! -f models/card-det.onnx ] && [ -f ../public/models/card-det.onnx ]; then
  echo "[cardenhance] copying models from ../public/models…"
  mkdir -p models && cp ../public/models/*.onnx models/
fi
if [ ! -f tessdata/eng.traineddata ] && [ -f ../public/tess/eng.traineddata.gz ]; then
  echo "[cardenhance] unpacking tessdata…"
  mkdir -p tessdata && gunzip -c ../public/tess/eng.traineddata.gz > tessdata/eng.traineddata
fi

echo ""
echo "  ⚡ CardEnhance → http://127.0.0.1:8000"
echo ""
exec python app.py
