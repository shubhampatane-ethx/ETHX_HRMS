// HR › Reports: the questions HR gets asked most, computed from live ERPNext data, each with CSV export.
import { useMemo, useState } from "react";
import { Download, FileBarChart, TrendingDown, UserMinus, UserPlus } from "lucide-react";
import { frappe } from "../../lib/api/frappeClient";
import { Button } from "../../components/ui/primitives";
import { Async, chipCls, Grid, inputCls, PageHeader, Panel, Stat, Tabs } from "../../components/employee/EmployeeShell";
import { MONTHS, isoDate, listTry, pad, useAsync } from "../../lib/employeePortal";
import { downloadCsv } from "../../lib/recruitment";
import { getEntriesBetween, listTimesheets, reviewOf } from "../../lib/timesheets";
import { DAILY_HOURS } from "./TimesheetCompliance";

const EMP_FIELDS = ["name", "employee_name", "department", "designation", "company", "branch", "employment_type", "gender", "status", "date_of_joining", "relieving_date"];
const loadEmployees = () => listTry("Employee", { fields: EMP_FIELDS, orderBy: "employee_name asc" }, ["name", "employee_name", "department", "designation", "company", "status", "date_of_joining", "relieving_date"]);

export default function Reports() {
  const [tab, setTab] = useState("headcount");
  return (
    <div className="space-y-5">
      <PageHeader icon={FileBarChart} title="Reports" subtitle="Headcount, joiners and leavers, leave, attendance and timesheet utilisation - live from ERPNext" />
      <Tabs value={tab} onChange={setTab} tabs={[{ id: "headcount", label: "Headcount" }, { id: "movement", label: "Joiners & leavers" }, { id: "leave", label: "Leave" }, { id: "attendance", label: "Attendance" }, { id: "utilisation", label: "Utilisation" }]} />
      {tab === "headcount" && <Headcount />}
      {tab === "movement" && <Movement />}
      {tab === "leave" && <LeaveReport />}
      {tab === "attendance" && <AttendanceReport />}
      {tab === "utilisation" && <Utilisation />}
    </div>
  );
}

function groupCount(rows, key) {
  const m = new Map();
  rows.forEach((r) => m.set(r[key] || "Not set", (m.get(r[key] || "Not set") || 0) + 1));
  return [...m.entries()].map(([k, n]) => ({ k, n })).sort((a, b) => b.n - a.n);
}

function Headcount() {
  const emps = useAsync(loadEmployees, []);
  const [by, setBy] = useState("department");
  const active = (emps.data || []).filter((e) => e.status === "Active");
  const groups = useMemo(() => groupCount(active, by), [active, by]);
  const max = Math.max(1, ...groups.map((g) => g.n));
  return (
    <Panel title={`Active headcount: ${active.length}`} action={<Button variant="secondary" disabled={!groups.length} onClick={() => downloadCsv(`headcount-by-${by}-${isoDate()}.csv`, [by, "Employees"], groups.map((g) => [g.k, g.n]))}><Download size={14} /> CSV</Button>}>
      <div className="mb-4 flex flex-wrap gap-2">{[["department", "Department"], ["designation", "Designation"], ["company", "Company"], ["branch", "Branch"], ["employment_type", "Employment type"], ["gender", "Gender"]].map(([v, l]) => <button key={v} type="button" onClick={() => setBy(v)} className={chipCls(by === v)}>{l}</button>)}</div>
      <Async state={emps}>
        {() => <div className="space-y-1.5">{groups.map((g) => (
          <div key={g.k} className="flex items-center gap-3 text-[12.5px]"><span className="w-56 shrink-0 truncate text-[var(--color-text)]">{g.k}</span><span className="h-2 flex-1 overflow-hidden rounded-full bg-[var(--color-surface-2)]"><span className="block h-full rounded-full bg-[var(--color-red)]" style={{ width: `${(g.n / max) * 100}%` }} /></span><span className="w-10 text-right text-[var(--color-text)]">{g.n}</span></div>
        ))}{!groups.length && <p className="text-[13px] text-[var(--color-text-muted)]">No active employees.</p>}</div>}
      </Async>
    </Panel>
  );
}

