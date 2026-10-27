// Builds docs/FinalChapter-Firm-Offer.pdf (one page, US letter) with pdf-lib.
// Copy source of truth: docs/FinalChapter-Firm-Offer.md — keep the two in sync.
// Run: node scripts/build-firm-offer-pdf.mjs
import fs from "node:fs";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

const hex = (h) => rgb(parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255);
const NAVY = hex("#1f2a44"), TEAL = hex("#2f7d6d"), INK = hex("#222222"), MUTED = hex("#6b7280"), LINE = hex("#d1d5db"), PALE = hex("#eef3f1"), POP = hex("#e8f3ee");

const doc = await PDFDocument.create();
doc.setTitle("FinalChapter — Offer for Ontario Trustee & Consulting Firms");
doc.setAuthor("Adpulse Nexus Digital Marketing Ltd.");
doc.setSubject("Firm annual plans: Ontario estate runbook, CRA/EAT tools, letter drafts, documents checklist (no file uploads)");
doc.setProducer("pdf-lib (scripts/build-firm-offer-pdf.mjs)");
doc.setCreationDate(new Date("2026-10-26T00:00:00Z"));
doc.setModificationDate(new Date("2026-10-26T00:00:00Z"));
const page = doc.addPage([612, 792]);
const R = await doc.embedFont(StandardFonts.Helvetica);
const B = await doc.embedFont(StandardFonts.HelveticaBold);
const I = await doc.embedFont(StandardFonts.HelveticaOblique);
const L = 54, W = 612 - 2 * L;
let y = 792 - 60;

// Wrap a list of runs [{t, f, c}] into lines within width; draws and returns new y.
function runs(list, { x = L, width = W, size = 10, lead = 13.5, color = INK } = {}) {
  const words = [];
  for (const r of list) for (const [i, w] of r.t.split(" ").entries()) words.push({ w: (i ? " " : "") + w, f: r.f || R, c: r.c || color });
  let line = [], lw = 0;
  const flush = () => {
    const segs = [];
    for (const p of line) { const l = segs[segs.length - 1]; if (l && l.f === p.f && l.c === p.c) l.w += p.w; else segs.push({ ...p }); }
    let cx = x; for (const p of segs) { page.drawText(p.w, { x: cx, y, size, font: p.f, color: p.c }); cx += p.f.widthOfTextAtSize(p.w, size); } y -= lead; line = []; lw = 0; };
  for (const p of words) {
    const ww = p.f.widthOfTextAtSize(p.w, size);
    if (lw + ww > width && line.length) { flush(); p.w = p.w.replace(/^ /, ""); }
    line.push(p); lw += p.f.widthOfTextAtSize(p.w, size);
  }
  if (line.length) flush();
  return y;
}
const h2 = (t) => { y -= 6; page.drawText(t, { x: L, y, size: 12.5, font: B, color: TEAL }); y -= 16; };

// Header
page.drawText("FinalChapter", { x: L, y, size: 22, font: B, color: NAVY });
const hw = B.widthOfTextAtSize("FinalChapter", 22);
page.drawText("  ·  For Ontario trustee & consulting firms", { x: L + hw, y: y + 1, size: 13, font: R, color: TEAL });
y -= 10; page.drawLine({ start: { x: L, y }, end: { x: L + W, y }, thickness: 1.2, color: TEAL }); y -= 20;

runs([{ t: "You’re not replacing your lawyer or Emergent. You’re giving your staff one Ontario desk so the 180-day return, creditor notice, and CRA windows stop living in someone’s head. We link the official forms; we don’t file them." }], { size: 10.5, lead: 14.5 });
y -= 6;

h2("What you get");
const bullets = [
  [["60-step Ontario timeline", " for each estate, with the next deadline always in view"]],
  [["CRA windows + estate administration tax (EAT) calculator", ""]],
  [["Letter drafts", " for banks, creditors, and other parties"]],
  [["Documents checklist", " — mark each key document have / not yet (no file uploads; originals stay with you)"]],
  [["Official form links:", " 74A, TX19, T1, T3, Estate Information Return"]],
];
for (const [[b, r]] of bullets) {
  page.drawText("•", { x: L, y, size: 10, font: B, color: INK });
  runs([{ t: b, f: B }, ...(r ? [{ t: r }] : [])], { x: L + 10, width: W - 10, size: 10, lead: 14 });
}
runs([{ t: "Organizer only — FinalChapter does not file forms and is not legal, tax, or financial advice.", c: MUTED }], { size: 8.5, lead: 12 });
y -= 4;

