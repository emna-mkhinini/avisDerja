"""Évaluation hors domaine : le modèle est entraîné sur des commentaires TV/radio (TSAC),
on le teste sur des avis e-commerce annotés à la main (data/ecommerce_eval.csv, 55 avis).

Usage : python evaluate_ecommerce.py [--band 0.15]
"""
import argparse

import numpy as np
import pandas as pd
from sklearn.metrics import accuracy_score, f1_score

from service import load_predictor


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--band", type=float, default=0.15, help="zone d'incertitude autour de 0,5")
    args = parser.parse_args()

    df = pd.read_csv("data/ecommerce_eval.csv")
    predictor = load_predictor()
    p = np.array(predictor.predict_proba(df.text.tolist()))
    y, pred = df.label.values, (p >= 0.5).astype(int)
    confident = np.abs(p - 0.5) >= args.band

    print(f"Modèle : {predictor.name}")
    print(f"Avis e-commerce : {len(df)}")
    print(f"Tous les avis       : accuracy {accuracy_score(y, pred):.3f} · F1 macro {f1_score(y, pred, average='macro'):.3f}")
    print(f"Avis « sûrs » ({confident.mean():.0%}) : accuracy {accuracy_score(y[confident], pred[confident]):.3f}")
    print("\nErreurs :")
    for text, label, prob in zip(df.text[pred != y], y[pred != y], p[pred != y]):
        print(f"  attendu {'positif' if label else 'négatif':8s} p(positif)={prob:.2f}  {text}")


if __name__ == "__main__":
    main()