function Movement() {
  const emps = useAsync(loadEmployees, []);
  const [year, setYear] = useState(new Date().getFullYear());
  const months = useMemo(() => Array.from({ length: 12 }, (_, m) => {
    const from = `${year}-${pad(m + 1)}-01`;
    const to = `${year}-${pad(m + 1)}-${pad(new Date(year, m + 1, 0).getDate())}`;
    const all = emps.data || [];
    const joined = all.filter((e) => e.date_of_joining >= from && e.date_of_joining <= to);
    const left = all.filter((e) => e.relieving_date && e.relieving_date >= from && e.relieving_date <= to);
    const atStart = all.filter((e) => e.date_of_joining && e.date_of_joining < from && (!e.relieving_date || e.relieving_date >= from)).length;
    const atEnd = all.filter((e) => e.date_of_joining && e.date_of_joining <= to && (!e.relieving_date || e.relieving_date > to)).length;
    const avg = (atStart + atEnd) / 2;
    return { m, label: MONTHS[m], joined, left, atStart, atEnd, attrition: avg ? (left.length / avg) * 100 : 0 };
  }), [emps.data, year]);
  const totLeft = months.reduce((s, x) => s + x.left.length, 0);
  const totJoined = months.reduce((s, x) => s + x.joined.length, 0);
  const avgHead = months.reduce((s, x) => s + (x.atStart + x.atEnd) / 2, 0) / 12;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Stat icon={UserPlus} label={`Joiners ${year}`} value={emps.data ? totJoined : undefined} sub="By date of joining" accent="var(--color-green)" />
        <Stat icon={UserMinus} label={`Leavers ${year}`} value={emps.data ? totLeft : undefined} sub="By relieving date" accent="var(--color-red-hover)" />
        <Stat icon={TrendingDown} label="Annual attrition" value={emps.data ? `${avgHead ? ((totLeft / avgHead) * 100).toFixed(1) : "0.0"}%` : undefined} sub="Leavers ÷ average headcount" accent="var(--color-amber)" />
      </div>
      <Panel action={<div className="flex gap-2"><select className={`${inputCls} !w-auto`} value={year} onChange={(e) => setYear(Number(e.target.value))}>{Array.from({ length: 4 }, (_, i) => new Date().getFullYear() - i).map((y) => <option key={y}>{y}</option>)}</select><Button variant="secondary" onClick={() => downloadCsv(`joiners-leavers-${year}.csv`, ["Month", "Headcount start", "Joined", "Left", "Headcount end", "Attrition %", "Joiners", "Leavers"], months.map((x) => [x.label, x.atStart, x.joined.length, x.left.length, x.atEnd, x.attrition.toFixed(1), x.joined.map((e) => e.employee_name).join("; "), x.left.map((e) => e.employee_name).join("; ")]))}><Download size={14} /> CSV</Button></div>}>
        <Async state={emps}>
          {() => <Grid rows={months} rowKey={(x) => x.m} columns={[
            { key: "label", label: "Month" }, { key: "atStart", label: "Start" },
            { key: "joined", label: "Joined", render: (x) => <span title={x.joined.map((e) => e.employee_name).join(", ")}>{x.joined.length}</span> },
            { key: "left", label: "Left", render: (x) => <span title={x.left.map((e) => e.employee_name).join(", ")}>{x.left.length}</span> },
            { key: "atEnd", label: "End" }, { key: "attrition", label: "Attrition", render: (x) => `${x.attrition.toFixed(1)}%` },
          ]} />}
        </Async>
      </Panel>
    </div>
  );
}

function LeaveReport() {
  const [year, setYear] = useState(new Date().getFullYear());
  const data = useAsync(() => frappe.getList("Leave Application", { filters: [["docstatus", "=", 1], ["status", "=", "Approved"], ["from_date", ">=", `${year}-01-01`], ["from_date", "<=", `${year}-12-31`]], fields: ["employee", "employee_name", "department", "leave_type", "total_leave_days", "from_date"], limit: 0 }), [year]);
  const types = useMemo(() => [...new Set((data.data || []).map((r) => r.leave_type))].sort(), [data.data]);
  const rows = useMemo(() => {
    const m = new Map();
    (data.data || []).forEach((r) => { const e = m.get(r.employee) || { employee: r.employee, employee_name: r.employee_name, department: r.department, total: 0 }; e[r.leave_type] = (e[r.leave_type] || 0) + Number(r.total_leave_days || 0); e.total += Number(r.total_leave_days || 0); m.set(r.employee, e); });
    return [...m.values()].sort((a, b) => b.total - a.total);
  }, [data.data]);
  return (
    <Panel title={`Approved leave taken in ${year}`} action={<div className="flex gap-2"><select className={`${inputCls} !w-auto`} value={year} onChange={(e) => setYear(Number(e.target.value))}>{Array.from({ length: 4 }, (_, i) => new Date().getFullYear() - i).map((y) => <option key={y}>{y}</option>)}</select><Button variant="secondary" disabled={!rows.length} onClick={() => downloadCsv(`leave-taken-${year}.csv`, ["Employee", "ID", "Department", ...types, "Total days"], rows.map((r) => [r.employee_name, r.employee, r.department, ...types.map((t) => r[t] || 0), r.total]))}><Download size={14} /> CSV</Button></div>}>
      <Async state={data}>
        {() => <Grid rows={rows} rowKey={(r) => r.employee} empty="No approved leave this year." columns={[
          { key: "employee_name", label: "Employee", render: (r) => <span>{r.employee_name}<span className="block text-[11px] text-[var(--color-text-faint)]">{r.department}</span></span> },
          ...types.map((t) => ({ key: t, label: t, render: (r) => r[t] || "—" })),
          { key: "total", label: "Total days", render: (r) => <b>{r.total}</b> },
        ]} />}
      </Async>
    </Panel>
  );
}

