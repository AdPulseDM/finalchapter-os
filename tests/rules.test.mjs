// Official-rule math: Estate Administration Tax, probate decision tree, CRA/Ontario deadlines, letter placeholders.
import { test } from "node:test";
import assert from "node:assert/strict";
import * as R from "../public/fc-rules.js";

test("EAT: $0 to $50,000; $15 per $1,000 or part thereof above (EAT Act s. 2(6.1))", () => {
  const cases = [[0, 0], [-5, 0], [NaN, 0], [49999, 0], [50000, 0], [50000.01, 15], [50001, 15], [51000, 15], [51001, 30],
    [100000, 750], [149999, 1500], [150000, 1500], [150001, 1515], [239250, 2850], [240000, 2850], [425000, 5625], [1000000, 14250]];
  for (const [v, t] of cases) assert.equal(R.eat(v), t, `value ${v}`);
  assert.equal(Number.isInteger(R.eat(123456.78)), true, "no floating-point cents");
  assert.match(R.eatExplain(50001), /1 × \$15 = \$15/);
  assert.match(R.eatExplain(50000), /^\$0/);
});

test("probate check: real estate in sole name means a certificate is likely; small-estate path up to and including $150,000", () => {
  const base = { will: "yes", original: "yes", executor: "yes", passes: "some", demand: "unsure" };
  const r = R.probateCheck({ ...base, realEstate: "yes", value: 150000 });
  assert.equal(r.verdict, "likely");
  assert.equal(r.small, true);
  assert.deepEqual(r.paths.map((p) => p.id), ["small", "regular"]);
  const small = r.paths[0].docs.map((d) => d.form);
  for (const f of ["Form 74.1A", "Form 74.1B", "Form 74.1C", "Form 74D", "Original will"]) assert.ok(small.includes(f), f);
  const reg = r.paths[1].docs.map((d) => d.form);
  for (const f of ["Form 74A", "Form 74B or 74B.1", "Form 74C", "Form 74D"]) assert.ok(reg.includes(f), f);
  assert.equal(r.eat, 1500);
  assert.match(r.eirNote, /180 calendar days after it is issued/);
  const big = R.probateCheck({ ...base, realEstate: "yes", value: 150001 });
  assert.equal(big.small, false);
  assert.deepEqual(big.paths.map((p) => p.id), ["regular"]);
  assert.match(big.paths[0].note, /over \$150,000/);
});

test("probate check: everything passing by survivorship/beneficiary with no demand may not need probate", () => {
  const r = R.probateCheck({ will: "yes", original: "yes", executor: "yes", passes: "all", realEstate: "no", demand: "no", value: 0 });
  assert.equal(r.verdict, "maybe-not");
  assert.equal(r.paths.length, 0);
  assert.equal(r.eat, 0);
  const some = R.probateCheck({ will: "yes", original: "yes", executor: "yes", passes: "some", realEstate: "no", demand: "no", value: 30000 });
  assert.equal(some.verdict, "check");
  const demand = R.probateCheck({ will: "yes", original: "yes", executor: "yes", passes: "some", realEstate: "no", demand: "yes", value: 30000 });
  assert.equal(demand.verdict, "likely");
});

test("probate check: no will needs a bond and consents; lawyer flags are listed", () => {
  const r = R.probateCheck({ will: "no", passes: "none", realEstate: "no", demand: "unsure", value: 400000, flags: ["minors"] });
  assert.equal(r.verdict, "likely");
  const reg = r.paths[0].docs;
  assert.ok(reg.some((d) => d.form.startsWith("Bond") && !d.when), "bond required without a will");
  assert.ok(!reg.some((d) => d.form === "Form 74D"), "no will affidavit without a will");
  assert.ok(r.lawyer.some((t) => /under 18/.test(t)));
  const copy = R.probateCheck({ will: "yes", original: "no", executor: "yes", passes: "some", realEstate: "no", demand: "no", value: 1000 });
  assert.ok(copy.lawyer.some((t) => /copy of the will/.test(t)), "missing original flags a lawyer");
});

const due = (desk, id) => R.deadlinesFor(desk).items.find((i) => i.id === id)?.due;
test("final T1: death Jan 1–Oct 31 due April 30 next year; Nov 1–Dec 31 due 6 months after death", () => {
  assert.equal(due({ dod: "2025-01-01" }, "t1"), "2026-04-30");
  assert.equal(due({ dod: "2025-10-31" }, "t1"), "2026-04-30");
  assert.equal(due({ dod: "2025-11-01" }, "t1"), "2026-05-01");
  assert.equal(due({ dod: "2025-12-15" }, "t1"), "2026-06-15");
  assert.equal(due({ dod: "2025-12-31" }, "t1"), "2026-06-30", "no June 31: last day of the month");
  assert.equal(due({ dod: "2023-08-31" }, "t3") !== undefined, true);
  assert.equal(R.addMonths("2023-08-31", 6), "2024-02-29", "leap year end-of-month");
});

