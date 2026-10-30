import { useEffect, useMemo, useState } from "react";
import { Check, Copy, Edit3, HardHat, KeyRound, Plus, RefreshCw, Trash2, Users, X } from "lucide-react";
import { frappe } from "../../lib/api/frappeClient";
import { dmy, dmyHm, errMsg, getMyDocuments, useAsync } from "../../lib/employeePortal";
import { HrRecordForm } from "../../components/hr/HrRecordForm";
import { Button, Card, DateField, LinkField, Table } from "../../components/ui/primitives";
import { Field, inputCls, Modal, Notice } from "../../components/employee/EmployeeShell";
import { createContractor } from "../../lib/contractors";
import { listAssignments, parseAssignment } from "../../lib/assignments";
import { alertDialog, confirmDialog } from "../../components/ui/dialogs";

const FIELDS = [
  // ERPNext builds the full name (employee_name) from first / middle / last name; these three plus gender and date
  // of birth are mandatory on Employee.
  { name: "first_name", label: "First Name", required: true },
  { name: "last_name", label: "Last Name" },
  { name: "gender", label: "Gender", type: "link", linkDoctype: "Gender", required: true },
  { name: "date_of_birth", label: "Date of Birth", type: "date", required: true },
  { name: "date_of_joining", label: "Date of Joining", type: "date", required: true },
  { name: "status", label: "Status", type: "select", options: ["Active", "Inactive", "Suspended", "Left"] },
  { name: "company", label: "Company", type: "link", linkDoctype: "Company", required: true },
  // The office decides the employee's holiday list (set automatically by the Office Locations rule).
  { name: "branch", label: "Office Location", type: "link", linkDoctype: "Branch" },
  { name: "employee_number", label: "Employee Code", type: "text" },
  { name: "department", label: "Department", type: "link", linkDoctype: "Department" },
  { name: "designation", label: "Designation", type: "link", linkDoctype: "Designation" },
  { name: "employment_type", label: "Employment Type", type: "link", linkDoctype: "Employment Type" },
  { name: "user_id", label: "User Account", type: "link", linkDoctype: "User" },
  { name: "health_insurance_provider", label: "Health Insurance Provider", type: "link", linkDoctype: "Employee Health Insurance" },
  { name: "health_insurance_no", label: "Health Insurance Number" },
];

const LIST_FIELDS = ["name", "employee_name", "first_name", "last_name", "department", "designation", "status", "company", "date_of_joining", "user_id", "company_email", "personal_email", "custom_is_contractor"];
const LIST_FALLBACK = ["name", "employee_name", "department", "designation", "status", "company", "date_of_joining", "user_id"];
const PASSWORD_KEY = "hrms:defaultEmployeePassword";

/**
 * Give an employee a sign-in: an ERPNext User (email + the password HR chose) holding the
 * Employee role, linked to the Employee record through User ID. The employee is asked to
 * set their own password the first time they sign in (see the employee portal).
 */
/** Run one step and remember its name, so an error can say exactly what ERPNext refused. */
async function step(label, fn) {
  try {
    return await fn();
  } catch (e) {
    e.step = label;
    throw e;
  }
}

const methodMissing = (e) => e?.response?.status === 404 || /not found|not whitelisted|has no attribute|Failed to get method|No module named/i.test(String(e?.response?.data?.exception || ""));

/**
 * Preferred path: the server method installed by Admin › ERPNext Setup. It can only create or reset plain employee
 * logins (never HR or admin accounts) and always restricts them to the employee's own record and company - so HR
 * doesn't need rights over User or User Permission at all. Falls back to the older browser-side steps.
 */
async function createEmployeeLogin({ employee, email, password }) {
  try {
    return await step("Creating the login", () => frappe.callMethod("ethx_employee_login", { employee: employee.name, email, password, mode: "create" }));
  } catch (e) {
    if (!methodMissing(e)) throw e;
  }
  return createEmployeeLoginLegacy({ employee, email, password });
}

