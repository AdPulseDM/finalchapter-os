// Shared server logic for FinalChapter functions.
// Pure helpers take a Blobs-like store ({get, set, setJSON, delete, list}) so they can be unit-tested with an in-memory store.
import crypto from "node:crypto";

// Plan entitlements are enforced server-side (see netlify/lib/estates.mjs).
export const PLANS = {
  executor: { name: "FinalChapter Executor", amount: 4900, rank: 1, maxEstates: 1, circle: false, costs: false, share: false, clientList: false },
  family: { name: "FinalChapter Family", amount: 8900, rank: 2, maxEstates: 1, circle: true, costs: true, share: true, clientList: false },
  professional: { name: "FinalChapter Professional", amount: 19900, rank: 3, maxEstates: 5, circle: true, costs: true, share: true, clientList: true },
};
// One-time add-ons any paid plan can buy once per account (enforced in markAddon and documents.mjs).
export const ADDONS = {
  printkit: { name: "FinalChapter Print kit", amount: 2900 },
};
export function normAddon(v) {
  return Object.prototype.hasOwnProperty.call(ADDONS, v) ? v : "";
}
export function hasAddon(user, addon) {
  return !!(user && user.paid && user.addons && user.addons[addon]);
}
export const RETENTION_MS = 3 * 365 * 24 * 60 * 60 * 1000; // 3 years after last activity
export function planFromAmount(amount) {
  const a = Number(amount);
  return Object.keys(PLANS).find((k) => PLANS[k].amount === a) || "";
}
export function upgradePrice(fromPlan, toPlan) {
  const f = PLANS[fromPlan], t = PLANS[toPlan];
  if (!f || !t || t.rank <= f.rank) return 0;
  return t.amount - f.amount;
}
export function entitlements(plan) {
  const p = PLANS[plan];
  if (!p) return null;
  const { maxEstates, circle, costs, share, clientList } = p;
  return { plan, maxEstates, circle, costs, share, clientList };
}
export const CURRENCY = "cad";
export const CLIENT_SESSION_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
export const ADMIN_SESSION_MS = 8 * 60 * 60 * 1000; // 8 hours
export const WEBHOOK_TOLERANCE_S = 300;

export function env(name) {
  const v = globalThis.Netlify?.env?.get?.(name);
  return v ?? process.env[name] ?? "";
}

export function json(status, body) {
  return Response.json(body, {
    status,
    headers: { "x-content-type-options": "nosniff", "x-frame-options": "DENY", "cache-control": "no-store" },
  });
}

// ---------- validation ----------
const EMAIL_RE = /^[^\s@<>"']{1,64}@[^\s@<>"']{1,190}\.[^\s@<>"']{2,63}$/;
export function normEmail(v) {
  const e = String(v || "").trim().toLowerCase();
  return EMAIL_RE.test(e) && e.length <= 254 ? e : "";
}
export function normName(v) {
  const n = String(v || "").replace(/[\u0000-\u001f<>]/g, "").trim();
  return n.length >= 1 && n.length <= 120 ? n : "";
}
export function normPlan(v) {
  return Object.prototype.hasOwnProperty.call(PLANS, v) ? v : "";
}
export function validPassword(v) {
  return typeof v === "string" && v.length >= 10 && v.length <= 200;
}

// ---------- passwords (scrypt + per-user salt) ----------
const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64 };
export function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  const hash = crypto.scryptSync(password, salt, SCRYPT.keylen, { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p }).toString("hex");
  return { salt, hash, algo: "scrypt-16384-8-1" };
}
export function verifyPassword(password, salt, hash) {
  if (typeof password !== "string" || !salt || !hash) return false;
  const a = Buffer.from(hashPassword(password, salt).hash, "hex");
  const b = Buffer.from(String(hash), "hex");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
export function safeEqual(a, b) {
  const ha = crypto.createHash("sha256").update(String(a)).digest();
  const hb = crypto.createHash("sha256").update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}
export function randomToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString("base64url");
}
export function newWorkspaceCode() {
  // 15 chars from an unambiguous alphabet ≈ 75 bits of entropy.
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.randomBytes(15);
  let s = "";
  for (const b of bytes) s += alphabet[b % 32];
  return "FC-" + s.slice(0, 5) + "-" + s.slice(5, 10) + "-" + s.slice(10, 15);
}