test("final T1, self-employed: filing June 15 (or 6 months for Dec 16–31) but balance still due on the regular date", () => {
  const d = R.deadlinesFor({ dod: "2025-10-31", selfEmployed: true }).items;
  assert.equal(d.find((i) => i.id === "t1").due, "2026-04-30");
  assert.equal(d.find((i) => i.id === "t1se").due, "2026-06-15");
  assert.equal(due({ dod: "2025-12-20", selfEmployed: true }, "t1se"), "2026-06-20");
});

test("prior-year T1 only for deaths on or before that year's due date", () => {
  assert.equal(due({ dod: "2026-03-10" }, "t1prior"), "2026-09-10");
  assert.equal(due({ dod: "2026-05-01" }, "t1prior"), undefined);
  assert.equal(due({ dod: "2026-06-10", selfEmployed: true }, "t1prior"), "2026-12-10");
});

test("EIR: 180 calendar days after the certificate, moved off weekends; prompt until a certificate date is entered", () => {
  assert.equal(due({ dod: "2025-05-01", certDate: "2026-01-05" }, "eir"), "2026-07-06", "Jul 4 2026 is a Saturday");
  assert.equal(R.addDays("2026-01-05", 180), "2026-07-04");
  assert.equal(due({ dod: "2025-05-01", certDate: "2026-01-07" }, "eir"), "2026-07-06");
  assert.equal(due({ dod: "2025-05-01", certDate: "2026-01-08" }, "eir"), "2026-07-07");
  const p = R.deadlinesFor({ dod: "2025-05-01" }).items.find((i) => i.id === "eir");
  assert.equal(p.due, null); assert.equal(p.needs, "certDate");
});

test("T3 and creditor notice dates", () => {
  assert.equal(due({ dod: "2025-05-01", t3YearEnd: "2025-12-31" }, "t3"), "2026-03-31");
  const est = R.deadlinesFor({ dod: "2025-05-01" }).items.find((i) => i.id === "t3");
  assert.equal(est.estimate, true); assert.equal(est.due, "2026-07-30");
  assert.equal(due({ dod: "2025-05-01", t3YearEnd: "2026-06-01" }, "t3"), "2026-07-30", "a year-end later than 1 year falls back to the estimate");
  assert.equal(due({ dod: "2025-05-01" }, "gre"), "2028-07-30");
  assert.equal(due({ dod: "2025-05-01", creditorLast: "2025-07-10" }, "creditors"), "2025-08-09");
});

test("next deadlines: date of death required; the next 3 upcoming, earliest first", () => {
  assert.equal(R.nextDeadlines({}, "2026-01-01").needDod, true);
  const n = R.nextDeadlines({ dod: "2025-11-15", certDate: "2026-02-02" }, "2025-12-01");
  assert.deepEqual(n.upcoming.map((i) => i.id), ["cpp", "t1", "eir"]);
  assert.equal(n.upcoming[1].due, "2026-05-15");
  assert.equal(n.upcoming[0].days, 44);
  const later = R.nextDeadlines({ dod: "2025-11-15" }, "2026-06-01");
  assert.ok(later.past.some((i) => i.id === "t1"));
  assert.ok(later.prompts.some((i) => i.needs === "certDate"));
});

test("letters: known data fills in, unknown data is a marked blank", () => {
  const empty = R.buildLetter("bank", {}, "", "2026-10-24");
  const text = R.plainText(empty);
  for (const b of ["[FULL NAME OF THE PERSON WHO DIED]", "[DATE OF DEATH]", "[YOUR FULL NAME]", "[BANK NAME AND BRANCH ADDRESS]"]) assert.ok(text.includes(b), b);
  const full = R.buildLetter("bank", { dod: "2025-03-02", certDate: "2025-09-01", letter: { name: "Ann Lee", trustee: "Sam Lee", institution: "Example Bank", account: "ending 1234", trusteeAddress: "1 Main St", trusteeContact: "sam@example.com" } }, "", "2026-10-24");
  const t2 = R.plainText(full);
  for (const s of ["Ann Lee", "March 2, 2025", "Sam Lee", "Example Bank", "ending 1234", "September 1, 2025", "Estate of Ann Lee"]) assert.ok(t2.includes(s), s);
  assert.ok(!/\[YOUR FULL NAME\]|\[DATE OF DEATH\]/.test(t2));
  assert.ok(t2.includes("not legal or tax advice"));
  for (const [type] of R.LETTER_TYPES) assert.ok(R.buildLetter(type, {}, "", "2026-10-24"), type);
  assert.equal(R.buildLetter("nope", {}), null);
  assert.deepEqual(R.segments("a [[B]] c"), [{ t: "a " }, { t: "B", blank: true }, { t: " c" }]);
});
