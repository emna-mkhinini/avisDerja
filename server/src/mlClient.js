// Client du service Python (FastAPI) qui fait tourner le modèle NLP.

const BATCH_SIZE = 500;

export class MlServiceError extends Error {}

export function createMlClient({ baseUrl = "http://localhost:8000", fetchImpl = fetch, timeoutMs = 60_000 } = {}) {
  async function call(path, init = {}) {
    let res;
    try {
      res = await fetchImpl(`${baseUrl}${path}`, { ...init, signal: AbortSignal.timeout(timeoutMs) });
    } catch (err) {
      throw new MlServiceError(`Service NLP injoignable sur ${baseUrl} (${err.cause?.code ?? err.name}). Lance : uvicorn service:app --port 8000`);
    }
    if (!res.ok) throw new MlServiceError(`Service NLP : erreur ${res.status} ${(await res.text()).slice(0, 200)}`);
    return res.json();
  }

  return {
    health: () => call("/health"),

    /** Prédit le sentiment d'une liste de textes, par lots, et renvoie { model, predictions }. */
    async predict(texts) {
      const predictions = [];
      let model;
      for (let i = 0; i < texts.length; i += BATCH_SIZE) {
        const body = await call("/predict", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ texts: texts.slice(i, i + BATCH_SIZE) }),
        });
        model = body.model;
        predictions.push(...body.predictions);
      }
      return { model, predictions };
    },
  };
}
