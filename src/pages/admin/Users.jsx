import { useEffect, useState } from "react";
import { Plus, X } from "lucide-react";
import { frappe } from "../../lib/api/frappeClient";
import { Button, Card, Input, Table } from "../../components/ui/primitives";

export default function AdminUsers() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const hasRole = await frappe.getList("Has Role", {
        filters: [["role", "in", ["HR Manager", "HR User"]]],
        fields: ["parent", "role"],
        limit: 0,
      });
      const names = [...new Set(hasRole.map((r) => r.parent))];
      const details = await Promise.all(
        names.map((n) => frappe.getDoc("User", n).catch(() => null))
      );
      setUsers(
        details
          .filter(Boolean)
          .map((u) => ({
            name: u.name,
            full_name: u.full_name,
            enabled: u.enabled,
            role: hasRole.find((r) => r.parent === u.name)?.role,
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
          Users with the HR Manager or HR User role, created and managed here.
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
                key: "enabled",
                label: "Status",
                render: (r) => (
                  <span
                    className={
                      r.enabled
                        ? "text-[var(--color-green)]"
                        : "text-[var(--color-text-muted)]"
                    }
                  >
                    {r.enabled ? "Active" : "Disabled"}
                  </span>
                ),
              },
            ]}
            rows={users}
            emptyLabel="No HR users yet. Create one to get started."
          />
        )}
      </Card>

      {showForm && <CreateHRModal onClose={() => setShowForm(false)} onCreated={load} />}
    </div>
  );
}

function CreateHRModal({ onClose, onCreated }) {
  const [form, setForm] = useState({ first_name: "", last_name: "", email: "", role: "HR User" });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  function set(key) {
    return (e) => setForm((f) => ({ ...f, [key]: e.target.value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      // Step 1: create the ERPNext User
      await frappe.createDoc("User", {
        email: form.email,
        first_name: form.first_name,
        last_name: form.last_name,
        send_welcome_email: 1,
      });
      // Step 2: assign the HR role via the child table on User
      await frappe.updateDoc("User", form.email, {
        roles: [{ role: form.role }],
      });
      onCreated();
      onClose();
    } catch (err) {
      setError(err?.response?.data?.message || "Could not create HR user. Check the email isn't already in use.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
      <div className="w-full max-w-md rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
        <div className="flex items-center justify-between">
          <h2 className="text-[14px] font-semibold text-[var(--color-text)]">Create HR user</h2>
          <button onClick={onClose} className="text-[var(--color-text-muted)] hover:text-[var(--color-text)]">
            <X size={16} />
          </button>
        </div>

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

          {error && (
            <p className="rounded-md border border-[var(--color-red-deep)] bg-[var(--color-red-wash)] px-3 py-2 text-[12px] text-[var(--color-red-hover)]">
              {error}
            </p>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? "Creating…" : "Create HR user"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
