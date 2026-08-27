# CardEnhance — Local (FastAPI)

Your card suite, running **on your machine**. No cloud account, no workers.dev,
nothing public. Scans, models, database and originals all live in this folder.

## Launch

**macOS / Linux**

```bash
bash run.sh
```

**Windows**

```bat
run.bat
```

Then open **http://127.0.0.1:8000**

First run creates a virtualenv and installs dependencies (a few minutes).
After that it starts in seconds. Stop with `Ctrl+C`.

> Already have Python ≥3.10 and prefer to do it manually?
> `pip install -r requirements.txt && python app.py`
>
> **Cloned from the CardEnhance repo?** `local/` ships code only — `run.sh` /
> `run.bat` automatically pull the ONNX models and tessdata from
> `../public/models` and `../public/tess` on first run. The standalone zip
> bundles them, no repo needed.

## What it does

- **Studio** — drop one scan, many, or a ZIP. Each card is detected
  (card-det ONNX → COCO YOLO fallback → full-frame for card-shaped photos),
  perspective-corrected and rectified to standard card aspect (2.5″×3.5″).
- **OCR** — reads the card; filename hints (`Year-Manufacturer-Card-####.jpg`)
  fill manufacturer/year. All fields editable, saved to a local SQLite library.
- **Enhance** — 2×/4× Real-ESRGAN upscale and scratch/dust cleanup, one click.
- **Market comps** — per card: live eBay **sold** low/median/high plus
  PriceCharting link. Fetched from your own connection, so no datacenter blocks.
- **Library** — searchable grid of every processed card; click to edit,
  re-enhance or download.

## OCR prerequisite (optional)

Everything works without it except text recognition. Install the tesseract
binary and restart:

- macOS: `brew install tesseract`
- Ubuntu/Debian: `sudo apt install tesseract-ocr`
- Windows: installer from <https://github.com/UB-Mannheim/tesseract/wiki>

## Where things live

```
data/originals/     your uploaded scans
data/processed/     rectified + enhanced cards (PNG)
data/cardenhance.db SQLite library
models/             ONNX models (card detector, YOLO, Real-ESRGAN)
```

Back up the `data/` folder and you back up everything.

## Notes

- Binds to `127.0.0.1` only — not reachable from other machines.
- Set `PORT=9000` (env) to change the port.
- Set `CE_DATA_DIR=/path/to/folder` to store originals/processed/db elsewhere.
- Upscaling runs on CPU: expect ~1–2 min for 2×, ~3–6 min for 4× on a
  full card. The x4 canvas is capped at 10240 px on the long side.
- eBay comps come from your own connection; if eBay shows a captcha the
  panel degrades to direct links — no crash.
