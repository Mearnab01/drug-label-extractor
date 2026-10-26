# Drug Label Extractor

Upload a photo of a prescription label and get structured, verified data back: drug name, strength,
directions, quantity, refills, dates, pharmacy and Rx number.

Built with **FastAPI**, **PP-OCR** (via RapidOCR/ONNX), **gpt-oss-120b on Groq**, and a dependency-free
HTML/CSS/JS front end.

## What makes it more than OCR plus a prompt

- **Grounded extraction.** The model must cite the OCR line ids behind every value.
- **Hallucination guard.** The backend checks each value against the lines it cites. Supported values are
  marked *Verified*; anything else is marked *Review*. The model is told not to guess drug names, and if it
  does, the check catches it.
- **Click-through traceability.** Hover a field and the exact region on the image lights up.
- **Graceful degradation.** No API key, or the LLM call fails: a regex extractor takes over and the UI says so.
- **Safe handling of untrusted text.** OCR text is treated as data in the prompt, so text printed on a label
  cannot give the model instructions. Uploads are type- and size-checked and never written to disk.

## Architecture

```
image -> load/normalize (Pillow) -> OCR (PP-OCR det+rec) -> lines [{id, text, box, score}]
      -> gpt-oss-120b (JSON schema, cites line ids) -> grounding check -> JSON + UI
                         \__ no key / failure: regex fallback __/
```

```
app/
  main.py      FastAPI routes, upload validation, timing
  ocr.py       image loading and OCR
  extract.py   LLM call, grounding check, regex fallback
  schemas.py   field definitions shared by prompt and UI
static/        index.html, style.css, app.js, icons.svg (Lucide icons, bundled locally)
samples/       three example label photos
notebooks/     the original PaddleOCR exploration notebook
tests/         grounding, fallback and API tests (LLM mocked)
```

## Run it

```bash
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env          # add your GROQ_API_KEY (free at console.groq.com)
uvicorn app.main:app --reload
```

Open http://localhost:8000. Without a key the app still runs in rules mode.
The first request downloads the OCR models once (about 30 MB for the models, plus onnxruntime).

```bash
pytest -q
```

## API

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/api/extract` | multipart `file` (image) -> lines, fields, warnings, stats |
| POST | `/api/extract/sample/{name}` | same, for a bundled sample |
| GET | `/api/health` | engine status |
| GET | `/docs` | interactive OpenAPI docs |

## Limits

- Output can contain errors. It is a demo and not medical advice.
- Curved bottle labels and glare reduce OCR quality. Flat, well-lit photos work best.
- English labels only.

