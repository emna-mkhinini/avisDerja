"""Prépare le corpus TSAC : dédoublonnage, retrait des fuites test/train, découpage train/val/test.

Usage :
    git clone https://github.com/fbougares/TSAC.git
    python prepare_data.py --tsac TSAC
"""
import argparse
import collections
import csv
import random
from pathlib import Path

from text_utils import is_arabic_script, normalize


def load(folder: Path, name: str, label: int):
    lines = (folder / name).read_text(encoding="utf-8").splitlines()
    return [(line.strip(), label) for line in lines if line.strip()]


def dedup(rows):
    """Garde une seule copie de chaque commentaire et retire ceux annotés à la fois positif et négatif."""
    labels = collections.defaultdict(set)
    for text, label in rows:
        labels[normalize(text)].add(label)
    seen, out = set(), []
    for text, label in rows:
        key = normalize(text)
        if len(labels[key]) == 1 and key not in seen:
            seen.add(key)
            out.append((text, label))
    conflicts = sum(len(v) > 1 for v in labels.values())
    return out, conflicts


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--tsac", default="TSAC", help="dossier du dépôt TSAC cloné")
    parser.add_argument("--out", default=str(Path(__file__).parent / "data"))
    parser.add_argument("--seed", type=int, default=42)
    args = parser.parse_args()

    src, out = Path(args.tsac), Path(args.out)
    train = load(src, "train_pos.txt", 1) + load(src, "train_neg.txt", 0)
    test = load(src, "test_pos.txt", 1) + load(src, "test_neg.txt", 0)
    print(f"brut : train {len(train)}, test {len(test)}")

    train, c_train = dedup(train)
    test, c_test = dedup(test)
    # Un commentaire présent dans le train et le test fausserait l'évaluation
    train_keys = {normalize(t) for t, _ in train}
    leaks = sum(normalize(t) in train_keys for t, _ in test)
    test = [(t, l) for t, l in test if normalize(t) not in train_keys]
    print(f"conflits d'annotation retirés : {c_train + c_test}, fuites test→train retirées : {leaks}")

    random.Random(args.seed).shuffle(train)
    n_val = int(0.1 * len(train))
    splits = {"train": train[n_val:], "val": train[:n_val], "test": test}

    out.mkdir(parents=True, exist_ok=True)
    for name, rows in splits.items():
        with open(out / f"{name}.csv", "w", newline="", encoding="utf-8") as f:
            writer = csv.writer(f)
            writer.writerow(["text", "label"])
            writer.writerows(rows)
        arabic = sum(is_arabic_script(t) for t, _ in rows) / len(rows)
        positive = sum(l for _, l in rows) / len(rows)
        print(f"{name:5s} {len(rows):6d} lignes · écriture arabe {arabic:.0%} · positifs {positive:.0%}")


if __name__ == "__main__":
    main()
