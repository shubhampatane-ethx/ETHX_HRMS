import { useEffect, useMemo, useState } from "react";
import { CalendarCheck, Check, Edit3, Plus, RefreshCw, Trash2 } from "lucide-react";
import { frappe } from "../../lib/api/frappeClient";
import { getCheckinsBetween, hm, summariseCheckins } from "../../lib/employeePortal";
import { HrRecordForm } from "../../components/hr/HrRecordForm";
import { Button, Card } from "../../components/ui/primitives";
import { alertDialog, confirmDialog } from "../../components/ui/dialogs";
import { errMsg } from "../../lib/employeePortal";

/** Saved attendance often has no times of its own (marked by HR, or confirmed from punches): take them from the punches. */
function withPunchTimes(att, punches) {
  const byDay = new Map(punches.map((p) => [`${p.employee}|${p.attendance_date}`, p]));
  return att.map((r) => {
    if (r.in_time) return r;
    const p = byDay.get(`${r.employee}|${r.attendance_date}`);
    return p ? { ...r, in_time: p.in_time, out_time: p.stillIn ? null : p.out_time, stillIn: p.stillIn } : r;
  });
}

const FIELDS = [
  { name: "employee", label: "Employee", type: "link", linkDoctype: "Employee", required: true },
  { name: "attendance_date", label: "Attendance Date", type: "date", required: true },
  { name: "status", label: "Status", type: "select", options: ["Present", "Absent", "On Leave", "Half Day", "Work From Home"], required: true },
  { name: "company", label: "Company", type: "link", linkDoctype: "Company", required: true },
  { name: "shift", label: "Shift", type: "link", linkDoctype: "Shift Type" },
  { name: "leave_type", label: "Leave Type", type: "link", linkDoctype: "Leave Type" },
];

const STATUSES = ["Present", "Absent", "On Leave", "Half Day", "Work From Home"];
const STATUS_SHORT = { Present: "P", Absent: "A", "On Leave": "L", "Half Day": "HD", "Work From Home": "WFH" };
const STATUS_COLOR = {
  Present: "text-[var(--color-green)]",
  Absent: "text-[var(--color-red-hover)]",
  "On Leave": "text-[var(--color-amber)]",
  "Half Day": "text-[var(--color-amber)]",
  "Work From Home": "text-[var(--color-text)]",
};
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// "2026-09-29" -> { year: 2026, month: 8 (0-based), label: "29 Sep, Tue" } (no timezone shifts)
function parseDate(iso = "") {
  const [y, m, d] = iso.split("-").map(Number);
  const wd = WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  return { year: y, month: m - 1, label: `${String(d).padStart(2, "0")} ${MONTHS[m - 1]}, ${wd}` };
}

const chip = (active) =>
  `shrink-0 rounded-md border px-2.5 py-1 text-[12px] transition-colors ${active ? "border-[var(--color-red)] bg-[var(--color-red-wash)] text-[var(--color-text)]" : "border-[var(--color-border)] text-[var(--color-text-muted)] hover:text-[var(--color-text)]"}`;

