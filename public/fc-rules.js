// FinalChapter shared rules: used by the browser (public/index.html, public/probate.html)
// and by the server (netlify/functions/documents.mjs). Pure functions, no network, no storage.
// Dates are plain "YYYY-MM-DD" strings, computed in UTC so time zones never shift a deadline.
// FinalChapter is an organizer. These are general estimates from official sources, not legal or tax advice.

export const SOURCES_CHECKED = "2026-10-24";

export const SRC = {
  eatAct: { name: "Estate Administration Tax Act, 1998, s. 2 (Ontario e-Laws)", url: "https://www.ontario.ca/laws/statute/98e34" },
  eatPage: { name: "Estate Administration Tax (Ontario Ministry of Finance)", url: "https://www.ontario.ca/page/estate-administration-tax" },
  eirReg: { name: "O. Reg. 310/14, s. 3 (Information required under s. 4.1 of the EAT Act)", url: "https://www.ontario.ca/laws/regulation/140310" },
  probate: { name: "Apply for probate of an estate (ontario.ca)", url: "https://www.ontario.ca/page/apply-probate-estate" },
  smallEstate: { name: "Probate of a small estate (ontario.ca)", url: "https://www.ontario.ca/page/probate-small-estate" },
  forms: { name: "Estate forms under Rules 74, 74.1 and 75 (Ontario Court Forms)", url: "https://ontariocourtforms.on.ca/en/rules-of-civil-procedure-forms/pre-formatted-fillable-estates-forms/" },
  rules: { name: "Rules of Civil Procedure, R.R.O. 1990, Reg. 194, Rules 74 and 74.1 (e-Laws)", url: "https://www.ontario.ca/laws/regulation/900194" },
  craDates: { name: "Filing and payment due dates for someone who died (CRA)", url: "https://www.canada.ca/en/revenue-agency/services/tax/individuals/life-events/doing-taxes-someone-died/prepare-returns/filing-deadlines.html" },
  craT3: { name: "When to file a T3 return (CRA)", url: "https://www.canada.ca/en/revenue-agency/services/tax/trust-administrators/t3-return/filing-trust-return/when-file.html" },
  trusteeAct: { name: "Trustee Act, R.S.O. 1990, c. T.23, s. 53 (e-Laws)", url: "https://www.ontario.ca/laws/statute/90t23" },
  cpp: { name: "CPP death benefit (Service Canada)", url: "https://www.canada.ca/en/services/benefits/publicpensions/cpp/cpp-death-benefit.html" },
  tx19: { name: "TX19 Asking for a Clearance Certificate (CRA)", url: "https://www.canada.ca/en/revenue-agency/services/forms-publications/forms/tx19.html" },
  lso: { name: "Law Society Referral Service", url: "https://lso.ca/public-resources/finding-a-lawyer-or-paralegal/law-society-referral-service" },
};

export const PHASES = [{id:"immediate",name:"Immediate",range:"0–7 days",color:"#fb7185"},{id:"first30",name:"First 30",range:"8–30 days",color:"#fbbf24"},{id:"probate",name:"Probate",range:"Month 1–3",color:"#c084fc"},{id:"cra",name:"CRA",range:"Month 1–6",color:"#34d399"},{id:"assets",name:"Assets",range:"Month 2–8",color:"#60a5fa"},{id:"closure",name:"Closures",range:"Month 3–9",color:"#94a3b8"},{id:"final",name:"Final",range:"Month 9–12",color:"#e4e4e7"}];

export const FORM_LINKS = {
  "Form 74A": SRC.forms.url, "Form 74D": SRC.forms.url, "Form 74G": SRC.forms.url,
  "ISP1200": SRC.cpp.url,
  "ISP1300": "https://www.canada.ca/en/services/benefits/publicpensions/cpp/cpp-survivor-pension.html",
  "TX19": SRC.tx19.url,
  "IC82-6R13": "https://www.canada.ca/en/revenue-agency/services/forms-publications/publications/ic82-6/clearance-certificate.html",
  "T1 final": "https://www.canada.ca/en/revenue-agency/services/tax/individuals/life-events/doing-taxes-someone-died.html",
  "T3 return": "https://www.canada.ca/en/revenue-agency/services/forms-publications/forms/t3ret.html",
  "Final T3 return": "https://www.canada.ca/en/revenue-agency/services/forms-publications/forms/t3ret.html",
  "EIR": SRC.eatPage.url,
  "Death certificate order": "https://www.ontario.ca/page/get-or-replace-an-ontario-death-certificate",
  "Statement of Death": "https://www.ontario.ca/page/what-do-when-someone-dies",
  "Mail redirect": "https://www.canadapost-postescanada.ca/cpc/en/personal/receiving/manage-mail/mail-forwarding.page",
  "Vehicle transfer": "https://www.ontario.ca/page/buy-or-sell-used-vehicle-ontario",
  "GST cancellation": "https://www.canada.ca/en/revenue-agency/services/tax/businesses/topics/gst-hst-businesses/account-close.html",
  "RC4111": "https://www.canada.ca/en/revenue-agency/services/forms-publications/forms/rc4111.html",
  "Creditor notice": SRC.trusteeAct.url,
};

