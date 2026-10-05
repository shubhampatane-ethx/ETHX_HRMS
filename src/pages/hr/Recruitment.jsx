import { useEffect, useState } from "react";
import { Edit3, Plus, RefreshCw, Trash2, UserSearch } from "lucide-react";
import { frappe } from "../../lib/api/frappeClient";
import { HrRecordForm } from "../../components/hr/HrRecordForm";
import { Button, Card, Table } from "../../components/ui/primitives";

const FIELDS = [
  { name: "job_title", label: "Job title", required: true },
  { name: "designation", label: "Designation", type: "link", linkDoctype: "Designation", required: true },
  { name: "department", label: "Department", type: "link", linkDoctype: "Department" },
  { name: "company", label: "Company", type: "link", linkDoctype: "Company", required: true },
  { name: "status", label: "Status", type: "select", options: ["Open", "Closed"] },
  { name: "planned_vacancies", label: "Planned vacancies", type: "number" },
  { name: "from_date", label: "Opening date", type: "date" },
  { name: "to_date", label: "Closing date", type: "date" },
  { name: "description", label: "Description", type: "textarea" },
];

export default function Recruitment() {
  const [openings, setOpenings] = useState([]);
  const [state, setState] = useState("loading");
  const [editing, setEditing] = useState(null);
  const [formOpen, setFormOpen] = useState(false);

  async function load() {
    setState("loading");
    try {
      setOpenings(await frappe.getList("Job Opening", { fields: ["name", "job_title", "designation", "department", "company", "status", "planned_vacancies", "from_date"], limit: 100, orderBy: "modified desc" }));
      setState("ready");
    } catch {
      setOpenings([]);
      setState("error");
    }
  }

  useEffect(() => { load(); }, []);

  async function removeOpening(opening) {
    if (!window.confirm(`Delete ${opening.job_title || opening.name}? This cannot be undone.`)) return;
    try {
      await frappe.deleteDoc("Job Opening", opening.name);
      load();
    } catch (error) {
      window.alert(error?.response?.data?.exception || "ERPNext could not delete this job opening.");
    }
  }

  function closeForm() { setFormOpen(false); setEditing(null); }

  return (
    <div className="space-y-5">
      <section className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-6 py-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div><div className="mb-2 flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--color-red-hover)]"><UserSearch size={14} /> Talent acquisition</div><h2 className="text-lg font-semibold text-[var(--color-text)]">Recruitment</h2><p className="mt-1 text-[13px] text-[var(--color-text-muted)]">Manage job openings and hiring demand in ERPNext.</p></div>
          <div className="flex gap-2"><Button variant="secondary" onClick={load} disabled={state === "loading"}><RefreshCw size={14} className={state === "loading" ? "animate-spin" : ""} /> Refresh</Button><Button onClick={() => { setEditing(null); setFormOpen(true); }}><Plus size={14} /> New opening</Button></div>
        </div>
      </section>
      {formOpen && <HrRecordForm doctype="Job Opening" fields={FIELDS} recordName={editing} onCancel={closeForm} onSaved={() => { closeForm(); load(); }} />}
      <Card className="overflow-hidden">
        {state === "loading" && <div className="flex h-40 items-center justify-center text-[13px] text-[var(--color-text-muted)]">Loading job openings...</div>}
        {state === "error" && <div className="p-6 text-[13px] text-[var(--color-text-muted)]">Could not load Job Opening records. Check ERPNext permissions and connectivity.</div>}
        {state === "ready" && <Table columns={[
          { key: "job_title", label: "Opening" },
          { key: "designation", label: "Designation" },
          { key: "department", label: "Department" },
          { key: "company", label: "Company" },
          { key: "planned_vacancies", label: "Vacancies" },
          { key: "status", label: "Status", render: (row) => <span className={row.status === "Open" ? "text-[var(--color-green)]" : "text-[var(--color-text-muted)]"}>{row.status || "-"}</span> },
          { key: "_actions", label: "", render: (row) => <div className="flex justify-end gap-1"><button type="button" title="Edit opening" onClick={() => { setEditing(row.name); setFormOpen(true); }} className="rounded p-1.5 text-[var(--color-text-muted)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text)]"><Edit3 size={14} /></button><button type="button" title="Delete opening" onClick={() => removeOpening(row)} className="rounded p-1.5 text-[var(--color-text-muted)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-red-hover)]"><Trash2 size={14} /></button></div> },
        ]} rows={openings} emptyLabel="No job openings found." />}
      </Card>
    </div>
  );
}
