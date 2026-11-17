// Role presets (what each role needs for the app to work) and the login restrictions the app relies on.
// Used by Admin › Roles & Permissions and by the automatic setup (autoSetup.js), which applies all of it once.
import { frappe } from "./api/frappeClient";
import { errMsg } from "./employeePortal";
import { serverLoginsReady } from "./securitySetup";
import { CONTRACTOR_PRESET } from "./contractorSetup";

export const PM = "frappe.core.page.permission_manager.permission_manager";
export const ROLES = ["HR Manager", "HR User", "Projects Manager", "Employee", "Contractor", "Interviewer", "Leave Approver", "Expense Approver"];

// Everything HR needs to add an employee AND give them a login in one go. Each line below was a
// real permission check ERPNext performs along that path, so granting them all avoids one error at a time.
export const HR_PRESET = [
  { doctype: "User", perms: ["read", "write", "create"], why: "Create the employee's login and reset passwords", elevated: true },
  { doctype: "User", permlevel: 1, perms: ["read", "write"], why: "Set the login's role and type (protected fields on User)", elevated: true },
  { doctype: "User Permission", perms: ["read", "write", "create"], why: "Linking a login to an employee restricts it to that employee and company", elevated: true },
  { doctype: "Employee", perms: ["read", "write", "create"], why: "Add and edit employees" },
  { doctype: "Asset", perms: ["read", "write", "create", "delete", "submit", "cancel", "amend"], why: "Manage assigned employee assets" },
  { doctype: "Asset Movement", perms: ["read", "create", "submit"], why: "Hand assets to employees and take them back (asset register)" },
  { doctype: "Asset Category", perms: ["read", "write", "create"], why: "Asset types from the register (Laptop, Furniture…)" },
  { doctype: "Item", perms: ["read", "create"], why: "ERPNext needs a fixed-asset item per asset type" },
  { doctype: "Item Group", perms: ["read"], why: "Group for the asset-type items" },
  { doctype: "Location", perms: ["read", "create"], why: "Where unassigned assets are kept (Office…)" },
  { doctype: "Account", perms: ["read"], why: "Fixed-asset ledger for each asset type" },
  { doctype: "File", perms: ["read", "write", "create", "delete"], why: "Publish and manage company policies and employee documents" },
  { doctype: "Employee", permlevel: 1, perms: ["read", "write"], why: "Salary and bank details (restricted to HR by System Setup)" },
  { doctype: "Timesheet", perms: ["read", "write", "create", "submit", "cancel", "amend"], why: "Review timesheets: approve, or return for correction (cancels and creates an editable copy)" },
  { doctype: "Comment", perms: ["read", "create"], why: "Timesheet approvals and return notes are stored as comments" },
  { doctype: "Issue", perms: ["read", "write"], why: "Employee Requests: see what employees raise, update the status and close them" },
  { doctype: "Company", perms: ["read"], why: "Pick the company for an employee" },
  { doctype: "Department", perms: ["read"], why: "Pick the department" },
  { doctype: "Designation", perms: ["read"], why: "Pick the designation" },
  // Recruitment (HR › Recruitment). HRMS gives most of these to HR User already; requisitions and onboarding are
  // System Manager / HR Manager only out of the box.
  { doctype: "Job Requisition", perms: ["read", "write", "create"], why: "Raise and decide hiring requests (approval itself is limited to HR Managers by a server rule)" },
  { doctype: "Job Opening", perms: ["read", "write", "create", "delete"], why: "Openings, careers page, vacancies and interview rounds" },
  { doctype: "Job Applicant", perms: ["read", "write", "create", "delete", "share"], why: "Candidates and pipeline; sharing a profile with interviewers" },
  { doctype: "Job Applicant", permlevel: 1, perms: ["read", "write"], why: "Candidate current / expected CTC (restricted fields)" },
  { doctype: "Job Applicant Source", perms: ["read", "create"], why: "Candidate source (LinkedIn, Naukri, referral…)" },
  { doctype: "Interview Round", perms: ["read", "write", "create", "delete"], why: "Rounds and skill scorecards" },
  { doctype: "Interview Type", perms: ["read"], why: "Round type" },
  { doctype: "Skill", perms: ["read", "create"], why: "Scorecard skills" },
  { doctype: "Interview", perms: ["read", "write", "create", "delete", "submit"], why: "Schedule interviews and record the decision" },
  { doctype: "Interview Feedback", perms: ["read"], why: "Read the panel's scorecards" },
  { doctype: "Job Offer", perms: ["read", "write", "create", "delete", "submit", "cancel", "amend"], why: "Offers: draft, send, revise (approval is limited to HR Managers by a server rule)" },
  { doctype: "Job Offer", permlevel: 1, perms: ["read", "write"], why: "Offered CTC (restricted field)" },
  { doctype: "Job Offer Term Template", perms: ["read"], why: "Offer terms" },
  { doctype: "Employee Onboarding", perms: ["read", "write", "create", "submit"], why: "Onboarding new joiners from accepted offers" },
  { doctype: "Employee Onboarding Template", perms: ["read"], why: "Onboarding task templates" },
  { doctype: "Version", perms: ["read"], why: "Candidate timeline (change history)" },
  { doctype: "Communication", perms: ["read", "create"], why: "Email offer letters and regret notes" },
  { doctype: "Branch", perms: ["read"], why: "Opening location" },
  { doctype: "Employment Type", perms: ["read"], why: "Opening employment type" },
  { doctype: "Project", perms: ["read"], why: "Project on a requisition" },
  // Leave, lifecycle, performance, training
  { doctype: "Leave Application", perms: ["read", "write", "create", "submit"], why: "Approve / reject and apply for employees" },
  { doctype: "Expense Claim", perms: ["read", "write", "create", "submit"], why: "Approve / reject claims and raise them for employees" },
  { doctype: "Expense Claim", permlevel: 1, perms: ["read", "write"], why: "Set the claim's approval status" },
  { doctype: "Expense Claim Type", perms: ["read"], why: "Expense types on claims" },
  { doctype: "Leave Allocation", perms: ["read", "write", "create", "submit"], why: "Allocate leave and show balances" },
  { doctype: "Leave Type", perms: ["read"], why: "Leave types" },
  { doctype: "Employee Promotion", perms: ["read", "write", "create", "submit"], why: "Promotions" },
  { doctype: "Employee Transfer", perms: ["read", "write", "create", "submit"], why: "Transfers" },
  { doctype: "Employee Separation", perms: ["read", "write", "create", "delete", "submit", "cancel"], why: "Exits: start, run the checklist, cancel when an employee withdraws" },
  { doctype: "Employee Separation Template", perms: ["read", "write"], why: "Exit checklists and their documents" },
  { doctype: "Employee Grade", perms: ["read"], why: "Grades on promotions" },
  { doctype: "Appraisal Cycle", perms: ["read", "write", "create"], why: "Appraisal cycles" },
  { doctype: "Appraisal", perms: ["read", "write", "create", "submit"], why: "Appraisals" },
  { doctype: "Appraisal Template", perms: ["read", "write", "create"], why: "Appraisal templates" },
  { doctype: "KRA", perms: ["read", "create"], why: "Key result areas" },
  { doctype: "Goal", perms: ["read", "write", "create"], why: "Goals" },
  { doctype: "Training Program", perms: ["read", "write", "create"], why: "Training programs" },
  { doctype: "Training Event", perms: ["read", "write", "create", "submit"], why: "Training events" },
  { doctype: "Training Feedback", perms: ["read"], why: "Training feedback" },
  { doctype: "Attendance", perms: ["read"], why: "Attendance report" },
  { doctype: "Holiday List", perms: ["read", "write", "create"], why: "Each office's yearly holiday list (Office Locations); expected hours" },
  { doctype: "Branch", perms: ["read", "write", "create"], why: "Office locations" },
  { doctype: "Employee Checkin", perms: ["read"], why: "In and out times on the Attendance page" },
  { doctype: "Employee Health Insurance", perms: ["read", "create"], why: "Insurance provider on an employee" },
  { doctype: "Country", perms: ["read"], why: "Office country (for its public holidays)" },
];
// Everything the employee portal reads or writes as a signed-in employee.
// ERPNext's standard "Projects Manager" role is our Project Manager: projects, assigning tasks to people, team timesheets.
export const PM_PRESET = [
  { doctype: "Project", perms: ["read", "write", "create"], why: "Create and manage projects" },
  { doctype: "Task", perms: ["read", "write", "create", "delete", "share"], why: "Assignments are tasks assigned to employees" },
  { doctype: "ToDo", perms: ["read", "write", "create"], why: "Assigning a task to an employee" },
  { doctype: "Employee", perms: ["read"], why: "Choose employees to assign" },
  { doctype: "Company", perms: ["read"], why: "Company on projects" },
  { doctype: "Department", perms: ["read"], why: "Employee details" },
  { doctype: "Designation", perms: ["read"], why: "Employee details" },
  { doctype: "Timesheet", perms: ["read"], why: "See the team's timesheets" },
  { doctype: "Activity Type", perms: ["read"], why: "Timesheet details" },
  { doctype: "Job Requisition", perms: ["read", "write", "create"], why: "Raise hiring requests for their projects" },
  { doctype: "Job Opening", perms: ["read"], why: "See the opening their request produced" },
];
// HRMS's standard "Interviewer" role: given automatically to people put on an interview panel.
const INTERVIEWER_PRESET = [
  { doctype: "Interview", perms: ["read"], why: "See interviews they're on" },
  { doctype: "Interview Feedback", perms: ["read", "create", "submit"], why: "Submit their scorecard" },
  { doctype: "Interview Round", perms: ["read"], why: "Round details" },
  { doctype: "Skill", perms: ["read"], why: "Scorecard skills" },
];
// HRMS's approver roles, given automatically to anyone set as a leave / expense approver (Admin › Organization).
const LEAVE_APPROVER_PRESET = [
  { doctype: "Leave Application", perms: ["read", "write", "submit"], why: "Approve / reject leave they're the approver of" },
  { doctype: "Comment", perms: ["read", "create"], why: "Reason for a rejection" },
];
const EXPENSE_APPROVER_PRESET = [
  { doctype: "Expense Claim", perms: ["read", "write", "submit"], why: "Approve / reject claims they're the approver of" },
  { doctype: "Expense Claim", permlevel: 1, perms: ["read", "write"], why: "Set the claim's approval status" },
  { doctype: "Expense Claim Type", perms: ["read"], why: "Expense types on claims" },
  { doctype: "File", perms: ["read"], why: "Open the attached bills" },
  { doctype: "Comment", perms: ["read", "create"], why: "Reason for a rejection" },
];
export const PRESETS = {
  Contractor: CONTRACTOR_PRESET,
  "Leave Approver": LEAVE_APPROVER_PRESET,
  "Expense Approver": EXPENSE_APPROVER_PRESET,
  Interviewer: INTERVIEWER_PRESET,
  "Projects Manager": PM_PRESET,
  "HR Manager": HR_PRESET,
  "HR User": HR_PRESET,
  Employee: [
    { doctype: "Employee", perms: ["read"], why: "See their own profile" },
    { doctype: "Company", perms: ["read"], why: "Company details used on forms" },
    { doctype: "Department", perms: ["read"], why: "Show their department" },
    { doctype: "Employee Checkin", perms: ["read", "create"], why: "Punch in / out" },
    { doctype: "Attendance", perms: ["read"], why: "Attendance history" },
    { doctype: "Attendance Request", perms: ["read", "write", "create", "delete"], why: "Attendance correction requests" },
    { doctype: "Leave Application", perms: ["read", "write", "create", "delete"], why: "Apply for and withdraw leave" },
    { doctype: "Leave Allocation", perms: ["read"], why: "Leave balance" },
    { doctype: "Leave Type", perms: ["read"], why: "Choose a leave type" },
    { doctype: "Holiday List", perms: ["read"], why: "Holidays and weekly offs" },
    { doctype: "Branch", perms: ["read"], why: "Holiday list of their office" },
    { doctype: "Shift Assignment", perms: ["read"], why: "Their shifts" },
    { doctype: "Event", perms: ["read"], why: "Company events" },
    { doctype: "Timesheet", perms: ["read", "write", "create", "delete", "submit"], why: "Log, correct, delete drafts and submit hours" },
    { doctype: "Project", perms: ["read"], why: "Timesheet projects" },
    { doctype: "Task", perms: ["read"], why: "Assigned tasks" },
    { doctype: "Activity Type", perms: ["read"], why: "Timesheet activity (also used on entries created in the staff workspace)" },
    { doctype: "Expense Claim", perms: ["read", "write", "create", "delete"], why: "Expense claims and bills" },
    { doctype: "Expense Claim Type", perms: ["read"], why: "Choose an expense type" },
    { doctype: "Salary Slip", perms: ["read"], why: "View payslips" },
    { doctype: "File", perms: ["read", "create"], why: "Policies, their documents and bill uploads" },
    { doctype: "Comment", perms: ["read", "create"], why: "Policy acknowledgements and HR's timesheet review notes" },
    { doctype: "Note", perms: ["read"], why: "Company announcements" },
    { doctype: "Notification Log", perms: ["read", "write"], why: "Notifications and mark as read" },
    { doctype: "Issue", perms: ["read", "write", "create"], why: "HR / IT requests, letters, asset requests" },
    { doctype: "Asset", perms: ["read"], why: "See assigned equipment" },
    { doctype: "Training Event", perms: ["read"], why: "Assigned training" },
    { doctype: "Goal", perms: ["read"], why: "Goals" },
    { doctype: "Appraisal", perms: ["read"], why: "Review dates" },
    { doctype: "Employee Performance Feedback", perms: ["read"], why: "Manager feedback" },
    { doctype: "Employee Benefit Claim", perms: ["read"], why: "Benefit claims" },
    { doctype: "Help Article", perms: ["read"], why: "Search help articles" },
  ],
};

