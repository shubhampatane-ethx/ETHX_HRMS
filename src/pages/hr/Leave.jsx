// HR › Leave: see every application, change approvers, apply on an employee's behalf, see balances and allocate leave.
// Only an application's assigned approver can approve or reject it, here and on the server.
// Approval follows HRMS: set status Approved / Rejected, then submit (HRMS only submits decided applications).
// Each application shows its approver (by name) and business unit; approvers who are on leave today are flagged and
// their applications can be moved to the next available approver of the same business unit.
import { useMemo, useState } from "react";
import { CalendarDays, Check, Download, Plus, UserCog, X } from "lucide-react";
import { frappe } from "../../lib/api/frappeClient";
import { Button, DateField, LinkField } from "../../components/ui/primitives";
import { Async, chipCls, Field, Grid, inputCls, Modal, Notice, PageHeader, Panel, StatusPill, Tabs } from "../../components/employee/EmployeeShell";
import { dmy, errMsg, getMyEmployee, isoDate, joinLeaveReason, LEAVE_REASONS, listTry, OTHER_REASON, useAsync } from "../../lib/employeePortal";
import { useAuth } from "../../context/AuthContext";
import { downloadCsv } from "../../lib/recruitment";
import { approversOnLeave, decideLeaveDirect, getApprovers, pickApprover, reassignLeave, rerouteUnavailable } from "../../lib/approvals";
import { alertDialog, confirmDialog, previewDialog } from "../../components/ui/dialogs";

const APP_FIELDS = ["name", "employee", "employee_name", "department", "leave_type", "from_date", "to_date", "total_leave_days", "half_day", "status", "docstatus", "description", "leave_approver", "leave_approver_name", "posting_date", "company"];

export default function Leave() {
  const [tab, setTab] = useState("applications");
  return (
    <div className="space-y-5">
      <PageHeader icon={CalendarDays} title="Leave" subtitle="Track applications, change approvers, apply for an employee, and manage balances and allocations" />
      <Tabs value={tab} onChange={setTab} tabs={[{ id: "applications", label: "Applications" }, { id: "balances", label: "Balances & Allocations" }]} />
      {tab === "applications" ? <Applications /> : <Balances />}
    </div>
  );
}

/* ------------------------------ applications ------------------------------ */

