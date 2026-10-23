// In-memory stand-in for a Netlify Blobs store (subset used by the functions).
export function memStore() {
  const m = new Map();
  return {
    _map: m,
    async get(k, opts = {}) { if (!m.has(k)) return null; const v = m.get(k); return opts.type === "json" ? JSON.parse(v) : v; },
    async set(k, v) { m.set(k, String(v)); return { modified: true }; },
    async setJSON(k, v) { m.set(k, JSON.stringify(v)); return { modified: true }; },
    async delete(k) { m.delete(k); },
    async list({ prefix = "" } = {}) { return { blobs: [...m.keys()].filter((k) => k.startsWith(prefix)).map((key) => ({ key })) }; },
  };
}
export function post(path, body, token) {
  return new Request("https://example.test" + path, {
    method: "POST",
    headers: { "content-type": "application/json", ...(token ? { authorization: "Bearer " + token } : {}) },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}
export async function call(handle, req, deps) {
  const res = await handle(req, deps);
  return { status: res.status, body: await res.json() };
}
