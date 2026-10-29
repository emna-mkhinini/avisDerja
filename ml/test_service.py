from fastapi.testclient import TestClient

from service import BaselinePredictor, create_app
from text_utils import is_arabic_script, normalize

client = TestClient(create_app(BaselinePredictor()))


def test_normalize_handles_both_scripts():
    assert normalize("BARCHAAAAA hhhhhh") == "barchaa hh"
    assert normalize("ﺍﻟﺤﻮﺕ") == "الحوت"  # formes de présentation arabes
    assert is_arabic_script("ﺍﻟﺤﻮﺕ") and not is_arabic_script("3jebni barcha")


def test_health_reports_model():
    body = client.get("/health").json()
    assert body["ok"] and "baseline" in body["model"]


def test_predict_obvious_reviews():
    texts = ["3jebni barcha, ya3tikom sa77a", "خايب برشا وما ينصحش بيه", "ma7lééééh"]
    preds = client.post("/predict", json={"texts": texts}).json()["predictions"]
    assert [p["label"] for p in preds] == ["positif", "négatif", "positif"]
    assert all(0.5 <= p["score"] <= 1 for p in preds)


def test_predict_rejects_empty_list():
    assert client.post("/predict", json={"texts": []}).status_code == 422


def test_predict_survives_blank_text():
    preds = client.post("/predict", json={"texts": ["   "]}).json()["predictions"]
    assert len(preds) == 1
