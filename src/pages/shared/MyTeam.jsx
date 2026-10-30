// My Team: a line manager's direct reports - who's in today, who's away soon, and leave waiting for their decision.
// Runs through server methods (ERPNext Setup) because employee logins can only read their own records.
import { useState } from "react";
import { Check, Users, X } from "lucide-react";
import { frappe } from "../../lib/api/frappeClient";
import { Button } from "../../components/ui/primitives";
import { Async, Empty, Field, Grid, inputCls, Modal, Notice, PageHeader, Panel, StatusPill } from "../../components/employee/EmployeeShell";
import { dmy, errMsg, hm, useAsync } from "../../lib/employeePortal";

async function loadTeam() {
  try {
    return { ...(await frappe.callMethod("ethx_my_team")), ready: true };
  } catch (e) {
    if (e?.response?.status === 404 || /not found|not whitelisted|has no attribute|Failed to get method|No module named/i.test(String(e?.response?.data?.exception || ""))) return { ready: false, team: [], leave: [], away: [], today: {} };
    throw e;
  }
}

export default function MyTeam() {
  const q = useAsync(loadTeam, []);
  const [decide, setDecide] = useState(null);
  const d = q.data;
  return (
    <>
      <PageHeader icon={Users} title="My Team" subtitle="Your direct reports, today's attendance, upcoming leave and leave requests waiting for you" />
      {d && !d.ready && <Notice>Manager self-service isn't set up yet - ask the Administrator to run Admin › System Setup.</Notice>}
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
        <Field label={to === "Rejected" ? "Reason (required)" : "Note (optional)"}><textarea rows={2} className={inputCls} value={note} onChange={(e) => setNote(e.target.value)} /></Field>
        {err && <Notice>{err}</Notice>}
        <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={onClose}>Cancel</Button><Button type="submit" disabled={busy}>{busy ? "Saving…" : to === "Approved" ? "Approve" : "Reject"}</Button></div>
      </form>
    </Modal>
  );
}