export const getPerms = (doctype) => frappe.callMethod(`${PM}.get_permissions`, { doctype });
export const levelRows = (rows, roles, level) => rows.filter((r) => roles.includes(r.role) && Number(r.permlevel) === level);
export const missingFlags = (rows, roles, need, level = 0) => need.filter((p) => !levelRows(rows, roles, level).some((r) => Number(r[p]) === 1));

export async function applyItem(role, item) {
  const level = item.permlevel ?? 0;
  const hasPlain = item.rows.some((r) => r.role === role && Number(r.permlevel) === level && !Number(r.if_owner));
  if (!hasPlain) await frappe.callMethod(`${PM}.add`, { parent: item.doctype, role, permlevel: level });
  for (const ptype of item.missing) await frappe.callMethod(`${PM}.update`, { doctype: item.doctype, role, permlevel: level, ptype, value: 1 });
}

// Once the server-side login methods are installed (Admin › ERPNext Setup), HR doesn't need the "elevated" rights
// over User / User Permission any more, so presets skip them (and Tighten HR access can remove them).
let tightened = null;
const hrIsTightened = () => (tightened ||= serverLoginsReady(frappe));

export async function loadItems(role) {
  const skipElevated = await hrIsTightened();
  return Promise.all(PRESETS[role].filter((p) => !(skipElevated && p.elevated)).map(async (p) => {
    try {
      const rows = await getPerms(p.doctype);
      return { ...p, rows, missing: missingFlags(rows, [role], p.perms, p.permlevel ?? 0) };
    } catch (e) {
      return { ...p, rows: [], missing: p.perms, error: errMsg(e, "Couldn't read permissions for this doctype.") };
    }
  }));
}

