// My Team: the team of each project you manage or work on, then a line manager's direct reports - who's in today,
// who's away soon, leave waiting for their decision, and short or unfinished days to mark Present or Absent.
// Runs through server methods (ERPNext Setup) because employee logins can only read their own records.
import { useState } from "react";
import { Link } from "react-router-dom";
import { Check, UserPlus, Users, X } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { hasPermission } from "../../permissions/roles";
import { frappe } from "../../lib/api/frappeClient";
import { Button } from "../../components/ui/primitives";
import { Async, Empty, Field, Grid, inputCls, Modal, Notice, PageHeader, Panel, StatusPill } from "../../components/employee/EmployeeShell";
import { dmy, errMsg, hm, useAsync } from "../../lib/employeePortal";
import { confirmDialog, alertDialog } from "../../components/ui/dialogs";
import { FULL_DAY_HOURS } from "../../lib/attendanceSetup";

const NOT_SET_UP = /not found|not whitelisted|has no attribute|Failed to get method|No module named/i;

/**
 * Your direct reports' finished days that weren't marked automatically - under FULL_DAY_HOURS or no punch out - for
 * you, their manager, to mark Present or Absent (the ethx_team_attendance methods, attendanceSetup.js).
 */
function TeamAttendance({ hasTeam }) {
  const q = useAsync(() => frappe.callMethod("ethx_team_attendance").catch((e) => {
    if (e?.response?.status === 404 || NOT_SET_UP.test(String(e?.response?.data?.exception || ""))) return null;
    throw e;
  }), []);
  const [busy, setBusy] = useState(false);
  if (q.data === null) return null; // not installed yet - the notice below covers manager self-service
  if (!hasTeam && !q.data?.length) return null; // not a manager or leave approver of anyone with days to decide

  async function mark(rows, status) {
    const who = rows.length === 1 ? `${rows[0].employee_name} on ${dmy(rows[0].date)}` : `all ${rows.length} days`;
    const why = status === "Present" ? ` ${rows.length === 1 ? "This day has" : "These days have"} under ${FULL_DAY_HOURS} hours or no punch out.` : "";
    if (!(await confirmDialog({ title: `Mark ${status}`, message: `Mark ${who} as ${status}?${why} ${rows.length === 1 ? "They are" : "Each person is"} notified.`, confirmLabel: `Mark ${status}` }))) return;
    setBusy(true);
    let failed = 0;
    let last = "";
    for (const r of rows) {
      try { await frappe.callMethod("ethx_team_attendance_decide", { employee: r.employee, date: r.date, status }); } catch (e) { failed += 1; last = errMsg(e, ""); }
    }
    setBusy(false);
    if (failed) alertDialog({ tone: "error", message: `${failed} day(s) couldn't be saved. ${last}` });
    q.reload();
  }

  return (
    <Panel title="Attendance to Decide" hint={`Days under ${FULL_DAY_HOURS} hours or without a punch out, from the last month, of people who report to you or whose leave approver you are. They aren't marked automatically - you decide.`}
      action={q.data?.length > 1 ? <div className="flex gap-2"><Button variant="secondary" disabled={busy} onClick={() => mark(q.data, "Present")}><Check size={14} /> All Present</Button><Button variant="secondary" disabled={busy} onClick={() => mark(q.data, "Absent")}><X size={14} /> All Absent</Button></div> : null}>
      <Async state={q}>
        {(rows) => rows.length === 0 ? <Empty text="Nothing to decide - every finished day of your team is marked." /> : <Grid rows={rows} rowKey={(r) => `${r.employee}-${r.date}`} columns={[
          { key: "employee_name", label: "Employee" },
          { key: "date", label: "Date", render: (r) => dmy(r.date) },
          { key: "status", label: "Status", render: (r) => <StatusPill status={r.status} /> },
          { key: "times", label: "In / Out", render: (r) => <span className="text-[12px] text-[var(--color-text-muted)]">{r.in_time ? hm(r.in_time) : "—"} – {r.out_time ? hm(r.out_time) : "…"}{r.hours ? ` · ${r.hours}h` : ""}</span> },
          { key: "_a", label: "", render: (r) => <div className="flex justify-end gap-1">
            <button type="button" disabled={busy} onClick={() => mark([r], "Present")} className="whitespace-nowrap rounded border border-[color-mix(in_srgb,var(--color-green)_40%,transparent)] px-2 py-0.5 text-[11px] font-medium text-[var(--color-green)] hover:bg-[color-mix(in_srgb,var(--color-green)_12%,transparent)] disabled:opacity-50">Present</button>
            <button type="button" disabled={busy} onClick={() => mark([r], "Absent")} className="whitespace-nowrap rounded border border-[color-mix(in_srgb,var(--color-red)_40%,transparent)] px-2 py-0.5 text-[11px] font-medium text-[var(--color-red-hover)] hover:bg-[var(--color-red-wash)] disabled:opacity-50">Absent</button>
          </div> },
        ]} />}
      </Async>
    </Panel>
  );
}

