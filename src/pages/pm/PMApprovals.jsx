// Project Manager › Approvals: timesheet hours on the PM's own projects only (gap G04). Each PM approves their
// project's lines; the timesheet becomes Approved once every project on it is approved.
import { useMemo, useState } from "react";
import { CheckCheck } from "lucide-react";
import { frappe } from "../../lib/api/frappeClient";
import { Async, chipCls, Empty, Grid, Notice, PageHeader, Panel, StatusPill } from "../../components/employee/EmployeeShell";
import { dmy, useAsync } from "../../lib/employeePortal";
import { reviewOf } from "../../lib/timesheets";
import { Detail } from "../hr/Timesheets";

async function loadQueue() {
  try {
    return { rows: await frappe.callMethod("ethx_pm_timesheet_queue"), ready: true };
  } catch (e) {
    const missing = e?.response?.status === 404 || /not found|not whitelisted|has no attribute|Failed to get method|No module named/i.test(String(e?.response?.data?.exception || ""));
    if (missing) return { rows: [], ready: false };
    throw e;
  }
}

export default function PMApprovals() {
  const q = useAsync(loadQueue, []);
  const [filter, setFilter] = useState("pending");
  const [open, setOpen] = useState(null);

  const sheets = useMemo(() => {
    const map = new Map();
    (q.data?.rows || []).forEach((r) => {
      const s = r.sheet;
      const g = map.get(s.name) || { ...s, name: s.name, review: reviewOf(s, null), projects: new Set(), hours: 0, mine: 0, mineApproved: 0 };
      g.projects.add(r.project || ""); // "" = hours without a project (yours as their line manager)
      g.hours += Number(r.hours) || 0;
      g.mine += 1;
      if (r.custom_line_status === "Approved") g.mineApproved += 1;
      map.set(s.name, g);
    });
    return [...map.values()].map((g) => ({ ...g, projects: [...g.projects], myState: g.docstatus === 0 ? "Draft" : g.mineApproved === g.mine ? "Approved" : "Pending" }))
      .sort((a, b) => String(b.start_date).localeCompare(String(a.start_date)));
  }, [q.data]);
  const shown = sheets.filter((s) => (filter === "pending" ? s.myState === "Pending" && !["returned", "finalized"].includes(s.review.key) : filter === "approved" ? s.myState === "Approved" : true));
  const pendingCount = sheets.filter((s) => s.myState === "Pending" && !["returned", "finalized"].includes(s.review.key)).length;

  return (
    <>
      <PageHeader icon={CheckCheck} title="Timesheet Approvals" subtitle="Hours logged on your projects. Approve your part; HR sees the whole timesheet." />
      {q.data && !q.data.ready && <Notice>Per-project timesheet approval isn't enabled yet. It's set up automatically the next time the Administrator signs in (server-side rules must be enabled on the site).</Notice>}
      <Panel>
        <div className="mb-4 flex gap-2">{[["pending", `Awaiting You${pendingCount ? ` (${pendingCount})` : ""}`], ["approved", "Approved by You"], ["all", "All"]].map(([v, l]) => <button key={v} type="button" onClick={() => setFilter(v)} className={chipCls(filter === v)}>{l}</button>)}</div>
        <Async state={q}>
          {() => shown.length === 0 ? <Empty text={filter === "pending" ? "Nothing waiting for your approval." : "Nothing here."} /> : <Grid rows={shown} columns={[
            { key: "employee_name", label: "Employee", render: (s) => <button type="button" onClick={() => setOpen(s)} className="text-left hover:underline">{s.employee_name || s.employee}<span className="block text-[11px] text-[var(--color-text-faint)]">{s.name}</span></button> },
            { key: "period", label: "Period", render: (s) => `${dmy(s.start_date)} – ${dmy(s.end_date)}` },
            { key: "projects", label: "Your Projects", render: (s) => <span className="text-[11.5px]">{s.projects.map((p) => p || "No project (your report)").join(", ")}</span> },
            { key: "hours", label: "Hours on Them", render: (s) => s.hours.toFixed(2) },
            { key: "mine", label: "Your Approval", render: (s) => <StatusPill status={s.myState} /> },
            { key: "sheet", label: "Whole Timesheet", render: (s) => <StatusPill status={s.review.label} /> },
          ]} />}
        </Async>
      </Panel>
      {open && <Detail sheet={{ ...open, review: open.review }} onlyProjects={open.projects} onClose={() => setOpen(null)} onChanged={() => { setOpen(null); q.reload(); }} />}
    </>
  );
}