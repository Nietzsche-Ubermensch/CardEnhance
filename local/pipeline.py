"""
CardEnhance detection/geometry pipeline — Python port of the (fixed) TS logic.

Faithful to src/lib/yolo.ts (post person-label fix), detect-sheet.ts and
geometry.ts: same letterbox, decoders, CONF/IOU, fitness gates, fullframe
fallback, recoverQuad (edge-bbox quad -> minAreaRect -> axis_box) and
bilinear warpPerspective. Model labels are honest here: COCO class 0 stays
"person" and can never be selected as a card.
"""
from __future__ import annotations

import os
import threading

import numpy as np
from PIL import Image, ImageOps

INPUT = 640
CONF = 0.15
IOU = 0.45
PERSON = 0
CARD_CLASSES = {62, 63, 64, 65, 66, 67, 73, 26, 28, 39, 41, 45, 46, 74, 75}

_MODELS = os.path.join(os.path.dirname(__file__), "models")
_sessions: dict = {}
_lock = threading.Lock()


def _session(name: str):
    import onnxruntime as ort  # lazy: lets the app boot without ORT for --help etc.

    with _lock:
        if name not in _sessions:
            path = os.path.join(_MODELS, name)
            _sessions[name] = ort.InferenceSession(path, providers=["CPUExecutionProvider"])
        return _sessions[name]


def load_image(path: str) -> np.ndarray:
    """RGB uint8, EXIF orientation applied (what a browser shows)."""
    img = ImageOps.exif_transpose(Image.open(path)).convert("RGB")
    return np.asarray(img, dtype=np.uint8)


def letterbox(img: np.ndarray):
    h, w = img.shape[:2]
    scale = INPUT / max(w, h)
    nw = max(1, round(w * scale))
    nh = max(1, round(h * scale))
    resized = np.asarray(Image.fromarray(img).resize((nw, nh), Image.BILINEAR), dtype=np.uint8)
    canvas = np.full((INPUT, INPUT, 3), 114, dtype=np.uint8)
    canvas[:nh, :nw] = resized
    t = canvas.astype(np.float32) / 255.0
    return np.ascontiguousarray(np.transpose(t, (2, 0, 1))[None, ...]), scale


def _iou(a, b):
    x1 = max(a["x"], b["x"]); y1 = max(a["y"], b["y"])
    x2 = min(a["x"] + a["w"], b["x"] + b["w"]); y2 = min(a["y"] + a["h"], b["y"] + b["h"])
    inter = max(0.0, x2 - x1) * max(0.0, y2 - y1)
    union = a["w"] * a["h"] + b["w"] * b["h"] - inter
    return inter / union if union > 0 else 0.0


def _nms(boxes, limit=16):
    keep = []
    for box in sorted(boxes, key=lambda b: -b["score"]):
        if len(keep) >= limit:
            break
        if all(_iou(k, box) < IOU for k in keep):
            keep.append(box)
    return keep


def _push(boxes, x1, y1, x2, y2, score, cls, scale, W, H, is_card_model):
    x = max(0.0, min(x1, x2) / scale)
    y = max(0.0, min(y1, y2) / scale)
    w = min(W - x, abs(x2 - x1) / scale)
    h = min(H - y, abs(y2 - y1) / scale)
    if w < 8 or h < 8:
        return
    # THE FIX: only the fine-tuned card model may claim the "card" label.
    label = "card" if is_card_model else f"coco:{cls}"
    boxes.append(dict(x=x, y=y, w=w, h=h, score=float(score), classId=int(cls), label=label))


def _decode_yolo8(data, dims, scale, W, H, is_card_model):
    boxes = []
    if len(dims) == 3 and 4 < dims[1] < 200 and dims[2] > dims[1]:
        channels, preds, stride, layout = dims[1], dims[2], dims[2], "cfirst"
    elif len(dims) == 3 and 4 < dims[2] < 200:
        channels, preds, stride, layout = dims[2], dims[1], dims[2], "clast"
    else:
        return boxes
    ncls = channels - 4
    at = (lambda c, i: data[c * stride + i]) if layout == "cfirst" else (lambda c, i: data[i * stride + c])
    for i in range(preds):
        best, cls = 0.0, 0
        for c in range(ncls):
            s = float(at(4 + c, i))
            if s > best:
                best, cls = s, c
        if best < CONF:
            continue
        cx, cy, bw, bh = (float(at(k, i)) for k in range(4))
        _push(boxes, cx - bw / 2, cy - bh / 2, cx + bw / 2, cy + bh / 2, best, cls, scale, W, H, is_card_model)
    return _nms(boxes)


