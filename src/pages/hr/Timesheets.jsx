import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Download, Timer, X } from "lucide-react";
import { frappe } from "../../lib/api/frappeClient";
import { dmy, friendlyError, hoursLabel, MONTHS, parseWorkNote, useAsync, WEEKDAYS } from "../../lib/employeePortal";
import { Button, Card } from "../../components/ui/primitives";

const SORTS = [
  ["employee", "Employee (A-Z)"],
  ["date", "Date (newest first)"],
  ["hours", "Hours (most first)"],
];
const STATUS_FILTERS = [["all", "All"], ["1", "Submitted"], ["0", "Draft"]];

const chip = (active) =>
  `shrink-0 rounded-md border px-2.5 py-1 text-[12px] transition-colors ${active ? "border-[var(--color-red)] bg-[var(--color-red-wash)] text-[var(--color-text)]" : "border-[var(--color-border)] text-[var(--color-text-muted)] hover:text-[var(--color-text)]"}`;
const select = "rounded-md border border-[var(--color-border-strong)] bg-[var(--color-surface-2)] px-2.5 py-1 text-[12px] text-[var(--color-text)] outline-none focus:border-[var(--color-red)]";

const loadYear = (year) =>
  frappe.getList("Timesheet", {
    filters: [["start_date", ">=", `${year}-01-01`], ["start_date", "<=", `${year}-12-31`], ["docstatus", "<", 2]],
    fields: ["name", "employee", "employee_name", "start_date", "end_date", "total_hours", "status", "docstatus"],
    orderBy: "start_date asc",
    limit: 0,
  });

