// A project's lifecycle: its stage (Project.custom_stage, installed with Project roles) and everything that happened
// to it - stage and status changes, new dates, manager handovers, progress, notes and who joined or left the team.
// The history comes from ERPNext's own version log and comments (server rule ethx_project_timeline).
import { frappe } from "./api/frappeClient";
import { PROJECT_STAGES } from "./projectRoleSetup";
import { dmy } from "./employeePortal";

export { PROJECT_STAGES };

/** The main path a project moves along; On Hold and Cancelled sit beside it. */
export const STAGE_PATH = ["Planning", "In Progress", "Testing", "Delivered", "Closed"];
export const STAGE_TONE = {
  Planning: "#6366f1",
  "In Progress": "#2563eb",
  "On Hold": "var(--color-amber)",
  Testing: "#0891b2",
  Delivered: "var(--color-green)",
  Closed: "var(--color-text-muted)",
  Cancelled: "var(--color-red-hover)",
};
// Ending a project (Closed / Cancelled) goes through End Project, which also removes contractor logins.
export const ENDING_STAGES = ["Closed", "Cancelled"];

/** The stage of a project, worked out from ERPNext's status when it has none yet. */
export function stageOf(p) {
  if (p?.custom_stage) return p.custom_stage;
  if (p?.status === "Completed") return "Closed";
  if (p?.status === "Cancelled") return "Cancelled";
  return Number(p?.percent_complete) > 0 ? "In Progress" : "Planning";
}

/** ERPNext status that goes with a stage. */
export const statusForStage = (stage) => (stage === "Closed" ? "Completed" : stage === "Cancelled" ? "Cancelled" : "Open");

const stripTags = (html) => String(html || "").replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").trim();
const NOTE_MARK = "[Project Note]";

const addComment = (project, content) =>
  frappe.callMethod("frappe.desk.form.utils.add_comment", { reference_doctype: "Project", reference_name: project, content, comment_email: "", comment_by: "" });

/** Move a project to another stage, with an optional note that shows on its timeline. */
export async function setStage(project, from, to, note = "") {
  await frappe.updateDoc("Project", project, { custom_stage: to, status: statusForStage(to) });
  if (note.trim()) await addComment(project, `${NOTE_MARK} Stage ${from} → ${to}: ${note.trim()}`).catch(() => {});
}

/** A free note on the project's timeline. */
export const addProjectNote = (project, note) => addComment(project, `${NOTE_MARK} ${note.trim()}`);

/** New start / end dates, with the reason on the timeline. */
export async function setProjectDates(project, { start, end }, reason = "") {
  await frappe.updateDoc("Project", project, { expected_start_date: start || null, expected_end_date: end || null });
  if (reason.trim()) await addComment(project, `${NOTE_MARK} Dates changed: ${reason.trim()}`).catch(() => {});
}

const FIELD_LABEL = {
  custom_stage: "Stage",
  status: "Status",
  expected_start_date: "Start Date",
  expected_end_date: "ETA",
  custom_project_manager: "Project Manager",
  percent_complete: "Progress",
  project_name: "Name",
  priority: "Priority",
};

/**
 * Timeline events for a project, newest first:
 * { key, at, kind: created|stage|status|dates|manager|progress|note|joined|left|other, by, title, changes?, note? }.
 * `assignments` are parsed assignment rows (lib/assignments) for team joins and exits; `nameOf(email)` names people.
 */
export async function loadProjectTimeline(project, assignments = [], nameOf = (e) => e) {
  const r = await frappe.callMethod("ethx_project_timeline", { project });
  const names = r?.names || {};
  const who = (u) => names[u] || nameOf(u) || u;
  const events = [];
  events.push({ key: "created", at: r.created, kind: "created", by: who(r.created_by), title: "Project created" });

  const notes = (r.comments || []).map((c) => ({ ...c, text: stripTags(c.content) }));
  const used = new Set();
  const stamp = (x) => new Date(String(x).replace(" ", "T")).getTime();
  // A note written together with a change (same person, within two minutes) belongs to that change.
  const noteFor = (v, prefix) => {
    const i = notes.findIndex((c, j) => !used.has(j) && c.owner === v.owner && c.text.startsWith(`${NOTE_MARK} ${prefix}`) && Math.abs(stamp(c.creation) - stamp(v.creation)) < 120000);
    if (i < 0) return "";
    used.add(i);
    const text = notes[i].text.slice(NOTE_MARK.length + prefix.length + 1);
    return text.slice(text.indexOf(":") + 1).trim();
  };
  for (const v of r.versions || []) {
    let data = {};
    try { data = typeof v.data === "string" ? JSON.parse(v.data) : v.data || {}; } catch { continue; }
    const changed = (data.changed || []).filter(([f]) => FIELD_LABEL[f]);
    if (!changed.length) continue;
    const by = who(v.owner);
    const stage = changed.find(([f]) => f === "custom_stage");
    const rest = changed.filter(([f]) => f !== "custom_stage" && !(stage && f === "status"));
    if (stage) events.push({ key: `${v.creation}-stage`, at: v.creation, kind: "stage", by, title: `Moved to ${stage[2] || "—"}`, from: stage[1], to: stage[2], note: noteFor(v, "Stage") });
    const grouped = { dates: [], manager: [], progress: [], status: [], other: [] };
    for (const [f, a, b] of rest) {
      const kind = f.startsWith("expected_") ? "dates" : f === "custom_project_manager" ? "manager" : f === "percent_complete" ? "progress" : f === "status" ? "status" : "other";
      const show = (x) => (f === "custom_project_manager" ? (x ? who(x) : "") : f === "percent_complete" ? (x == null || x === "" ? "" : `${Math.round(Number(x))}%`) : f.startsWith("expected_") ? dmy(x) : x ?? "");
      grouped[kind].push({ label: FIELD_LABEL[f], from: show(a), to: show(b), field: f });
    }
    const TITLE = { dates: "Dates changed", manager: "Project manager changed", progress: "Progress updated", status: "Status changed", other: "Details changed" };
    for (const kind of Object.keys(grouped)) {
      if (grouped[kind].length) events.push({ key: `${v.creation}-${kind}`, at: v.creation, kind, by, title: TITLE[kind], changes: grouped[kind], note: kind === "dates" ? noteFor(v, "Dates changed") : "" });
    }
  }
  // Notes that weren't part of a stage change; handover comments from the manager rule are already in the versions.
  notes.forEach((c, i) => {
    if (used.has(i) || /^Project manager changed from/.test(c.text)) return;
    events.push({ key: `note-${c.creation}-${i}`, at: c.creation, kind: "note", by: who(c.owner), title: "Note", note: c.text.replace(/^\[Project Note\]\s*/, "") });
  });
  for (const a of assignments) {
    const person = a.employee?.employee_name || nameOf(a.assignees[0]) || a.assignees[0] || "Someone";
    if (a.start) events.push({ key: `${a.name}-in`, at: a.start, kind: "joined", title: `${person} joined as ${a.role}`, sub: `Until ${dmy(a.eta) || "—"} ·${a.hoursPerDay} h/day` });
    if (a.status === "Completed" || a.status === "Cancelled") events.push({ key: `${a.name}-out`, at: a.end || a.eta, kind: "left", title: `${person} ${a.status === "Cancelled" ? "was taken off" : "finished"} as ${a.role}` });
  }
  return events.sort((a, b) => String(b.at || "").localeCompare(String(a.at || "")));
}