h2("Three annual plans (CAD)");
y -= 4;
const cols = [L, L + 108, L + 205], colW = [100, 90, W - 205 - 8];
const hdrH = 22;
page.drawRectangle({ x: L, y: y - hdrH + 14, width: W, height: hdrH, color: NAVY });
["Plan", "Price", "Includes"].forEach((t, i) => page.drawText(t, { x: cols[i] + 8, y: y - 3, size: 9.5, font: B, color: rgb(1, 1, 1) }));
y -= hdrH - 14 + 4;
const rows = [
  ["Firm Starter", "", "$1,800", "Up to 10 active estates · 3 staff logins · shared templates · documents checklist · letter drafts · CRA/EAT tools", false],
  ["Firm Desk", "MOST POPULAR", "$3,600", "Up to 30 estates · 8 staff · firm branding on letters & client view · audit log · priority email", true],
  ["Firm OS", "", "$6,000", "Unlimited estates · 15 staff · white-label client portal · custom templates · quarterly check-in", false],
];
for (const [name, tag, amt, inc, pop] of rows) {
  const rh = 38, top = y;
  page.drawRectangle({ x: L, y: top - rh, width: W, height: rh, color: pop ? POP : rgb(1, 1, 1), borderColor: pop ? TEAL : LINE, borderWidth: pop ? 1.2 : 0.6 });
  const mid = top - rh / 2;
  page.drawText(name, { x: cols[0] + 8, y: tag ? mid + 2 : mid - 3, size: 9.5, font: B, color: NAVY });
  if (tag) page.drawText(tag, { x: cols[0] + 8, y: mid - 9, size: 6.8, font: B, color: TEAL });
  page.drawText(amt, { x: cols[1] + 8, y: mid - 3, size: 9.5, font: B, color: INK });
  page.drawText(" / year", { x: cols[1] + 8 + B.widthOfTextAtSize(amt, 9.5), y: mid - 3, size: 9, font: R, color: INK });
  const saveY = y; y = mid + 4;
  runs([{ t: inc }], { x: cols[2] + 8, width: colW[2], size: 8.6, lead: 11.5 });
  y = saveY - rh;
}
y -= 13;
runs([{ t: "Billed annually · cancel anytime · arranged directly with our team (not sold through online checkout).", c: MUTED }], { size: 8.5, lead: 12 });
runs([{ t: "Prefer to try first? Professional is $199 once (up to five client estates) on the public site.", f: I, c: MUTED }], { size: 8.5, lead: 12 });
y -= 4;

h2("How firms get started");
["Tell us how many active estates and staff you expect.", "We send a written quote in CAD for the plan that fits.", "Your team gets logins and starts every estate on the same Ontario runbook."].forEach((t, i) => {
  page.drawText(`${i + 1}.`, { x: L, y, size: 10, font: R, color: INK });
  runs([{ t }], { x: L + 14, width: W - 14, size: 10, lead: 14 });
});
y -= 2;

h2("Request a written quote");
y -= 4;
page.drawRectangle({ x: L, y: y - 11, width: W, height: 28, color: PALE, borderColor: LINE, borderWidth: 0.6 });
runs([{ t: "Email " }, { t: "info@adpulsenexus.com", f: B }, { t: "  ·  Visit " }, { t: "finalchapter-os.netlify.app/#firms", f: B }], { x: L + 10, size: 10 });

// Footer
page.drawLine({ start: { x: L, y: 50 }, end: { x: L + W, y: 50 }, thickness: 0.5, color: LINE });
const ft = "Adpulse Nexus Digital Marketing Ltd. · FinalChapter does not file forms and is not legal, tax, or financial advice.";
page.drawText(ft, { x: (612 - R.widthOfTextAtSize(ft, 7.5)) / 2, y: 38, size: 7.5, font: R, color: MUTED });

fs.writeFileSync(new URL("../docs/FinalChapter-Firm-Offer.pdf", import.meta.url), await doc.save());
console.log("wrote docs/FinalChapter-Firm-Offer.pdf");
