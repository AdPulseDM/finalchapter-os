// Scheduled daily: deletes accounts and estate data 3 years after last activity (privacy policy, "Retention").
// Payment/transaction receipts (stripe:<sessionId>) are NOT deleted here; they are kept as long as required by law.
// Also removes expired sessions.
import { RETENTION_MS } from "../lib/core.mjs";
import { usersStore, estatesStore } from "../lib/store.mjs";
import { deleteAllForOwner } from "../lib/estates.mjs";

export async function runRetention({ store, estates, now = Date.now() }) {
  const deleted = [];
  const { blobs: users } = await store.list({ prefix: "user:" });
  for (const b of users || []) {
    const u = await store.get(b.key, { type: "json" });
    if (!u) continue;
    const last = Date.parse(u.lastActiveAt || u.paidAt || u.createdAt || "");
    if (!Number.isFinite(last) || now - last < RETENTION_MS) continue;
    await deleteAllForOwner(estates, u.email);
    await store.delete("desk:" + u.email);
    if (u.workspaceCode) await store.delete("code:" + u.workspaceCode);
    await store.delete(b.key);
    deleted.push(u.email);
  }
  let sessions = 0;
  const { blobs: sess } = await store.list({ prefix: "sess:" });
  for (const b of sess || []) {
    const s = await store.get(b.key, { type: "json" });
    if (!s || !s.exp || s.exp < now || deleted.includes(s.email)) { await store.delete(b.key); sessions++; }
  }
  return { deleted, sessions };
}

export default async () => {
  const r = await runRetention({ store: usersStore(), estates: estatesStore() });
  console.log(`retention: deleted ${r.deleted.length} inactive account(s), ${r.sessions} session(s)`);
};

export const config = { schedule: "@daily" };