async function loadTeam() {
  try {
    return { ...(await frappe.callMethod("ethx_my_team")), ready: true };
  } catch (e) {
    if (e?.response?.status === 404 || NOT_SET_UP.test(String(e?.response?.data?.exception || ""))) return { ready: false, team: [], leave: [], away: [], today: {} };
    throw e;
  }
}

const period = (m) => (m.start ? `${dmy(m.start)}${m.eta ? ` – ${dmy(m.eta)}` : ""}` : "—");

/** One panel per live project: who is on it, in which role, until when. */
function ProjectTeams() {
  const { user } = useAuth();
  const teams = useAsync(() => frappe.callMethod("ethx_my_project_teams"), []);
  const missing = /Failed to get method|not whitelisted|has no attribute|No module named/i.test(String(teams.error?.response?.data?.exception || teams.error?.response?.data?.exc || ""));
  if (missing || teams.error?.response?.status === 404) return <Notice tone="info">Project teams aren't set up yet - ask the Administrator to use Apply Again on Admin › Roles &amp; Permissions.</Notice>;
  return (
    <Async state={teams}>
      {(list) => (list.length === 0 ? <Panel title="Project Teams"><Empty text="You aren't on any live project yet." /></Panel> : list.map((t) => (
        <Panel key={t.project} title={`${t.label} (${t.members.length})`} hint="Project team" action={t.can_manage && hasPermission(user, "dashboard.pm") ? <Link to={`/pm/assignments?assign=${encodeURIComponent(t.project)}`} className="flex items-center gap-1 text-[12px] text-[var(--color-red-hover)] hover:underline"><UserPlus size={13} /> Add Member</Link> : null}>
          <Grid rows={t.members} rowKey={(m) => m.key} empty="No one is on this project yet." columns={[
            { key: "name", label: "Name", render: (m) => <span>{m.name}{m.designation && <span className="block text-[11px] text-[var(--color-text-faint)]">{m.designation}</span>}</span> },
            { key: "role", label: "Role on Project", render: (m) => m.role || "—" },
            { key: "type", label: "Type", render: (m) => <StatusPill status={m.is_manager ? "Manager" : m.is_contractor ? "Contractor" : "Employee"} /> },
            { key: "period", label: "Period", render: period },
          ]} />
        </Panel>
      )))}
    </Async>
  );
}

