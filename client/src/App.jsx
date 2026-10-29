import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "./api.js";

const SENTIMENTS = [
  { key: "positif", label: "Positif" },
  { key: "négatif", label: "Négatif" },
  { key: "incertain", label: "Incertain" },
];
const isArabic = (t) => /[؀-ۿ]/.test(t);

export default function App() {
  const [health, setHealth] = useState(null);
  const [meta, setMeta] = useState({ aspects: [] });
  const [stats, setStats] = useState(null);
  const [filters, setFilters] = useState({ sentiment: "", aspect: "", product: "", q: "", page: 1 });
  const [list, setList] = useState({ items: [], total: 0, pageSize: 20 });
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const fileInput = useRef(null);

  const aspectLabel = (key) => meta.aspects.find((a) => a.key === key)?.label ?? key;

  const refresh = useCallback(async () => {
    try {
      setStats(await api.stats());
    } catch (e) {
      setError(e.message);
    }
  }, []);

  useEffect(() => {
    api.health().then(setHealth).catch((e) => setError(e.message));
    api.meta().then(setMeta).catch(() => {});
    refresh();
  }, [refresh]);

  useEffect(() => {
    api.reviews({ ...filters, pageSize: 20 }).then(setList).catch((e) => setError(e.message));
  }, [filters, stats]);

  async function run(label, action) {
    setBusy(label);
    setError("");
    try {
      await action();
      await refresh();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy("");
    }
  }

  const setFilter = (patch) => setFilters((f) => ({ ...f, page: 1, ...patch }));
  const empty = stats && stats.total === 0;

  return (
    <div className="app">
      <header className="top">
        <div className="brand">
          <h1>AvisDerja</h1>
          <p>Analyse de sentiment des avis clients en derja tunisien (arabe et arabizi)</p>
        </div>
        <div className="actions">
          <ModelBadge health={health} />
          <button className="ghost" disabled={!!busy} onClick={() => run("demo", api.loadDemo)}>
            {busy === "demo" ? "Chargement…" : "Charger la démo"}
          </button>
          <button disabled={!!busy} onClick={() => fileInput.current.click()}>
            {busy === "upload" ? "Analyse…" : "Importer un CSV"}
          </button>
          <input ref={fileInput} type="file" accept=".csv,text/csv" hidden
            onChange={(e) => {
              const file = e.target.files[0];
              e.target.value = "";
              if (file) run("upload", () => api.upload(file));
            }} />
          {stats?.total > 0 && (
            <button className="ghost danger" disabled={!!busy} onClick={() => run("reset", api.reset)}>Vider</button>
          )}
        </div>
      </header>

      {error && <div className="error" role="alert">{error}</div>}

      <Analyzer aspectLabel={aspectLabel} />

      {empty && (
        <section className="card empty">
          <h2>Aucun avis pour l'instant</h2>
          <p>Importe un fichier CSV avec une colonne <code>avis</code> (et si possible <code>produit</code> et <code>date</code>), ou charge le jeu de démonstration.</p>
        </section>
      )}

      {stats?.total > 0 && (
        <>
          <Kpis stats={stats} aspectLabel={aspectLabel} />
          <div className="grid">
            <AspectsCard stats={stats} active={filters.aspect} onPick={(aspect) => setFilter({ aspect: filters.aspect === aspect ? "" : aspect })} />
            <ProductsCard stats={stats} active={filters.product} onPick={(product) => setFilter({ product: filters.product === product ? "" : product })} />
          </div>
          {stats.timeline.length > 1 && <Timeline stats={stats} />}
          <ReviewsTable list={list} filters={filters} setFilter={setFilter} setFilters={setFilters}
            meta={meta} products={stats.products.map((p) => p.product)} aspectLabel={aspectLabel} />
        </>
      )}

      <footer>
        Modèle entraîné sur le corpus TSAC (commentaires Facebook en derja). Les avis où le modèle hésite sont marqués « incertain ».
      </footer>
    </div>
  );
}

function ModelBadge({ health }) {
  if (!health) return null;
  if (!health.ml) return <span className="badge warn" title={health.mlError}>Service NLP hors ligne</span>;
  const m = health.ml.test_metrics;
  return (
    <span className="badge" title={health.ml.model}>
      {health.ml.model.startsWith("transformer") ? "Transformer" : "Baseline"}
      {m && <> · F1 {(m.f1_macro * 100).toFixed(1)} %</>}
    </span>
  );
}

