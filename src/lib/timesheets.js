// Timesheet logic shared by the employee portal and the HR workspace: time-slot building,
// HR review (approve / return for correction), CSV import/export, projects and leave lookups.
// Pure helpers are kept free of React so they can be unit-tested.
import { frappe } from "./api/frappeClient";

const pad = (n) => String(n).padStart(2, "0");
const strip = (html = "") => String(html).replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
const chunks = (arr, n) => Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, i * n + n));

/* ------------------------------ time slots ------------------------------ */

export const DAY_MINUTES = 24 * 60;
const WORKDAY_START = 9 * 60;

/** Hours rounded to 2 decimals (ERPNext stores hours as Float, the UI works in quarter hours). */
export const roundHours = (h) => Math.round((Number(h) || 0) * 100) / 100;

/** Minutes past midnight of a "YYYY-MM-DD HH:MM:SS" datetime. */
export const minutesOf = (dt) => {
  const m = /[ T](\d{2}):(\d{2})(?::(\d{2}))?/.exec(String(dt || ""));
  return m ? Number(m[1]) * 60 + Number(m[2]) + Number(m[3] || 0) / 60 : 0;
};

/**
 * Start times for a day's entries, back to back, in whole minutes.
 * Each slot is ceil(hours * 60) minutes long, so an entry never ends after the next one
 * starts (ERPNext rejects even a 1-second overlap) and no "09:60" times are produced.
 * busyUntil = minute the employee's other timesheets on this day end, so we start after them.
 * Returns { times: ["YYYY-MM-DD HH:MM:00", ...] } or { error }.
 */
export function slotDay(date, hours, busyUntil = 0) {
  const lengths = hours.map((h) => Math.ceil(roundHours(h) * 60 - 1e-9));
  const need = lengths.reduce((s, n) => s + n, 0);
  const busy = Math.ceil(busyUntil - 1e-9);
  let start = Math.max(WORKDAY_START, busy);
  if (start + need > DAY_MINUTES) start = busy;
  if (start + need > DAY_MINUTES) {
    const room = (DAY_MINUTES - busy) / 60;
    return { error: busy ? `only ${room.toFixed(2)} h of the day is free after your other timesheets` : "more than 24 hours" };
  }
  const times = [];
  for (const len of lengths) {
    times.push(`${date} ${pad(Math.floor(start / 60))}:${pad(start % 60)}:00`);
    start += len;
  }
  return { times };
}

/** "Project: …\nTask: …\nNotes: …" - the readable copy of what the employee typed. */
export function composeDescription({ project, task, notes }) {
  return [project && `Project: ${project}`, task && `Task: ${task}`, notes && `Notes: ${notes}`].filter(Boolean).join("\n") || undefined;
}

/* ------------------------------ activity type ------------------------------ */

/**
 * ERPNext's Timesheet code (validate_mandatory_fields) refuses to submit a row without an
 * Activity Type whenever the timesheet has an employee - this is server code, not a field
 * setting, so it can't be switched off in Customize Form. Employees never pick one here:
 * every entry gets this default. Change it to any Activity Type that exists on your site;
 * if it doesn't exist, the first enabled Activity Type is used instead.
 */
export const DEFAULT_ACTIVITY_TYPE = "Execution";

let activityPromise = null;
const validationError = (msg) => Object.assign(new Error(msg), { response: { data: { exception: `ValidationError: ${msg}` } } });

/** The Activity Type to stamp on entries (cached per page load). */
export function getDefaultActivityType() {
  if (!activityPromise) {
    activityPromise = (async () => {
      let rows;
      try {
        rows = await frappe.getList("Activity Type", { filters: [["disabled", "=", 0]], fields: ["name"], limit: 0 });
      } catch (e) {
        if (e?.response?.data?.exc_type === "PermissionError") throw validationError("Your account can't read Activity Types. Ask your administrator to re-apply the Employee preset in Admin → Roles.");
        rows = await frappe.getList("Activity Type", { fields: ["name"], limit: 0 });
      }
      const pick = rows.find((r) => r.name === DEFAULT_ACTIVITY_TYPE) || rows[0];
      if (!pick) throw validationError(`No Activity Type exists in ERPNext. Ask your administrator to create one named "${DEFAULT_ACTIVITY_TYPE}".`);
      return pick.name;
    })().catch((e) => { activityPromise = null; throw e; });
  }
  return activityPromise;
}

/** Fill the default Activity Type on rows that have none. */
export async function withActivityType(logs) {
  if (logs.every((l) => l.activity_type)) return logs;
  const activity = await getDefaultActivityType();
  return logs.map((l) => (l.activity_type ? l : { ...l, activity_type: activity }));
}

