import crypto from "node:crypto";
import { getStore } from "@netlify/blobs";

function store() {
  return getStore({ name: "finalchapter-users", consistency: "strong" });
}
function json(status, body) {
  return Response.json(body, { status, headers: { "x-content-type-options": "nosniff" } });
}
function hash(password, salt = crypto.randomBytes(16).toString("hex")) {
  return { salt, hash: crypto.scryptSync(password, salt, 64).toString("hex") };
}
function verify(password, salt, hashValue) {
  return crypto.scryptSync(password, salt, 64).toString("hex") === hashValue;
}

export default async (req) => {
  if (req.method !== "POST") return json(405, { error: "Use POST" });
  const body = await req.json().catch(() => ({}));
  const s = store();
  const action = body.action;
  const email = String(body.email || "").trim().toLowerCase();

  if (action === "signup") {
    const name = String(body.name || "").trim();
    const plan = ["executor", "family", "professional"].includes(body.plan) ? body.plan : "executor";
    if (!email || !name) return json(400, { error: "Name and email required" });
    const existing = await s.get("user:" + email, { type: "json" });
    if (existing && existing.paid) return json(409, { error: "Account already active. Log in." });
    const temp = crypto.randomBytes(4).toString("hex");
    const hashed = hash(temp);
    const row = {
      id: existing?.id || crypto.randomBytes(8).toString("hex"),
      email, name, plan,
      password_hash: hashed.hash, password_salt: hashed.salt,
      must_change_password: true, temp_password: temp,
      paid: false, token: crypto.randomBytes(16).toString("hex"),
      createdAt: new Date().toISOString(),
    };
    await s.setJSON("user:" + email, row);
    return json(200, { ok: true, plan, email });
  }

  if (action === "login") {
    const password = String(body.password || "");
    const row = email ? await s.get("user:" + email, { type: "json" }) : null;
    if (!row || !verify(password, row.password_salt, row.password_hash)) return json(401, { error: "Invalid email or password" });
    if (!row.paid) return json(402, { error: "Pay to unlock the desk" });
    return json(200, { ok: true, token: row.token, email: row.email, name: row.name, must_change_password: !!row.must_change_password });
  }

  if (action === "change") {
    const token = String(body.token || "");
    const next = String(body.password || "");
    if (next.length < 8) return json(400, { error: "Use at least 8 characters" });
    // find by token — scan is small; store also by token
    const emailKey = await s.get("tok:" + token, { type: "text" });
    const row = emailKey ? await s.get("user:" + emailKey, { type: "json" }) : null;
    if (!row) return json(401, { error: "Not signed in" });
    const hashed = hash(next);
    row.password_hash = hashed.hash;
    row.password_salt = hashed.salt;
    row.must_change_password = false;
    delete row.temp_password;
    await s.setJSON("user:" + row.email, row);
    return json(200, { ok: true });
  }

  if (action === "mark-paid") {
    const row = email ? await s.get("user:" + email, { type: "json" }) : null;
    if (!row) return json(404, { error: "No account for that email" });
    row.paid = true;
    row.paidAt = new Date().toISOString();
    await s.setJSON("user:" + email, row);
    await s.set("tok:" + row.token, email);
    return json(200, { ok: true, token: row.token, temp: row.temp_password || "" });
  }

  return json(400, { error: "Unknown action" });
};
