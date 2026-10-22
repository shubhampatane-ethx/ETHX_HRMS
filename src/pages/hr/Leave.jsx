import { useEffect, useState } from "react";
import { CalendarDays, Edit3, Plus, RefreshCw, Trash2, UserCog } from "lucide-react";
import { frappe } from "../../lib/api/frappeClient";
import { HrRecordForm } from "../../components/hr/HrRecordForm";
import { Button, Card, Table } from "../../components/ui/primitives";
import { approversOnLeave, getBuApprovers, pickApprover, reassignLeave } from "../../lib/approvals";
import { errMsg } from "../../lib/employeePortal";

const FIELDS = [
  { name: "employee", label: "Employee", type: "link", linkDoctype: "Employee", required: true },
  { name: "leave_type", label: "Leave type", type: "link", linkDoctype: "Leave Type", required: true },
  { name: "from_date", label: "From date", type: "date", required: true },
  { name: "to_date", label: "To date", type: "date", required: true },
  { name: "company", label: "Company", type: "link", linkDoctype: "Company", required: true },
  { name: "description", label: "Reason", type: "textarea" },
  { name: "leave_approver", label: "Leave approver", type: "link", linkDoctype: "User" },
];

const BASE = ["name", "employee_name", "employee", "leave_type", "from_date", "to_date", "total_leave_days", "status"];

/** Open applications whose approver is on approved leave during the requested dates. */
async function findUnavailable(list) {
  const open = list.filter((r) => r.status === "Open" && r.leave_approver);
  if (!open.length) return new Set();
  try {
    const emps = await frappe.getList("Employee", { filters: [["user_id", "in", [...new Set(open.map((r) => r.leave_approver))]]], fields: ["name", "user_id"], limit: 0 });
    if (!emps.length) return new Set();
    const from = open.reduce((m, r) => (r.from_date < m ? r.from_date : m), open[0].from_date);
    const to = open.reduce((m, r) => (r.to_date > m ? r.to_date : m), open[0].to_date);
    const leaves = await frappe.getList("Leave Application", { filters: [["employee", "in", emps.map((e) => e.name)], ["status", "=", "Approved"], ["docstatus", "=", 1], ["from_date", "<=", to], ["to_date", ">=", from]], fields: ["employee", "from_date", "to_date"], limit: 0 });
    const userOf = Object.fromEntries(emps.map((e) => [e.name, e.user_id]));
    return new Set(open.filter((r) => leaves.some((l) => userOf[l.employee] === r.leave_approver && l.from_date <= r.to_date && l.to_date >= r.from_date)).map((r) => r.name));
  } catch {
    return new Set();
  }
}