def _decode_yolo26(data, dims, scale, W, H, is_card_model):
    boxes = []
    if not (len(dims) == 3 and dims[2] == 6):
        return boxes
    n, stride = dims[1], 6
    for i in range(n):
        score = float(data[i * stride + 4])
        if score < CONF:
            continue
        cls = int(round(float(data[i * stride + 5])))
        _push(boxes, *(float(data[i * stride + c]) for c in range(4)), score, cls, scale, W, H, is_card_model)
    return boxes


def _fitness(box, W, H, card_only):
    if not card_only and box["classId"] == PERSON and box["label"] != "card":
        return 0.0
    area = (box["w"] * box["h"]) / (W * H)
    if card_only and area < 0.12:
        return 0.0
    if area < 0.006 or area > 0.95:
        return 0.0
    aspect = box["w"] / max(1.0, box["h"])
    portrait = 0.48 <= aspect <= 0.92
    landscape = 1.08 <= aspect <= 2.2
    if not (portrait or landscape):
        return 0.0
    score = box["score"]
    if card_only or box["label"] == "card" or box["classId"] in CARD_CLASSES:
        score += 0.28
    else:
        score += 0.08
    if portrait:
        score += 0.08
    return score + min(0.18, area * 0.4)


def _run(model: str, img: np.ndarray):
    sess = _session(model)
    tensor, scale = letterbox(img)
    out = sess.run(None, {sess.get_inputs()[0].name: tensor})[0]
    return out, scale


def detect_boxes(img: np.ndarray):
    """Return (boxes, engine). Mirrors detectCardBoxes + detectCards fallback chain."""
    H, W = img.shape[:2]

    kept: list = []
    engine = None
    try:
        out, scale = _run("card-det.onnx", img)
        raw = _decode_yolo8(out.ravel(), list(out.shape), scale, W, H, is_card_model=True)
        scored = [b for b in raw if _fitness(b, W, H, card_only=True) > 0.22]
        kept = _nms(sorted(scored, key=lambda b: -_fitness(b, W, H, True)), 32)
        engine = "card"
    except Exception:
        kept = []

    if not kept:
        try:
            out, scale = _run("yolo26n.onnx", img)
            raw = _decode_yolo26(out.ravel(), list(out.shape), scale, W, H, is_card_model=False)
            scored = [b for b in raw if _fitness(b, W, H, card_only=False) > 0.22]
            kept = _nms(sorted(scored, key=lambda b: -_fitness(b, W, H, False)), 32)
            engine = "yolo26"
        except Exception:
            kept = []

    aspect = W / H
    already = (0.58 <= aspect <= 0.85) or (1.18 <= aspect <= 1.72)

    if already and len(kept) > 1:
        kept = sorted(kept, key=lambda b: -(b["w"] * b["h"]))[:1]

    if not kept:
        if already:
            kept = [dict(x=0.0, y=0.0, w=float(W), h=float(H), score=0.7, classId=-1, label="fullframe")]
            engine = "fullframe"
        else:
            kept = [dict(x=0.0, y=0.0, w=float(W), h=float(H), score=0.4, classId=-1, label="fullframe")]
            engine = "fullframe"

    boxes = sorted(kept, key=lambda b: (b["y"], b["x"]))
    return boxes, engine


# ---------------------------------------------------------------- geometry (port of geometry.ts)

def _crop(img, x0, y0, x1, y1):
    return img[int(y0):int(y1), int(x0):int(y1) if False else int(x1)]


def _luma_small(img, target):
    H, W = img.shape[:2]
    scale = min(1.0, target / max(W, H))
    sw, sh = max(12, round(W * scale)), max(12, round(H * scale))
    small = np.asarray(Image.fromarray(img).resize((sw, sh), Image.BILINEAR), dtype=np.float32)
    luma = 0.2126 * small[..., 0] + 0.7152 * small[..., 1] + 0.0722 * small[..., 2]
    return luma, scale


