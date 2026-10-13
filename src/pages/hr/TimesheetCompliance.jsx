// Timesheet compliance for a month: everyone who was expected to log time, and where they stand.
// "Missing" (nothing logged) is kept apart from a submitted 0 h, drafts, returned sheets, pending and approved hours,
// so a missed month never reads as "0 hours worked" (gap G05).
import { useMemo, useState } from "react";
import { Download, ShieldCheck } from "lucide-react";
import { frappe } from "../../lib/api/frappeClient";
import { Button } from "../../components/ui/primitives";
import { Async, chipCls, Grid, inputCls, Notice, Panel, StatusPill } from "../../components/employee/EmployeeShell";
import { listTry, MONTHS, pad, useAsync } from "../../lib/employeePortal";
import { getEntriesBetween, listTimesheets, reviewOf } from "../../lib/timesheets";
import { downloadCsv } from "../../lib/recruitment";

/** Standard hours per working day used for "expected hours". */
export const DAILY_HOURS = 8;

const isoOf = (y, m, d) => `${y}-${pad(m + 1)}-${pad(d)}`;
const daysIn = (y, m) => new Date(y, m + 1, 0).getDate();

async function holidaysByList(lists, from, to) {
  const out = {};
  if (!lists.length) return out;
  const weekly = {};
  const add = (list, h) => { (out[list] ||= new Set()).add(h.holiday_date); if (Number(h.weekly_off)) weekly[list] = true; };
  try {
    const rows = await frappe.getList("Holiday", { parent: "Holiday List", filters: [["parent", "in", lists], ["holiday_date", ">=", from], ["holiday_date", "<=", to]], fields: ["parent", "holiday_date", "weekly_off"], limit: 0 });
    rows.forEach((r) => add(r.parent, r));
  } catch {
    for (const l of lists) {
      try {
        const d = await frappe.getDoc("Holiday List", l);
        (d.holidays || []).filter((h) => h.holiday_date >= from && h.holiday_date <= to).forEach((h) => add(l, h));
      } catch { /* unreadable list - treat as no holidays */ }
    }
  }
  // A list with no weekly offs in the month (only public holidays entered) would make weekends working days:
  // treat Saturday and Sunday as off for it.
  for (const l of lists) {
    if (weekly[l]) continue;
    const set = (out[l] ||= new Set());
    for (let d = new Date(`${from}T00:00:00`); d <= new Date(`${to}T00:00:00`); d.setDate(d.getDate() + 1)) {
      if ([0, 6].includes(d.getDay())) set.add(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`);
    }
  }
  return out;
}

export async function loadMonth(year, month) {
  const from = isoOf(year, month, 1);
  const to = isoOf(year, month, daysIn(year, month));
  const [employees, companies, leaves, sheets] = await Promise.all([
    listTry("Employee", { fields: ["name", "employee_name", "department", "company", "status", "date_of_joining", "relieving_date", "holiday_list", "user_id"], orderBy: "employee_name asc" }, ["name", "employee_name", "department", "company", "status", "date_of_joining", "user_id"]),
    frappe.getList("Company", { fields: ["name", "default_holiday_list"], limit: 0 }).catch(() => []),
    frappe.getList("Leave Application", { filters: [["status", "=", "Approved"], ["docstatus", "=", 1], ["from_date", "<=", to], ["to_date", ">=", from]], fields: ["employee", "from_date", "to_date", "half_day", "half_day_date"], limit: 0 }).catch(() => []),
    listTimesheets({ filters: [["start_date", "<=", to], ["end_date", ">=", from], ["docstatus", "<", 2]], fields: ["name", "employee", "start_date", "end_date", "total_hours", "status", "docstatus"], limit: 0 }),
  ]);
  const entries = await getEntriesBetween(from, to, sheets.map((s) => s.name));
  const companyList = Object.fromEntries(companies.map((c) => [c.name, c.default_holiday_list]));
  const lists = [...new Set(employees.map((e) => e.holiday_list || companyList[e.company]).filter(Boolean))];
  const holidays = await holidaysByList(lists, from, to);
  return { from, to, employees, companyList, leaves, sheets, entries, holidays };
}

export function summarise(data) {
  const { from, to, employees, companyList, leaves, sheets, entries, holidays } = data;
  const [y, m] = from.split("-").map(Number);
  const all = Array.from({ length: daysIn(y, m - 1) }, (_, i) => isoOf(y, m - 1, i + 1));
  return employees
    .filter((e) => (!e.date_of_joining || e.date_of_joining <= to) && (e.status === "Active" || (e.relieving_date && e.relieving_date >= from)))
    .map((e) => {
      const list = e.holiday_list || companyList[e.company];
      const off = list ? holidays[list] || new Set() : null;
      const window = all.filter((d) => (!e.date_of_joining || d >= e.date_of_joining) && (!e.relieving_date || d <= e.relieving_date));
      // No holiday list: assume Monday-Friday.
      const working = window.filter((d) => (off ? !off.has(d) : ![0, 6].includes(new Date(`${d}T00:00:00`).getDay())));
      let leaveDays = 0;
      leaves.filter((l) => l.employee === e.name).forEach((l) => working.forEach((d) => {
        if (d < l.from_date || d > l.to_date) return;
        leaveDays += Number(l.half_day) && (!l.half_day_date || l.half_day_date === d) ? 0.5 : 1;
      }));
      const expected = Math.max(0, working.length - leaveDays) * DAILY_HOURS;
      const mine = sheets.filter((s) => s.employee === e.name).map((s) => ({ ...s, review: reviewOf(s, null), rows: entries.get(s.name) || [] }));
      let draft = 0;
      let pending = 0;
      let approved = 0;
      let returned = false;
      let submittedSheets = 0;
      let finalizedAll = true;
      mine.forEach((s) => {
        const k = s.review.key;
        if (k === "returned") returned = true;
        if (s.docstatus === 1) submittedSheets += 1;
        if (k !== "finalized") finalizedAll = false;
        s.rows.forEach((r) => {
          const h = Number(r.hours) || 0;
          if (s.docstatus === 0) draft += h;
          else if (k === "approved" || k === "finalized" || r.custom_line_status === "Approved") approved += h;
          else pending += h;
        });
      });
      const logged = draft + pending + approved;
      let state;
      if (!mine.length || (!logged && !submittedSheets)) state = returned ? "Returned" : "Missing";
      else if (submittedSheets && pending + approved === 0 && !draft) state = "Submitted 0 h";
      else if (returned && draft > 0) state = "Returned";
      else if (!submittedSheets) state = "Not submitted";
      else if (pending > 0) state = approved > 0 ? "Partly approved" : "Awaiting approval";
      else if (draft > 0) state = "Partly submitted";
      else state = finalizedAll ? "Finalized" : "Approved";
      const submitted = pending + approved;
      return { ...e, expected, workingDays: working.length, leaveDays, draft, pending, approved, submitted, gap: Math.max(0, expected - submitted), state, sheets: mine.length };
    });
}

const STATES = ["Missing", "Not submitted", "Returned", "Partly submitted", "Submitted 0 h", "Awaiting approval", "Partly approved", "Approved", "Finalized"];
const PILL = { Missing: "Overdue", "Not submitted": "Draft", Returned: "Rejected", "Partly submitted": "Pending", "Submitted 0 h": "Pending", "Awaiting approval": "Pending Review", "Partly approved": "Partly Approved", Approved: "Approved", Finalized: "Finalized" };

export default function TimesheetCompliance() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [state, setState] = useState("all");
  const [dept, setDept] = useState("");
  const [q, setQ] = useState("");
  const data = useAsync(() => loadMonth(year, month), [year, month]);
  const rows = useMemo(() => (data.data ? summarise(data.data) : []), [data.data]);
  const depts = [...new Set(rows.map((r) => r.department).filter(Boolean))].sort();
  const counts = Object.fromEntries(STATES.map((s) => [s, rows.filter((r) => r.state === s).length]));
  const shown = rows.filter((r) => (state === "all" || (state === "attention" ? ["Missing", "Not submitted", "Returned", "Partly submitted", "Submitted 0 h"].includes(r.state) : r.state === state)) && (!dept || r.department === dept) && (!q || `${r.employee_name} ${r.name}`.toLowerCase().includes(q.toLowerCase())));
  const tot = (k) => shown.reduce((s, r) => s + r[k], 0);
  const label = `${MONTHS[month]} ${year}`;

  function exportCsv() {
    downloadCsv(`timesheet-compliance-${year}-${pad(month + 1)}.csv`, ["Employee", "ID", "Department", "Status", "Working days", "Leave days", "Expected hours", "Approved hours", "Awaiting approval hours", "Draft hours", "Gap (expected - submitted)", "Timesheets"],
      shown.map((r) => [r.employee_name, r.name, r.department, r.state, r.workingDays, r.leaveDays, r.expected, r.approved.toFixed(2), r.pending.toFixed(2), r.draft.toFixed(2), r.gap.toFixed(2), r.sheets]));
  }

  return (
    <div className="space-y-4">
      <Panel title={`Compliance · ${label}`} hint={`Everyone employed in the month. Expected = working days (holiday list - weekends are off if it has no weekly offs - or Mon–Fri) minus approved leave, × ${DAILY_HOURS} h. "Missing" means nothing was logged - it is not counted as 0 hours worked.`} action={<Button variant="secondary" onClick={exportCsv} disabled={!shown.length}><Download size={14} /> CSV</Button>}>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <select className={`${inputCls} !w-auto !py-1`} value={year} onChange={(e) => setYear(Number(e.target.value))}>{Array.from({ length: 4 }, (_, i) => now.getFullYear() - i).map((y) => <option key={y}>{y}</option>)}</select>
          <div className="flex flex-wrap gap-1">{MONTHS.map((mm, i) => <button key={mm} type="button" onClick={() => setMonth(i)} className={chipCls(month === i)} disabled={year === now.getFullYear() && i > now.getMonth()}>{mm}</button>)}</div>
        </div>
        <div className="mb-3 flex flex-wrap items-center gap-1.5">
          <button type="button" onClick={() => setState("all")} className={chipCls(state === "all")}>All {rows.length}</button>
          <button type="button" onClick={() => setState("attention")} className={chipCls(state === "attention")}>Needs follow-up {["Missing", "Not submitted", "Returned", "Partly submitted", "Submitted 0 h"].reduce((s, k) => s + counts[k], 0)}</button>
          {STATES.filter((s) => counts[s]).map((s) => <button key={s} type="button" onClick={() => setState(s)} className={chipCls(state === s)}>{s} {counts[s]}</button>)}
        </div>
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <input className={`${inputCls} !w-56 !py-1`} placeholder="Search employee…" value={q} onChange={(e) => setQ(e.target.value)} />
          <select className={`${inputCls} !w-auto !py-1`} value={dept} onChange={(e) => setDept(e.target.value)}><option value="">All departments</option>{depts.map((d) => <option key={d}>{d}</option>)}</select>
          <span className="ml-auto text-[11.5px] text-[var(--color-text-muted)]">Expected {tot("expected").toFixed(0)} h · approved {tot("approved").toFixed(1)} h · awaiting {tot("pending").toFixed(1)} h · draft {tot("draft").toFixed(1)} h</span>
        </div>
        <Async state={data}>
          {() => (
            <>
              {data.data && !data.data.sheets.length && <div className="mb-3"><Notice tone="info">No timesheets at all for {label}.</Notice></div>}
              <Grid rows={shown} empty="Nobody matches." columns={[
                { key: "employee_name", label: "Employee", render: (r) => <span>{r.employee_name}<span className="block text-[11px] text-[var(--color-text-faint)]">{[r.name, r.department].filter(Boolean).join(" · ")}</span></span> },
                { key: "state", label: "Status", render: (r) => <span className="inline-flex items-center gap-1"><StatusPill status={PILL[r.state]} /><span className="text-[11px] text-[var(--color-text-muted)]">{r.state !== PILL[r.state] ? r.state : ""}</span></span> },
                { key: "expected", label: "Expected", render: (r) => <span>{r.expected} h<span className="block text-[10.5px] text-[var(--color-text-faint)]">{r.workingDays} d{r.leaveDays ? ` − ${r.leaveDays} leave` : ""}</span></span> },
                { key: "approved", label: "Approved", render: (r) => `${r.approved.toFixed(1)} h` },
                { key: "pending", label: "Awaiting", render: (r) => `${r.pending.toFixed(1)} h` },
                { key: "draft", label: "Draft", render: (r) => (r.draft ? `${r.draft.toFixed(1)} h` : "—") },
                { key: "gap", label: "Gap", render: (r) => <span className={r.gap > 0 ? "text-[var(--color-red-hover)]" : "text-[var(--color-green)]"}>{r.gap > 0 ? `${r.gap.toFixed(1)} h` : "—"}</span> },
              ]} />
            </>
          )}
        </Async>
        <p className="mt-3 flex items-center gap-1.5 text-[11px] text-[var(--color-text-faint)]"><ShieldCheck size={12} /> Approved = hours approved per project or finalized by HR. Awaiting = submitted but not yet approved. Draft = not submitted.</p>
      </Panel>
    </div>
  );
}