export default function Attendance() {
  const [rows, setRows] = useState([]);
  const [state, setState] = useState("loading");
  const [editing, setEditing] = useState(null);
  const [formOpen, setFormOpen] = useState(false);
  const [activeEmployee, setActiveEmployee] = useState(null);
  const [confirming, setConfirming] = useState(false);
  const [yearSel, setYearSel] = useState(null);
  const [monthSel, setMonthSel] = useState(null); // null = latest month with data, "all" = whole year

  async function load() {
    setState("loading");
    try {
      // limit: 0 -> fetch ALL attendance records so every month/year is complete
      const att = await frappe.getList("Attendance", { filters: [["docstatus", "<", 2]], fields: ["name", "employee_name", "employee", "attendance_date", "status", "company", "docstatus", "in_time", "out_time", "working_hours"], limit: 0, orderBy: "attendance_date desc" });
      // Employees punch in/out via Employee Checkin; ERPNext doesn't turn that into Attendance by itself,
      // so show punched-in days that have no attendance record yet (HR can confirm them with one click).
      let derived = [];
      let punches = [];
      try {
        const since = new Date(Date.now() - 400 * 86400000);
        const [logs, visible] = await Promise.all([
          getCheckinsBetween(null, `${since.getFullYear()}-${String(since.getMonth() + 1).padStart(2, "0")}-${String(since.getDate()).padStart(2, "0")}`, "9999-12-31"),
          frappe.getList("Employee", { fields: ["name", "employee_name", "company"], limit: 0 }), // only employees this HR user may see
        ]);
        const known = new Map(visible.map((e) => [e.name, e]));
        const have = new Set(att.map((r) => `${r.employee}|${r.attendance_date}`));
        punches = summariseCheckins(logs);
        derived = summariseCheckins(logs.filter((l) => known.has(l.employee)))
          .filter((d) => !have.has(`${d.employee}|${d.attendance_date}`))
          .map((d) => ({ ...d, name: `punch-${d.employee}-${d.attendance_date}`, employee_name: known.get(d.employee).employee_name, company: known.get(d.employee).company, status: "Present", derived: true, in_time: d.in_time, out_time: d.stillIn ? null : d.out_time, working_hours: d.working_hours, stillIn: d.stillIn }));
      } catch { /* checkins not readable - show saved attendance only */ }
      setRows([...withPunchTimes(att, punches), ...derived].sort((a, b) => b.attendance_date.localeCompare(a.attendance_date)));
      setState("ready");
    } catch { setRows([]); setState("error"); }
  }
  useEffect(() => { load(); }, []);

  // One group (tab) per employee, records newest first
  const employees = useMemo(() => {
    const map = new Map();
    for (const row of rows) {
      const id = row.employee || row.name;
      if (!map.has(id)) map.set(id, { id, label: row.employee_name || row.employee || row.name, records: [] });
      map.get(id).records.push({ ...row, ...parseDate(row.attendance_date) });
    }
    return Array.from(map.values()).sort((a, b) => a.label.localeCompare(b.label));
  }, [rows]);

  const current = employees.find((e) => e.id === activeEmployee) || employees[0];

  const years = useMemo(() => Array.from(new Set((current?.records || []).map((r) => r.year))).sort((a, b) => b - a), [current]);
  const year = years.includes(yearSel) ? yearSel : years[0];

  const yearRecords = useMemo(() => (current?.records || []).filter((r) => r.year === year), [current, year]);
  const monthCounts = useMemo(() => {
    const c = Array(12).fill(0);
    for (const r of yearRecords) c[r.month]++;
    return c;
  }, [yearRecords]);
  const latestMonth = monthCounts.reduce((acc, n, i) => (n ? Math.max(acc, i) : acc), 0);
  const month = monthSel === "all" ? "all" : monthSel !== null && monthCounts[monthSel] ? monthSel : latestMonth;

  const visible = month === "all" ? yearRecords : yearRecords.filter((r) => r.month === month);
  const summary = useMemo(() => {
    const counts = {};
    for (const r of visible) counts[r.status] = (counts[r.status] || 0) + 1;
    return counts;
  }, [visible]);

  const unconfirmed = visible.filter((r) => r.derived);
  // Only unsubmitted drafts can be deleted. Saved attendance (from punches or marked by HR) is corrected with Edit,
  // which keeps the old record as cancelled history; a server rule refuses deleting it too.
  async function remove(row) { if (Number(row.docstatus) !== 0) return; if (!(await confirmDialog(`Delete the draft attendance for ${row.employee_name || row.employee || row.name} on ${row.attendance_date}?`))) return; try { await frappe.deleteDoc("Attendance", row.name); load(); } catch (error) { alertDialog({ tone: "error", message: errMsg(error, "Couldn't delete this attendance record.") }); } }
  async function confirmRows(list) {
    if (!list.length || !(await confirmDialog(`Save ${list.length} punched-in day(s) as Present?`))) return;
    setConfirming(true);
    let failed = 0;
    let last = "";
    for (const r of list) {
      try {
        const doc = await frappe.createDoc("Attendance", { employee: r.employee, attendance_date: r.attendance_date, status: "Present", company: r.company, in_time: r.in_time || undefined, out_time: r.out_time || undefined, working_hours: r.working_hours || undefined });
        await frappe.submitDoc(await frappe.getDoc("Attendance", doc.name));
      } catch (e) { failed += 1; last = e?.response?.data?.exception || e.message || ""; }
    }
    setConfirming(false);
    if (failed) alertDialog({ tone: "error", message: `${failed} day(s) could not be saved. ${last}` });
    load();
  }
  function closeForm() { setFormOpen(false); setEditing(null); }
  function pickEmployee(id) { setActiveEmployee(id); setYearSel(null); setMonthSel(null); }

  return <div className="space-y-4">
    <section className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-5 py-4"><div className="flex flex-wrap items-center justify-between gap-4"><div><div className="mb-1 flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--color-red-hover)]"><CalendarCheck size={14} /> Workforce tracking</div><h2 className="text-base font-semibold text-[var(--color-text)]">Attendance</h2></div><div className="flex gap-2">{unconfirmed.length > 0 && <Button variant="secondary" onClick={() => confirmRows(unconfirmed)} disabled={confirming}><Check size={14} /> {confirming ? "Saving…" : `Confirm ${unconfirmed.length} punched-in`}</Button>}<Button variant="secondary" onClick={load} disabled={state === "loading"}><RefreshCw size={14} /> Refresh</Button><Button onClick={() => { setEditing(null); setFormOpen(true); }}><Plus size={14} /> Mark Attendance</Button></div></div></section>
    {formOpen && <HrRecordForm doctype="Attendance" submittable fields={FIELDS} recordName={editing} onCancel={closeForm} onSaved={() => { closeForm(); load(); }} />}

    {state === "loading" && <Card><div className="flex h-32 items-center justify-center text-[13px] text-[var(--color-text-muted)]">Loading attendance...</div></Card>}
    {state === "error" && <Card><div className="p-6 text-[13px] text-[var(--color-text-muted)]">Could not load attendance records. Check your permissions and connection.</div></Card>}
    {state === "ready" && employees.length === 0 && <Card><div className="flex h-32 items-center justify-center text-[13px] text-[var(--color-text-muted)]">No attendance records found.</div></Card>}

    {state === "ready" && current && <>
      {/* Employee tabs */}
      <div role="tablist" aria-label="Employees" className="flex gap-1 overflow-x-auto border-b border-[var(--color-border)]">
        {employees.map((emp) => {
          const active = emp.id === current.id;
          return <button key={emp.id} role="tab" aria-selected={active} type="button" onClick={() => pickEmployee(emp.id)}
            className={`-mb-px flex shrink-0 items-center gap-2 border-b-2 px-3.5 py-2 text-[13px] font-medium transition-colors ${active ? "border-[var(--color-red)] text-[var(--color-text)]" : "border-transparent text-[var(--color-text-muted)] hover:text-[var(--color-text)]"}`}>
            {emp.label}
            <span className="rounded-full bg-[var(--color-surface-2)] px-1.5 py-0.5 text-[10px] text-[var(--color-text-muted)]">{emp.records.length}</span>
          </button>;
        })}
      </div>

      {/* Year + month filter and totals on compact rows */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <select value={year} onChange={(e) => { setYearSel(Number(e.target.value)); setMonthSel(null); }} aria-label="Year"
          className="rounded-md border border-[var(--color-border-strong)] bg-[var(--color-surface-2)] px-2.5 py-1 text-[12px] text-[var(--color-text)] outline-none focus:border-[var(--color-red)]">
          {years.map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
        <div className="flex gap-1 overflow-x-auto">
          {MONTHS.map((m, i) => <button key={m} type="button" disabled={!monthCounts[i]} onClick={() => setMonthSel(i)} className={`${chip(month === i)} disabled:opacity-30 disabled:pointer-events-none`}>{m}{monthCounts[i] ? <span className="ml-1 text-[10px] text-[var(--color-text-faint)]">{monthCounts[i]}</span> : null}</button>)}
          <button type="button" onClick={() => setMonthSel("all")} className={chip(month === "all")}>Whole Year</button>
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5 text-[11px]">
        <span className="rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-0.5 text-[var(--color-text)]">Total {visible.length}</span>
        {STATUSES.filter((s) => summary[s]).map((s) => <span key={s} className="rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-0.5 text-[var(--color-text-muted)]">{s} {summary[s]}</span>)}
      </div>

      {/* Compact records for the selected employee / period */}
      <Card className="overflow-hidden">
        {visible.length === 0 ? <div className="flex h-24 items-center justify-center text-[13px] text-[var(--color-text-muted)]">No attendance records found.</div> :
        <table className="w-full text-left text-[12px]">
          <thead><tr className="border-b border-[var(--color-border)] text-[var(--color-text-muted)]"><th className="px-3 py-1.5 font-medium">Date</th><th className="px-3 py-1.5 font-medium">Status</th><th className="px-3 py-1.5 font-medium">In / Out</th><th className="px-3 py-1.5 font-medium">Company</th><th className="w-16 px-3 py-1.5" /></tr></thead>
          <tbody>
            {visible.map((row) => <tr key={row.name} className="border-b border-[var(--color-border)] last:border-0 hover:bg-[var(--color-surface-2)]">
              <td className="px-3 py-1 text-[var(--color-text)]">{month === "all" ? `${row.label}` : row.label}</td>
              <td className={`px-3 py-1 font-medium ${STATUS_COLOR[row.status] || "text-[var(--color-text)]"}`} title={row.status}>{STATUS_SHORT[row.status] ? `${STATUS_SHORT[row.status]} · ` : ""}{row.status}{row.derived && <span className="ml-2 rounded bg-[var(--color-surface-2)] px-1.5 py-0.5 text-[10px] font-normal text-[var(--color-amber)]">{row.stillIn ? "Punched in" : "Unconfirmed"}</span>}</td>
              <td className="px-3 py-1 text-[var(--color-text-muted)]">{row.in_time ? `${hm(row.in_time)} – ${row.stillIn ? "…" : hm(row.out_time) || "…"}` : "—"}{row.derived && row.working_hours ? ` · ${row.working_hours}h` : ""}</td>
              <td className="px-3 py-1 text-[var(--color-text-muted)]">{row.company}</td>
              <td className="px-3 py-1">{row.derived ? <div className="flex justify-end"><button type="button" title="Confirm as Present" disabled={confirming} onClick={() => confirmRows([row])} className="rounded p-1 text-[var(--color-green)] hover:bg-[var(--color-surface-2)]"><Check size={14} /></button></div> : <div className="flex justify-end gap-0.5"><button type="button" title="Correct attendance (the previous entry is kept in the history)" onClick={() => { setEditing(row.name); setFormOpen(true); }} className="rounded p-1 text-[var(--color-text-muted)] hover:bg-[var(--color-surface-2)]"><Edit3 size={13} /></button>{Number(row.docstatus) === 0 && <button type="button" title="Delete draft" onClick={() => remove(row)} className="rounded p-1 text-[var(--color-text-muted)] hover:text-[var(--color-red-hover)]"><Trash2 size={13} /></button>}</div>}</td>
            </tr>)}
          </tbody>
        </table>}
      </Card>
    </>}
  </div>;
}