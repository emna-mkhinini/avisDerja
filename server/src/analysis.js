import { parse } from "csv-parse/sync";
import { ASPECTS, detectAspects } from "./aspects.js";

export const SENTIMENTS = ["positif", "négatif", "incertain"];

// Le modèle n'a appris que « positif » / « négatif ». Quand il hésite (probabilité proche de 0,5),
// on affiche « incertain » plutôt que de forcer une réponse : c'est le cas des questions
// (« 9adech soumou ? ») et des avis mitigés.
export function toSentiment(pPositive, band = 0.15) {
  if (pPositive >= 0.5 + band) return "positif";
  if (pPositive <= 0.5 - band) return "négatif";
  return "incertain";
}

const TEXT_COLUMNS = ["text", "texte", "avis", "commentaire", "comment", "review", "message"];
const PRODUCT_COLUMNS = ["produit", "product", "article"];
const DATE_COLUMNS = ["date", "created_at", "jour"];

/** Lit un CSV d'avis et renvoie [{ text, product, date }]. Le séparateur (, ou ;) est détecté. */
export function parseReviewsCsv(content, maxRows = 5000) {
  const firstLine = content.split(/\r?\n/, 1)[0];
  const delimiter = (firstLine.match(/;/g) ?? []).length > (firstLine.match(/,/g) ?? []).length ? ";" : ",";
  const rows = parse(content, { columns: (h) => h.map((c) => c.trim().toLowerCase()), delimiter, bom: true, skip_empty_lines: true, relax_column_count: true, trim: true });
  if (rows.length === 0) throw new Error("Le fichier est vide.");

  const headers = Object.keys(rows[0]);
  const pick = (names) => names.find((n) => headers.includes(n));
  const textCol = pick(TEXT_COLUMNS);
  if (!textCol) throw new Error(`Colonne de texte introuvable. Noms acceptés : ${TEXT_COLUMNS.join(", ")}.`);
  if (rows.length > maxRows) throw new Error(`Trop de lignes (${rows.length}). Maximum : ${maxRows}.`);
  const productCol = pick(PRODUCT_COLUMNS);
  const dateCol = pick(DATE_COLUMNS);

  return rows
    .filter((r) => r[textCol])
    .map((r) => ({
      text: r[textCol],
      product: (productCol && r[productCol]) || null,
      date: (dateCol && r[dateCol]) || null,
    }));
}

// Une question courte (« 9adech soumou ? », « Fama taille XL? ») n'est pas un avis :
// le modèle, qui n'a vu que des opinions, la classe souvent « négatif » à tort.
export function isQuestion(text) {
  const t = String(text).trim();
  return /[?؟]$/.test(t) && t.split(/\s+/).length <= 8;
}

/** Analyse des avis : sentiment (service NLP) + aspects (lexique). */
export async function analyzeReviews(items, ml, band) {
  const { model, predictions } = await ml.predict(items.map((i) => i.text));
  return {
    model,
    reviews: items.map((item, i) => ({
      ...item,
      sentiment: isQuestion(item.text) ? "incertain" : toSentiment(predictions[i].p_positive, band),
      pPositive: predictions[i].p_positive,
      aspects: detectAspects(item.text),
    })),
  };
}

const emptyCounts = () => Object.fromEntries(SENTIMENTS.map((s) => [s, 0]));
const rate = (pos, neg) => (pos + neg === 0 ? null : Math.round((100 * pos) / (pos + neg)));

export function computeStats(reviews) {
  const bySentiment = emptyCounts();
  const aspects = Object.fromEntries(Object.entries(ASPECTS).map(([k, a]) => [k, { label: a.label, mentions: 0, ...emptyCounts() }]));
  const products = {};
  const months = {};

  for (const r of reviews) {
    bySentiment[r.sentiment]++;
    for (const a of r.aspects) {
      aspects[a].mentions++;
      aspects[a][r.sentiment]++;
    }
    if (r.product) {
      products[r.product] ??= { product: r.product, total: 0, ...emptyCounts() };
      products[r.product].total++;
      products[r.product][r.sentiment]++;
    }
    const month = /^\d{4}-\d{2}/.exec(r.date ?? "")?.[0];
    if (month) {
      months[month] ??= { month, ...emptyCounts() };
      months[month][r.sentiment]++;
    }
  }

  const aspectList = Object.entries(aspects)
    .map(([key, a]) => ({ key, ...a, satisfaction: rate(a.positif, a["négatif"]) }))
    .sort((a, b) => b.mentions - a.mentions);

  // Le thème qui génère le plus d'avis négatifs : la priorité à traiter
  const worst = aspectList.reduce((w, a) => (a["négatif"] > (w?.["négatif"] ?? 0) ? a : w), null);

  return {
    total: reviews.length,
    bySentiment,
    satisfaction: rate(bySentiment.positif, bySentiment["négatif"]),
    aspects: aspectList,
    topComplaint: worst?.key ?? null,
    products: Object.values(products)
      .map((p) => ({ ...p, satisfaction: rate(p.positif, p["négatif"]) }))
      .sort((a, b) => b.total - a.total),
    timeline: Object.values(months).sort((a, b) => a.month.localeCompare(b.month)),
  };
}
