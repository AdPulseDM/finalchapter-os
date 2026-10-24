// Document generation for paid accounts: letters (.docx and .pdf) and the Print kit (.pdf).
// Everything is built in memory from the estate data already stored for the account; nothing is kept afterwards.
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import * as R from "../../public/fc-rules.js";

// ---------- minimal ZIP (stored, no compression) for .docx ----------
const CRC_TABLE = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
export function crc32(buf) { let c = 0xffffffff; for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
export function zip(files) {
  const enc = new TextEncoder(); const parts = []; const central = []; let offset = 0;
  for (const [name, content] of files) {
    const data = typeof content === "string" ? enc.encode(content) : content; const fname = enc.encode(name); const crc = crc32(data);
    const local = Buffer.alloc(30); local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0x0800, 6); local.writeUInt16LE(0, 8);
    local.writeUInt16LE(0, 10); local.writeUInt16LE(0x21, 12); local.writeUInt32LE(crc, 14); local.writeUInt32LE(data.length, 18); local.writeUInt32LE(data.length, 22); local.writeUInt16LE(fname.length, 26); local.writeUInt16LE(0, 28);
    parts.push(local, fname, data);
    const cen = Buffer.alloc(46); cen.writeUInt32LE(0x02014b50, 0); cen.writeUInt16LE(20, 4); cen.writeUInt16LE(20, 6); cen.writeUInt16LE(0x0800, 8); cen.writeUInt16LE(0, 10);
    cen.writeUInt16LE(0, 12); cen.writeUInt16LE(0x21, 14); cen.writeUInt32LE(crc, 16); cen.writeUInt32LE(data.length, 20); cen.writeUInt32LE(data.length, 24); cen.writeUInt16LE(fname.length, 28);
    cen.writeUInt32LE(offset, 42); central.push(cen, fname);
    offset += 30 + fname.length + data.length;
  }
  const cdSize = central.reduce((a, b) => a + b.length, 0);
  const end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10); end.writeUInt32LE(cdSize, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...parts, ...central, end]);
}
const xmlEsc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "");