/**
 * Submit a draft timesheet. Drafts saved before entries carried an Activity Type are patched
 * first, so older drafts submit without the "Activity Type is mandatory" error.
 */
export async function submitTimesheet(name) {
  let doc = await frappe.getDoc("Timesheet", name);
  if ((doc.time_logs || []).some((l) => !l.activity_type)) {
    await frappe.updateDoc("Timesheet", name, { time_logs: await withActivityType(doc.time_logs) });
    doc = await frappe.getDoc("Timesheet", name);
  }
  return frappe.submitDoc(doc);
}

/* ------------------------------ projects & tasks ------------------------------ */

/** Active projects with their readable names. Falls back gracefully on older sites / limited access. */
export async function getProjects() {
  const tries = [
    { filters: [["is_active", "=", "Yes"]], fields: ["name", "project_name"] },
    { filters: [], fields: ["name", "project_name"] },
    { filters: [], fields: ["name"] },
  ];
  let last;
  for (const t of tries) {
    try {
      return await frappe.getList("Project", { ...t, limit: 0, orderBy: "modified desc" });
    } catch (e) {
      last = e;
      if (e?.response?.data?.exc_type === "PermissionError") break;
    }
  }
  throw last;
}

/** Resolve what the employee typed (project ID or project name) to a Project ID. */
export function projectResolver(projects = []) {
  const map = new Map();
  projects.forEach((p) => {
    map.set(p.name.toLowerCase(), p.name);
    if (p.project_name) map.set(p.project_name.toLowerCase(), p.name);
  });
  return (text) => map.get(String(text || "").trim().toLowerCase()) || null;
}

/** Link a typed task to one of the employee's assigned tasks when the subject matches and the project agrees. */
export function matchTask(tasks = [], text, projectId) {
  const t = String(text || "").trim().toLowerCase();
  if (!t) return null;
  const hit = tasks.find((x) => String(x.subject || "").trim().toLowerCase() === t && (!projectId || !x.project || x.project === projectId));
  return hit ? hit.name : null;
}

/* ------------------------------ leave ------------------------------ */

/** Open/approved leave overlapping the range -> { "YYYY-MM-DD": { status, leave_type, half } }. */
export async function getLeaveDays(emp, from, to) {
  const base = { filters: [["employee", "=", emp], ["from_date", "<=", to], ["to_date", ">=", from], ["docstatus", "<", 2], ["status", "in", ["Open", "Approved"]]], limit: 0 };
  let rows;
  try {
    rows = await frappe.getList("Leave Application", { ...base, fields: ["from_date", "to_date", "status", "leave_type", "half_day", "half_day_date"] });
  } catch {
    rows = await frappe.getList("Leave Application", { ...base, fields: ["from_date", "to_date", "status", "leave_type"] });
  }
  const map = {};
  rows.forEach((r) => {
    for (let d = r.from_date; d <= r.to_date; d = nextDay(d)) {
      if (d < from || d > to) continue;
      const half = Boolean(r.half_day) && (!r.half_day_date || r.half_day_date === d || r.from_date === r.to_date);
      // an approved full day wins over anything else on the same date
      if (!map[d] || (r.status === "Approved" && !half)) map[d] = { status: r.status, leave_type: r.leave_type, half };
    }
  });
  return map;
}

function nextDay(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  const n = new Date(y, m - 1, d + 1);
  return `${n.getFullYear()}-${pad(n.getMonth() + 1)}-${pad(n.getDate())}`;
}

/* ------------------------------ entries ------------------------------ */

const DETAIL_FIELDS = ["name", "parent", "idx", "from_time", "to_time", "hours", "project", "task", "description"];

/**
 * Time-log rows whose from_time falls in [from, to], grouped by timesheet name.
 * One query on the child table instead of one request per timesheet; falls back to
 * fetching the timesheets one by one if the site doesn't allow child-table lists.
 */
