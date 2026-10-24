import { test } from "node:test";
import assert from "node:assert/strict";
import { memStore, post, call } from "./helpers.mjs";
import { handle as auth } from "../netlify/functions/auth.mjs";
import { handle as checkout } from "../netlify/functions/checkout.mjs";
import { handle as verify } from "../netlify/functions/verify-checkout.mjs";
import { handle as estate } from "../netlify/functions/estate.mjs";
import { runRetention } from "../netlify/functions/retention.mjs";
import { planFromAmount, upgradePrice, applyCheckoutSession, RETENTION_MS } from "../netlify/lib/core.mjs";

const ADMIN = { email: "owner@example.com", password: "correct-horse-battery" };
let n = 0;
function stripeSession(user, plan, amount, over = {}) {
  return { id: "cs_test_" + ++n, object: "checkout.session", payment_status: "paid", client_reference_id: user.id, customer_email: user.email,
    metadata: { app: "finalchapter", email: user.email, userId: user.id, plan, ...(over.metadata || {}) }, amount_subtotal: amount, amount_total: amount, currency: "cad", ...over, ...(over.metadata ? { metadata: { app: "finalchapter", email: user.email, userId: user.id, plan, ...over.metadata } } : {}) };
}
async function paidUser(store, plan, email = plan + "@example.com") {
  const r = await call(auth, post("/api/auth", { action: "signup", name: "Buyer", email, password: "supersecret1", plan }), { store, admin: ADMIN });
  assert.equal(r.status, 200);
  const u = await store.get("user:" + email, { type: "json" });
  const amounts = { executor: 4900, family: 8900, professional: 19900 };
  const a = await applyCheckoutSession(store, stripeSession(u, plan, amounts[plan]));
  assert.ok(!a.error, a.error);
  return { token: r.body.token, email };
}
const E = (deps, token, body) => call(estate, post("/api/estate", body, token), deps);

test("amounts map to plan ids and upgrade prices are the difference", () => {
  assert.equal(planFromAmount(4900), "executor");
  assert.equal(planFromAmount(8900), "family");
  assert.equal(planFromAmount(19900), "professional");
  assert.equal(planFromAmount(5000), "");
  assert.equal(upgradePrice("executor", "family"), 4000);
  assert.equal(upgradePrice("executor", "professional"), 15000);
  assert.equal(upgradePrice("family", "professional"), 11000);
  assert.equal(upgradePrice("family", "executor"), 0);
  assert.equal(upgradePrice("professional", "professional"), 0);
});

test("verified Stripe session stores the plan; plan derived from amount when metadata plan is missing", async () => {
  const store = memStore();
  await call(auth, post("/api/auth", { action: "signup", name: "B", email: "b@example.com", password: "supersecret1", plan: "executor" }), { store, admin: ADMIN });
  const u = await store.get("user:b@example.com", { type: "json" });
  const s = stripeSession(u, "", 19900); delete s.metadata.plan;
  const r = await applyCheckoutSession(store, s);
  assert.ok(!r.error);
  const after = await store.get("user:b@example.com", { type: "json" });
  assert.equal(after.plan, "professional"); assert.equal(after.paid, true);
  assert.equal(after.purchases.length, 1);
});

test("verify-checkout stores the purchased plan", async () => {
  const store = memStore();
  const su = await call(auth, post("/api/auth", { action: "signup", name: "B", email: "v@example.com", password: "supersecret1", plan: "executor" }), { store, admin: ADMIN });
  const u = await store.get("user:v@example.com", { type: "json" });
  const sess = stripeSession(u, "professional", 19900);
  const fetchImpl = async () => new Response(JSON.stringify(sess), { status: 200 });
  const r = await call(verify, post("/api/verify-checkout", { sessionId: sess.id }, su.body.token), { store, fetchImpl, secretKey: "sk_test_x" });
  assert.equal(r.status, 200); assert.equal(r.body.user.plan, "professional");
  assert.equal(r.body.user.entitlements.maxEstates, 5);
});

