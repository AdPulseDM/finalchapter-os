import crypto from "node:crypto";
import { getStore } from "@netlify/blobs";

function store() {
  return getStore({ name: "finalchapter-estates", consistency: "strong" });
}
function json(status, body) {
  return Response.json(body, { status, headers: { "x-content-type-options": "nosniff", "x-frame-options": "DENY" } });
}
function publicEstate(row) {
  return { token: row.token, id: row.id, email: row.email, plan: row.plan || "demo", desk: row.desk || null };
}
export default async (req) => {
  if (req.method !== "POST") return json(405, { error: "Use POST" });
  const body = await req.json().catch(() => ({}));
  const s = store();
  if (body.action === "create") {
    const email = String(body.email || "").trim().toLowerCase();
    if (!email) return json(400, { error: "Email required" });
    const row = { id: crypto.randomBytes(8).toString("hex"), token: crypto.randomBytes(16).toString("hex"), email, plan: "demo", desk: body.desk || null, createdAt: new Date().toISOString() };
    await s.setJSON("es:" + row.id, row);
    await s.set("tok:" + row.token, row.id);
    return json(200, { estate: publicEstate(row) });
  }
  const token = String(body.token || "");
  const id = token ? await s.get("tok:" + token, { type: "text" }) : "";
  if (!id) return json(401, { error: "Estate token missing or expired." });
  const row = await s.get("es:" + id, { type: "json" });
  if (!row) return json(404, { error: "Estate not found" });
  if (body.action === "save") {
    row.desk = body.desk || row.desk;
    await s.setJSON("es:" + row.id, row);
  }
  return json(200, { estate: publicEstate(row) });
};
