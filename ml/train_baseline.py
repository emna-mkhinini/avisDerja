"""Baseline : TF-IDF (mots + caractères) + régression logistique.

Usage : python train_baseline.py
Produit models/baseline.joblib et models/baseline_metrics.json
"""
import json
from pathlib import Path

import joblib
import pandas as pd
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score, classification_report, confusion_matrix, f1_score
from sklearn.pipeline import make_pipeline, make_union

from text_utils import is_arabic_script, normalize

ROOT = Path(__file__).parent
DATA, MODELS = ROOT / "data", ROOT / "models"
LABELS = ["négatif", "positif"]


def build_pipeline():
    # Les n-grammes de caractères absorbent les variations d'orthographe du derja
    # (« barcha » / « barsha », « 3jebni » / « 3ajebni ») et marchent sur les deux écritures.
    features = make_union(
        TfidfVectorizer(preprocessor=normalize, ngram_range=(1, 2), min_df=2, sublinear_tf=True),
        TfidfVectorizer(preprocessor=normalize, analyzer="char_wb", ngram_range=(2, 5), min_df=2, sublinear_tf=True),
    )
    return make_pipeline(features, LogisticRegression(C=4, max_iter=2000))


def evaluate(model, df):
    pred = model.predict(df.text)
    return {
        "accuracy": round(accuracy_score(df.label, pred), 4),
        "f1_macro": round(f1_score(df.label, pred, average="macro"), 4),
    }, pred


def main():
    train = pd.read_csv(DATA / "train.csv")
    val = pd.read_csv(DATA / "val.csv")
    test = pd.read_csv(DATA / "test.csv")

    model = build_pipeline().fit(train.text, train.label)
    val_metrics, _ = evaluate(model, val)
    test_metrics, pred = evaluate(model, test)

    # Résultats séparés par écriture : arabe vs latine (« arabizi »)
    arabic = test.text.map(is_arabic_script)
    by_script = {
        name: evaluate(model, test[mask])[0]
        for name, mask in [("arabe", arabic), ("arabizi", ~arabic)]
    }

    metrics = {
        "model": "TF-IDF mots+caractères + régression logistique",
        "val": val_metrics,
        "test": test_metrics,
        "test_par_ecriture": by_script,
        "confusion_matrix_test": confusion_matrix(test.label, pred).tolist(),
        "n_train": len(train), "n_val": len(val), "n_test": len(test),
    }
    MODELS.mkdir(exist_ok=True)
    joblib.dump(model, MODELS / "baseline.joblib")
    (MODELS / "baseline_metrics.json").write_text(json.dumps(metrics, indent=2, ensure_ascii=False), encoding="utf-8")

    # Quelques erreurs à analyser
    errors = test[pred != test.label].assign(pred=pred[pred != test.label])
    errors.head(40).to_csv(MODELS / "baseline_errors_sample.csv", index=False)

    print(json.dumps(metrics, indent=2, ensure_ascii=False))
    print(classification_report(test.label, pred, target_names=LABELS, digits=4))


if __name__ == "__main__":
    main()
