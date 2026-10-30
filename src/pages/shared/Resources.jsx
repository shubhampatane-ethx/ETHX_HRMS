// Resources: for a month, each person's capacity (working days minus holidays and approved leave), hours assigned to
// projects (Project Manager assignments) and hours actually approved on timesheets - so planned load and real
// utilisation are kept apart (gap G08). Bench = active people with nothing assigned in the month.
import { useMemo, useState } from "react";
import { Download, Gauge, Users } from "lucide-react";
import { Button } from "../../components/ui/primitives";
import { Async, chipCls, Grid, inputCls, PageHeader, Panel, Stat } from "../../components/employee/EmployeeShell";
import { MONTHS, pad, useAsync } from "../../lib/employeePortal";
import { listAssignments, parseAssignment } from "../../lib/assignments";
import { frappe } from "../../lib/api/frappeClient";
import { downloadCsv } from "../../lib/recruitment";
import { loadMonth, summarise } from "../hr/TimesheetCompliance";

const ACTIVE = ["Open", "Working", "Pending Review", "Overdue", "Completed"];

function weekdaysBetween(from, to) {
  let n = 0;
  for (let d = new Date(`${from}T00:00:00`); d <= new Date(`${to}T00:00:00`); d.setDate(d.getDate() + 1)) if (![0, 6].includes(d.getDay())) n += 1;
  return n;
}

export default function Resources() {
  const now = new Date();
  const [ym, setYm] = useState({ y: now.getFullYear(), m: now.getMonth() });
  const [filter, setFilter] = useState("all");
  const data = useAsync(async () => {
    const [month, tasks, projects] = await Promise.all([loadMonth(ym.y, ym.m), listAssignments().catch(() => []), frappe.getList("Project", { fields: ["name", "project_name"], limit: 0 }).catch(() => [])]);
    const title = Object.fromEntries(projects.map((p) => [p.name, p.project_name || p.name]));
    return { month, assignments: tasks.map(parseAssignment).map((a) => ({ ...a, projectTitle: title[a.project] || a.project })) };
  }, [ym.y, ym.m]);

  const rows = useMemo(() => {
    if (!data.data) return [];
    const { month, assignments } = data.data;
    const { from, to } = month;
    return summarise(month).map((p) => {
      const mine = assignments.filter((a) => a.assignees.includes(p.user_id) && ACTIVE.includes(a.status) && a.start && a.end && a.start <= to && a.end >= from);
      const assigned = mine.reduce((s, a) => s + a.hoursPerDay * weekdaysBetween(a.start > from ? a.start : from, a.end < to ? a.end : to), 0);
      const load = p.expected ? (assigned / p.expected) * 100 : 0;
      const util = p.expected ? (p.approved / p.expected) * 100 : 0;
      return { ...p, projects: [...new Set(mine.map((a) => a.projectTitle))], assigned, load, util, bench: !mine.length, over: assigned > p.expected + 0.01 };
    });
  }, [data.data]);
  const shown = rows.filter((r) => filter === "all" || (filter === "bench" ? r.bench : filter === "over" ? r.over : !r.bench && !r.over));
  const sum = (k) => rows.reduce((s, r) => s + r[k], 0);
  const label = `${MONTHS[ym.m]} ${ym.y}`;

  return (
    <>
      <PageHeader icon={Gauge} title="Resources" subtitle="Capacity vs assigned vs approved hours per person, with bench and over-allocation" actions={<input type="month" className={`${inputCls} !w-auto`} value={`${ym.y}-${pad(ym.m + 1)}`} onChange={(e) => { const [y, m] = e.target.value.split("-").map(Number); if (y) setYm({ y, m: m - 1 }); }} />} />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat icon={Users} label="People" value={data.data ? rows.length : undefined} sub={`${rows.filter((r) => r.bench).length} on the bench`} accent="#4f8cff" />
        <Stat icon={Gauge} label="Planned load" value={data.data ? `${sum("expected") ? Math.round((sum("assigned") / sum("expected")) * 100) : 0}%` : undefined} sub="Assigned ÷ capacity" accent="var(--color-amber)" />
        <Stat icon={Gauge} label="Actual utilisation" value={data.data ? `${sum("expected") ? Math.round((sum("approved") / sum("expected")) * 100) : 0}%` : undefined} sub="Approved ÷ capacity" accent="var(--color-green)" />
        <Stat icon={Users} label="Over-allocated" value={data.data ? rows.filter((r) => r.over).length : undefined} sub="Assigned more than capacity" accent="var(--color-red-hover)" />
      </div>
      <Panel title={label} hint="Capacity = working days (holiday list - weekends are off if it has no weekly offs - or Mon–Fri) minus approved leave × 8 h. Assigned = PM assignments' hours per day × weekdays in the month. Approved = approved timesheet hours." action={<Button variant="secondary" disabled={!shown.length} onClick={() => downloadCsv(`resources-${ym.y}-${pad(ym.m + 1)}.csv`, ["Employee", "ID", "Department", "Capacity h", "Assigned h", "Approved h", "Planned load %", "Utilisation %", "Projects", "Bench"], shown.map((r) => [r.employee_name, r.name, r.department, r.expected, r.assigned.toFixed(1), r.approved.toFixed(1), r.load.toFixed(0), r.util.toFixed(0), r.projects.join("; "), r.bench ? "yes" : ""]))}><Download size={14} /> CSV</Button>}>
        <div className="mb-4 flex gap-2">{[["all", "Everyone"], ["bench", "Bench"], ["over", "Over-Allocated"], ["ok", "Allocated"]].map(([v, l]) => <button key={v} type="button" onClick={() => setFilter(v)} className={chipCls(filter === v)}>{l}</button>)}</div>
        <Async state={data}>
          {() => <Grid rows={shown} empty="No one here." columns={[
            { key: "employee_name", label: "Employee", render: (r) => <span>{r.employee_name}<span className="block text-[11px] text-[var(--color-text-faint)]">{r.department || r.name}</span></span> },
            { key: "expected", label: "Capacity", render: (r) => `${r.expected} h` },
            { key: "assigned", label: "Assigned", render: (r) => <span className={r.over ? "font-medium text-[var(--color-red-hover)]" : ""}>{r.assigned.toFixed(0)} h · {r.load.toFixed(0)}%</span> },
            { key: "approved", label: "Approved", render: (r) => `${r.approved.toFixed(0)} h · ${r.util.toFixed(0)}%` },
            { key: "bar", label: "", render: (r) => <span className="relative block h-2 w-32 overflow-hidden rounded-full bg-[var(--color-surface-2)]" title="dark = approved, light = assigned"><span className="absolute inset-y-0 left-0 bg-[color-mix(in_srgb,var(--color-red)_35%,transparent)]" style={{ width: `${Math.min(100, r.load)}%` }} /><span className="absolute inset-y-0 left-0 bg-[var(--color-red)]" style={{ width: `${Math.min(100, r.util)}%` }} /></span> },
            { key: "projects", label: "Projects", render: (r) => (r.bench ? <span className="text-[var(--color-amber)]">Bench</span> : <span className="text-[11.5px]">{r.projects.join(", ")}</span>) },
          ]} />}
        </Async>
      </Panel>
    </>
  );
}