// ---------- users ----------
export function publicUser(u) {
  if (!u) return null;
  const addons = {};
  for (const k of Object.keys(ADDONS)) if (hasAddon(u, k)) addons[k] = true;
  return { email: u.email, name: u.name, plan: u.plan, paid: !!u.paid, paidAt: u.paidAt || null, entitlements: u.paid ? entitlements(u.plan) : null, addons };
}
export async function getUser(store, email) {
  const e = normEmail(email);
  if (!e) return null;
  return await store.get("user:" + e, { type: "json" });
}
export async function createUser(store, { name, email, password, plan }) {
  const e = normEmail(email), n = normName(name), p = normPlan(plan);
  if (!e || !n || !p) return { error: "Enter a valid name, email and plan.", status: 400 };
  if (!validPassword(password)) return { error: "Use a password of at least 10 characters.", status: 400 };
  const existing = await getUser(store, e);
  if (existing) return { error: "An account with this email already exists. Log in instead.", status: 409 };
  const h = hashPassword(password);
  const user = {
    id: crypto.randomBytes(8).toString("hex"),
    email: e, name: n, plan: p,
    password_hash: h.hash, password_salt: h.salt, password_algo: h.algo,
    paid: false, createdAt: new Date().toISOString(),
  };
  await store.setJSON("user:" + e, user);
  return { user };
}

// ---------- sessions (random token, server-side record with expiry) ----------
export async function createSession(store, { email, role }, now = Date.now()) {
  const token = randomToken(32);
  const ttl = role === "admin" ? ADMIN_SESSION_MS : CLIENT_SESSION_MS;
  await store.setJSON("sess:" + token, { email, role, exp: now + ttl, createdAt: now });
  return { token, exp: now + ttl };
}
export async function getSession(store, token, now = Date.now()) {
  const t = String(token || "");
  if (!/^[A-Za-z0-9_-]{40,64}$/.test(t)) return null;
  const s = await store.get("sess:" + t, { type: "json" });
  if (!s) return null;
  if (!s.exp || s.exp < now) { await store.delete("sess:" + t); return null; }
  return s;
}
export async function deleteSession(store, token) {
  const t = String(token || "");
  if (t) await store.delete("sess:" + t);
}
export function bearer(req, body) {
  const h = req.headers.get("authorization") || "";
  if (h.toLowerCase().startsWith("bearer ")) return h.slice(7).trim();
  return String(body?.token || "");
}

// ---------- admin (env only, fail closed) ----------
export function adminConfig() {
  const email = normEmail(env("ADMIN_EMAIL"));
  const password = env("ADMIN_PASSWORD");
  if (!email || !password || password.length < 12) return null;
  return { email, password };
}

// ---------- payment (internal only: called from webhook / verified session) ----------
// kind "purchase": first payment for `plan`, amount must equal PLANS[plan].amount.
// kind "upgrade": pays the difference from `fromPlan` to `plan`; only moves the account UP a tier.
export async function markPaid(store, { email, plan, kind = "purchase", fromPlan, stripeSessionId, amountTotal, currency }) {
  const user = await getUser(store, email);
  if (!user) return { error: "No account for that email", status: 404 };
  if (currency && String(currency).toLowerCase() !== CURRENCY) return { error: "Currency mismatch", status: 400 };
  if (stripeSessionId) {
    const seen = await store.get("stripe:" + stripeSessionId, { type: "json" });
    if (seen) return { user, already: true };
  }
  let p = normPlan(plan);
  if (kind === "upgrade") {
    const from = normPlan(fromPlan);
    const expected = upgradePrice(from, p);
    if (!p || !from || !expected) return { error: "Invalid upgrade", status: 400 };
    if (amountTotal != null && Number(amountTotal) !== expected) return { error: "Amount does not match upgrade price", status: 400 };
    if (!user.paid) return { error: "Upgrade requires a paid account", status: 400 };
  } else {
    if (!p && amountTotal != null) p = planFromAmount(amountTotal);
    if (!p) return { error: "Unknown plan", status: 400 };
    if (amountTotal != null && Number(amountTotal) !== PLANS[p].amount) return { error: "Amount does not match plan", status: 400 };
  }
  const now = new Date().toISOString();
  const current = user.paid ? PLANS[user.plan]?.rank || 0 : 0;
  if (!user.paid || PLANS[p].rank > current) user.plan = p; // never downgrade
  user.paid = true;
  user.paidAt = user.paidAt || now;
  user.lastActiveAt = now;
  user.stripeSessionId = stripeSessionId || user.stripeSessionId || null;
  user.purchases = [...(user.purchases || []), { kind, plan: p, fromPlan: kind === "upgrade" ? fromPlan : null, amount: amountTotal ?? null, stripeSessionId: stripeSessionId || null, at: now }];
  if (!user.workspaceCode) {
    user.workspaceCode = newWorkspaceCode();
    await store.set("code:" + user.workspaceCode, user.email);
  }
  await store.setJSON("user:" + user.email, user);
  if (stripeSessionId) await store.setJSON("stripe:" + stripeSessionId, { email: user.email, plan: p, kind, at: now });
  return { user };
}

