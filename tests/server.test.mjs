import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { memStore, post, call } from "./helpers.mjs";
import { handle as auth } from "../netlify/functions/auth.mjs";
import { handle as checkout } from "../netlify/functions/checkout.mjs";
import { handle as webhook } from "../netlify/functions/stripe-webhook.mjs";
import { handle as verify } from "../netlify/functions/verify-checkout.mjs";
import { handle as estate } from "../netlify/functions/estate.mjs";
import { verifyStripeSignature, hashPassword } from "../netlify/lib/core.mjs";

const ADMIN = { email: "owner@example.com", password: "correct-horse-battery" };
const WHSEC = "whsec_test_secret";

async function signup(store, email = "buyer@example.com", plan = "family") {
  const r = await call(auth, post("/api/auth", { action: "signup", name: "Buyer", email, password: "supersecret1", plan }), { store, admin: ADMIN });
  assert.equal(r.status, 200);
  return r.body;
}
function signedWebhook(event, secret = WHSEC, t = Math.floor(Date.now() / 1000)) {
  const payload = JSON.stringify(event);
  const sig = crypto.createHmac("sha256", secret).update(`${t}.${payload}`).digest("hex");
  return new Request("https://example.test/api/stripe-webhook", { method: "POST", headers: { "stripe-signature": `t=${t},v1=${sig}` }, body: payload });
}
function session(user, over = {}) {
  return { id: "cs_test_abc123", object: "checkout.session", payment_status: "paid", client_reference_id: user.id, customer_email: user.email,
    metadata: { app: "finalchapter", email: user.email, userId: user.id, plan: "family" }, amount_subtotal: 8900, amount_total: 8900, currency: "cad", ...over };
}
async function userRow(store, email = "buyer@example.com") { return store.get("user:" + email, { type: "json" }); }

test("passwords are scrypt-hashed with salt and never stored or returned in plain text", async () => {
  const store = memStore();
  const s = await signup(store);
  const raw = store._map.get("user:buyer@example.com");
  assert.ok(!raw.includes("supersecret1"));
  const u = JSON.parse(raw);
  assert.match(u.password_hash, /^[0-9a-f]{128}$/);
  assert.match(u.password_salt, /^[0-9a-f]{32}$/);
  assert.equal(u.temp_password, undefined);
  assert.ok(!JSON.stringify(s).includes("password"));
  assert.notEqual(hashPassword("x").hash, hashPassword("x").hash, "salted");
});

test("signup validates input and rejects duplicates", async () => {
  const store = memStore();
  const bad = await call(auth, post("/api/auth", { action: "signup", name: "", email: "nope", password: "short", plan: "gold" }), { store, admin: ADMIN });
  assert.equal(bad.status, 400);
  await signup(store);
  const dup = await call(auth, post("/api/auth", { action: "signup", name: "X", email: "buyer@example.com", password: "supersecret1", plan: "executor" }), { store, admin: ADMIN });
  assert.equal(dup.status, 409);
});

test("public mark-paid action no longer exists", async () => {
  const store = memStore();
  await signup(store);
  const r = await call(auth, post("/api/auth", { action: "mark-paid", email: "buyer@example.com" }), { store, admin: ADMIN });
  assert.notEqual(r.status, 200);
  assert.equal((await userRow(store)).paid, false);
});

test("unpaid user cannot open the desk; ?checkout-style claims do nothing server-side", async () => {
  const store = memStore();
  const s = await signup(store);
  const me = await call(auth, post("/api/auth", { action: "me" }, s.token), { store, admin: ADMIN });
  assert.equal(me.body.user.paid, false);
  assert.equal(me.body.workspaceCode, undefined);
  const load = await call(estate, post("/api/estate", { action: "load", checkout: "family", paid: true }, s.token), { store, estates: memStore() });
  assert.equal(load.status, 402);
});

test("arbitrary workspace codes are rejected", async () => {
  const store = memStore();
  for (const code of ["abcd", "1234", "FC-AAAAA-AAAAA-AAAAA", ""]) {
    const r = await call(auth, post("/api/auth", { action: "redeem", code }), { store, admin: ADMIN });
    assert.ok(r.status === 400 || r.status === 401, code);
  }
});

