// Everything the app needs on the ERPNext site, applied in one go: missing doctypes, custom fields, change history,
// field settings, server rules (System Setup), every role's permissions, and the login restrictions (employees limited
// to their own record, HR / Project Manager logins not, HR without rights over Users once logins go through the server).
//
// It runs by itself when an Administrator signs in (components/AutoSetup.jsx) - once. It runs again only when this
// version of the app brings new rules or permissions (the signature below changes), or a day after a run that had
// problems. Every step only adds or fixes what is missing, so running it again is safe.
import { frappe } from "./api/frappeClient";
import { errMsg } from "./employeePortal";
import { MODULES, runSetup } from "./siteSetup";
import { applyAllPresets, liftStaffRestrictions, PRESETS, restrictAllEmployees, tightenHr } from "./rolePresets";
import { serverLoginsReady } from "./securitySetup";

const KEY = "ethx-auto-setup";
const RETRY_AFTER_MS = 24 * 60 * 60 * 1000;

function hash(text) {
  let h = 5381;
  for (let i = 0; i < text.length; i += 1) h = ((h * 33) ^ text.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

/** Changes whenever the app's fields, rules, doctypes or role permissions change. */
export const SETUP_SIGNATURE = hash(JSON.stringify({
  modules: MODULES.map((m) => ({ id: m.id, fields: m.fields, scripts: m.scripts.map((s) => [s.name, s.script, Boolean(s.allow_guest)]), properties: m.properties || [], doctypes: (m.doctypes || []).map((d) => d.name), records: (m.records || []).map((r) => r.name), permissions: (m.permissions || []).map((p) => p.role) })),
  presets: PRESETS,
}));

/** The last run on this site from this browser: { signature, ok, at, problems } or null. */
export function lastAutoSetup() {
  try { return JSON.parse(localStorage.getItem(`${KEY}:${window.location.host}`) || "null"); } catch { return null; }
}

function remember(result) {
  try { localStorage.setItem(`${KEY}:${window.location.host}`, JSON.stringify(result)); } catch { /* runs again next time */ }
}

export function autoSetupDue() {
  const last = lastAutoSetup();
  if (!last || last.signature !== SETUP_SIGNATURE) return true;
  return !last.ok && Date.now() - last.at > RETRY_AFTER_MS;
}

/** Applies everything; onStep receives the log so far ([{ text, ok }]). Returns { ok, log }. */
export async function applyEverything(onStep = () => {}) {
  let log = [];
  const step = (text, ok = true) => { log = [...log, { text, ok }]; onStep(log); };
  const run = async (label, fn) => {
    try { return await fn(); } catch (e) { step(`${label}: ${errMsg(e, "refused - sign in as the Administrator.")}`, false); return null; }
  };

  await run("System setup", async () => {
    const before = log;
    const setupLog = await runSetup((l) => { log = [...before, ...l]; onStep(log); });
    log = [...before, ...setupLog];
  });
  const added = await run("Role permissions", applyAllPresets);
  if (added !== null) step(added ? `Role permissions: ${added} permission set(s) added` : "Role permissions: already complete");
  if (await serverLoginsReady(frappe)) {
    const removed = await run("HR access", tightenHr);
    if (removed !== null) step(removed ? `HR access: ${removed} right(s) over Users removed (logins go through the server)` : "HR access: already tightened");
  }
  const restricted = await run("Employee logins", restrictAllEmployees);
  if (restricted !== null) step(restricted ? `Employee logins: ${restricted} limited to their own record and company` : "Employee logins: all limited to their own record");
  const lifted = await run("Staff logins", liftStaffRestrictions);
  if (lifted !== null) step(lifted ? `HR / Project Manager logins: ${lifted} own-record limit(s) lifted` : "HR / Project Manager logins: no limits to lift");

  const problems = log.filter((l) => !l.ok).length;
  remember({ signature: SETUP_SIGNATURE, ok: problems === 0, at: Date.now(), problems });
  return { ok: problems === 0, log };
}