function Applications() {
  const { user } = useAuth();
  // HR staff are employees too: their own requests are decided by their approver, never by themselves.
  const me = useAsync(() => getMyEmployee(user.email).catch(() => null), [user.email]);
  const [filter, setFilter] = useState("Open");
  const [q, setQ] = useState("");
  const apps = useAsync(() => listTry("Leave Application", { filters: [["docstatus", "<", 2]], fields: APP_FIELDS, orderBy: "from_date desc", limit: 500 }, ["name", "employee", "employee_name", "leave_type", "from_date", "to_date", "total_leave_days", "status", "docstatus", "leave_approver"]), []);
  const away = useAsync(async () => {
    const open = (apps.data || []).filter((a) => a.status === "Open" && a.docstatus === 0 && a.leave_approver);
    if (!open.length) return new Set();
    const today = isoDate();
    return (await approversOnLeave([...new Set(open.map((a) => a.leave_approver))], today, today)).off;
  }, [apps.data]);
  const [modal, setModal] = useState(null);
  const [rerouting, setRerouting] = useState(false);
  const flagged = (apps.data || []).filter((a) => a.status === "Open" && a.docstatus === 0 && away.data?.has(a.leave_approver));

  async function reroute() {
    if (!(await confirmDialog("Move every pending leave and expense request away from approvers who are on leave today?"))) return;
    setRerouting(true);
    let moved = 0;
    try {
      moved = (await rerouteUnavailable()).length;
    } catch {
      // server rule not installed: move them one by one from here
      for (const a of flagged) {
        try {
          const pick = pickApprover((await getApprovers({ name: a.employee }, "Leave Application")).filter((x) => x.email !== a.leave_approver && !away.data.has(x.email)));
          if (pick && !pick.on_leave) { await reassignLeave(a.name, pick.email, pick.name); moved += 1; }
        } catch { /* leave it for manual reassignment */ }
      }
    }
    setRerouting(false);
    alertDialog(moved ? { tone: "success", title: "Requests Reassigned", message: `${moved} request(s) moved to an available approver.` } : { tone: "info", title: "Nothing Reassigned", message: "No other available approver was found - reassign manually." });
    apps.reload();
  }
  const rows = (apps.data || []).filter((a) => (filter === "all" || a.status === filter) && (!q || `${a.employee_name} ${a.employee} ${a.leave_type}`.toLowerCase().includes(q.toLowerCase())));
  const count = (s) => (apps.data || []).filter((a) => a.status === s).length;

  return (
    <Panel action={<div className="flex flex-wrap gap-2">{flagged.length > 0 && <Button variant="secondary" onClick={reroute} disabled={rerouting}><UserCog size={14} /> {rerouting ? "Reassigning…" : `Reassign ${flagged.length} with approver on leave`}</Button>}<Button onClick={() => setModal({ kind: "apply" })}><Plus size={14} /> Apply for an Employee</Button></div>}>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {[["Open", `Awaiting Decision (${count("Open")})`], ["Approved", "Approved"], ["Rejected", "Rejected"], ["all", "All"]].map(([v, l]) => <button key={v} type="button" onClick={() => setFilter(v)} className={chipCls(filter === v)}>{l}</button>)}
        <input className={`${inputCls} !w-56 !py-1`} placeholder="Search employee or type…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <Async state={apps}>
        {() => <Grid rows={rows} empty="No leave applications here." columns={[
          { key: "employee_name", label: "Employee", render: (a) => <span>{a.employee_name || a.employee}<span className="block text-[11px] text-[var(--color-text-faint)]">{[a.employee, a.department].filter(Boolean).join(" · ")}</span></span> },
          { key: "leave_type", label: "Type" },
          { key: "dates", label: "Dates", render: (a) => `${dmy(a.from_date)}${a.to_date !== a.from_date ? ` – ${dmy(a.to_date)}` : ""}` },
          { key: "total_leave_days", label: "Days", render: (a) => `${a.total_leave_days ?? ""}${Number(a.half_day) ? " (half)" : ""}` },
          { key: "description", label: "Reason", render: (a) => <span className="line-clamp-2 max-w-[16rem] text-[12px] text-[var(--color-text-muted)]">{a.description || "—"}</span> },
          { key: "leave_approver_name", label: "Approver", render: (a) => a.leave_approver ? <span>{a.leave_approver_name || a.leave_approver}{away.data?.has(a.leave_approver) && a.status === "Open" && <span className="ml-1.5 rounded bg-[var(--color-surface-2)] px-1.5 py-0.5 text-[10px] text-[var(--color-amber)]">on leave</span>}<span className="block text-[10.5px] text-[var(--color-text-faint)]">{a.leave_approver}</span></span> : <span className="text-[var(--color-amber)]">not set</span> },
          { key: "status", label: "Status", render: (a) => <StatusPill status={a.status} /> },
          { key: "_a", label: "", render: (a) => a.docstatus === 0 && a.status === "Open" ? (a.employee === me.data?.name ? <span className="text-[11px] text-[var(--color-text-faint)]">Your request</span> : (
            <div className="flex justify-end gap-1">
              <button type="button" title="Change approver" onClick={() => setModal({ kind: "reassign", app: a })} className="rounded p-1 text-[var(--color-text-muted)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text)]"><UserCog size={14} /></button>
              {a.leave_approver === user.email ? (
                <>
                  <button type="button" title="Approve" onClick={() => setModal({ kind: "decide", app: a, to: "Approved" })} className="rounded p-1 text-[var(--color-green)] hover:bg-[var(--color-surface-2)]"><Check size={14} /></button>
                  <button type="button" title="Reject" onClick={() => setModal({ kind: "decide", app: a, to: "Rejected" })} className="rounded p-1 text-[var(--color-text-muted)] hover:text-[var(--color-red-hover)]"><X size={14} /></button>
                </>
              ) : <span className="self-center whitespace-nowrap text-[11px] text-[var(--color-text-faint)]">{a.leave_approver ? "With Approver" : "Set an Approver"}</span>}
            </div>
          )) : null },
        ]} />}
      </Async>
      {modal?.kind === "decide" && <DecideModal app={modal.app} to={modal.to} onClose={() => setModal(null)} onSaved={() => { setModal(null); apps.reload(); }} />}
      {modal?.kind === "apply" && <ApplyModal onClose={() => setModal(null)} onSaved={() => { setModal(null); apps.reload(); }} />}
      {modal?.kind === "reassign" && <ReassignModal app={modal.app} onClose={() => setModal(null)} onSaved={() => { setModal(null); apps.reload(); }} />}
    </Panel>
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
    setErr("");
    try {
      await decideLeaveDirect(app.name, to, note.trim());
      onSaved();
    } catch (x) {
      setErr(errMsg(x, "The decision was refused."));
      setBusy(false);
    }
  }
  return (
    <Modal title={`${to === "Approved" ? "Approve" : "Reject"} Leave · ${app.employee_name}`} onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <p className="text-[12px] text-[var(--color-text-muted)]">{app.leave_type} · {dmy(app.from_date)}{app.to_date !== app.from_date ? ` – ${dmy(app.to_date)}` : ""} · {app.total_leave_days} day(s){app.description ? ` · “${app.description}”` : ""}</p>
        <Field label={to === "Rejected" ? "Reason (Required)" : "Note (Optional)"}><textarea rows={2} className={inputCls} value={note} onChange={(e) => setNote(e.target.value)} /></Field>
        <p className="text-[11px] text-[var(--color-text-faint)]">The decision is final after submission. To change it later, cancel the application.</p>
        {err && <Notice>{err}</Notice>}
        <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={onClose}>Cancel</Button><Button type="submit" disabled={busy}>{busy ? "Saving…" : to === "Approved" ? "Approve" : "Reject"}</Button></div>
      </form>
    </Modal>
  );
}

