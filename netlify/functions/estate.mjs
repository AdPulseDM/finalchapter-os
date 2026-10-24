// /api/estate — estates for the signed-in PAID account. Plan limits are enforced in ../lib/estates.mjs.
// Actions: list, create, load, save, rename, archive, restore, share, unshare  (client session required)
//          shared (public; read-only progress view for a valid share token)
import { json, getSession, getUser, bearer, entitlements } from "../lib/core.mjs";
import { usersStore, estatesStore } from "../lib/store.mjs";
import * as E from "../lib/estates.mjs";

const DAY = 24 * 60 * 60 * 1000;

export async function handle(req, { store, estates }) {
  if (req.method !== "POST") return json(405, { error: "Use POST" });
  const body = await req.json().catch(() => ({}));
  if (body.action === "shared") {
    const r = await E.sharedView(estates, store, body.token, getUser);
    return r.error ? json(r.status, { error: r.error }) : json(200, { ok: true, view: r.view });
  }
  const sess = await getSession(store, bearer(req, body));
  if (!sess || sess.role !== "client") return json(401, { error: "Not signed in or session expired" });
  const user = await getUser(store, sess.email);
  if (!user || !user.paid) return json(402, { error: "Buy a plan to open your checklist" });
  if (!user.lastActiveAt || Date.now() - Date.parse(user.lastActiveAt) > DAY) {
    user.lastActiveAt = new Date().toISOString();
    await store.setJSON("user:" + user.email, user);
  }
  const ent = entitlements(user.plan);
  const out = (r, extra = {}) => (r.error ? json(r.status, { error: r.error }) : json(200, { ok: true, ...extra(r) }));
  const id = body.estateId;

  switch (body.action) {
    case "list": {
      const rows = await E.ensureFirstEstate(estates, store, user);
      return json(200, { ok: true, entitlements: ent, estates: rows.map(E.summary) });
    }
    case "create":
      return out(await E.createEstate(estates, user, body.name), (r) => ({ estate: E.summary(r.estate) }));
    case "load": {
      const e = await E.getEstate(estates, user, id);
      if (!e) return json(404, { error: "Estate not found" });
      return json(200, { ok: true, estate: E.summary(e), desk: E.sanitizeDesk(e.desk, user.plan), shareToken: ent.share ? e.shareToken || null : null });
    }
    case "save": {
      if (!body.desk || typeof body.desk !== "object") return json(400, { error: "desk object required" });
      return out(await E.saveEstate(estates, user, id, body.desk), (r) => ({ estate: E.summary(r.estate) }));
    }
    case "rename":
      return out(await E.renameEstate(estates, user, id, body.name), (r) => ({ estate: E.summary(r.estate) }));
    case "archive":
    case "restore":
      return out(await E.setArchived(estates, user, id, body.action === "archive"), (r) => ({ estate: E.summary(r.estate) }));
    case "share":
      return out(await E.createShare(estates, user, id), (r) => ({ estate: E.summary(r.estate), token: r.token }));
    case "unshare":
      return out(await E.revokeShare(estates, user, id), (r) => ({ estate: E.summary(r.estate) }));
  }
  return json(400, { error: "Unknown action" });
}

export default async (req) => handle(req, { store: usersStore(), estates: estatesStore() });