const RAW = [[1,"immediate","Obtain the medical certificate of death","A physician or coroner completes it.","done","Day 1","Ontario medical certificate",["Medical certificate"],1],[2,"immediate","Contact the funeral home","They file the statement of death.","done","Day 2","ServiceOntario",["Statement of Death"],2],[3,"immediate","Secure property and valuables","Locks, mail, deliveries.","doing","Day 2","Duty of care",[],2],[4,"immediate","Locate the will","Safe, box, or lawyer.","done","Day 3","Will search",["Will search"],3],[5,"immediate","Order death certificates","Banks want originals.","doing","Day 5","ServiceOntario",["Death certificate order"],5],[6,"immediate","Speak with an estate lawyer","Real estate or a contest.","todo","Day 5","LSO referral",[],5],[7,"immediate","Read the will","Trustee, alternates, wishes.","done","Day 3","No will: SLRA",["Will"],3],[8,"immediate","Rental tenancy","Short notice may apply.","todo","Day 7","Residential Tenancies Act",["Tenancy notice"],7],[9,"first30","CPP death benefit","Up to $2,500, plus a top-up of up to $2,500 for deaths on or after Jan 1, 2025 if eligible (maximum $5,000). The estate should apply within 60 days.","todo","Week 2","ISP1200",["ISP1200"],14],[10,"first30","Notify Service Canada","Stop benefits on the SIN.","todo","Week 2","Death certificate",["SIN notice"],14],[11,"first30","Cancel OHIP and licence","ServiceOntario.","todo","Week 2","Prevent misuse",["Health card"],14],[12,"first30","List bank accounts","Balance on the date of death.","todo","Week 3","Tell each bank",[],21],[13,"first30","Notify life insurers","Certificate and policy number.","todo","Week 3","Claim form",["Claim form"],21],[14,"first30","Employer and pension","Final pay and survivor benefits.","todo","Week 3","Record of employment",[],21],[15,"first30","Redirect mail","Canada Post estate forwarding.","todo","Week 3","Proof you can act",["Mail redirect"],21],[16,"first30","Digital accounts","Email, banking, subscriptions.","todo","Week 4","Provider rules",[],28],[17,"first30","Vacant-home insurance","Call before cover lapses.","blocked","Week 2","Policy window",[],14],[18,"first30","Values at death","Needed for probate tax.","todo","Month 1","Valuation",["Valuation sheet"],30],[19,"first30","Open an estate account","Estate money only.","todo","Month 1","Will and certificate",["Estate account"],30],[20,"first30","Notice to creditors","Not mandatory, but it protects you. Common practice: 3 weekly notices, then wait at least 30 days.","todo","Month 1","Trustee Act s.53",["Creditor notice"],30],[21,"probate","Is a certificate required?","Land in their name usually needs one.","doing","Month 2","Banks set limits",[],45],[22,"probate","Form 74A – Application for a Certificate of Appointment of Estate Trustee","Filed with the Superior Court of Justice.","todo","Month 2","Superior Court",["Form 74A"],60],[23,"probate","Affidavit of execution","Witness affidavit (Form 74D, Affidavit of Execution of Will or Codicil).","todo","Month 2","Form 74D",["Form 74D"],60],[24,"probate","Renunciation","If a named trustee steps aside (Form 74G, Renunciation and Consent).","todo","Month 2","Form 74G",["Form 74G"],60],[25,"probate","Estate administration tax","$0 if the estate is valued at $50,000 or less. Above that, $15 for each $1,000 or part of $1,000 over $50,000.","todo","Month 2","EAT Act",["EAT calculation"],60],[26,"probate","File at the court","Estates valued at $150,000 or less may use the Small Estate Certificate (Form 74.1A).","todo","Month 2","Court fee is separate",["Filing package"],75],[27,"probate","Wait for the certificate","Do not distribute yet.","blocked","Month 3","Times vary",[],90],[28,"probate","Estate Information Return","Due 180 calendar days after the certificate is issued, even if no tax is owing.","todo","Month 4","Not 90 days",["EIR"],120],[29,"probate","Certificate to the banks","They release to the estate account.","todo","Month 4","Certified copy",[],120],[30,"probate","Last creditor notice","Before gifts go out.","todo","Month 4","Keep proof",[],120],[31,"cra","Final T1","Death Jan 1–Oct 31: due April 30 of the next year. Death Nov 1–Dec 31: due 6 months after death.","todo","Month 6","Terminal return",["T1 final"],180],[32,"cra","T3 if the estate earns","The estate is a separate taxpayer. If a T3 return is required, it is due 90 days after the tax year-end you choose.","todo","Month 6","90 days after year-end",["T3 return"],180],[33,"cra","TX19 clearance","Before the final distribution.","todo","Month 8","Often many months",["TX19","IC82-6R13"],240],[34,"cra","CPP survivor pension","Eligible spouse or partner.","todo","Month 2","ISP1300",["ISP1300"],60],[35,"cra","Close GST/HST","Stop credits in their name.","todo","Month 2","CRA",["GST cancellation"],60],[36,"cra","TFSA and RRSP","RRSP may roll to a spouse.","todo","Month 3","Carrier forms",["Transfer"],90],[37,"cra","Tell CRA of the death","Stops benefits.","todo","Week 4","RC4111",["RC4111"],28],[38,"cra","Rights returns","Up to three extra returns.","todo","Month 6","Guide T4011",["Rights return"],180],[39,"assets","Home value","MPAC plus appraisal.","todo","Month 2","Date-of-death value",["Appraisal"],60],[40,"assets","Land title","Survivorship or estate transfer.","todo","Month 5","Land registry",["Transfer"],150],[41,"assets","Vehicles","ServiceOntario.","todo","Month 3","Plates",["Vehicle transfer"],90],[42,"assets","Collect debts","Loans and receivables.","todo","Month 4","In writing",[],120],[43,"assets","Personal property","Inventory, then sell or give.","todo","Month 6","Follow the will",["Inventory"],180],[44,"assets","Business interests","Shares or a sole prop.","todo","Month 6","Minute book",[],180],[45,"assets","Investments","Deemed disposition at fair value.","todo","Month 5","In kind or sell",[],150],[46,"assets","Safety deposit box","Will and death certificate.","todo","Month 2","Inventory with the bank",[],60],[47,"assets","Mortgage","Keep paying.","todo","Month 2","Tell the lender",[],60],[48,"closure","Close utilities","Final reads.","todo","Month 4","Hydro, gas, water",["Utility letter"],120],[49,"closure","Cancel subscriptions","Watch auto-renew.","todo","Month 4","Cards on file",[],120],[50,"closure","Email and social","Each platform has its own rule.","todo","Month 6","Memorialise or close",["Digital request"],180],[51,"closure","Cards and loyalty","Some allow a spouse transfer.","todo","Month 5","Return ID cards",[],150],[52,"closure","Cancel spare policies","After the transfer.","todo","Month 3","Give notice",["Cancellation"],90],[53,"closure","Electoral roll","Elections Ontario.","todo","Month 6","Remove the name",[],180],[54,"closure","Property tax","Unpaid tax can lien.","todo","Month 6","Municipal certificate",[],180],[55,"final","Estate accounts","Receipts, debts, gifts.","todo","Month 10","Trustee accounting",["Estate accounts"],300],[56,"final","Releases","After clearance, before the last cheque.","todo","Month 11","Release",["Release"],330],[57,"final","Distribute","Compensation is claimable, not automatic.","todo","Month 11","Follow the will",[],330],[58,"final","Close the estate account","Final T3 return if needed.","todo","Month 12","Nil return",["Final T3 return"],365],[59,"final","Store records","CRA can look back years.","todo","Month 12","Six-year floor",[],365],[60,"final","Discharge letter","Pass accounts only if disputed.","todo","Month 12","Tell the beneficiaries",["Closure letter"],365]];
export const TASKS = RAW.map((t) => ({ id: t[0], phase: t[1], title: t[2], desc: t[3], status: t[4], due: t[5], note: t[6], forms: t[7], day: t[8] }));