// Elevated HR rights that the server-side login methods make unnecessary.
export const ELEVATED = [
  { doctype: "User", permlevel: 0, perms: ["create", "write"] },
  { doctype: "User", permlevel: 1, perms: ["write"] },
  { doctype: "User Permission", permlevel: 0, perms: ["create", "write", "delete"] },
];

export async function loadRestrictions() {
  const emps = await frappe.getList("Employee", { filters: [["user_id", "is", "set"]], fields: ["name", "employee_name", "company", "user_id"], limit: 0 });
  if (!emps.length) return [];
  const users = emps.map((e) => e.user_id);
  const [staff, perms] = await Promise.all([
    frappe.getList("Has Role", { parent: "User", filters: [["parent", "in", users], ["parenttype", "=", "User"], ["role", "in", ["HR Manager", "HR User", "System Manager"]]], fields: ["parent"], limit: 0 }),
    frappe.getList("User Permission", { filters: [["user", "in", users], ["allow", "in", ["Employee", "Company"]]], fields: ["user", "allow", "for_value"], limit: 0 }),
  ]);
  const staffSet = new Set(staff.map((s) => s.parent));
  return emps.filter((e) => !staffSet.has(e.user_id)).map((e) => ({
    ...e,
    hasEmployee: perms.some((p) => p.user === e.user_id && p.allow === "Employee" && p.for_value === e.name),
    hasCompany: !e.company || perms.some((p) => p.user === e.user_id && p.allow === "Company" && p.for_value === e.company),
  }));
}