test("Executor and Family: exactly one estate, can rename it, cannot create a second or archive", async () => {
  for (const plan of ["executor", "family"]) {
    const store = memStore(), estates = memStore(); const d = { store, estates };
    const { token } = await paidUser(store, plan);
    const list = await E(d, token, { action: "list" });
    assert.equal(list.status, 200); assert.equal(list.body.estates.length, 1);
    assert.equal(list.body.entitlements.maxEstates, 1);
    const c = await E(d, token, { action: "create", name: "Second" });
    assert.equal(c.status, 403, plan);
    assert.equal((await E(d, token, { action: "list" })).body.estates.length, 1);
    // any paid plan can rename its own estate; archive stays a Professional client-list feature
    const id = list.body.estates[0].id;
    const ren = await E(d, token, { action: "rename", estateId: id, name: "Estate of M. Rossi" });
    assert.equal(ren.status, 200, plan); assert.equal(ren.body.estate.name, "Estate of M. Rossi");
    assert.equal((await E(d, token, { action: "list" })).body.estates.length, 1, "rename does not create an estate");
    assert.equal((await E(d, token, { action: "rename", estateId: id, name: "" })).status, 400);
    assert.equal((await E(d, token, { action: "archive", estateId: id })).status, 403);
  }
});

test("Professional: up to 5 estates (archived count), rename/archive/restore, archived is read-only", async () => {
  const store = memStore(), estates = memStore(); const d = { store, estates };
  const { token } = await paidUser(store, "professional");
  const first = await E(d, token, { action: "list" });
  assert.equal(first.body.estates.length, 1);
  for (let i = 2; i <= 5; i++) assert.equal((await E(d, token, { action: "create", name: "Client " + i })).status, 200);
  const sixth = await E(d, token, { action: "create", name: "Client 6" });
  assert.equal(sixth.status, 403);
  const list = (await E(d, token, { action: "list" })).body.estates;
  assert.equal(list.length, 5);
  const id = list[1].id;
  const ren = await E(d, token, { action: "rename", estateId: id, name: "Estate of A. Smith" });
  assert.equal(ren.status, 200); assert.equal(ren.body.estate.name, "Estate of A. Smith");
  assert.equal((await E(d, token, { action: "archive", estateId: id })).status, 200);
  assert.equal((await E(d, token, { action: "save", estateId: id, desk: { dod: "2025-01-01" } })).status, 409);
  assert.equal((await E(d, token, { action: "create", name: "Client 6" })).status, 403, "archiving does not free a slot");
  assert.equal((await E(d, token, { action: "restore", estateId: id })).status, 200);
  assert.equal((await E(d, token, { action: "save", estateId: id, desk: { dod: "2025-01-01" } })).status, 200);
  const load = await E(d, token, { action: "load", estateId: id });
  assert.equal(load.body.desk.dod, "2025-01-01");
});

test("estates are isolated per account", async () => {
  const store = memStore(), estates = memStore(); const d = { store, estates };
  const a = await paidUser(store, "professional", "a@example.com");
  const b = await paidUser(store, "professional", "b@example.com");
  const aId = (await E(d, a.token, { action: "list" })).body.estates[0].id;
  await E(d, b.token, { action: "list" });
  assert.equal((await E(d, b.token, { action: "load", estateId: aId })).status, 404);
  assert.equal((await E(d, b.token, { action: "save", estateId: aId, desk: {} })).status, 404);
  assert.equal((await E(d, b.token, { action: "rename", estateId: aId, name: "pwn" })).status, 404);
});

test("Circle and cost tracker are stored only for Family/Professional", async () => {
  const desk = { dod: "2025-02-01", costs: [{ id: 1, name: "Probate", est: 100, actual: 0, paid: false }], circle: [{ name: "Ana", relation: "Sister", role: "Beneficiary" }] };
  for (const [plan, kept] of [["executor", false], ["family", true], ["professional", true]]) {
    const store = memStore(), estates = memStore(); const d = { store, estates };
    const { token } = await paidUser(store, plan);
    const id = (await E(d, token, { action: "list" })).body.estates[0].id;
    await E(d, token, { action: "save", estateId: id, desk });
    const load = (await E(d, token, { action: "load", estateId: id })).body.desk;
    assert.equal(load.dod, "2025-02-01");
    assert.equal(!!load.costs, kept, plan); assert.equal(!!load.circle, kept, plan);
  }
});

