// /api/auth — signup, login, me, logout, redeem (workspace code), change (password), customers (admin only).
// There is intentionally NO public "mark-paid" action. Payment is recorded only by
// stripe-webhook.mjs (signed Stripe event) or verify-checkout.mjs (session fetched from Stripe).
import {
  json, normEmail, validPassword, verifyPassword, hashPassword, safeEqual,
  createUser, getUser, publicUser, createSession, getSession, deleteSession, bearer, adminConfig,
} from "../lib/core.mjs";
import { usersStore } from "../lib/store.mjs";

export async function handle(req, { store, admin = adminConfig() }) {
  if (req.method !== "POST") return json(405, { error: "Use POST" });
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") return json(400, { error: "JSON body required" });
  const action = String(body.action || "");

  if (action === "signup") {
    const made = await createUser(store, body);
    if (made.error) return json(made.status, { error: made.error });
    const s = await createSession(store, { email: made.user.email, role: "client" });
    return json(200, { ok: true, token: s.token, exp: s.exp, user: publicUser(made.user) });
  }

  if (action === "login") {
    const email = normEmail(body.email);
    const password = typeof body.password === "string" ? body.password : "";
    if (!email || !password) return json(400, { error: "Email and password required" });
    if (admin && email === admin.email) {
      if (!safeEqual(password, admin.password)) return json(401, { error: "Invalid email or password" });
      const s = await createSession(store, { email, role: "admin" });
      return json(200, { ok: true, role: "admin", token: s.token, exp: s.exp });
    }
    const user = await getUser(store, email);
    if (!user || !verifyPassword(password, user.password_salt, user.password_hash)) return json(401, { error: "Invalid email or password" });
    const s = await createSession(store, { email, role: "client" });
    return json(200, { ok: true, role: "client", token: s.token, exp: s.exp, user: publicUser(user) });
  }

  if (action === "redeem") {
    const code = String(body.code || "").trim().toUpperCase();
    if (!/^FC-[A-Z2-9]{5}-[A-Z2-9]{5}-[A-Z2-9]{5}$/.test(code)) return json(400, { error: "That code is not valid" });
    const email = await store.get("code:" + code, { type: "text" });
    const user = email ? await getUser(store, email) : null;
    if (!user || !user.paid || user.workspaceCode !== code) return json(401, { error: "That code is not valid" });
    const s = await createSession(store, { email: user.email, role: "client" });
    return json(200, { ok: true, role: "client", token: s.token, exp: s.exp, user: publicUser(user) });
  }

  // Everything below needs a valid session.
  const sess = await getSession(store, bearer(req, body));
  if (!sess) return json(401, { error: "Not signed in or session expired" });

  if (action === "me") {
    if (sess.role === "admin") return json(200, { ok: true, role: "admin", email: sess.email });
    const user = await getUser(store, sess.email);
    if (!user) return json(401, { error: "Account not found" });
    return json(200, { ok: true, role: "client", user: publicUser(user), workspaceCode: user.paid ? user.workspaceCode : undefined });
  }

  if (action === "logout") {
    await deleteSession(store, bearer(req, body));
    return json(200, { ok: true });
  }

  if (action === "change") {
    if (sess.role !== "client") return json(400, { error: "Admin password is set with the ADMIN_PASSWORD environment variable" });
    const user = await getUser(store, sess.email);
    if (!user || !verifyPassword(String(body.currentPassword || ""), user.password_salt, user.password_hash)) return json(401, { error: "Current password is wrong" });
    if (!validPassword(body.password)) return json(400, { error: "Use a password of at least 10 characters" });
    const h = hashPassword(body.password);
    user.password_hash = h.hash; user.password_salt = h.salt; user.password_algo = h.algo;
    await store.setJSON("user:" + user.email, user);
    return json(200, { ok: true });
  }

  if (action === "customers") {
    if (sess.role !== "admin" || !admin || sess.email !== admin.email) return json(403, { error: "Admin only" });
    const list = await store.list({ prefix: "user:" });
    const rows = [];
    for (const blob of list.blobs || []) {
      const u = await store.get(blob.key, { type: "json" });
      if (u) rows.push({ email: u.email, name: u.name, plan: u.plan, paid: !!u.paid, createdAt: u.createdAt, paidAt: u.paidAt || null });
    }
    return json(200, { customers: rows });
  }

  return json(400, { error: "Unknown action" });
}

export default async (req) => handle(req, { store: usersStore() });
