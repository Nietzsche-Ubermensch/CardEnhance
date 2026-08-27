"""OCR stage: filename parse + tesseract (graceful when the binary is absent)."""
from __future__ import annotations

import os
import re

import numpy as np

_TESSDATA = os.path.join(os.path.dirname(__file__), "tessdata")


def parse_filename(name: str) -> dict:
    """Year-Manfucturer-Card-0196.jpg -> year/manufacturer hints."""
    out = {"year": None, "manufacturer": None}
    stem = os.path.splitext(os.path.basename(name))[0]
    m = re.match(r"^(\d{4})[-_ ](.+?)[-_ ]Card[-_ ]\d+$", stem, re.IGNORECASE)
    if m:
        out["year"] = int(m.group(1))
        out["manufacturer"] = m.group(2).replace("-", " ").replace("_", " ").strip()
    return out


def ocr_available() -> bool:
    try:
        import pytesseract  # noqa: F401
        import shutil
        return shutil.which("tesseract") is not None
    except Exception:
        return False


def ocr_card(img: np.ndarray) -> dict:
    """Full-card OCR; returns raw text + best-guess player line."""
    if not ocr_available():
        return {"text": "", "player_guess": None, "engine": "unavailable"}
    import pytesseract
    from PIL import Image

    os.environ.setdefault("TESSDATA_PREFIX", _TESSDATA)
    pil = Image.fromarray(img)
    # psm 6 (uniform block): psm 3 auto-segmentation finds zero text on busy card art
    cfg = "--psm 6"
    text = pytesseract.image_to_string(pil, config=cfg)
    lines = [l.strip() for l in text.splitlines() if l.strip()]
    # nameplate sits at the bottom: prefer ALL-CAPS-ish lines from the lower third
    h = img.shape[0]
    data = pytesseract.image_to_data(pil, config=cfg, output_type=pytesseract.Output.DICT)
    lower = [
        data["text"][i].strip()
        for i in range(len(data["text"]))
        if data["text"][i].strip()
        and data["top"][i] > h * 0.6
        and len(data["text"][i].strip()) > 2
    ]
    guess = None
    if lower:
        guess = " ".join(lower[:4])
    elif lines:
        guess = max(lines, key=len)[:60]
    return {"text": "\n".join(lines), "player_guess": guess, "engine": "tesseract"}
