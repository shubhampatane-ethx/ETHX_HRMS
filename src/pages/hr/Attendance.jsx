import { useEffect, useState } from "react";
import { CalendarCheck, Edit3, Plus, RefreshCw, Trash2 } from "lucide-react";
import { frappe } from "../../lib/api/frappeClient";
import { HrRecordForm } from "../../components/hr/HrRecordForm";
import { Button, Card, Table } from "../../components/ui/primitives";

const FIELDS = [
  { name: "employee", label: "Employee", type: "link", linkDoctype: "Employee", required: true },
  { name: "attendance_date", label: "Attendance date", type: "date", required: true },
  { name: "status", label: "Status", type: "select", options: ["Present", "Absent", "On Leave", "Half Day", "Work From Home"], required: true },
  { name: "company", label: "Company", type: "link", linkDoctype: "Company", required: true },
  { name: "shift", label: "Shift", type: "link", linkDoctype: "Shift Type" },
  { name: "leave_type", label: "Leave type", type: "link", linkDoctype: "Leave Type" },
];

export default function Attendance() {
  const [rows, setRows] = useState([]);
  const [state, setState] = useState("loading");
  const [editing, setEditing] = useState(null);
  const [formOpen, setFormOpen] = useState(false);
  async function load() {
    setState("loading");
    try { setRows(await frappe.getList("Attendance", { fields: ["name", "employee_name", "employee", "attendance_date", "status", "company"], limit: 100, orderBy: "attendance_date desc" })); setState("ready"); } catch { setRows([]); setState("error"); }
  }
  useEffect(() => { load(); }, []);
  async function remove(row) { if (!window.confirm(`Delete attendance for ${row.employee_name || row.employee || row.name}?`)) return; try { await frappe.deleteDoc("Attendance", row.name); load(); } catch (error) { window.alert(error?.response?.data?.exception || "ERPNext could not delete this attendance record."); } }
  function closeForm() { setFormOpen(false); setEditing(null); }
  return <div className="space-y-5">
    <section className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-6 py-5"><div className="flex flex-wrap items-start justify-between gap-4"><div><div className="mb-2 flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--color-red-hover)]"><CalendarCheck size={14} /> Workforce tracking</div><h2 className="text-lg font-semibold text-[var(--color-text)]">Attendance</h2><p className="mt-1 text-[13px] text-[var(--color-text-muted)]">Mark and maintain daily attendance in ERPNext.</p></div><div className="flex gap-2"><Button variant="secondary" onClick={load} disabled={state === "loading"}><RefreshCw size={14} /> Refresh</Button><Button onClick={() => { setEditing(null); setFormOpen(true); }}><Plus size={14} /> Mark attendance</Button></div></div></section>
    {formOpen && <HrRecordForm doctype="Attendance" fields={FIELDS} recordName={editing} onCancel={closeForm} onSaved={() => { closeForm(); load(); }} />}
    <Card className="overflow-hidden">{state === "loading" && <div className="flex h-40 items-center justify-center text-[13px] text-[var(--color-text-muted)]">Loading attendance...</div>}{state === "error" && <div className="p-6 text-[13px] text-[var(--color-text-muted)]">Could not load Attendance records. Check ERPNext permissions and connectivity.</div>}{state === "ready" && <Table columns={[{ key: "employee_name", label: "Employee", render: (row) => row.employee_name || row.employee || row.name }, { key: "attendance_date", label: "Date" }, { key: "status", label: "Status" }, { key: "company", label: "Company" }, { key: "_actions", label: "", render: (row) => <div className="flex justify-end gap-1"><button type="button" title="Edit attendance" onClick={() => { setEditing(row.name); setFormOpen(true); }} className="rounded p-1.5 text-[var(--color-text-muted)] hover:bg-[var(--color-surface-2)]"><Edit3 size={14} /></button><button type="button" title="Delete attendance" onClick={() => remove(row)} className="rounded p-1.5 text-[var(--color-text-muted)] hover:text-[var(--color-red-hover)]"><Trash2 size={14} /></button></div> }]} rows={rows} emptyLabel="No attendance records found." />}</Card>
  </div>;
}