function AttendanceReport() {
  const now = new Date();
  const [ym, setYm] = useState({ y: now.getFullYear(), m: now.getMonth() });
  const from = `${ym.y}-${pad(ym.m + 1)}-01`;
  const to = `${ym.y}-${pad(ym.m + 1)}-${pad(new Date(ym.y, ym.m + 1, 0).getDate())}`;
  const data = useAsync(() => frappe.getList("Attendance", { filters: [["docstatus", "=", 1], ["attendance_date", ">=", from], ["attendance_date", "<=", to]], fields: ["employee", "employee_name", "department", "status", "late_entry", "early_exit", "working_hours"], limit: 0 }), [from, to]);
  const rows = useMemo(() => {
    const m = new Map();
    (data.data || []).forEach((r) => {
      const e = m.get(r.employee) || { employee: r.employee, employee_name: r.employee_name, department: r.department, Present: 0, Absent: 0, "Half Day": 0, "On Leave": 0, "Work From Home": 0, late: 0, early: 0, hours: 0 };
      e[r.status] = (e[r.status] || 0) + 1;
      if (Number(r.late_entry)) e.late += 1;
      if (Number(r.early_exit)) e.early += 1;
      e.hours += Number(r.working_hours || 0);
      m.set(r.employee, e);
    });
    return [...m.values()].sort((a, b) => String(a.employee_name).localeCompare(String(b.employee_name)));
  }, [data.data]);
  return (
    <Panel title={`Attendance · ${MONTHS[ym.m]} ${ym.y}`} hint="Confirmed attendance only (HR › Attendance confirms punch-ins)." action={<div className="flex gap-2"><input type="month" className={`${inputCls} !w-auto`} value={`${ym.y}-${pad(ym.m + 1)}`} onChange={(e) => { const [y, m] = e.target.value.split("-").map(Number); if (y) setYm({ y, m: m - 1 }); }} /><Button variant="secondary" disabled={!rows.length} onClick={() => downloadCsv(`attendance-${from.slice(0, 7)}.csv`, ["Employee", "ID", "Department", "Present", "Work from home", "Half day", "On leave", "Absent", "Late entries", "Early exits", "Hours"], rows.map((r) => [r.employee_name, r.employee, r.department, r.Present, r["Work From Home"], r["Half Day"], r["On Leave"], r.Absent, r.late, r.early, r.hours.toFixed(1)]))}><Download size={14} /> CSV</Button></div>}>
      <Async state={data}>
        {() => <Grid rows={rows} rowKey={(r) => r.employee} empty="No attendance recorded for this month." columns={[
          { key: "employee_name", label: "Employee", render: (r) => <span>{r.employee_name}<span className="block text-[11px] text-[var(--color-text-faint)]">{r.department}</span></span> },
          { key: "Present", label: "Present" }, { key: "Work From Home", label: "WFH" }, { key: "Half Day", label: "Half day" }, { key: "On Leave", label: "Leave" },
          { key: "Absent", label: "Absent", render: (r) => <span className={r.Absent ? "text-[var(--color-red-hover)]" : ""}>{r.Absent}</span> },
          { key: "late", label: "Late" }, { key: "early", label: "Early exit" }, { key: "hours", label: "Hours", render: (r) => r.hours.toFixed(1) },
        ]} />}
      </Async>
    </Panel>
  );
}

