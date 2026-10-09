import { getStore } from "@netlify/blobs";

function json(status, body) {
  return Response.json(body, { status, headers: { "x-content-type-options": "nosniff", "x-frame-options": "DENY" } });
}
export default async (req) => {
  const s = getStore({ name: "finalchapter-estates", consistency: "strong" });
  const ip = (req.headers.get("x-nf-client-connection-ip") || req.headers.get("x-forwarded-for") || "unknown").split(",")[0].trim();
  const now = Date.now();
  const hits = ((await s.get("crawl:" + ip, { type: "json" })) || []).filter((t) => now - t < 60000);
  if (hits.length >= 8) return json(429, { error: "Crawl rate limit. Try again in a minute." });
  hits.push(now);
  await s.setJSON("crawl:" + ip, hits);
  return json(403, { error: "Crawl is disabled. FinalChapter does not pull YouTube." });
};