test("customers requires a real admin session, not just the admin email", async () => {
  const store = memStore();
  await signup(store);
  const noTok = await call(auth, post("/api/auth", { action: "customers", email: ADMIN.email }), { store, admin: ADMIN });
  assert.equal(noTok.status, 401);
  const client = await call(auth, post("/api/auth", { action: "login", email: "buyer@example.com", password: "supersecret1" }), { store, admin: ADMIN });
  const asClient = await call(auth, post("/api/auth", { action: "customers" }, client.body.token), { store, admin: ADMIN });
  assert.equal(asClient.status, 403);
  const wrong = await call(auth, post("/api/auth", { action: "login", email: ADMIN.email, password: "guess" }), { store, admin: ADMIN });
  assert.equal(wrong.status, 401);
  const adm = await call(auth, post("/api/auth", { action: "login", email: ADMIN.email, password: ADMIN.password }), { store, admin: ADMIN });
  assert.equal(adm.body.role, "admin");
  const list = await call(auth, post("/api/auth", { action: "customers" }, adm.body.token), { store, admin: ADMIN });
  assert.equal(list.status, 200);
  assert.equal(list.body.customers.length, 1);
  assert.ok(!JSON.stringify(list.body).includes("password"));
});

test("admin login fails closed when ADMIN_EMAIL/ADMIN_PASSWORD are not set", async () => {
  const store = memStore();
  const r = await call(auth, post("/api/auth", { action: "login", email: "admin-login@example.com", password: "" }), { store, admin: null });
  assert.equal(r.status, 400);
  const r2 = await call(auth, post("/api/auth", { action: "login", email: "admin-login@example.com", password: "anything" }), { store, admin: null });
  assert.equal(r2.status, 401);
});

test("sessions expire", async () => {
  const store = memStore();
  const s = await signup(store);
  const rec = await store.get("sess:" + s.token, { type: "json" });
  rec.exp = Date.now() - 1;
  await store.setJSON("sess:" + s.token, rec);
  const me = await call(auth, post("/api/auth", { action: "me" }, s.token), { store, admin: ADMIN });
  assert.equal(me.status, 401);
});

test("checkout requires login and puts email/user id/plan in Stripe metadata", async () => {
  const store = memStore();
  const anon = await call(checkout, post("/api/checkout", { plan: "family" }), { store, secretKey: "sk_test_x", fetchImpl: async () => { throw new Error("should not call"); } });
  assert.equal(anon.status, 401);
  const s = await signup(store);
  let sent;
  const fetchImpl = async (url, init) => { sent = { url, body: new URLSearchParams(init.body) }; return new Response(JSON.stringify({ id: "cs_test_1", url: "https://checkout.stripe.com/c/pay/cs_test_1" }), { status: 200 }); };
  const r = await call(checkout, post("/api/checkout", { plan: "family" }, s.token), { store, secretKey: "sk_test_x", fetchImpl });
  assert.equal(r.status, 200);
  const u = await userRow(store);
  assert.equal(sent.body.get("client_reference_id"), u.id);
  assert.equal(sent.body.get("metadata[email]"), "buyer@example.com");
  assert.equal(sent.body.get("metadata[plan]"), "family");
  assert.equal(sent.body.get("line_items[0][price_data][unit_amount]"), "8900");
  assert.equal(sent.body.get("line_items[0][price_data][currency]"), "cad");
  assert.ok(sent.body.get("success_url").endsWith("/?session_id={CHECKOUT_SESSION_ID}"));
});

test("webhook rejects missing/bad/stale signatures", async () => {
  const store = memStore(); await signup(store); const u = await userRow(store);
  const ev = { type: "checkout.session.completed", data: { object: session(u) } };
  const noSig = new Request("https://example.test/api/stripe-webhook", { method: "POST", body: JSON.stringify(ev) });
  assert.equal((await call(webhook, noSig, { store, secret: WHSEC })).status, 400);
  assert.equal((await call(webhook, signedWebhook(ev, "whsec_wrong"), { store, secret: WHSEC })).status, 400);
  assert.equal((await call(webhook, signedWebhook(ev, WHSEC, Math.floor(Date.now() / 1000) - 3600), { store, secret: WHSEC })).status, 400);
  assert.equal((await userRow(store)).paid, false);
  const noSecret = await call(webhook, signedWebhook(ev), { store, secret: "" });
  assert.equal(noSecret.status, 500);
});

