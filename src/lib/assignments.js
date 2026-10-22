// Project assignments: a Project Manager assigns an employee to a project with a role, a start date,
// an ETA (end date) and hours per day. Each assignment is an ERPNext Task assigned to the employee's
// user, so it shows up in ERPNext too. The role / hours per day live in the task description.
// The employee's monthly timesheet is pre-filled from these (see EmpTimesheet.jsx).
import { frappe } from "./api/frappeClient";
import { listTry } from "./employeePortal";

export const ASSIGNMENT_MARK = "[ETHX Assignment]";
export const ROLE_SUGGESTIONS = ["Developer", "Senior Developer", "Tech Lead", "Designer", "QA / Tester", "Business Analyst", "DevOps", "Support", "Project Coordinator"];

const pad = (n) => String(n).padStart(2, "0");
const nextDay = (iso) => {
  const [y, m, d] = iso.split("-").map(Number);
  const n = new Date(y, m - 1, d + 1);
  return `${n.getFullYear()}-${pad(n.getMonth() + 1)}-${pad(n.getDate())}`;
};

/** Monday-Friday days between two ISO dates, inclusive. */
export function workingDays(start, end) {
  let count = 0;
  for (let d = start; d && end && d <= end; d = nextDay(d)) {
    const [y, m, day] = d.split("-").map(Number);
    const wd = new Date(y, m - 1, day).getDay();
    if (wd !== 0 && wd !== 6) count += 1;
  }
  return count;
}

// The assignee is also written into the description: ERPNext clears Task._assign when a task is completed or
// cancelled, which used to make finished assignments lose their employee.
export function composeAssignment({ role, hoursPerDay, notes, email }) {
  return [ASSIGNMENT_MARK, `Role: ${role}`, `Hours per day: ${hoursPerDay}`, email && `Assignee: ${email}`, notes && `Notes: ${notes}`].filter(Boolean).join("\n");
}

const plain = (t = "") => String(t).replace(/<br\s*\/?>|<\/p>|<\/div>|<\/li>/gi, "\n").replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&");
const pick = (text, key) => new RegExp(`^\\s*${key}:\\s*(.*)$`, "mi").exec(text)?.[1]?.trim() || "";

/** Turn an assignment Task into { role, hoursPerDay, start, eta, end, assignees, ... }. */
export function parseAssignment(task) {
  const text = plain(task.description);
  const days = workingDays(task.exp_start_date, task.exp_end_date);
  const hoursPerDay = Number(pick(text, "Hours per day")) || (task.expected_time && days ? Math.round((task.expected_time / days) * 100) / 100 : 8);
  let assignees = [];
  try { assignees = JSON.parse(task._assign || "[]"); } catch { /* ignore */ }
  if (!assignees.length && pick(text, "Assignee")) assignees = [pick(text, "Assignee")];
  const finishedEarly = task.status === "Completed" && task.completed_on && task.completed_on < task.exp_end_date;
  return {
    name: task.name,
    subject: task.subject,
    project: task.project,
    status: task.status,
    role: pick(text, "Role") || task.subject,
    hoursPerDay,
    notes: pick(text, "Notes"),
    start: task.exp_start_date,
    eta: task.exp_end_date,
    end: finishedEarly ? task.completed_on : task.exp_end_date,
    assignees,
  };
}

const FIELDS = ["name", "subject", "project", "status", "exp_start_date", "exp_end_date", "expected_time", "description", "completed_on", "_assign", "modified"];
const BASIC = FIELDS.filter((f) => f !== "completed_on");

/** Every assignment this user may see (a Project Manager sees their company's). */
export function listAssignments() {
  return listTry("Task", { filters: [["description", "like", `%${ASSIGNMENT_MARK}%`]], fields: FIELDS, orderBy: "exp_end_date asc" }, BASIC);
}

/** The signed-in employee's own assignments that overlap [from, to]. */
export async function getMyAssignments(email, from, to) {
  if (!email) return [];
  const common = [["description", "like", `%${ASSIGNMENT_MARK}%`], ["status", "!=", "Cancelled"], ["exp_start_date", "<=", to], ["exp_end_date", ">=", from]];
  const [open, done] = await Promise.all([
    listTry("Task", { filters: [["_assign", "like", `%"${email}"%`], ...common], fields: FIELDS, orderBy: "exp_start_date asc" }, BASIC),
    // completed tasks no longer carry _assign; find them by the assignee line in the description
    listTry("Task", { filters: [["description", "like", `%Assignee: ${email}%`], ["status", "=", "Completed"], ...common], fields: FIELDS, orderBy: "exp_start_date asc" }, BASIC).catch(() => []),
  ]);
  const seen = new Set(open.map((t) => t.name));
  return [...open, ...done.filter((t) => !seen.has(t.name))];
}

const expected = (hoursPerDay, start, end) => Math.round(Number(hoursPerDay) * workingDays(start, end) * 100) / 100;

export async function createAssignment({ project, projectLabel, email, role, start, eta, hoursPerDay, notes }) {
  const task = await frappe.createDoc("Task", {
    subject: `${role} - ${projectLabel || project}`,
    project,
    status: "Open",
    priority: "Medium",
    exp_start_date: start,
    exp_end_date: eta,
    expected_time: expected(hoursPerDay, start, eta),
    description: composeAssignment({ role, hoursPerDay, notes, email }),
  });
  try {
    await frappe.callMethod("frappe.desk.form.assign_to.add", {
      doctype: "Task",
      name: task.name,
      assign_to: [email],
      description: `Assigned as ${role} on ${projectLabel || project} until ${eta}`,
      notify: 0,
    });
  } catch (e) {
    await frappe.deleteDoc("Task", task.name).catch(() => {}); // don't leave an unassigned task behind
    throw e;
  }
  return task;
}

export function updateAssignment(name, { projectLabel, role, start, eta, hoursPerDay, notes, status, email }) {
  return frappe.updateDoc("Task", name, {
    subject: `${role} - ${projectLabel}`,
    exp_start_date: start,
    exp_end_date: eta,
    expected_time: expected(hoursPerDay, start, eta),
    description: composeAssignment({ role, hoursPerDay, notes, email }),
    ...(status ? { status } : {}),
  });
}

/** Complete / cancel. Pass the parsed assignment so its assignee is written down before ERPNext clears _assign. */
export function setAssignmentStatus(name, status, a) {
  const keep = a && a.assignees?.[0] ? { description: composeAssignment({ role: a.role, hoursPerDay: a.hoursPerDay, notes: a.notes, email: a.assignees[0] }) } : {};
  return frappe.updateDoc("Task", name, { ...keep, status });
}