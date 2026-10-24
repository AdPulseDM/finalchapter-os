// Estates per account, with plan limits enforced here (server-side).
// Store: "finalchapter-estates". Keys: est:<email>:<id>  and  share:<token>
import crypto from "node:crypto";
import { PLANS, normName, randomToken } from "./core.mjs";

export const MAX_DESK_BYTES = 200 * 1024;
const STATUSES = ["todo", "doing", "done", "blocked"];

const estKey = (email, id) => `est:${email}:${id}`;
const validId = (id) => /^[a-f0-9]{16}$/.test(String(id || ""));

export function limitsFor(user) {
  const p = user && user.paid ? PLANS[user.plan] : null;
  return p || null;
}

function clean(v, max = 200) {
  return String(v ?? "").replace(/[\u0000-\u001f]/g, " ").slice(0, max);
}
// Keep only known fields; drop plan-gated fields the plan does not include.
export function sanitizeDesk(desk, plan) {
  const p = PLANS[plan];
  const d = desk && typeof desk === "object" ? desk : {};
  const out = {};
  if (typeof d.dod === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d.dod)) out.dod = d.dod;
  if (Number.isFinite(d.value) && d.value >= 0 && d.value < 1e12) out.value = d.value;
  if (typeof d.tab === "string") out.tab = clean(d.tab, 20);
  if (d.letter && typeof d.letter === "object") {
    out.letter = {};
    for (const k of ["recipient", "estate", "name", "date", "account", "note"]) if (k in d.letter) out.letter[k] = clean(d.letter[k], k === "note" ? 2000 : 200);
  }
  if (Array.isArray(d.tasks)) out.tasks = d.tasks.filter((t) => t && Number.isInteger(t.id) && STATUSES.includes(t.status)).slice(0, 200).map((t) => ({ id: t.id, status: t.status }));
  if (p?.costs && Array.isArray(d.costs)) out.costs = d.costs.slice(0, 100).map((c, i) => ({ id: Number.isInteger(c?.id) ? c.id : i + 1, name: clean(c?.name, 120), est: Number(c?.est) || 0, actual: Number(c?.actual) || 0, paid: !!c?.paid }));
  if (p?.circle && Array.isArray(d.circle)) out.circle = d.circle.slice(0, 50).map((m) => ({ name: clean(m?.name, 120), relation: clean(m?.relation, 60), role: clean(m?.role, 60) })).filter((m) => m.name.trim());
  return out;
}

export async function listEstates(store, email) {
  const { blobs } = await store.list({ prefix: `est:${email}:` });
  const rows = [];
  for (const b of blobs || []) {
    const e = await store.get(b.key, { type: "json" });
    if (e) rows.push(e);
  }
  rows.sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
  return rows;
}
export const summary = (e) => ({ id: e.id, name: e.name, archived: !!e.archived, createdAt: e.createdAt, updatedAt: e.updatedAt, shared: !!e.shareToken });

export async function createEstate(store, user, name, { legacyDesk } = {}) {
  const lim = limitsFor(user);
  if (!lim) return { error: "Pay to unlock the desk", status: 402 };
  const existing = await listEstates(store, user.email);
  // Every estate counts toward the limit, archived or not.
  if (existing.length >= lim.maxEstates) {
    return { error: lim.maxEstates === 1 ? "Your plan includes one estate. Upgrade to Professional for up to 5 client estates." : `Your plan includes up to ${lim.maxEstates} estates (archived estates count).`, status: 403 };
  }
  const n = normName(name) || `Estate ${existing.length + 1}`;
  const now = new Date().toISOString();
  const est = { id: crypto.randomBytes(8).toString("hex"), owner: user.email, name: n, archived: false, createdAt: now, updatedAt: now, desk: legacyDesk ? sanitizeDesk(legacyDesk, user.plan) : {} };
  await store.setJSON(estKey(user.email, est.id), est);
  return { estate: est };
}

// Ensures a paid account has at least one estate (migrates the old single desk if present).
export async function ensureFirstEstate(store, usersStore, user) {
  const rows = await listEstates(store, user.email);
  if (rows.length) return rows;
  const legacy = await usersStore.get("desk:" + user.email, { type: "json" });
  const made = await createEstate(store, user, user.plan === "professional" ? "Estate 1" : "My estate", { legacyDesk: legacy });
  return made.estate ? [made.estate] : [];
}