test("signed checkout.session.completed marks paid with plan from metadata and issues a workspace code", async () => {
  const store = memStore(); const s = await signup(store, "buyer@example.com", "executor"); const u = await userRow(store);
  const r = await call(webhook, signedWebhook({ type: "checkout.session.completed", data: { object: session(u) } }), { store, secret: WHSEC });
  assert.equal(r.status, 200); assert.equal(r.body.applied, true);
  const after = await userRow(store);
  assert.equal(after.paid, true); assert.equal(after.plan, "family");
  assert.match(after.workspaceCode, /^FC-[A-Z2-9]{5}-[A-Z2-9]{5}-[A-Z2-9]{5}$/);
  const me = await call(auth, post("/api/auth", { action: "me" }, s.token), { store, admin: ADMIN });
  assert.equal(me.body.user.paid, true);
  const estates = memStore();
  const list = await call(estate, post("/api/estate", { action: "list" }, s.token), { store, estates });
  assert.equal(list.body.estates.length, 1);
  const save = await call(estate, post("/api/estate", { action: "save", estateId: list.body.estates[0].id, desk: { dod: "2025-03-01" } }, s.token), { store, estates });
  assert.equal(save.status, 200);
  const red = await call(auth, post("/api/auth", { action: "redeem", code: after.workspaceCode }), { store, admin: ADMIN });
  assert.equal(red.status, 200); assert.equal(red.body.user.paid, true);
});

test("webhook ignores unpaid sessions and mismatched amounts/owners", async () => {
  const store = memStore(); await signup(store); const u = await userRow(store);
  await call(webhook, signedWebhook({ type: "checkout.session.completed", data: { object: session(u, { payment_status: "unpaid" }) } }), { store, secret: WHSEC });
  assert.equal((await userRow(store)).paid, false);
  await call(webhook, signedWebhook({ type: "checkout.session.completed", data: { object: session(u, { amount_subtotal: 100 }) } }), { store, secret: WHSEC });
  assert.equal((await userRow(store)).paid, false);
  await call(webhook, signedWebhook({ type: "checkout.session.completed", data: { object: session(u, { client_reference_id: "someoneelse" }) } }), { store, secret: WHSEC });
  assert.equal((await userRow(store)).paid, false);
});

test("verify-checkout fallback only marks paid when Stripe says payment_status is paid", async () => {
  const store = memStore(); const s = await signup(store); const u = await userRow(store);
  const unpaidFetch = async () => new Response(JSON.stringify(session(u, { payment_status: "unpaid" })), { status: 200 });
  const r1 = await call(verify, post("/api/verify-checkout", { sessionId: "cs_test_abc123" }, s.token), { store, secretKey: "sk_test_x", fetchImpl: unpaidFetch });
  assert.equal(r1.body.paid, false); assert.equal((await userRow(store)).paid, false);
  const bad = await call(verify, post("/api/verify-checkout", { sessionId: "not-a-session" }, s.token), { store, secretKey: "sk_test_x", fetchImpl: unpaidFetch });
  assert.equal(bad.status, 400);
  let calledUrl;
  const paidFetch = async (url) => { calledUrl = url; return new Response(JSON.stringify(session(u)), { status: 200 }); };
  const anon = await call(verify, post("/api/verify-checkout", { sessionId: "cs_test_abc123" }), { store, secretKey: "sk_test_x", fetchImpl: paidFetch });
  assert.equal(anon.status, 401); assert.equal(anon.body.paid, false); assert.equal(anon.body.workspaceCode, undefined, "must be signed in");
  assert.equal((await userRow(store)).paid, false, "anonymous verify does not apply");
  const owner = await call(verify, post("/api/verify-checkout", { sessionId: "cs_test_abc123" }, s.token), { store, secretKey: "sk_test_x", fetchImpl: paidFetch });
  assert.equal(owner.body.paid, true);
  assert.equal(calledUrl, "https://api.stripe.com/v1/checkout/sessions/cs_test_abc123");
  assert.match(owner.body.workspaceCode, /^FC-/);
});

test("signature helper matches Stripe's scheme", () => {
  const t = 1700000000, payload = '{"a":1}';
  const sig = crypto.createHmac("sha256", "s").update(`${t}.${payload}`).digest("hex");
  assert.equal(verifyStripeSignature(payload, `t=${t},v1=${sig}`, "s", 300, t).ok, true);
  assert.equal(verifyStripeSignature(payload + " ", `t=${t},v1=${sig}`, "s", 300, t).ok, false);
});