export default function Leave() {
  const [rows, setRows] = useState([]);
  const [state, setState] = useState("loading");
  const [editing, setEditing] = useState(null);
  const [formOpen, setFormOpen] = useState(false);
  const [flagged, setFlagged] = useState(new Set());
  const [reassign, setReassign] = useState(null);
  const [bulk, setBulk] = useState(false);
  async function load() { setState("loading"); try { const opts = { limit: 100, orderBy: "modified desc" }; const list = await frappe.getList("Leave Application", { ...opts, fields: [...BASE, "department", "leave_approver", "leave_approver_name"] }).catch(() => frappe.getList("Leave Application", { ...opts, fields: BASE })); setRows(list); setFlagged(await findUnavailable(list)); setState("ready"); } catch { setRows([]); setState("error"); } }
  useEffect(() => { load(); }, []);
  async function remove(row) { if (!window.confirm(`Delete leave application ${row.name}?`)) return; try { await frappe.deleteDoc("Leave Application", row.name); load(); } catch (error) { window.alert(error?.response?.data?.exception || "ERPNext could not delete this leave application."); } }
  function closeForm() { setFormOpen(false); setEditing(null); }
  // approver away -> hand the application to the next available approver of the same business unit
  async function reassignAll() {
    setBulk(true);
    let moved = 0;
    for (const r of rows.filter((x) => flagged.has(x.name))) {
      try {
        const list = (await getBuApprovers({ name: r.employee }, "Leave Application")).filter((a) => a.email !== r.leave_approver);
        const { off } = await approversOnLeave(list.map((a) => a.email), r.from_date, r.to_date);
        const pick = list.find((a) => !off.has(a.email));
        if (pick) { await reassignLeave(r.name, pick.email); moved += 1; }
      } catch { /* leave this one for manual reassignment */ }
    }
    setBulk(false);
    window.alert(moved ? `${moved} application(s) moved to an available approver.` : "No other available approver was found - reassign manually.");
    load();
  }
  return <div className="space-y-5"><section className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-6 py-5"><div className="flex flex-wrap items-start justify-between gap-4"><div><div className="mb-2 flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--color-red-hover)]"><CalendarDays size={14} /> Time away</div><h2 className="text-lg font-semibold text-[var(--color-text)]">Leave applications</h2><p className="mt-1 text-[13px] text-[var(--color-text-muted)]">Apply for and maintain employee leave in ERPNext.</p></div><div className="flex gap-2">{flagged.size > 0 && <Button variant="secondary" onClick={reassignAll} disabled={bulk}><UserCog size={14} /> {bulk ? "Reassigning…" : `Reassign ${flagged.size} unavailable approver${flagged.size === 1 ? "" : "s"}`}</Button>}<Button variant="secondary" onClick={load} disabled={state === "loading"}><RefreshCw size={14} /> Refresh</Button><Button onClick={() => { setEditing(null); setFormOpen(true); }}><Plus size={14} /> New application</Button></div></div></section>{formOpen && <HrRecordForm doctype="Leave Application" fields={FIELDS} recordName={editing} onCancel={closeForm} onSaved={() => { closeForm(); load(); }} />}{reassign && <ReassignModal row={reassign} onClose={() => setReassign(null)} onDone={() => { setReassign(null); load(); }} />}<Card className="overflow-hidden">{state === "loading" && <div className="flex h-40 items-center justify-center text-[13px] text-[var(--color-text-muted)]">Loading leave applications...</div>}{state === "error" && <div className="p-6 text-[13px] text-[var(--color-text-muted)]">Could not load Leave Application records. Check ERPNext permissions and connectivity.</div>}{state === "ready" && <Table columns={[{ key: "employee_name", label: "Employee", render: (row) => row.employee_name || row.employee || row.name }, { key: "leave_type", label: "Leave type" }, { key: "department", label: "Business unit", render: (row) => row.department || "—" }, { key: "from_date", label: "From" }, { key: "to_date", label: "To" }, { key: "total_leave_days", label: "Days" }, { key: "leave_approver_name", label: "Approver", render: (row) => <span>{row.leave_approver_name || row.leave_approver || "—"}{flagged.has(row.name) && <span className="ml-2 rounded bg-[var(--color-surface-2)] px-1.5 py-0.5 text-[10px] text-[var(--color-amber)]">on leave</span>}</span> }, { key: "status", label: "Status" }, { key: "_actions", label: "", render: (row) => <div className="flex justify-end gap-1">{row.status === "Open" && <button type="button" title="Reassign approver" onClick={() => setReassign(row)} className="rounded p-1.5 text-[var(--color-text-muted)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text)]"><UserCog size={14} /></button>}<button type="button" title="Edit leave application" onClick={() => { setEditing(row.name); setFormOpen(true); }} className="rounded p-1.5 text-[var(--color-text-muted)] hover:bg-[var(--color-surface-2)]"><Edit3 size={14} /></button><button type="button" title="Delete leave application" onClick={() => remove(row)} className="rounded p-1.5 text-[var(--color-text-muted)] hover:text-[var(--color-red-hover)]"><Trash2 size={14} /></button></div> }]} rows={rows} emptyLabel="No leave applications found." />}</Card></div>;
}

function ReassignModal({ row, onClose, onDone }) {
  const [list, setList] = useState(null);
  const [off, setOff] = useState(new Set());
  const [pick, setPick] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    let live = true;
    (async () => {
      const cands = await getBuApprovers({ name: row.employee }, "Leave Application");
      const { off: away } = await approversOnLeave(cands.map((a) => a.email), row.from_date, row.to_date);
      if (!live) return;
      setList(cands);
      setOff(away);
      setPick(pickApprover(cands.filter((a) => a.email !== row.leave_approver), away)?.email || "");
    })();
    return () => { live = false; };
  }, [row]);

  async function save() {
    setBusy(true);
    setErr("");
    try { await reassignLeave(row.name, pick); onDone(); } catch (e) { setErr(errMsg(e, "ERPNext refused this change.")); setBusy(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
      <div className="w-full max-w-md rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
        <h2 className="text-[14px] font-semibold text-[var(--color-text)]">Reassign approver</h2>
        <p className="mt-1 text-[12px] text-[var(--color-text-muted)]">{row.employee_name} · {row.leave_type} · {row.from_date} to {row.to_date}. Now: {row.leave_approver_name || row.leave_approver || "none"}</p>
        {list === null ? <p className="py-6 text-center text-[13px] text-[var(--color-text-muted)]">Loading approvers…</p> : list.length === 0 ? <p className="py-4 text-[13px] text-[var(--color-amber)]">No approvers are set for this employee's business unit. Set them in Admin → Organization → Leave approvers.</p> : (
          <label className="mt-4 block text-[12px] text-[var(--color-text-muted)]">New approver
            <select value={pick} onChange={(e) => setPick(e.target.value)} className="mt-1.5 w-full rounded-md border border-[var(--color-border-strong)] bg-[var(--color-surface-2)] px-3 py-2 text-[13px] text-[var(--color-text)] outline-none focus:border-[var(--color-red)]">
              <option value="">Select…</option>
              {list.map((a) => <option key={a.email} value={a.email} disabled={a.email === row.leave_approver}>{a.name}{off.has(a.email) ? " (on leave)" : ""}{a.email === row.leave_approver ? " (current)" : ""}</option>)}
            </select>
          </label>
        )}
        {err && <p className="mt-3 text-[12px] text-[var(--color-red-hover)]">{err}</p>}
        <div className="mt-5 flex justify-end gap-2"><Button variant="ghost" onClick={onClose}>Cancel</Button><Button onClick={save} disabled={busy || !pick}>{busy ? "Saving…" : "Reassign"}</Button></div>
      </div>
    </div>
  );
}