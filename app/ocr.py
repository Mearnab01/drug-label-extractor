"""OCR stage: PP-OCR models (the same family PaddleOCR uses) served through RapidOCR/ONNX."""
import io
import os
import threading

import numpy as np
from PIL import Image, ImageOps

MAX_SIDE = 2000        # downscale huge photos, OCR time grows quickly with size
MIN_CONF = float(os.getenv("OCR_MIN_CONF", "0.5"))  # drop low-confidence noise

_engine = None
_lock = threading.Lock()


def _get_engine():
    global _engine
    if _engine is None:
        from rapidocr import RapidOCR
        _engine = RapidOCR()
    return _engine


def load_image(data: bytes) -> Image.Image:
    img = Image.open(io.BytesIO(data))
    img = ImageOps.exif_transpose(img).convert("RGB")
    if max(img.size) > MAX_SIDE:
        img.thumbnail((MAX_SIDE, MAX_SIDE))
    return img


def run_ocr(img: Image.Image) -> list[dict]:
    """Return text lines in detector order with box, text and confidence."""
    with _lock:
        res = _get_engine()(np.array(img)[:, :, ::-1])  # RGB -> BGR
    if res is None or res.boxes is None or res.txts is None:
        return []

    w, h = img.size
    lines = []
    for box, text, score in zip(res.boxes, res.txts, res.scores):
        text = (text or "").strip()
        if not text or float(score) < MIN_CONF:
            continue
        pts = [[round(float(x), 1), round(float(y), 1)] for x, y in box]
        xs, ys = [p[0] for p in pts], [p[1] for p in pts]
        lines.append({
            "id": len(lines),
            "text": text,
            "score": round(float(score), 3),
            "box": pts,
            "x": round(min(xs) / w, 3),   # normalised top-left, extra layout context for the LLM
            "y": round(min(ys) / h, 3),
        })
    return lines