function Analyzer({ aspectLabel }) {
  const [text, setText] = useState("");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const examples = ["el livraison t2a5ret w el produit wsel mkasser", "التوصيل سريع والجودة باهية برشا", "9adech soumou?"];

  async function analyze(value = text) {
    if (!value.trim()) return;
    setLoading(true);
    setError("");
    try {
      setResult(await api.analyze(value));
    } catch (e) {
      setError(e.message);
      setResult(null);
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="card analyzer">
      <h2>Tester un avis</h2>
      <form onSubmit={(e) => { e.preventDefault(); analyze(); }}>
        <input value={text} onChange={(e) => setText(e.target.value)} dir="auto"
          placeholder="Écris un avis en derja : « produit behi w prix mezyen »" aria-label="Avis à analyser" />
        <button disabled={loading || !text.trim()}>{loading ? "…" : "Analyser"}</button>
      </form>
      <div className="examples">
        {examples.map((ex) => (
          <button key={ex} type="button" className="chip" dir="auto" onClick={() => { setText(ex); analyze(ex); }}>{ex}</button>
        ))}
      </div>
      {error && <p className="error small">{error}</p>}
      {result && (
        <div className="result">
          <span className={`pill ${sentimentClass(result.sentiment)}`}>{result.sentiment}</span>
          <ConfidenceBar p={result.pPositive} />
          <span className="aspects">
            {result.aspects.length ? result.aspects.map((a) => <span key={a} className="tag">{aspectLabel(a)}</span>) : <span className="muted">aucun thème détecté</span>}
          </span>
        </div>
      )}
    </section>
  );
}

function ConfidenceBar({ p }) {
  return (
    <span className="conf" title={`probabilité positif : ${(p * 100).toFixed(0)} %`}>
      <span className="conf-track"><span className="conf-mark" style={{ left: `${p * 100}%` }} /></span>
      <span className="muted">p(positif) = {(p * 100).toFixed(0)} %</span>
    </span>
  );
}

const sentimentClass = (s) => ({ positif: "pos", "négatif": "neg", incertain: "unc" })[s];

function Kpis({ stats, aspectLabel }) {
  const { total, bySentiment, satisfaction, topComplaint } = stats;
  return (
    <section className="kpis">
      <Kpi label="Avis analysés" value={total} />
      <Kpi label="Satisfaction" value={satisfaction === null ? "—" : `${satisfaction} %`} hint="positifs / (positifs + négatifs)" />
      <div className="kpi">
        <span className="kpi-label">Répartition</span>
        <StackBar counts={bySentiment} />
        <span className="legend">
          {SENTIMENTS.map((s) => <span key={s.key}><i className={sentimentClass(s.key)} />{s.label} {bySentiment[s.key]}</span>)}
        </span>
      </div>
      <Kpi label="Priorité n°1" value={topComplaint ? aspectLabel(topComplaint) : "—"} hint="thème avec le plus d'avis négatifs" accent />
    </section>
  );
}

function Kpi({ label, value, hint, accent }) {
  return (
    <div className={`kpi ${accent ? "accent" : ""}`}>
      <span className="kpi-label">{label}</span>
      <span className="kpi-value">{value}</span>
      {hint && <span className="kpi-hint">{hint}</span>}
    </div>
  );
}

function StackBar({ counts }) {
  const total = SENTIMENTS.reduce((n, s) => n + counts[s.key], 0) || 1;
  return (
    <span className="stack">
      {SENTIMENTS.map((s) => counts[s.key] > 0 && (
        <span key={s.key} className={sentimentClass(s.key)} style={{ width: `${(100 * counts[s.key]) / total}%` }}
          title={`${s.label} : ${counts[s.key]}`} />
      ))}
    </span>
  );
}

function AspectsCard({ stats, active, onPick }) {
  const max = Math.max(1, ...stats.aspects.map((a) => a.mentions));
  return (
    <section className="card">
      <h2>Thèmes mentionnés</h2>
      <p className="muted small">Clique un thème pour filtrer les avis.</p>
      <ul className="bars">
        {stats.aspects.map((a) => (
          <li key={a.key}>
            <button className={`bar-row ${active === a.key ? "active" : ""}`} onClick={() => onPick(a.key)} disabled={!a.mentions}>
              <span className="bar-label">{a.label}</span>
              <span className="bar-track" style={{ width: `${(100 * a.mentions) / max}%` }}><StackBar counts={a} /></span>
              <span className="bar-num">{a.mentions}</span>
              <span className="bar-sat">{a.satisfaction === null ? "" : `${a.satisfaction} %`}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function ProductsCard({ stats, active, onPick }) {
  if (!stats.products.length) return null;
  return (
    <section className="card">
      <h2>Par produit</h2>
      <p className="muted small">Satisfaction = positifs / (positifs + négatifs).</p>
      <table className="products">
        <thead><tr><th>Produit</th><th>Avis</th><th>Satisfaction</th></tr></thead>
        <tbody>
          {stats.products.map((p) => (
            <tr key={p.product} className={active === p.product ? "active" : ""} onClick={() => onPick(p.product)}>
              <td>{p.product}</td>
              <td className="num">{p.total}</td>
              <td>
                <span className="sat">
                  <span className="sat-track"><span className={p.satisfaction >= 50 ? "pos" : "neg"} style={{ width: `${p.satisfaction ?? 0}%` }} /></span>
                  <span className="num">{p.satisfaction ?? "—"} %</span>
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function Timeline({ stats }) {
  const max = Math.max(1, ...stats.timeline.map((m) => m.positif + m["négatif"] + m.incertain));
  const fmt = (m) => new Date(`${m}-01`).toLocaleDateString("fr-FR", { month: "short", year: "2-digit" });
  return (
    <section className="card">
      <h2>Évolution mensuelle</h2>
      <div className="timeline">
        {stats.timeline.map((m) => {
          const total = m.positif + m["négatif"] + m.incertain;
          return (
            <div key={m.month} className="col" title={`${fmt(m.month)} : ${m.positif} positifs, ${m["négatif"]} négatifs, ${m.incertain} incertains`}>
              <div className="col-bar" style={{ height: `${(100 * total) / max}%` }}>
                {["négatif", "incertain", "positif"].map((s) => m[s] > 0 && (
                  <span key={s} className={sentimentClass(s)} style={{ flexGrow: m[s] }} />
                ))}
              </div>
              <span className="col-label">{fmt(m.month)}</span>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function ReviewsTable({ list, filters, setFilter, setFilters, meta, products, aspectLabel }) {
  const pages = Math.max(1, Math.ceil(list.total / list.pageSize));
  const hasFilter = filters.sentiment || filters.aspect || filters.product || filters.q;
  return (
    <section className="card">
      <div className="table-head">
        <h2>Avis <span className="muted">({list.total})</span></h2>
        <div className="filters">
          <input placeholder="Rechercher…" value={filters.q} onChange={(e) => setFilter({ q: e.target.value })} dir="auto" aria-label="Rechercher" />
          <select value={filters.sentiment} onChange={(e) => setFilter({ sentiment: e.target.value })} aria-label="Sentiment">
            <option value="">Tous les sentiments</option>
            {SENTIMENTS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
          </select>
          <select value={filters.aspect} onChange={(e) => setFilter({ aspect: e.target.value })} aria-label="Thème">
            <option value="">Tous les thèmes</option>
            {meta.aspects.map((a) => <option key={a.key} value={a.key}>{a.label}</option>)}
          </select>
          {products.length > 0 && (
            <select value={filters.product} onChange={(e) => setFilter({ product: e.target.value })} aria-label="Produit">
              <option value="">Tous les produits</option>
              {products.map((p) => <option key={p}>{p}</option>)}
            </select>
          )}
          {hasFilter && <button className="ghost" onClick={() => setFilter({ sentiment: "", aspect: "", product: "", q: "" })}>Effacer</button>}
        </div>
      </div>
      <ul className="reviews">
        {list.items.map((r) => (
          <li key={r.id}>
            <span className={`pill ${sentimentClass(r.sentiment)}`}>{r.sentiment}</span>
            <div className="review-body">
              <p dir={isArabic(r.text) ? "rtl" : "ltr"} className={isArabic(r.text) ? "ar" : ""}>{r.text}</p>
              <span className="review-meta">
                {r.product && <span>{r.product}</span>}
                {r.date && <span>{r.date}</span>}
                {r.aspects.map((a) => <span key={a} className="tag">{aspectLabel(a)}</span>)}
              </span>
            </div>
            <span className="score num" title="probabilité que l'avis soit positif">{Math.round(r.pPositive * 100)} %</span>
          </li>
        ))}
        {list.items.length === 0 && <li className="muted">Aucun avis ne correspond aux filtres.</li>}
      </ul>
      {pages > 1 && (
        <div className="pager">
          <button className="ghost" disabled={filters.page <= 1} onClick={() => setFilters((f) => ({ ...f, page: f.page - 1 }))}>Précédent</button>
          <span className="muted">Page {filters.page} / {pages}</span>
          <button className="ghost" disabled={filters.page >= pages} onClick={() => setFilters((f) => ({ ...f, page: f.page + 1 }))}>Suivant</button>
        </div>
      )}
    </section>
  );
}