function Status({ row }) {
  const submitted = row.docstatus === 1;
  return (
    <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${submitted ? "bg-[color-mix(in_srgb,var(--color-green)_16%,transparent)] text-[var(--color-green)]" : "bg-[color-mix(in_srgb,var(--color-amber)_16%,transparent)] text-[var(--color-amber)]"}`}>
      {submitted ? "Submitted" : "Draft"}
    </span>
  );
}

function saveCsv(lines, filename) {
  const url = URL.createObjectURL(new Blob(["\ufeff" + lines.join("\n")], { type: "text/csv;charset=utf-8" }));
  const a = Object.assign(document.createElement("a"), { href: url, download: filename });
  a.click();
  URL.revokeObjectURL(url);
}

/** One CSV line per day entry for the given timesheets, sorted by employee then date. */
async function buildDailyCsv(sheets, from, to) {
  const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const docs = [];
  for (let i = 0; i < sheets.length; i += 8) docs.push(...(await Promise.all(sheets.slice(i, i + 8).map((x) => frappe.getDoc("Timesheet", x.name)))));
  const rows = [];
  docs.forEach((d) => (d.time_logs || []).forEach((l) => {
    const date = String(l.from_time).slice(0, 10);
    if (date < from || date > to) return;
    const w = parseWorkNote(l.description, { project: l.project, task: l.task });
    rows.push({ name: d.employee_name || d.employee, id: d.employee, sheet: d.name, status: d.docstatus === 1 ? "Submitted" : "Draft", date, project: w.project, task: w.task, hours: Number(l.hours || 0), notes: w.notes });
  }));
  rows.sort((a, b) => a.name.localeCompare(b.name) || a.date.localeCompare(b.date));
  const head = ["Employee", "Employee ID", "Timesheet", "Status", "Date", "Day", "Project", "Task", "Hours", "Notes"];
  return [head.map(esc).join(","), ...rows.map((r) => [r.name, r.id, r.sheet, r.status, dmy(r.date), WEEKDAYS[new Date(`${r.date}T00:00:00`).getDay()], r.project, r.task, r.hours.toFixed(2), r.notes].map(esc).join(","))];
}

function Row({ r, showEmployee, onOpen }) {
  return (
  <tr onClick={() => onOpen(r.name)} className="cursor-pointer border-b border-[var(--color-border)] last:border-0 hover:bg-[var(--color-surface-2)]">
    {showEmployee && <td className="px-3 py-1.5 text-[var(--color-text)]">{r.employee_name || r.employee}</td>}
    <td className="px-3 py-1.5 text-[var(--color-text)]">{dmy(r.start_date)}{r.end_date && r.end_date !== r.start_date ? ` – ${dmy(r.end_date)}` : ""}</td>
    <td className="px-3 py-1.5 text-[var(--color-text-muted)]">{r.name}</td>
    <td className="px-3 py-1.5 text-[var(--color-text)]">{Number(r.total_hours || 0).toFixed(2)} h</td>
    <td className="px-3 py-1.5"><Status row={r} /></td>
  </tr>
);
}

export default function Timesheets() {
  const thisYear = new Date().getFullYear();
  const [year, setYear] = useState(thisYear);
  const [monthSel, setMonthSel] = useState(null); // null = latest month with data, "all" = whole year
  const [statusFilter, setStatusFilter] = useState("all");
  const [sort, setSort] = useState("employee");
  const [collapsed, setCollapsed] = useState(() => new Set());
  const [open, setOpen] = useState(null);
  const [exporting, setExporting] = useState(false);

  const q = useAsync(() => loadYear(year), [year]);
  const rows = q.data || [];

  const monthCounts = useMemo(() => {
    const c = Array(12).fill(0);
    rows.forEach((r) => { c[Number(r.start_date.slice(5, 7)) - 1] += 1; });
    return c;
  }, [rows]);
  const latest = monthCounts.reduce((acc, n, i) => (n ? i : acc), 0);
  const month = monthSel === "all" ? "all" : monthSel !== null && monthCounts[monthSel] ? monthSel : latest;

  const visible = useMemo(
    () => rows.filter((r) => (month === "all" || Number(r.start_date.slice(5, 7)) - 1 === month) && (statusFilter === "all" || String(r.docstatus) === statusFilter)),
    [rows, month, statusFilter]
  );

  const groups = useMemo(() => {
    const map = new Map();
    visible.forEach((r) => {
      const g = map.get(r.employee) || { id: r.employee, name: r.employee_name || r.employee, records: [], hours: 0 };
      g.records.push(r);
      g.hours += Number(r.total_hours) || 0;
      map.set(r.employee, g);
    });
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [visible]);

  const flat = useMemo(() => {
    const list = [...visible];
    if (sort === "hours") list.sort((a, b) => (Number(b.total_hours) || 0) - (Number(a.total_hours) || 0));
    else list.sort((a, b) => b.start_date.localeCompare(a.start_date));
    return list;
  }, [visible, sort]);

  const totalHours = visible.reduce((s, r) => s + (Number(r.total_hours) || 0), 0);
  const periodLabel = month === "all" ? `${year}` : `${MONTHS[month]} ${year}`;
  async function exportCsv() {
    setExporting(true);
    try {
      const from = month === "all" ? `${year}-01-01` : `${year}-${String(month + 1).padStart(2, "0")}-01`;
      const to = month === "all" ? `${year}-12-31` : `${year}-${String(month + 1).padStart(2, "0")}-${String(new Date(year, month + 1, 0).getDate()).padStart(2, "0")}`;
      saveCsv(await buildDailyCsv(visible, from, to), `timesheets-${year}${month === "all" ? "" : `-${String(month + 1).padStart(2, "0")}`}.csv`);
    } catch (e) {
      window.alert(friendlyError(e));
    }
    setExporting(false);
  }
  const toggle = (id) => setCollapsed((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-5 py-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="mb-1 flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--color-red-hover)]"><Timer size={14} /> Workforce tracking</div>
            <h2 className="text-base font-semibold text-[var(--color-text)]">Timesheets</h2>
            <p className="mt-1 text-[12px] text-[var(--color-text-muted)]">Hours logged by employees, by month and employee. Download a month as CSV with every day's project and task.</p>
          </div>
          <Button variant="secondary" disabled={!visible.length || exporting} onClick={exportCsv}><Download size={14} /> {exporting ? "Preparing…" : `Download ${periodLabel} CSV`}</Button>
        </div>
      </section>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <select value={year} onChange={(e) => { setYear(Number(e.target.value)); setMonthSel(null); }} aria-label="Year" className={select}>
          {Array.from({ length: 5 }, (_, i) => thisYear - i).map((y) => <option key={y}>{y}</option>)}
        </select>
        <div className="flex gap-1 overflow-x-auto">
          {MONTHS.map((m, i) => (
            <button key={m} type="button" disabled={!monthCounts[i]} onClick={() => setMonthSel(i)} className={`${chip(month === i)} disabled:pointer-events-none disabled:opacity-30`}>
              {m}{monthCounts[i] ? <span className="ml-1 text-[10px] text-[var(--color-text-faint)]">{monthCounts[i]}</span> : null}
            </button>
          ))}
          <button type="button" onClick={() => setMonthSel("all")} className={chip(month === "all")}>Whole year</button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex gap-1">{STATUS_FILTERS.map(([v, l]) => <button key={v} type="button" onClick={() => setStatusFilter(v)} className={chip(statusFilter === v)}>{l}</button>)}</div>
        <label className="flex items-center gap-2 text-[12px] text-[var(--color-text-muted)]">Sort by
          <select value={sort} onChange={(e) => setSort(e.target.value)} className={select}>{SORTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
        </label>
        <div className="ml-auto flex flex-wrap gap-1.5 text-[11px]">
          {[`${visible.length} timesheet${visible.length === 1 ? "" : "s"}`, `${groups.length} employee${groups.length === 1 ? "" : "s"}`, `${hoursLabel(totalHours)} total`].map((t) => <span key={t} className="rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-0.5 text-[var(--color-text-muted)]">{t}</span>)}
        </div>
      </div>

      {q.loading && !q.data && <Card><div className="flex h-32 items-center justify-center text-[13px] text-[var(--color-text-muted)]">Loading timesheets…</div></Card>}
      {q.error && <Card><div className="p-6 text-[13px] text-[var(--color-text-muted)]">{friendlyError(q.error)}</div></Card>}

      {q.data && visible.length === 0 && <Card><div className="flex h-28 items-center justify-center text-[13px] text-[var(--color-text-muted)]">No timesheets for {periodLabel}.</div></Card>}

      {q.data && visible.length > 0 && sort === "employee" && (
        <div className="space-y-3">
          {groups.map((g) => (
            <Card key={g.id} className="overflow-hidden">
              <button type="button" onClick={() => toggle(g.id)} className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-[var(--color-surface-2)]">
                <span className="flex items-center gap-2 text-[13px] font-medium text-[var(--color-text)]">{collapsed.has(g.id) ? <ChevronRight size={14} /> : <ChevronDown size={14} />}{g.name}<span className="rounded-full bg-[var(--color-surface-2)] px-1.5 py-0.5 text-[10px] font-normal text-[var(--color-text-muted)]">{g.records.length}</span></span>
                <span className="text-[12px] text-[var(--color-text-muted)]">{hoursLabel(g.hours)} in {periodLabel}</span>
              </button>
              {!collapsed.has(g.id) && (
                <table className="w-full border-t border-[var(--color-border)] text-left text-[12px]">
                  <thead><tr className="text-[var(--color-text-muted)]"><th className="px-3 py-1.5 font-medium">Period</th><th className="px-3 py-1.5 font-medium">Timesheet</th><th className="px-3 py-1.5 font-medium">Hours</th><th className="px-3 py-1.5 font-medium">Status</th></tr></thead>
                  <tbody>{g.records.map((r) => <Row key={r.name} r={r} onOpen={setOpen} />)}</tbody>
                </table>
              )}
            </Card>
          ))}
        </div>
      )}

      {q.data && visible.length > 0 && sort !== "employee" && (
        <Card className="overflow-x-auto">
          <table className="w-full text-left text-[12px]">
            <thead><tr className="border-b border-[var(--color-border)] text-[var(--color-text-muted)]"><th className="px-3 py-2 font-medium">Employee</th><th className="px-3 py-2 font-medium">Period</th><th className="px-3 py-2 font-medium">Timesheet</th><th className="px-3 py-2 font-medium">Hours</th><th className="px-3 py-2 font-medium">Status</th></tr></thead>
            <tbody>{flat.map((r) => <Row key={r.name} r={r} showEmployee onOpen={setOpen} />)}</tbody>
          </table>
        </Card>
      )}

      {open && <Detail name={open} onClose={() => setOpen(null)} />}
    </div>
  );
}

function Detail({ name, onClose }) {
  const q = useAsync(() => frappe.getDoc("Timesheet", name), [name]);
  const d = q.data;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
        <div className="mb-4 flex items-start justify-between">
          <div>
            <h2 className="text-[14px] font-semibold text-[var(--color-text)]">{d?.employee_name || "Timesheet"} <span className="font-normal text-[var(--color-text-faint)]">{name}</span></h2>
            {d && <p className="mt-1 text-[12px] text-[var(--color-text-muted)]">{dmy(d.start_date)}{d.end_date && d.end_date !== d.start_date ? ` – ${dmy(d.end_date)}` : ""} · {Number(d.total_hours || 0).toFixed(2)} h · {d.docstatus === 1 ? "Submitted" : "Draft"}</p>}
          </div>
          <button type="button" onClick={onClose} className="text-[var(--color-text-muted)] hover:text-[var(--color-text)]"><X size={16} /></button>
        </div>
        {q.loading && <p className="py-6 text-center text-[13px] text-[var(--color-text-muted)]">Loading…</p>}
        {q.error && <p className="text-[13px] text-[var(--color-text-muted)]">{friendlyError(q.error)}</p>}
        {d && (
          <table className="w-full text-left text-[12px]">
            <thead><tr className="border-b border-[var(--color-border)] text-[var(--color-text-muted)]"><th className="px-3 py-1.5 font-medium">Date</th><th className="px-3 py-1.5 font-medium">Project</th><th className="px-3 py-1.5 font-medium">Task</th><th className="px-3 py-1.5 font-medium">Hours</th><th className="px-3 py-1.5 font-medium">Notes</th></tr></thead>
            <tbody>
              {(d.time_logs || []).map((l) => {
                const w = parseWorkNote(l.description, { project: l.project, task: l.task });
                return (
                  <tr key={l.name} className="border-b border-[var(--color-border)] last:border-0">
                    <td className="px-3 py-1.5 text-[var(--color-text)]">{dmy(l.from_time)}</td>
                    <td className="px-3 py-1.5 text-[var(--color-text)]">{w.project || "—"}</td>
                    <td className="px-3 py-1.5 text-[var(--color-text-muted)]">{w.task || "—"}</td>
                    <td className="px-3 py-1.5 text-[var(--color-text)]">{Number(l.hours || 0).toFixed(2)}</td>
                    <td className="px-3 py-1.5 text-[var(--color-text-muted)]">{w.notes || "—"}</td>
                  </tr>
                );
              })}
              {!(d.time_logs || []).length && <tr><td colSpan={5} className="px-3 py-4 text-[var(--color-text-muted)]">No time entries.</td></tr>}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}