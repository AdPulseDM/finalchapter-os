// /api/verify-checkout — fallback for when the buyer returns from Stripe before the webhook lands.
// Retrieves the Checkout Session from Stripe with STRIPE_SECRET_KEY and only marks paid if payment_status === "paid".
import { json, env, retrieveCheckoutSession, applyCheckoutSession, isOurSession, getSession, getUser, bearer, publicUser } from "../lib/core.mjs";
import { usersStore } from "../lib/store.mjs";

export async function handle(req, { store, fetchImpl = fetch, secretKey = env("STRIPE_SECRET_KEY") }) {
  if (req.method !== "POST") return json(405, { error: "Use POST" });
  const body = await req.json().catch(() => ({}));
  // Must be the signed-in buyer; the webhook still applies payments made by anyone else.
  const sess = await getSession(store, bearer(req, body));
  if (!sess || sess.role !== "client") return json(401, { paid: false, error: "Log in to confirm your payment." });
  const me = await getUser(store, sess.email);
  if (!me) return json(401, { paid: false, error: "Log in to confirm your payment." });
  const got = await retrieveCheckoutSession(body.sessionId, secretKey, fetchImpl);
  if (got.error) return json(got.status, { error: got.error });
  const s = got.session;
  if (!isOurSession(s)) return json(400, { paid: false, error: "Not a FinalChapter checkout session" });
  const ids = [s.client_reference_id, s.metadata?.userId].filter(Boolean);
  if (!ids.length || ids.some((id) => id !== me.id)) return json(403, { paid: false, error: "This payment belongs to a different account." });
  const r = await applyCheckoutSession(store, s);
  if (r.error) return json(r.status, { paid: false, error: r.error });
  return json(200, { paid: true, user: publicUser(r.user), workspaceCode: r.user.workspaceCode });
}

export default async (req) => handle(req, { store: usersStore() });
