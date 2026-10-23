// /api/verify-checkout — fallback for when the buyer returns from Stripe before the webhook lands.
// Retrieves the Checkout Session from Stripe with STRIPE_SECRET_KEY and only marks paid if payment_status === "paid".
import { json, env, retrieveCheckoutSession, applyCheckoutSession, getSession, bearer, publicUser } from "../lib/core.mjs";
import { usersStore } from "../lib/store.mjs";

export async function handle(req, { store, fetchImpl = fetch, secretKey = env("STRIPE_SECRET_KEY") }) {
  if (req.method !== "POST") return json(405, { error: "Use POST" });
  const body = await req.json().catch(() => ({}));
  const got = await retrieveCheckoutSession(body.sessionId, secretKey, fetchImpl);
  if (got.error) return json(got.status, { error: got.error });
  const r = await applyCheckoutSession(store, got.session);
  if (r.error) return json(r.status, { paid: false, error: r.error });
  // Only reveal account details / the workspace code to the signed-in owner of this purchase.
  const sess = await getSession(store, bearer(req, body));
  if (sess && sess.role === "client" && sess.email === r.user.email) {
    return json(200, { paid: true, user: publicUser(r.user), workspaceCode: r.user.workspaceCode });
  }
  return json(200, { paid: true, message: "Payment confirmed. Log in with your email and password to open the desk." });
}

export default async (req) => handle(req, { store: usersStore() });
