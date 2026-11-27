// Everything the Projects page shows about each project, worked out from standard ERPNext data:
//  - the team and their roles from assignments (lib/assignments), with hours allocated = hours/day × working days;
//  - hours worked from timesheet lines (Timesheet Detail) per person, falling back to Project.actual_time;
//  - tasks (everything on the project that isn't an assignment): done, open and overdue;
//  - the schedule (start → ETA, time used) and a health check that names each delay.
import { frappe } from "./api/frappeClient";
import { daysUntil, isoDate } from "./employeePortal";
import { workingDays } from "./assignments";

const ACTIVE = ["Open", "Working", "Pending Review", "Overdue"];
const DONE = ["Completed", "Cancelled", "Template"];
const LEAD = /lead|manager|head|architect|owner|coordinator/i;

const chunks = (arr, n) => Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, i * n + n));

/** Hours logged per project and per (project, user): { byProject: {p: h}, byMember: {"p|email": h}, ok } */
async function loggedHours(names, employees) {
  const out = { byProject: {}, byMember: {}, ok: false };
  if (!names.length) return out;
  try {
    const lines = [];
    for (const part of chunks(names, 40)) {
      lines.push(...(await frappe.getList("Timesheet Detail", { parent: "Timesheet", filters: [["project", "in", part], ["docstatus", "<", 2]], fields: ["parent", "project", "hours"], limit: 0 })));
    }
    const sheets = [...new Set(lines.map((l) => l.parent))];
    const owner = {};
    for (const part of chunks(sheets, 80)) {
      (await frappe.getList("Timesheet", { filters: [["name", "in", part]], fields: ["name", "employee"], limit: 0 })).forEach((t) => { owner[t.name] = t.employee; });
    }
    const userOf = Object.fromEntries(employees.map((e) => [e.name, e.user_id]));
    for (const l of lines) {
      const h = Number(l.hours) || 0;
      out.byProject[l.project] = (out.byProject[l.project] || 0) + h;
      const u = userOf[owner[l.parent]];
      if (u) out.byMember[`${l.project}|${u}`] = (out.byMember[`${l.project}|${u}`] || 0) + h;
    }
    out.ok = true;
  } catch { /* timesheets not readable - the project's own total is used */ }
  return out;
}

/** Tasks on the projects that aren't assignments. */
async function projectTasks(names, assignmentNames) {
  if (!names.length) return [];
  try {
    const rows = [];
    for (const part of chunks(names, 40)) {
      rows.push(...(await frappe.getList("Task", { filters: [["project", "in", part]], fields: ["name", "subject", "project", "status", "exp_end_date", "priority"], limit: 0 })));
    }
    return rows.filter((t) => !assignmentNames.has(t.name));
  } catch {
    return [];
  }
}

const round = (n) => Math.round(n * 10) / 10;

/**
 * projects: Project rows (with expected_*_date, percent_complete, actual_time, custom_project_manager, status).
 * assignments: parsed assignment rows with .employee. employees: Employee rows (name, employee_name, user_id, designation).
 * Returns { [project]: insight }.
 */
export async function loadProjectInsights(projects, assignments, employees) {
  const names = projects.map((p) => p.name);
  const [hours, tasks] = await Promise.all([loggedHours(names, employees), projectTasks(names, new Set(assignments.map((a) => a.name)))]);
  const today = isoDate();
  const byUser = Object.fromEntries(employees.filter((e) => e.user_id).map((e) => [e.user_id, e]));
  const out = {};
  for (const p of projects) {
    const ended = ["Completed", "Cancelled"].includes(p.status);
    const rows = assignments.filter((a) => a.project === p.name);
    const members = rows.map((a) => {
      const email = a.assignees[0];
      const allocated = (Number(a.hoursPerDay) || 0) * workingDays(a.start, a.end || a.eta);
      const worked = hours.byMember[`${p.name}|${email}`] || 0;
      const live = ACTIVE.includes(a.status);
      return {
        key: a.name, email, name: a.employee?.employee_name || byUser[email]?.employee_name || email || "—", designation: a.employee?.designation || byUser[email]?.designation || "",
        role: a.role, start: a.start, eta: a.eta, hoursPerDay: a.hoursPerDay, status: a.status, live,
        allocated: round(allocated), worked: round(worked), remaining: round(Math.max(0, allocated - worked)),
        pastEta: live && a.eta && a.eta < today,
        lead: LEAD.test(a.role || ""),
      };
    }).sort((a, b) => Number(b.live) - Number(a.live) || Number(b.lead) - Number(a.lead) || a.name.localeCompare(b.name));
    const current = members.filter((m) => m.live);
    const allocated = round(members.reduce((s, m) => s + m.allocated, 0));
    const worked = round(hours.ok ? hours.byProject[p.name] || 0 : Number(p.actual_time) || 0);
    const t = tasks.filter((x) => x.project === p.name);
    const tDone = t.filter((x) => x.status === "Completed").length;
    const tOpen = t.filter((x) => !DONE.includes(x.status));
    const tOverdue = tOpen.filter((x) => x.status === "Overdue" || (x.exp_end_date && x.exp_end_date < today));

    // Schedule: days from start to ETA, and how much of it has gone.
    const start = p.expected_start_date || p.actual_start_date || "";
    const end = p.expected_end_date || "";
    const total = start && end ? Math.max(1, daysUntil(end) - daysUntil(start)) : null;
    const used = start && total ? Math.min(total, Math.max(0, -daysUntil(start))) : null;
    const timePct = total ? Math.round((used / total) * 100) : null;
    const daysLeft = end ? daysUntil(end) : null;
    const progress = Math.round(Number(p.percent_complete) || 0);

    const delays = [];
    if (!ended) {
      if (daysLeft != null && daysLeft < 0) delays.push(`ETA passed ${-daysLeft} day(s) ago`);
      if (timePct != null && timePct - progress >= 25) delays.push(`Behind schedule: ${timePct}% of the time used, ${progress}% done`);
      if (tOverdue.length) delays.push(`${tOverdue.length} task(s) overdue`);
      const late = current.filter((m) => m.pastEta);
      if (late.length) delays.push(`${late.map((m) => m.name).join(", ")} still assigned past their ETA`);
      if (allocated && worked > allocated) delays.push(`${round(worked - allocated)} h over the allocated hours`);
      if (!current.length) delays.push("No one is assigned");
    }
    const health = ended ? p.status : daysLeft != null && daysLeft < 0 ? "Overdue" : delays.length >= 2 || tOverdue.length || (timePct != null && timePct - progress >= 25) ? "Delayed" : delays.length || (timePct != null && timePct - progress >= 10) ? "At Risk" : "On Track";

    out[p.name] = {
      members, current, past: members.filter((m) => !m.live), leads: current.filter((m) => m.lead),
      allocated, worked, remainingHours: round(Math.max(0, allocated - worked)), hoursKnown: hours.ok || Boolean(Number(p.actual_time)),
      tasks: { total: t.length, done: tDone, open: tOpen.length, overdue: tOverdue.length },
      schedule: { start, end, total, used, timePct, daysLeft },
      progress, delays, health,
    };
  }
  return out;
}