def _order_corners(pts):
    pts = sorted(pts, key=lambda p: (p[1], p[0]))
    top = sorted(pts[:2], key=lambda p: p[0])
    bottom = sorted(pts[-2:], key=lambda p: p[0])
    return [top[0], top[1], bottom[1], bottom[0]]  # tl, tr, br, bl


def _find_quad(region):
    luma, scale = _luma_small(region, 140)
    sh, sw = luma.shape
    gx = np.zeros_like(luma); gy = np.zeros_like(luma)
    gx[1:-1, 1:-1] = luma[1:-1, 2:] - luma[1:-1, :-2]
    gy[1:-1, 1:-1] = luma[2:, 1:-1] - luma[:-2, 1:-1]
    mag = np.hypot(gx, gy)
    ys, xs = np.nonzero(mag > 28)
    if len(xs) < 20:
        return None
    minx, maxx, miny, maxy = xs.min(), xs.max(), ys.min(), ys.max()
    pts = np.stack([xs, ys], axis=1)

    def nearest(tx, ty):
        d = (pts[:, 0] - tx) ** 2 + (pts[:, 1] - ty) ** 2
        p = pts[int(np.argmin(d))]
        return (float(p[0]), float(p[1]))

    quad = _order_corners([nearest(minx, miny), nearest(maxx, miny), nearest(maxx, maxy), nearest(minx, maxy)])
    area = abs(quad[2][0] - quad[0][0]) * abs(quad[2][1] - quad[0][1])
    if area < sw * sh * 0.2:
        return None
    return [(p[0] / scale, p[1] / scale) for p in quad]


def _min_area_rect(region):
    luma, scale = _luma_small(region, 120)
    sh, sw = luma.shape
    gx = np.zeros_like(luma); gy = np.zeros_like(luma)
    gx[:, :-1] = np.abs(luma[:, 1:] - luma[:, :-1])
    gy[:-1, :] = np.abs(luma[1:, :] - luma[:-1, :])
    edge = np.hypot(gx, gy) > 18
    ys, xs = np.nonzero(edge)
    if len(xs) < 16:
        return None
    mx, my = xs.mean(), ys.mean()
    dx, dy = xs - mx, ys - my
    cxx, cxy, cyy = (dx * dx).mean(), (dx * dy).mean(), (dy * dy).mean()
    trace = cxx + cyy
    det = cxx * cyy - cxy * cxy
    disc = np.sqrt(max(0.0, trace * trace / 4 - det))
    l1 = trace / 2 + disc
    vx, vy = cxy, l1 - cxx
    vlen = np.hypot(vx, vy) or 1.0
    vx, vy = vx / vlen, vy / vlen
    ux, uy = -vy, vx
    u = dx * ux + dy * uy
    v = dx * vx + dy * vy
    corners = [
        (mx + ux * u.min() + vx * v.min(), my + uy * u.min() + vy * v.min()),
        (mx + ux * u.max() + vx * v.min(), my + uy * u.max() + vy * v.min()),
        (mx + ux * u.max() + vx * v.max(), my + uy * u.max() + vy * v.max()),
        (mx + ux * u.min() + vx * v.max(), my + uy * u.min() + vy * v.max()),
    ]
    return _order_corners([(c[0] / scale, c[1] / scale) for c in corners])


def _validate_quad(quad, W, H):
    tl, tr, br, bl = quad
    top = np.hypot(tr[0] - tl[0], tr[1] - tl[1])
    bottom = np.hypot(br[0] - bl[0], br[1] - bl[1])
    left = np.hypot(bl[0] - tl[0], bl[1] - tl[1])
    right = np.hypot(br[0] - tr[0], br[1] - tr[1])
    if min(top, bottom, left, right) < 16:
        return False, 0.0
    ratio = ((top + bottom) / 2) / max(1.0, (left + right) / 2)
    if not (0.5 <= ratio <= 0.95 or 1.05 <= ratio <= 2.1):
        return False, 0.2
    inside = all(-8 <= p[0] <= W + 8 and -8 <= p[1] <= H + 8 for p in quad)
    return inside, (0.82 if inside else 0.4)