test("Family share link: read-only progress view, revocable; Executor cannot share", async () => {
  const store = memStore(), estates = memStore(); const d = { store, estates };
  const ex = await paidUser(store, "executor");
  const exId = (await E(d, ex.token, { action: "list" })).body.estates[0].id;
  assert.equal((await E(d, ex.token, { action: "share", estateId: exId })).status, 403);

  const fam = await paidUser(store, "family");
  const id = (await E(d, fam.token, { action: "list" })).body.estates[0].id;
  await E(d, fam.token, { action: "save", estateId: id, desk: { dod: "2025-02-01", value: 500000, letter: { note: "secret" }, tasks: [{ id: 1, status: "done" }], circle: [{ name: "Ana", relation: "Sister", role: "Beneficiary" }], costs: [{ id: 1, name: "x", est: 1 }] } });
  const sh = await E(d, fam.token, { action: "share", estateId: id });
  assert.equal(sh.status, 200);
  const view = await E(d, "", { action: "shared", token: sh.body.token });
  assert.equal(view.status, 200);
  assert.deepEqual(view.body.view.tasks, [{ id: 1, status: "done" }]);
  assert.equal(view.body.view.circle[0].name, "Ana");
  const raw = JSON.stringify(view.body);
  assert.ok(!raw.includes("500000") && !raw.includes("secret") && !raw.includes("family@example.com"), "no values, letters, costs or email in share view");
  // A share token cannot be used to write.
  assert.equal((await E(d, sh.body.token, { action: "save", estateId: id, desk: {} })).status, 401);
  assert.equal((await E(d, fam.token, { action: "unshare", estateId: id })).status, 200);
  assert.equal((await E(d, "", { action: "shared", token: sh.body.token })).status, 404);
  assert.equal((await E(d, "", { action: "shared", token: "x".repeat(32) })).status, 404);
});

test("upgrade: checkout charges the difference; webhook-verified session moves plan up and never down", async () => {
  const store = memStore(), estates = memStore(); const d = { store, estates };
  const { token, email } = await paidUser(store, "executor");
  let sent;
  const fetchImpl = async (_u, opts) => { sent = new URLSearchParams(opts.body); return new Response(JSON.stringify({ url: "https://checkout.stripe.com/x", id: "cs_x" }), { status: 200 }); };
  const r = await call(checkout, post("/api/checkout", { upgradeTo: "professional" }, token), { store, fetchImpl, secretKey: "sk_test_x" });
  assert.equal(r.status, 200);
  assert.equal(sent.get("line_items[0][price_data][unit_amount]"), "15000");
  assert.equal(sent.get("metadata[kind]"), "upgrade"); assert.equal(sent.get("metadata[fromPlan]"), "executor");
  const same = await call(checkout, post("/api/checkout", { upgradeTo: "executor" }, token), { store, fetchImpl, secretKey: "sk_test_x" });
  assert.equal(same.status, 400);

  const u = await store.get("user:" + email, { type: "json" });
  const bad = await applyCheckoutSession(store, stripeSession(u, "professional", 4900, { metadata: { kind: "upgrade", fromPlan: "executor" } }));
  assert.ok(bad.error, "wrong upgrade amount rejected");
  const ok = await applyCheckoutSession(store, stripeSession(u, "professional", 15000, { metadata: { kind: "upgrade", fromPlan: "executor" } }));
  assert.ok(!ok.error, ok.error);
  assert.equal((await store.get("user:" + email, { type: "json" })).plan, "professional");
  // a late, smaller purchase never downgrades
  await applyCheckoutSession(store, stripeSession(u, "family", 4000, { metadata: { kind: "upgrade", fromPlan: "executor" } }));
  assert.equal((await store.get("user:" + email, { type: "json" })).plan, "professional");
  assert.equal((await E(d, token, { action: "create", name: "Client 2" })).status, 200);
});

