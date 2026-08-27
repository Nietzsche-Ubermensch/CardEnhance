"""
CardEnhance — local FastAPI edition.

Launch:  python app.py            (or: uvicorn app:app --port 8000)
Opens:   http://127.0.0.1:8000

Everything runs on this machine: detection (ONNX), rectify, OCR, enhance,
library (SQLite), originals on local disk. No cloud account involved.
"""
from __future__ import annotations

import io
import os
import uuid
import zipfile

import numpy as np
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from PIL import Image
from pydantic import BaseModel

import comps
import db
import ocr
import pipeline

BASE = os.path.dirname(os.path.abspath(__file__))
DATA = os.environ.get("CE_DATA_DIR") or os.path.join(BASE, "data")
ORIGINALS = os.path.join(DATA, "originals")
PROCESSED = os.path.join(DATA, "processed")
os.makedirs(ORIGINALS, exist_ok=True)
os.makedirs(PROCESSED, exist_ok=True)

app = FastAPI(title="CardEnhance (local)")


# ------------------------------------------------------------------ processing

def _save(img: np.ndarray, folder: str, name: str) -> str:
    path = os.path.join(folder, name)
    Image.fromarray(img).save(path, "PNG")
    return os.path.relpath(path, DATA)


def _process_one(source_id: str, filename: str, raw: bytes) -> list[dict]:
    tmp = os.path.join(ORIGINALS, f"{source_id}__{os.path.basename(filename)}")
    with open(tmp, "wb") as f:
        f.write(raw)

    result = pipeline.process_image(tmp)
    out = []
    for card in result["cards"]:
        cid = str(uuid.uuid4())
        rect = card.pop("rectified")
        rel = _save(rect, PROCESSED, f"{cid}.png")

        hints = ocr.parse_filename(filename)
        text = ocr.ocr_card(rect)

        row = {
            "id": cid, "source_id": source_id, "filename": filename,
            "player": text.get("player_guess"), "set_name": None,
            "manufacturer": hints.get("manufacturer"), "year": hints.get("year"),
            "number": None, "parallel": None, "side": None,
            "engine": result["engine"],
            "detector": f'{result["engine"]} {round(card["score"] * 100)}% · {card["geometry_method"]} {round(card["geometry_confidence"] * 100)}%',
            "status": "completed",
            "original_path": os.path.relpath(tmp, DATA),
            "rectified_path": rel,
            "ocr_text": text.get("text", ""),
        }
        db.save_card(row)
        out.append({**row, "box": card["box"], "quad": card["quad"],
                    "source_width": result["width"], "source_height": result["height"]})
    return out


@app.post("/api/process")
async def process(files: list[UploadFile] = File(...)):
    processed: list[dict] = []
    errors: list[dict] = []
    for up in files:
        raw = await up.read()
        name = up.filename or "upload"
        try:
            if name.lower().endswith(".zip"):
                with zipfile.ZipFile(io.BytesIO(raw)) as z:
                    for zi in z.namelist():
                        if zi.lower().endswith((".jpg", ".jpeg", ".png", ".webp")) and not zi.startswith("__MACOSX"):
                            sid = str(uuid.uuid4())
                            processed += _process_one(sid, zi, z.read(zi))
            else:
                sid = str(uuid.uuid4())
                processed += _process_one(sid, name, raw)
        except Exception as e:  # one bad file must not kill the batch
            errors.append({"filename": name, "error": f"{type(e).__name__}: {e}"})
    return {"cards": processed, "errors": errors}


# ------------------------------------------------------------------ library

@app.get("/api/cards")
def list_cards():
    return {"cards": db.list_cards()}


@app.get("/api/cards/{card_id}")
def get_card(card_id: str):
    row = db.get_card(card_id)
    if not row:
        raise HTTPException(404, "card not found")
    return row


class Patch(BaseModel):
    player: str | None = None
    set_name: str | None = None
    manufacturer: str | None = None
    year: int | None = None
    number: str | None = None
    parallel: str | None = None
    side: str | None = None


@app.patch("/api/cards/{card_id}")
def patch_card(card_id: str, patch: Patch):
    row = db.update_card(card_id, patch.model_dump(exclude_none=True))
    if not row:
        raise HTTPException(404, "card not found")
    return row


@app.get("/api/audit")
def audit():
    return {"rows": db.list_audit()}


@app.get("/api/status")
def status():
    return {**db.stats(), "ocr": "ready" if ocr.ocr_available() else "install tesseract for OCR"}


# ------------------------------------------------------------------ enhance

@app.post("/api/cards/{card_id}/upscale")
def upscale_card(card_id: str, factor: int = 2):
    import enhance
    row = db.get_card(card_id)
    if not row or not row.get("rectified_path"):
        raise HTTPException(404, "card not found")
    src = np.asarray(Image.open(os.path.join(DATA, row["rectified_path"])).convert("RGB"), dtype=np.uint8)
    up = enhance.upscale(src, factor=factor)
    rel = _save(up, PROCESSED, f"{card_id}-x{factor}.png")
    db.set_enhanced(card_id, rel)
    db.audit("card.upscaled", "card", card_id, {"factor": factor})
    return {"ok": True, "enhanced_path": rel}


@app.post("/api/cards/{card_id}/descratch")
def descratch_card(card_id: str, strength: str = "medium"):
    import enhance
    row = db.get_card(card_id)
    if not row or not row.get("rectified_path"):
        raise HTTPException(404, "card not found")
    src_path = row.get("enhanced_path") or row["rectified_path"]
    src = np.asarray(Image.open(os.path.join(DATA, src_path)).convert("RGB"), dtype=np.uint8)
    out = enhance.descratch(src, strength)
    rel = _save(out, PROCESSED, f"{card_id}-clean.png")
    db.set_enhanced(card_id, rel)
    db.audit("card.descratched", "card", card_id, {"strength": strength})
    return {"ok": True, "enhanced_path": rel}


# ------------------------------------------------------------------ comps

@app.get("/api/comps")
def market_comps(q: str):
    sold = comps.ebay_sold(q)
    sold["pricecharting"] = comps.pricecharting_link(q)
    return sold


# ------------------------------------------------------------------ static

app.mount("/files", StaticFiles(directory=DATA), name="files")
app.mount("/", StaticFiles(directory=os.path.join(BASE, "static"), html=True), name="app")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=int(os.environ.get("PORT", "8000")))
