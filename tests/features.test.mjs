// Print kit add-on (checkout, webhook, entitlement) and server-side document downloads.
import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { memStore, post, call } from "./helpers.mjs";
import { handle as auth } from "../netlify/functions/auth.mjs";
import { handle as checkout } from "../netlify/functions/checkout.mjs";
import { handle as webhook } from "../netlify/functions/stripe-webhook.mjs";
import { handle as verify } from "../netlify/functions/verify-checkout.mjs";
import { handle as estate } from "../netlify/functions/estate.mjs";
import { handle as documents } from "../netlify/functions/documents.mjs";
import { applyCheckoutSession, publicUser } from "../netlify/lib/core.mjs";
import { zip, crc32, pdfSafe } from "../netlify/lib/docs.mjs";

const ADMIN = { email: "owner@example.com", password: "correct-horse-battery" };
let n = 0;
const sess = (u, over = {}) => ({ id: "cs_test_f" + ++n, object: "checkout.session", payment_status: "paid", client_reference_id: u.id, customer_email: u.email, amount_subtotal: 4900, amount_total: 4900, currency: "cad", ...over,
  metadata: { app: "finalchapter", email: u.email, userId: u.id, plan: "executor", ...(over.metadata || {}) } });
const kit = (u, over = {}) => sess(u, { amount_subtotal: 2900, amount_total: 2900, ...over, metadata: { kind: "addon", addon: "printkit", ...(over.metadata || {}) } });
async function signup(store, email, plan = "executor") {
  const r = await call(auth, post("/api/auth", { action: "signup", name: "Buyer", email, password: "supersecret1", plan }), { store, admin: ADMIN });
  return { token: r.body.token, user: () => store.get("user:" + email, { type: "json" }) };
}
async function paid(store, email, plan = "executor") {
  const s = await signup(store, email, plan);
  const amounts = { executor: 4900, family: 8900, professional: 19900 };
  const r = await applyCheckoutSession(store, sess(await s.user(), { amount_subtotal: amounts[plan], amount_total: amounts[plan], metadata: { plan } }));
  assert.ok(!r.error, r.error);
  return s;
}
function mockStripe() {
  const calls = [];
  const fetchImpl = async (url, opts) => { calls.push({ url, body: new URLSearchParams(String(opts.body)) }); return Response.json({ id: "cs_test_new", url: "https://checkout.stripe.com/c/pay/cs_test_new" }); };
  return { calls, fetchImpl };
}
function signed(event, secret) {
  const payload = JSON.stringify(event); const t = Math.floor(Date.now() / 1000);
  const v1 = crypto.createHmac("sha256", secret).update(`${t}.${payload}`).digest("hex");
  return new Request("https://example.test/api/stripe-webhook", { method: "POST", headers: { "stripe-signature": `t=${t},v1=${v1}` }, body: payload });
}

