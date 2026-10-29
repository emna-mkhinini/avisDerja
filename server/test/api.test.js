import { test } from "node:test";
import assert from "node:assert/strict";
import { createApp } from "../src/index.js";
import { createStore } from "../src/store.js";
import { computeStats, isQuestion, parseReviewsCsv, toSentiment } from "../src/analysis.js";
import { detectAspects } from "../src/aspects.js";
import { MlServiceError } from "../src/mlClient.js";

// Faux service NLP : « positif » si le texte contient un mot positif, « négatif » si un mot négatif, sinon 0,5.
const fakeMl = {
  health: async () => ({ ok: true, model: "fake" }),
  predict: async (texts) => ({
    model: "fake",
    predictions: texts.map((t) => {
      const p = /behi|3jebni|باهي/.test(t) ? 0.95 : /khayeb|خايب|t2a5ret/.test(t) ? 0.05 : 0.5;
      return { p_positive: p, label: p >= 0.5 ? "positif" : "négatif", score: Math.max(p, 1 - p) };
    }),
  }),
};

async function withServer(fn, ml = fakeMl) {
  const server = createApp({ ml, store: createStore() }).listen(0);
  const base = `http://localhost:${server.address().port}/api`;
  try {
    await fn(base);
  } finally {
    server.close();
  }
}

function uploadCsv(base, csv) {
  const form = new FormData();
  form.append("file", new Blob([csv], { type: "text/csv" }), "avis.csv");
  return fetch(`${base}/reviews/upload`, { method: "POST", body: form });
}

test("toSentiment uses an uncertainty band", () => {
  assert.equal(toSentiment(0.9), "positif");
  assert.equal(toSentiment(0.1), "négatif");
  assert.equal(toSentiment(0.55), "incertain");
});

test("short questions are not opinions", () => {
  assert.ok(isQuestion("Fama taille XL?"));
  assert.ok(isQuestion("قداش السوم؟"));
  assert.ok(!isQuestion("el produit khayeb barcha w el livraison t2a5ret 3 jem3at, chkoun bech yrajja3li flousi ?"));
  assert.ok(!isQuestion("behi barcha"));
});

test("detectAspects works in both scripts and ignores unrelated words", () => {
  assert.deepEqual(detectAspects("el livraison t2a5ret w el prix ghali"), ["prix", "livraison"]);
  assert.deepEqual(detectAspects("وبالسوم هذا مقبول"), ["prix"]);
  assert.deepEqual(detectAspects("kif kif, rien à dire"), []);
});

test("parseReviewsCsv detects the separator and the column names", () => {
  const rows = parseReviewsCsv("Date;Produit;Avis\n2026-01-02;Mixeur;behi\n2026-01-03;Mixeur;\n");
  assert.deepEqual(rows, [{ text: "behi", product: "Mixeur", date: "2026-01-02" }]);
  assert.throws(() => parseReviewsCsv("nom,age\nali,3\n"), /Colonne de texte introuvable/);
});

test("computeStats counts sentiments, aspects and the top complaint", () => {
  const stats = computeStats([
    { text: "a", sentiment: "positif", aspects: ["prix"], product: "A", date: "2026-01-05" },
    { text: "b", sentiment: "négatif", aspects: ["livraison"], product: "A", date: "2026-02-05" },
    { text: "c", sentiment: "négatif", aspects: ["livraison", "prix"], product: "B", date: "2026-02-06" },
  ]);
  assert.equal(stats.total, 3);
  assert.equal(stats.satisfaction, 33);
  assert.equal(stats.topComplaint, "livraison");
  assert.equal(stats.aspects.find((a) => a.key === "livraison").mentions, 2);
  assert.deepEqual(stats.timeline.map((m) => m.month), ["2026-01", "2026-02"]);
});

test("upload, list with filters, stats and reset", async () => {
  await withServer(async (base) => {
    const csv = "avis,produit\n\"el prix behi, 3jebni\",Sac\nlivraison t2a5ret,Sac\nkhayeb el qualité,Mixeur\n9adech?,Mixeur\n";
    const up = await (await uploadCsv(base, csv)).json();
    assert.equal(up.added, 4);

    const neg = await (await fetch(`${base}/reviews?sentiment=n%C3%A9gatif`)).json();
    assert.equal(neg.total, 2);
    const delivery = await (await fetch(`${base}/reviews?aspect=livraison`)).json();
    assert.equal(delivery.items[0].text, "livraison t2a5ret");

    const stats = await (await fetch(`${base}/stats`)).json();
    assert.deepEqual(stats.bySentiment, { positif: 1, "négatif": 2, incertain: 1 });

    await fetch(`${base}/reviews`, { method: "DELETE" });
    assert.equal((await (await fetch(`${base}/stats`)).json()).total, 0);
  });
});

test("demo dataset loads", async () => {
  await withServer(async (base) => {
    const res = await (await fetch(`${base}/reviews/demo`, { method: "POST" })).json();
    assert.ok(res.added >= 50);
  });
});

test("analyze a single text and validate input", async () => {
  await withServer(async (base) => {
    const post = (body) => fetch(`${base}/analyze`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const ok = await (await post({ text: "produit behi w prix mezyen" })).json();
    assert.equal(ok.sentiment, "positif");
    assert.deepEqual(ok.aspects, ["prix"]);
    assert.equal((await post({ text: "  " })).status, 400);
  });
});

test("bad CSV gives a clear 400", async () => {
  await withServer(async (base) => {
    const res = await uploadCsv(base, "nom,age\nali,3\n");
    assert.equal(res.status, 400);
    assert.match((await res.json()).error, /Colonne de texte/);
  });
});

test("NLP service down gives a 503 with instructions", async () => {
  const downMl = { health: async () => { throw new MlServiceError("down"); }, predict: async () => { throw new MlServiceError("Service NLP injoignable"); } };
  await withServer(async (base) => {
    const res = await fetch(`${base}/analyze`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: "x" }) });
    assert.equal(res.status, 503);
    assert.match((await res.json()).error, /injoignable/);
  }, downMl);
});
