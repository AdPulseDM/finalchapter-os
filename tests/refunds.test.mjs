import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { memStore, post, call } from "./helpers.mjs";
import { handle as auth } from "../netlify/functions/auth.mjs";
import { handle as webhook, WEBHOOK_EVENTS } from "../netlify/functions/stripe-webhook.mjs";
import { handle as verify } from "../netlify/functions/verify-checkout.mjs";
import { handle as estate } from "../netlify/functions/estate.mjs";
import { handle as documents } from "../netlify/functions/documents.mjs";
import { accessNoticeText } from "../netlify/lib/core.mjs";

const ADMIN = { email: "owner@example.com", password: "correct-horse-battery" };
const WHSEC = "whsec_test_secret";
const EMAIL = "buyer@example.com";

async function signup(store, plan = "executor") {
  const r = await call(auth, post("/api/auth", { action: "signup", name: "Buyer", email: EMAIL, password: "supersecret1", plan }), { store, admin: ADMIN });
  assert.equal(r.status, 200);
  return r.body;
}
const row = (store) => store.get("user:" + EMAIL, { type: "json" });
function signed(event, secret = WHSEC) {
  const t = Math.floor(Date.now() / 1000); const payload = JSON.stringify(event);
  const sig = crypto.createHmac("sha256", secret).update(`${t}.${payload}`).digest("hex");
  return new Request("https://example.test/api/stripe-webhook", { method: "POST", headers: { "stripe-signature": `t=${t},v1=${sig}` }, body: payload });
}
function session(u, { id, pi, kind = "purchase", plan = "executor", fromPlan, addon, amount }) {
  const metadata = { app: "finalchapter", email: u.email, userId: u.id, plan, kind };
  if (fromPlan) metadata.fromPlan = fromPlan;
  if (addon) metadata.addon = addon;
  return { id, object: "checkout.session", payment_status: "paid", client_reference_id: u.id, customer_email: u.email, payment_intent: pi, metadata, amount_subtotal: amount, amount_total: amount, currency: "cad" };
}
const completed = (s) => ({ id: "evt_c_" + s.id, type: "checkout.session.completed", data: { object: s } });
const refunded = (pi, amount, amount_refunded = amount, metadata = {}) => ({ id: "evt_r_" + pi, type: "charge.refunded", data: { object: { id: "ch_" + pi, object: "charge", payment_intent: pi, amount, amount_refunded, refunded: amount_refunded >= amount, metadata } } });
const dispute = (type, pi, status = "needs_response") => ({ id: "evt_" + type + pi, type, data: { object: { id: "dp_" + pi, object: "dispute", charge: "ch_" + pi, payment_intent: pi, status } } });
const noStripe = async () => { throw new Error("Stripe should not be called"); };
const deps = (store, extra = {}) => ({ store, secret: WHSEC, secretKey: "sk_test_x", fetchImpl: noStripe, ...extra });
async function buy(store, u, opts) { const r = await call(webhook, signed(completed(session(u, opts))), deps(store)); assert.equal(r.body.applied, true); }

test("webhook endpoint event list includes refunds and disputes", () => {
  assert.deepEqual(WEBHOOK_EVENTS, ["checkout.session.completed", "checkout.session.async_payment_succeeded", "charge.refunded", "charge.dispute.created", "charge.dispute.closed"]);
});

test("unlock records payment intent, kind, plan and the plan before, idempotently", async () => {
  const store = memStore(); await signup(store); const u = await row(store);
  await buy(store, u, { id: "cs_test_p1", pi: "pi_p1", amount: 4900 });
  await call(webhook, signed(completed(session(u, { id: "cs_test_p1", pi: "pi_p1", amount: 4900 }))), deps(store)); // replay
  const after = await row(store);
  assert.equal(after.purchases.length, 1);
  assert.deepEqual({ ...after.purchases[0], at: undefined }, { kind: "purchase", plan: "executor", fromPlan: null, amount: 4900, stripeSessionId: "cs_test_p1", paymentIntent: "pi_p1", before: { paid: false, plan: "executor" }, at: undefined });
  assert.deepEqual(await store.get("pi:pi_p1", { type: "json" }), { email: EMAIL, stripeSessionId: "cs_test_p1" });
});

