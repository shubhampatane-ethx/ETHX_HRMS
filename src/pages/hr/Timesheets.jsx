import { useMemo, useState } from "react";
import { Check, ChevronDown, ChevronRight, Download, Lock, Timer, Undo2, X } from "lucide-react";
import { frappe } from "../../lib/api/frappeClient";
import { dmy, errMsg, friendlyError, hoursLabel, MONTHS, parseWorkNote, useAsync, WEEKDAYS } from "../../lib/employeePortal";
import { csvCell, getEntriesBetween, getReviewsSafe, listTimesheets, reviewOf, reviewTimesheet, saveCsv } from "../../lib/timesheets";
import { useAuth } from "../../context/AuthContext";
import TimesheetCompliance from "./TimesheetCompliance";
import { Button, Card } from "../../components/ui/primitives";

const SORTS = [
  ["employee", "Employee (A-Z)"],
  ["date", "Date (Newest First)"],
  ["hours", "Hours (Most First)"],
];
// Default view is what employees actually sent in; drafts are still being edited by the employee.
const STATUS_FILTERS = [["submitted", "Submitted"], ["pending", "Awaiting Review"], ["approved", "Approved"], ["finalized", "Finalized"], ["draft", "Draft / Returned"], ["all", "All"]];
const GROUPS = { submitted: ["pending", "partial", "approved", "finalized"], pending: ["pending", "partial"], approved: ["approved", "finalized"], finalized: ["finalized"], draft: ["draft", "returned"] };
const matchStatus = (filter, key) => filter === "all" || (GROUPS[filter] || [filter]).includes(key);

const chip = (active) =>
  `shrink-0 rounded-md border px-2.5 py-1 text-[12px] transition-colors ${active ? "border-[var(--color-red)] bg-[var(--color-red-wash)] text-[var(--color-text)]" : "border-[var(--color-border)] text-[var(--color-text-muted)] hover:text-[var(--color-text)]"}`;
const select = "rounded-md border border-[var(--color-border-strong)] bg-[var(--color-surface-2)] px-2.5 py-1 text-[12px] text-[var(--color-text)] outline-none focus:border-[var(--color-red)]";
const pad2 = (n) => String(n).padStart(2, "0");
const monthOf = (dt) => Number(String(dt).slice(5, 7)) - 1;

/**
 * Every timesheet that has any day in the year (not just those starting in it), with its
 * time-log rows for the year and HR's review state. Hours are attributed to the month of
 * each entry, so a sheet running 29 Sep – 5 Oct counts in both months.
 */
async function loadYear(year) {
  const from = `${year}-01-01`;
  const to = `${year}-12-31`;
  const sheets = await listTimesheets({
    filters: [["start_date", "<=", to], ["end_date", ">=", from], ["docstatus", "<", 2]],
    fields: ["name", "employee", "employee_name", "start_date", "end_date", "total_hours", "status", "docstatus", "amended_from"],
    orderBy: "start_date asc",
    limit: 0,
  });
  const names = sheets.map((s) => s.name);
  const [entries, { reviews, reviewsError }] = await Promise.all([getEntriesBetween(from, to, names), getReviewsSafe(names)]);
  return {
    sheets: sheets.map((s) => ({ ...s, entries: entries.get(s.name) || [], review: reviewOf(s, reviews) })),
    reviewsError,
  };
}

const TONES = { draft: "var(--color-amber)", returned: "var(--color-red-hover)", pending: "var(--color-amber)", partial: "#4f8cff", approved: "var(--color-green)", finalized: "var(--color-green)" };

function Status({ review }) {
  const tone = TONES[review.key] || "var(--color-text-muted)";
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      <span className="rounded-full px-2 py-0.5 text-[11px] font-medium" style={{ background: `color-mix(in srgb, ${tone} 16%, transparent)`, color: tone }}>{review.label}</span>
      {review.erp && <span className="text-[10px] text-[var(--color-text-faint)]">{review.erp}</span>}
    </span>
  );
}

