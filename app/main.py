import time
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

load_dotenv()

from . import extract as ex 
from . import ocr  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
SAMPLES = ROOT / "samples"
MAX_BYTES = 8 * 1024 * 1024

app = FastAPI(title="Drug Label Extractor", version="1.0.0")
app.mount("/static", StaticFiles(directory=ROOT / "static"), name="static")
app.mount("/samples", StaticFiles(directory=SAMPLES), name="samples")


def run_pipeline(data: bytes) -> dict:
    try:
        img = ocr.load_image(data)
    except Exception:
        raise HTTPException(400, "Could not read that file as an image.")

    t0 = time.perf_counter()
    lines = ocr.run_ocr(img)
    t1 = time.perf_counter()
    result = ex.extract(lines)
    t2 = time.perf_counter()

    avg = sum(l["score"] for l in lines) / len(lines) if lines else 0
    return {
        "image": {"width": img.width, "height": img.height},
        "lines": lines,
        **result,
        "stats": {
            "lines": len(lines),
            "avg_ocr_confidence": round(avg, 3),
            "ocr_ms": round((t1 - t0) * 1000),
            "extract_ms": round((t2 - t1) * 1000),
        },
    }


@app.get("/")
def index():
    return FileResponse(ROOT / "static" / "index.html")


@app.get("/api/health")
def health():
    return {"status": "ok", "llm_enabled": ex.llm_enabled(), "model": ex.MODEL}


@app.get("/api/samples")
def samples():
    return [{"name": p.name, "url": f"/samples/{p.name}"} for p in sorted(SAMPLES.glob("*.jpg"))]


@app.post("/api/extract")
def extract_upload(file: UploadFile = File(...)):
    if not (file.content_type or "").startswith("image/"):
        raise HTTPException(415, "Please upload an image (JPG, PNG or WebP).")
    data = file.file.read(MAX_BYTES + 1)
    if len(data) > MAX_BYTES:
        raise HTTPException(413, "Image is larger than 8 MB.")
    return run_pipeline(data)


@app.post("/api/extract/sample/{name}")
def extract_sample(name: str):
    path = SAMPLES / name
    if name not in {p.name for p in SAMPLES.glob("*.jpg")}:
        raise HTTPException(404, "Unknown sample.")
    return run_pipeline(path.read_bytes())
