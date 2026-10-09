import { useEffect, useState } from "react";
import { Check, Copy, Edit3, KeyRound, Plus, RefreshCw, Trash2, Users } from "lucide-react";
import { frappe } from "../../lib/api/frappeClient";
import { errMsg } from "../../lib/employeePortal";
import { HrRecordForm } from "../../components/hr/HrRecordForm";
import { Button, Card, Table } from "../../components/ui/primitives";

const FIELDS = [
  { name: "employee_name", label: "Employee name", required: true },
  { name: "first_name", label: "First name" },
  { name: "last_name", label: "Last name" },
  { name: "gender", label: "Gender", type: "select", options: ["Male", "Female", "Other"] },
  { name: "date_of_birth", label: "Date of birth", type: "date" },
  { name: "date_of_joining", label: "Date of joining", type: "date", required: true },
  { name: "status", label: "Status", type: "select", options: ["Active", "Inactive", "Suspended", "Left"] },
  { name: "company", label: "Company", type: "link", linkDoctype: "Company", required: true },
  { name: "department", label: "Department", type: "link", linkDoctype: "Department" },
  { name: "designation", label: "Designation", type: "link", linkDoctype: "Designation" },
  { name: "employment_type", label: "Employment type", type: "link", linkDoctype: "Employment Type" },
  { name: "user_id", label: "User account", type: "link", linkDoctype: "User" },
];

const LIST_FIELDS = ["name", "employee_name", "first_name", "last_name", "department", "designation", "status", "company", "date_of_joining", "user_id", "company_email", "personal_email"];
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

async function createEmployeeLogin({ employee, email, password }) {
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
async function resetEmployeePassword({ email, password }) {
  await step("Resetting the password", () => frappe.updateDoc("User", email, { new_password: password, last_password_reset_date: null }));
}

function loginError(e) {
  if (!e?.response) return e?.message || "Something went wrong.";
  const detail = errMsg(e, e.response.data?.exc_type || `HTTP ${e.response.status}`);
  const where = e.step ? `${e.step} failed. ` : "";
  const hint = e.response.data?.exc_type === "PermissionError" ? " Ask the Administrator to check this HR role in Admin > Roles & Permissions (use \"Check an account\")." : "";
  return `${where}ERPNext said: ${detail}.${hint}`;
}

export default function Employees() {
  const [employees, setEmployees] = useState([]);
  const [state, setState] = useState("loading");
  const [editing, setEditing] = useState(null);
  const [formOpen, setFormOpen] = useState(false);
  const [loginFor, setLoginFor] = useState(null);

  async function load() {
    setState("loading");
    try {
      const opts = { limit: 100, orderBy: "creation desc" };
      const records = await frappe.getList("Employee", { ...opts, fields: LIST_FIELDS }).catch(() => frappe.getList("Employee", { ...opts, fields: LIST_FALLBACK }));
      setEmployees(records);
      setState("ready");
    } catch {
      setEmployees([]);
      setState("error");
    }
  }

  useEffect(() => { load(); }, []);

  async function removeEmployee(employee) {
    if (!window.confirm(`Delete ${employee.employee_name || employee.name}? This cannot be undone.`)) return;
    try {
      await frappe.deleteDoc("Employee", employee.name);
      load();
    } catch (error) {
      window.alert(error?.response?.data?.exception || "ERPNext could not delete this employee.");
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
            <h2 className="text-lg font-semibold text-[var(--color-text)]">Employees</h2>
            <p className="mt-1 text-[13px] text-[var(--color-text-muted)]">Create and maintain employee records, and give each employee a sign-in for the employee portal.</p>
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={load} disabled={state === "loading"}><RefreshCw size={14} className={state === "loading" ? "animate-spin" : ""} /> Refresh</Button>
            <Button onClick={() => { setEditing(null); setFormOpen(true); }}><Plus size={14} /> Add employee</Button>
          </div>
        </div>
      </section>

      {formOpen && <HrRecordForm doctype="Employee" fields={FIELDS} recordName={editing} onCancel={closeForm} onSaved={() => { closeForm(); load(); }} />}

      <Card className="overflow-hidden">
        {state === "loading" && <div className="flex h-40 items-center justify-center text-[13px] text-[var(--color-text-muted)]">Loading employees...</div>}
        {state === "error" && <div className="p-6 text-[13px] text-[var(--color-text-muted)]">Could not load Employee records. Check ERPNext permissions and connectivity.</div>}
        {state === "ready" && <Table columns={[
          { key: "employee_name", label: "Name" },
          { key: "department", label: "Department" },
          { key: "designation", label: "Designation" },
          { key: "company", label: "Company" },
          { key: "status", label: "Status", render: (row) => <span className={row.status === "Active" ? "text-[var(--color-green)]" : "text-[var(--color-text-muted)]"}>{row.status || "-"}</span> },
          { key: "user_id", label: "Portal login", render: (row) => row.user_id
            ? <span className="text-[var(--color-green)]" title={row.user_id}>Active</span>
            : <span className="text-[var(--color-amber)]">No login</span> },
          { key: "_actions", label: "", render: (row) => <div className="flex justify-end gap-1">
            <button type="button" title={row.user_id ? "Reset password" : "Create login"} onClick={() => setLoginFor(row)} className="rounded p-1.5 text-[var(--color-text-muted)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text)]"><KeyRound size={14} /></button>
            <button type="button" title="Edit employee" onClick={() => { setEditing(row.name); setFormOpen(true); }} className="rounded p-1.5 text-[var(--color-text-muted)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text)]"><Edit3 size={14} /></button>
            <button type="button" title="Delete employee" onClick={() => removeEmployee(row)} className="rounded p-1.5 text-[var(--color-text-muted)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-red-hover)]"><Trash2 size={14} /></button>
          </div> },
        ]} rows={employees} emptyLabel="No employees found." />}
      </Card>

      {loginFor && <LoginModal employee={loginFor} onClose={() => setLoginFor(null)} onDone={load} />}
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
      if (reset) await resetEmployeePassword({ email, password });
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
              <span className="mb-1.5 block text-[12px] text-[var(--color-text-muted)]">Login email</span>
              <input type="email" required readOnly={reset} className={`${inputCls} ${reset ? "opacity-70" : ""}`} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@company.com" />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-[12px] text-[var(--color-text-muted)]">Temporary password</span>
              <input type="text" required minLength={8} autoComplete="off" className={inputCls} value={password} onChange={(e) => setPassword(e.target.value)} />
              <span className="mt-1 block text-[11px] text-[var(--color-text-faint)]">At least 8 characters with letters, numbers and a symbol - ERPNext rejects weak passwords.</span>
            </label>
            <label className="flex items-center gap-2 text-[12px] text-[var(--color-text-muted)]"><input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} /> Use this as the default password on this browser</label>
            {error && <p className="rounded-md border border-[var(--color-red-deep)] bg-[var(--color-red-wash)] px-3 py-2 text-[12px] text-[var(--color-red-hover)]">{error}</p>}
            <div className="flex justify-end gap-2 pt-1">
              <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
              <Button type="submit" disabled={busy}>{busy ? "Working…" : reset ? "Reset password" : "Create login"}</Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}