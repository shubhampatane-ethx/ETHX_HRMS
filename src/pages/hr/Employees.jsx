import { useEffect, useState } from "react";
import { Edit3, Plus, RefreshCw, Trash2, Users } from "lucide-react";
import { frappe } from "../../lib/api/frappeClient";
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

export default function Employees() {
  const [employees, setEmployees] = useState([]);
  const [state, setState] = useState("loading");
  const [editing, setEditing] = useState(null);
  const [formOpen, setFormOpen] = useState(false);

  async function load() {
    setState("loading");
    try {
      const records = await frappe.getList("Employee", {
        fields: ["name", "employee_name", "department", "designation", "status", "company", "date_of_joining"],
        limit: 100,
        orderBy: "creation desc",
      });
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
            <p className="mt-1 text-[13px] text-[var(--color-text-muted)]">Create and maintain employee records directly in ERPNext.</p>
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
          { key: "_actions", label: "", render: (row) => <div className="flex justify-end gap-1"><button type="button" title="Edit employee" onClick={() => { setEditing(row.name); setFormOpen(true); }} className="rounded p-1.5 text-[var(--color-text-muted)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text)]"><Edit3 size={14} /></button><button type="button" title="Delete employee" onClick={() => removeEmployee(row)} className="rounded p-1.5 text-[var(--color-text-muted)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-red-hover)]"><Trash2 size={14} /></button></div> },
        ]} rows={employees} emptyLabel="No employees found." />}
      </Card>
    </div>
  );
}
