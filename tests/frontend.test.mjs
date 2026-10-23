import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
const html = fs.readFileSync(new URL("../public/index.html", import.meta.url), "utf8");
const catalog = JSON.parse(fs.readFileSync(new URL("../public/forms-catalog.json", import.meta.url), "utf8"));

test("no client-side unlock paths remain", () => {
  assert.ok(!/fc\.paid/.test(html), "sessionStorage paid flag removed");
  assert.ok(!/fcPreview|setPreview/.test(html), "preview unlock removed");
  assert.ok(!/mark-paid/.test(html), "mark-paid call removed");
  assert.ok(!/code\.length\s*<\s*4/.test(html), "any-4-char code removed");
  assert.match(html, /function isPaid\(\)\{ return session\.role==="client" && !!\(session\.user && session\.user\.paid\); \}/);
});

test("content fixes present", () => {
  assert.ok(!html.includes("finalchapter.app/os"));
  assert.ok(!/Form checked \$\{today\}/.test(html));
  assert.ok(!html.includes("Form 74.1") && !html.includes("Form 74.8"));
  assert.ok(html.includes("Form 74A – Application for a Certificate of Appointment of Estate Trustee"));
  assert.ok(html.includes("maximum $5,000") && html.includes("Up to $5,000"));
  assert.ok(!html.includes("ontario.ca/page/estate-information-return"));
  assert.ok(!html.includes("forms/rc411.html"));
  for (const p of ["/privacy.html", "/terms.html", "/refunds.html", 'id="what-you-get"']) assert.ok(html.includes(p), p);
});

test("catalog step ids match the forms named on those steps", () => {
  const raw = JSON.parse(html.match(/const RAW=(\[\[.*?\]\]);/s)[1]);
  const byId = Object.fromEntries(raw.map((t) => [t[0], t]));
  const aliases = { "Death certificate order": ["Death certificate order"], "Probate overview": null, "Estate Information Return": ["EIR"], "T3 return (T3RET)": ["T3 return", "Final T3 return"], "GST/HST cancellation": ["GST cancellation"] };
  for (const f of catalog.forms) {
    for (const id of f.steps) {
      assert.ok(byId[id], `step ${id} exists`);
      const names = aliases[f.name] === null ? null : aliases[f.name] || [f.name];
      if (names) assert.ok(byId[id][7].some((x) => names.includes(x)), `${f.name} on step ${id} (has ${byId[id][7]})`);
    }
  }
});
