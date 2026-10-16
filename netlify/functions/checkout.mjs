function json(status, body) {
  return Response.json(body, { status });
}
export default async (req) => {
  if (req.method !== "POST") return json(405, { error: "Use POST" });
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return json(500, { error: "STRIPE_SECRET_KEY is not set" });
  const body = await req.json().catch(() => ({}));
  const plan = body.plan === "professional" ? "professional" : body.plan === "family" ? "family" : "executor";
  const amount = plan === "professional" ? 19900 : plan === "family" ? 8900 : 4900;
  const name = plan === "professional" ? "FinalChapter Professional" : plan === "family" ? "FinalChapter Family" : "FinalChapter Executor";
  const estateId = String(body.estateId || "").trim();
  if (!estateId) return json(400, { error: "estateId required" });
  const params = new URLSearchParams();
  params.set("mode", "payment");
  params.set("client_reference_id", estateId);
  params.set("metadata[estateId]", estateId);
  params.set("metadata[plan]", plan);
  if (body.email) params.set("customer_email", String(body.email).trim().toLowerCase());
  params.set("line_items[0][quantity]", "1");
  params.set("line_items[0][price_data][currency]", "cad");
  params.set("line_items[0][price_data][unit_amount]", String(amount));
  params.set("line_items[0][price_data][product_data][name]", name);
  params.set("success_url", "https://finalchapter-os.netlify.app/?checkout=" + plan + "&email=" + encodeURIComponent(String(body.email||"")) + "&session_id={CHECKOUT_SESSION_ID}");
  params.set("cancel_url", "https://finalchapter-os.netlify.app/?checkout=cancel");
  const res = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: { authorization: "Bearer " + key, "content-type": "application/x-www-form-urlencoded" },
    body: params,
  });
  const data = await res.json();
  if (!res.ok) return json(res.status, { error: data.error?.message || "Stripe checkout failed" });
  return json(200, { url: data.url, id: data.id });
};
