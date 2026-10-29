import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Check, Loader2, Plus, RefreshCw, ShieldCheck, Wand2 } from "lucide-react";
import { frappe } from "../../lib/api/frappeClient";
import { errMsg } from "../../lib/employeePortal";
import { serverLoginsReady } from "../../lib/securitySetup";
import { Button, Card } from "../../components/ui/primitives";
import { confirmDialog } from "../../components/ui/dialogs";

/**
 * Admin-only editor for the role permissions that the HR and Employee workspaces rely on.
 * It uses the platform's Role Permissions Manager methods, which copy the standard permissions into
 * Custom DocPerm first - so granting one permission never wipes the others.
 */
const PM = "frappe.core.page.permission_manager.permission_manager";
const ROLES = ["HR Manager", "HR User", "Projects Manager", "Employee", "Interviewer", "Leave Approver", "Expense Approver"];
const FLAGS = ["read", "write", "create", "delete", "submit", "cancel", "amend", "report", "export", "share", "print", "email"];

// Everything HR needs to add an employee AND give them a login in one go. Each line below was a
// real permission check ERPNext performs along that path, so granting them all avoids one error at a time.
const HR_PRESET = [
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
  { doctype: "Employee Separation", perms: ["read", "write", "create", "submit"], why: "Exits" },
  { doctype: "Employee Separation Template", perms: ["read"], why: "Exit checklists" },
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
  { doctype: "Country", perms: ["read"], why: "Office country (for its public holidays)" },
];
// Everything the employee portal reads or writes as a signed-in employee.
// ERPNext's standard "Projects Manager" role is our Project Manager: projects, assigning tasks to people, team timesheets.
const PM_PRESET = [
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
const PRESETS = {
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

const getPerms = (doctype) => frappe.callMethod(`${PM}.get_permissions`, { doctype });
const levelRows = (rows, roles, level) => rows.filter((r) => roles.includes(r.role) && Number(r.permlevel) === level);
const missingFlags = (rows, roles, need, level = 0) => need.filter((p) => !levelRows(rows, roles, level).some((r) => Number(r[p]) === 1));

async function applyItem(role, item) {
  const level = item.permlevel ?? 0;
  const hasPlain = item.rows.some((r) => r.role === role && Number(r.permlevel) === level && !Number(r.if_owner));
  if (!hasPlain) await frappe.callMethod(`${PM}.add`, { parent: item.doctype, role, permlevel: level });
  for (const ptype of item.missing) await frappe.callMethod(`${PM}.update`, { doctype: item.doctype, role, permlevel: level, ptype, value: 1 });
}

const chip = (active) =>
  `rounded-md border px-3 py-1.5 text-[12px] transition-colors ${active ? "border-[var(--color-red)] bg-[var(--color-red-wash)] text-[var(--color-text)]" : "border-[var(--color-border)] text-[var(--color-text-muted)] hover:text-[var(--color-text)]"}`;

function Section({ title, hint, action, children }) {
  return (
    <Card className="p-5">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div><h2 className="text-[14px] font-semibold text-[var(--color-text)]">{title}</h2>{hint && <p className="mt-1 text-[12px] text-[var(--color-text-muted)]">{hint}</p>}</div>
        {action}
      </div>
      {children}
    </Card>
  );
}

// Once the server-side login methods are installed (Admin › ERPNext Setup), HR doesn't need the "elevated" rights
// over User / User Permission any more, so presets skip them (and Tighten HR access can remove them).
let tightened = null;
const hrIsTightened = () => (tightened ||= serverLoginsReady(frappe));

async function loadItems(role) {
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

function ApplyEverything() {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  async function run() {
    if (!(await confirmDialog({ title: "Apply permissions", message: "Add every missing permission for HR Manager, HR User, Projects Manager, Employee and Interviewer? Existing permissions are not removed.", confirmLabel: "Apply everything" }))) return;
    setBusy(true);
    setMsg(null);
    let applied = 0;
    try {
      for (const role of ROLES) {
        for (const item of (await loadItems(role)).filter((i) => i.missing.length && !i.error)) {
          await applyItem(role, item);
          applied += 1;
        }
      }
      setMsg({ ok: true, text: applied ? `Done - ${applied} permission set(s) added. Users must sign out and back in.` : "Everything was already granted." });
    } catch (e) {
      setMsg({ ok: false, text: errMsg(e, "The change was refused. Sign in as an administrator and try again.") });
    }
    setBusy(false);
  }
  return (
    <div className="mt-4 flex flex-wrap items-center gap-3">
      <Button onClick={run} disabled={busy}>{busy ? <Loader2 size={14} className="animate-spin" /> : <Wand2 size={14} />} Apply everything for HR, Projects Manager, Employee, Interviewer and approver roles</Button>
      {msg && <span className={`text-[12px] ${msg.ok ? "text-[var(--color-green)]" : "text-[var(--color-red-hover)]"}`}>{msg.text}</span>}
    </div>
  );
}

// Elevated HR rights that the server-side login methods make unnecessary.
const ELEVATED = [
  { doctype: "User", permlevel: 0, perms: ["create", "write"] },
  { doctype: "User", permlevel: 1, perms: ["write"] },
  { doctype: "User Permission", permlevel: 0, perms: ["create", "write", "delete"] },
];

function TightenHr() {
  const ready = useAsyncValue(() => serverLoginsReady(frappe));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  async function run() {
    if (!(await confirmDialog("Remove HR's rights to create or edit Users and User Permissions? Employee logins then go only through the server-side method, which can't touch HR or admin accounts."))) return;
    setBusy(true);
    setMsg(null);
    try {
      let changed = 0;
      for (const role of ["HR Manager", "HR User"]) {
        for (const item of ELEVATED) {
          const rows = (await getPerms(item.doctype)).filter((r) => r.role === role && Number(r.permlevel) === item.permlevel);
          for (const r of rows) for (const ptype of item.perms) {
            if (Number(r[ptype]) === 1) { await frappe.callMethod(`${PM}.update`, { doctype: item.doctype, role, permlevel: item.permlevel, ptype, value: 0, if_owner: r.if_owner }); changed += 1; }
          }
        }
      }
      setMsg({ ok: true, text: changed ? `Removed ${changed} right(s). HR keeps read access to Users. HR users must sign out and back in.` : "HR already has no elevated rights." });
    } catch (e) {
      setMsg({ ok: false, text: errMsg(e, "The change was refused. Sign in as an administrator and try again.") });
    }
    setBusy(false);
  }
  return (
    <Section title="Tighten HR access" hint="Employee logins are created and reset by a server-side method that can only touch plain employee accounts and always restricts them. HR then doesn't need to create or edit Users and User Permissions - which would also let them reset an administrator's password or widen their own access.">
      {ready === null ? <p className="text-[12px] text-[var(--color-text-muted)]">Checking…</p> : ready ? (
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="secondary" onClick={run} disabled={busy}>{busy ? <Loader2 size={14} className="animate-spin" /> : <ShieldCheck size={14} />} Remove HR's elevated rights</Button>
          {msg && <span className={`text-[12px] ${msg.ok ? "text-[var(--color-green)]" : "text-[var(--color-red-hover)]"}`}>{msg.text}</span>}
        </div>
      ) : <p className="text-[12px] text-[var(--color-amber)]">Run Admin › System Setup first to install the secure login method.</p>}
    </Section>
  );
}

function useAsyncValue(fn) {
  const [v, setV] = useState(null);
  useEffect(() => { let off = false; fn().then((x) => !off && setV(x)).catch(() => !off && setV(false)); return () => { off = true; }; }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return v;
}

export default function Roles() {
  return (
    <div className="space-y-5">
      <Card className="p-5">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[var(--color-red-wash)] text-[var(--color-red-hover)]"><ShieldCheck size={18} /></span>
          <div>
            <h2 className="text-[15px] font-semibold text-[var(--color-text)]">Roles & Permissions</h2>
            <p className="mt-1 text-[13px] text-[var(--color-text-muted)]">Decide what HR and Employee accounts are allowed to do. One click below grants everything the HR and Employee workspaces need, so you don't hit permission errors one at a time.</p>
            <ApplyEverything />
          </div>
        </div>
      </Card>
      <RequiredPermissions />
      <TightenHr />
      <AccountCheck />
      <EmployeeRestrictions />
      <StaffRestrictions />
      <PermissionEditor />
    </div>
  );
}

/* --------------------------- required permissions --------------------------- */

function RequiredPermissions() {
  const [role, setRole] = useState("HR Manager");
  const [items, setItems] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  const load = useCallback(async () => {
    setItems(null);
    const out = await loadItems(role);
    setItems(out);
  }, [role]);

  useEffect(() => { load(); }, [load]);

  const todo = (items || []).filter((i) => i.missing.length && !i.error);

  async function applyAll() {
    if (!(await confirmDialog(`Add ${todo.length} missing permission(s) for ${role}?`))) return;
    setBusy(true);
    setMsg(null);
    try {
      for (const item of todo) await applyItem(role, item);
      setMsg({ ok: true, text: `Permissions applied for ${role}. Ask the user to sign out and back in.` });
    } catch (e) {
      setMsg({ ok: false, text: errMsg(e, "The change was refused. Sign in as an administrator and try again.") });
    } finally {
      setBusy(false);
      load();
    }
  }

  return (
    <Section title="Required permissions" hint="The permissions each role needs for the app to work. Only missing permissions are added - existing ones are never removed."
      action={<Button onClick={applyAll} disabled={busy || !todo.length}>{busy ? <Loader2 size={14} className="animate-spin" /> : <Wand2 size={14} />} {todo.length ? `Apply ${todo.length} missing` : "All set"}</Button>}>
      <div className="mb-4 flex flex-wrap gap-2">{ROLES.map((r) => <button key={r} type="button" onClick={() => setRole(r)} className={chip(role === r)}>{r}</button>)}</div>

      {!items ? <p className="flex items-center gap-2 py-6 text-[13px] text-[var(--color-text-muted)]"><Loader2 size={14} className="animate-spin" /> Checking permissions…</p> : (
        <ul className="divide-y divide-[var(--color-border)]">
          {items.map((i) => (
            <li key={`${i.doctype}-${i.permlevel ?? 0}`} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div className="min-w-0">
                <p className="text-[13px] font-medium text-[var(--color-text)]">{i.doctype}{i.permlevel ? ` (level ${i.permlevel})` : ""} <span className="ml-1 font-normal text-[var(--color-text-faint)]">{i.perms.join(", ")}</span></p>
                <p className="text-[12px] text-[var(--color-text-muted)]">{i.why}</p>
              </div>
              {i.error ? <span className="text-[12px] text-[var(--color-amber)]">{i.error}</span> : i.missing.length === 0
                ? <span className="flex items-center gap-1 text-[12px] text-[var(--color-green)]"><Check size={14} /> Granted</span>
                : <span className="text-[12px] text-[var(--color-amber)]">Missing: {i.missing.join(", ")}</span>}
            </li>
          ))}
        </ul>
      )}

      {role !== "Employee" && (
        <div className="mt-4 flex items-start gap-2 rounded-lg border border-[var(--color-border-strong)] bg-[var(--color-surface-2)] px-4 py-3 text-[12px] text-[var(--color-text-muted)]">
          <AlertTriangle size={15} className="mt-0.5 shrink-0 text-[var(--color-amber)]" />
          <span>Letting HR create and edit <b className="text-[var(--color-text)]">User</b> records also lets them set any user's password, including administrators'. Letting HR create <b className="text-[var(--color-text)]">User Permissions</b> means they can also widen their own company access, which weakens the one-company-per-HR rule. Only give this to HR staff you trust. A safer option is a server-side method that can only create Employee logins - ask if you'd like me to write it.</span>
        </div>
      )}
      {msg && <p className={`mt-3 text-[12px] ${msg.ok ? "text-[var(--color-green)]" : "text-[var(--color-red-hover)]"}`}>{msg.text}</p>}
    </Section>
  );
}

/* ------------------------- employee record restrictions ------------------------- */

async function loadRestrictions() {
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

async function restrict(e) {
  if (!e.hasEmployee) await frappe.createDoc("User Permission", { user: e.user_id, allow: "Employee", for_value: e.name, apply_to_all_doctypes: 1 });
  if (!e.hasCompany) await frappe.createDoc("User Permission", { user: e.user_id, allow: "Company", for_value: e.company, apply_to_all_doctypes: 1 });
}

// ERPNext adds an "Employee" User Permission whenever a login is linked to an Employee record. For HR and Project
// Managers that limits them to records tied to their own employee (their own requisitions, timesheets, team list…).
async function loadStaffRestrictions() {
  const roles = await frappe.getList("Has Role", { filters: [["role", "in", ["HR Manager", "HR User", "Projects Manager"]], ["parenttype", "=", "User"]], fields: ["parent", "role"], limit: 0, parent: "User" })
    .catch(() => frappe.getList("User", { filters: [["Has Role", "role", "in", ["HR Manager", "HR User", "Projects Manager"]]], fields: ["name"], limit: 0 }).then((r) => r.map((u) => ({ parent: u.name, role: "" }))));
  const users = [...new Set(roles.map((r) => r.parent))].filter((u) => u !== "Administrator");
  if (!users.length) return [];
  const perms = await frappe.getList("User Permission", { filters: [["user", "in", users], ["allow", "=", "Employee"]], fields: ["name", "user", "for_value"], limit: 0 });
  return perms.map((p) => ({ ...p, roles: roles.filter((r) => r.parent === p.user).map((r) => r.role).filter(Boolean) }));
}

function StaffRestrictions() {
  const [rows, setRows] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const load = useCallback(async () => { setRows(null); try { setRows(await loadStaffRestrictions()); } catch (e) { setRows([]); setError(errMsg(e, "Couldn't check staff logins.")); } }, []);
  useEffect(() => { load(); }, [load]);
  async function lift(list) {
    if (!(await confirmDialog({ message: `Remove the automatic Employee restriction from ${list.length} login(s)?`, confirmLabel: "Lift" }))) return;
    setBusy(true);
    setError("");
    try { for (const r of list) await frappe.deleteDoc("User Permission", r.name); } catch (e) { setError(errMsg(e, "Couldn't remove the restriction.")); }
    setBusy(false);
    load();
  }
  return (
    <Section title="HR & Project Manager logins limited to their own record" hint="Employee-linked accounts are limited to that employee. For HR and Project Managers this hides other people's requisitions, timesheets and team data. Remove it for staff who need to see across the company (their Company restriction stays)."
      action={<Button onClick={() => lift(rows || [])} disabled={busy || !(rows || []).length}>{busy ? "Working…" : `Lift ${(rows || []).length || ""}`.trim()}</Button>}>
      {!rows ? <p className="flex items-center gap-2 py-3 text-[13px] text-[var(--color-text-muted)]"><Loader2 size={14} className="animate-spin" /> Checking…</p> : rows.length === 0 ? <p className="py-2 text-[13px] text-[var(--color-green)]"><Check size={14} className="mr-1 inline" /> No HR or Project Manager login is limited to its own employee record.</p> : (
        <ul className="divide-y divide-[var(--color-border)] text-[13px]">{rows.map((r) => <li key={r.name} className="flex items-center justify-between py-2"><span>{r.user} <span className="text-[11px] text-[var(--color-text-faint)]">{r.roles.join(", ")} · limited to {r.for_value}</span></span><button type="button" disabled={busy} onClick={() => lift([r])} className="text-[12px] text-[var(--color-red-hover)] hover:underline">Lift</button></li>)}</ul>
      )}
      {error && <p className="mt-3 text-[12px] text-[var(--color-red-hover)]">{error}</p>}
    </Section>
  );
}

function EmployeeRestrictions() {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setRows(null);
    setError("");
    try { setRows(await loadRestrictions()); } catch (e) { setRows([]); setError(errMsg(e, "Couldn't load employee logins.")); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const open = (rows || []).filter((r) => !r.hasEmployee || !r.hasCompany);

  async function fix(list) {
    if (!(await confirmDialog({ message: `Restrict ${list.length} employee login(s) to their own record and company?`, confirmLabel: "Restrict" }))) return;
    setBusy(true);
    setError("");
    try { for (const e of list) await restrict(e); } catch (e) { setError(errMsg(e, "Couldn't create the restriction.")); }
    setBusy(false);
    load();
  }

  return (
    <Section title="Employee record restrictions" hint="Employee logins should only see their own record and company. These restrictions may need administrator access to create - fix any gaps here."
      action={<div className="flex gap-2"><Button variant="secondary" onClick={load}><RefreshCw size={14} /> Refresh</Button><Button onClick={() => fix(open)} disabled={busy || !open.length}>{busy ? "Working…" : `Restrict ${open.length || ""}`.trim()}</Button></div>}>
      {!rows ? <p className="flex items-center gap-2 py-4 text-[13px] text-[var(--color-text-muted)]"><Loader2 size={14} className="animate-spin" /> Checking…</p> : rows.length === 0 ? <p className="py-3 text-[13px] text-[var(--color-text-muted)]">No employee-only logins yet.</p> : (
        <ul className="divide-y divide-[var(--color-border)]">
          {rows.map((r) => (
            <li key={r.name} className="flex items-center justify-between gap-3 py-2.5 text-[13px]">
              <span className="min-w-0"><span className="text-[var(--color-text)]">{r.employee_name}</span><span className="ml-2 text-[11px] text-[var(--color-text-faint)]">{r.user_id}</span></span>
              {r.hasEmployee && r.hasCompany ? <span className="flex items-center gap-1 text-[12px] text-[var(--color-green)]"><Check size={14} /> Restricted</span>
                : <button type="button" disabled={busy} onClick={() => fix([r])} className="text-[12px] text-[var(--color-red-hover)] hover:underline disabled:opacity-50">Not restricted - fix</button>}
            </li>
          ))}
        </ul>
      )}
      {error && <p className="mt-3 text-[12px] text-[var(--color-red-hover)]">{error}</p>}
    </Section>
  );
}

/* ------------------------------- permission editor ------------------------------- */

function PermissionEditor() {
  const [doctype, setDoctype] = useState("");
  const [loaded, setLoaded] = useState("");
  const [rows, setRows] = useState([]);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  async function load(name = doctype) {
    if (!name.trim()) return;
    setBusy("load");
    setError("");
    try {
      const all = await getPerms(name.trim());
      setRows(all.filter((r) => ROLES.includes(r.role)));
      setLoaded(name.trim());
    } catch (e) {
      setRows([]);
      setLoaded("");
      setError(errMsg(e, "Couldn't load permissions for that doctype."));
    }
    setBusy("");
  }

  async function toggle(row, ptype, value) {
    if (!(await confirmDialog(`${value ? "Give" : "Remove"} "${ptype}" permission ${value ? "to" : "from"} ${row.role} on ${loaded}?`))) return;
    const key = `${row.role}-${row.permlevel}-${ptype}`;
    setBusy(key);
    setError("");
    try {
      await frappe.callMethod(`${PM}.update`, { doctype: loaded, role: row.role, permlevel: row.permlevel, ptype, value: value ? 1 : 0, if_owner: Number(row.if_owner) || 0 });
      await load(loaded);
    } catch (e) {
      setError(errMsg(e, "The change was refused."));
      setBusy("");
    }
  }

  async function addRole(role) {
    if (!(await confirmDialog(`Give ${role} access to ${loaded}?`))) return;
    setBusy("add");
    setError("");
    try {
      await frappe.callMethod(`${PM}.add`, { parent: loaded, role, permlevel: 0 });
      await load(loaded);
    } catch (e) {
      setError(errMsg(e, "Couldn't add the role."));
      setBusy("");
    }
  }

  const missingRoles = ROLES.filter((r) => !rows.some((x) => x.role === r && Number(x.permlevel) === 0));

  return (
    <Section title="Permission editor" hint="Advanced: view and change permissions of HR Manager, HR User and Employee on any doctype (for example Leave Application).">
      <form data-no-preview onSubmit={(e) => { e.preventDefault(); load(); }} className="mb-4 flex gap-2">
        <input value={doctype} onChange={(e) => setDoctype(e.target.value)} placeholder="Doctype name, e.g. Leave Application" className="w-full max-w-sm rounded-md border border-[var(--color-border-strong)] bg-[var(--color-surface-2)] px-3 py-2 text-[13px] text-[var(--color-text)] placeholder:text-[var(--color-text-faint)] outline-none focus:border-[var(--color-red)]" />
        <Button type="submit" variant="secondary" disabled={busy === "load"}>{busy === "load" ? "Loading…" : "Load"}</Button>
      </form>
      {error && <p className="mb-3 text-[12px] text-[var(--color-red-hover)]">{error}</p>}
      {loaded && (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[12.5px]">
              <thead><tr className="border-b border-[var(--color-border)] text-[var(--color-text-muted)]"><th className="px-3 py-2 font-medium">Role</th><th className="px-2 py-2 font-medium">Level</th>{FLAGS.map((f) => <th key={f} className="px-2 py-2 text-center font-medium capitalize">{f}</th>)}</tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={`${r.role}-${r.permlevel}-${r.if_owner}`} className="border-b border-[var(--color-border)] last:border-0">
                    <td className="px-3 py-2 text-[var(--color-text)]">{r.role}{Number(r.if_owner) ? <span className="ml-2 text-[10px] text-[var(--color-text-faint)]">own records only</span> : null}</td>
                    <td className="px-2 py-2 text-[var(--color-text-muted)]">{r.permlevel}</td>
                    {FLAGS.map((f) => (
                      <td key={f} className="px-2 py-2 text-center"><input type="checkbox" checked={Number(r[f]) === 1} disabled={busy !== ""} onChange={(e) => toggle(r, f, e.target.checked)} /></td>
                    ))}
                  </tr>
                ))}
                {rows.length === 0 && <tr><td colSpan={FLAGS.length + 2} className="px-3 py-4 text-[var(--color-text-muted)]">None of these roles has access to {loaded} yet.</td></tr>}
              </tbody>
            </table>
          </div>
          {missingRoles.length > 0 && <div className="mt-4 flex flex-wrap items-center gap-2 text-[12px] text-[var(--color-text-muted)]">Add access for: {missingRoles.map((r) => <button key={r} type="button" disabled={busy !== ""} onClick={() => addRole(r)} className="flex items-center gap-1 rounded-md border border-[var(--color-border)] px-2.5 py-1 hover:text-[var(--color-text)]"><Plus size={12} /> {r}</button>)}</div>}
        </>
      )}
    </Section>
  );
}

/* ------------------------------- account checker ------------------------------- */

/** Why does this account still get "not permitted"? Shows its roles and which needed permissions they cover. */
function AccountCheck() {
  const [email, setEmail] = useState("");
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function check(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setResult(null);
    try {
      const user = await frappe.getDoc("User", email.trim());
      const roles = (user.roles || []).map((r) => r.role);
      const isHr = roles.some((r) => r === "HR Manager" || r === "HR User");
      const base = isHr ? HR_PRESET : roles.includes("Projects Manager") ? PM_PRESET : roles.includes("Employee") ? PRESETS.Employee : [];
      const wanted = roles.includes("Interviewer") && !isHr ? [...base, ...INTERVIEWER_PRESET] : base;
      const lines = await Promise.all(wanted.map(async (p) => {
        const rows = await getPerms(p.doctype);
        return { ...p, missing: missingFlags(rows, roles, p.perms, p.permlevel ?? 0) };
      }));
      setResult({ roles, isHr, lines, enabled: Boolean(user.enabled) });
    } catch (x) {
      setError(errMsg(x, "Couldn't find that user."));
    }
    setBusy(false);
  }

  return (
    <Section title="Check an account" hint="Enter an HR or employee login email to see its roles and which required permissions those roles are missing.">
      <form data-no-preview onSubmit={check} className="flex gap-2">
        <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@company.com" className="w-full max-w-sm rounded-md border border-[var(--color-border-strong)] bg-[var(--color-surface-2)] px-3 py-2 text-[13px] text-[var(--color-text)] placeholder:text-[var(--color-text-faint)] outline-none focus:border-[var(--color-red)]" />
        <Button type="submit" variant="secondary" disabled={busy}>{busy ? "Checking…" : "Check"}</Button>
      </form>
      {error && <p className="mt-3 text-[12px] text-[var(--color-red-hover)]">{error}</p>}
      {result && (
        <div className="mt-4 space-y-3 text-[13px]">
          <p className="text-[var(--color-text-muted)]">Roles: {result.roles.length ? <b className="text-[var(--color-text)]">{result.roles.join(", ")}</b> : "none"}{!result.enabled && <span className="ml-2 text-[var(--color-amber)]">(account is disabled)</span>}</p>
          {!result.isHr && !result.roles.includes("Employee") && <p className="text-[var(--color-amber)]">This account has neither an HR role (HR Manager / HR User) nor the Employee role, so it has no HR or employee permissions at all.</p>}
          {result.lines.length > 0 && (
            <ul className="divide-y divide-[var(--color-border)]">
              {result.lines.map((l) => (
                <li key={`${l.doctype}-${l.permlevel ?? 0}`} className="flex items-center justify-between gap-3 py-2">
                  <span className="text-[var(--color-text)]">{l.doctype}{l.permlevel ? ` (level ${l.permlevel})` : ""} <span className="text-[var(--color-text-faint)]">{l.perms.join(", ")}</span></span>
                  {l.missing.length ? <span className="text-[12px] text-[var(--color-amber)]">Missing: {l.missing.join(", ")}</span> : <span className="flex items-center gap-1 text-[12px] text-[var(--color-green)]"><Check size={14} /> Covered</span>}
                </li>
              ))}
            </ul>
          )}
          {result.lines.some((l) => l.missing.length) && <p className="text-[12px] text-[var(--color-text-muted)]">Apply the missing permissions to the role(s) this account holds in <b>Required permissions</b> above - each role has its own tab.</p>}
        </div>
      )}
    </Section>
  );
}