export async function getEntriesBetween(from, to, sheetNames) {
  const wanted = new Set(sheetNames);
  const byParent = new Map();
  const add = (r) => {
    if (!wanted.has(r.parent)) return;
    const day = String(r.from_time).slice(0, 10);
    if (day < from || day > to) return;
    if (!byParent.has(r.parent)) byParent.set(r.parent, []);
    byParent.get(r.parent).push(r);
  };
  if (!wanted.size) return byParent;
  try {
    const rows = await frappe.getList("Timesheet Detail", {
      parent: "Timesheet",
      filters: [["from_time", ">=", `${from} 00:00:00`], ["from_time", "<=", `${to} 23:59:59`]],
      fields: DETAIL_FIELDS,
      orderBy: "from_time asc",
      limit: 0,
    });
    rows.forEach(add);
  } catch {
    for (const part of chunks([...wanted], 8)) {
      const docs = await Promise.all(part.map((n) => frappe.getDoc("Timesheet", n)));
      docs.forEach((d) => (d.time_logs || []).forEach((l) => add({ ...l, parent: d.name })));
    }
  }
  byParent.forEach((list) => list.sort((a, b) => String(a.from_time).localeCompare(String(b.from_time))));
  return byParent;
}

/* ------------------------------ HR review ------------------------------ */

const APPROVED = "Timesheet approved";
const RETURNED = "Timesheet returned for correction";

/**
 * Latest HR review per timesheet, stored as Info comments on the Timesheet
 * (ERPNext has no built-in timesheet approval). -> Map(name -> { state, note, by, at })
 */
export async function getReviews(names) {
  const map = new Map();
  for (const part of chunks([...new Set(names)], 80)) {
    const rows = await frappe.getList("Comment", {
      filters: [["reference_doctype", "=", "Timesheet"], ["reference_name", "in", part], ["comment_type", "=", "Info"], ["content", "like", "%Timesheet %"]],
      fields: ["reference_name", "content", "owner", "creation"],
      orderBy: "creation asc",
      limit: 0,
    });
    rows.forEach((r) => {
      const text = strip(r.content);
      const state = text.startsWith(APPROVED) ? "approved" : text.startsWith(RETURNED) ? "returned" : null;
      if (!state) return;
      const note = text.replace(state === "approved" ? APPROVED : RETURNED, "").replace(/^[\s:.-]+/, "");
      map.set(r.reference_name, { state, note, by: r.owner, at: r.creation });
    });
  }
  return map;
}

/** getReviews that never throws - the review layer is optional if Comment access isn't granted. */
export async function getReviewsSafe(names) {
  try {
    return { reviews: await getReviews(names), reviewsError: null };
  } catch (e) {
    return { reviews: new Map(), reviewsError: e };
  }
}

/**
 * Review label for a timesheet row.
 *  draft:     "Draft" or "Returned" (HR sent it back - see note)
 *  submitted: "Pending Review" or "Approved"
 * erp = ERPNext's own status when it says more (Billed, Payslip, Completed …).
 */
export function reviewOf(sheet, reviews) {
  const r = reviews?.get(sheet.name);
  const plain = ["Draft", "Submitted", "Cancelled", undefined, null, ""];
  const erp = plain.includes(sheet.status) ? null : sheet.status;
  if (sheet.docstatus === 0) return { key: r?.state === "returned" ? "returned" : "draft", label: r?.state === "returned" ? "Returned" : "Draft", note: r?.state === "returned" ? r.note : "", erp, review: r };
  if (r?.state === "approved") return { key: "approved", label: "Approved", note: r.note, erp, review: r };
  return { key: "pending", label: "Pending Review", note: "", erp, review: r };
}

const addComment = (name, content) => frappe.createDoc("Comment", { comment_type: "Info", reference_doctype: "Timesheet", reference_name: name, content });

export const approveTimesheet = (name, note = "") => addComment(name, `${APPROVED}${note.trim() ? `: ${note.trim()}` : ""}`);

const META = ["name", "owner", "creation", "modified", "modified_by", "docstatus", "idx", "parent", "parentfield", "parenttype", "doctype", "_user_tags", "_comments", "_assign", "_liked_by", "_seen"];
const NOT_COPIED = ["status", "sales_invoice", "salary_slip", "per_billed", "total_billed_amount", "total_billed_hours", "amended_from"];
const without = (obj, keys) => Object.fromEntries(Object.entries(obj).filter(([k]) => !keys.includes(k)));

/**
 * Send a submitted timesheet back: cancel it and create an amended draft (TS-xxxx-1) the
 * employee can correct and resubmit. Returns the new draft's name.
 */
export async function returnTimesheet(name, reason) {
  const doc = await frappe.getDoc("Timesheet", name);
  await frappe.cancelDoc("Timesheet", name);
  const copy = {
    ...without(doc, [...META, ...NOT_COPIED]),
    amended_from: name,
    time_logs: (doc.time_logs || []).map((l) => without(l, [...META, "sales_invoice"])),
  };
  let created;
  try {
    created = await frappe.createDoc("Timesheet", copy);
  } catch (e) {
    e.partial = `Timesheet ${name} was cancelled, but the corrected copy couldn't be created. The employee can enter those days again from their Timesheet page.`;
    throw e;
  }
  const text = `${RETURNED}: ${reason.trim()}`;
  await Promise.allSettled([addComment(created.name, text), addComment(name, text)]);
  return created.name;
}