async function createEmployeeLoginLegacy({ employee, email, password }) {
  let existing = null;
  try { existing = await frappe.getDoc("User", email); } catch { /* not found */ }

  if (existing) {
    const held = (existing.roles || []).map((r) => r.role);
    if (held.some((r) => ["HR Manager", "HR User", "System Manager"].includes(r))) {
      throw new Error("That email already belongs to an HR/admin account. Use a different email for this employee.");
    }
    await step("Updating the existing user", () => frappe.updateDoc("User", email, { new_password: password, enabled: 1, last_password_reset_date: null }));
  } else {
    const first = employee.first_name || (employee.employee_name || "").split(" ")[0];
    const last = employee.last_name || (employee.employee_name || "").split(" ").slice(1).join(" ");
    await step("Creating the user", () => frappe.createDoc("User", { email, first_name: first, ...(last ? { last_name: last } : {}), enabled: 1, user_type: "System User", send_welcome_email: 0, new_password: password }));
  }

  // Linking the employee makes ERPNext add the Employee role itself, so a refusal here is not fatal.
  try {
    const doc = existing || (await frappe.getDoc("User", email));
    const roles = new Set((doc.roles || []).map((r) => r.role));
    roles.add("Employee");
    await frappe.updateDoc("User", email, { roles: [...roles].map((role) => ({ role })) });
  } catch { /* handled by the Employee link below */ }

  // ERPNext restricts the login to this employee/company by creating User Permissions. If HR may not
  // create those, link without them instead of failing - the Administrator can restrict it afterwards.
  try {
    await step("Linking the user to the employee", () => frappe.updateDoc("Employee", employee.name, { user_id: email, create_user_permission: 1 }));
    return { restricted: true };
  } catch (e) {
    const text = `${e?.response?.data?._server_messages || ""}${e?.response?.data?.exception || ""}`;
    if (e?.response?.data?.exc_type === "PermissionError" && /User Permission/i.test(text)) {
      await step("Linking the user to the employee", () => frappe.updateDoc("Employee", employee.name, { user_id: email, create_user_permission: 0 }));
      return { restricted: false };
    }
    throw e;
  }
}

/** HR sets a new temporary password; the employee must change it again at next sign-in. */
async function resetEmployeePassword({ employee, email, password }) {
  try {
    return await step("Resetting the password", () => frappe.callMethod("ethx_employee_login", { employee: employee.name, password, mode: "reset" }));
  } catch (e) {
    if (!methodMissing(e)) throw e;
  }
  await step("Resetting the password", () => frappe.updateDoc("User", email, { new_password: password, last_password_reset_date: null }));
}

async function setLoginEnabled(employee, enable) {
  return step(enable ? "Enabling the login" : "Disabling the login", () => frappe.callMethod("ethx_employee_login_access", { employee: employee.name, enable: enable ? 1 : 0 }));
}

function loginError(e) {
  if (!e?.response) return e?.message || "Something went wrong.";
  const detail = errMsg(e, e.response.data?.exc_type || `HTTP ${e.response.status}`);
  const where = e.step ? `${e.step} failed. ` : "";
  const hint = e.response.data?.exc_type === "PermissionError" ? " Ask the Administrator to check this HR role in Admin > Roles & Permissions (use \"Check an account\")." : "";
  return `${where}${detail}.${hint}`;
}

