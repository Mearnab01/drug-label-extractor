from app import extract as ex

LINES = [
    {"id": 0, "text": "Pharmacy", "score": 0.99, "x": .4, "y": .4},
    {"id": 1, "text": "50MCGTABLETS", "score": 0.99, "x": .4, "y": .5},
    {"id": 2, "text": "TAKEONETABLETBYI", "score": 0.97, "x": .4, "y": .6},
    {"id": 3, "text": "EVERYDAY", "score": 0.99, "x": .4, "y": .65},
    {"id": 4, "text": "QTY:90", "score": 0.97, "x": .4, "y": .7},
]


def test_ground_accepts_repaired_ocr_text():
    g = ex.ground("Take one tablet by mouth every day", [2, 3], LINES)
    assert g["status"] == "verified"          # "mouth" is missing but the rest is supported


def test_ground_flags_hallucinated_value():
    g = ex.ground("Levothyroxine", [1], LINES)
    assert g["status"] == "review" and g["support"] == 0


def test_ground_flags_missing_citation_and_bad_ids():
    assert ex.ground("90", [], LINES)["status"] == "review"
    assert ex.ground("90", [99], LINES)["status"] == "review"


def test_rules_fallback():
    raw = ex.rules_extract(LINES)
    assert raw["quantity"]["value"] == "90"
    assert raw["strength"]["value"].lower() == "50mcg"
    assert raw["directions"]["lines"] == [2, 3]


def test_extract_uses_llm_and_grounds(monkeypatch):
    monkeypatch.setenv("GROQ_API_KEY", "test")
    fake = {k: {"value": "", "lines": []} for k in ex.FIELD_KEYS}
    fake["drug_name"] = {"value": "Levothyroxine", "lines": [1]}      # not on the label
    fake["quantity"] = {"value": "90", "lines": [4]}
    fake["warnings"] = []
    monkeypatch.setattr(ex, "_llm_call", lambda lines: (fake, {"prompt_tokens": 1, "completion_tokens": 1}))
    out = ex.extract(LINES)
    by = {f["key"]: f for f in out["fields"]}
    assert out["mode"] == "llm"
    assert by["quantity"]["status"] == "verified"
    assert by["drug_name"]["status"] == "review"
    assert by["patient"]["status"] == "missing"


def test_llm_failure_falls_back_to_rules(monkeypatch):
    monkeypatch.setenv("GROQ_API_KEY", "test")
    def boom(_): raise RuntimeError("network")
    monkeypatch.setattr(ex, "_llm_call", boom)
    out = ex.extract(LINES)
    assert out["mode"] == "rules" and "failed" in out["notice"]


def test_empty_ocr():
    assert ex.extract([])["mode"] == "none"