function ApplyModal({ onClose, onSaved }) {
  const [f, setF] = useState({ employee: "", leave_type: "", from: isoDate(), to: isoDate(), half: false, reason: "", details: "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  async function submit(e) {
    e.preventDefault();
    if (f.to < f.from) return setErr("The end date can't be before the start date.");
    if (f.reason === OTHER_REASON && !f.details.trim()) return setErr("Describe the reason for the leave.");
    setBusy(true);
    setErr("");
    try {
      const emp = await frappe.getDoc("Employee", f.employee);
      const approver = pickApprover(await getApprovers(emp, "Leave Application").catch(() => []));
      await frappe.createDoc("Leave Application", { employee: f.employee, leave_type: f.leave_type, from_date: f.from, to_date: f.to, half_day: f.half ? 1 : 0, ...(f.half ? { half_day_date: f.from } : {}), description: joinLeaveReason(f.reason, f.details) || `Entered by HR`, company: emp.company, ...(approver ? { leave_approver: approver.email } : {}), posting_date: isoDate(), status: "Open" });
      onSaved();
    } catch (x) {
      setErr(errMsg(x, "Couldn't create the leave application."));
      setBusy(false);
    }
  }
  return (
    <Modal title="Apply for Leave on an Employee's Behalf" onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <LinkField label="Employee" linkDoctype="Employee" value={f.employee} onChange={(v) => setF({ ...f, employee: v })} required frappe={frappe} />
        <LinkField label="Leave Type" linkDoctype="Leave Type" value={f.leave_type} onChange={(v) => setF({ ...f, leave_type: v })} required frappe={frappe} />
        <div className="grid grid-cols-2 gap-3"><DateField label="From" value={f.from} onChange={(v) => setF({ ...f, from: v, to: f.to < v ? v : f.to })} required /><DateField label="To" value={f.to} onChange={(v) => setF({ ...f, to: v })} required /></div>
        <label className="flex items-center gap-2 text-[12px] text-[var(--color-text-muted)]"><input type="checkbox" checked={f.half} onChange={(e) => setF({ ...f, half: e.target.checked })} /> Half day (on the start date)</label>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Reason"><select required className={inputCls} value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })}><option value="">Select…</option>{LEAVE_REASONS.map((r) => <option key={r} value={r}>{r === OTHER_REASON ? "Other (Please Specify)" : r}</option>)}</select></Field>
          <Field label={f.reason === OTHER_REASON ? "Details" : "Details (Optional)"}><input required={f.reason === OTHER_REASON} className={inputCls} value={f.details} onChange={(e) => setF({ ...f, details: e.target.value })} /></Field>
        </div>
        <p className="text-[11px] text-[var(--color-text-faint)]">It goes to the employee's leave approver to decide.</p>
        {err && <Notice>{err}</Notice>}
        <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={onClose}>Cancel</Button><Button type="submit" disabled={busy}>{busy ? "Saving…" : "Save"}</Button></div>
      </form>
    </Modal>
  );
}

/* ------------------------------ balances ------------------------------ */

async function loadBalances() {
  const today = isoDate();
  const [allocs, taken, pending, employees] = await Promise.all([
    frappe.getList("Leave Allocation", { filters: [["docstatus", "=", 1], ["from_date", "<=", today], ["to_date", ">=", today]], fields: ["name", "employee", "employee_name", "leave_type", "from_date", "to_date", "total_leaves_allocated"], limit: 0 }),
    frappe.getList("Leave Application", { filters: [["docstatus", "=", 1], ["status", "=", "Approved"]], fields: ["employee", "leave_type", "from_date", "to_date", "total_leave_days"], limit: 0 }),
    frappe.getList("Leave Application", { filters: [["docstatus", "=", 0], ["status", "=", "Open"]], fields: ["employee", "leave_type", "from_date", "total_leave_days"], limit: 0 }),
    listTry("Employee", { filters: [["status", "=", "Active"]], fields: ["name", "employee_name", "department"], orderBy: "employee_name asc" }, ["name", "employee_name"]),
  ]);
  const dept = Object.fromEntries(employees.map((e) => [e.name, e.department]));
  return allocs.map((a) => {
    const inWindow = (l) => l.employee === a.employee && l.leave_type === a.leave_type && l.from_date >= a.from_date && l.from_date <= a.to_date;
    const used = taken.filter(inWindow).reduce((s, l) => s + Number(l.total_leave_days || 0), 0);
    const pend = pending.filter(inWindow).reduce((s, l) => s + Number(l.total_leave_days || 0), 0);
    const total = Number(a.total_leaves_allocated || 0);
    return { ...a, department: dept[a.employee] || "", used, pending: pend, balance: total - used };
  }).sort((x, y) => String(x.employee_name).localeCompare(String(y.employee_name)) || x.leave_type.localeCompare(y.leave_type));
}

function Balances() {
  const data = useAsync(loadBalances, []);
  const [q, setQ] = useState("");
  const [allocating, setAllocating] = useState(false);
  const rows = useMemo(() => (data.data || []).filter((r) => !q || `${r.employee_name} ${r.employee} ${r.leave_type} ${r.department}`.toLowerCase().includes(q.toLowerCase())), [data.data, q]);
  return (
    <Panel hint="Current leave periods (allocations valid today). Balance = allocated − approved; pending applications are shown separately." action={<div className="flex gap-2"><Button variant="secondary" disabled={!rows.length} onClick={() => downloadCsv(`leave-balances-${isoDate()}.csv`, ["Employee", "ID", "Department", "Leave type", "Period from", "Period to", "Allocated", "Used", "Pending", "Balance"], rows.map((r) => [r.employee_name, r.employee, r.department, r.leave_type, r.from_date, r.to_date, r.total_leaves_allocated, r.used, r.pending, r.balance]))}><Download size={14} /> CSV</Button><Button onClick={() => setAllocating(true)}><Plus size={14} /> Allocate Leave</Button></div>}>
      <input className={`${inputCls} mb-4 !w-64 !py-1`} placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} />
      <Async state={data}>
        {() => <Grid rows={rows} rowKey={(r) => r.name} empty="No leave allocations valid today. Allocate leave to get started." columns={[
          { key: "employee_name", label: "Employee", render: (r) => <span>{r.employee_name}<span className="block text-[11px] text-[var(--color-text-faint)]">{[r.employee, r.department].filter(Boolean).join(" · ")}</span></span> },
          { key: "leave_type", label: "Leave Type" },
          { key: "period", label: "Period", render: (r) => `${dmy(r.from_date)} – ${dmy(r.to_date)}` },
          { key: "total_leaves_allocated", label: "Allocated" },
          { key: "used", label: "Used" },
          { key: "pending", label: "Pending", render: (r) => r.pending || "—" },
          { key: "balance", label: "Balance", render: (r) => <b className={r.balance <= 0 ? "text-[var(--color-red-hover)]" : "text-[var(--color-text)]"}>{r.balance}</b> },
        ]} />}
      </Async>
      {allocating && <AllocateModal onClose={() => setAllocating(false)} onSaved={() => { setAllocating(false); data.reload(); }} />}
    </Panel>
  );
}