/** Every employee, or with `contractorsOnly` just the contractors and the projects they're on. */
export default function Employees({ contractorsOnly = false }) {
  const [employees, setEmployees] = useState([]);
  const assignments = useAsync(() => (contractorsOnly ? listAssignments() : Promise.resolve([])), [contractorsOnly]);
  const projectsOf = useMemo(() => {
    const map = {};
    for (const a of (assignments.data || []).map(parseAssignment)) {
      if (["Completed", "Cancelled"].includes(a.status)) continue;
      for (const email of a.assignees) (map[email] ||= []).push(a.subject || `${a.role} - ${a.project}`);
    }
    return map;
  }, [assignments.data]);
  const [state, setState] = useState("loading");
  const [editing, setEditing] = useState(null);
  const [formOpen, setFormOpen] = useState(false);
  const [loginFor, setLoginFor] = useState(null);
  const [addingContractor, setAddingContractor] = useState(false);
  const [detail, setDetail] = useState(null);

  async function load() {
    setState("loading");
    try {
      const opts = { limit: 100, orderBy: "creation desc" };
      // Before setup has run there's no contractor field, so there are simply no contractors to list.
      const records = contractorsOnly
        ? await frappe.getList("Employee", { ...opts, fields: LIST_FIELDS, filters: [["custom_is_contractor", "=", 1], ["custom_contractor_removed", "=", 0]] }).catch(() => [])
        : await frappe.getList("Employee", { ...opts, fields: LIST_FIELDS }).catch(() => frappe.getList("Employee", { ...opts, fields: LIST_FALLBACK }));
      setEmployees(records);
      setState("ready");
    } catch {
      setEmployees([]);
      setState("error");
    }
  }

  useEffect(() => { load(); }, [contractorsOnly]);

  async function removeEmployee(employee) {
    if (!(await confirmDialog(`Delete ${employee.employee_name || employee.name}? This cannot be undone.`))) return;
    try {
      await frappe.deleteDoc("Employee", employee.name);
      load();
    } catch (error) {
      alertDialog({ tone: "error", message: errMsg(error, "Couldn't delete this employee.") });
    }
  }

  function closeForm() {
    setFormOpen(false);
    setEditing(null);
  }

  return (
    <div className="space-y-5">
      <section className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-6 py-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="mb-2 flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--color-red-hover)]"><Users size={14} /> People operations</div>
            <h2 className="text-lg font-semibold text-[var(--color-text)]">{contractorsOnly ? "Contractors" : "Employees"}</h2>
            <p className="mt-1 text-[13px] text-[var(--color-text-muted)]">{contractorsOnly ? "People who work on projects but aren't staff. Give them a role on a project under Assignments." : "Create and maintain employee records, and give each employee a sign-in for the employee portal."}</p>
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={load} disabled={state === "loading"}><RefreshCw size={14} className={state === "loading" ? "animate-spin" : ""} /> Refresh</Button>
            {!contractorsOnly && <Button onClick={() => { setEditing(null); setFormOpen(true); }}><Plus size={14} /> Add Employee</Button>}
            <Button variant={contractorsOnly ? "primary" : "secondary"} onClick={() => setAddingContractor(true)}><HardHat size={14} /> Add Contractor</Button>
          </div>
        </div>
      </section>

      {formOpen && <HrRecordForm doctype="Employee" fields={FIELDS} recordName={editing} onCancel={closeForm} onSaved={() => { closeForm(); load(); }} />}

      <Card className="overflow-hidden">
        {state === "loading" && <div className="flex h-40 items-center justify-center text-[13px] text-[var(--color-text-muted)]">Loading employees...</div>}
        {state === "error" && <div className="p-6 text-[13px] text-[var(--color-text-muted)]">Could not load employee records. Check your permissions and connection.</div>}
        {state === "ready" && <Table columns={[
          { key: "employee_name", label: "Name", render: (row) => <button type="button" onClick={() => setDetail(row)} className="text-left text-[var(--color-text)] hover:text-[var(--color-red-hover)] hover:underline">{row.employee_name || row.name}</button> },
          ...(contractorsOnly ? [
            { key: "user_id", label: "Email" },
            { key: "_projects", label: "Projects and Roles", render: (row) => (projectsOf[row.user_id] || []).join(", ") || "—" },
          ] : [
            { key: "department", label: "Department" },
            { key: "designation", label: "Designation" },
          ]),
          { key: "company", label: "Company" },
          { key: "status", label: "Status", render: (row) => <span className={row.status === "Active" ? "text-[var(--color-green)]" : "text-[var(--color-text-muted)]"}>{row.status || "-"}{Number(row.custom_is_contractor) ? " · Contractor" : ""}</span> },
          { key: "user_id", label: "Portal Login", render: (row) => row.user_id
            ? <span className="text-[var(--color-green)]" title={row.user_id}>Active</span>
            : <span className="text-[var(--color-amber)]">No login</span> },
          { key: "_actions", label: "", render: (row) => <div className="flex justify-end gap-1">
            <button type="button" title={row.user_id ? "Reset password" : "Create login"} onClick={() => setLoginFor(row)} className="rounded p-1.5 text-[var(--color-text-muted)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text)]"><KeyRound size={14} /></button>
            <button type="button" title="Edit employee" onClick={() => { setEditing(row.name); setFormOpen(true); }} className="rounded p-1.5 text-[var(--color-text-muted)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text)]"><Edit3 size={14} /></button>
            <button type="button" title="Delete employee" onClick={() => removeEmployee(row)} className="rounded p-1.5 text-[var(--color-text-muted)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-red-hover)]"><Trash2 size={14} /></button>
          </div> },
        ]} rows={employees} emptyLabel={contractorsOnly ? "No contractors yet." : "No employees found."} />}
      </Card>

      {detail && <EmployeeDetail employee={detail} onClose={() => setDetail(null)} onEdit={() => { setEditing(detail.name); setFormOpen(true); setDetail(null); window.scrollTo?.({ top: 0 }); }} onLogin={() => { setLoginFor(detail); setDetail(null); }} />}
      {loginFor && <LoginModal employee={loginFor} onClose={() => setLoginFor(null)} onDone={load} />}
      {addingContractor && <ContractorModal onClose={() => setAddingContractor(false)} onSaved={() => { setAddingContractor(false); load(); }} />}
    </div>
  );
}