export async function getEstate(store, user, id) {
  if (!validId(id)) return null;
  return await store.get(estKey(user.email, id), { type: "json" });
}

export async function saveEstate(store, user, id, desk) {
  const e = await getEstate(store, user, id);
  if (!e) return { error: "Estate not found", status: 404 };
  if (e.archived) return { error: "This estate is archived (read-only). Restore it to edit.", status: 409 };
  if (JSON.stringify(desk || {}).length > MAX_DESK_BYTES) return { error: "Desk too large", status: 413 };
  e.desk = sanitizeDesk(desk, user.plan);
  e.updatedAt = new Date().toISOString();
  await store.setJSON(estKey(user.email, id), e);
  return { estate: e };
}

export async function renameEstate(store, user, id, name) {
  if (!limitsFor(user)?.clientList) return { error: "Renaming estates is part of the Professional client list", status: 403 };
  const e = await getEstate(store, user, id);
  if (!e) return { error: "Estate not found", status: 404 };
  const n = normName(name);
  if (!n) return { error: "Enter a name (1–120 characters)", status: 400 };
  e.name = n; e.updatedAt = new Date().toISOString();
  await store.setJSON(estKey(user.email, id), e);
  return { estate: e };
}

export async function setArchived(store, user, id, archived) {
  if (!limitsFor(user)?.clientList) return { error: "Archiving is part of the Professional client list", status: 403 };
  const e = await getEstate(store, user, id);
  if (!e) return { error: "Estate not found", status: 404 };
  e.archived = !!archived; e.updatedAt = new Date().toISOString();
  if (e.archived && e.shareToken) { await store.delete("share:" + e.shareToken); delete e.shareToken; }
  await store.setJSON(estKey(user.email, id), e);
  return { estate: e };
}

export async function createShare(store, user, id) {
  if (!limitsFor(user)?.share) return { error: "Family sharing is part of the Family and Professional plans", status: 403 };
  const e = await getEstate(store, user, id);
  if (!e) return { error: "Estate not found", status: 404 };
  if (e.archived) return { error: "Restore the estate before sharing it", status: 409 };
  if (e.shareToken) await store.delete("share:" + e.shareToken);
  e.shareToken = randomToken(24);
  await store.setJSON("share:" + e.shareToken, { owner: user.email, estateId: e.id, createdAt: new Date().toISOString() });
  await store.setJSON(estKey(user.email, id), e);
  return { estate: e, token: e.shareToken };
}

export async function revokeShare(store, user, id) {
  const e = await getEstate(store, user, id);
  if (!e) return { error: "Estate not found", status: 404 };
  if (e.shareToken) { await store.delete("share:" + e.shareToken); delete e.shareToken; await store.setJSON(estKey(user.email, id), e); }
  return { estate: e };
}

// Read-only view for family members holding a share link. Exposes progress only:
// estate name, date of death, task statuses and circle names. No letters, values, costs or account details.
export async function sharedView(store, usersStore, token, getUserFn) {
  const t = String(token || "");
  if (!/^[A-Za-z0-9_-]{30,40}$/.test(t)) return { error: "This link is not valid", status: 404 };
  const link = await store.get("share:" + t, { type: "json" });
  if (!link) return { error: "This link is not valid or was revoked", status: 404 };
  const owner = await getUserFn(usersStore, link.owner);
  const e = owner ? await store.get(estKey(owner.email, link.estateId), { type: "json" }) : null;
  if (!owner || !e || e.archived || e.shareToken !== t || !limitsFor(owner)?.share) return { error: "This link is not valid or was revoked", status: 404 };
  return { view: { name: e.name, updatedAt: e.updatedAt, dod: e.desk?.dod || null, tasks: e.desk?.tasks || [], circle: (e.desk?.circle || []).map((m) => ({ name: m.name, relation: m.relation, role: m.role })) } };
}

export async function deleteAllForOwner(store, email) {
  const rows = await listEstates(store, email);
  for (const e of rows) {
    if (e.shareToken) await store.delete("share:" + e.shareToken);
    await store.delete(estKey(email, e.id));
  }
  return rows.length;
}