export const VAULT_DOCS = [["will","Original will"],["deathcert","Death certificates (ServiceOntario)"],["coa","Estate certificate (Certificate of Appointment or Small Estate Certificate), if needed"],["insurance","Life insurance policies"],["bank","Bank and investment statements"],["property","Deed, mortgage and property tax bills"],["id","ID and SIN of the person who died"],["tax","Recent tax returns and notices of assessment"]];

// ---------- dates ----------
const YMD = /^(\d{4})-(\d{2})-(\d{2})$/;
export function isYMD(s) {
  const m = YMD.exec(String(s || ""));
  if (!m) return false;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3];
}
const toDate = (s) => { const m = YMD.exec(s); return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])); };
const fmt = (d) => d.toISOString().slice(0, 10);
export function addDays(s, n) { const d = toDate(s); d.setUTCDate(d.getUTCDate() + n); return fmt(d); }
// Same calendar day n months later; if that day does not exist (e.g. Aug 31 + 6 months), use the last day of that month.
export function addMonths(s, n) {
  const m = YMD.exec(s); const y = +m[1], mo = +m[2] - 1 + n, day = +m[3];
  const last = new Date(Date.UTC(y, mo + 1, 0)).getUTCDate();
  return fmt(new Date(Date.UTC(y, mo, Math.min(day, last))));
}
export function daysBetween(from, to) { return Math.round((toDate(to) - toDate(from)) / 86400000); }
export function weekday(s) { return toDate(s).getUTCDay(); } // 0 Sunday … 6 Saturday
// Weekend roll only. Public holidays also move the date to the next business day; we tell the user instead of guessing.
export function nextBusinessDay(s) { const w = weekday(s); return w === 6 ? addDays(s, 2) : w === 0 ? addDays(s, 1) : s; }
export function todayYMD(now = new Date()) {
  // Local calendar date of the user (browser) or server.
  const y = now.getFullYear(), m = String(now.getMonth() + 1).padStart(2, "0"), d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
export function longDate(s) {
  if (!isYMD(s)) return "";
  return toDate(s).toLocaleDateString("en-CA", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" });
}

// ---------- Estate Administration Tax (EAT Act s. 2(2)(b) and 2(6.1)) ----------
// Application on or after Jan 1, 2020: exempt if the value does not exceed $50,000; otherwise
// $15 for each $1,000 or part thereof by which the value exceeds $50,000 (so the excess is rounded UP to the next $1,000).
export const EAT_EXEMPT = 50000, EAT_PER_THOUSAND = 15, SMALL_ESTATE_MAX = 150000;
export function eat(value) {
  const v = Number(value);
  if (!Number.isFinite(v) || v <= EAT_EXEMPT) return 0;
  return Math.ceil((v - EAT_EXEMPT) / 1000) * EAT_PER_THOUSAND;
}
export function eatExplain(value) {
  const v = Math.max(0, Number(value) || 0);
  if (v <= EAT_EXEMPT) return `$0. Estates valued at $50,000 or less pay no Estate Administration Tax.`;
  const parts = Math.ceil((v - EAT_EXEMPT) / 1000);
  return `${parts} × $15 = $${(parts * 15).toLocaleString("en-CA")}. The amount above $50,000 is $${(v - EAT_EXEMPT).toLocaleString("en-CA")}, counted in $1,000 parts and rounded up (${parts} part${parts === 1 ? "" : "s"}).`;
}

// ---------- deadlines ----------
// desk: { dod, certDate, t3YearEnd, creditorLast, selfEmployed }
export function deadlinesFor(desk = {}) {
  const dod = isYMD(desk.dod) ? desk.dod : "";
  if (!dod) return { needDod: true, items: [] };
  const y = +dod.slice(0, 4);
  const items = [];
  const novDec = dod >= `${y}-11-01`;
  const t1 = novDec ? addMonths(dod, 6) : `${y + 1}-04-30`;
  items.push({ id: "t1", name: "Final T1 return: file and pay", due: t1, src: SRC.craDates,
    note: novDec ? "Death between Nov 1 and Dec 31: due 6 months after the date of death (same calendar day). Any balance owing is due the same day." : "Death between Jan 1 and Oct 31: due April 30 of the year after death. Any balance owing is due the same day." });
  if (desk.selfEmployed) {
    const late = dod <= `${y}-12-15` ? `${y + 1}-06-15` : addMonths(dod, 6);
    items.push({ id: "t1se", name: "Final T1 filing date (self-employed)", due: late, src: SRC.craDates,
      note: `Because the person who died (or their spouse or partner living with them) operated a business, the filing date is later. The balance owing is still due ${longDate(t1)}.` });
  }
  const priorDue = desk.selfEmployed ? `${y}-06-15` : `${y}-04-30`;
  if (dod <= priorDue) {
    items.push({ id: "t1prior", name: `${y - 1} T1 return (only if it was not filed before death)`, due: addMonths(dod, 6), src: SRC.craDates, conditional: true,
      note: `Death on or before the ${y - 1} filing due date: if that return was not filed, it is due 6 months after death.` });
  }
  items.push({ id: "rights", name: "Optional return for rights or things", due: addMonths(dod, 12), src: SRC.craDates, optional: true,
    note: "Only if you choose to file one. Due by the later of 1 year after death and 90 days after the final return's notice of assessment." });
  if (isYMD(desk.t3YearEnd) && desk.t3YearEnd >= dod && desk.t3YearEnd <= addMonths(dod, 12)) {
    items.push({ id: "t3", name: "T3 return for the estate's first tax year", due: addDays(desk.t3YearEnd, 90), src: SRC.craT3,
      note: `90 days after the first tax year-end you chose (${longDate(desk.t3YearEnd)}). Only if a T3 return is required.` });
  } else {
    const ex = addMonths(dod, 12);
    items.push({ id: "t3", name: "T3 return for the estate's first tax year (if one is required)", due: addDays(ex, 90), src: SRC.craT3, estimate: true, needs: "t3YearEnd",
      note: `Due 90 days after the estate's first tax year-end, which you choose (any date up to 1 year after death). Shown for a year-end of ${longDate(ex)}. Enter your year-end for an exact date.` });
  }
  const gre = addMonths(dod, 36);
  items.push({ id: "gre", name: "Graduated rate estate status ends (36 months)", due: addDays(gre, 90), src: SRC.craT3, optional: true,
    note: `If the estate still exists on ${longDate(gre)}, it stops being a graduated rate estate; that T3 return is due 90 days later.` });
  if (isYMD(desk.certDate)) {
    const raw = addDays(desk.certDate, 180), eff = nextBusinessDay(raw);
    items.push({ id: "eir", name: "Estate Information Return (Ontario Ministry of Finance)", due: eff, src: SRC.eirReg,
      note: `180 calendar days after the certificate was issued on ${longDate(desk.certDate)}${eff !== raw ? ` (${longDate(raw)} is a weekend, so it moves to the next business day)` : ""}. Also moves if it lands on a holiday. Required even if no tax is owing.` });
  } else {
    items.push({ id: "eir", name: "Estate Information Return", due: null, needs: "certDate", src: SRC.eirReg,
      note: "The 180-day clock starts when the court issues the estate certificate. Enter the date it was issued. Not needed if no certificate is issued." });
  }
  if (isYMD(desk.creditorLast)) {
    items.push({ id: "creditors", name: "Creditor notice period ends (common practice)", due: addDays(desk.creditorLast, 30), src: SRC.trusteeAct, practice: true,
      note: `30 days after the last notice (${longDate(desk.creditorLast)}). The Trustee Act sets no fixed period; waiting at least 30 days after the last of 3 weekly notices is common practice. Ask a lawyer before you distribute.` });
  } else {
    items.push({ id: "creditors", name: "Notice to creditors", due: null, needs: "creditorLast", src: SRC.trusteeAct, practice: true,
      note: "Optional, but it protects you under Trustee Act s. 53. Common practice is a notice once a week for 3 weeks, then waiting at least 30 days. Enter the date of the last notice." });
  }
  items.push({ id: "cpp", name: "CPP death benefit application (ISP1200)", due: addDays(dod, 60), src: SRC.cpp,
    note: "The estate should apply within 60 days of death. After that, other eligible people can apply." });
  return { needDod: false, items };
}
// The next n dated deadlines on or after today, earliest first. Prompts (needs) are returned separately.
export function nextDeadlines(desk, today, n = 3) {
  const { needDod, items } = deadlinesFor(desk);
  if (needDod) return { needDod: true, upcoming: [], prompts: [], past: [] };
  const dated = items.filter((i) => i.due && !i.optional && !i.conditional).sort((a, b) => a.due.localeCompare(b.due));
  return {
    needDod: false,
    upcoming: dated.filter((i) => i.due >= today).slice(0, n).map((i) => ({ ...i, days: daysBetween(today, i.due) })),
    past: dated.filter((i) => i.due < today).map((i) => ({ ...i, days: daysBetween(today, i.due) })),
    prompts: items.filter((i) => i.needs),
  };
}

// ---------- "Do I need probate?" ----------
// a: { will: "yes"|"no"|"unsure", original: "yes"|"no", executor: "yes"|"no", realEstate: "yes"|"no",
//      passes: "all"|"some"|"none", demand: "yes"|"no"|"unsure", value: number, flags: [...] }
export const LAWYER_FLAGS = [
  ["dispute", "Someone may challenge the will, or there is a dispute about who should act"],
  ["minors", "A beneficiary is under 18 or cannot manage their own affairs"],
  ["missingOriginal", "Only a copy of the will can be found, or the will is handwritten or altered"],
  ["outside", "The person lived outside Ontario, or owned property outside Ontario"],
  ["business", "They owned a business, a farm, or shares in a private company"],
  ["insolvent", "The debts may be more than the assets"],
  ["spouse", "A married spouse may choose an equalization payment, or someone may claim support"],
];
export function probateCheck(a = {}) {
  const value = Math.max(0, Number(a.value) || 0);
  const flags = new Set(a.flags || []);
  if (a.will === "yes" && a.original === "no") flags.add("missingOriginal");
  const reasons = [];
  let score = 0; // 2 = needed, 1 = check, 0 = may not be needed
  if (a.realEstate === "yes") { score = 2; reasons.push("Real estate in Ontario in the person’s sole name (or as a tenant in common) does not pass by survivorship. Ontario says an estate normally must be probated when the deceased owned real property, and a certificate should be in place before anyone signs an agreement to sell."); }
  if (a.demand === "yes") { score = 2; reasons.push("A bank or other institution is asking for a certificate. It decides what it needs before it will release the assets."); }
  if (a.will === "no") { score = Math.max(score, 2); reasons.push("There is no will, so no one has been named to act. Ontario lists this as a reason to apply; institutions usually ask for a certificate. Without a will, a bond is normally required too."); }
  if (a.will === "yes" && a.executor === "no") { score = Math.max(score, 2); reasons.push("The will does not name an estate trustee who can act."); }
  if (flags.has("dispute") || flags.has("minors")) { score = Math.max(score, 2); reasons.push("A dispute, or a beneficiary who cannot give legal consent, is a reason Ontario gives for applying."); }
  if (score < 2) {
    if (a.passes === "all" && value === 0) reasons.push("Everything you listed passes outside the estate (joint ownership with survivorship, or a named beneficiary). Those assets are not part of the estate’s value.");
    else if (a.passes === "all") { score = Math.max(score, 1); reasons.push("You said everything passes by joint ownership or a named beneficiary, but you entered an estate value. Check which assets are left in the person’s own name."); }
    else { score = Math.max(score, 1); reasons.push("Some assets are in the person’s own name. Ask each institution holding them whether it will release them without a certificate. Many have their own limits."); }
    if (a.demand === "unsure") reasons.push("You have not yet asked the institutions. Their answer usually decides it.");
    if (a.will === "unsure") { score = Math.max(score, 1); reasons.push("Find out whether there is a will first. It changes who can apply and which forms you need."); }
  }
  const verdict = score === 2 ? "likely" : score === 1 ? "check" : "maybe-not";
  const small = value > 0 && value <= SMALL_ESTATE_MAX;
  const withWill = a.will === "yes";
  const willDocs = withWill ? [
    { form: "Original will", title: "Plus any codicils (additions or changes)", url: SRC.probate.url },
    { form: "Form 74D", title: "Affidavit of Execution of Will or Codicil (from a witness). Use Form 74E if the will was altered or marked, or Form 74F for a handwritten (holograph) will", url: SRC.forms.url },
  ] : [];
  const common = [{ form: "Proof of death", title: "Death certificate or court order", url: FORM_LINKS["Death certificate order"] }];
  const regular = [
    { form: "Form 74A", title: "Application for a Certificate of Appointment of Estate Trustee (sworn before a commissioner)", url: SRC.forms.url },
    { form: "Form 74B or 74B.1", title: "Affidavit of Service (or Lawyer’s Certificate of Service) showing you served the application on the beneficiaries before filing", url: SRC.forms.url },
    ...willDocs,
    { form: "Form 74C", title: "Draft Certificate of Appointment of Estate Trustee", url: SRC.forms.url },
    { form: "Form 74G", title: withWill ? "Renunciation (Part A) if a named estate trustee is stepping aside; Consent (Part B) if you are not named in the will" : "Consent to the applicant’s appointment (Part B), and renunciations of anyone with an earlier right to apply", url: SRC.forms.url, when: "if needed" },
    ...(!withWill ? [{ form: "Bond (Form 74L or 74M)", title: "Administration bond, or a motion asking the court to dispense with it. Required when there is no will, when you are not named in the will, or when you live outside Canada and the Commonwealth", url: SRC.probate.url }] : [{ form: "Bond (Form 74L or 74M)", title: "Only if you are not named in the will, or you live outside Canada and the Commonwealth", url: SRC.probate.url, when: "if needed" }]),
    ...common,
    { form: "Estate Administration Tax deposit", title: "Paid when you file (certified cheque or bank draft to the “Minister of Finance”, or as the court office accepts)", url: SRC.eatPage.url },
  ];
  const smallDocs = [
    { form: "Form 74.1A", title: "Application for a Small Estate Certificate (estate valued at $150,000 or less), listing every asset and its value (sworn before a commissioner)", url: SRC.forms.url },
    { form: "Form 74.1B", title: "Request to File, confirming you sent the application to the beneficiaries at least 30 days before filing", url: SRC.forms.url },
    ...willDocs,
    { form: "Form 74.1C", title: "Draft Small Estate Certificate, describing each asset the same way as in Form 74.1A", url: SRC.forms.url },
    { form: "Form 74G", title: "Renunciation or consent, where Rule 74.1 requires one", url: SRC.forms.url, when: "if needed" },
    { form: "Bond", title: "Only in the cases Ontario lists (for example, you live outside Canada and the Commonwealth, or there are minor or incapable beneficiaries and no will names you)", url: SRC.smallEstate.url, when: "if needed" },
    ...common,
    { form: "Estate Administration Tax deposit", title: "Paid when you file, if the value is over $50,000", url: SRC.eatPage.url },
  ];
  const tax = eat(value);
  const lawyer = LAWYER_FLAGS.filter(([k]) => flags.has(k)).map(([, t]) => t);
  return {
    verdict, value, small, reasons,
    headline: verdict === "likely" ? "You will probably need an estate certificate (probate)." : verdict === "check" ? "You may need probate. Ask the institutions first." : "Probate may not be needed.",
    paths: verdict === "maybe-not" ? [] : small ? [
      { id: "small", name: "Small Estate Certificate (Rule 74.1): estates valued at $150,000 or less", docs: smallDocs, note: "Optional, simpler stream. The certificate only covers the assets listed in it. If you later find more and the total stays at $150,000 or less, apply to amend it (Form 74.1E); if it goes over, apply for a regular certificate." },
      { id: "regular", name: "Regular Certificate of Appointment (Rule 74): any value", docs: regular, note: "Also open to small estates." },
    ] : [{ id: "regular", name: "Certificate of Appointment of Estate Trustee (Rule 74)", docs: regular, note: value > SMALL_ESTATE_MAX ? "The estate is valued over $150,000, so the small-estate stream is not available." : "Enter the estate value to see whether the small-estate stream is open." }],
    eat: tax,
    eatText: eatExplain(value),
    eirNote: "If a certificate is issued, file an Estate Information Return with the Ministry of Finance within 180 calendar days after it is issued, even if no tax is owing (O. Reg. 310/14, s. 3). If day 180 falls on a weekend or holiday, it moves to the next business day.",
    lawyer,
  };
}

// ---------- letters ----------
// Text uses [[Label]] for anything we do not know yet; documents render those as highlighted blanks.
export const LETTER_TYPES = [
  ["bank", "Bank or credit union"], ["utility", "Utility"], ["landlord", "Landlord"], ["insurance", "Life insurer"],
  ["employer", "Employer or pension plan"], ["creditor", "Notice to creditors (for publication)"], ["tx19", "TX19 clearance cover letter"],
];
const blank = (label) => `[[${label}]]`;
export function letterData(desk = {}, estateName = "") {
  const L = desk.letter || {};
  const v = (x) => String(x || "").trim();
  return {
    deceased: v(L.name), dod: isYMD(desk.dod) ? longDate(desk.dod) : "", trustee: v(L.trustee),
    trusteeAddress: v(L.trusteeAddress), trusteeContact: v(L.trusteeContact), deceasedAddress: v(L.address),
    institution: v(L.institution), account: v(L.account), note: v(L.note),
    estate: v(L.estate) || (v(L.name) ? "Estate of " + v(L.name) : v(estateName)),
    certDate: isYMD(desk.certDate) ? longDate(desk.certDate) : "",
  };
}
export function buildLetter(type, desk = {}, estateName = "", today = todayYMD()) {
  const d = letterData(desk, estateName);
  const f = (val, label) => val || blank(label);
  const name = f(d.deceased, "Full name of the person who died");
  const dod = f(d.dod, "Date of death");
  const me = f(d.trustee, "Your full name");
  const sign = [me, "Estate trustee (executor)" + (d.estate ? ", " + d.estate : ""), f(d.trusteeAddress, "Your mailing address"), f(d.trusteeContact, "Your phone or email")];
  const head = [longDate(today), "", f(d.institution, TYPE_RECIPIENT[type] || "Recipient name and address")];
  const re = `Re: ${d.estate || "Estate of " + name}${d.account && type !== "creditor" && type !== "tx19" ? `, account ${d.account}` : ""}`;
  const authority = d.certDate ? `The court issued my estate certificate on ${d.certDate}; a copy is enclosed.` : "I enclose a copy of the will and the death certificate. If you need an estate certificate from the court before you act, please tell me in writing.";
  const L = {
    bank: { title: "Letter to a bank", body: [
      `I am the estate trustee (executor) of ${name}, who died on ${dod}. ${authority}`,
      `Please freeze ${d.account ? "account " + d.account : "all accounts in the name of " + name} (${d.account ? "and any other accounts in that name" : blank("Account numbers, if known")}), stop any automatic payments, and send me a statement showing the balance on the date of death.`,
      "Please also tell me whether the person who died held a safety deposit box, registered plans (RRSP, RRIF or TFSA) with named beneficiaries, loans, lines of credit or credit cards with you, and what you need from me to release the funds to the estate account.",
      d.note || "" ] },
    utility: { title: "Letter to a utility", body: [
      `I am the estate trustee (executor) of ${name}, who died on ${dod}. I enclose a copy of the death certificate.`,
      `Please ${blank("close / transfer")} the account for ${f(d.deceasedAddress, "Service address")}${d.account ? ` (account ${d.account})` : ""} as of ${blank("Date")}, take a final reading, and send the final bill to me at the address below.`,
      d.note || "" ] },
    landlord: { title: "Letter to a landlord", body: [
      `I am the estate trustee (executor) of ${name}, your tenant at ${f(d.deceasedAddress, "Rental address")}, who died on ${dod}.`,
      "I am writing to give notice about the tenancy and to arrange access to remove belongings. The Residential Tenancies Act has special rules when a sole tenant dies; please contact me to agree on a move-out date in writing.",
      `Please send any rent statement and confirm how the last month's rent deposit will be applied. ${d.note || ""}` ] },
    insurance: { title: "Letter to a life insurer", body: [
      `I am the estate trustee (executor) of ${name}, who died on ${dod}. I enclose a copy of the death certificate.`,
      `Please send claim forms for policy ${d.account || blank("Policy number")}, and tell me who the named beneficiary is or whether the proceeds are payable to the estate.`,
      d.note || "" ] },
    employer: { title: "Letter to an employer or pension plan", body: [
      `I am the estate trustee (executor) of ${name}, who died on ${dod}. I enclose a copy of the death certificate.`,
      `Please tell me about any final pay, vacation pay, group life insurance, and pension or survivor benefits${d.account ? ` (employee or member number ${d.account})` : ""}, and send the Record of Employment and any T4 or T4A slips to me at the address below.`,
      d.note || "" ] },
    creditor: { title: "Notice to creditors and others", body: [
      `All claims against the estate of ${name}, late of ${f(d.deceasedAddress, "City or town, Ontario")}, who died on ${dod}, must be filed with the undersigned estate trustee on or before ${blank("Claims deadline date")}, after which date the estate's assets will be distributed, having regard only to the claims of which the estate trustee then has notice.`,
      `Dated at ${blank("City")}, Ontario, on ${blank("Date of publication")}.`,
      `${me}, Estate trustee, ${f(d.trusteeAddress, "Address for claims")}` ], noSign: true,
      footer: "Common practice is to publish this once a week for 3 weeks (in a local newspaper or an online notice service) and to set the claims deadline at least 30 days after the last notice. The Trustee Act, s. 53, does not set a fixed period." },
    tx19: { title: "TX19 clearance certificate cover letter", body: [
      `I am the estate trustee (executor) of ${name}, who died on ${dod}, and I enclose Form TX19, Asking for a Clearance Certificate, under section 159 of the Income Tax Act.`,
      `Social insurance number of the person who died: ${blank("SIN")}. ${d.certDate ? `Estate certificate issued ${d.certDate} (copy enclosed).` : "Copy of the will (and estate certificate, if one was issued) enclosed."}`,
      "Also enclosed or already filed: the final T1 return, any T3 returns, the notices of assessment, and a statement of the estate's assets and the proposed distribution.",
      "Send TX19 to the address on the CRA's TX19 page; check it before you mail." ] },
  }[type] || null;
  if (!L) return null;
  const paras = [...head, "", re, "", ...L.body.filter(Boolean).flatMap((p) => [p, ""]), ...(L.noSign ? [] : ["Yours truly,", "", "", ...sign])];
  return {
    type, title: L.title, filename: `${(d.estate || "estate").replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 50) || "estate"}-${type}-letter`,
    lines: paras, footer: (L.footer ? L.footer + " " : "") + "Working draft prepared with FinalChapter. Review and edit before you send. FinalChapter does not send letters and is not legal or tax advice.",
  };
}
const TYPE_RECIPIENT = { bank: "Bank name and branch address", utility: "Utility name and address", landlord: "Landlord name and address", insurance: "Insurer name and address", employer: "Employer or plan administrator and address", creditor: "Newspaper or notice service", tx19: "CRA clearance certificate office (address from the TX19 page)" };
// Splits a line into text and blank segments for renderers.
export function segments(line) {
  const out = []; const re = /\[\[([^\]]{1,80})\]\]/g; let i = 0, m;
  while ((m = re.exec(line))) { if (m.index > i) out.push({ t: line.slice(i, m.index) }); out.push({ t: m[1], blank: true }); i = re.lastIndex; }
  if (i < line.length) out.push({ t: line.slice(i) });
  return out;
}
export const plainText = (letter) => [...letter.lines.map((l) => segments(l).map((s) => (s.blank ? `[${s.t.toUpperCase()}]` : s.t)).join("")), "", letter.footer].join("\n");

// ---------- print kit ----------
export const PRINT_KIT = { id: "printkit", name: "FinalChapter Print kit", amount: 2900 };
