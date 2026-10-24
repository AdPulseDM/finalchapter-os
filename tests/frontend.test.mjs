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

test("plan cards and policies match what each plan does; filled placeholders are gone", async () => {
  const fs = await import("node:fs");
  const html = fs.readFileSync(new URL("../public/index.html", import.meta.url), "utf8");
  const terms = fs.readFileSync(new URL("../public/terms.html", import.meta.url), "utf8");
  const privacy = fs.readFileSync(new URL("../public/privacy.html", import.meta.url), "utf8");
  const refunds = fs.readFileSync(new URL("../public/refunds.html", import.meta.url), "utf8");
  assert.ok(html.includes("<li>Up to five client estates</li>") && html.includes("<li>Client list and estate switcher</li>"));
  assert.ok(html.includes("<li>View-only progress link to share with family</li>"));
  assert.ok(!html.includes("share a feed"), "no promise of a shared feed");
  assert.ok(!html.includes("[TAX NOTE"));
  for (const [name, s] of [["terms", terms], ["privacy", privacy], ["refunds", refunds]]) {
    for (const ph of ["[ACCESS PERIOD", "[RETENTION PERIOD]", "[RECORDS RETENTION PERIOD]", "[STATE WHETHER", "[RESPONSE TIME]", "[AND DESCRIBE"]) assert.ok(!s.includes(ph), name + " " + ph);
  }
  assert.ok(terms.includes("[CONFIRM CAP WITH COUNSEL]") && terms.includes("[CONFIRM FORUM"), "counsel placeholders left for review");
  assert.ok(privacy.includes("3 years after your last activity"));
});

test("usability fixes: clear hero, no jargon, menus, support, storage", () => {
  const top = html.slice(0, html.indexOf('id="why"'));
  assert.ok(top.includes("A step-by-step checklist") && top.includes("for Ontario executors"));
  assert.ok(top.includes("It does not file forms for you and is not legal, tax or financial advice."), "disclaimer above the fold");
  assert.ok(top.includes("Example estate"), "hero sample labelled");
  assert.ok(!/The OS for|Estate OS|Unlock the desk|Open desk|Desk locked|Workspace code/.test(html), "jargon removed");
  assert.ok(!/demo/i.test(html), "no demo wording");
  assert.ok(html.indexOf('id="pricing"') < html.indexOf('id="account"'), "plans before the account form");
  assert.ok(html.includes('id="menuBtn"') && html.includes('aria-controls="navMenu"'), "mobile menu");
  assert.ok(html.includes("Forgot your password?") && html.includes("elisa@adpulsenexus.com"));
  assert.ok(html.includes('id="liRemember"') && !/id="liRemember"[^>]*checked/.test(html), "keep-me-signed-in unchecked by default");
  assert.ok(/localStorage\.removeItem\("fc\.token"\)/.test(html), "logout clears localStorage");
  assert.ok(html.includes("What happens after you buy") && html.includes(">Support</a>"));
  assert.ok(html.includes("Payment received – thank you.") && html.includes("Checkout cancelled. You haven’t been charged."));
  assert.ok(!html.includes('"Uploaded"'), "no fake uploaded statuses");
  assert.ok(html.includes("Let’s set up this estate"));
  assert.ok(!/state\.dod=new Date\(\)\.toISOString/.test(html), "no silent default date of death for real estates");
  assert.ok(html.includes("scroll-margin-top") && html.includes(":focus-visible"));
});

test("policy and tour copy follow the usability changes", () => {
  const privacy = fs.readFileSync(new URL("../public/privacy.html", import.meta.url), "utf8");
  const tour = fs.readFileSync(new URL("../public/tour.js", import.meta.url), "utf8");
  assert.ok(privacy.includes("Keep me signed in on this device") && privacy.includes("local storage"));
  assert.ok(!/demo/i.test(privacy + tour));
  assert.ok(!tour.includes("Province logic"));
});

test("setup card names the estate and single-estate plans get a rename control", () => {
  assert.ok(html.includes('renameCurrent("Estate of "+state.letter.name)'));
  assert.ok(html.includes('id="renameCur"'));
});
