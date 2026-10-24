// /api/checkout — creates a Stripe Checkout Session for the signed-in (unpaid or upgrading) user.
// The email, user id and plan travel in metadata/client_reference_id so the webhook can match the payment.
import { json, env, PLANS, ADDONS, CURRENCY, APP_ID, normPlan, normAddon, hasAddon, upgradePrice, getSession, getUser, bearer } from "../lib/core.mjs";
import { usersStore } from "../lib/store.mjs";

export function siteUrl() {
  return (env("SITE_URL") || env("URL") || "https://finalchapter-os.netlify.app").replace(/\/+$/, "");
}

export async function handle(req, { store, fetchImpl = fetch, secretKey = env("STRIPE_SECRET_KEY") }) {
  if (req.method !== "POST") return json(405, { error: "Use POST" });
  if (!secretKey) return json(500, { error: "Payments are not configured yet (STRIPE_SECRET_KEY missing)" });
  const body = await req.json().catch(() => ({}));
  const sess = await getSession(store, bearer(req, body));
  if (!sess || sess.role !== "client") return json(401, { error: "Sign up or log in before checkout" });
  const user = await getUser(store, sess.email);
  if (!user) return json(401, { error: "Account not found" });
  // Unpaid: buy a plan at full price. Paid: only an upgrade to a higher plan, charged the difference.
  // Add-on (e.g. Print kit): any paid plan, once per account.
  let plan, amount, name, kind = "purchase", addon = "";
  if (body.addon !== undefined) {
    addon = normAddon(body.addon);
    if (!addon) return json(400, { error: "Unknown add-on" });
    if (!user.paid) return json(402, { error: "Buy a plan first. The Print kit is an add-on for paid plans." });
    if (hasAddon(user, addon)) return json(409, { error: "You already have the Print kit" });
    kind = "addon"; plan = user.plan; amount = ADDONS[addon].amount; name = ADDONS[addon].name;
  } else if (user.paid) {
    plan = normPlan(body.upgradeTo || body.plan);
    amount = upgradePrice(user.plan, plan);
    if (!amount) return json(400, { error: "You already have this plan or a higher one" });
    kind = "upgrade";
    name = `${PLANS[plan].name} (upgrade from ${PLANS[user.plan].name})`;
  } else {
    plan = normPlan(body.plan) || user.plan;
    amount = PLANS[plan].amount;
    name = PLANS[plan].name;
  }
  const base = siteUrl();
  const params = new URLSearchParams();
  params.set("mode", "payment");
  params.set("client_reference_id", user.id);
  params.set("customer_email", user.email);
  params.set("payment_intent_data[receipt_email]", user.email);
  params.set("metadata[app]", APP_ID);
  params.set("payment_intent_data[metadata][app]", APP_ID);
  params.set("metadata[email]", user.email);
  params.set("metadata[userId]", user.id);
  params.set("metadata[plan]", plan);
  params.set("metadata[kind]", kind);
  if (kind === "upgrade") params.set("metadata[fromPlan]", user.plan);
  if (kind === "addon") { params.set("metadata[addon]", addon); params.set("payment_intent_data[metadata][addon]", addon); }
  params.set("payment_intent_data[metadata][email]", user.email);
  params.set("payment_intent_data[metadata][plan]", plan);
  params.set("line_items[0][quantity]", "1");
  params.set("line_items[0][price_data][currency]", CURRENCY);
  params.set("line_items[0][price_data][unit_amount]", String(amount));
  params.set("line_items[0][price_data][product_data][name]", name);
  params.set("success_url", base + "/?session_id={CHECKOUT_SESSION_ID}");
  params.set("cancel_url", base + "/?checkout=cancel" + (kind === "addon" ? "&addon=" + addon : "") + "#account");
  const res = await fetchImpl("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: { authorization: "Bearer " + secretKey, "content-type": "application/x-www-form-urlencoded" },
    body: params,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return json(502, { error: data.error?.message || "Stripe checkout failed" });
  return json(200, { url: data.url, id: data.id });
}

export default async (req) => handle(req, { store: usersStore() });