test("unpaid upgrade sessions are rejected; upgrade before purchase is rejected", async () => {
  const store = memStore();
  await call(auth, post("/api/auth", { action: "signup", name: "B", email: "u@example.com", password: "supersecret1", plan: "executor" }), { store, admin: ADMIN });
  const u = await store.get("user:u@example.com", { type: "json" });
  const r = await applyCheckoutSession(store, stripeSession(u, "professional", 15000, { metadata: { kind: "upgrade", fromPlan: "executor" } }));
  assert.ok(r.error);
  assert.equal((await store.get("user:u@example.com", { type: "json" })).paid, false);
});

test("retention: deletes accounts and estates 3 years after last activity, keeps payment receipts", async () => {
  const store = memStore(), estates = memStore(); const d = { store, estates };
  const old = await paidUser(store, "family", "old@example.com");
  const fresh = await paidUser(store, "family", "new@example.com");
  await E(d, old.token, { action: "list" }); await E(d, fresh.token, { action: "list" });
  const u = await store.get("user:old@example.com", { type: "json" });
  u.lastActiveAt = new Date(Date.now() - RETENTION_MS - 86400000).toISOString();
  await store.setJSON("user:old@example.com", u);
  const r = await runRetention({ store, estates });
  assert.deepEqual(r.deleted, ["old@example.com"]);
  assert.equal(await store.get("user:old@example.com"), null);
  assert.equal((await estates.list({ prefix: "est:old@example.com:" })).blobs.length, 0);
  assert.equal((await estates.list({ prefix: "est:new@example.com:" })).blobs.length, 1);
  assert.ok((await store.list({ prefix: "stripe:" })).blobs.length >= 2, "payment receipts kept");
  assert.equal((await E(d, old.token, { action: "list" })).status, 401);
});

test("documents checklist and executor name are saved; junk vault values dropped", async () => {
  const store = memStore(), estates = memStore(); const d = { store, estates };
  const { token } = await paidUser(store, "executor");
  const id = (await E(d, token, { action: "list" })).body.estates[0].id;
  await E(d, token, { action: "save", estateId: id, desk: { vault: { will: "have", bank: "not", x: "<script>", "bad key": "have" }, letter: { trustee: "Ana Silva" } } });
  const desk = (await E(d, token, { action: "load", estateId: id })).body.desk;
  assert.deepEqual(desk.vault, { will: "have", bank: "not" });
  assert.equal(desk.letter.trustee, "Ana Silva");
  assert.equal(desk.dod, undefined, "no date of death until the user enters one");
});

// ---- shared Stripe account: other apps' sessions must be ignored, never applied ----
import crypto from "node:crypto";
import { handle as webhook } from "../netlify/functions/stripe-webhook.mjs";
const WHSEC = "whsec_shared_acct";
function signed(event) {
  const payload = JSON.stringify(event), t = Math.floor(Date.now() / 1000);
  const sig = crypto.createHmac("sha256", WHSEC).update(`${t}.${payload}`).digest("hex");
  return new Request("https://example.test/api/stripe-webhook", { method: "POST", headers: { "stripe-signature": `t=${t},v1=${sig}` }, body: payload });
}
async function unpaidUser(store, email = "u@example.com") {
  const r = await call(auth, post("/api/auth", { action: "signup", name: "U", email, password: "supersecret1", plan: "family" }), { store, admin: ADMIN });
  return { token: r.body.token, user: await store.get("user:" + email, { type: "json" }) };
}

test("checkout tags the session and payment intent with metadata app=finalchapter", async () => {
  const store = memStore(); const { token } = await unpaidUser(store);
  let sent; const fetchImpl = async (_u, o) => { sent = new URLSearchParams(o.body); return new Response(JSON.stringify({ url: "https://checkout.stripe.com/x", id: "cs_x" }), { status: 200 }); };
  assert.equal((await call(checkout, post("/api/checkout", { plan: "family" }, token), { store, fetchImpl, secretKey: "sk_test_x" })).status, 200);
  assert.equal(sent.get("metadata[app]"), "finalchapter");
  assert.equal(sent.get("payment_intent_data[metadata][app]"), "finalchapter");
});