function Row({ r, showEmployee, onOpen }) {
  const differs = Math.abs(r.periodHours - Number(r.total_hours || 0)) > 0.005;
  return (
    <tr onClick={() => onOpen(r)} className="cursor-pointer border-b border-[var(--color-border)] last:border-0 hover:bg-[var(--color-surface-2)]">
      {showEmployee && <td className="px-3 py-1.5 text-[var(--color-text)]">{r.employee_name || r.employee}</td>}
      <td className="px-3 py-1.5 text-[var(--color-text)]">{dmy(r.start_date)}{r.end_date && r.end_date !== r.start_date ? ` – ${dmy(r.end_date)}` : ""}</td>
      <td className="px-3 py-1.5 text-[var(--color-text-muted)]">{r.name}</td>
      <td className="px-3 py-1.5 text-[var(--color-text)]">{r.periodHours.toFixed(2)} h{differs && <span className="ml-1 text-[10px] text-[var(--color-text-faint)]">of {Number(r.total_hours || 0).toFixed(2)}</span>}</td>
      <td className="px-3 py-1.5"><Status review={r.review} /></td>
    </tr>
  );
}

function TimesheetList({ readOnly = false, hrView = false }) {
  const thisYear = new Date().getFullYear();
  const [year, setYear] = useState(thisYear);
  const [monthSel, setMonthSel] = useState(null); // null = latest month with data, "all" = whole year
  const [statusFilter, setStatusFilter] = useState("submitted");
  const [sort, setSort] = useState("employee");
  const [collapsed, setCollapsed] = useState(() => new Set());
  const [open, setOpen] = useState(null);

  const q = useAsync(() => loadYear(year), [year]);
  const sheets = useMemo(() => q.data?.sheets || [], [q.data]);

  // Number of timesheets with at least one entry in each month (status filter applied).
  const monthCounts = useMemo(() => {
    const c = Array(12).fill(0);
    sheets.forEach((s) => {
      if (!matchStatus(statusFilter, s.review.key)) return;
      const months = new Set(s.entries.map((e) => monthOf(e.from_time)));
      if (!s.entries.length && String(s.start_date).startsWith(String(year))) months.add(monthOf(s.start_date));
      months.forEach((m) => { c[m] += 1; });
    });
    return c;
  }, [sheets, statusFilter, year]);
  const latest = monthCounts.reduce((acc, n, i) => (n ? i : acc), new Date().getFullYear() === year ? new Date().getMonth() : 0);
  const month = monthSel === "all" ? "all" : monthSel !== null && monthCounts[monthSel] ? monthSel : latest;

  const visible = useMemo(() => sheets
    .filter((s) => matchStatus(statusFilter, s.review.key))
    .map((s) => {
      const periodEntries = month === "all" ? s.entries : s.entries.filter((e) => monthOf(e.from_time) === month);
      const fallback = !s.entries.length && String(s.start_date).startsWith(String(year)) && (month === "all" || monthOf(s.start_date) === month);
      return { ...s, periodEntries, periodHours: fallback ? Number(s.total_hours || 0) : periodEntries.reduce((t, e) => t + Number(e.hours || 0), 0), show: periodEntries.length > 0 || fallback };
    })
    .filter((s) => s.show), [sheets, statusFilter, month, year]);

  const groups = useMemo(() => {
    const map = new Map();
    visible.forEach((r) => {
      const g = map.get(r.employee) || { id: r.employee, name: r.employee_name || r.employee, records: [], hours: 0 };
      g.records.push(r);
      g.hours += r.periodHours;
      map.set(r.employee, g);
    });
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [visible]);

  const flat = useMemo(() => {
    const list = [...visible];
    if (sort === "hours") list.sort((a, b) => b.periodHours - a.periodHours);
    else list.sort((a, b) => String(b.start_date).localeCompare(String(a.start_date)));
    return list;
  }, [visible, sort]);

  const totalHours = visible.reduce((s, r) => s + r.periodHours, 0);
  const awaiting = sheets.filter((s) => ["pending", "partial"].includes(s.review.key)).length;
  const periodLabel = month === "all" ? `${year}` : `${MONTHS[month]} ${year}`;
  const statusLabel = STATUS_FILTERS.find(([v]) => v === statusFilter)?.[1] || "";

  function exportCsv() {
    const rows = [];
    visible.forEach((s) => s.periodEntries.forEach((l) => {
      const date = String(l.from_time).slice(0, 10);
      const w = parseWorkNote(l.description, { project: l.project, task: l.task });
      rows.push({ name: s.employee_name || s.employee, id: s.employee, sheet: s.name, status: s.review.label, note: s.review.note, date, project: w.project, task: w.task, hours: Number(l.hours || 0), notes: w.notes });
    }));
    rows.sort((a, b) => a.name.localeCompare(b.name) || a.date.localeCompare(b.date));
    const head = ["Employee", "Employee ID", "Timesheet", "Status", "HR note", "Date", "Day", "Project", "Task", "Hours", "Notes"];
    const lines = [head.map(csvCell).join(","), ...rows.map((r) => [r.name, r.id, r.sheet, r.status, r.note, dmy(r.date), WEEKDAYS[new Date(`${r.date}T00:00:00`).getDay()], r.project, r.task, r.hours.toFixed(2), r.notes].map(csvCell).join(","))];
    saveCsv(lines, `timesheets-${year}${month === "all" ? "" : `-${pad2(month + 1)}`}-${statusFilter}.csv`);
  }
  const toggle = (id) => setCollapsed((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-5 py-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="mb-1 flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--color-red-hover)]"><Timer size={14} /> Workforce tracking</div>
            <h2 className="text-base font-semibold text-[var(--color-text)]">Timesheets</h2>
            <p className="mt-1 text-[12px] text-[var(--color-text-muted)]">{hrView ? "Hours logged by employees, by month and employee. Project managers approve them; open a timesheet to see who approved what, or download the CSV." : readOnly ? "Hours your team logged, by month and employee. Approve hours on your projects under Approvals." : "Hours logged by employees, by month and employee. Open a submitted timesheet to approve it (per project), return it for correction, or finalize it."}</p>
          </div>
          <Button variant="secondary" disabled={!visible.length} onClick={exportCsv}><Download size={14} /> Download {periodLabel} CSV</Button>
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
        <div className="flex flex-wrap gap-1">{STATUS_FILTERS.map(([v, l]) => <button key={v} type="button" onClick={() => setStatusFilter(v)} className={chip(statusFilter === v)}>{l}{v === "pending" && awaiting ? <span className="ml-1 text-[10px] text-[var(--color-amber)]">{awaiting}</span> : null}</button>)}</div>
        <label className="flex items-center gap-2 text-[12px] text-[var(--color-text-muted)]">Sort by
          <select value={sort} onChange={(e) => setSort(e.target.value)} className={select}>{SORTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
        </label>
        <div className="ml-auto flex flex-wrap gap-1.5 text-[11px]">
          {[`${visible.length} timesheet${visible.length === 1 ? "" : "s"}`, `${groups.length} employee${groups.length === 1 ? "" : "s"}`, `${hoursLabel(totalHours)} ${statusLabel.toLowerCase()}`].map((t) => <span key={t} className="rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-0.5 text-[var(--color-text-muted)]">{t}</span>)}
        </div>
      </div>

      {q.data?.reviewsError && <Card><div className="px-4 py-3 text-[12px] text-[var(--color-amber)]">Review status couldn't be loaded ({friendlyError(q.data.reviewsError)}). Grant HR read/create on Comment in Admin → Roles to approve or return timesheets.</div></Card>}
      {q.loading && !q.data && <Card><div className="flex h-32 items-center justify-center text-[13px] text-[var(--color-text-muted)]">Loading timesheets…</div></Card>}
      {q.error && <Card><div className="p-6 text-[13px] text-[var(--color-text-muted)]">{friendlyError(q.error)}</div></Card>}

      {q.data && visible.length === 0 && <Card><div className="flex h-28 items-center justify-center text-[13px] text-[var(--color-text-muted)]">No {statusFilter === "all" ? "" : `${statusLabel.toLowerCase()} `}timesheets for {periodLabel}.</div></Card>}

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
                  <thead><tr className="text-[var(--color-text-muted)]"><th className="px-3 py-1.5 font-medium">Period</th><th className="px-3 py-1.5 font-medium">Timesheet</th><th className="px-3 py-1.5 font-medium">Hours in {periodLabel}</th><th className="px-3 py-1.5 font-medium">Status</th></tr></thead>
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
            <thead><tr className="border-b border-[var(--color-border)] text-[var(--color-text-muted)]"><th className="px-3 py-2 font-medium">Employee</th><th className="px-3 py-2 font-medium">Period</th><th className="px-3 py-2 font-medium">Timesheet</th><th className="px-3 py-2 font-medium">Hours in {periodLabel}</th><th className="px-3 py-2 font-medium">Status</th></tr></thead>
            <tbody>{flat.map((r) => <Row key={r.name} r={r} showEmployee onOpen={setOpen} />)}</tbody>
          </table>
        </Card>
      )}

      {open && <Detail sheet={open} readOnly={readOnly} onClose={() => setOpen(null)} onChanged={() => { setOpen(null); q.reload(); }} />}
    </div>
  );
}

export default function Timesheets({ readOnly = false }) {
  const [tab, setTab] = useState("sheets");
  if (readOnly) return <TimesheetList readOnly />;
  return (
    <div className="space-y-4">
      <div className="flex gap-1 border-b border-[var(--color-border)]">
        {[["sheets", "Timesheets"], ["compliance", "Compliance"]].map(([v, l]) => (
          <button key={v} type="button" onClick={() => setTab(v)} className={`-mb-px border-b-2 px-3.5 py-2 text-[13px] font-medium ${tab === v ? "border-[var(--color-red)] text-[var(--color-text)]" : "border-transparent text-[var(--color-text-muted)] hover:text-[var(--color-text)]"}`}>{l}</button>
        ))}
      </div>
      {tab === "sheets" ? <TimesheetList readOnly hrView /> : <TimesheetCompliance />}
    </div>
  );
}

/** Project → { label, manager } for the projects on a timesheet. */
async function projectInfo(ids) {
  if (!ids.length) return {};
  const rows = await frappe.getList("Project", { filters: [["name", "in", ids]], fields: ["name", "project_name", "custom_project_manager", "owner"], limit: 0 })
    .catch(() => frappe.getList("Project", { filters: [["name", "in", ids]], fields: ["name", "project_name", "owner"], limit: 0 }))
    .catch(() => []);
  return Object.fromEntries(rows.map((p) => [p.name, { label: p.project_name || p.name, manager: p.custom_project_manager || p.owner }]));
}

const LINE_TONE = { Approved: "var(--color-green)", Pending: "var(--color-amber)" };

export function Detail({ sheet, onClose, onChanged, readOnly = false, onlyProjects = null }) {
  const { user } = useAuth();
  const q = useAsync(async () => {
    // Project managers are restricted to their own Employee record, so they read the sheet through the review method.
    const doc = await frappe.getDoc("Timesheet", sheet.name).catch((e) => {
      if (e?.response?.data?.exc_type === "PermissionError" || e?.response?.status === 403) return frappe.callMethod("ethx_timesheet_for_review", { timesheet: sheet.name });
      throw e;
    });
    const [projects, owner] = await Promise.all([
      projectInfo([...new Set((doc.time_logs || []).map((l) => l.project).filter(Boolean))]),
      doc.employee ? frappe.getList("Employee", { filters: [["name", "=", doc.employee]], fields: ["user_id"], limit: 1 }).then((r) => r[0]?.user_id || "").catch(() => "") : Promise.resolve(""),
    ]);
    return { doc, projects, ownerUser: owner };
  }, [sheet.name]);
  const d = q.data?.doc;
  const projects = q.data?.projects || {};
  const review = d ? reviewOf(d, null).fields ? reviewOf(d, null) : sheet.review : sheet.review;
  const [mode, setMode] = useState(null); // null | approve | return | finalize | reopen
  const [scope, setScope] = useState(null); // project ids to approve (null = everything I may approve)
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  // Approvals belong to project managers. HR (and admins) only view and download timesheets.
  const hr = false;

  const logs = (d?.time_logs || []).map((l) => ({ ...l, w: parseWorkNote(l.description, { project: l.project, task: l.task }) }));
  const hasNotes = logs.some((l) => l.w.notes);
  const fieldsMode = Boolean(d?.custom_review_status);
  // group lines by project
  const groups = [];
  logs.forEach((l) => {
    const key = l.project || "";
    let g = groups.find((x) => x.key === key);
    if (!g) { g = { key, label: projects[key]?.label || l.w.project || "No project", manager: projects[key]?.manager || "", lines: [], hours: 0 }; groups.push(g); }
    g.lines.push(l);
    g.hours += Number(l.hours || 0);
  });
  groups.forEach((g) => {
    g.pending = fieldsMode ? g.lines.some((l) => l.custom_line_status !== "Approved") : review.key !== "approved";
    // hours without a project are the line manager's to approve - the PM queue only offers them to that manager
    g.mine = Boolean(g.key ? g.manager === user?.email : (onlyProjects || []).includes(""));
  });
  const visibleGroups = onlyProjects ? groups.filter((g) => onlyProjects.includes(g.key)) : groups;
  const myPending = visibleGroups.filter((g) => g.mine && g.pending);
  const overriding = (list) => hr && list.some((g) => g.key && g.manager && g.manager !== user?.email);
  const isOwn = Boolean(q.data?.ownerUser) && q.data.ownerUser === user?.email && user?.email !== "Administrator";
  const submitted = d?.docstatus === 1;
  const canAct = submitted && !readOnly && !isOwn;
  const status = review.key;

  async function confirm() {
    const target = mode === "approve" ? (scope ? myPending.filter((g) => scope.includes(g.key)) : myPending) : [];
    const needsNote = mode === "return" || mode === "reopen" || (mode === "approve" && overriding(target));
    if (needsNote && !note.trim()) return setErr(mode === "approve" ? "Some of these hours belong to another project manager's project - give the reason for the HR override." : mode === "reopen" ? "Give the reason for reopening a finalized timesheet." : "Tell the employee what to correct.");
    setBusy(true);
    setErr("");
    try {
      await reviewTimesheet({ name: sheet.name, action: mode, note: note.trim(), version: Number(d?.custom_review_version) || 0, projects: mode === "approve" && (scope || onlyProjects) ? target.map((g) => g.key) : undefined });
      onChanged();
    } catch (e) {
      setErr(`${e.partial ? `${e.partial} ` : ""}${e.friendly || errMsg(e, "This action was refused.")}`);
      setBusy(false);
      if (e.partial) setTimeout(onChanged, 4000);
    }
  }
  const start = (m, sc = null) => { setMode(m); setScope(sc); setNote(""); setErr(""); };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4" onMouseDown={(e) => e.target === e.currentTarget && !busy && onClose()}>
      <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-[14px] font-semibold text-[var(--color-text)]">{d?.employee_name || sheet.employee_name || "Timesheet"} <span className="font-normal text-[var(--color-text-faint)]">{sheet.name}</span></h2>
            {d && <p className="mt-1 flex flex-wrap items-center gap-2 text-[12px] text-[var(--color-text-muted)]">{dmy(d.start_date)}{d.end_date && d.end_date !== d.start_date ? ` – ${dmy(d.end_date)}` : ""} · {Number(d.total_hours || 0).toFixed(2)} h <Status review={review} /></p>}
            {d?.amended_from && <p className="mt-1 text-[11px] text-[var(--color-text-faint)]">Corrected copy of {d.amended_from}</p>}
            {review.review && <p className="mt-1 text-[12px] text-[var(--color-text-muted)]">Last action by {review.review.by} on {dmy(review.review.at)}{review.review.note ? ` - “${review.review.note}”` : ""}</p>}
          </div>
          <button type="button" onClick={onClose} disabled={busy} className="text-[var(--color-text-muted)] hover:text-[var(--color-text)]"><X size={16} /></button>
        </div>
        {q.loading && !d && <p className="py-6 text-center text-[13px] text-[var(--color-text-muted)]">Loading…</p>}
        {q.error && <p className="text-[13px] text-[var(--color-text-muted)]">{friendlyError(q.error)}</p>}
        {d && visibleGroups.map((g) => (
          <div key={g.key || "none"} className="mb-4 rounded-lg border border-[var(--color-border)]">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--color-border)] px-3 py-2">
              <div className="text-[12.5px] text-[var(--color-text)]"><b className="font-medium">{g.label}</b> · {g.hours.toFixed(2)} h<span className="ml-2 text-[11px] text-[var(--color-text-faint)]">Approver: {g.manager || "HR"}</span></div>
              <div className="flex items-center gap-2">
                {fieldsMode && submitted && <span className="text-[11px]" style={{ color: g.pending ? LINE_TONE.Pending : LINE_TONE.Approved }}>{g.pending ? "Pending" : "Approved"}</span>}
                {canAct && !mode && g.mine && g.pending && fieldsMode && status !== "finalized" && groups.length > 1 && <Button variant="secondary" className="!px-2 !py-1 text-[11px]" onClick={() => start("approve", [g.key])}><Check size={12} /> Approve {g.label}</Button>}
              </div>
            </div>
            <table className="w-full text-left text-[12px]">
              <thead><tr className="text-[var(--color-text-muted)]"><th className="px-3 py-1.5 font-medium">Date</th><th className="px-3 py-1.5 font-medium">Task</th><th className="px-3 py-1.5 font-medium">Hours</th>{hasNotes && <th className="px-3 py-1.5 font-medium">Notes</th>}{fieldsMode && <th className="px-3 py-1.5 font-medium">Approved by</th>}</tr></thead>
              <tbody>
                {g.lines.map((l) => (
                  <tr key={l.name} className="border-t border-[var(--color-border)]">
                    <td className="whitespace-nowrap px-3 py-1.5 text-[var(--color-text)]">{dmy(l.from_time)}</td>
                    <td className="px-3 py-1.5 text-[var(--color-text-muted)]">{l.w.task || "—"}</td>
                    <td className="px-3 py-1.5 text-[var(--color-text)]">{Number(l.hours || 0).toFixed(2)}</td>
                    {hasNotes && <td className="px-3 py-1.5 text-[var(--color-text-muted)]">{l.w.notes || "—"}</td>}
                    {fieldsMode && <td className="px-3 py-1.5 text-[11px] text-[var(--color-text-faint)]">{l.custom_line_status === "Approved" ? l.custom_line_approver || "✓" : "—"}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
        {d && !logs.length && <p className="py-4 text-[13px] text-[var(--color-text-muted)]">No time entries.</p>}

        {d && d.docstatus === 0 && <p className="mt-2 text-[12px] text-[var(--color-text-faint)]">This timesheet is still a draft - the employee hasn't submitted it yet.</p>}
        {isOwn && <p className="mt-2 text-[12px] text-[var(--color-text-faint)]">This is your own timesheet - someone else has to review it.</p>}
        {canAct && (
          <div className="mt-3 border-t border-[var(--color-border)] pt-4">
            {!mode ? (
              <div className="flex flex-wrap justify-end gap-2">
                {status === "finalized" ? (hr && <Button variant="secondary" onClick={() => start("reopen")}><Undo2 size={14} /> Reopen</Button>) : <>
                  {myPending.length > 0 && <Button variant="secondary" onClick={() => start("return")}><Undo2 size={14} /> Return for correction</Button>}
                  {hr && status === "approved" && fieldsMode && <Button variant="secondary" onClick={() => start("finalize")}><Lock size={14} /> Finalize &amp; lock</Button>}
                  {myPending.length > 0 && <Button onClick={() => start("approve")}><Check size={14} /> {myPending.length < visibleGroups.filter((g) => g.pending).length || !hr ? "Approve my projects" : "Approve all"}</Button>}
                  {!myPending.length && status !== "approved" && <span className="text-[12px] text-[var(--color-text-faint)]">Nothing here for you to approve.</span>}
                </>}
              </div>
            ) : (
              <div className="space-y-2">
                {mode === "approve" && overriding(scope ? myPending.filter((g) => scope.includes(g.key)) : myPending) && <p className="rounded-md border border-[var(--color-border-strong)] bg-[var(--color-surface-2)] px-3 py-2 text-[12px] text-[var(--color-amber)]">HR override: some of these hours are on another project manager's project. The reason is recorded on the timesheet.</p>}
                <label className="block text-[12px] text-[var(--color-text-muted)]">
                  {{ approve: "Note (optional unless overriding)", return: "What should the employee correct? (required)", finalize: "Note (optional)", reopen: "Why reopen? (required)" }[mode]}
                  <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} autoFocus className="mt-1 w-full rounded-md border border-[var(--color-border-strong)] bg-[var(--color-surface-2)] px-3 py-2 text-[13px] text-[var(--color-text)] outline-none focus:border-[var(--color-red)]" />
                </label>
                {mode === "return" && <p className="text-[11px] text-[var(--color-text-faint)]">This cancels {sheet.name} (including any project approvals) and gives the employee an editable corrected copy with your note, which they resubmit.</p>}
                {mode === "finalize" && <p className="text-[11px] text-[var(--color-text-faint)]">Finalized timesheets are locked: they can't be returned or cancelled until HR reopens them.</p>}
                {err && <p className="rounded-md border border-[var(--color-red-deep)] bg-[var(--color-red-wash)] px-3 py-2 text-[12px] text-[var(--color-red-hover)]">{err}</p>}
                <div className="flex justify-end gap-2">
                  <Button variant="ghost" disabled={busy} onClick={() => setMode(null)}>Back</Button>
                  <Button disabled={busy} onClick={confirm}>{busy ? "Working…" : { approve: scope ? "Approve these hours" : "Approve", return: "Return to employee", finalize: "Finalize", reopen: "Reopen" }[mode]}</Button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}