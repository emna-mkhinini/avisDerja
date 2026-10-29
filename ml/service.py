"""Service de prédiction du sentiment (derja tunisien).

Lancement : uvicorn service:app --port 8000
Utilise le transformer fine-tuné s'il est présent dans models/transformer/, sinon la baseline TF-IDF.
"""
import json
from pathlib import Path

import joblib
from fastapi import FastAPI
from pydantic import BaseModel, Field

from text_utils import normalize

MODELS = Path(__file__).parent / "models"
LABELS = ["négatif", "positif"]
MAX_TEXTS = 1000


class BaselinePredictor:
    name = "baseline TF-IDF + régression logistique"

    def __init__(self, path=MODELS / "baseline.joblib"):
        self.model = joblib.load(path)
        metrics = path.with_name("baseline_metrics.json")
        self.metrics = json.loads(metrics.read_text(encoding="utf-8"))["test"] if metrics.exists() else None

    def predict_proba(self, texts):
        return self.model.predict_proba(texts)[:, 1].tolist()


class TransformerPredictor:
    def __init__(self, path=MODELS / "transformer"):
        import torch  # importé seulement si le modèle fine-tuné est présent
        from transformers import AutoModelForSequenceClassification, AutoTokenizer

        self.torch = torch
        self.tokenizer = AutoTokenizer.from_pretrained(path)
        self.model = AutoModelForSequenceClassification.from_pretrained(path).eval()
        info = json.loads((path / "metrics.json").read_text()) if (path / "metrics.json").exists() else {}
        self.name = f"transformer fine-tuné ({info.get('model', 'inconnu')})"
        self.metrics = info.get("test")

    def predict_proba(self, texts, batch_size=32):
        probs = []
        with self.torch.no_grad():
            for i in range(0, len(texts), batch_size):
                batch = self.tokenizer([normalize(t) for t in texts[i:i + batch_size]],
                                       truncation=True, max_length=128, padding=True, return_tensors="pt")
                probs += self.model(**batch).logits.softmax(-1)[:, 1].tolist()
        return probs


def load_predictor():
    if (MODELS / "transformer" / "config.json").exists():
        try:
            return TransformerPredictor()
        except ImportError:
            print("⚠️  torch/transformers non installés : utilisation de la baseline")
    return BaselinePredictor()


class PredictRequest(BaseModel):
    texts: list[str] = Field(..., min_length=1, max_length=MAX_TEXTS)


def create_app(predictor=None):
    predictor = predictor or load_predictor()
    app = FastAPI(title="Derja sentiment")

    @app.get("/health")
    def health():
        return {"ok": True, "model": predictor.name, "test_metrics": predictor.metrics}

    @app.post("/predict")
    def predict(req: PredictRequest):
        texts = [t if t.strip() else "." for t in req.texts]
        probs = predictor.predict_proba(texts)
        return {
            "model": predictor.name,
            "predictions": [
                {"label": LABELS[int(p >= 0.5)], "score": round(p if p >= 0.5 else 1 - p, 4), "p_positive": round(p, 4)}
                for p in probs
            ],
        }

    return app


app = create_app()