def _snap_to_frame(quad, W, H, thresh=0.07):
    """Full-bleed scans: edge detection lands a few % INSIDE the true card edge,
    which clips logos/nameplates at the frame. When a detected corner sits within
    `thresh` of a frame corner, the card reaches the frame there — reclaim it."""
    corners = [(0.0, 0.0), (float(W), 0.0), (float(W), float(H)), (0.0, float(H))]
    out = []
    snapped = [False] * 4
    for i, (px, py) in enumerate(quad):
        best, bd, bi = (px, py), float("inf"), -1
        for ci, (cx, cy) in enumerate(corners):
            d = ((px - cx) / W) ** 2 + ((py - cy) / H) ** 2
            if d < bd:
                bd, best, bi = d, (cx, cy), ci
        if bd ** 0.5 <= thresh:
            out.append(best)
            snapped[i] = True
        else:
            out.append((px, py))
    # full-bleed: 3 corners on 3 different frame corners -> the 4th is the 4th corner
    if sum(snapped) == 3 and len({out[i] for i in range(4) if snapped[i]}) == 3:
        missing = [c for c in corners if c not in out]
        idx = snapped.index(False)
        if missing:
            out[idx] = missing[0]
    return out


def recover_quad(img, box):
    H, W = img.shape[:2]
    padX, padY = box["w"] * 0.06, box["h"] * 0.06
    x0, y0 = max(0.0, box["x"] - padX), max(0.0, box["y"] - padY)
    x1, y1 = min(float(W), box["x"] + box["w"] + padX), min(float(H), box["y"] + box["h"] + padY)
    region = img[int(y0):int(y1), int(x0):int(x1)]

    found = _find_quad(region)
    if found:
        quad = _snap_to_frame([(p[0] + x0, p[1] + y0) for p in found], W, H)
        ok, conf = _validate_quad(quad, W, H)
        if ok:
            return quad, "quad", conf

    obb = _min_area_rect(region)
    if obb:
        quad = _snap_to_frame([(p[0] + x0, p[1] + y0) for p in obb], W, H)
        ok, conf = _validate_quad(quad, W, H)
        if ok:
            return quad, "minAreaRect", min(0.62, conf)

    return [(x0, y0), (x1, y0), (x1, y1), (x0, y1)], "axis_box", 0.35


def warp_perspective(img, quad, dw, dh):
    """Bilinear warp of quad -> (dw, dh), port of geometry.ts warpPerspective."""
    dst = [(0, 0), (dw - 1, 0), (dw - 1, dh - 1), (0, dh - 1)]
    import cv2
    src = np.array(quad, dtype=np.float32)
    dst_a = np.array(dst, dtype=np.float32)
    M = cv2.getPerspectiveTransform(src, dst_a)
    out = cv2.warpPerspective(img, M, (dw, dh), flags=cv2.INTER_LINEAR)
    return out


def rectify(img, quad):
    tl, tr, br, bl = quad
    avg_w = (np.hypot(tr[0] - tl[0], tr[1] - tl[1]) + np.hypot(br[0] - bl[0], br[1] - bl[1])) / 2
    avg_h = (np.hypot(bl[0] - tl[0], bl[1] - tl[1]) + np.hypot(br[0] - tr[0], br[1] - tr[1])) / 2
    dw, dh = int(round(avg_w)), int(round(avg_h))
    aspect = dw / max(1, dh)
    if 0.55 < aspect < 0.9:
        dh = int(round(dw / 0.714))
    dw = max(80, min(1800, dw))
    dh = max(110, min(2500, dh))
    return warp_perspective(img, quad, dw, dh)


def process_image(path: str):
    """Full chain: load (EXIF-aware) -> detect -> per-card quad -> rectify."""
    img = load_image(path)
    H, W = img.shape[:2]
    boxes, engine = detect_boxes(img)
    cards = []
    for i, box in enumerate(boxes):
        quad, method, conf = recover_quad(img, box)
        rect = rectify(img, quad)
        cards.append({
            "index": i,
            "box": {"x": box["x"], "y": box["y"], "w": box["w"], "h": box["h"]},
            "score": box["score"],
            "quad": quad,
            "geometry_method": method,
            "geometry_confidence": conf,
            "rectified": rect,
        })
    return {"width": W, "height": H, "engine": engine, "cards": cards, "source": img}