test("full refund of a purchase locks the plan, keeps estate data, shows a message, and is idempotent", async () => {
  const store = memStore(); const estates = memStore(); const s = await signup(store); const u = await row(store);
  await buy(store, u, { id: "cs_test_p1", pi: "pi_p1", amount: 4900 });
  const list = await call(estate, post("/api/estate", { action: "list" }, s.token), { store, estates });
  const id = list.body.estates[0].id;
  await call(estate, post("/api/estate", { action: "save", estateId: id, desk: { dod: "2025-03-01" } }, s.token), { store, estates });
  const r = await call(webhook, signed(refunded("pi_p1", 4900)), deps(store));
  assert.equal(r.status, 200); assert.equal(r.body.applied, true); assert.equal(r.body.revoked, "purchase");
  const after = await row(store);
  assert.equal(after.paid, false);
  assert.equal(after.purchases[0].revoked.reason, "refund");
  const me = await call(auth, post("/api/auth", { action: "me" }, s.token), { store, admin: ADMIN });
  assert.equal(me.body.user.paid, false); assert.equal(me.body.user.entitlements, null); assert.equal(me.body.workspaceCode, undefined);
  assert.equal(me.body.user.notice, "This payment was refunded, so the Executor plan is no longer active. Contact support if this is a mistake.");
  const locked = await call(estate, post("/api/estate", { action: "list" }, s.token), { store, estates });
  assert.equal(locked.status, 402); assert.match(locked.body.error, /refunded/);
  const docs = await call(documents, post("/api/documents", { action: "letter", estateId: id, format: "pdf" }, s.token), { store, estates });
  assert.equal(docs.status, 402);
  assert.equal((await estates.get(`est:${EMAIL}:${id}`, { type: "json" })).desk.dod, "2025-03-01", "estate data kept");
  const red = await call(auth, post("/api/auth", { action: "redeem", code: after.workspaceCode }), { store, admin: ADMIN });
  assert.equal(red.status, 401, "backup code no longer opens a locked account");
  // replays of the refund and of the original checkout do not unlock or double-apply
  const again = await call(webhook, signed(refunded("pi_p1", 4900)), deps(store));
  assert.equal(again.body.already, true);
  await call(webhook, signed(completed(session(u, { id: "cs_test_p1", pi: "pi_p1", amount: 4900 }))), deps(store));
  assert.equal((await row(store)).paid, false);
  const v = await call(verify, post("/api/verify-checkout", { sessionId: "cs_test_p1" }, s.token), { store, secretKey: "sk_test_x", fetchImpl: async () => new Response(JSON.stringify(session(u, { id: "cs_test_p1", pi: "pi_p1", amount: 4900 }))) });
  assert.equal(v.body.paid, false, "verify-checkout replay does not report a refunded payment as paid");
  // buying again unlocks and clears the message
  await buy(store, u, { id: "cs_test_p2", pi: "pi_p2", amount: 4900 });
  const re = await row(store); assert.equal(re.paid, true); assert.equal(re.accessNotice, undefined);
});

test("partial refunds are ignored and logged", async () => {
  const store = memStore(); await signup(store); const u = await row(store);
  await buy(store, u, { id: "cs_test_p1", pi: "pi_p1", amount: 4900 });
  const r = await call(webhook, signed(refunded("pi_p1", 4900, 1000)), deps(store));
  assert.equal(r.status, 200); assert.equal(r.body.partial, true);
  assert.equal((await row(store)).paid, true);
});

test("refunded upgrade reverts to the previous plan; refunded Print kit removes only the kit", async () => {
  const store = memStore(); const s = await signup(store); const u = await row(store);
  await buy(store, u, { id: "cs_test_p1", pi: "pi_p1", amount: 4900 });
  await buy(store, u, { id: "cs_test_u1", pi: "pi_u1", kind: "upgrade", plan: "family", fromPlan: "executor", amount: 4000 });
  await buy(store, u, { id: "cs_test_a1", pi: "pi_a1", kind: "addon", plan: "family", addon: "printkit", amount: 2900 });
  let x = await row(store); assert.equal(x.plan, "family"); assert.ok(x.addons.printkit);
  assert.deepEqual(x.purchases[1].before, { paid: true, plan: "executor" });
  await call(webhook, signed(refunded("pi_a1", 2900)), deps(store));
  x = await row(store); assert.equal(x.paid, true); assert.equal(x.plan, "family"); assert.equal(x.addons.printkit, undefined);
  let me = await call(auth, post("/api/auth", { action: "me" }, s.token), { store, admin: ADMIN });
  assert.match(me.body.user.notice, /Print kit payment was refunded/);
  await call(webhook, signed(refunded("pi_u1", 4000)), deps(store));
  x = await row(store); assert.equal(x.paid, true); assert.equal(x.plan, "executor");
  me = await call(auth, post("/api/auth", { action: "me" }, s.token), { store, admin: ADMIN });
  assert.equal(me.body.user.notice, "The upgrade payment was refunded, so the account is back on the Executor plan. Contact support if this is a mistake.");
  assert.equal(me.body.user.entitlements.plan, "executor");
});

