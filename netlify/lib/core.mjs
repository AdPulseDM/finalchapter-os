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
  return { email: u.email, name: u.name, plan: u.plan, paid: !!u.paid, paidAt: u.paidAt || null, entitlements: u.paid ? entitlements(u.plan) : null, addons, notice: accessNoticeText(u.accessNotice) };
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
export async function markPaid(store, { email, plan, kind = "purchase", fromPlan, stripeSessionId, paymentIntent, amountTotal, currency }) {
  const user = await getUser(store, email);
  if (!user) return { error: "No account for that email", status: 404 };
  if (currency && String(currency).toLowerCase() !== CURRENCY) return { error: "Currency mismatch", status: 400 };
  if (stripeSessionId) {
    const seen = await store.get("stripe:" + stripeSessionId, { type: "json" });
    if (seen) return { user: await backfillPaymentIntent(store, user, stripeSessionId, paymentIntent), already: true };
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
  const before = { paid: !!user.paid, plan: user.plan || null };
  const current = user.paid ? PLANS[user.plan]?.rank || 0 : 0;
  if (!user.paid || PLANS[p].rank > current) user.plan = p; // never downgrade
  user.paid = true;
  user.paidAt = user.paidAt || now;
  user.lastActiveAt = now;
  user.stripeSessionId = stripeSessionId || user.stripeSessionId || null;
  user.purchases = [...(user.purchases || []), { kind, plan: p, fromPlan: kind === "upgrade" ? fromPlan : null, amount: amountTotal ?? null, stripeSessionId: stripeSessionId || null, paymentIntent: normPI(paymentIntent) || null, before, at: now }];
  delete user.accessNotice; // a new successful payment replaces any old "refunded" notice
  if (!user.workspaceCode) {
    user.workspaceCode = newWorkspaceCode();
    await store.set("code:" + user.workspaceCode, user.email);
  }
  await store.setJSON("user:" + user.email, user);
  if (stripeSessionId) await store.setJSON("stripe:" + stripeSessionId, { email: user.email, plan: p, kind, paymentIntent: normPI(paymentIntent) || null, at: now });
  await indexPaymentIntent(store, paymentIntent, user.email, stripeSessionId);
  return { user };
}

// kind "addon": a one-time add-on (e.g. the Print kit). Requires a paid plan; once per account; amount must match.
export async function markAddon(store, { email, addon, stripeSessionId, paymentIntent, amountTotal, currency }) {
  const user = await getUser(store, email);
  if (!user) return { error: "No account for that email", status: 404 };
  if (currency && String(currency).toLowerCase() !== CURRENCY) return { error: "Currency mismatch", status: 400 };
  const a = normAddon(addon);
  if (!a) return { error: "Unknown add-on", status: 400 };
  if (stripeSessionId) {
    const seen = await store.get("stripe:" + stripeSessionId, { type: "json" });
    if (seen) return { user: await backfillPaymentIntent(store, user, stripeSessionId, paymentIntent), already: true };
  }
  if (amountTotal != null && Number(amountTotal) !== ADDONS[a].amount) return { error: "Amount does not match add-on price", status: 400 };
  if (!user.paid) return { error: "Add-ons require a paid plan", status: 400 };
  const now = new Date().toISOString();
  const before = { paid: !!user.paid, plan: user.plan || null, addon: hasAddon(user, a) };
  if (!hasAddon(user, a)) {
    user.addons = { ...(user.addons || {}), [a]: { at: now, stripeSessionId: stripeSessionId || null } };
  }
  user.lastActiveAt = now;
  user.purchases = [...(user.purchases || []), { kind: "addon", addon: a, plan: user.plan || null, amount: amountTotal ?? null, stripeSessionId: stripeSessionId || null, paymentIntent: normPI(paymentIntent) || null, before, at: now }];
  delete user.accessNotice;
  await store.setJSON("user:" + user.email, user);
  if (stripeSessionId) await store.setJSON("stripe:" + stripeSessionId, { email: user.email, addon: a, kind: "addon", paymentIntent: normPI(paymentIntent) || null, at: now });
  await indexPaymentIntent(store, paymentIntent, user.email, stripeSessionId);
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
  const paymentIntent = normPI(session.payment_intent);
  if (session.metadata?.kind === "addon") {
    return await markAddon(store, { email, addon: session.metadata?.addon, stripeSessionId: session.id, paymentIntent, amountTotal: amount, currency: session.currency });
  }
  const kind = session.metadata?.kind === "upgrade" ? "upgrade" : "purchase";
  const plan = normPlan(session.metadata?.plan) || (kind === "purchase" ? planFromAmount(amount) : "");
  if (!plan) return { error: "Session is missing plan metadata", status: 400 };
  return await markPaid(store, { email, plan, kind, fromPlan: session.metadata?.fromPlan, stripeSessionId: session.id, paymentIntent, amountTotal: amount, currency: session.currency });
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

// ---------- refunds and disputes (revoke / restore access) ----------
// Every unlock records { kind, plan, fromPlan, addon, paymentIntent, before:{paid,plan} } in user.purchases, plus a
// "pi:<payment_intent>" index, so a refund or dispute on that payment can be mapped back to exactly what it bought.
// Revoking never deletes estates or other data; it only locks paid features (retention still applies: 3 years).
export function normPI(v) {
  const id = typeof v === "string" ? v : v && typeof v === "object" ? v.id : "";
  return /^pi_[A-Za-z0-9]+$/.test(String(id || "")) ? id : "";
}
async function indexPaymentIntent(store, paymentIntent, email, stripeSessionId) {
  const pi = normPI(paymentIntent);
  if (pi) await store.setJSON("pi:" + pi, { email, stripeSessionId: stripeSessionId || null });
}
// Older unlocks (before payment intents were recorded) get the id filled in when Stripe re-sends the session.
async function backfillPaymentIntent(store, user, stripeSessionId, paymentIntent) {
  const pi = normPI(paymentIntent);
  if (!pi) return user;
  const entry = (user.purchases || []).find((p) => p.stripeSessionId === stripeSessionId);
  if (entry && !entry.paymentIntent) {
    entry.paymentIntent = pi;
    await store.setJSON("user:" + user.email, user);
  }
  if (!(await store.get("pi:" + pi, { type: "json" }))) await indexPaymentIntent(store, pi, user.email, stripeSessionId);
  return user;
}

const PLAN_LABEL = { executor: "Executor", family: "Family", professional: "Professional" };
export function accessNoticeText(n) {
  if (!n || typeof n !== "object") return null;
  const what = n.reason === "dispute" ? "disputed" : "refunded";
  const tail = " Contact support if this is a mistake.";
  if (n.kind === "addon") return `The Print kit payment was ${what}, so the Print kit is no longer included.` + tail;
  if (n.kind === "upgrade") return `The upgrade payment was ${what}, so the account is back on the ${PLAN_LABEL[n.fromPlan] || "previous"} plan.` + tail;
  return `This payment was ${what}, so the ${PLAN_LABEL[n.plan] ? PLAN_LABEL[n.plan] + " " : ""}plan is no longer active.` + tail;
}

function findPurchase(user, pi, sessionId) {
  return (user.purchases || []).find((p) => (pi && p.paymentIntent === pi) || (sessionId && p.stripeSessionId === sessionId));
}

// Finds which Final Chapter purchase a payment intent belongs to: stored history first, then Stripe
// (GET /v1/checkout/sessions?payment_intent=...) and only sessions tagged metadata.app === APP_ID.
export async function findPurchaseByPaymentIntent(store, paymentIntent, { secretKey, fetchImpl = fetch } = {}) {
  const pi = normPI(paymentIntent);
  if (!pi) return { foreign: true, why: "no payment_intent" };
  const idx = await store.get("pi:" + pi, { type: "json" });
  if (idx?.email) return { email: idx.email, paymentIntent: pi, stripeSessionId: idx.stripeSessionId || null, source: "history" };
  if (!secretKey) return { error: "STRIPE_SECRET_KEY is not set (cannot look up checkout session)", status: 500 };
  let res, data;
  try {
    res = await fetchImpl("https://api.stripe.com/v1/checkout/sessions?limit=1&payment_intent=" + encodeURIComponent(pi), { headers: { authorization: "Bearer " + secretKey } });
    data = await res.json().catch(() => ({}));
  } catch (e) { return { error: "Stripe lookup failed: " + (e?.message || e), status: 502 }; }
  if (!res.ok) return { error: data?.error?.message || "Stripe lookup failed", status: 502 };
  const session = (data?.data || [])[0];
  if (!isOurSession(session)) return { foreign: true, why: "no Final Chapter checkout session" };
  const email = normEmail(session.metadata?.email || session.customer_email || session.customer_details?.email);
  const user = email ? await getUser(store, email) : null;
  if (!user) return { error: "No account for that email", status: 404 };
  const ids = [session.client_reference_id, session.metadata?.userId].filter(Boolean);
  if (!ids.length || ids.some((id) => id !== user.id)) return { error: "Session does not belong to this account", status: 403 };
  const m = session.metadata || {};
  const kind = m.kind === "upgrade" || m.kind === "addon" ? m.kind : "purchase";
  const fallback = { kind, plan: normPlan(m.plan) || null, fromPlan: kind === "upgrade" ? normPlan(m.fromPlan) || null : null, addon: kind === "addon" ? normAddon(m.addon) || null : undefined,
    amount: session.amount_subtotal ?? session.amount_total ?? null, stripeSessionId: session.id, paymentIntent: pi, at: null, backfilled: true };
  if (fallback.addon === undefined) delete fallback.addon;
  return { email: user.email, paymentIntent: pi, stripeSessionId: session.id, fallback, source: "stripe" };
}

// reason: "refund" | "dispute". Idempotent: revoking the same payment twice changes nothing.
export async function revokePurchase(store, { email, paymentIntent, stripeSessionId, fallback, reason = "refund", eventId }) {
  const user = await getUser(store, email);
  if (!user) return { error: "No account for that email", status: 404 };
  const pi = normPI(paymentIntent);
  let entry = findPurchase(user, pi, stripeSessionId);
  if (!entry && fallback) { entry = { ...fallback }; user.purchases = [...(user.purchases || []), entry]; }
  if (!entry) return { error: "No matching purchase on this account", status: 404 };
  if (pi && !entry.paymentIntent) entry.paymentIntent = pi;
  if (entry.revoked) return { user, already: true, entry };
  const now = new Date().toISOString();
  if (entry.kind === "addon") {
    const a = normAddon(entry.addon) || "printkit";
    if (user.addons && user.addons[a]) { const { [a]: _gone, ...rest } = user.addons; user.addons = rest; }
  } else if (entry.kind === "upgrade") {
    const back = normPlan(entry.fromPlan) || normPlan(entry.before?.plan);
    // Only step down if the account is still on the plan this upgrade bought (a later purchase may have moved it).
    if (user.paid && back && user.plan === entry.plan) user.plan = back;
  } else {
    user.paid = false; // locked; plan stays as the plan they would buy again. Estates and data are kept.
  }
  entry.revoked = { reason, at: now, eventId: eventId || null };
  user.accessNotice = { reason, kind: entry.kind || "purchase", plan: entry.plan || null, fromPlan: entry.fromPlan || null, addon: entry.addon || null, paymentIntent: entry.paymentIntent || null, at: now };
  await store.setJSON("user:" + user.email, user);
  if (entry.paymentIntent) await indexPaymentIntent(store, entry.paymentIntent, user.email, entry.stripeSessionId);
  return { user, entry, revoked: true };
}

// A dispute closed in our favour (won) restores exactly what the dispute removed. Refund revocations are never restored.
export async function restorePurchase(store, { email, paymentIntent, stripeSessionId, eventId }) {
  const user = await getUser(store, email);
  if (!user) return { error: "No account for that email", status: 404 };
  const entry = findPurchase(user, normPI(paymentIntent), stripeSessionId);
  if (!entry || !entry.revoked || entry.revoked.reason !== "dispute") return { user, unchanged: true };
  const now = new Date().toISOString();
  if (entry.kind === "addon") {
    const a = normAddon(entry.addon) || "printkit";
    if (user.paid) user.addons = { ...(user.addons || {}), [a]: { at: now, stripeSessionId: entry.stripeSessionId || null, restored: true } };
  } else if (entry.kind === "upgrade") {
    if (user.paid && (PLANS[entry.plan]?.rank || 0) > (PLANS[user.plan]?.rank || 0)) user.plan = entry.plan;
  } else {
    user.paid = true;
    if (!PLANS[user.plan]) user.plan = entry.plan;
  }
  entry.restored = { at: now, eventId: eventId || null, after: entry.revoked };
  delete entry.revoked;
  if (user.accessNotice && user.accessNotice.paymentIntent === entry.paymentIntent) delete user.accessNotice;
  await store.setJSON("user:" + user.email, user);
  return { user, entry, restored: true };
}
