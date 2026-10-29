// Stockage simple des avis analysés : en mémoire, sauvegardé dans un fichier JSON.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

export function createStore(file = null) {
  let reviews = file && existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : [];
  let nextId = reviews.reduce((m, r) => Math.max(m, r.id), 0) + 1;

  const save = () => {
    if (!file) return;
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, JSON.stringify(reviews));
  };

  return {
    all: () => reviews,
    add(items) {
      const added = items.map((r) => ({ id: nextId++, ...r }));
      reviews = reviews.concat(added);
      save();
      return added;
    },
    clear() {
      reviews = [];
      nextId = 1;
      save();
    },
  };
}
