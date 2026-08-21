#!/usr/bin/env python3
"""Auto-label sample cards and train a 1-class YOLO11n detector. CPU-safe."""

from __future__ import annotations

import json
import shutil
import zipfile
from pathlib import Path

import cv2
import numpy as np
from ultralytics import YOLO

ROOT = Path("/workspace")
DATA = ROOT / "data/card-det"
RAW = ROOT / "data/raw-cards"
PROMOTE = ROOT / "models/card-seg/v1"
PUBLIC = ROOT / "public/models/card-det.onnx"
YAML = DATA / "card.yaml"

IMG_EXTS = {".jpg", ".jpeg", ".png", ".webp"}


def collect_images() -> list[Path]:
    RAW.mkdir(parents=True, exist_ok=True)
    zip_path = ROOT / "public/samples/scanner-dump.zip"
    if zip_path.exists():
        with zipfile.ZipFile(zip_path) as z:
            z.extractall(RAW / "dump")
    for src in (ROOT / "public/samples").rglob("*"):
        if src.suffix.lower() in IMG_EXTS and src.is_file():
            dest = RAW / src.name
            if not dest.exists():
                shutil.copy2(src, dest)
    return sorted({p for p in RAW.rglob("*") if p.suffix.lower() in IMG_EXTS})


def card_polygons(img: np.ndarray) -> list[np.ndarray]:
    h, w = img.shape[:2]
    aspect = w / max(1, h)
    already = (0.58 <= aspect <= 0.85) or (1.18 <= aspect <= 1.72)
    if already:
        m = 0.012
        return [
            np.array(
                [
                    [m * w, m * h],
                    [(1 - m) * w, m * h],
                    [(1 - m) * w, (1 - m) * h],
                    [m * w, (1 - m) * h],
                ],
                dtype=np.float32,
            )
        ]
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    blur = cv2.GaussianBlur(gray, (5, 5), 0)
    edges = cv2.Canny(blur, 40, 120)
    edges = cv2.dilate(edges, np.ones((5, 5), np.uint8), iterations=1)
    cnts, _ = cv2.findContours(edges, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    out: list[np.ndarray] = []
    area_img = w * h
    for c in cnts:
        area = cv2.contourArea(c)
        if area < area_img * 0.04 or area > area_img * 0.92:
            continue
        rect = cv2.minAreaRect(c)
        rw, rh = rect[1]
        if rw < 8 or rh < 8:
            continue
        a = min(rw, rh) / max(rw, rh)
        if a < 0.45 or a > 0.92:
            continue
        box = cv2.boxPoints(rect)
        out.append(box.astype(np.float32))
    if not out:
        m = 0.02
        out = [
            np.array(
                [
                    [m * w, m * h],
                    [(1 - m) * w, m * h],
                    [(1 - m) * w, (1 - m) * h],
                    [m * w, (1 - m) * h],
                ],
                dtype=np.float32,
            )
        ]
    return out


def write_label(path: Path, polygons: list[np.ndarray], w: int, h: int) -> None:
    lines = []
    for poly in polygons:
        coords = []
        for x, y in poly:
            coords.append(f"{max(0, min(1, x / w)):.6f}")
            coords.append(f"{max(0, min(1, y / h)):.6f}")
        lines.append("0 " + " ".join(coords))
    path.write_text("\n".join(lines) + "\n")


def build_dataset(images: list[Path]) -> tuple[int, int]:
    for split in ("train", "val"):
        (DATA / "images" / split).mkdir(parents=True, exist_ok=True)
        (DATA / "labels" / split).mkdir(parents=True, exist_ok=True)
    n_train = n_val = 0
    for i, img_path in enumerate(images):
        img = cv2.imread(str(img_path))
        if img is None or img.size == 0:
            print(f"SKIP corrupt {img_path}")
            continue
        h, w = img.shape[:2]
        if w < 32 or h < 32:
            print(f"SKIP tiny {img_path} {w}x{h}")
            continue
        polys = card_polygons(img)
        split = "val" if i % 5 == 0 else "train"
        stem = f"{i:04d}_{img_path.stem}"[:80]
        dest = DATA / "images" / split / f"{stem}.jpg"
        cv2.imwrite(str(dest), img, [int(cv2.IMWRITE_JPEG_QUALITY), 92])
        write_label(DATA / "labels" / split / f"{stem}.txt", polys, w, h)
        if split == "train":
            n_train += 1
        else:
            n_val += 1
    YAML.write_text(
        "\n".join(
            [
                f"path: {DATA}",
                "train: images/train",
                "val: images/val",
                "names:",
                "  0: card",
                "",
            ]
        )
    )
    return n_train, n_val


def main() -> None:
    images = collect_images()
    n_train, n_val = build_dataset(images)
    print(f"dataset train={n_train} val={n_val} sources={len(images)}")
    if n_train < 4:
        raise SystemExit("not enough labeled images")
    model = YOLO("yolo11n.pt")
    results = model.train(
        data=str(YAML),
        epochs=12,
        imgsz=640,
        batch=4,
        device="cpu",
        workers=2,
        patience=6,
        verbose=True,
        project=str(ROOT / "data/runs"),
        name="card-det",
        exist_ok=True,
        hsv_h=0.015,
        hsv_s=0.4,
        hsv_v=0.3,
        degrees=8,
        scale=0.3,
        fliplr=0.0,
        mosaic=0.2,
    )
    metrics = {
        "train": n_train,
        "val": n_val,
        "epochs": 12,
        "imgsz": 640,
        "device": "cpu",
        "model": "yolo11n.pt",
        "class": "card",
        "map50": float(getattr(results.box, "map50", 0) or 0),
        "map": float(getattr(results.box, "map", 0) or 0),
    }
    best = Path(results.save_dir) / "weights" / "best.pt"
    PROMOTE.mkdir(parents=True, exist_ok=True)
    if best.exists():
        shutil.copy2(best, PROMOTE / "best.pt")
        trained = YOLO(str(best))
        trained.export(format="onnx", imgsz=640, simplify=True, opset=12)
        onnx = best.with_suffix(".onnx")
        if onnx.exists():
            shutil.copy2(onnx, PUBLIC)
            shutil.copy2(onnx, PROMOTE / "best.onnx")
            metrics["onnx"] = str(PUBLIC)
            metrics["weights"] = str(PROMOTE / "best.pt")
    (PROMOTE / "metadata.json").write_text(json.dumps(metrics, indent=2))
    print(json.dumps(metrics, indent=2))


if __name__ == "__main__":
    main()