export function letterDocx(letter) {
  const run = (s) => s.blank
    ? `<w:r><w:rPr><w:b/><w:highlight w:val="yellow"/></w:rPr><w:t xml:space="preserve">[${xmlEsc(s.t)}]</w:t></w:r>`
    : `<w:r><w:t xml:space="preserve">${xmlEsc(s.t)}</w:t></w:r>`;
  const p = (line, style = "") => `<w:p>${style ? `<w:pPr><w:pStyle w:val="${style}"/></w:pPr>` : ""}${R.segments(line).map(run).join("")}</w:p>`;
  const body = [p(letter.title, "Title"), ...letter.lines.map((l) => p(l)), p(""), p(letter.footer, "Note")].join("");
  const doc = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr></w:body></w:document>`;
  const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri"/><w:sz w:val="22"/><w:lang w:val="en-CA"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="0" w:line="276" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style><w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:after="240"/></w:pPr><w:rPr><w:b/><w:sz w:val="28"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Note"><w:name w:val="Note"/><w:basedOn w:val="Normal"/><w:rPr><w:i/><w:color w:val="555555"/><w:sz w:val="18"/></w:rPr></w:style></w:styles>`;
  return zip([
    ["[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>`],
    ["_rels/.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>`],
    ["docProps/core.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>${xmlEsc(letter.title)}</dc:title><dc:creator>FinalChapter</dc:creator></cp:coreProperties>`],
    ["word/_rels/document.xml.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`],
    ["word/document.xml", doc],
    ["word/styles.xml", styles],
  ]);
}

// ---------- PDF ----------
// Standard fonts use WinAnsi; map anything outside it to a safe stand-in.
const WIN_EXTRA = "€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ";
export function pdfSafe(s) {
  return String(s ?? "").replace(/[\u2192]/g, "->").replace(/[\u2713\u2714]/g, "x").replace(/[\u2010\u2011\u2012]/g, "-").replace(/\u00a0/g, " ")
    .replace(/[^\u0020-\u007e\u00a1-\u00ff]/g, (c) => (WIN_EXTRA.includes(c) ? c : "?"));
}
const PAGE = { w: 612, h: 792, m: 54 };
class Writer {
  constructor(pdf, fonts, title) { this.pdf = pdf; this.f = fonts; this.title = title; this.newPage(); }
  newPage() { this.page = this.pdf.addPage([PAGE.w, PAGE.h]); this.y = PAGE.h - PAGE.m; this.pageNo = (this.pageNo || 0) + 1; this.footer(); }
  footer() { this.page.drawText(pdfSafe(`${this.title} · page ${this.pageNo} · Organizer only. Not legal or tax advice. FinalChapter does not file anything.`), { x: PAGE.m, y: 28, size: 7.5, font: this.f.reg, color: rgb(0.4, 0.4, 0.4) }); }
  ensure(h) { if (this.y - h < PAGE.m) this.newPage(); }
  wrap(segs, size, width, font) {
    // segs: [{t, blank, bold}] -> lines of [{t, blank, bold}]
    const lines = [[]]; let x = 0;
    const words = []; for (const s of segs) for (const w of pdfSafe(s.blank ? `[${s.t}]` : s.t).split(/(\s+)/)) if (w) words.push({ ...s, t: w });
    for (const w of words) {
      const fnt = w.bold || w.blank ? this.f.bold : font; const ww = fnt.widthOfTextAtSize(w.t, size);
      if (/^\s+$/.test(w.t)) { if (x > 0) { lines.at(-1).push(w); x += ww; } continue; }
      if (x + ww > width && x > 0) { const l = lines.at(-1); while (l.length && /^\s+$/.test(l.at(-1).t)) l.pop(); lines.push([]); x = 0; }
      lines.at(-1).push(w); x += ww;
    }
    return lines;
  }
  text(str, { size = 10.5, bold = false, color = rgb(0.07, 0.07, 0.09), indent = 0, gap = 4, segs } = {}) {
    const font = bold ? this.f.bold : this.f.reg; const lh = size * 1.35; const width = PAGE.w - 2 * PAGE.m - indent;
    const lines = this.wrap(segs || [{ t: String(str) }], size, width, font);
    for (const line of lines) {
      this.ensure(lh); let x = PAGE.m + indent;
      for (const w of line) {
        const fnt = w.bold || w.blank || bold ? this.f.bold : font; const ww = fnt.widthOfTextAtSize(w.t, size);
        if (w.blank) this.page.drawRectangle({ x: x - 1, y: this.y - size * 0.25 - 1, width: ww + 2, height: size * 1.15, color: rgb(1, 0.95, 0.55) });
        this.page.drawText(w.t, { x, y: this.y - size * 0.95 + size * 0.7, size, font: fnt, color });
        x += ww;
      }
      this.y -= lh;
    }
    this.y -= gap;
  }
  h(str, size = 16) { this.ensure(size * 2.2); this.y -= 6; this.text(str, { size, bold: true, gap: 6 }); }
  checkbox(label, checked, sub) {
    const size = 10; this.ensure(size * 2.6);
    const top = this.y;
    this.page.drawRectangle({ x: PAGE.m, y: top - 11, width: 10, height: 10, borderColor: rgb(0.2, 0.2, 0.2), borderWidth: 0.8 });
    if (checked) { this.page.drawLine({ start: { x: PAGE.m + 2, y: top - 6 }, end: { x: PAGE.m + 4.5, y: top - 9 }, thickness: 1.2 }); this.page.drawLine({ start: { x: PAGE.m + 4.5, y: top - 9 }, end: { x: PAGE.m + 8.5, y: top - 2.5 }, thickness: 1.2 }); }
    this.text(label, { size, indent: 18, gap: 0 });
    if (sub) this.text(sub, { size: 8.5, indent: 18, color: rgb(0.35, 0.35, 0.4), gap: 2 });
    this.y -= 3;
  }
  rule() { this.ensure(10); this.page.drawLine({ start: { x: PAGE.m, y: this.y }, end: { x: PAGE.w - PAGE.m, y: this.y }, thickness: 0.5, color: rgb(0.75, 0.75, 0.8) }); this.y -= 10; }
}
async function newPdf(title) {
  const pdf = await PDFDocument.create();
  pdf.setTitle(title); pdf.setCreator("FinalChapter"); pdf.setProducer("FinalChapter"); pdf.setCreationDate(new Date(0)); pdf.setModificationDate(new Date(0));
  const fonts = { reg: await pdf.embedFont(StandardFonts.Helvetica), bold: await pdf.embedFont(StandardFonts.HelveticaBold) };
  return { pdf, w: new Writer(pdf, fonts, title) };
}
function writeLetter(w, letter) {
  w.h(letter.title, 15);
  for (const line of letter.lines) { if (!line) { w.y -= 7; continue; } w.text("", { segs: R.segments(line), gap: 1 }); }
  w.y -= 10; w.text(letter.footer, { size: 8.5, color: rgb(0.35, 0.35, 0.4) });
}
export async function letterPdf(letter) {
  const { pdf, w } = await newPdf(letter.title); writeLetter(w, letter);
  return Buffer.from(await pdf.save());
}

// Print kit: cover, next deadlines + deadline sheet, timeline, checklist with checkboxes, documents, letter pack, sources.
export async function printKitPdf({ estateName, desk = {}, today = R.todayYMD() }) {
  const L = desk.letter || {};
  const title = `Print kit: ${estateName || "Estate"}`;
  const { pdf, w } = await newPdf(title);
  const blank = "________________";
  w.h("FinalChapter Print kit", 22);
  w.text(estateName || "Estate", { size: 14, bold: true });
  w.text(`Person who died: ${L.name || blank}`); w.text(`Date of death: ${R.longDate(desk.dod) || blank}`);
  w.text(`Estate trustee (executor): ${L.trustee || blank}`); w.text(`Estate certificate issued: ${R.longDate(desk.certDate) || blank}`);
  w.text(`Prepared ${R.longDate(today)}. Rules checked ${R.SOURCES_CHECKED}.`, { size: 9, color: rgb(0.35, 0.35, 0.4) });
  w.rule();
  w.text("FinalChapter is an organizer. It does not file forms, returns or letters for you and is not legal, tax or financial advice. Dates are general estimates from official sources; confirm them with the court, the CRA, the Ministry of Finance or a professional. The estate trustee remains responsible for the estate.", { size: 9.5 });

  w.newPage(); w.h("Deadline sheet");
  const dl = R.deadlinesFor(desk);
  if (dl.needDod) w.text("Enter the date of death in FinalChapter to fill in these dates. Until then, write them in by hand.", { bold: true });
  const sorted = [...dl.items].sort((a, b) => (a.due && b.due ? a.due.localeCompare(b.due) : a.due ? -1 : b.due ? 1 : 0));
  for (const i of sorted) {
    w.checkbox(`${i.name}: ${i.due ? R.longDate(i.due) : "date: " + blank}${i.optional ? " (optional)" : ""}${i.conditional ? " (only if it applies)" : ""}`, false, `${i.note} Source: ${i.src.name}, ${i.src.url}`);
  }
  w.y -= 4; w.text("If a CRA or Ministry of Finance due date falls on a weekend or public holiday, it is generally on time on the next business day.", { size: 8.5, color: rgb(0.35, 0.35, 0.4) });
  if (desk.value > 0) { w.y -= 6; w.text(`Estate Administration Tax estimate on ${desk.value.toLocaleString("en-CA", { style: "currency", currency: "CAD" })}: $${R.eat(desk.value).toLocaleString("en-CA")}. ${R.eatExplain(desk.value)}`, { size: 9.5 }); }

  w.newPage(); w.h("Timeline");
  const status = {}; (desk.tasks || []).forEach((t) => (status[t.id] = t.status));
  for (const p of R.PHASES) {
    w.text(`${p.name} (${p.range})`, { bold: true, size: 11.5, gap: 2 });
    for (const t of R.TASKS.filter((x) => x.phase === p.id)) {
      const target = R.isYMD(desk.dod) ? R.longDate(R.addDays(desk.dod, t.day)) : t.due;
      w.text(`${target}  ·  ${t.id}. ${t.title}`, { size: 9, indent: 10, gap: 0 });
    }
    w.y -= 6;
  }
  w.text("Target dates count from the date of death and are planning guides, not legal deadlines (except those on the deadline sheet).", { size: 8.5, color: rgb(0.35, 0.35, 0.4) });

  w.newPage(); w.h("Checklist");
  for (const p of R.PHASES) {
    w.text(p.name, { bold: true, size: 11.5, gap: 2 });
    for (const t of R.TASKS.filter((x) => x.phase === p.id)) w.checkbox(`${t.id}. ${t.title}`, status[t.id] === "done", [t.desc, t.forms.length ? "Forms: " + t.forms.join(", ") : ""].filter(Boolean).join("  ·  "));
  }

  w.newPage(); w.h("Documents to gather");
  for (const [k, label] of R.VAULT_DOCS) w.checkbox(label, desk.vault?.[k] === "have");
  w.y -= 10; w.text("Notes", { bold: true }); for (let i = 0; i < 8; i++) { w.y -= 14; w.rule(); }

  for (const [type] of R.LETTER_TYPES) { w.newPage(); writeLetter(w, R.buildLetter(type, desk, estateName, today)); }

  w.newPage(); w.h("Official sources");
  w.text(`Checked ${R.SOURCES_CHECKED}. Rules change; open each source to confirm before you rely on a date or amount.`, { size: 9.5 });
  for (const s of Object.values(R.SRC)) w.text(`${s.name}: ${s.url}`, { size: 9, gap: 3 });
  return Buffer.from(await pdf.save());
}