export async function restrict(e) {
  if (!e.hasEmployee) await frappe.createDoc("User Permission", { user: e.user_id, allow: "Employee", for_value: e.name, apply_to_all_doctypes: 1 });
  if (!e.hasCompany) await frappe.createDoc("User Permission", { user: e.user_id, allow: "Company", for_value: e.company, apply_to_all_doctypes: 1 });
}

// ERPNext adds an "Employee" User Permission whenever a login is linked to an Employee record. For HR and Project
// Managers that limits them to records tied to their own employee (their own requisitions, timesheets, team list…).
export async function loadStaffRestrictions() {
  const roles = await frappe.getList("Has Role", { filters: [["role", "in", ["HR Manager", "HR User", "Projects Manager"]], ["parenttype", "=", "User"]], fields: ["parent", "role"], limit: 0, parent: "User" })
    .catch(() => frappe.getList("User", { filters: [["Has Role", "role", "in", ["HR Manager", "HR User", "Projects Manager"]]], fields: ["name"], limit: 0 }).then((r) => r.map((u) => ({ parent: u.name, role: "" }))));
  const users = [...new Set(roles.map((r) => r.parent))].filter((u) => u !== "Administrator");
  if (!users.length) return [];
  const perms = await frappe.getList("User Permission", { filters: [["user", "in", users], ["allow", "=", "Employee"]], fields: ["name", "user", "for_value"], limit: 0 });
  return perms.map((p) => ({ ...p, roles: roles.filter((r) => r.parent === p.user).map((r) => r.role).filter(Boolean) }));
}