function AllocateModal({ onClose, onSaved }) {
  const y = new Date().getFullYear();
  const [f, setF] = useState({ employee: "", leave_type: "", from: `${y}-01-01`, to: `${y}-12-31`, days: "12" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setErr("");
    try {
      const emp = await frappe.getDoc("Employee", f.employee);
      const doc = await frappe.createDoc("Leave Allocation", { employee: f.employee, leave_type: f.leave_type, from_date: f.from, to_date: f.to, new_leaves_allocated: Number(f.days), company: emp.company });
      await frappe.submitDoc(await frappe.getDoc("Leave Allocation", doc.name));
      onSaved();
    } catch (x) {
      setErr(errMsg(x, "Couldn't allocate leave."));
      setBusy(false);
    }
  }
  return (
    <Modal title="Allocate Leave" onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <LinkField label="Employee" linkDoctype="Employee" value={f.employee} onChange={(v) => setF({ ...f, employee: v })} required frappe={frappe} />
        <LinkField label="Leave Type" linkDoctype="Leave Type" value={f.leave_type} onChange={(v) => setF({ ...f, leave_type: v })} required frappe={frappe} />
        <div className="grid grid-cols-3 gap-3"><DateField label="From" value={f.from} onChange={(v) => setF({ ...f, from: v })} required /><DateField label="To" value={f.to} onChange={(v) => setF({ ...f, to: v })} required /><Field label="Days"><input type="number" min="0.5" step="0.5" required className={inputCls} value={f.days} onChange={(e) => setF({ ...f, days: e.target.value })} /></Field></div>
        {err && <Notice>{err}</Notice>}
        <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={onClose}>Cancel</Button><Button type="submit" disabled={busy}>{busy ? "Saving…" : "Allocate"}</Button></div>
      </form>
    </Modal>
  );
}


function ReassignModal({ app, onClose, onSaved }) {
  const list = useAsync(() => getApprovers({ name: app.employee }, "Leave Application"), [app.employee]);
  const [pick, setPick] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const options = list.data || [];
  const chosen = pick || pickApprover(options.filter((a) => a.email !== app.leave_approver))?.email || "";

  async function save() {
    const who = options.find((a) => a.email === chosen);
    if (!(await previewDialog({ title: "Change Approver", rows: [["Employee", app.employee_name], ["Leave", `${app.leave_type} · ${dmy(app.from_date)}${app.to_date !== app.from_date ? ` – ${dmy(app.to_date)}` : ""}`], ["Current approver", app.leave_approver || "—"], ["New approver", who ? `${who.name} (${who.email})` : chosen]], confirmLabel: "Confirm & Reassign" }))) return;
    setBusy(true);
    setErr("");
    try {
      await reassignLeave(app.name, chosen, options.find((a) => a.email === chosen)?.name);
      onSaved();
    } catch (e) {
      setErr(errMsg(e, "The change was refused."));
      setBusy(false);
    }
  }

  return (
    <Modal title="Change Approver" onClose={onClose}>
      <div className="space-y-3">
        <p className="text-[12px] text-[var(--color-text-muted)]">{app.employee_name} · {app.leave_type} · {dmy(app.from_date)}{app.to_date !== app.from_date ? ` – ${dmy(app.to_date)}` : ""}. Now: {app.leave_approver_name || app.leave_approver || "none"}</p>
        <Async state={list}>
          {() => options.length === 0 ? <Notice tone="info">No approvers are set for this employee's business unit. Set them in Admin › Organization › Leave approvers.</Notice> : (
            <Field label="New Approver (Business Unit Approvers, in Order)">
              <select className={inputCls} value={chosen} onChange={(e) => setPick(e.target.value)}>
                <option value="">Select…</option>
                {options.map((a) => <option key={a.email} value={a.email} disabled={a.email === app.leave_approver}>{a.name}{a.on_leave ? " (on leave)" : ""}{a.email === app.leave_approver ? " (current)" : ""}</option>)}
              </select>
            </Field>
          )}
        </Async>
        {err && <Notice>{err}</Notice>}
        <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={onClose}>Cancel</Button><Button onClick={save} disabled={busy || !chosen}>{busy ? "Saving…" : "Reassign"}</Button></div>
      </div>
    </Modal>
  );
}
