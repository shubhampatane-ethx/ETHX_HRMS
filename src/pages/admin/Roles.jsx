import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Check, Loader2, Plus, RefreshCw, ShieldCheck, Wand2 } from "lucide-react";
import { frappe } from "../../lib/api/frappeClient";
import { errMsg } from "../../lib/employeePortal";
import { Button, Card } from "../../components/ui/primitives";

/**
 * Admin-only editor for the ERPNext role permissions that the HR and Employee workspaces rely on.
 * It uses ERPNext's own Role Permissions Manager methods, which copy the standard permissions into
 * Custom DocPerm first - so granting one permission never wipes the others.
 */
const PM = "frappe.core.page.permission_manager.permission_manager";
const ROLES = ["HR Manager", "HR User", "Projects Manager", "Employee"];
const FLAGS = ["read", "write", "create", "delete", "submit", "cancel", "amend", "report", "export", "share", "print", "email"];

// Everything HR needs to add an employee AND give them a login in one go. Each line below was a
// real permission check ERPNext performs along that path, so granting them all avoids one error at a time.
const HR_PRESET = [
  { doctype: "User", perms: ["read", "write", "create"], why: "Create the employee's login and reset passwords", elevated: true },
  { doctype: "User", permlevel: 1, perms: ["read", "write"], why: "Set the login's role and type (protected fields on User)", elevated: true },
  { doctype: "User Permission", perms: ["read", "write", "create"], why: "Linking a login to an employee restricts it to that employee and company", elevated: true },
  { doctype: "Employee", perms: ["read", "write", "create"], why: "Add and edit employees" },
  { doctype: "Timesheet", perms: ["read", "write", "create", "submit", "cancel", "amend"], why: "Review timesheets: approve, or return for correction (cancels and creates an editable copy)" },
  { doctype: "Comment", perms: ["read", "create"], why: "Timesheet approvals and return notes are stored as comments" },
  { doctype: "Company", perms: ["read"], why: "Pick the company for an employee" },
  { doctype: "Department", perms: ["read"], why: "Pick the department" },
  { doctype: "Designation", perms: ["read"], why: "Pick the designation" },
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
];
const PRESETS = {
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
    { doctype: "Activity Type", perms: ["read"], why: "Timesheet activity (kept on entries created in ERPNext desk)" },
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

async function loadItems(role) {
  return Promise.all(PRESETS[role].map(async (p) => {
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
      setMsg({ ok: false, text: errMsg(e, "ERPNext refused a change. You must be signed in as Administrator.") });
    }
    setBusy(false);
  }
  return (
    <div className="mt-4 flex flex-wrap items-center gap-3">
      <Button onClick={run} disabled={busy}>{busy ? <Loader2 size={14} className="animate-spin" /> : <Wand2 size={14} />} Apply everything for HR Manager, HR User and Employee</Button>
      {msg && <span className={`text-[12px] ${msg.ok ? "text-[var(--color-green)]" : "text-[var(--color-red-hover)]"}`}>{msg.text}</span>}
    </div>
  );
}

export default function Roles() {
  return (
    <div className="space-y-5">
      <Card className="p-5">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[var(--color-red-wash)] text-[var(--color-red-hover)]"><ShieldCheck size={18} /></span>
          <div>
            <h2 className="text-[15px] font-semibold text-[var(--color-text)]">Roles & Permissions</h2>
            <p className="mt-1 text-[13px] text-[var(--color-text-muted)]">Decide what HR and Employee accounts are allowed to do in ERPNext. One click below grants everything the HR and Employee workspaces need, so you don't hit permission errors one at a time.</p>
            <ApplyEverything />
          </div>
        </div>
      </Card>
      <RequiredPermissions />
      <AccountCheck />
      <EmployeeRestrictions />
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
    setBusy(true);
    setMsg(null);
    try {
      for (const item of todo) await applyItem(role, item);
      setMsg({ ok: true, text: `Permissions applied for ${role}. Ask the user to sign out and back in.` });
    } catch (e) {
      setMsg({ ok: false, text: errMsg(e, "ERPNext refused the change. You must be signed in as Administrator.") });
    } finally {
      setBusy(false);
      load();
    }
  }

  return (
    <Section title="Required permissions" hint="The permissions each role needs for the app to work. Only missing permissions are added - existing ones are never removed."
      action={<Button onClick={applyAll} disabled={busy || !todo.length}>{busy ? <Loader2 size={14} className="animate-spin" /> : <Wand2 size={14} />} {todo.length ? `Apply ${todo.length} missing` : "All set"}</Button>}>
      <div className="mb-4 flex flex-wrap gap-2">{ROLES.map((r) => <button key={r} type="button" onClick={() => setRole(r)} className={chip(role === r)}>{r}</button>)}</div>

      {!items ? <p className="flex items-center gap-2 py-6 text-[13px] text-[var(--color-text-muted)]"><Loader2 size={14} className="animate-spin" /> Checking ERPNext…</p> : (
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
    frappe.getList("Has Role", { filters: [["parent", "in", users], ["parenttype", "=", "User"], ["role", "in", ["HR Manager", "HR User", "System Manager"]]], fields: ["parent"], limit: 0 }),
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
    setBusy(true);
    setError("");
    try { for (const e of list) await restrict(e); } catch (e) { setError(errMsg(e, "Couldn't create the restriction.")); }
    setBusy(false);
    load();
  }

  return (
    <Section title="Employee record restrictions" hint="Employee logins should only see their own record and company. ERPNext does this with User Permissions, which HR may not be allowed to create - fix any gaps here."
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
    const key = `${row.role}-${row.permlevel}-${ptype}`;
    setBusy(key);
    setError("");
    try {
      await frappe.callMethod(`${PM}.update`, { doctype: loaded, role: row.role, permlevel: row.permlevel, ptype, value: value ? 1 : 0, if_owner: Number(row.if_owner) || 0 });
      await load(loaded);
    } catch (e) {
      setError(errMsg(e, "ERPNext refused the change."));
      setBusy("");
    }
  }

  async function addRole(role) {
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
      <form onSubmit={(e) => { e.preventDefault(); load(); }} className="mb-4 flex gap-2">
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
      const wanted = isHr ? HR_PRESET : roles.includes("Projects Manager") ? PM_PRESET : roles.includes("Employee") ? PRESETS.Employee : [];
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
      <form onSubmit={check} className="flex gap-2">
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