/* ------------------------------ CSV ------------------------------ */

/** One CSV cell. Quotes everything and neutralises spreadsheet formulas (=, +, -, @) typed by users. */
export function csvCell(v) {
  let s = String(v ?? "");
  if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}

/** RFC-4180-ish parser: quoted fields, escaped quotes, commas/newlines in quotes. Detects , ; or tab. */
export function parseCsv(text) {
  const src = String(text).replace(/^﻿/, "");
  const firstLine = src.split(/\r?\n/, 1)[0] || "";
  const count = (ch) => firstLine.split(ch).length - 1;
  const delim = [",", ";", "\t"].sort((a, b) => count(b) - count(a))[0];
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < src.length; i += 1) {
    const c = src[i];
    if (quoted) {
      if (c === '"' && src[i + 1] === '"') { cell += '"'; i += 1; }
      else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === delim) { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i += 1;
      row.push(cell); rows.push(row); row = []; cell = "";
    } else cell += c;
  }
  if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
  return rows.map((r) => r.map((x) => x.trim())).filter((r) => r.some(Boolean));
}

/**
 * Turn parsed CSV rows into timesheet entries.
 * With a header row, columns are matched by name (works with the HR export too):
 *   Date, Hours, Project, Task (or "Work"/"Description"), Notes.
 * Without one: date, hours, project, task.
 * Dates: YYYY-MM-DD, or D/M/YYYY vs M/D/YYYY detected from the file (day > 12 decides);
 * ambiguous files are read as D/M/YYYY and flagged.
 */
export function csvToEntries(rows) {
  if (!rows.length) return { entries: [], invalid: 0, order: "dmy", ambiguous: false };
  const head = rows[0].map((h) => h.toLowerCase().replace(/^'/, ""));
  const hasHeader = head.some((h) => h === "date") && head.some((h) => /^hours?$/.test(h));
  const col = (re, fallback) => {
    const i = hasHeader ? head.findIndex((h) => re.test(h)) : -1;
    return hasHeader ? i : fallback;
  };
  const ci = { date: col(/^date$/, 0), hours: col(/^hours?$/, 1), project: col(/^project/, 2), task: col(/^(task|work|description)/, 3), notes: col(/^notes?$/, -1) };
  const body = hasHeader ? rows.slice(1) : rows;

  let dayFirst = 0;
  let monthFirst = 0;
  body.forEach((r) => {
    const m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(r[ci.date] || "");
    if (!m) return;
    if (Number(m[1]) > 12) dayFirst += 1;
    if (Number(m[2]) > 12) monthFirst += 1;
  });
  const order = monthFirst > dayFirst ? "mdy" : "dmy";
  const ambiguous = !dayFirst && !monthFirst && body.some((r) => /^\d{1,2}[/.-]\d{1,2}[/.-]\d{4}$/.test(r[ci.date] || ""));

  const entries = [];
  let invalid = 0;
  body.forEach((r) => {
    const raw = (r[ci.date] || "").replace(/^'/, "");
    let date = null;
    const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(raw);
    const loc = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(raw);
    if (iso) date = `${iso[1]}-${pad(iso[2])}-${pad(iso[3])}`;
    else if (loc) date = order === "mdy" ? `${loc[3]}-${pad(loc[1])}-${pad(loc[2])}` : `${loc[3]}-${pad(loc[2])}-${pad(loc[1])}`;
    const hours = roundHours(String(r[ci.hours] || "").replace(",", "."));
    if (!date || Number.isNaN(Date.parse(date)) || !(hours > 0)) { invalid += 1; return; }
    const get = (i) => (i >= 0 ? (r[i] || "").replace(/^'(?=[=+\-@])/, "") : "");
    // headerless files: unquoted commas in the task text spill into extra columns - join them back
    const task = hasHeader ? get(ci.task) : r.slice(3).join(", ").replace(/^'(?=[=+\-@])/, "");
    entries.push({ date, hours, project: get(ci.project), task, notes: get(ci.notes) });
  });
  return { entries, invalid, order, ambiguous };
}

/** Trigger a browser download of CSV lines. */
export function saveCsv(lines, filename) {
  const url = URL.createObjectURL(new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" }));
  const a = Object.assign(document.createElement("a"), { href: url, download: filename });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}