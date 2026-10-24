import { getStore } from "@netlify/blobs";
// One site-wide store for accounts, sessions, codes and Stripe receipts.
// Note: site-wide stores are shared by production AND deploy previews.
export function usersStore() {
  return getStore({ name: "finalchapter-users", consistency: "strong" });
}
// Estates (desks), one record per estate, plus read-only family share links.
export function estatesStore() {
  return getStore({ name: "finalchapter-estates", consistency: "strong" });
}
