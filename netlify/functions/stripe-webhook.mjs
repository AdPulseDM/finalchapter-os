// /api/stripe-webhook — Stripe calls this. Verifies the Stripe-Signature header with STRIPE_WEBHOOK_SECRET.
// checkout.session.completed / checkout.session.async_payment_succeeded: unlock the plan, upgrade or add-on.
// charge.refunded (full refunds only) / charge.dispute.created: lock what that payment bought (data is kept).
// charge.dispute.closed with status "won" (or "warning_closed" for an inquiry): restore what the dispute removed.
import { json, env, verifyStripeSignature, applyCheckoutSession, isOurSession, APP_ID, normPI,
  findPurchaseByPaymentIntent, revokePurchase, restorePurchase } from "../lib/core.mjs";
import { usersStore } from "../lib/store.mjs";

const CHECKOUT_EVENTS = ["checkout.session.completed", "checkout.session.async_payment_succeeded"];
const PAYMENT_EVENTS = ["charge.refunded", "charge.dispute.created", "charge.dispute.closed"];
// The full list the Stripe webhook endpoint must be subscribed to.
export const WEBHOOK_EVENTS = [...CHECKOUT_EVENTS, ...PAYMENT_EVENTS];

export async function handle(req, { store, secret = env("STRIPE_WEBHOOK_SECRET"), secretKey = env("STRIPE_SECRET_KEY"), fetchImpl = fetch, nowS }) {
  if (req.method !== "POST") return json(405, { error: "Use POST" });
  if (!secret) return json(500, { error: "STRIPE_WEBHOOK_SECRET is not set" });
  const payload = await req.text(); // raw body is required for signature verification
  const check = verifyStripeSignature(payload, req.headers.get("stripe-signature"), secret, undefined, nowS);
  if (!check.ok) return json(400, { error: check.error });
  let event;
  try { event = JSON.parse(payload); } catch { return json(400, { error: "Invalid JSON" }); }
  // The Stripe account is shared with other projects: acknowledge (200) and ignore anything that is not ours,
  // so Stripe never retries or disables the endpoint because of another app's events.
  if (PAYMENT_EVENTS.includes(event.type)) return await handlePaymentEvent(event, { store, secretKey, fetchImpl });
  if (!CHECKOUT_EVENTS.includes(event.type) || !isOurSession(event.data?.object)) {
    return json(200, { received: true, ignored: true });
  }
  {
    const r = await applyCheckoutSession(store, event.data?.object);
    if (r.pending) return json(200, { received: true, pending: true });
    if (r.error) {
      console.error("stripe-webhook: could not apply session", event.data?.object?.id, r.error);
      // 4xx/5xx makes Stripe retry; only retry when the account may appear later (404).
      return json(r.status === 404 ? 500 : 200, { received: true, applied: false, error: r.error });
    }
    return json(200, { received: true, applied: true });
  }
}

async function handlePaymentEvent(event, { store, secretKey, fetchImpl }) {
  const obj = event.data?.object || {};
  const tag = `stripe-webhook: ${event.type} ${event.id || ""} ${obj.id || ""}`;
  // Charges carry the payment intent's metadata; if it names another app, it is not ours.
  if (obj.object === "charge" && obj.metadata?.app && obj.metadata.app !== APP_ID) return json(200, { received: true, ignored: true });
  const pi = normPI(obj.payment_intent);
  if (!pi) return json(200, { received: true, ignored: true });
  const found = await findPurchaseByPaymentIntent(store, pi, { secretKey, fetchImpl });
  if (found.foreign) return json(200, { received: true, ignored: true });
  if (found.error) {
    console.error(tag, "could not map payment", pi, found.error);
    // Retry only when Stripe itself could not be reached; a missing account will not appear later.
    return json(found.status >= 500 ? 500 : 200, { received: true, applied: false, error: found.error });
  }
  const ref = { email: found.email, paymentIntent: pi, stripeSessionId: found.stripeSessionId, fallback: found.fallback, eventId: event.id };

  if (event.type === "charge.refunded") {
    const amount = Number(obj.amount), refunded = Number(obj.amount_refunded);
    if (!(refunded >= amount && amount > 0)) {
      console.log(tag, `partial refund ignored (${refunded} of ${amount}) for`, pi);
      return json(200, { received: true, ignored: true, partial: true });
    }
    const r = await revokePurchase(store, { ...ref, reason: "refund" });
    return done(tag, r, pi);
  }
  if (event.type === "charge.dispute.created") {
    const r = await revokePurchase(store, { ...ref, reason: "dispute" });
    return done(tag, r, pi);
  }
  // charge.dispute.closed
  if (obj.status === "won" || obj.status === "warning_closed") {
    const r = await restorePurchase(store, ref);
    if (r.error) return done(tag, r, pi);
    console.log(tag, r.restored ? "access restored for" : "nothing to restore for", pi);
    return json(200, { received: true, applied: !!r.restored });
  }
  if (obj.status === "lost") return done(tag, await revokePurchase(store, { ...ref, reason: "dispute" }), pi);
  return json(200, { received: true, ignored: true });
}

function done(tag, r, pi) {
  if (r.error) {
    console.error(tag, "not applied for", pi, r.error);
    return json(200, { received: true, applied: false, error: r.error });
  }
  console.log(tag, r.already ? "already revoked:" : "access revoked:", pi, r.entry?.kind, r.entry?.plan || r.entry?.addon || "");
  return json(200, { received: true, applied: true, already: !!r.already, revoked: r.entry?.kind });
}

export default async (req) => handle(req, { store: usersStore() });
