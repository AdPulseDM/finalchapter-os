// /api/documents — downloadable documents for the signed-in PAID account, built on the server from the saved estate.
//   {action:"letter", estateId, type, format:"docx"|"pdf"}  any paid plan
//   {action:"printkit", estateId}                          paid plan + Print kit add-on
// Nothing is stored; the file is generated on request and returned as an attachment.
import { json, getSession, getUser, bearer, hasAddon } from "../lib/core.mjs";
import { usersStore, estatesStore } from "../lib/store.mjs";
import * as E from "../lib/estates.mjs";
import * as R from "../../public/fc-rules.js";
import { letterDocx, letterPdf, printKitPdf } from "../lib/docs.mjs";

const TYPES = {
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  pdf: "application/pdf",
};
function file(bytes, name, format) {
  return new Response(bytes, {
    status: 200,
    headers: {
      "content-type": TYPES[format],
      "content-disposition": `attachment; filename="${name.replace(/[^A-Za-z0-9._-]/g, "-")}.${format}"`,
      "cache-control": "no-store", "x-content-type-options": "nosniff",
    },
  });
}

export async function handle(req, { store, estates, today }) {
  if (req.method !== "POST") return json(405, { error: "Use POST" });
  const body = await req.json().catch(() => ({}));
  const sess = await getSession(store, bearer(req, body));
  if (!sess || sess.role !== "client") return json(401, { error: "Log in to download documents" });
  const user = await getUser(store, sess.email);
  if (!user || !user.paid) return json(402, { error: "Letter downloads are part of every paid plan. Buy a plan to download." });
  const e = await E.getEstate(estates, user, body.estateId);
  if (!e) return json(404, { error: "Estate not found" });
  const desk = E.sanitizeDesk(e.desk, user.plan);
  const day = today || R.todayYMD();

  if (body.action === "letter") {
    const format = body.format === "pdf" ? "pdf" : body.format === "docx" ? "docx" : "";
    if (!format) return json(400, { error: "format must be docx or pdf" });
    const letter = R.buildLetter(String(body.type || ""), desk, e.name, day);
    if (!letter) return json(400, { error: "Unknown letter type" });
    return file(format === "docx" ? letterDocx(letter) : await letterPdf(letter), letter.filename, format);
  }
  if (body.action === "printkit") {
    if (!hasAddon(user, "printkit")) return json(402, { error: "The Print kit is a $29 add-on. Buy it once to download your print-ready PDF." });
    const bytes = await printKitPdf({ estateName: e.name, desk, today: day });
    return file(bytes, `${e.name.replace(/[^A-Za-z0-9]+/g, "-").slice(0, 50)}-print-kit`, "pdf");
  }
  return json(400, { error: "Unknown action" });
}

export default async (req) => handle(req, { store: usersStore(), estates: estatesStore() });