/** Grants every missing permission of every role preset. Returns how many permission sets were added. */
export async function applyAllPresets() {
  let applied = 0;
  for (const role of ROLES) {
    for (const item of (await loadItems(role)).filter((i) => i.missing.length && !i.error)) {
      await applyItem(role, item);
      applied += 1;
    }
  }
  return applied;
}

/** Once logins go through the server method, HR loses its rights to create / edit Users and User Permissions. */
export async function tightenHr() {
  let changed = 0;
  for (const role of ["HR Manager", "HR User"]) {
    for (const item of ELEVATED) {
      const rows = (await getPerms(item.doctype)).filter((r) => r.role === role && Number(r.permlevel) === item.permlevel);
      for (const r of rows) for (const ptype of item.perms) {
        if (Number(r[ptype]) === 1) { await frappe.callMethod(`${PM}.update`, { doctype: item.doctype, role, permlevel: item.permlevel, ptype, value: 0, if_owner: r.if_owner }); changed += 1; }
      }
    }
  }
  return changed;
}

/** Restricts every employee login to its own record and company. Returns how many were changed. */
export async function restrictAllEmployees() {
  const open = (await loadRestrictions()).filter((r) => !r.hasEmployee || !r.hasCompany);
  for (const e of open) await restrict(e);
  return open.length;
}

/** Removes the automatic own-record restriction from HR and Project Manager logins. Returns how many were lifted. */
export async function liftStaffRestrictions() {
  const rows = await loadStaffRestrictions();
  for (const r of rows) await frappe.deleteDoc("User Permission", r.name);
  return rows.length;
}

