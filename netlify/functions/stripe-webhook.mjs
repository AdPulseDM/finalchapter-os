// /api/stripe-webhook — Stripe calls this. Verifies the Stripe-Signature header with STRIPE_WEBHOOK_SECRET
// and marks the account paid on checkout.session.completed / checkout.session.async_payment_succeeded.
import { json, env, verifyStripeSignature, applyCheckoutSession } from "../lib/core.mjs";
import { usersStore } from "../lib/store.mjs";

export async function handle(req, { store, secret = env("STRIPE_WEBHOOK_SECRET"), nowS }) {
  if (req.method !== "POST") return json(405, { error: "Use POST" });
  if (!secret) return json(500, { error: "STRIPE_WEBHOOK_SECRET is not set" });
  const payload = await req.text(); // raw body is required for signature verification
  const check = verifyStripeSignature(payload, req.headers.get("stripe-signature"), secret, undefined, nowS);
  if (!check.ok) return json(400, { error: check.error });
  let event;
  try { event = JSON.parse(payload); } catch { return json(400, { error: "Invalid JSON" }); }
  if (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") {
    const r = await applyCheckoutSession(store, event.data?.object);
    if (r.pending) return json(200, { received: true, pending: true });
    if (r.error) {
      console.error("stripe-webhook: could not apply session", event.data?.object?.id, r.error);
      // 4xx/5xx makes Stripe retry; only retry when the account may appear later (404).
      return json(r.status === 404 ? 500 : 200, { received: true, applied: false, error: r.error });
    }
    return json(200, { received: true, applied: true });
  }
  return json(200, { received: true, ignored: event.type });
}

export default async (req) => handle(req, { store: usersStore() });
