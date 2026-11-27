import { useEffect, useState } from "react";
import { Building2, KeyRound, Pencil, Plus, Power, Trash2, X } from "lucide-react";
import { frappe } from "../../lib/api/frappeClient";
import { CompanyField } from "../../components/layout/ClientSwitcher";
import { getClientScope } from "../../lib/clientScope";
import { SUPER_ADMIN } from "../../lib/modules";
import { dmyHm, errMsg as portalErr, useAsync } from "../../lib/employeePortal";
import { Button, Card, Input, LinkField, Table } from "../../components/ui/primitives";
import { confirmDialog } from "../../components/ui/dialogs";

/**
 * Company scoping: every HR user is tied to one company through an ERPNext
 * "User Permission" (allow = Company, apply to all doctypes). ERPNext then
 * filters Employees, Attendance, Leave, Payroll... to that company on the
 * server, so the HR user can't read other companies' data even by calling
 * the API directly. Administrator is exempt.
 */
export async function setUserCompany(email, company) {
  // Replace any existing company restriction for this user
  const existing = await frappe.getList("User Permission", {
    filters: [["user", "=", email], ["allow", "=", "Company"]],
    fields: ["name"],
    limit: 0,
  });
  await Promise.all(existing.map((p) => frappe.deleteDoc("User Permission", p.name)));
  await frappe.createDoc("User Permission", {
    user: email,
    allow: "Company",
    for_value: company,
    apply_to_all_doctypes: 1,
    is_default: 1,
  });
}

