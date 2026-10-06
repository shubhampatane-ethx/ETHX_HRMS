import { useEffect, useState } from "react";
import { Building2, Pencil, Plus, X } from "lucide-react";
import { frappe } from "../../lib/api/frappeClient";
import { Button, Card, Input, LinkField, Table } from "../../components/ui/primitives";

/**
 * Company scoping: every HR user is tied to one company through an ERPNext
 * "User Permission" (allow = Company, apply to all doctypes). ERPNext then
 * filters Employees, Attendance, Leave, Payroll... to that company on the
 * server, so the HR user can't read other companies' data even by calling
 * the API directly. Administrator is exempt.
 */
async function setUserCompany(email, company) {
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

  async function load() {
    setLoading(true);
    try {
      const hasRole = await frappe.getList("Has Role", {
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
          HR users are tied to one company and can only see that company's employees and records.
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
              { key: "full_name", label: "Name" },
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
                    className="rounded p-1.5 text-[var(--color-text-muted)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text)]"
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
      {editing && <AssignCompanyModal user={editing} onClose={() => setEditing(null)} onSaved={load} />}
    </div>
  );
}

function ModalShell({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
      <div className="w-full max-w-md rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
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
  const [form, setForm] = useState({ first_name: "", last_name: "", email: "", role: "HR User", company: "" });
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
    <ModalShell title="Create HR user" onClose={onClose}>
      <form onSubmit={handleSubmit} className="mt-4 space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Input label="First name" value={form.first_name} onChange={set("first_name")} required />
          <Input label="Last name" value={form.last_name} onChange={set("last_name")} required />
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

        <LinkField
          label="Company"
          linkDoctype="Company"
          value={form.company}
          onChange={(v) => setForm((f) => ({ ...f, company: v }))}
          required
          frappe={frappe}
        />
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