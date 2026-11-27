import { useEffect, useMemo, useState } from "react";
import { CalendarCheck, Check, Edit3, Filter, Lock, Plus, RefreshCw, Trash2, X } from "lucide-react";
import { frappe } from "../../lib/api/frappeClient";
import { errMsg, getCheckinsBetween, hm, isoDate, punchDayStatus, summariseCheckins } from "../../lib/employeePortal";
import { PageHeader, Panel, Stat, StatusPill } from "../../components/employee/EmployeeShell";
import { BarList, ColumnChart } from "../../components/charts/Charts";
import { MonthCalendar, StatusCards, TeamToday } from "../../components/hr/AttendanceCharts";
import { attendanceRate, hoursOf, statusMeta } from "../../lib/attendanceStatus";
import { FULL_DAY_HOURS } from "../../lib/attendanceSetup";
import { attendanceDecider } from "../../lib/attendanceDeciders";
import { useAuth } from "../../context/AuthContext";
import { hasPermission } from "../../permissions/roles";
import { HrRecordForm } from "../../components/hr/HrRecordForm";
import { Button, Card } from "../../components/ui/primitives";
import { alertDialog, confirmDialog } from "../../components/ui/dialogs";

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
  const [statusFilter, setStatusFilter] = useState(null); // show only this status in the table
  const [dayFilter, setDayFilter] = useState(null); // show only this day (picked on the calendar)
  const [people, setPeople] = useState([]); // active employees HR can see (for "Team today")
  const { user } = useAuth();
  // Who may decide whose attendance (lib/attendanceDeciders.js): not your own, and HR staff's only by their manager.
  const [decide, setDecide] = useState(() => () => ({ ok: true }));

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
          frappe.getList("Employee", { fields: ["name", "employee_name", "company", "user_id", "reports_to", "leave_approver", "status"], limit: 0 }), // only employees this HR user may see
        ]);
        const decider = await attendanceDecider(visible, { admin: hasPermission(user, "dashboard.admin") });
        setDecide(() => decider);
        const known = new Map(visible.map((e) => [e.name, e]));
        setPeople(visible.filter((e) => !e.status || e.status === "Active").map((e) => ({ id: e.name, label: e.employee_name || e.name })));
        const have = new Set(att.map((r) => `${r.employee}|${r.attendance_date}`));
        punches = summariseCheckins(logs);
        derived = summariseCheckins(logs.filter((l) => known.has(l.employee)))
          .filter((d) => !have.has(`${d.employee}|${d.attendance_date}`))
          .map((d) => ({ ...d, name: `punch-${d.employee}-${d.attendance_date}`, employee_name: known.get(d.employee).employee_name, company: known.get(d.employee).company, status: punchDayStatus(d), derived: true, in_time: d.in_time, out_time: d.stillIn ? null : d.out_time, working_hours: d.working_hours, stillIn: d.stillIn }));
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
  const rate = attendanceRate(summary);
  const shown = visible.filter((r) => (!statusFilter || r.status === statusFilter) && (!dayFilter || r.attendance_date === dayFilter));
  const byDate = useMemo(() => new Map(visible.map((r) => [r.attendance_date, r])), [visible]);
  const today = isoDate();
  const avg = (list) => (list.length ? Math.round((list.reduce((a, b) => a + b, 0) / list.length) * 10) / 10 : null);
  const avgHours = avg(visible.map(hoursOf).filter((h) => h !== null));
  const ins = visible.filter((r) => r.in_time).map((r) => { const [h, m] = String(r.in_time).slice(11, 16).split(":").map(Number); return h * 60 + m; }).filter((n) => !Number.isNaN(n));
  const avgIn = ins.length ? Math.round(ins.reduce((a, b) => a + b, 0) / ins.length) : null;
  const clock = (mins) => `${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`;
  const hoursRows = month === "all"
    ? MONTHS.map((m, i) => ({ key: m, label: m, value: avg(yearRecords.filter((r) => r.month === i).map(hoursOf).filter((h) => h !== null)) || 0 }))
    : Array.from({ length: new Date(year, month + 1, 0).getDate() }, (_, i) => { const key = `${year}-${String(month + 1).padStart(2, "0")}-${String(i + 1).padStart(2, "0")}`; const r = byDate.get(key); return { key: String(i + 1), label: String(i + 1), value: (r && hoursOf(r)) || 0 }; });
  const attendedByMonth = MONTHS.map((m, i) => ({ key: m, label: m, value: yearRecords.filter((r) => r.month === i && ["Present", "Work From Home", "Half Day"].includes(r.status)).length }));
  const statusRows = Object.entries(summary).map(([key, value]) => ({ key, label: statusMeta(key).label, value })).sort((a, b) => b.value - a.value);
  const todayRows = rows.filter((r) => r.attendance_date === today);
  const teamPeople = (people.length ? people : employees.map((e) => ({ id: e.id, label: e.label }))).map((p) => ({ ...p, hasRecords: employees.some((e) => e.id === p.id) })).sort((a, b) => a.label.localeCompare(b.label));

  // Full days (8 h or more) are confirmed as Present; shorter days and missed punch-outs are HR's call: Present or Absent.
  const rule = current ? decide(current.id, user?.email) : { ok: true };
  const unconfirmed = rule.ok ? visible.filter((r) => r.derived && r.status === "Present") : [];
  const toDecide = rule.ok ? visible.filter((r) => r.derived && (r.status === "Short Hours" || r.status === "Missed Punch Out")) : [];
  async function remove(row) { if (Number(row.docstatus) !== 0) return; if (!(await confirmDialog(`Delete attendance for ${row.employee_name || row.employee || row.name} on ${row.attendance_date}?`))) return; try { await frappe.deleteDoc("Attendance", row.name); load(); } catch (error) { alertDialog({ tone: "error", message: errMsg(error, "Couldn't delete this attendance record.") }); } }
  async function confirmRows(list, status = "Present") {
    if (!list.length) return;
    const who = list.length === 1 ? `${list[0].employee_name || list[0].employee} on ${list[0].label || list[0].attendance_date}` : `${list.length} days`;
    const why = status === "Present" && list.some((r) => r.status !== "Present") ? ` ${list.length === 1 ? "This day has" : "These days have"} under ${FULL_DAY_HOURS} hours or no punch out.` : "";
    if (!(await confirmDialog({ title: `Mark ${status}`, message: `Mark ${who} as ${status}?${why}`, confirmLabel: `Mark ${status}` }))) return;
    setConfirming(true);
    let failed = 0;
    let last = "";
    for (const r of list) {
      try {
        const times = status === "Absent" ? {} : { in_time: r.in_time || undefined, out_time: r.stillIn ? undefined : r.out_time || undefined, working_hours: r.working_hours || undefined };
        const doc = await frappe.createDoc("Attendance", { employee: r.employee, attendance_date: r.attendance_date, status, company: r.company, ...times });
        await frappe.submitDoc(await frappe.getDoc("Attendance", doc.name));
      } catch (e) { failed += 1; last = e?.response?.data?.exception || e.message || ""; }
    }
    setConfirming(false);
    if (failed) alertDialog({ tone: "error", message: `${failed} day(s) could not be saved. ${last}` });
    load();
  }
  function closeForm() { setFormOpen(false); setEditing(null); }
  function pickEmployee(id) { setActiveEmployee(id); setYearSel(null); setMonthSel(null); setStatusFilter(null); setDayFilter(null); }
  function pickMonth(m) { setMonthSel(m); setDayFilter(null); }
  const clearFilters = () => { setStatusFilter(null); setDayFilter(null); };

  return <div className="space-y-5">
    <PageHeader icon={CalendarCheck} title="Attendance" subtitle="Who was in, who wasn't, and the punches behind each day" actions={<>{unconfirmed.length > 0 && <Button variant="secondary" onClick={() => confirmRows(unconfirmed)} disabled={confirming}><Check size={14} /> {confirming ? "Saving…" : `Confirm ${unconfirmed.length} full ${unconfirmed.length === 1 ? "day" : "days"}`}</Button>}<Button variant="secondary" onClick={load} disabled={state === "loading"}><RefreshCw size={14} /> Refresh</Button><Button onClick={() => { setEditing(null); setFormOpen(true); }}><Plus size={14} /> Mark Attendance</Button></>} />
    {formOpen && <HrRecordForm doctype="Attendance" submittable fields={FIELDS} recordName={editing} onCancel={closeForm} onSaved={() => { closeForm(); load(); }} />}

    {state === "loading" && <Card><div className="flex h-32 items-center justify-center text-[13px] text-[var(--color-text-muted)]">Loading attendance...</div></Card>}
    {state === "error" && <Card><div className="p-6 text-[13px] text-[var(--color-text-muted)]">Could not load attendance records. Check your permissions and connection.</div></Card>}
    {state === "ready" && employees.length === 0 && <Card><div className="flex h-32 items-center justify-center text-[13px] text-[var(--color-text-muted)]">No attendance records found.</div></Card>}

    {state === "ready" && teamPeople.length > 0 && <TeamToday people={teamPeople} todayRows={todayRows} todayLabel={parseDate(today).label} onOpen={pickEmployee} />}

    {state === "ready" && current && <>
      {/* Employee tabs */}
      <div role="tablist" aria-label="Employees" className="flex gap-1 overflow-x-auto border-b border-[var(--color-border)]">
        {employees.map((emp) => {
          const active = emp.id === current.id;
          return <button key={emp.id} role="tab" aria-selected={active} type="button" onClick={() => pickEmployee(emp.id)}
            className={`-mb-px flex shrink-0 items-center gap-2 border-b-2 px-3.5 py-2 text-[13px] font-medium transition-colors ${active ? "border-[var(--color-red)] text-[var(--color-text)]" : "border-transparent text-[var(--color-text-muted)] hover:text-[var(--color-text)]"}`}>
            {emp.label}
            {!decide(emp.id, user?.email).ok && <Lock size={11} className="text-[var(--color-text-faint)]" aria-label="View only" />}
            <span className="rounded-full bg-[var(--color-surface-2)] px-1.5 py-0.5 text-[10px] text-[var(--color-text-muted)]">{emp.records.length}</span>
          </button>;
        })}
      </div>

      {/* Year + month filter and totals on compact rows */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <select value={year} onChange={(e) => { setYearSel(Number(e.target.value)); setMonthSel(null); setDayFilter(null); }} aria-label="Year"
          className="rounded-md border border-[var(--color-border-strong)] bg-[var(--color-surface-2)] px-2.5 py-1 text-[12px] text-[var(--color-text)] outline-none focus:border-[var(--color-red)]">
          {years.map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
        <div className="flex gap-1 overflow-x-auto">
          {MONTHS.map((m, i) => <button key={m} type="button" disabled={!monthCounts[i]} onClick={() => pickMonth(i)} className={`${chip(month === i)} disabled:opacity-30 disabled:pointer-events-none`}>{m}{monthCounts[i] ? <span className="ml-1 text-[10px] text-[var(--color-text-faint)]">{monthCounts[i]}</span> : null}</button>)}
          <button type="button" onClick={() => pickMonth("all")} className={chip(month === "all")}>Whole Year</button>
        </div>
      </div>
      <div className={`grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 ${1 + 5 + ["Short Hours", "Missed Punch Out", "Working"].filter((s) => summary[s]).length > 6 ? "xl:grid-cols-4" : "xl:grid-cols-6"}`}>
        <Stat icon={CalendarCheck} label="Attendance Rate" value={rate === null ? "—" : `${rate}%`} sub={`${visible.length} ${visible.length === 1 ? "day" : "days"} in this period`} accent="var(--color-green)" />
        <StatusCards counts={summary} total={visible.length} active={statusFilter} onPick={(s) => { setStatusFilter(s); setDayFilter(null); }} />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        {month === "all"
          ? <Panel title={`Days Attended in ${year}`} hint="Present, WFH and half days, by month"><ColumnChart rows={attendedByMonth} /></Panel>
          : <Panel title={`${MONTHS[month]} ${year}`} hint="Each day by status · click a day to see only that day"><MonthCalendar year={year} month={month} byDate={byDate} today={today} statusFilter={statusFilter} activeDay={dayFilter} onPickDay={setDayFilter} /></Panel>}
        <Panel title="Days by Status" hint="Click a status to see only those days"><BarList rows={statusRows} onPick={(r) => { setStatusFilter(statusFilter === r.key ? null : r.key); setDayFilter(null); }} /></Panel>
        <Panel title={month === "all" ? "Average Hours by Month" : "Hours Worked"} hint={`Average in ${avgIn === null ? "—" : clock(avgIn)} · ${avgHours === null ? "no punch-outs yet" : `${avgHours} h a day`}`}>
          <ColumnChart rows={hoursRows} format={(v) => `${v} h`} />
        </Panel>
      </div>

      {!rule.ok && (
        <div className="flex items-center gap-2.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3.5 py-2.5 text-[12px] text-[var(--color-text)]">
          <Lock size={14} className="shrink-0 text-[var(--color-text-muted)]" />
          <span><b>{current.label}</b> - view only. {rule.reason}</span>
        </div>
      )}
      {toDecide.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[color-mix(in_srgb,var(--color-amber)_40%,transparent)] bg-[color-mix(in_srgb,var(--color-amber)_8%,transparent)] px-3.5 py-2.5">
          <p className="text-[12px] text-[var(--color-text)]"><b>{toDecide.length}</b> {toDecide.length === 1 ? "day is" : "days are"} under {FULL_DAY_HOURS} hours or missing a punch out. They aren't marked automatically - decide each one, or all of them here.</p>
          <div className="flex gap-2">
            <Button variant="secondary" disabled={confirming} onClick={() => confirmRows(toDecide, "Present")}><Check size={14} /> Mark All Present</Button>
            <Button variant="secondary" disabled={confirming} onClick={() => confirmRows(toDecide, "Absent")}><X size={14} /> Mark All Absent</Button>
          </div>
        </div>
      )}

      {/* Records for the selected employee / period, narrowed by the status card, bar or calendar day picked above */}
      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--color-border)] px-3.5 py-2.5">
          <p className="flex flex-wrap items-center gap-2 text-[12px] text-[var(--color-text-muted)]">
            <Filter size={13} />
            {statusFilter || dayFilter ? <>Showing <b className="text-[var(--color-text)]">{shown.length}</b> of {visible.length} days {statusFilter && <StatusPill status={statusFilter} />}{dayFilter && <StatusPill status={parseDate(dayFilter).label} />}</>
              : <>All <b className="text-[var(--color-text)]">{visible.length}</b> days · click a status card, bar or calendar day to filter</>}
          </p>
          {(statusFilter || dayFilter) && <Button variant="ghost" className="!px-2 !py-1 !text-[12px]" onClick={clearFilters}><X size={12} /> Clear filter</Button>}
        </div>
        {visible.length === 0 ? <div className="flex h-24 items-center justify-center text-[13px] text-[var(--color-text-muted)]">No attendance records found.</div> :
        shown.length === 0 ? <div className="flex h-24 flex-col items-center justify-center gap-1 text-[13px] text-[var(--color-text-muted)]">No {statusFilter ? statusMeta(statusFilter).label : ""} days in this period.<button type="button" onClick={clearFilters} className="text-[12px] text-[var(--color-red-hover)] hover:underline">Show all days</button></div> :
        <div className="overflow-x-auto"><table className="w-full text-left text-[12.5px]">
          <thead><tr className="border-b border-[var(--color-border)] bg-[var(--color-surface-2)] text-[10.5px] uppercase tracking-wide text-[var(--color-text-faint)]"><th className="whitespace-nowrap px-3.5 py-2.5 font-semibold">Date</th><th className="px-3.5 py-2.5 font-semibold">Status</th><th className="px-3.5 py-2.5 font-semibold">In / Out</th><th className="px-3.5 py-2.5 font-semibold">Hours</th><th className="px-3.5 py-2.5 font-semibold">Company</th><th className="w-28 px-3.5 py-2.5" /></tr></thead>
          <tbody>
            {shown.map((row) => <tr key={row.name} className="border-b border-[var(--color-border)] transition-colors last:border-0 hover:bg-[color-mix(in_srgb,var(--color-surface-2)_60%,transparent)]">
              <td className="whitespace-nowrap px-3.5 py-2 text-[var(--color-text)]">{row.label}{row.attendance_date === today && <span className="ml-2 text-[10.5px] font-semibold uppercase text-[var(--color-red-hover)]">Today</span>}</td>
              <td className="px-3.5 py-2" title={row.status}><StatusPill status={row.status} />{row.derived && <span className="ml-2 rounded bg-[var(--color-surface-2)] px-1.5 py-0.5 text-[10px] font-normal text-[var(--color-amber)]">{row.status === "Present" ? "Unconfirmed" : "Not marked"}</span>}</td>
              <td className="px-3.5 py-2 tabular-nums text-[var(--color-text-muted)]">{row.in_time ? `${hm(row.in_time)} – ${row.stillIn ? "…" : hm(row.out_time) || "…"}` : "—"}</td>
              <td className="px-3.5 py-2 tabular-nums text-[var(--color-text-muted)]">{hoursOf(row) ?? "—"}{hoursOf(row) !== null && " h"}</td>
              <td className="px-3.5 py-2 text-[var(--color-text-muted)]">{row.company}</td>
              <td className="px-3.5 py-2">{!rule.ok ? <div className="flex justify-end" title={rule.reason}><Lock size={12} className="text-[var(--color-text-faint)]" /></div> : row.derived ? <div className="flex justify-end gap-1">{row.status === "Working" ? <span className="text-[11px] text-[var(--color-text-faint)]">In progress</span> : row.status === "Present" ? <button type="button" title="Confirm as Present" disabled={confirming} onClick={() => confirmRows([row])} className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] transition-colors hover:border-[var(--color-border-strong)] hover:bg-[var(--color-surface-2)] text-[var(--color-green)]"><Check size={14} /></button> : <><button type="button" title="Mark this day Present" disabled={confirming} onClick={() => confirmRows([row], "Present")} className="whitespace-nowrap rounded border border-[color-mix(in_srgb,var(--color-green)_40%,transparent)] px-1.5 py-0.5 text-[10.5px] font-medium text-[var(--color-green)] hover:bg-[color-mix(in_srgb,var(--color-green)_12%,transparent)]">Present</button><button type="button" title="Mark this day Absent" disabled={confirming} onClick={() => confirmRows([row], "Absent")} className="whitespace-nowrap rounded border border-[color-mix(in_srgb,var(--color-red)_40%,transparent)] px-1.5 py-0.5 text-[10.5px] font-medium text-[var(--color-red-hover)] hover:bg-[var(--color-red-wash)]">Absent</button></>}</div> : <div className="flex justify-end gap-0.5"><button type="button" title="Edit attendance" onClick={() => { setEditing(row.name); setFormOpen(true); }} className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] transition-colors hover:border-[var(--color-border-strong)] hover:bg-[var(--color-surface-2)] text-[var(--color-text-muted)] hover:text-[var(--color-text)]"><Edit3 size={13} /></button>{Number(row.docstatus) === 0 && <button type="button" title="Delete draft" onClick={() => remove(row)} className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] transition-colors hover:border-[var(--color-border-strong)] hover:bg-[var(--color-surface-2)] text-[var(--color-text-muted)] hover:!text-[var(--color-red-hover)]"><Trash2 size={13} /></button>}</div>}</td>
            </tr>)}
          </tbody>
        </table></div>}
      </Card>
    </>}
  </div>;
}