export default function AdminUsers() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [detail, setDetail] = useState(null);

  const client = getClientScope();

  async function load() {
    setLoading(true);
    try {
      const hasRole = await frappe.getList("Has Role", {
        parent: "User",
        filters: [["role", "in", ["HR Manager", "HR User"]], ["parenttype", "=", "User"]],
        fields: ["parent", "role"],
        limit: 0,
      });
      const names = [...new Set(hasRole.map((r) => r.parent))];
      const [details, permissions] = await Promise.all([
        Promise.all(names.map((n) => frappe.getDoc("User", n).catch(() => null))),
        names.length
          ? frappe
              .getList("User Permission", { filters: [["allow", "=", "Company"], ["user", "in", names]], fields: ["user", "for_value"], limit: 0 })
              .catch(() => [])
          : [],
      ]);
      setUsers(
        details
          .filter(Boolean)
          .map((u) => ({
            name: u.name,
            full_name: u.full_name,
            enabled: u.enabled,
            role: hasRole.find((r) => r.parent === u.name)?.role,
            company: permissions.find((p) => p.user === u.name)?.for_value || "",
          }))
          // The Administrator is the super admin, not an HR user; and only the client being viewed is listed.
          .filter((u) => u.name !== SUPER_ADMIN && (!client || u.company === client))
      );
    } catch {
      setUsers([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-[13px] text-[var(--color-text-muted)]">
          {client ? <>HR users of <b className="text-[var(--color-text)]">{client}</b>. Each HR user is tied to one company and only sees its employees and records.</> : "HR users are tied to one company and can only see that company's employees and records."}
        </p>
        <Button onClick={() => setShowForm(true)}>
          <Plus size={14} strokeWidth={2} />
          Create HR
        </Button>
      </div>

      <Card>
        {loading ? (
          <div className="flex h-32 items-center justify-center text-[13px] text-[var(--color-text-muted)]">
            Loading…
          </div>
        ) : (
          <Table
            columns={[
              { key: "full_name", label: "Name", render: (r) => <button type="button" onClick={() => setDetail(r)} className="text-left text-[var(--color-text)] hover:text-[var(--color-red-hover)] hover:underline">{r.full_name || r.name}</button> },
              { key: "name", label: "Email" },
              { key: "role", label: "Role" },
              {
                key: "company",
                label: "Company",
                render: (r) =>
                  r.company ? (
                    <span className="inline-flex items-center gap-1.5 text-[var(--color-text)]">
                      <Building2 size={13} className="text-[var(--color-text-muted)]" />
                      {r.company}
                    </span>
                  ) : (
                    <span className="text-[var(--color-amber)]" title="No company assigned: this user can see every company's data">
                      Not assigned
                    </span>
                  ),
              },
              {
                key: "enabled",
                label: "Status",
                render: (r) => (
                  <span className={r.enabled ? "text-[var(--color-green)]" : "text-[var(--color-text-muted)]"}>
                    {r.enabled ? "Active" : "Disabled"}
                  </span>
                ),
              },
              {
                key: "_actions",
                label: "",
                render: (r) => (
                  <button
                    type="button"
                    title="Change company"
                    onClick={() => setEditing(r)}
                    className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] transition-colors hover:border-[var(--color-border-strong)] hover:bg-[var(--color-surface-2)] text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
                  >
                    <Pencil size={14} />
                  </button>
                ),
              },
            ]}
            rows={users}
            emptyLabel="No HR users yet. Create one to get started."
          />
        )}
      </Card>

      {showForm && <CreateHRModal onClose={() => setShowForm(false)} onCreated={load} />}
      {detail && <HRUserModal user={detail} onClose={() => setDetail(null)} onChanged={load} onChangeCompany={() => { setEditing(detail); setDetail(null); }} />}
      {editing && <AssignCompanyModal user={editing} onClose={() => setEditing(null)} onSaved={load} />}
    </div>
  );
}

function ModalShell({ title, onClose, children, wide = false }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
      <div className={`max-h-[90vh] w-full overflow-y-auto rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-5 ${wide ? "max-w-2xl" : "max-w-md"}`}>
        <div className="flex items-center justify-between">
          <h2 className="text-[14px] font-semibold text-[var(--color-text)]">{title}</h2>
          <button onClick={onClose} className="text-[var(--color-text-muted)] hover:text-[var(--color-text)]">
            <X size={16} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function ErrorNote({ children }) {
  return (
    <p className="rounded-md border border-[var(--color-red-deep)] bg-[var(--color-red-wash)] px-3 py-2 text-[12px] text-[var(--color-red-hover)]">
      {children}
    </p>
  );
}

function AssignCompanyModal({ user, onClose, onSaved }) {
  const [company, setCompany] = useState(user.company);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      await setUserCompany(user.name, company);
      onSaved();
      onClose();
    } catch (err) {
      setError(err?.response?.data?.message || "Could not update the company for this user.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ModalShell title={`Company for ${user.full_name || user.name}`} onClose={onClose}>
      <form onSubmit={handleSubmit} className="mt-4 space-y-3">
        <LinkField label="Company" linkDoctype="Company" value={company} onChange={setCompany} required frappe={frappe} />
        <p className="text-[12px] text-[var(--color-text-muted)]">
          This user will only see employees and records that belong to this company.
        </p>
        {error && <ErrorNote>{error}</ErrorNote>}
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={submitting || !company}>
            {submitting ? "Saving…" : "Save"}
          </Button>
        </div>
      </form>
    </ModalShell>
  );
}

function CreateHRModal({ onClose, onCreated }) {
  const [form, setForm] = useState({ first_name: "", last_name: "", email: "", role: "HR User", company: getClientScope() || "" });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  function set(key) {
    return (e) => setForm((f) => ({ ...f, [key]: e.target.value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.company) {
      setError("Choose the company this HR user will manage.");
      return;
    }
    setSubmitting(true);
    setError("");
    let created = false;
    try {
      // Step 1: create the ERPNext User
      await frappe.createDoc("User", {
        email: form.email,
        first_name: form.first_name,
        last_name: form.last_name,
        send_welcome_email: 1,
      });
      created = true;
      // Step 2: assign the HR role via the child table on User
      await frappe.updateDoc("User", form.email, {
        roles: [{ role: form.role }],
      });
      // Step 3: restrict the user to their company
      await setUserCompany(form.email, form.company);
      onCreated();
      onClose();
    } catch (err) {
      if (created) onCreated();
      setError(
        created
          ? "The user was created, but the role or company could not be set. Use the pencil icon on the HR Users list to assign the company."
          : err?.response?.data?.message || "Could not create HR user. Check the email isn't already in use."
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ModalShell title="Create HR User" onClose={onClose}>
      <form onSubmit={handleSubmit} className="mt-4 space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Input label="First Name" value={form.first_name} onChange={set("first_name")} required />
          <Input label="Last Name" value={form.last_name} onChange={set("last_name")} required />
        </div>
        <Input label="Email" type="email" value={form.email} onChange={set("email")} required />

        <label className="block">
          <span className="mb-1.5 block text-[12px] text-[var(--color-text-muted)]">Role</span>
          <select
            value={form.role}
            onChange={set("role")}
            className="w-full rounded-md border border-[var(--color-border-strong)] bg-[var(--color-surface-2)] px-3 py-2 text-[13px] text-[var(--color-text)] outline-none focus:border-[var(--color-red)]"
          >
            <option value="HR User">HR User</option>
            <option value="HR Manager">HR Manager</option>
          </select>
        </label>

        <CompanyField value={form.company} onChange={(v) => setForm((f) => ({ ...f, company: v }))} required />
        <p className="-mt-1 text-[12px] text-[var(--color-text-muted)]">
          This HR user will only see this company's employees and records.
        </p>

        {error && <ErrorNote>{error}</ErrorNote>}

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={submitting}>
            {submitting ? "Creating…" : "Create HR user"}
          </Button>
        </div>
      </form>
    </ModalShell>
  );
}

/* ---------------------- HR user: everything about one account ---------------------- */

function HRUserModal({ user, onClose, onChanged, onChangeCompany }) {
  const q = useAsync(async () => {
    const [doc, emps] = await Promise.all([
      frappe.getDoc("User", user.name),
      user.company ? frappe.getList("Employee", { filters: [["company", "=", user.company]], fields: ["name", "employee_name", "status"], limit: 0 }).catch(() => null) : null,
    ]);
    return { doc, emps };
  }, [user.name]);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [pwd, setPwd] = useState("");
  const doc = q.data?.doc;
  const emps = q.data?.emps;
  const roleNow = doc?.roles?.some((r) => r.role === "HR Manager") ? "HR Manager" : "HR User";

  async function run(label, fn, done, question) {
    if (!(await confirmDialog(question))) return;
    setBusy(label);
    setError("");
    setNote("");
    try {
      await fn();
      setNote(done);
      onChanged();
      q.reload();
    } catch (e) {
      setError(portalErr(e, "The change was refused."));
    }
    setBusy("");
  }

  const setRole = (role) => run("role", () => {
    const keep = (doc.roles || []).map((r) => r.role).filter((r) => r !== "HR Manager" && r !== "HR User");
    return frappe.updateDoc("User", user.name, { roles: [...keep, role].map((r) => ({ role: r })) });
  }, `Role changed to ${role}.`, `Change ${user.full_name || user.name}'s role to ${role}?`);
  const toggle = () => run("enable", () => frappe.updateDoc("User", user.name, { enabled: doc.enabled ? 0 : 1 }), doc.enabled ? "Account disabled - they can no longer sign in." : "Account enabled.",
    doc.enabled ? { message: `Disable ${user.full_name || user.name}'s account? They won't be able to sign in.`, danger: true, confirmLabel: "Disable" } : `Enable ${user.full_name || user.name}'s account?`);
  const reset = () => run("pwd", async () => { await frappe.updateDoc("User", user.name, { new_password: pwd }); setPwd(""); }, "Password changed.", `Set a new password for ${user.full_name || user.name}?`);
  const remove = async () => {
    if (!(await confirmDialog(`Delete ${user.full_name || user.name} permanently? Disabling the account is usually safer.`))) return;
    setBusy("delete");
    setError("");
    try {
      await frappe.deleteDoc("User", user.name);
      onChanged();
      onClose();
    } catch (e) {
      setError(portalErr(e, "Couldn't delete this user - it is probably linked to other records. Disable it instead."));
      setBusy("");
    }
  };

  const info = doc ? [
    ["Email", doc.email || doc.name], ["Account", doc.enabled ? "Enabled" : "Disabled"], ["User type", doc.user_type],
    ["Company", user.company || "Not assigned (sees every company)"], ["Mobile", doc.mobile_no || doc.phone],
    ["Last login", dmyHm(doc.last_login) || "Never"], ["Last active", dmyHm(doc.last_active) || "—"], ["Created", dmyHm(doc.creation)],
  ] : [];

  return (
    <ModalShell title={user.full_name || user.name} onClose={onClose} wide>
      {q.loading && !doc && <p className="py-8 text-center text-[13px] text-[var(--color-text-muted)]">Loading…</p>}
      {q.error && <p className="text-[13px] text-[var(--color-red-hover)]">{portalErr(q.error, "Couldn't load this user.")}</p>}
      {doc && (
        <div className="mt-4 space-y-5">
          <dl className="grid grid-cols-1 gap-x-8 gap-y-3 sm:grid-cols-2">
            {info.filter(([, v]) => v).map(([k, v]) => <div key={k}><dt className="text-[11px] uppercase tracking-wide text-[var(--color-text-faint)]">{k}</dt><dd className="mt-0.5 text-[13px] text-[var(--color-text)]">{v}</dd></div>)}
          </dl>

          <section>
            <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">Roles</h3>
            <div className="flex flex-wrap gap-1.5">{(doc.roles || []).map((r) => <span key={r.role} className="rounded-full border border-[var(--color-border-strong)] bg-[var(--color-surface-2)] px-2.5 py-0.5 text-[12px] text-[var(--color-text)]">{r.role}</span>)}</div>
            <div className="mt-3 flex items-center gap-2 text-[12px] text-[var(--color-text-muted)]">
              HR level
              <select value={roleNow} disabled={Boolean(busy)} onChange={(e) => setRole(e.target.value)} className="rounded-md border border-[var(--color-border-strong)] bg-[var(--color-surface-2)] px-2.5 py-1 text-[12px] text-[var(--color-text)] outline-none focus:border-[var(--color-red)]"><option>HR User</option><option>HR Manager</option></select>
            </div>
          </section>

          <section>
            <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">Employees in {user.company || "their company"}</h3>
            {!user.company ? <p className="text-[12px] text-[var(--color-amber)]">No company assigned yet - this HR user can see every company's employees.</p> : emps == null ? <p className="text-[12px] text-[var(--color-text-muted)]">Couldn't load employees.</p> : (
              <>
                <p className="mb-2 text-[12px] text-[var(--color-text-muted)]">{emps.filter((e) => e.status === "Active").length} active of {emps.length}</p>
                <div className="flex max-h-28 flex-wrap gap-1.5 overflow-y-auto">{emps.map((e) => <span key={e.name} className="rounded border border-[var(--color-border)] px-2 py-0.5 text-[11px] text-[var(--color-text-muted)]">{e.employee_name}</span>)}</div>
              </>
            )}
          </section>

          <section>
            <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">Actions</h3>
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="secondary" onClick={onChangeCompany} disabled={Boolean(busy)}><Building2 size={14} /> Change Company</Button>
              <Button variant="secondary" onClick={toggle} disabled={Boolean(busy)}><Power size={14} /> {doc.enabled ? "Disable Account" : "Enable Account"}</Button>
              <Button variant="ghost" onClick={remove} disabled={Boolean(busy)}><Trash2 size={14} /> Delete</Button>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <input type="text" value={pwd} onChange={(e) => setPwd(e.target.value)} placeholder="New password" autoComplete="off" className="w-56 rounded-md border border-[var(--color-border-strong)] bg-[var(--color-surface-2)] px-3 py-2 text-[13px] text-[var(--color-text)] placeholder:text-[var(--color-text-faint)] outline-none focus:border-[var(--color-red)]" />
              <Button variant="secondary" onClick={reset} disabled={Boolean(busy) || pwd.length < 8}><KeyRound size={14} /> {busy === "pwd" ? "Saving…" : "Set Password"}</Button>
            </div>
          </section>

          {note && <p className="text-[12px] text-[var(--color-green)]">{note}</p>}
          {error && <p className="rounded-md border border-[var(--color-red-deep)] bg-[var(--color-red-wash)] px-3 py-2 text-[12px] text-[var(--color-red-hover)]">{error}</p>}
        </div>
      )}
    </ModalShell>
  );
}