// kind "addon": a one-time add-on (e.g. the Print kit). Requires a paid plan; once per account; amount must match.
export async function markAddon(store, { email, addon, stripeSessionId, amountTotal, currency }) {
  const user = await getUser(store, email);
  if (!user) return { error: "No account for that email", status: 404 };
  if (currency && String(currency).toLowerCase() !== CURRENCY) return { error: "Currency mismatch", status: 400 };
  const a = normAddon(addon);
  if (!a) return { error: "Unknown add-on", status: 400 };
  if (stripeSessionId) {
    const seen = await store.get("stripe:" + stripeSessionId, { type: "json" });
    if (seen) return { user, already: true };
  }
  if (amountTotal != null && Number(amountTotal) !== ADDONS[a].amount) return { error: "Amount does not match add-on price", status: 400 };
  if (!user.paid) return { error: "Add-ons require a paid plan", status: 400 };
  const now = new Date().toISOString();
  if (!hasAddon(user, a)) {
    user.addons = { ...(user.addons || {}), [a]: { at: now, stripeSessionId: stripeSessionId || null } };
  }
  user.lastActiveAt = now;
  user.purchases = [...(user.purchases || []), { kind: "addon", addon: a, amount: amountTotal ?? null, stripeSessionId: stripeSessionId || null, at: now }];
  await store.setJSON("user:" + user.email, user);
  if (stripeSessionId) await store.setJSON("stripe:" + stripeSessionId, { email: user.email, addon: a, kind: "addon", at: now });
  return { user };
}

// The Stripe account is shared with other apps; only sessions tagged metadata.app === APP_ID are ours.
export const APP_ID = "finalchapter";
export function isOurSession(session) {
  return !!session && session.object === "checkout.session" && session.metadata?.app === APP_ID;
}

// Apply a Stripe Checkout Session object. Only marks paid when Stripe says payment_status === "paid".
export async function applyCheckoutSession(store, session) {
  if (!session || session.object !== "checkout.session") return { error: "Not a checkout session", status: 400 };
  if (!isOurSession(session)) return { error: "Not a FinalChapter checkout session", status: 400, foreign: true };
  if (session.payment_status !== "paid") return { error: "Payment not completed", status: 402, pending: true };
  const email = normEmail(session.metadata?.email || session.customer_email || session.customer_details?.email);
  if (!email) return { error: "Session is missing email metadata", status: 400 };
  const user = await getUser(store, email);
  if (!user) return { error: "No account for that email", status: 404 };
  // Our sessions always carry the account id in client_reference_id and metadata.userId; every id present must match.
  const ids = [session.client_reference_id, session.metadata?.userId].filter(Boolean);
  if (!ids.length || ids.some((id) => id !== user.id)) return { error: "Session does not belong to this account", status: 403 };
  const amount = session.amount_subtotal ?? session.amount_total;
  if (session.metadata?.kind === "addon") {
    return await markAddon(store, { email, addon: session.metadata?.addon, stripeSessionId: session.id, amountTotal: amount, currency: session.currency });
  }
  const kind = session.metadata?.kind === "upgrade" ? "upgrade" : "purchase";
  const plan = normPlan(session.metadata?.plan) || (kind === "purchase" ? planFromAmount(amount) : "");
  if (!plan) return { error: "Session is missing plan metadata", status: 400 };
  return await markPaid(store, { email, plan, kind, fromPlan: session.metadata?.fromPlan, stripeSessionId: session.id, amountTotal: amount, currency: session.currency });
}

// ---------- Stripe webhook signature (same scheme as stripe.webhooks.constructEvent) ----------
export function verifyStripeSignature(payload, header, secret, toleranceS = WEBHOOK_TOLERANCE_S, nowS = Math.floor(Date.now() / 1000)) {
  if (!secret) return { ok: false, error: "STRIPE_WEBHOOK_SECRET is not set" };
  if (!header) return { ok: false, error: "Missing Stripe-Signature header" };
  let t = null; const v1 = [];
  for (const part of String(header).split(",")) {
    const [k, v] = part.split("=", 2).map((x) => (x || "").trim());
    if (k === "t") t = Number(v);
    else if (k === "v1" && v) v1.push(v);
  }
  if (!t || !v1.length) return { ok: false, error: "Malformed Stripe-Signature header" };
  if (Math.abs(nowS - t) > toleranceS) return { ok: false, error: "Timestamp outside tolerance" };
  const expected = crypto.createHmac("sha256", secret).update(`${t}.${payload}`, "utf8").digest("hex");
  const exp = Buffer.from(expected, "hex");
  const match = v1.some((sig) => {
    const b = Buffer.from(sig, "hex");
    return b.length === exp.length && crypto.timingSafeEqual(b, exp);
  });
  return match ? { ok: true } : { ok: false, error: "Signature mismatch" };
}

export async function retrieveCheckoutSession(sessionId, secretKey, fetchImpl = fetch) {
  if (!/^cs_(test|live)_[A-Za-z0-9]+$/.test(String(sessionId || ""))) return { error: "Invalid session id", status: 400 };
  if (!secretKey) return { error: "STRIPE_SECRET_KEY is not set", status: 500 };
  const res = await fetchImpl("https://api.stripe.com/v1/checkout/sessions/" + encodeURIComponent(sessionId), {
    headers: { authorization: "Bearer " + secretKey },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { error: data?.error?.message || "Stripe lookup failed", status: 502 };
  return { session: data };
}