function LoginModal({ employee, onClose, onDone }) {
  const reset = Boolean(employee.user_id);
  const [email, setEmail] = useState(employee.user_id || employee.company_email || employee.personal_email || "");
  const [password, setPassword] = useState(() => { try { return localStorage.getItem(PASSWORD_KEY) || ""; } catch { return ""; } });
  const [remember, setRemember] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [copied, setCopied] = useState(false);
  const [unrestricted, setUnrestricted] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (reset) await resetEmployeePassword({ employee, email, password });
      else setUnrestricted((await createEmployeeLogin({ employee, email: email.trim(), password })).restricted === false);
      try { if (remember) localStorage.setItem(PASSWORD_KEY, password); } catch { /* ignore */ }
      setDone(true);
      onDone();
    } catch (err) {
      setError(loginError(err));
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(`Email: ${email}\nPassword: ${password}`);
      setCopied(true);
    } catch { /* ignore */ }
  }

  const inputCls = "w-full rounded-md border border-[var(--color-border-strong)] bg-[var(--color-surface-2)] px-3 py-2 text-[13px] text-[var(--color-text)] outline-none focus:border-[var(--color-red)]";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
      <div className="w-full max-w-md rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
        <h2 className="text-[14px] font-semibold text-[var(--color-text)]">{reset ? "Reset password" : "Create login"} - {employee.employee_name}</h2>

        {done ? (
          <div className="mt-4 space-y-3">
            <p className="text-[13px] text-[var(--color-text-muted)]">{reset ? "Password reset." : "Login created."} Share these details with the employee. They'll be asked to choose their own password the first time they sign in.</p>
            {unrestricted && <p className="rounded-md border border-[var(--color-border-strong)] bg-[var(--color-surface-2)] px-3 py-2 text-[12px] text-[var(--color-amber)]">This login isn't restricted to the employee's own record yet. Ask the Administrator to open Roles & Permissions → Employee record restrictions and click Restrict.</p>}
            <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] p-3 text-[13px] text-[var(--color-text)]">
              <p><span className="text-[var(--color-text-muted)]">Email:</span> {email}</p>
              <p><span className="text-[var(--color-text-muted)]">Temporary password:</span> {password}</p>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={copy}>{copied ? <Check size={14} /> : <Copy size={14} />} {copied ? "Copied" : "Copy"}</Button>
              <Button onClick={onClose}>Done</Button>
            </div>
          </div>
        ) : (
          <form onSubmit={submit} className="mt-4 space-y-3">
            <label className="block">
              <span className="mb-1.5 block text-[12px] text-[var(--color-text-muted)]">Login Email</span>
              <input type="email" required readOnly={reset} className={`${inputCls} ${reset ? "opacity-70" : ""}`} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@company.com" />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-[12px] text-[var(--color-text-muted)]">Temporary Password</span>
              <input type="text" required minLength={8} autoComplete="off" className={inputCls} value={password} onChange={(e) => setPassword(e.target.value)} />
              <span className="mt-1 block text-[11px] text-[var(--color-text-faint)]">At least 8 characters with a mix of letters, numbers and symbols.</span>
            </label>
            <label className="flex items-center gap-2 text-[12px] text-[var(--color-text-muted)]"><input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} /> Use this as the default password on this browser</label>
            {error && <p className="rounded-md border border-[var(--color-red-deep)] bg-[var(--color-red-wash)] px-3 py-2 text-[12px] text-[var(--color-red-hover)]">{error}</p>}
            <div className="flex justify-end gap-2 pt-1">
              {reset && <Button type="button" variant="ghost" className="mr-auto" disabled={busy} onClick={async () => {
                if (!(await confirmDialog(`Disable ${employee.employee_name}'s portal login? They won't be able to sign in until it's enabled again.`))) return;
                setBusy(true); setError("");
                try { await setLoginEnabled(employee, false); onDone(); onClose(); } catch (err) { setError(methodMissing(err) ? "Disabling logins needs Admin › System Setup to be run first." : loginError(err)); setBusy(false); }
              }}>Disable login</Button>}
              <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
              <Button type="submit" disabled={busy}>{busy ? "Working…" : reset ? "Reset Password" : "Create Login"}</Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