test("webhook: foreign sessions (other apps, or untagged) get 200 ignored and are not applied, even if the email matches", async () => {
  const store = memStore(); const { user } = await unpaidUser(store);
  const base = stripeSession(user, "family", 8900);
  const variants = [
    { ...base, id: "cs_test_adpulse1", metadata: { ...base.metadata, app: "adpulse" } },
    { ...base, id: "cs_test_pulse1", metadata: { ...base.metadata, app: "pulsecheck" } },
    (() => { const s = { ...base, id: "cs_test_untagged", metadata: { ...base.metadata } }; delete s.metadata.app; return s; })(),
    { id: "cs_test_nometa", object: "checkout.session", payment_status: "paid", customer_email: user.email, amount_total: 8900, currency: "cad" },
  ];
  for (const obj of variants) {
    for (const type of ["checkout.session.completed", "checkout.session.async_payment_succeeded"]) {
      const r = await call(webhook, signed({ type, data: { object: obj } }), { store, secret: WHSEC });
      assert.equal(r.status, 200, obj.id); assert.equal(r.body.ignored, true, obj.id); assert.equal(r.body.applied, undefined);
    }
  }
  // foreign session for an email we don't know: still 200, never 500 (no retries)
  const stranger = { ...base, id: "cs_test_stranger", customer_email: "nobody@else.com", metadata: { app: "adpulse", email: "nobody@else.com" } };
  assert.equal((await call(webhook, signed({ type: "checkout.session.completed", data: { object: stranger } }), { store, secret: WHSEC })).status, 200);
  // unhandled event types are acknowledged and ignored
  const other = await call(webhook, signed({ type: "invoice.paid", data: { object: { object: "invoice" } } }), { store, secret: WHSEC });
  assert.equal(other.status, 200); assert.equal(other.body.ignored, true);
  const row = await store.get("user:" + user.email, { type: "json" });
  assert.equal(row.paid, false); assert.equal((await store.list({ prefix: "stripe:" })).blobs.length, 0);
  // a correctly tagged session is still applied
  const ok = await call(webhook, signed({ type: "checkout.session.completed", data: { object: { ...base, id: "cs_test_ours" } } }), { store, secret: WHSEC });
  assert.equal(ok.body.applied, true);
});

test("applyCheckoutSession and verify-checkout refuse foreign sessions and sessions for another user", async () => {
  const store = memStore(); const a = await unpaidUser(store, "a@example.com"); const b = await unpaidUser(store, "b@example.com");
  const foreign = stripeSession(a.user, "family", 8900, { metadata: { app: "adpulse" } });
  const r = await applyCheckoutSession(store, foreign);
  assert.ok(r.error && r.foreign);
  const fetchFor = (s) => async () => new Response(JSON.stringify(s), { status: 200 });
  const v1 = await call(verify, post("/api/verify-checkout", { sessionId: foreign.id }, a.token), { store, fetchImpl: fetchFor(foreign), secretKey: "sk_test_x" });
  assert.equal(v1.status, 400); assert.equal(v1.body.paid, false);
  // B tries to confirm A's (genuine) session
  const aSess = stripeSession(a.user, "family", 8900);
  const v2 = await call(verify, post("/api/verify-checkout", { sessionId: aSess.id }, b.token), { store, fetchImpl: fetchFor(aSess), secretKey: "sk_test_x" });
  assert.equal(v2.status, 403);
  // mismatched userId in metadata is refused even if client_reference_id matches
  const mixed = stripeSession(a.user, "family", 8900, { metadata: { userId: b.user.id } });
  assert.equal((await applyCheckoutSession(store, mixed)).status, 403);
  // no id at all is refused
  const noIds = stripeSession(a.user, "family", 8900); delete noIds.client_reference_id; delete noIds.metadata.userId;
  assert.equal((await applyCheckoutSession(store, noIds)).status, 403);
  for (const e of ["a@example.com", "b@example.com"]) assert.equal((await store.get("user:" + e, { type: "json" })).paid, false);
  const v3 = await call(verify, post("/api/verify-checkout", { sessionId: aSess.id }, a.token), { store, fetchImpl: fetchFor(aSess), secretKey: "sk_test_x" });
  assert.equal(v3.body.paid, true);
});
