// /api/estate — load/save the paid user's desk. Requires a valid client session for a PAID account.
import { json, getSession, getUser, bearer } from "../lib/core.mjs";
import { usersStore } from "../lib/store.mjs";

const MAX_DESK_BYTES = 200 * 1024;

export async function handle(req, { store }) {
  if (req.method !== "POST") return json(405, { error: "Use POST" });
  const body = await req.json().catch(() => ({}));
  const sess = await getSession(store, bearer(req, body));
  if (!sess || sess.role !== "client") return json(401, { error: "Not signed in or session expired" });
  const user = await getUser(store, sess.email);
  if (!user || !user.paid) return json(402, { error: "Pay to unlock the desk" });
  const key = "desk:" + user.email;
  if (body.action === "save") {
    const desk = body.desk && typeof body.desk === "object" ? body.desk : null;
    if (!desk) return json(400, { error: "desk object required" });
    if (JSON.stringify(desk).length > MAX_DESK_BYTES) return json(413, { error: "Desk too large" });
    await store.setJSON(key, { ...desk, savedAt: new Date().toISOString() });
    return json(200, { ok: true });
  }
  if (body.action === "load") {
    return json(200, { ok: true, desk: (await store.get(key, { type: "json" })) || null });
  }
  return json(400, { error: "Unknown action" });
}

export default async (req) => handle(req, { store: usersStore() });