/* ----------------------------- full employee details ----------------------------- */

const SKIP = new Set(["name", "owner", "creation", "modified", "modified_by", "docstatus", "idx", "doctype", "naming_series", "amended_from", "lft", "rgt", "old_parent", "image", "parent", "parentfield", "parenttype", "unsaved"]);
const GROUPS = [
  ["Employment", ["employee", "employee_name", "first_name", "middle_name", "last_name", "company", "department", "designation", "branch", "grade", "employment_type", "status", "date_of_joining", "scheduled_confirmation_date", "final_confirmation_date", "contract_end_date", "notice_number_of_days", "date_of_retirement", "relieving_date", "reason_for_leaving", "reports_to", "leave_policy", "holiday_list", "default_shift", "attendance_device_id", "expense_approver", "leave_approver", "shift_request_approver", "payroll_cost_center", "cost_center", "ctc", "salary_currency", "salary_mode", "bank_name", "bank_ac_no", "iban"]],
  ["Personal", ["salutation", "gender", "date_of_birth", "blood_group", "marital_status", "family_background", "health_details", "bio"]],
  ["Contact", ["cell_number", "personal_email", "company_email", "prefered_contact_email", "prefered_email", "current_address", "current_accommodation_type", "permanent_address", "permanent_accommodation_type"]],
  ["Emergency contact", ["person_to_be_contacted", "relation", "emergency_phone_number"]],
  ["Documents & insurance", ["passport_number", "valid_upto", "date_of_issue", "place_of_issue", "health_insurance_provider", "health_insurance_no"]],
  ["Sign-in", ["user_id", "create_user_permission"]],
];
const pretty = (k) => k.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
function show(v) {
  if (v === 1 || v === "1") return "Yes";
  if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v)) return v.length > 10 ? dmyHm(v) : dmy(v);
  return String(v).replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}