function Utilisation() {
  const now = new Date();
  const [ym, setYm] = useState({ y: now.getFullYear(), m: now.getMonth() });
  const from = `${ym.y}-${pad(ym.m + 1)}-01`;
  const to = `${ym.y}-${pad(ym.m + 1)}-${pad(new Date(ym.y, ym.m + 1, 0).getDate())}`;
  const data = useAsync(async () => {
    const sheets = await listTimesheets({ filters: [["start_date", "<=", to], ["end_date", ">=", from], ["docstatus", "=", 1]], fields: ["name", "employee", "employee_name", "status", "docstatus"], limit: 0 });
    const entries = await getEntriesBetween(from, to, sheets.map((s) => s.name));
    const projects = await frappe.getList("Project", { fields: ["name", "project_name"], limit: 0 }).catch(() => []);
    return { sheets, entries, projects: Object.fromEntries(projects.map((p) => [p.name, p.project_name || p.name])) };
  }, [from, to]);
  const { rows, byProject } = useMemo(() => {
    const emp = new Map();
    const proj = new Map();
    (data.data?.sheets || []).forEach((s) => {
      const k = reviewOf(s, null).key;
      (data.data.entries.get(s.name) || []).forEach((r) => {
        const approved = k === "approved" || k === "finalized" || r.custom_line_status === "Approved";
        const h = Number(r.hours) || 0;
        const e = emp.get(s.employee) || { employee: s.employee, employee_name: s.employee_name, approved: 0, submitted: 0 };
        e.submitted += h;
        if (approved) e.approved += h;
        emp.set(s.employee, e);
        const p = proj.get(r.project || "") || { project: data.data.projects[r.project] || r.project || "No project", approved: 0, submitted: 0, people: new Set() };
        p.submitted += h;
        if (approved) p.approved += h;
        p.people.add(s.employee);
        proj.set(r.project || "", p);
      });
    });
    return { rows: [...emp.values()].sort((a, b) => b.approved - a.approved), byProject: [...proj.values()].sort((a, b) => b.submitted - a.submitted) };
  }, [data.data]);
  const days = Array.from({ length: new Date(ym.y, ym.m + 1, 0).getDate() }, (_, i) => new Date(ym.y, ym.m, i + 1).getDay()).filter((d) => d !== 0 && d !== 6).length;
  const capacity = days * DAILY_HOURS;
  return (
    <div className="space-y-4">
      <Panel title={`Utilisation · ${MONTHS[ym.m]} ${ym.y}`} hint={`Approved hours ÷ ${capacity} h (${days} weekdays × ${DAILY_HOURS} h). Leave and holidays aren't deducted here - see Timesheets › Compliance for per-person expected hours.`} action={<div className="flex gap-2"><input type="month" className={`${inputCls} !w-auto`} value={`${ym.y}-${pad(ym.m + 1)}`} onChange={(e) => { const [y, m] = e.target.value.split("-").map(Number); if (y) setYm({ y, m: m - 1 }); }} /><Button variant="secondary" disabled={!rows.length} onClick={() => downloadCsv(`utilisation-${from.slice(0, 7)}.csv`, ["Employee", "ID", "Submitted hours", "Approved hours", "Capacity", "Utilisation %"], rows.map((r) => [r.employee_name, r.employee, r.submitted.toFixed(2), r.approved.toFixed(2), capacity, ((r.approved / capacity) * 100).toFixed(1)]))}><Download size={14} /> CSV</Button></div>}>
        <Async state={data}>
          {() => <Grid rows={rows} rowKey={(r) => r.employee} empty="No submitted timesheets this month." columns={[
            { key: "employee_name", label: "Employee" },
            { key: "submitted", label: "Submitted", render: (r) => `${r.submitted.toFixed(1)} h` },
            { key: "approved", label: "Approved", render: (r) => `${r.approved.toFixed(1)} h` },
            { key: "util", label: "Utilisation", render: (r) => { const u = (r.approved / capacity) * 100; return <span className="flex items-center gap-2"><span className="h-1.5 w-24 overflow-hidden rounded-full bg-[var(--color-surface-2)]"><span className="block h-full bg-[var(--color-red)]" style={{ width: `${Math.min(100, u)}%` }} /></span>{u.toFixed(0)}%</span>; } },
          ]} />}
        </Async>
      </Panel>
      <Panel title="By project">
        <Grid rows={byProject} rowKey={(p) => p.project} empty="—" columns={[
          { key: "project", label: "Project" }, { key: "people", label: "People", render: (p) => p.people.size },
          { key: "submitted", label: "Submitted", render: (p) => `${p.submitted.toFixed(1)} h` }, { key: "approved", label: "Approved", render: (p) => `${p.approved.toFixed(1)} h` },
        ]} />
      </Panel>
    </div>
  );
}

