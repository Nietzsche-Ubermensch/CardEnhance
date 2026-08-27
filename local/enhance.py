"""Enhancement stage: RealESR x4v3 upscale (tiled) + scratch cleanup."""
from __future__ import annotations

import os

import numpy as np
from PIL import Image

_MODELS = os.path.join(os.path.dirname(__file__), "models")
_esr_session = None


def _esr():
    global _esr_session
    if _esr_session is None:
        import onnxruntime as ort
        _esr_session = ort.InferenceSession(
            os.path.join(_MODELS, "realesr-general-x4v3.onnx"),
            providers=["CPUExecutionProvider"],
        )
    return _esr_session


_MAX_OUT_SIDE = 10240  # cap x4 canvas so big scans can't exhaust RAM


def upscale(img: np.ndarray, factor: int = 2, tile: int = 192, overlap: int = 16) -> np.ndarray:
    """Tiled RealESR x4 upscale; factor 2 downsamples the x4 output.

    Memory-safe: overlap-add in float32, in-place divide, band-wise uint8
    conversion, and a hard cap on the output canvas.
    """
    sess = _esr()
    inp_name = sess.get_inputs()[0].name
    h, w = img.shape[:2]
    scale = 4

    # keep the x4 canvas under the cap (a 12MP photo would otherwise become 192MP)
    if max(h, w) * scale > _MAX_OUT_SIDE:
        shrink = _MAX_OUT_SIDE / (max(h, w) * scale)
        nh, nw = max(1, int(h * shrink)), max(1, int(w * shrink))
        img = np.asarray(Image.fromarray(img).resize((nw, nh), Image.LANCZOS), dtype=np.uint8)
        h, w = img.shape[:2]

    out = np.zeros((h * scale, w * scale, 3), dtype=np.float32)
    weight = np.zeros((h * scale, w * scale, 1), dtype=np.float32)

    step = tile - overlap
    for y in range(0, h, step):
        for x in range(0, w, step):
            patch = img[y:y + tile, x:x + tile].astype(np.float32) / 255.0
            ph, pw = patch.shape[:2]
            tensor = np.ascontiguousarray(np.transpose(patch, (2, 0, 1))[None, ...])
            res = sess.run(None, {inp_name: tensor})[0][0]
            res = np.clip(np.transpose(res, (1, 2, 0)) * 255.0, 0, 255)
            oy, ox = y * scale, x * scale
            oh, ow = ph * scale, pw * scale
            out[oy:oy + oh, ox:ox + ow] += res
            weight[oy:oy + oh, ox:ox + ow] += 1.0

    np.divide(out, weight, out=out, where=weight > 0)
    del weight

    up = np.empty(out.shape, dtype=np.uint8)
    band = 256  # convert in bands: no full-size float->uint8 temp
    for y in range(0, up.shape[0], band):
        np.clip(out[y:y + band], 0, 255, out=out[y:y + band])
        up[y:y + band] = out[y:y + band].astype(np.uint8)
    del out

    if factor and factor != scale:
        nh, nw = int(h * factor), int(w * factor)
        up = np.asarray(Image.fromarray(up).resize((nw, nh), Image.LANCZOS), dtype=np.uint8)
    return up


def descratch(img: np.ndarray, strength: str = "medium") -> np.ndarray:
    """Denoise + inpaint isolated scratch-like outliers (foil-safe: conservative)."""
    import cv2

    h_par = {"light": 3, "medium": 6, "strong": 10}.get(strength, 6)
    den = cv2.fastNlMeansDenoisingColored(img, None, h_par, h_par, 7, 21)

    gray = cv2.cvtColor(den, cv2.COLOR_RGB2GRAY)
    med = cv2.medianBlur(gray, 5)
    diff = cv2.absdiff(gray, med)
    mask = (diff > 28).astype(np.uint8) * 255
    mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, np.ones((2, 2), np.uint8))
    if int((mask > 0).sum()) < 32:
        return den
    return cv2.inpaint(den, mask, 3, cv2.INPAINT_TELEA)