test("dispute locks; dispute won restores; dispute lost keeps it locked", async () => {
  const store = memStore(); await signup(store); const u = await row(store);
  await buy(store, u, { id: "cs_test_p1", pi: "pi_p1", amount: 4900 });
  await call(webhook, signed(dispute("charge.dispute.created", "pi_p1")), deps(store));
  let x = await row(store); assert.equal(x.paid, false); assert.match(accessNoticeText(x.accessNotice), /disputed/);
  await call(webhook, signed(dispute("charge.dispute.closed", "pi_p1", "won")), deps(store));
  x = await row(store); assert.equal(x.paid, true); assert.equal(x.accessNotice, undefined); assert.equal(x.purchases[0].revoked, undefined);
  await call(webhook, signed(dispute("charge.dispute.created", "pi_p1")), deps(store));
  await call(webhook, signed(dispute("charge.dispute.closed", "pi_p1", "lost")), deps(store));
  assert.equal((await row(store)).paid, false);
  // a refund-revocation is never restored by a dispute event
  await buy(store, u, { id: "cs_test_p2", pi: "pi_p2", amount: 4900 });
  await call(webhook, signed(refunded("pi_p2", 4900)), deps(store));
  await call(webhook, signed(dispute("charge.dispute.closed", "pi_p2", "won")), deps(store));
  assert.equal((await row(store)).paid, false);
});

test("older purchases without a stored payment intent are found via the Stripe checkout session lookup", async () => {
  const store = memStore(); await signup(store); const u = await row(store);
  // simulate an unlock recorded before payment intents were stored
  await buy(store, u, { id: "cs_live_old1", pi: undefined, amount: 4900 });
  assert.equal((await row(store)).purchases[0].paymentIntent, null);
  let calledUrl, auth;
  const fetchImpl = async (url, init) => { calledUrl = url; auth = init.headers.authorization; return new Response(JSON.stringify({ object: "list", data: [session(u, { id: "cs_live_old1", pi: "pi_old1", amount: 4900 })] })); };
  const r = await call(webhook, signed(refunded("pi_old1", 4900, 4900, { app: "finalchapter" })), deps(store, { fetchImpl }));
  assert.equal(r.body.applied, true);
  assert.equal(calledUrl, "https://api.stripe.com/v1/checkout/sessions?limit=1&payment_intent=pi_old1");
  assert.equal(auth, "Bearer sk_test_x");
  const x = await row(store); assert.equal(x.paid, false); assert.equal(x.purchases.length, 1); assert.equal(x.purchases[0].paymentIntent, "pi_old1");
});

test("foreign charges and disputes are acknowledged with 200 and ignored", async () => {
  const store = memStore(); await signup(store); const u = await row(store);
  await buy(store, u, { id: "cs_test_p1", pi: "pi_p1", amount: 4900 });
  // charge tagged for another app: no Stripe call at all
  let r = await call(webhook, signed(refunded("pi_other", 5000, 5000, { app: "pulsecheck" })), deps(store));
  assert.equal(r.status, 200); assert.equal(r.body.ignored, true);
  // untagged charge whose checkout session is not ours (or there is none)
  const otherSession = async () => new Response(JSON.stringify({ object: "list", data: [{ id: "cs_live_x", object: "checkout.session", metadata: { app: "adpulse" } }] }));
  r = await call(webhook, signed(refunded("pi_other", 5000)), deps(store, { fetchImpl: otherSession }));
  assert.equal(r.status, 200); assert.equal(r.body.ignored, true);
  r = await call(webhook, signed(dispute("charge.dispute.created", "pi_none")), deps(store, { fetchImpl: async () => new Response(JSON.stringify({ object: "list", data: [] })) }));
  assert.equal(r.status, 200); assert.equal(r.body.ignored, true);
  r = await call(webhook, signed({ id: "evt_x", type: "charge.refunded", data: { object: { id: "ch_x", object: "charge", payment_intent: null, amount: 1, amount_refunded: 1 } } }), deps(store));
  assert.equal(r.status, 200); assert.equal(r.body.ignored, true);
  assert.equal((await row(store)).paid, true);
  // Stripe unreachable: 500 so Stripe retries
  r = await call(webhook, signed(refunded("pi_unknown", 5000)), deps(store, { fetchImpl: async () => new Response("{}", { status: 500 }) }));
  assert.equal(r.status, 500);
  // bad signature still rejected
  assert.equal((await call(webhook, signed(refunded("pi_p1", 4900), "whsec_wrong"), deps(store))).status, 400);
  assert.equal((await row(store)).paid, true);
});