const filled = (v) => v !== null && v !== undefined && v !== "" && v !== 0 && v !== "0" && typeof v !== "object";

function EmployeeDetail({ employee, onClose, onEdit, onLogin }) {
  const q = useAsync(async () => {
    const doc = await frappe.getDoc("Employee", employee.name);
    let login = null;
    if (doc.user_id) { try { login = await frappe.getDoc("User", doc.user_id); } catch { /* HR may not be allowed to read users */ } }
    return { doc, login };
  }, [employee.name]);
  const doc = q.data?.doc;
  const login = q.data?.login;

  const used = new Set();
  const groups = doc ? GROUPS.map(([title, keys]) => {
    const rows = keys.filter((k) => filled(doc[k])).map((k) => { used.add(k); return [pretty(k), show(doc[k])]; });
    return [title, rows];
  }) : [];
  const other = doc ? Object.keys(doc).filter((k) => !used.has(k) && !SKIP.has(k) && filled(doc[k])).map((k) => [pretty(k), show(doc[k])]) : [];
  const tables = doc ? Object.keys(doc).filter((k) => Array.isArray(doc[k]) && doc[k].length) : [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-[15px] font-semibold text-[var(--color-text)]">{employee.employee_name || employee.name}</h2>
            <p className="mt-0.5 text-[12px] text-[var(--color-text-muted)]">{employee.name}{employee.designation ? ` · ${employee.designation}` : ""}{employee.company ? ` · ${employee.company}` : ""}</p>
          </div>
          <button type="button" onClick={onClose} className="text-[var(--color-text-muted)] hover:text-[var(--color-text)]"><X size={16} /></button>
        </div>

        {q.loading && !doc && <p className="py-8 text-center text-[13px] text-[var(--color-text-muted)]">Loading details…</p>}
        {q.error && <p className="text-[13px] text-[var(--color-red-hover)]">{errMsg(q.error, "Couldn't load this employee.")}</p>}

        {doc && (
          <div className="space-y-5">
            {[...groups, ...(other.length ? [["Other details", other]] : [])].filter(([, rows]) => rows.length).map(([title, rows]) => (
              <section key={title}>
                <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">{title}</h3>
                <dl className="grid grid-cols-1 gap-x-8 gap-y-2.5 sm:grid-cols-2">
                  {rows.map(([k, v]) => <div key={k}><dt className="text-[11px] text-[var(--color-text-faint)]">{k}</dt><dd className="text-[13px] text-[var(--color-text)]">{v}</dd></div>)}
                </dl>
              </section>
            ))}

            {doc.user_id && (
              <section>
                <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">Portal Login</h3>
                {login ? (
                  <dl className="grid grid-cols-1 gap-x-8 gap-y-2.5 sm:grid-cols-2">
                    {[["Account", login.enabled ? "Enabled" : "Disabled"], ["Last login", dmyHm(login.last_login) || "Never"], ["Last active", dmyHm(login.last_active) || "—"], ["Roles", (login.roles || []).map((r) => r.role).join(", ") || "—"]].map(([k, v]) => <div key={k}><dt className="text-[11px] text-[var(--color-text-faint)]">{k}</dt><dd className="text-[13px] text-[var(--color-text)]">{v}</dd></div>)}
                  </dl>
                ) : <p className="text-[12px] text-[var(--color-text-muted)]">Login details aren't visible to your account.</p>}
              </section>
            )}

            {tables.map((k) => {
              const cols = [...new Set(doc[k].flatMap((r) => Object.keys(r)))].filter((c) => !SKIP.has(c) && doc[k].some((r) => filled(r[c]))).slice(0, 6);
              return (
                <section key={k}>
                  <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">{pretty(k)}</h3>
                  <div className="overflow-x-auto rounded-md border border-[var(--color-border)]">
                    <table className="w-full text-left text-[12px]">
                      <thead><tr className="border-b border-[var(--color-border)] text-[var(--color-text-muted)]">{cols.map((c) => <th key={c} className="px-3 py-1.5 font-medium">{pretty(c)}</th>)}</tr></thead>
                      <tbody>{doc[k].map((r, i) => <tr key={r.name || i} className="border-b border-[var(--color-border)] last:border-0">{cols.map((c) => <td key={c} className="px-3 py-1.5 text-[var(--color-text)]">{filled(r[c]) ? show(r[c]) : "—"}</td>)}</tr>)}</tbody>
                    </table>
                  </div>
                </section>
              );
            })}
            <p className="text-[11px] text-[var(--color-text-faint)]">Created {dmyHm(doc.creation)} by {doc.owner} · last changed {dmyHm(doc.modified)} by {doc.modified_by}</p>
          </div>
        )}

        <EmployeeFiles employee={employee} />
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" onClick={onLogin}><KeyRound size={14} /> {employee.user_id ? "Reset Password" : "Create Login"}</Button>
          <Button onClick={onEdit}><Edit3 size={14} /> Edit Employee</Button>
        </div>
      </div>
    </div>
  );
}

/** A contractor is created here by HR, then the Administrator or a Project Manager assigns them a role under Assignments. */
function ContractorModal({ onClose, onSaved }) {
  const [f, setF] = useState({ name: "", email: "", password: "", company: "", branch: "", joining: new Date().toISOString().slice(0, 10) });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setErr("");
    try {
      await createContractor({ fullName: f.name.trim(), email: f.email.trim(), password: f.password, company: f.company, branch: f.branch, joining: f.joining });
      onSaved();
    } catch (x) {
      setErr(errMsg(x, "Couldn't create the contractor."));
      setBusy(false);
    }
  }

  return (
    <Modal title="Add Contractor" onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <Field label="Full Name"><input required className={inputCls} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        <Field label="Email (Their Login)"><input required type="email" className={inputCls} value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
        <Field label="Temporary Password" hint="They must change it at first sign-in."><input required type="password" autoComplete="new-password" minLength={8} className={inputCls} value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} /></Field>
        <LinkField label="Company" linkDoctype="Company" value={f.company} onChange={(v) => setF({ ...f, company: v })} required frappe={frappe} />
        <LinkField label="Office Location (Optional)" linkDoctype="Branch" value={f.branch} onChange={(v) => setF({ ...f, branch: v })} frappe={frappe} />
        <DateField label="Start Date" value={f.joining} onChange={(v) => setF({ ...f, joining: v })} required />
        <p className="text-[11px] text-[var(--color-text-faint)]">Next, the Administrator or a Project Manager gives them a role on a project under Assignments. They sign in to see only their projects and timesheet.</p>
        {err && <Notice>{err}</Notice>}
        <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={onClose}>Cancel</Button><Button type="submit" disabled={busy}>{busy ? "Creating…" : "Create Contractor"}</Button></div>
      </form>
    </Modal>
  );
}

/** Documents on the employee's record: what they uploaded (PAN, Aadhaar, bank) and what HR attached. */
function EmployeeFiles({ employee }) {
  const files = useAsync(() => getMyDocuments(employee.name), [employee.name]);
  if (!files.data?.length) return null;
  return (
    <section className="mt-4">
      <h3 className="mb-2 text-[13px] font-semibold text-[var(--color-text)]">Documents</h3>
      <ul className="divide-y divide-[var(--color-border)] rounded-lg border border-[var(--color-border)]">
        {files.data.map((d) => (
          <li key={d.name} className="flex items-center justify-between gap-3 px-3 py-2 text-[12.5px]">
            <span className="min-w-0 truncate text-[var(--color-text)]">{d.file_name}</span>
            <a href={d.file_url} target="_blank" rel="noreferrer" className="shrink-0 text-[var(--color-red-hover)] hover:underline">Open</a>
          </li>
        ))}
      </ul>
    </section>
  );
}
