async function request(path, init) {
  const res = await fetch(`/api${path}`, init);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `Erreur ${res.status}`);
  return body;
}

const json = (method, data) => ({ method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });

export const api = {
  health: () => request("/health"),
  meta: () => request("/meta"),
  stats: () => request("/stats"),
  reviews: (params) => request(`/reviews?${new URLSearchParams(Object.entries(params).filter(([, v]) => v))}`),
  analyze: (text) => request("/analyze", json("POST", { text })),
  loadDemo: () => request("/reviews/demo", { method: "POST" }),
  reset: () => request("/reviews", { method: "DELETE" }),
  upload(file) {
    const form = new FormData();
    form.append("file", file);
    return request("/reviews/upload", { method: "POST", body: form });
  },
};