test("print kit checkout: paid plans only, tagged app=finalchapter kind=addon addon=printkit, 2900 CAD", async () => {
  const store = memStore(); const s = mockStripe();
  const un = await signup(store, "unpaid@example.com");
  let r = await call(checkout, post("/api/checkout", { addon: "printkit" }, un.token), { store, fetchImpl: s.fetchImpl, secretKey: "sk_test_x" });
  assert.equal(r.status, 402); assert.equal(s.calls.length, 0, "no Stripe session for unpaid accounts");
  const p = await paid(store, "kit@example.com", "family");
  r = await call(checkout, post("/api/checkout", { addon: "bogus" }, p.token), { store, fetchImpl: s.fetchImpl, secretKey: "sk_test_x" });
  assert.equal(r.status, 400);
  r = await call(checkout, post("/api/checkout", { addon: "printkit" }, p.token), { store, fetchImpl: s.fetchImpl, secretKey: "sk_test_x" });
  assert.equal(r.status, 200); assert.match(r.body.url, /^https:\/\/checkout\.stripe\.com\//);
  const b = s.calls[0].body; const u = await p.user();
  assert.equal(b.get("metadata[app]"), "finalchapter"); assert.equal(b.get("payment_intent_data[metadata][app]"), "finalchapter");
  assert.equal(b.get("metadata[kind]"), "addon");
  assert.equal(b.get("payment_intent_data[receipt_email]"), p.user.email); assert.equal(b.get("metadata[addon]"), "printkit");
  assert.equal(b.get("line_items[0][price_data][unit_amount]"), "2900"); assert.equal(b.get("line_items[0][price_data][currency]"), "cad");
  assert.equal(b.get("client_reference_id"), u.id); assert.equal(b.get("metadata[userId]"), u.id);
  assert.match(b.get("cancel_url"), /checkout=cancel&addon=printkit/);
});

test("print kit is granted only by a matching paid session, once per account, and never changes the plan", async () => {
  const store = memStore();
  const p = await paid(store, "grant@example.com", "family");
  const u = await p.user();
  assert.equal((await applyCheckoutSession(store, kit(u, { amount_subtotal: 100, amount_total: 100 }))).status, 400, "wrong amount");
  assert.equal((await applyCheckoutSession(store, kit(u, { client_reference_id: "deadbeefdeadbeef", metadata: { userId: "deadbeefdeadbeef" } }))).status, 403, "other account");
  assert.equal((await applyCheckoutSession(store, kit(u, { metadata: { addon: "poster" } }))).status, 400, "unknown add-on");
  assert.equal((await applyCheckoutSession(store, kit(u, { payment_status: "unpaid" }))).status, 402);
  assert.ok(!(await p.user()).addons?.printkit);
  const s = kit(u);
  assert.ok(!(await applyCheckoutSession(store, s)).error);
  assert.equal((await applyCheckoutSession(store, s)).already, true, "idempotent");
  const after = await p.user();
  assert.equal(after.plan, "family"); assert.ok(after.addons.printkit); assert.equal(after.purchases.filter((x) => x.kind === "addon").length, 1);
  assert.deepEqual(publicUser(after).addons, { printkit: true });
  const r = await call(checkout, post("/api/checkout", { addon: "printkit" }, p.token), { store, fetchImpl: mockStripe().fetchImpl, secretKey: "sk_test_x" });
  assert.equal(r.status, 409, "cannot buy twice");
  // An unpaid account cannot get the add-on even with a valid-looking session.
  const un = await signup(store, "nokit@example.com");
  assert.equal((await applyCheckoutSession(store, kit(await un.user()))).status, 400);
});

test("webhook applies a signed print kit session and still ignores foreign sessions", async () => {
  const store = memStore(); const secret = "whsec_test";
  const p = await paid(store, "hook@example.com");
  const u = await p.user();
  const foreign = { ...kit(u), metadata: { app: "adpulse", kind: "addon", addon: "printkit", email: u.email, userId: u.id } };
  let r = await call(webhook, signed({ type: "checkout.session.completed", data: { object: foreign } }, secret), { store, secret });
  assert.equal(r.status, 200); assert.equal(r.body.ignored, true);
  const untagged = kit(u); delete untagged.metadata.app;
  r = await call(webhook, signed({ type: "checkout.session.completed", data: { object: untagged } }, secret), { store, secret });
  assert.equal(r.body.ignored, true);
  assert.ok(!(await p.user()).addons?.printkit, "foreign/untagged sessions grant nothing");
  r = await call(webhook, signed({ type: "checkout.session.completed", data: { object: kit(u) } }, secret), { store, secret });
  assert.equal(r.status, 200); assert.equal(r.body.applied, true);
  assert.ok((await p.user()).addons.printkit);
});

test("verify-checkout returns the add-on for the signed-in buyer", async () => {
  const store = memStore();
  const p = await paid(store, "verifykit@example.com");
  const s = kit(await p.user());
  const r = await call(verify, post("/api/verify-checkout", { sessionId: s.id }, p.token), { store, fetchImpl: async () => Response.json(s), secretKey: "sk_test_x" });
  assert.equal(r.status, 200); assert.equal(r.body.user.addons.printkit, true);
});

async function setupEstate(store, estates, email, plan = "executor") {
  const p = await paid(store, email, plan);
  const list = await call(estate, post("/api/estate", { action: "list" }, p.token), { store, estates });
  const id = list.body.estates[0].id;
  await call(estate, post("/api/estate", { action: "save", estateId: id, desk: { dod: "2025-11-01", certDate: "2026-03-02", selfEmployed: false, letter: { name: "Elena Vásquez", trustee: "Sarah Chen", trusteeAddress: "12 Elm St", type: "bank" }, tasks: [{ id: 1, status: "done" }] } }, p.token), { store, estates });
  return { ...p, id };
}
const doc = async (deps, token, body) => { const res = await documents(post("/api/documents", body, token), deps); return { status: res.status, type: res.headers.get("content-type"), cd: res.headers.get("content-disposition"), bytes: Buffer.from(await res.arrayBuffer()) }; };

test("letters download as .docx and PDF for paid accounts only, filled from the saved estate", async () => {
  const store = memStore(), estates = memStore(); const deps = { store, estates, today: "2026-10-24" };
  const p = await setupEstate(store, estates, "docs@example.com");
  const saved = await call(estate, post("/api/estate", { action: "load", estateId: p.id }, p.token), { store, estates });
  assert.equal(saved.body.desk.certDate, "2026-03-02", "new desk fields are saved");
  assert.equal(saved.body.desk.letter.trusteeAddress, "12 Elm St");
  const d = await doc(deps, p.token, { action: "letter", estateId: p.id, type: "bank", format: "docx" });
  assert.equal(d.status, 200); assert.match(d.type, /wordprocessingml/); assert.match(d.cd, /attachment; filename=".*bank-letter\.docx"/);
  assert.equal(d.bytes.subarray(0, 2).toString(), "PK");
  const xml = d.bytes.toString("utf8");
  for (const s of ["word/document.xml", "Elena Vásquez", "Sarah Chen", "November 1, 2025", "March 2, 2026", 'w:highlight w:val="yellow"']) assert.ok(xml.includes(s), s);
  const pdf = await doc(deps, p.token, { action: "letter", estateId: p.id, type: "creditor", format: "pdf" });
  assert.equal(pdf.status, 200); assert.equal(pdf.type, "application/pdf"); assert.equal(pdf.bytes.subarray(0, 5).toString(), "%PDF-");
  assert.equal((await doc(deps, p.token, { action: "letter", estateId: p.id, type: "bank", format: "rtf" })).status, 400);
  assert.equal((await doc(deps, p.token, { action: "letter", estateId: p.id, type: "nope", format: "pdf" })).status, 400);
  assert.equal((await doc(deps, "", { action: "letter", estateId: p.id, type: "bank", format: "pdf" })).status, 401);
  const un = await signup(store, "unpaiddocs@example.com");
  assert.equal((await doc(deps, un.token, { action: "letter", estateId: p.id, type: "bank", format: "pdf" })).status, 402);
  const other = await setupEstate(store, estates, "other@example.com");
  assert.equal((await doc(deps, other.token, { action: "letter", estateId: p.id, type: "bank", format: "pdf" })).status, 404, "cannot read another account's estate");
});

test("print kit PDF requires the add-on", async () => {
  const store = memStore(), estates = memStore(); const deps = { store, estates, today: "2026-10-24" };
  const p = await setupEstate(store, estates, "kitdocs@example.com", "professional");
  const no = await doc(deps, p.token, { action: "printkit", estateId: p.id });
  assert.equal(no.status, 402); assert.match(JSON.parse(no.bytes.toString()).error, /\$29 add-on/);
  assert.ok(!(await applyCheckoutSession(store, kit(await p.user()))).error);
  const yes = await doc(deps, p.token, { action: "printkit", estateId: p.id });
  assert.equal(yes.status, 200); assert.equal(yes.bytes.subarray(0, 5).toString(), "%PDF-");
  assert.ok(yes.bytes.length > 20000);
  assert.match(yes.cd, /print-kit\.pdf/);
});

test("zip writer and PDF text helpers", () => {
  assert.equal(crc32(Buffer.from("123456789")), 0xcbf43926, "standard CRC-32 check value");
  const z = zip([["a.txt", "hi"]]);
  assert.equal(z.readUInt32LE(0), 0x04034b50); assert.equal(z.readUInt32LE(z.length - 22), 0x06054b50);
  assert.equal(pdfSafe("Vásquez – “ok” ✓ →"), "Vásquez – “ok” x ->");
  assert.equal(pdfSafe("日本"), "??");
});