export default function MyTeam() {
  const q = useAsync(loadTeam, []);
  const [decide, setDecide] = useState(null);
  const d = q.data;
  return (
    <>
      <PageHeader icon={Users} title="My Team" subtitle="Your project teams, direct reports, today's attendance, upcoming leave, and leave and attendance waiting for your decision" />
      <ProjectTeams />
      {d && !d.ready && <Notice>Manager self-service isn't set up yet - ask the Administrator to use Apply Again on Admin › Roles &amp; Permissions.</Notice>}
      <Async state={q}>
        {() => (
          <>
            <Panel title="Leave Waiting for You" hint="From your direct reports, or where you're set as the leave approver">
              {d.leave.length === 0 ? <Empty text="Nothing waiting for your decision." /> : <Grid rows={d.leave} columns={[
                { key: "employee_name", label: "Employee" },
                { key: "leave_type", label: "Type" },
                { key: "dates", label: "Dates", render: (a) => `${dmy(a.from_date)}${a.to_date !== a.from_date ? ` – ${dmy(a.to_date)}` : ""}` },
                { key: "total_leave_days", label: "Days", render: (a) => `${a.total_leave_days}${Number(a.half_day) ? " (half)" : ""}` },
                { key: "description", label: "Reason", render: (a) => <span className="text-[12px] text-[var(--color-text-muted)]">{a.description || "—"}</span> },
                { key: "_a", label: "", render: (a) => <div className="flex justify-end gap-1"><button type="button" title="Approve" onClick={() => setDecide({ app: a, to: "Approved" })} className="rounded p-1 text-[var(--color-green)] hover:bg-[var(--color-surface-2)]"><Check size={14} /></button><button type="button" title="Reject" onClick={() => setDecide({ app: a, to: "Rejected" })} className="rounded p-1 text-[var(--color-text-muted)] hover:text-[var(--color-red-hover)]"><X size={14} /></button></div> },
              ]} />}
            </Panel>
            <TeamAttendance hasTeam={d.team.length > 0} />
            <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
              <Panel title={`Team (${d.team.length})`} hint="Employees whose Reports To is you">
                {d.team.length === 0 ? <Empty text="No one reports to you yet. HR can add you as the manager on employee profiles." /> : <Grid rows={d.team} columns={[
                  { key: "employee_name", label: "Name", render: (t) => <span>{t.employee_name}<span className="block text-[11px] text-[var(--color-text-faint)]">{[t.designation, t.department].filter(Boolean).join(" · ")}</span></span> },
                  { key: "today", label: "Today", render: (t) => { const x = d.today[t.name]; if (!x) return d.away.some((a) => a.employee === t.name && a.from_date <= new Date().toISOString().slice(0, 10)) ? <StatusPill status="On Leave" /> : <span className="text-[12px] text-[var(--color-text-faint)]">Not punched in</span>; return x.status ? <StatusPill status={x.status} /> : <span className="text-[12px]">{x.log_type === "IN" ? "In" : "Out"} since {hm(x.time)}</span>; } },
                ]} />}
              </Panel>
              <Panel title="Away in the Next 14 Days">
                {d.away.length === 0 ? <Empty text="No approved leave coming up." /> : <Grid rows={d.away} rowKey={(a, i) => `${a.employee}-${i}`} columns={[
                  { key: "employee_name", label: "Employee" }, { key: "leave_type", label: "Type" },
                  { key: "dates", label: "Dates", render: (a) => `${dmy(a.from_date)}${a.to_date !== a.from_date ? ` – ${dmy(a.to_date)}` : ""}${Number(a.half_day) ? " (half)" : ""}` },
                ]} />}
              </Panel>
            </div>
          </>
        )}
      </Async>
      {decide && <DecideModal {...decide} onClose={() => setDecide(null)} onSaved={() => { setDecide(null); q.reload(); }} />}
    </>
  );
}

function DecideModal({ app, to, onClose, onSaved }) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  async function submit(e) {
    e.preventDefault();
    if (to === "Rejected" && !note.trim()) return setErr("Give the reason for rejecting.");
    setBusy(true);
    try {
      await frappe.callMethod("ethx_team_leave_decision", { leave: app.name, status: to, note: note.trim() });
      onSaved();
    } catch (x) {
      setErr(errMsg(x, "Couldn't record the decision."));
      setBusy(false);
    }
  }
  return (
    <Modal title={`${to === "Approved" ? "Approve" : "Reject"} · ${app.employee_name}`} onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <p className="text-[12px] text-[var(--color-text-muted)]">{app.leave_type} · {dmy(app.from_date)}{app.to_date !== app.from_date ? ` – ${dmy(app.to_date)}` : ""} · {app.total_leave_days} day(s)</p>
        <Field label={to === "Rejected" ? "Reason (Required)" : "Note (Optional)"}><textarea rows={2} className={inputCls} value={note} onChange={(e) => setNote(e.target.value)} /></Field>
        {err && <Notice>{err}</Notice>}
        <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={onClose}>Cancel</Button><Button type="submit" disabled={busy}>{busy ? "Saving…" : to === "Approved" ? "Approve" : "Reject"}</Button></div>
      </form>
    </Modal>
  );
}
