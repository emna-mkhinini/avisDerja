import express from "express";
import cors from "cors";
import multer from "multer";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { analyzeReviews, computeStats, parseReviewsCsv, SENTIMENTS } from "./analysis.js";
import { ASPECTS, detectAspects } from "./aspects.js";
import { createMlClient, MlServiceError } from "./mlClient.js";
import { createStore } from "./store.js";

const DEMO_FILE = fileURLToPath(new URL("../data/demo_avis.csv", import.meta.url));

export function createApp({ ml = createMlClient(), store = createStore(), band = 0.15 } = {}) {
  const app = express();
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 2 * 1024 * 1024 } });
  app.use(cors());
  app.use(express.json({ limit: "1mb" }));

  // Ajoute des avis analysés au stockage
  async function ingest(items) {
    const { model, reviews } = await analyzeReviews(items, ml, band);
    const added = store.add(reviews.map((r) => ({ ...r, createdAt: new Date().toISOString() })));
    return { model, added: added.length, total: store.all().length };
  }

  app.get("/api/health", async (_req, res) => {
    try {
      res.json({ ok: true, ml: await ml.health() });
    } catch (err) {
      res.json({ ok: true, ml: null, mlError: err.message });
    }
  });

  // Analyse d'un seul texte, sans l'enregistrer
  app.post("/api/analyze", async (req, res, next) => {
    try {
      const text = String(req.body?.text ?? "").trim();
      if (!text) return res.status(400).json({ error: "Texte vide." });
      if (text.length > 2000) return res.status(400).json({ error: "Texte trop long (2000 caractères maximum)." });
      const { model, reviews } = await analyzeReviews([{ text }], ml, band);
      res.json({ model, ...reviews[0] });
    } catch (err) {
      next(err);
    }
  });

  // Import d'un fichier CSV d'avis
  app.post("/api/reviews/upload", upload.single("file"), async (req, res, next) => {
    try {
      if (!req.file) return res.status(400).json({ error: "Aucun fichier reçu (champ « file »)." });
      let items;
      try {
        items = parseReviewsCsv(req.file.buffer.toString("utf8"));
      } catch (err) {
        return res.status(400).json({ error: err.message });
      }
      res.json(await ingest(items));
    } catch (err) {
      next(err);
    }
  });

  // Charge le jeu d'avis de démonstration
  app.post("/api/reviews/demo", async (_req, res, next) => {
    try {
      if (!existsSync(DEMO_FILE)) return res.status(404).json({ error: "Fichier de démo absent." });
      store.clear();
      res.json(await ingest(parseReviewsCsv(readFileSync(DEMO_FILE, "utf8"))));
    } catch (err) {
      next(err);
    }
  });

  // Liste filtrée et paginée
  app.get("/api/reviews", (req, res) => {
    const { sentiment, aspect, product, q } = req.query;
    const page = Math.max(1, Number(req.query.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 20));
    const needle = q ? String(q).toLowerCase() : null;

    const filtered = store.all().filter((r) =>
      (!sentiment || r.sentiment === sentiment) &&
      (!aspect || r.aspects.includes(aspect)) &&
      (!product || r.product === product) &&
      (!needle || r.text.toLowerCase().includes(needle)));

    res.json({
      total: filtered.length,
      page,
      pageSize,
      items: filtered.slice((page - 1) * pageSize, page * pageSize),
    });
  });

  app.get("/api/stats", (_req, res) => res.json(computeStats(store.all())));

  app.get("/api/meta", (_req, res) => res.json({
    sentiments: SENTIMENTS,
    aspects: Object.entries(ASPECTS).map(([key, a]) => ({ key, label: a.label })),
  }));

  app.delete("/api/reviews", (_req, res) => {
    store.clear();
    res.json({ total: 0 });
  });

  // Aperçu des aspects détectés, utile pour tester le lexique
  app.post("/api/aspects", (req, res) => res.json({ aspects: detectAspects(req.body?.text ?? "") }));

  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    if (err instanceof MlServiceError) return res.status(503).json({ error: err.message });
    if (err instanceof multer.MulterError) return res.status(400).json({ error: `Fichier refusé : ${err.message}` });
    console.error(err);
    res.status(500).json({ error: "Erreur interne du serveur." });
  });

  // En production, sert l'application React compilée
  const dist = fileURLToPath(new URL("../../client/dist", import.meta.url));
  if (existsSync(dist)) {
    app.use(express.static(dist));
    app.get(/^(?!\/api).*/, (_req, res) => res.sendFile(`${dist}/index.html`));
  }
  return app;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const PORT = process.env.PORT || 3002;
  const ML_URL = process.env.ML_URL || "http://localhost:8000";
  const store = createStore(fileURLToPath(new URL("../data/reviews.json", import.meta.url)));
  createApp({ ml: createMlClient({ baseUrl: ML_URL }), store }).listen(PORT, () =>
    console.log(`API sur http://localhost:${PORT} (service NLP : ${ML_URL})`));
}
