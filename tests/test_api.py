from fastapi.testclient import TestClient
from app.main import app

c = TestClient(app)


def test_health():
    assert c.get("/api/health").json()["status"] == "ok"


def test_rejects_non_image():
    r = c.post("/api/extract", files={"file": ("a.txt", b"hello", "text/plain")})
    assert r.status_code == 415


def test_rejects_corrupt_image():
    r = c.post("/api/extract", files={"file": ("a.jpg", b"not an image", "image/jpeg")})
    assert r.status_code == 400


def test_unknown_sample():
    assert c.post("/api/extract/sample/../../etc/passwd").status_code in (404, 405)
    assert c.post("/api/extract/sample/nope.jpg").status_code == 404


def test_sample_end_to_end(monkeypatch):
    monkeypatch.delenv("GROQ_API_KEY", raising=False)
    r = c.post("/api/extract/sample/drug3.jpg").json()
    assert r["stats"]["lines"] > 5 and r["mode"] == "rules"
    assert any(f["key"] == "quantity" and f["value"] == "20" for f in r["fields"])
