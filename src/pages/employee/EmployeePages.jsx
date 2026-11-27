// Employee portal: all employee pages in one file.
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ArrowRight, BadgeCheck, Bell, Cake, CalendarCheck, CalendarClock, CalendarDays, CheckCheck, ChevronLeft, ChevronRight, ClipboardCheck, Download, ExternalLink, FileText, GraduationCap, HeartPulse, KeyRound, Laptop, LifeBuoy, LogIn, LogOut, Mail, Megaphone, Paperclip, Pencil, Phone, Plus, Receipt, Search, ShieldAlert, Target, Trash2, Undo2, Upload, UserRound, Users, Wallet } from "lucide-react";
import { Async, ChangePasswordForm, chipCls, Empty, ErrorState, Field, Grid, inputCls, KeyValue, Loading, Modal, Notice, PageHeader, Panel, Skeleton, Stat, StatusPill, Tabs, useEmployee } from "../../components/employee/EmployeeShell";
import { CONTACTS, createRequest, joinLeaveReason, LEAVE_REASONS, OTHER_REASON, splitLeaveReason, daysBetween, daysUntil, dmy, dmyHm, errMsg, EXPIRY_WARN_DAYS, getAcknowledged, getAnnouncements, attReqStatus, getAppraisals, getApprovals, getAttendanceHistory, getAttendanceRequests, getCheckinsBetween, getEvents, getExpenseClaims, getFeedback, getGoals, getHolidays, getLeaveApplications, getLeaveBalance, getLeaveTypes, getMyAssets, getMyBenefits, getMyDocuments, getMyIdentity, getMyLeavesBetween, getMyTraining, getNotifications, getPayslips, getPolicies, getRequests, getShiftAssignments, getTeamAvailability, getTodayAttendance, getUpcomingBirthdays, hm, punchDayStatus, hoursLabel, isoDate, LETTER_TYPES, money, MONTHS, MONTHS_LONG, nowStamp, pad, removeMyDocument, REQUEST_CATEGORIES, splitRequest, stripHtml, updateRequest, uploadMyDocument, withdrawRequest, summariseCheckins, useAsync, WEEKDAYS } from "../../lib/employeePortal";
import { useAuth } from "../../context/AuthContext";
import { hasPermission } from "../../permissions/roles";
import { greetingName } from "../../lib/names";
import { searchPages, searchRecords } from "../../lib/appSearch";
import { GROUP_ICONS } from "../../components/search/GlobalSearch";

// Workspace dashboards that HR staff / Project Managers who are also employees switch to from their one Dashboard.
const HRDashboard = lazy(() => import("../hr/Dashboard"));
const PMDashboard = lazy(() => import("../pm/PMPages").then((m) => ({ default: m.PMDashboard })));
import { Button, DateField, LinkField } from "../../components/ui/primitives";
import { ProfileAvatar } from "../../components/ProfilePhoto";
import { frappe } from "../../lib/api/frappeClient";
import { addBills, billCounts, createExpenseClaim, getApprovers, getRejectionReasons, pickApprover } from "../../lib/approvals";
import { ApprovalQueue, useApprovalQueue } from "../../components/approvals/ApprovalQueue";
import { alertDialog, confirmDialog } from "../../components/ui/dialogs";

/* ===== EmpApprovals.jsx ===== */
const TYPES = ["All", "Leave", "Attendance", "Timesheet", "Expense"];

export function EmpApprovals() {
  const { employee } = useEmployee();
  const q = useAsync(() => getApprovals(employee.name), [employee.name]);
  const waiting = useApprovalQueue();
  const [tab, setTab] = useState("mine");
  const [type, setType] = useState("All");
  const [onlyPending, setOnlyPending] = useState(false);
  const waitingCount = waiting.data ? waiting.data.leaves.length + waiting.data.expenses.length + (waiting.data.attendance?.length || 0) : undefined;

  return (
    <>
      <PageHeader icon={ClipboardCheck} title="My Approvals" subtitle="Every request of yours in one place - and the ones waiting for your decision" />
      <Tabs value={tab} onChange={setTab} tabs={[{ id: "mine", label: "My Requests" }, { id: "waiting", label: "Waiting for My Approval", count: waitingCount }]} />
      {tab === "waiting" && <ApprovalQueue state={waiting} />}
      {tab === "mine" && <Async state={q}>
        {(d) => {
          const rows = d.items.filter((i) => (type === "All" || i.type === type) && (!onlyPending || i.pending));
          return (
            <>
              {d.failed.length > 0 && <Notice tone="info">Couldn't load {d.failed.join(", ").toLowerCase()} requests - your account may not have access to them yet.</Notice>}
              <Panel>
                <div className="mb-4 flex flex-wrap items-center gap-2">
                  {TYPES.map((t) => <button key={t} type="button" onClick={() => setType(t)} className={chipCls(type === t)}>{t}{t !== "All" && <span className="ml-1 text-[10px] text-[var(--color-text-faint)]">{d.items.filter((i) => i.type === t).length}</span>}</button>)}
                  <label className="ml-auto flex items-center gap-2 text-[12px] text-[var(--color-text-muted)]"><input type="checkbox" checked={onlyPending} onChange={(e) => setOnlyPending(e.target.checked)} /> Pending only</label>
                </div>
                <Grid rows={rows} rowKey={(r) => `${r.type}-${r.id}`} empty="No requests match this filter." columns={[
                  { key: "type", label: "Type" },
                  { key: "title", label: "Request", render: (r) => <><span>{r.title}</span>{r.detail && <span className="ml-2 text-[11px] text-[var(--color-text-faint)]">{r.detail}</span>}{r.reason && <span className="ml-2 text-[11px] text-[var(--color-red-hover)]">Reason: {r.reason}</span>}</> },
                  { key: "approver", label: "Approver", render: (r) => r.approver || "—" },
                  { key: "from", label: "Date", render: (r) => `${dmy(r.from)}${r.to && r.to !== r.from ? ` – ${dmy(r.to)}` : ""}` },
                  { key: "created", label: "Requested", render: (r) => dmy(r.created) },
                  { key: "status", label: "Status", render: (r) => <StatusPill status={r.status} /> },
                  { key: "_l", label: "", render: (r) => <Link to={r.link} className="text-[11px] text-[var(--color-red-hover)] hover:underline">Open</Link> },
                ]} />
              </Panel>
            </>
          );
        }}
      </Async>}
    </>
  );
}

/* ===== EmpAssets.jsx ===== */
export function EmpAssets() {
  const { user } = useAuth();
  const { employee } = useEmployee();
  const assets = useAsync(() => getMyAssets(employee.name), [employee.name]);
  const requests = useAsync(() => getRequests(user.email, "Asset"), [user.email]);

  return (
    <>
      <PageHeader icon={Laptop} title="My Assets" subtitle="Equipment assigned to you and your repair or return request history" />
      <Panel title="Assigned to Me">
        <Async state={assets}>
          {(rows) => <Grid rows={rows} empty="No equipment is assigned to you." columns={[
            { key: "custom_asset_code", label: "Asset Code", render: (r) => <span className="font-medium">{r.custom_asset_code || r.name}</span> },
            { key: "asset_name", label: "Asset", render: (r) => <span>{r.asset_name}<span className="block text-[11px] text-[var(--color-text-faint)]">{r.asset_category}{r.custom_serial_number ? ` · S/N ${r.custom_serial_number}` : ""}</span></span> },
            { key: "custom_assigned_on", label: "Assigned On", render: (r) => dmy(r.custom_assigned_on || r.purchase_date) },
            { key: "location", label: "Where", render: (r) => r.location || "—" },
            { key: "custom_other_assets", label: "Also Given", render: (r) => r.custom_other_assets || "—" },
            { key: "status", label: "Condition", render: (r) => <StatusPill status={r.custom_condition || r.status} /> },
          ]} />}
        </Async>
      </Panel>
      <Panel title="My Asset Requests">
        <Async state={requests}>{(rows) => <Grid rows={rows} empty="No repair or return requests." columns={[{ key: "subject", label: "Request" }, { key: "creation", label: "Raised", render: (r) => dmy(r.creation) }, { key: "status", label: "Status", render: (r) => <StatusPill status={r.status} /> }]} />}</Async>
      </Panel>
    </>
  );
}

/* ===== EmpAttendance.jsx ===== */

function workedToday(logs, nowMs) {
  let total = 0;
  let openIn = null;
  for (const l of logs) {
    const t = new Date(l.time.replace(" ", "T")).getTime();
    if (l.log_type === "IN" && openIn == null) openIn = t;
    else if (l.log_type === "OUT" && openIn != null) { total += t - openIn; openIn = null; }
  }
  if (openIn != null) total += Math.max(nowMs - openIn, 0);
  return total / 3600000;
}

export function EmpAttendance() {
  const { employee } = useEmployee();
  const emp = employee.name;
  const [now, setNow] = useState(() => Date.now());
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [request, setRequest] = useState(null);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const todayQ = useAsync(() => getTodayAttendance(emp), [emp]);
  const from = `${year}-${pad(month + 1)}-01`;
  const to = `${year}-${pad(month + 1)}-${pad(new Date(year, month + 1, 0).getDate())}`;
  const history = useAsync(async () => {
    const [att, logs] = await Promise.all([getAttendanceHistory(emp, from, to), getCheckinsBetween(emp, from, to).catch(() => [])]);
    const have = new Set(att.map((r) => r.attendance_date));
    // Days with punches but no attendance record yet still count - HR confirms them.
    const punches = new Map(summariseCheckins(logs).map((d) => [d.attendance_date, d]));
    const saved = att.map((r) => { const p = !r.in_time && punches.get(r.attendance_date); return p ? { ...r, in_time: p.in_time, out_time: p.stillIn ? null : p.out_time } : r; });
    const derived = summariseCheckins(logs).filter((d) => !have.has(d.attendance_date)).map((d) => ({ name: `punch-${d.attendance_date}`, attendance_date: d.attendance_date, status: punchDayStatus(d), in_time: d.in_time, out_time: d.stillIn ? null : d.out_time, working_hours: d.working_hours, derived: true }));
    return [...saved, ...derived].sort((a, b) => b.attendance_date.localeCompare(a.attendance_date));
  }, [emp, from]);
  const requests = useAsync(() => getAttendanceRequests(emp), [emp]);

  const logs = todayQ.data?.logs || [];
  const last = logs[logs.length - 1];
  const nextType = last?.log_type === "IN" ? "OUT" : "IN";
  const clock = new Date(now);

  async function punch() {
    const at = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    if (!(await confirmDialog({ title: nextType === "IN" ? "Punch In" : "Punch Out", message: `Record punch ${nextType === "IN" ? "in" : "out"} at ${at}?`, confirmLabel: nextType === "IN" ? "Punch In" : "Punch Out" }))) return;
    setBusy(true);
    setMsg("");
    try {
      await frappe.createDoc("Employee Checkin", { employee: emp, log_type: nextType, time: nowStamp() });
      todayQ.reload();
    } catch (e) {
      setMsg(errMsg(e, "Couldn't record your punch."));
    } finally {
      setBusy(false);
    }
  }

  const rows = history.data || [];
  const counts = rows.reduce((a, r) => ({ ...a, [r.status]: (a[r.status] || 0) + 1 }), {});
  const totalHours = rows.reduce((s, r) => s + (Number(r.working_hours) || 0), 0);
  const years = Array.from({ length: 5 }, (_, i) => today.getFullYear() - i);

  return (
    <>
      <PageHeader icon={CalendarCheck} title="Attendance" subtitle="Punch in and out, review your history and request corrections" actions={<Button variant="secondary" onClick={() => setRequest({ from_date: isoDate(), to_date: isoDate() })}><Plus size={14} /> Request Correction</Button>} />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <Panel title="Today" className="lg:col-span-1">
          <div className="text-center">
            <p className="text-4xl font-semibold tracking-tight text-[var(--color-text)] tabular-nums">{pad(clock.getHours())}:{pad(clock.getMinutes())}<span className="text-xl text-[var(--color-text-muted)]">:{pad(clock.getSeconds())}</span></p>
            <p className="mt-1 text-[12px] text-[var(--color-text-muted)]">{WEEKDAYS[clock.getDay()]}, {dmy(isoDate(clock))}</p>
            <Button className="mt-5 w-full py-3" onClick={punch} disabled={busy || todayQ.loading}>{nextType === "IN" ? <LogIn size={16} /> : <LogOut size={16} />}{busy ? "Recording…" : nextType === "IN" ? "Punch In" : "Punch Out"}</Button>
            {msg && <div className="mt-3 text-left"><Notice>{msg}</Notice></div>}
            {todayQ.data?.logsError && <div className="mt-3 text-left"><Notice tone="info">Punching isn't enabled for your account yet.</Notice></div>}
            <p className="mt-4 text-[12px] text-[var(--color-text-muted)]">Working today: <b className="text-[var(--color-text)]">{hoursLabel(workedToday(logs, now))}</b></p>
          </div>
          {logs.length > 0 && (
            <ul className="mt-4 space-y-1.5 border-t border-[var(--color-border)] pt-3 text-[12px]">
              {logs.map((l) => <li key={l.name} className="flex justify-between"><span className={l.log_type === "IN" ? "text-[var(--color-green)]" : "text-[var(--color-amber)]"}>{l.log_type === "IN" ? "Punch In" : "Punch Out"}</span><span className="text-[var(--color-text-muted)]">{hm(l.time)}</span></li>)}
            </ul>
          )}
        </Panel>

        <Panel title="Attendance History" className="lg:col-span-2" action={
          <div className="flex gap-2">
            <select value={month} onChange={(e) => setMonth(Number(e.target.value))} className={`${inputCls} !w-auto !py-1`}>{MONTHS_LONG.map((m, i) => <option key={m} value={i}>{m}</option>)}</select>
            <select value={year} onChange={(e) => setYear(Number(e.target.value))} className={`${inputCls} !w-auto !py-1`}>{years.map((y) => <option key={y}>{y}</option>)}</select>
          </div>}>
          <Async state={history}>
            {() => (
              <>
                <div className="mb-3 flex flex-wrap gap-1.5 text-[11px]">
                  <span className="rounded border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 py-0.5 text-[var(--color-text)]">Days {rows.length}</span>
                  {Object.entries(counts).map(([s, n]) => <span key={s} className="rounded border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 py-0.5 text-[var(--color-text-muted)]">{s} {n}</span>)}
                  <span className="rounded border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 py-0.5 text-[var(--color-text-muted)]">Hours {hoursLabel(totalHours)}</span>
                </div>
                <Grid rows={rows} empty="No attendance recorded for this month." columns={[
                  { key: "attendance_date", label: "Date", render: (r) => dmy(r.attendance_date) },
                  { key: "status", label: "Status", render: (r) => <span className="flex items-center gap-2"><StatusPill status={r.status} />{r.derived && <span className="text-[10px] text-[var(--color-text-faint)]">via punch</span>}</span> },
                  { key: "in_time", label: "In", render: (r) => hm(r.in_time) || "—" },
                  { key: "out_time", label: "Out", render: (r) => hm(r.out_time) || "—" },
                  { key: "working_hours", label: "Hours", render: (r) => (r.working_hours ? hoursLabel(r.working_hours) : "—") },
                  { key: "_a", label: "", render: (r) => <button type="button" className="text-[11px] text-[var(--color-red-hover)] hover:underline" onClick={() => setRequest({ from_date: r.attendance_date, to_date: r.attendance_date })}>Correct</button> },
                ]} />
              </>
            )}
          </Async>
        </Panel>
      </div>

      <Panel title="Correction Requests" hint="Missed punches, work from home or on-duty">
        <Async state={requests}>
          {(rows2) => <Grid rows={rows2} empty="No correction requests yet." columns={[
            { key: "from_date", label: "Period", render: (r) => `${dmy(r.from_date)}${r.to_date !== r.from_date ? ` – ${dmy(r.to_date)}` : ""}` },
            { key: "reason", label: "Reason" },
            { key: "explanation", label: "Details", render: (r) => <span className="text-[var(--color-text-muted)]">{stripHtml(r.explanation || "") || "—"}</span> },
            { key: "custom_approver", label: "Approver", render: (r) => r.custom_approver || "—" },
            { key: "docstatus", label: "Status", render: (r) => <span><StatusPill status={attReqStatus(r)} />{r.custom_decision === "Rejected" && r.custom_decision_note && <span className="mt-0.5 block text-[11px] text-[var(--color-red-hover)]">{stripHtml(r.custom_decision_note)}</span>}</span> },
          ]} />}
        </Async>
      </Panel>

      {request && <CorrectionModal employee={employee} initial={request} onClose={() => setRequest(null)} onSaved={() => { setRequest(null); requests.reload(); }} />}
      {todayQ.error && <ErrorState error={todayQ.error} />}
    </>
  );
}

/** Attendance correction request; it goes to the same approver as leave (business unit, else the manager). */
function CorrectionModal({ employee, initial, onClose, onSaved }) {
  const [f, setF] = useState({ ...initial, reason: "Work From Home", explanation: "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const approvers = useAsync(() => getApprovers(employee, "Leave Application"), [employee.name]);
  const [chosen, setChosen] = useState("");
  const list = approvers.data || [];
  const approver = list.find((a) => a.email === chosen && !a.on_leave)?.email || pickApprover(list)?.email || "";
  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setErr("");
    try {
      await frappe.createDoc("Attendance Request", { employee: employee.name, company: employee.company, from_date: f.from_date, to_date: f.to_date, reason: f.reason, explanation: f.explanation, custom_approver: approver || undefined });
      onSaved();
    } catch (x) {
      setErr(errMsg(x));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal title="Request Attendance Correction" onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <div className="grid grid-cols-2 gap-3"><DateField label="From" value={f.from_date} onChange={(v) => setF({ ...f, from_date: v })} required /><DateField label="To" value={f.to_date} onChange={(v) => setF({ ...f, to_date: v })} required /></div>
        <Field label="Reason"><select className={inputCls} value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })}><option>Work From Home</option><option>On Duty</option></select></Field>
        <Field label="Explanation"><textarea rows={3} required className={inputCls} value={f.explanation} onChange={(e) => setF({ ...f, explanation: e.target.value })} placeholder="e.g. Forgot to punch out, worked at client site" /></Field>
        <Field label="Approver">
          {approvers.loading && !approvers.data ? <p className="py-2 text-[13px] text-[var(--color-text-muted)]">Finding your approver…</p> : list.length === 0 ? <p className="py-2 text-[13px] text-[var(--color-amber)]">No approver is set for you yet - it goes to your manager, or HR assigns one.</p> : (
            <select className={inputCls} value={approver} onChange={(e) => setChosen(e.target.value)}>{list.map((a) => <option key={a.email} value={a.email} disabled={a.on_leave}>{a.name}{a.on_leave ? " (on leave)" : ""}</option>)}</select>
          )}
        </Field>
        {err && <Notice>{err}</Notice>}
        <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={onClose}>Cancel</Button><Button type="submit" disabled={busy || !f.from_date || !f.to_date}>{busy ? "Sending…" : "Send Request"}</Button></div>
      </form>
    </Modal>
  );
}

/* ===== EmpBenefits.jsx ===== */
export function EmpBenefits() {
  const { employee: e } = useEmployee();
  const data = useAsync(() => getMyBenefits(e.name), [e.name]);
  const contact = CONTACTS.find((c) => c.area.startsWith("Insurance"));
  const provider = data.data?.insurance?.provider || e.health_insurance_provider;
  const policy = data.data?.insurance?.number || e.health_insurance_no;

  return (
    <>
      <PageHeader icon={HeartPulse} title="Benefits & Insurance" subtitle="Your coverage, benefit claims and who to contact" />
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Panel title="Health Insurance">
          {provider || policy ? <KeyValue items={[["Provider", provider], ["Policy / Member Number", policy]]} /> : <p className="text-[13px] text-[var(--color-text-muted)]">HR hasn't added your insurance details yet. <Link to="/employee/help" className="text-[var(--color-red-hover)] hover:underline">Ask HR</Link> to add them.</p>}
        </Panel>
        <Panel title="Claim Contact">
          {contact && (contact.name || contact.email || contact.phone) ? (
            <div className="space-y-1.5 text-[13px]">{contact.name && <p className="font-medium text-[var(--color-text)]">{contact.name}</p>}{contact.email && <a href={`mailto:${contact.email}`} className="flex items-center gap-2 text-[var(--color-red-hover)] hover:underline"><Mail size={13} /> {contact.email}</a>}{contact.phone && <a href={`tel:${contact.phone}`} className="flex items-center gap-2 text-[var(--color-text-muted)]"><Phone size={13} /> {contact.phone}</a>}</div>
          ) : <p className="text-[13px] text-[var(--color-text-muted)]">Claim contact details haven't been added yet.</p>}
        </Panel>
      </div>
      <Panel title="My Benefits" hint="From your benefit application and salary structure">
        <Async state={data}>{({ benefits }) => (benefits.length === 0 ? <p className="text-[13px] text-[var(--color-text-muted)]">HR hasn't added any benefits for you yet. <Link to="/employee/help" className="text-[var(--color-red-hover)] hover:underline">Ask HR</Link> if you expected some here.</p> : <Grid rows={benefits} columns={[{ key: "benefit", label: "Benefit" }, { key: "amount", label: "Amount", render: (r) => money(r.amount) }, { key: "limit", label: "Limit", render: (r) => (r.limit ? money(r.limit) : "—") }, { key: "source", label: "From" }]} />)}</Async>
      </Panel>
      <Panel title="Benefit Claims">
        <Async state={data}>{({ claims }) => <Grid rows={claims} empty="You haven't made any benefit claims." columns={[{ key: "claim_date", label: "Date", render: (r) => dmy(r.claim_date) }, { key: "earning_component", label: "Benefit", render: (r) => r.earning_component || "—" }, { key: "claimed_amount", label: "Amount", render: (r) => money(r.claimed_amount) }, { key: "docstatus", label: "Status", render: (r) => <StatusPill status={r.docstatus === 1 ? "Approved" : "Pending"} /> }]} />}</Async>
      </Panel>
    </>
  );
}

/* ===== EmpCalendar.jsx ===== */
// Calendar & Holidays. Everyone sees their holiday list, weekly offs, their own leave, company events and birthdays.
// HR and the Administrator can also edit it: click any day to add / rename / remove a holiday, make it a weekly off or
// a working day, or add / remove company events - and the "Holiday Lists" tab sets up whole lists (weekly offs, festival
// holidays pasted from a sheet, company default, who uses each list).
import { CalendarPlus, CalendarRange, ClipboardPaste, PartyPopper, Star } from "lucide-react";

const HOL_EVENT = "#4f8cff";
const HOL_DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const HOL_JS_DAY = { Sunday: 0, Monday: 1, Tuesday: 2, Wednesday: 3, Thursday: 4, Friday: 5, Saturday: 6 };
const holIso = (d) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
const canEditCalendar = (user) => hasPermission(user, "dashboard.hr") || hasPermission(user, "dashboard.admin");

/** Every list, the companies / offices / employees using them, and each list's holiday and weekly-off counts. */
async function holLoadLists() {
  const safe = (p) => p.catch(() => []);
  const [lists, companies, employees, branches, rows] = await Promise.all([
    frappe.getList("Holiday List", { fields: ["name", "from_date", "to_date"], orderBy: "from_date desc", limit: 0 }),
    safe(frappe.getList("Company", { fields: ["name", "default_holiday_list"], limit: 0 })),
    safe(frappe.getList("Employee", { filters: [["status", "=", "Active"]], fields: ["name", "employee_name", "company", "branch", "holiday_list"], limit: 0 })),
    safe(frappe.getList("Branch", { fields: ["name", "custom_holiday_list"], limit: 0 })),
    safe(frappe.getList("Holiday", { parent: "Holiday List", fields: ["parent", "holiday_date", "weekly_off"], limit: 0 })),
  ]);
  const counts = {};
  for (const r of rows) {
    const c = (counts[r.parent] = counts[r.parent] || { holidays: 0, weeklyOffs: 0, next: null });
    if (Number(r.weekly_off)) c.weeklyOffs += 1;
    else {
      c.holidays += 1;
      if (r.holiday_date >= isoDate() && (!c.next || r.holiday_date < c.next)) c.next = r.holiday_date;
    }
  }
  return { lists, companies, employees, branches, counts };
}

/** Weekly-off rows for every matching weekday between two dates (inclusive). */
function holWeeklyOffRows(from, to, days) {
  const want = new Set(days.map((d) => HOL_JS_DAY[d]));
  const rows = [];
  for (let d = new Date(`${from}T00:00:00Z`); holIso(d) <= to; d = new Date(d.getTime() + 86400000)) {
    if (want.has(d.getUTCDay())) rows.push({ holiday_date: holIso(d), description: HOL_DAYS[(d.getUTCDay() + 6) % 7], weekly_off: 1 });
  }
  return rows;
}

/** One row per date (the last one wins), sorted, tidy. */
function holClean(rows) {
  const seen = new Map();
  for (const r of rows) if (r.holiday_date) seen.set(r.holiday_date, { holiday_date: r.holiday_date, description: String(r.description || "").replace(/<[^>]+>/g, "").trim() || "Holiday", weekly_off: Number(r.weekly_off) ? 1 : 0 });
  return [...seen.values()].sort((a, b) => a.holiday_date.localeCompare(b.holiday_date));
}
const holSaveRows = (name, rows) => frappe.updateDoc("Holiday List", name, { holidays: holClean(rows) });

/** Add or rename one day on a list; `null` removes it. The list's period must contain the date. */
async function holSetDay(listName, date, description, weeklyOff = false) {
  const doc = await frappe.getDoc("Holiday List", listName);
  if (date < doc.from_date || date > doc.to_date) throw new Error(`${listName} only covers ${dmy(doc.from_date)} to ${dmy(doc.to_date)}. Pick or create the list for that period.`);
  const rest = (doc.holidays || []).filter((h) => h.holiday_date !== date);
  return holSaveRows(listName, description === null ? rest : [...rest, { holiday_date: date, description, weekly_off: weeklyOff ? 1 : 0 }]);
}

/** Lines like "25-12-2026, Christmas", "2026-12-25 Christmas" or "25/12/2026 - Christmas" -> rows; bad lines come back too. */
function holParseLines(text) {
  const rows = [];
  const bad = [];
  for (const raw of String(text).split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})\s*[,\-–:\t ]\s*(.+)$/.exec(line) || /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})\s*[,\-–:\t ]\s*(.+)$/.exec(line);
    if (!m) { bad.push(line); continue; }
    const [y, mo, d] = m[1].length === 4 ? [m[1], m[2], m[3]] : [m[3], m[2], m[1]];
    if (Number(mo) < 1 || Number(mo) > 12 || Number(d) < 1 || Number(d) > 31) { bad.push(line); continue; }
    rows.push({ holiday_date: `${y}-${pad(mo)}-${pad(d)}`, description: m[4].trim(), weekly_off: 0 });
  }
  return { rows, bad };
}

const holEventsBetween = (from, to) =>
  frappe.getList("Event", { filters: [["event_type", "=", "Public"], ["starts_on", ">=", `${from} 00:00:00`], ["starts_on", "<=", `${to} 23:59:59`]], fields: ["name", "subject", "starts_on", "all_day"], orderBy: "starts_on asc", limit: 0 });

export function EmpCalendar() {
  const { employee } = useEmployee();
  const { user } = useAuth();
  const editor = canEditCalendar(user);
  const [tab, setTab] = useState("calendar");
  return (
    <>
      <PageHeader icon={CalendarDays} title="Calendar & Holidays" subtitle={editor ? "Company holidays, weekly offs, shifts and events - you can edit the calendar and the holiday lists" : "Company holidays, weekly offs, your shifts and events"} />
      <Tabs value={tab} onChange={setTab} tabs={[{ id: "calendar", label: "Calendar" }, { id: "shifts", label: "Shifts & Events" }, { id: "team", label: "Team Availability" }, ...(editor ? [{ id: "lists", label: "Holiday Lists" }] : [])]} />
      {tab === "calendar" && <CalendarTab employee={employee} editor={editor} onLists={() => setTab("lists")} />}
      {tab === "shifts" && <ShiftsTab employee={employee} />}
      {tab === "team" && <TeamTab employee={employee} />}
      {tab === "lists" && editor && <HolidayListsTab />}
    </>
  );
}

/** Next 30 days. Names and dates only: the year of birth is never sent to the browser. */
function BirthdayList({ rows, limit = 6 }) {
  if (!rows?.length) return <p className="text-[13px] text-[var(--color-text-muted)]">No birthdays in the next 30 days.</p>;
  return (
    <ul className="space-y-2.5">
      {rows.slice(0, limit).map((b) => (
        <li key={`${b.name}-${b.date}`} className="flex items-center justify-between gap-3 text-[13px]">
          <span className="flex min-w-0 items-center gap-2 text-[var(--color-text)]"><Cake size={14} className="shrink-0 text-[var(--color-red-hover)]" /><span className="truncate">{b.name}</span></span>
          <span className="shrink-0 text-[12px] text-[var(--color-text-muted)]">{b.days_away === 0 ? "Today" : b.days_away === 1 ? "Tomorrow" : dmy(b.date).slice(0, 5)}</span>
        </li>
      ))}
    </ul>
  );
}

function CalendarTab({ employee, editor, onLists }) {
  const t = new Date();
  const [cursor, setCursor] = useState({ y: t.getFullYear(), m: t.getMonth() });
  const [day, setDay] = useState(null); // ISO date being edited
  const [msg, setMsg] = useState("");
  const holidays = useAsync(() => getHolidays(employee), [employee.name]);
  const birthdays = useAsync(getUpcomingBirthdays, []);
  const start = `${cursor.y}-${pad(cursor.m + 1)}-01`;
  const end = `${cursor.y}-${pad(cursor.m + 1)}-${pad(new Date(cursor.y, cursor.m + 1, 0).getDate())}`;
  const leaves = useAsync(() => getMyLeavesBetween(employee.name, start, end), [employee.name, start]);
  const events = useAsync(() => holEventsBetween(start, end).catch(() => []), [start]);

  const byDate = useMemo(() => Object.fromEntries((holidays.data?.holidays || []).map((h) => [h.date, h])), [holidays.data]);
  const eventsOn = (iso) => (events.data || []).filter((e) => String(e.starts_on).slice(0, 10) === iso);
  const leaveOn = (iso) => (leaves.data || []).find((l) => l.from_date <= iso && l.to_date >= iso);
  const first = new Date(cursor.y, cursor.m, 1).getDay();
  const dim = new Date(cursor.y, cursor.m + 1, 0).getDate();
  const cells = [...Array(first).fill(null), ...Array.from({ length: dim }, (_, i) => i + 1)];
  const upcoming = (holidays.data?.holidays || []).filter((h) => !h.weeklyOff && h.date >= isoDate()).slice(0, 8);
  const go = (d) => setCursor(({ y, m }) => { const n = new Date(y, m + d, 1); return { y: n.getFullYear(), m: n.getMonth() }; });
  const changed = (text) => { setDay(null); setMsg(text); holidays.reload(); events.reload(); };

  return (
    <div className="space-y-4">
      {editor && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-dashed border-[color-mix(in_srgb,var(--color-red)_45%,transparent)] bg-[var(--color-red-wash)] px-4 py-2.5">
          <p className="flex items-center gap-2 text-[12.5px] text-[var(--color-text)]"><Pencil size={14} className="text-[var(--color-red-hover)]" /> You can edit this calendar: click any day to add or change a holiday, a weekly off or a company event.</p>
          <button type="button" onClick={onLists} className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-[var(--color-red-hover)] hover:underline"><CalendarRange size={14} /> Holiday Lists</button>
        </div>
      )}
      {msg && <Notice tone="info">{msg}</Notice>}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <Panel className="lg:col-span-2" title={`${MONTHS_LONG[cursor.m]} ${cursor.y}`} hint={holidays.data?.name ? `Holiday list: ${holidays.data.name}` : undefined} action={
          <div className="flex gap-1"><button type="button" aria-label="Previous month" onClick={() => go(-1)} className="rounded p-1.5 text-[var(--color-text-muted)] hover:bg-[var(--color-surface-2)]"><ChevronLeft size={16} /></button><button type="button" onClick={() => setCursor({ y: t.getFullYear(), m: t.getMonth() })} className="rounded px-2 text-[12px] text-[var(--color-text-muted)] hover:bg-[var(--color-surface-2)]">Today</button><button type="button" aria-label="Next month" onClick={() => go(1)} className="rounded p-1.5 text-[var(--color-text-muted)] hover:bg-[var(--color-surface-2)]"><ChevronRight size={16} /></button></div>
        }>
          <Async state={holidays}>
            {() => (
              <>
                <div className="grid grid-cols-7 gap-1 text-center text-[11px] text-[var(--color-text-faint)]">{WEEKDAYS.map((d) => <div key={d} className="py-1">{d}</div>)}</div>
                <div className="grid grid-cols-7 gap-1">
                  {cells.map((d, i) => {
                    if (!d) return <div key={`e${i}`} />;
                    const iso = `${cursor.y}-${pad(cursor.m + 1)}-${pad(d)}`;
                    const h = byDate[iso];
                    const l = leaveOn(iso);
                    const ev = eventsOn(iso);
                    const born = (birthdays.data || []).filter((b) => b.date === iso);
                    const isToday = iso === isoDate();
                    const bg = l ? "color-mix(in srgb, var(--color-amber) 22%, transparent)" : h && !h.weeklyOff ? "var(--color-red-wash)" : h?.weeklyOff ? "var(--color-surface-2)" : "transparent";
                    const tip = [h?.description, l && "On leave", ...ev.map((e) => `Event: ${e.subject}`), editor && "Click to edit"].filter(Boolean).join(" · ");
                    const Tag = editor ? "button" : "div";
                    return (
                      <Tag key={iso} type={editor ? "button" : undefined} onClick={editor ? () => { setMsg(""); setDay(iso); } : undefined} title={tip}
                        className={`group relative flex h-16 flex-col overflow-hidden rounded-md border p-1.5 text-left text-[12px] ${isToday ? "border-[var(--color-red)]" : "border-[var(--color-border)]"} ${editor ? "transition-colors hover:border-[var(--color-red)]" : ""}`} style={{ background: bg }}>
                        <span className={h?.weeklyOff ? "text-[var(--color-text-faint)]" : "text-[var(--color-text)]"}>{d}</span>
                        {editor && <Pencil size={10} className="absolute right-1.5 top-1.5 text-[var(--color-text-faint)] opacity-0 transition-opacity group-hover:opacity-100" />}
                        <span className="mt-auto space-y-0.5">
                          {h && !h.weeklyOff && <span className="block truncate text-[10px] text-[var(--color-red-hover)]">{h.description}</span>}
                          {ev.length > 0 && <span className="block truncate text-[10px]" style={{ color: HOL_EVENT }}>{ev.length > 1 ? `${ev.length} events` : ev[0].subject}</span>}
                          {l && !h && <span className="block truncate text-[10px] text-[var(--color-amber)]">Leave</span>}
                          {born.length > 0 && <span title={born.map((b) => b.name).join(", ")} className="flex items-center gap-0.5 truncate text-[10px] text-[var(--color-text-muted)]"><Cake size={10} className="shrink-0" /> {born.length > 1 ? `${born.length} birthdays` : born[0].name.split(" ")[0]}</span>}
                        </span>
                      </Tag>
                    );
                  })}
                </div>
                <div className="mt-4 flex flex-wrap gap-4 text-[11px] text-[var(--color-text-muted)]">
                  {[["var(--color-red-wash)", "Holiday"], ["var(--color-surface-2)", "Weekly off"], ["color-mix(in srgb, var(--color-amber) 22%, transparent)", "Your leave"]].map(([c, label]) => <span key={label} className="flex items-center gap-1.5"><i className="h-3 w-3 rounded border border-[var(--color-border)]" style={{ background: c }} />{label}</span>)}
                  <span className="flex items-center gap-1.5"><i className="h-3 w-3 rounded" style={{ background: HOL_EVENT }} />Company event</span>
                </div>
              </>
            )}
          </Async>
        </Panel>
        <Panel title="Upcoming Holidays">
          {holidays.data && !holidays.data.name && <Empty text={editor ? "No holiday list applies here yet. Create one in the Holiday Lists tab and make it the company default." : "No holiday list is assigned to you yet. Ask HR to set your Office Location."} />}
          {upcoming.length > 0 && <ul className="space-y-3">{upcoming.map((h) => <li key={h.date} className="flex items-center justify-between text-[13px]"><span className="text-[var(--color-text)]">{h.description}</span><span className="text-[var(--color-text-muted)]">{dmy(h.date)}</span></li>)}</ul>}
          {holidays.data?.name && upcoming.length === 0 && <Empty text={(holidays.data.holidays || []).some((h) => !h.weeklyOff) ? "No more holidays this year." : editor ? "No holidays in this list yet - click a day on the calendar, or add them all at once in the Holiday Lists tab." : "No holidays have been added to this list yet."} />}
          <div className="mt-5 border-t border-[var(--color-border)] pt-4"><p className="mb-3 text-[13px] font-semibold text-[var(--color-text)]">Upcoming Birthdays</p><BirthdayList rows={birthdays.data} /></div>
        </Panel>
      </div>
      {day && <DayEditor date={day} listName={holidays.data?.name} holiday={byDate[day]} events={eventsOn(day)} onClose={() => setDay(null)} onDone={changed} />}
    </div>
  );
}

/** HR / Administrator: change one day - its holiday (on a chosen list) and its company events. */
function DayEditor({ date, listName, holiday, events, onClose, onDone }) {
  const lists = useAsync(holLoadLists, []);
  const covering = (lists.data?.lists || []).filter((l) => l.from_date <= date && l.to_date >= date);
  const [picked, setPicked] = useState(listName || "");
  const list = covering.some((l) => l.name === picked) ? picked : covering[0]?.name || "";
  const [name, setName] = useState(holiday && !holiday.weeklyOff ? holiday.description : "");
  const [ev, setEv] = useState({ subject: "", time: "", description: "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const label = new Date(`${date}T00:00:00`).toLocaleDateString("en-GB", { weekday: "long", day: "2-digit", month: "long", year: "numeric" });
  const onThisList = list === listName ? holiday : null; // what the shown list has for this day

  async function run(action, text) {
    setBusy(true);
    setErr("");
    try { await action(); onDone(text); } catch (x) { setErr(errMsg(x, "Couldn't save the change.")); setBusy(false); }
  }
  const addEvent = () => frappe.createDoc("Event", { subject: ev.subject.trim(), event_type: "Public", all_day: ev.time ? 0 : 1, starts_on: `${date} ${ev.time || "00:00"}:00`, description: ev.description.trim() || undefined });

  return (
    <Modal title={label} onClose={onClose} wide>
      <div className="space-y-5">
        <section className="space-y-3">
          <h3 className="flex items-center gap-2 text-[13px] font-semibold text-[var(--color-text)]"><PartyPopper size={14} className="text-[var(--color-red-hover)]" /> Holiday</h3>
          <Field label="Holiday List" hint={covering.length ? "Changes apply to everyone on this list" : undefined}>
            {lists.loading && !lists.data ? <p className="py-2 text-[13px] text-[var(--color-text-muted)]">Loading lists…</p> : covering.length === 0 ? (
              <p className="py-2 text-[13px] text-[var(--color-amber)]">No holiday list covers {dmy(date)}. Create one in the Holiday Lists tab.</p>
            ) : (
              <select className={inputCls} value={list} onChange={(e) => setPicked(e.target.value)}>{covering.map((l) => <option key={l.name} value={l.name}>{l.name}{l.name === listName ? " (shown here)" : ""}</option>)}</select>
            )}
          </Field>
          {covering.length > 0 && (
            <>
              {onThisList?.weeklyOff && <Notice tone="info">This day is a weekly off on {list}.</Notice>}
              <Field label="Holiday Name"><input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Diwali, Company Foundation Day" /></Field>
              <div className="flex flex-wrap gap-2">
                <Button type="button" disabled={busy || !list || !name.trim()} onClick={() => run(() => holSetDay(list, date, name.trim()), `${name.trim()} on ${dmy(date)} saved to ${list}.`)}>{onThisList && !onThisList.weeklyOff ? "Rename Holiday" : "Make It a Holiday"}</Button>
                {onThisList && <Button type="button" variant="secondary" disabled={busy} onClick={() => run(() => holSetDay(list, date, null), `${dmy(date)} is now a working day on ${list}.`)}><Trash2 size={13} /> {onThisList.weeklyOff ? "Make It a Working Day" : "Remove Holiday"}</Button>}
                {!onThisList && <Button type="button" variant="ghost" disabled={busy || !list} onClick={() => run(() => holSetDay(list, date, new Date(`${date}T00:00:00`).toLocaleDateString("en-GB", { weekday: "long" }), true), `${dmy(date)} is now a weekly off on ${list}.`)}>Mark as Weekly Off</Button>}
              </div>
            </>
          )}
        </section>

        <section className="space-y-3 border-t border-[var(--color-border)] pt-4">
          <h3 className="flex items-center gap-2 text-[13px] font-semibold text-[var(--color-text)]"><CalendarPlus size={14} style={{ color: HOL_EVENT }} /> Company Events</h3>
          {events.length > 0 && (
            <ul className="space-y-1.5">
              {events.map((e) => (
                <li key={e.name} className="flex items-center justify-between gap-3 rounded-md border border-[var(--color-border)] px-3 py-2 text-[13px]">
                  <span className="text-[var(--color-text)]">{e.subject}<span className="ml-2 text-[11.5px] text-[var(--color-text-muted)]">{Number(e.all_day) ? "All day" : String(e.starts_on).slice(11, 16)}</span></span>
                  <button type="button" disabled={busy} onClick={() => run(() => frappe.deleteDoc("Event", e.name), `Event “${e.subject}” removed.`)} className="rounded p-1 text-[var(--color-text-muted)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-red-hover)]" title="Remove event"><Trash2 size={14} /></button>
                </li>
              ))}
            </ul>
          )}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="sm:col-span-2"><Field label="New Event"><input className={inputCls} value={ev.subject} onChange={(e) => setEv({ ...ev, subject: e.target.value })} placeholder="e.g. Town hall, Team outing" /></Field></div>
            <Field label="Time (Optional)"><input type="time" className={inputCls} value={ev.time} onChange={(e) => setEv({ ...ev, time: e.target.value })} /></Field>
          </div>
          <Field label="Details (Optional)"><textarea rows={2} className={inputCls} value={ev.description} onChange={(e) => setEv({ ...ev, description: e.target.value })} /></Field>
          <div className="flex justify-end"><Button type="button" variant="secondary" disabled={busy || !ev.subject.trim()} onClick={() => run(addEvent, `Event “${ev.subject.trim()}” added on ${dmy(date)}. Everyone sees it on the calendar, and it's in the event reminder emails.`)}><CalendarPlus size={13} /> Add Event</Button></div>
        </section>
        {err && <Notice>{err}</Notice>}
      </div>
    </Modal>
  );
}

/* ---------- Holiday Lists tab (HR / Administrator) ---------- */

function HolidayListsTab() {
  const data = useAsync(holLoadLists, []);
  const [editing, setEditing] = useState(null);
  const [creating, setCreating] = useState(false);
  const [using, setUsing] = useState(null);
  const [msg, setMsg] = useState("");
  const done = (text) => { setMsg(text); data.reload(); };
  return (
    <div className="space-y-5">
      {msg && <Notice tone="info">{msg}</Notice>}
      <Async state={data}>
        {(d) => {
          const withoutList = d.employees.filter((e) => !e.holiday_list && !d.companies.find((c) => c.name === e.company)?.default_holiday_list && !d.branches.find((b) => b.name === e.branch)?.custom_holiday_list);
          const current = d.lists.filter((l) => l.from_date <= isoDate() && l.to_date >= isoDate());
          const noHolidays = current.filter((l) => !d.counts[l.name]?.holidays);
          const usedBy = (name) => [...d.companies.filter((c) => c.default_holiday_list === name).map((c) => `${c.name} (default)`), ...d.branches.filter((b) => b.custom_holiday_list === name).map((b) => `${b.name} office`), ...(d.employees.filter((e) => e.holiday_list === name).length ? [`${d.employees.filter((e) => e.holiday_list === name).length} employee(s)`] : [])];
          return (
            <>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <Stat icon={CalendarRange} label="Holiday Lists" value={d.lists.length} sub={`${current.length} cover today`} accent="#4f8cff" />
                <Stat icon={Star} label="Company Defaults" value={d.companies.filter((c) => c.default_holiday_list).length} sub={`of ${d.companies.length} compan${d.companies.length === 1 ? "y" : "ies"}`} accent="var(--color-green)" />
                <Stat icon={CalendarCheck} label="Current Lists Without Holidays" value={noHolidays.length} sub={noHolidays.length ? noHolidays.map((l) => l.name).join(", ") : "All have holidays"} accent="var(--color-amber)" />
                <Stat icon={Users} label="Employees Without a List" value={withoutList.length} sub={withoutList.length ? "Weekends may count as leave" : "Everyone is covered"} accent="var(--color-red-hover)" />
              </div>
              {withoutList.length > 0 && <Notice>{withoutList.length} active employee(s) have no holiday list ({withoutList.slice(0, 5).map((e) => e.employee_name).join(", ")}{withoutList.length > 5 ? "…" : ""}). Make a list their company's default with “Use This List”.</Notice>}
              <Panel title="All Holiday Lists" hint="Edit a list to add festival holidays or change its weekly offs. Changes apply to leave counts, timesheets and everyone's calendar straight away." action={<Button onClick={() => { setMsg(""); setCreating(true); }}><Plus size={14} /> New Holiday List</Button>}>
                {d.lists.length === 0 ? <Empty icon={CalendarDays} text="No holiday lists yet. Create one for this year." /> : (
                  <Grid rows={d.lists} columns={[
                    { key: "name", label: "List", render: (l) => <span><b className="font-medium">{l.name}</b><span className="block text-[11px] text-[var(--color-text-faint)]">{dmy(l.from_date)} – {dmy(l.to_date)}{l.from_date <= isoDate() && l.to_date >= isoDate() ? " · current" : ""}</span></span> },
                    { key: "h", label: "Holidays", render: (l) => <span>{d.counts[l.name]?.holidays ?? 0}{d.counts[l.name]?.next && <span className="block text-[11px] text-[var(--color-text-faint)]">next {dmy(d.counts[l.name].next)}</span>}</span> },
                    { key: "w", label: "Weekly Offs", render: (l) => d.counts[l.name]?.weeklyOffs ?? 0 },
                    { key: "u", label: "Used By", render: (l) => (usedBy(l.name).length ? <span className="text-[12px]">{usedBy(l.name).join(" · ")}</span> : <span className="text-[var(--color-text-faint)]">Nobody yet</span>) },
                    { key: "a", label: "", render: (l) => (
                      <div className="flex justify-end gap-1">
                        <Button variant="secondary" className="!px-2.5 !py-1 !text-[12px]" onClick={() => { setMsg(""); setEditing(l.name); }}><Pencil size={12} /> Edit Holidays</Button>
                        <Button variant="ghost" className="!px-2.5 !py-1 !text-[12px]" onClick={() => { setMsg(""); setUsing(l); }}><Star size={12} /> Use This List</Button>
                      </div>
                    ) },
                  ]} />
                )}
              </Panel>
              {creating && <HolNewList lists={d.lists} onClose={() => setCreating(false)} onDone={(name) => { setCreating(false); done(`${name} created. Add its festival holidays now.`); setEditing(name); }} />}
              {editing && <HolEditList name={editing} lists={d.lists} onClose={() => setEditing(null)} onDone={(text) => { setEditing(null); done(text); }} />}
              {using && <HolUseList list={using} data={d} onClose={() => setUsing(null)} onDone={(text) => { setUsing(null); done(text); }} />}
            </>
          );
        }}
      </Async>
    </div>
  );
}

function HolWeekdays({ value, onChange }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {HOL_DAYS.map((d) => <button key={d} type="button" onClick={() => onChange(value.includes(d) ? value.filter((x) => x !== d) : [...value, d])} className={chipCls(value.includes(d))}>{d.slice(0, 3)}</button>)}
    </div>
  );
}

function HolNewList({ lists, onClose, onDone }) {
  const now = new Date();
  const y = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1; // Indian financial year, April to March
  const [f, setF] = useState({ name: `Holidays ${y}-${String(y + 1).slice(2)}`, from: `${y}-04-01`, to: `${y + 1}-03-31`, weeklyOffs: ["Saturday", "Sunday"], copyFrom: "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  async function submit(e) {
    e.preventDefault();
    setErr("");
    if (f.to < f.from) return setErr("The end date is before the start date.");
    if (lists.some((l) => l.name.toLowerCase() === f.name.trim().toLowerCase())) return setErr(`A list called ${f.name.trim()} already exists.`);
    setBusy(true);
    try {
      let rows = holWeeklyOffRows(f.from, f.to, f.weeklyOffs);
      if (f.copyFrom) {
        const src = await frappe.getDoc("Holiday List", f.copyFrom);
        rows = rows.concat((src.holidays || []).filter((h) => !Number(h.weekly_off) && h.holiday_date >= f.from && h.holiday_date <= f.to));
      }
      const doc = await frappe.createDoc("Holiday List", { holiday_list_name: f.name.trim(), from_date: f.from, to_date: f.to, weekly_off: f.weeklyOffs[0] || undefined, holidays: holClean(rows) });
      onDone(doc.name);
    } catch (x) {
      setErr(errMsg(x, "Couldn't create the list."));
      setBusy(false);
    }
  }
  return (
    <Modal title="New Holiday List" onClose={onClose} wide>
      <form onSubmit={submit} className="space-y-3">
        <Field label="List Name"><input required className={inputCls} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="From"><input required type="date" className={inputCls} value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} /></Field>
          <Field label="To"><input required type="date" className={inputCls} value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} /></Field>
        </div>
        <Field label="Weekly Offs" hint="Every one of these days in the period becomes a weekly off"><HolWeekdays value={f.weeklyOffs} onChange={(v) => setF({ ...f, weeklyOffs: v })} /></Field>
        <Field label="Copy Holidays From (Optional)" hint="Copies the festival holidays that fall inside the new period">
          <select className={inputCls} value={f.copyFrom} onChange={(e) => setF({ ...f, copyFrom: e.target.value })}><option value="">Don't copy - I'll add them</option>{lists.map((l) => <option key={l.name} value={l.name}>{l.name}</option>)}</select>
        </Field>
        {err && <Notice>{err}</Notice>}
        <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button><Button type="submit" disabled={busy}>{busy ? "Creating…" : "Create List"}</Button></div>
      </form>
    </Modal>
  );
}

function HolEditList({ name, lists, onClose, onDone }) {
  const doc = useAsync(() => frappe.getDoc("Holiday List", name), [name]);
  return (
    <Modal title={`Holiday List · ${name}`} onClose={onClose} wide="xl">
      <Async state={doc}>{(d) => <HolListEditor doc={d} lists={lists} onClose={onClose} onDone={onDone} />}</Async>
    </Modal>
  );
}

function HolListEditor({ doc, lists, onClose, onDone }) {
  const [rows, setRows] = useState(() => (doc.holidays || []).filter((h) => !Number(h.weekly_off)).map((h, i) => ({ id: i, holiday_date: h.holiday_date, description: String(h.description || "").replace(/<[^>]+>/g, "") })));
  const [offs, setOffs] = useState(() => {
    const days = new Set((doc.holidays || []).filter((h) => Number(h.weekly_off)).map((h) => HOL_DAYS[(new Date(`${h.holiday_date}T00:00:00Z`).getUTCDay() + 6) % 7]));
    return HOL_DAYS.filter((d) => days.has(d));
  });
  const [paste, setPaste] = useState(null);
  const [copyFrom, setCopyFrom] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const outside = rows.filter((r) => r.holiday_date && (r.holiday_date < doc.from_date || r.holiday_date > doc.to_date));
  const set = (id, k, v) => setRows((list) => list.map((r) => (r.id === id ? { ...r, [k]: v } : r)));
  const add = (more) => setRows((list) => { const have = new Set(list.map((r) => r.holiday_date)); let n = Date.now(); return [...list, ...more.filter((m) => !have.has(m.holiday_date)).map((m) => ({ id: n++, holiday_date: m.holiday_date, description: m.description }))].sort((a, b) => String(a.holiday_date).localeCompare(String(b.holiday_date))); });

  async function copy() {
    if (!copyFrom) return;
    try {
      const src = await frappe.getDoc("Holiday List", copyFrom);
      add((src.holidays || []).filter((h) => !Number(h.weekly_off) && h.holiday_date >= doc.from_date && h.holiday_date <= doc.to_date).map((h) => ({ holiday_date: h.holiday_date, description: String(h.description || "").replace(/<[^>]+>/g, "") })));
    } catch (x) { setErr(errMsg(x, "Couldn't read that list.")); }
  }
  function applyPaste() {
    const { rows: parsed, bad } = holParseLines(paste);
    add(parsed);
    setPaste(bad.length ? bad.join("\n") : null);
    setErr(bad.length ? `${bad.length} line(s) weren't understood and are left in the box - use “25-12-2026, Christmas”.` : "");
  }
  async function save() {
    setErr("");
    if (outside.length) return setErr(`${outside.length} holiday(s) are outside ${dmy(doc.from_date)} – ${dmy(doc.to_date)}. Change the date or remove them.`);
    if (rows.some((r) => !r.holiday_date || !r.description.trim())) return setErr("Every holiday needs a date and a name.");
    setBusy(true);
    try {
      const dates = new Set(rows.map((r) => r.holiday_date));
      await holSaveRows(doc.name, [...holWeeklyOffRows(doc.from_date, doc.to_date, offs).filter((w) => !dates.has(w.holiday_date)), ...rows.map((r) => ({ holiday_date: r.holiday_date, description: r.description.trim(), weekly_off: 0 }))]);
      onDone(`${doc.name} saved: ${rows.length} holiday(s), weekly offs on ${offs.length ? offs.join(", ") : "no day"}.`);
    } catch (x) {
      setErr(errMsg(x, "Couldn't save the list."));
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-[12px] text-[var(--color-text-muted)]">Covers {dmy(doc.from_date)} – {dmy(doc.to_date)}.</p>
      <Field label="Weekly Offs" hint="Changing these rebuilds the weekly offs for the whole period"><HolWeekdays value={offs} onChange={setOffs} /></Field>
      <div>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <p className="text-[13px] font-semibold text-[var(--color-text)]">Holidays <span className="font-normal text-[var(--color-text-muted)]">({rows.length})</span></p>
          <div className="flex flex-wrap items-center gap-1.5">
            <select aria-label="Copy holidays from" className={`${inputCls} !w-auto !py-1 text-[12px]`} value={copyFrom} onChange={(e) => setCopyFrom(e.target.value)}><option value="">Copy from another list…</option>{lists.filter((l) => l.name !== doc.name).map((l) => <option key={l.name} value={l.name}>{l.name}</option>)}</select>
            {copyFrom && <Button type="button" variant="secondary" className="!px-2.5 !py-1 !text-[12px]" onClick={copy}>Copy</Button>}
            <Button type="button" variant="secondary" className="!px-2.5 !py-1 !text-[12px]" onClick={() => setPaste(paste === null ? "" : null)}><ClipboardPaste size={12} /> Paste List</Button>
            <Button type="button" className="!px-2.5 !py-1 !text-[12px]" onClick={() => setRows((l) => [...l, { id: Date.now(), holiday_date: "", description: "" }])}><Plus size={12} /> Add Holiday</Button>
          </div>
        </div>
        {paste !== null && (
          <div className="mb-3 space-y-2 rounded-lg border border-[var(--color-border)] p-3">
            <textarea rows={5} className={inputCls} value={paste} onChange={(e) => setPaste(e.target.value)} placeholder={"One holiday per line, e.g.\n25-12-2026, Christmas\n26-01-2027, Republic Day"} />
            <div className="flex justify-end"><Button type="button" variant="secondary" onClick={applyPaste} disabled={!paste.trim()}>Add These</Button></div>
          </div>
        )}
        {rows.length === 0 ? <Empty text="No holidays yet - add them one by one, paste a list, or copy them from another list." /> : (
          <div className="max-h-[45vh] overflow-y-auto rounded-lg border border-[var(--color-border)]">
            <table className="w-full text-left text-[12.5px]">
              <thead className="sticky top-0 bg-[var(--color-surface-2)] text-[10.5px] uppercase tracking-wide text-[var(--color-text-faint)]"><tr><th className="px-3 py-2 font-semibold">Date</th><th className="px-3 py-2 font-semibold">Holiday</th><th className="w-10 px-3 py-2" /></tr></thead>
              <tbody>
                {rows.map((r) => {
                  const bad = r.holiday_date && (r.holiday_date < doc.from_date || r.holiday_date > doc.to_date);
                  return (
                    <tr key={r.id} className="border-t border-[var(--color-border)]">
                      <td className="px-3 py-1.5"><input type="date" aria-label="Date" className={`${inputCls} !py-1 ${bad ? "!border-[var(--color-red)]" : ""}`} value={r.holiday_date} min={doc.from_date} max={doc.to_date} onChange={(e) => set(r.id, "holiday_date", e.target.value)} /></td>
                      <td className="px-3 py-1.5"><input aria-label="Holiday name" className={`${inputCls} !py-1`} value={r.description} placeholder="e.g. Diwali" onChange={(e) => set(r.id, "description", e.target.value)} /></td>
                      <td className="px-3 py-1.5 text-right"><button type="button" title="Remove" onClick={() => setRows((l) => l.filter((x) => x.id !== r.id))} className="rounded p-1 text-[var(--color-text-muted)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-red-hover)]"><Trash2 size={14} /></button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {err && <Notice>{err}</Notice>}
      <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button><Button type="button" onClick={save} disabled={busy}>{busy ? "Saving…" : "Save List"}</Button></div>
    </div>
  );
}

function HolUseList({ list, data, onClose, onDone }) {
  const [company, setCompany] = useState(data.companies[0]?.name || "");
  const [makeDefault, setMakeDefault] = useState(true);
  const [assign, setAssign] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const others = data.employees.filter((e) => e.company === company && e.holiday_list !== list.name);
  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setErr("");
    try {
      const done = [];
      if (makeDefault) { await frappe.updateDoc("Company", company, { default_holiday_list: list.name }); done.push(`now ${company}'s default`); }
      if (assign) {
        for (const x of others) await frappe.callMethod("frappe.client.set_value", { doctype: "Employee", name: x.name, fieldname: "holiday_list", value: list.name });
        done.push(`${others.length} employee(s) moved onto it`);
      }
      onDone(`${list.name}: ${done.join(", ") || "no change"}.`);
    } catch (x) {
      setErr(errMsg(x, "Couldn't update. Changing a company's default needs the Administrator if HR isn't allowed to edit Company."));
      setBusy(false);
    }
  }
  return (
    <Modal title={`Use ${list.name}`} onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <Field label="Company"><select className={inputCls} value={company} onChange={(e) => setCompany(e.target.value)}>{data.companies.map((c) => <option key={c.name} value={c.name}>{c.name}{c.default_holiday_list ? ` (default: ${c.default_holiday_list})` : ""}</option>)}</select></Field>
        <label className="flex items-start gap-2 text-[13px] text-[var(--color-text)]"><input type="checkbox" className="mt-0.5" checked={makeDefault} onChange={(e) => setMakeDefault(e.target.checked)} /> <span>Make it the company's default <span className="block text-[11.5px] text-[var(--color-text-muted)]">Used by everyone without their own or an office list</span></span></label>
        <label className="flex items-start gap-2 text-[13px] text-[var(--color-text)]"><input type="checkbox" className="mt-0.5" checked={assign} onChange={(e) => setAssign(e.target.checked)} /> <span>Also put every active employee of this company on it <span className="block text-[11.5px] text-[var(--color-text-muted)]">{others.length} employee(s) would move</span></span></label>
        {err && <Notice>{err}</Notice>}
        <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button><Button type="submit" disabled={busy || (!makeDefault && !assign) || !company}>{busy ? "Saving…" : "Apply"}</Button></div>
      </form>
    </Modal>
  );
}

function ShiftsTab({ employee }) {
  const shifts = useAsync(() => getShiftAssignments(employee.name), [employee.name]);
  const events = useAsync(getEvents, []);
  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
      <Panel title="My Shifts" hint={employee.default_shift ? `Default shift: ${employee.default_shift}` : undefined}>
        <Async state={shifts}>{(rows) => <Grid rows={rows} empty="No shift assignments." columns={[{ key: "shift_type", label: "Shift" }, { key: "start_date", label: "From", render: (r) => dmy(r.start_date) }, { key: "end_date", label: "To", render: (r) => dmy(r.end_date) || "Ongoing" }, { key: "status", label: "Status", render: (r) => <StatusPill status={r.status} /> }]} />}</Async>
      </Panel>
      <Panel title="Important Events" hint="Public company events">
        <Async state={events}>{(rows) => rows.length === 0 ? <Empty text="No upcoming events." /> : <ul className="space-y-3">{rows.map((e) => <li key={e.name} className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] p-3"><p className="text-[13px] font-medium text-[var(--color-text)]">{e.subject}</p><p className="text-[11px] text-[var(--color-text-muted)]">{e.all_day ? dmy(e.starts_on) : dmyHm(e.starts_on)}</p>{e.description && <p className="mt-1 line-clamp-2 text-[12px] text-[var(--color-text-muted)]">{stripHtml(e.description)}</p>}</li>)}</ul>}</Async>
      </Panel>
    </div>
  );
}

function TeamTab({ employee }) {
  const team = useAsync(() => getTeamAvailability(employee, 14), [employee.name]);
  return (
    <Panel title="Team Availability" hint="Approved leave in your department over the next 14 days. Reasons are never shown.">
      <Async state={team}>
        {(d) => {
          const today = isoDate();
          const out = d.onLeave.filter((l) => l.from_date <= today && l.to_date >= today);
          return (
            <>
              {d.teamSize != null && <p className="mb-4 text-[13px] text-[var(--color-text-muted)]"><b className="text-[var(--color-text)]">{Math.max(d.teamSize - 1 - out.length, 0)}</b> of {Math.max(d.teamSize - 1, 0)} teammates available today</p>}
              <Grid rows={d.onLeave} rowKey={(r, i) => `${r.employee}-${i}`} empty="Everyone in your team is available." columns={[{ key: "employee_name", label: "Teammate" }, { key: "from_date", label: "Away", render: (r) => `${dmy(r.from_date)}${r.to_date !== r.from_date ? ` – ${dmy(r.to_date)}` : ""}${r.half_day ? " (half day)" : ""}` }, { key: "s", label: "", render: (r) => (r.from_date <= today && r.to_date >= today ? <StatusPill status="On Leave" /> : <span className="text-[11px] text-[var(--color-text-faint)]">Upcoming</span>) }]} />
            </>
          );
        }}
      </Async>
    </Panel>
  );
}

/* ===== EmpDashboard.jsx ===== */
const greeting = (h) => (h < 12 ? "Good Morning" : h < 17 ? "Good Afternoon" : "Good Evening");

const VIEW_KEY = "ethx.dashboard.view";

/**
 * The one Dashboard. Plain employees see their own; HR staff and Project Managers who are also
 * employees switch between their own and their HR / Projects dashboard with the sidebar switch (remembered per browser).
 */
export function EmpDashboard() {
  const { user } = useAuth();
  const [params] = useSearchParams();
  // The Admin has its own dashboard; here it sees the employee one.
  const work = hasPermission(user, "dashboard.admin") ? null
    : hasPermission(user, "dashboard.hr") ? { id: "hr", label: "HR Dashboard", Page: HRDashboard }
    : hasPermission(user, "dashboard.pm") ? { id: "pm", label: "Projects Dashboard", Page: PMDashboard } : null;
  const asked = params.get("view");
  // A view opened from a link (the sidebar switch) is remembered like a tab click, so the sidebar stays on that side.
  useEffect(() => {
    if (asked) try { localStorage.setItem(VIEW_KEY, asked); } catch { /* not critical */ }
  }, [asked]);
  if (!work) return <SelfDashboard />;

  let saved = null;
  try { saved = localStorage.getItem(VIEW_KEY); } catch { /* storage blocked: default to self */ }
  const view = asked || (saved === work.id ? work.id : "self");
  // The sidebar's "Switch to …" link chooses the side; the dashboard just shows it.
  return view === work.id ? <Suspense fallback={<Loading />}><work.Page /></Suspense> : <SelfDashboard />;
}

function SelfDashboard() {
  const { user } = useAuth();
  const { employee } = useEmployee();
  const now = useMemo(() => new Date(), []);
  const emp = employee.name;

  const today = useAsync(() => getTodayAttendance(emp), [emp]);
  const balance = useAsync(() => getLeaveBalance(emp), [emp]);
  const approvals = useAsync(() => getApprovals(emp), [emp]);
  const notifs = useAsync(() => getNotifications(user.email, 30), [user.email]);
  const news = useAsync(() => getAnnouncements(4), []);
  const team = useAsync(() => getTeamAvailability(employee, 7), [emp]);
  const birthdays = useAsync(getUpcomingBirthdays, []);

  const att = today.data;
  const lastLog = att?.logs?.[att.logs.length - 1];
  const attValue = !att ? undefined : att.attendance?.status || (lastLog ? (lastLog.log_type === "IN" ? "Checked in" : "Checked out") : "Not marked");
  const attSub = !att ? "" : lastLog ? `${lastLog.log_type === "IN" ? "In" : "Out"} at ${hm(lastLog.time)}` : "No punch yet today";

  const remaining = balance.data ? balance.data.reduce((s, b) => s + b.remaining, 0) : balance.error ? "—" : undefined;
  const pending = approvals.data ? approvals.data.items.filter((i) => i.pending) : null;
  const unread = notifs.data ? notifs.data.filter((n) => !n.read).length : notifs.error ? "—" : undefined;

  // Document expiry reminders from the employee record
  const expiries = [
    { label: "Passport", date: employee.valid_upto },
    { label: "Employment Contract", date: employee.contract_end_date },
  ].filter((d) => d.date).map((d) => ({ ...d, days: daysUntil(d.date) })).filter((d) => d.days <= EXPIRY_WARN_DAYS);

  const onLeaveToday = (team.data?.onLeave || []).filter((l) => l.from_date <= isoDate() && l.to_date >= isoDate());

  return (
    <>
      <section className="relative overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] px-7 py-7">
        <div className="pointer-events-none absolute inset-0" style={{ background: "radial-gradient(600px 220px at 100% 0%, color-mix(in srgb, var(--color-red) 22%, transparent), transparent 70%), radial-gradient(400px 200px at 0% 100%, color-mix(in srgb, var(--color-red) 8%, transparent), transparent 70%)" }} />
        <div className="relative flex flex-wrap items-center justify-between gap-5">
          <div>
            <p className="text-[12px] font-medium uppercase tracking-[0.14em] text-[var(--color-red-hover)]">{WEEKDAYS[now.getDay()]}, {String(now.getDate()).padStart(2, "0")} {MONTHS[now.getMonth()]} {now.getFullYear()}</p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-[var(--color-text)]">{greeting(now.getHours())}, {greetingName(employee.first_name || employee.employee_name, employee.user_id)}</h2>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat to="/employee/attendance" icon={CalendarCheck} label="Today's Attendance" value={attValue} sub={attSub} accent="var(--color-green)" />
        <Stat to="/employee/leave" icon={CalendarClock} label="Leave Balance" value={typeof remaining === "number" ? `${remaining} days` : remaining} sub={balance.data ? `${balance.data.length} leave type(s)` : ""} accent="#4f8cff" />
        <Stat to="/employee/approvals" icon={ClipboardCheck} label="Pending Requests" value={pending ? pending.length : approvals.error ? "—" : undefined} sub="Waiting for action" accent="var(--color-amber)" />
        <Stat to="/employee/notifications" icon={Bell} label="Unread Notifications" value={unread} sub="Updates & reminders" accent="var(--color-red-hover)" />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Panel title="Leave Balance" hint="Remaining days by type" action={<Link to="/employee/leave" className="flex items-center gap-1 text-[12px] text-[var(--color-red-hover)] hover:underline">Apply <ArrowRight size={12} /></Link>}>
          <Async state={balance}>
            {(rows) => rows.length === 0 ? <Empty text="No leave allocated yet." /> : (
              <ul className="space-y-3.5">
                {rows.slice(0, 5).map((b) => (
                  <li key={b.leave_type}>
                    <div className="mb-1.5 flex justify-between text-[12px]"><span className="text-[var(--color-text-muted)]">{b.leave_type}</span><span className="font-medium text-[var(--color-text)]">{b.remaining} / {b.total}</span></div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-[var(--color-surface-2)]"><div className="h-full rounded-full bg-[#4f8cff]" style={{ width: `${b.total ? (b.remaining / b.total) * 100 : 0}%` }} /></div>
                  </li>
                ))}
              </ul>
            )}
          </Async>
        </Panel>

        <Panel title="Pending Requests" hint="Leave, attendance, timesheet & expense" className="lg:col-span-2" action={<Link to="/employee/approvals" className="flex items-center gap-1 text-[12px] text-[var(--color-red-hover)] hover:underline">View all <ArrowRight size={12} /></Link>}>
          <Async state={approvals}>
            {(d) => pending.length === 0 ? <Empty text="You're all caught up." /> : (
              <ul className="divide-y divide-[var(--color-border)]">
                {pending.slice(0, 5).map((i) => (
                  <li key={`${i.type}-${i.id}`} className="flex items-center justify-between gap-3 py-2.5">
                    <div className="min-w-0"><p className="truncate text-[13px] text-[var(--color-text)]">{i.title}</p><p className="text-[11px] text-[var(--color-text-muted)]">{i.type} · {dmy(i.from)}{i.to && i.to !== i.from ? ` – ${dmy(i.to)}` : ""}</p></div>
                    <StatusPill status={i.status} />
                  </li>
                ))}
                {d.failed.length > 0 && <li className="pt-2 text-[11px] text-[var(--color-text-faint)]">Couldn't load: {d.failed.join(", ")}</li>}
              </ul>
            )}
          </Async>
        </Panel>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Panel title="Announcements" hint="From your company" className="lg:col-span-2" action={<Link to="/employee/notifications" className="flex items-center gap-1 text-[12px] text-[var(--color-red-hover)] hover:underline">All <ArrowRight size={12} /></Link>}>
          <Async state={news}>
            {(rows) => rows.length === 0 ? <Empty icon={Megaphone} text="No announcements right now." /> : (
              <ul className="space-y-3">
                {rows.map((n) => (
                  <li key={n.name} className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] p-3.5">
                    <p className="text-[13px] font-medium text-[var(--color-text)]">{n.title}</p>
                    <p className="mt-1 line-clamp-2 text-[12px] text-[var(--color-text-muted)]">{stripHtml(n.content)}</p>
                    <p className="mt-1.5 text-[11px] text-[var(--color-text-faint)]">{dmy(n.creation)}</p>
                  </li>
                ))}
              </ul>
            )}
          </Async>
        </Panel>

        <div className="space-y-4">
          <Panel title="Document Reminders" hint={`Expiring within ${EXPIRY_WARN_DAYS} days`}>
            {expiries.length === 0 ? <Empty icon={ShieldAlert} text="Nothing is expiring soon." /> : (
              <ul className="space-y-2.5">
                {expiries.map((d) => (
                  <li key={d.label} className="flex items-center justify-between text-[13px]">
                    <span className="text-[var(--color-text)]">{d.label}</span>
                    <span className={d.days < 0 ? "text-[var(--color-red-hover)]" : "text-[var(--color-amber)]"}>{d.days < 0 ? `Expired ${dmy(d.date)}` : `${d.days} day(s) · ${dmy(d.date)}`}</span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
          <Panel title="Team Today" hint="Colleagues on approved leave">
            {team.loading && !team.data ? <Skeleton className="h-12 w-full" /> : team.error ? <p className="text-[12px] text-[var(--color-text-muted)]">Team availability isn't enabled for your account.</p> : onLeaveToday.length === 0 ? <Empty icon={Users} text="Everyone is available today." /> : (
              <ul className="space-y-2 text-[13px]">{onLeaveToday.map((l) => <li key={l.employee} className="flex justify-between"><span className="text-[var(--color-text)]">{l.employee_name}</span><span className="text-[var(--color-text-muted)]">till {dmy(l.to_date)}</span></li>)}</ul>
            )}
          </Panel>
        </div>
      </div>

      {(birthdays.data || []).some((b) => b.days_away <= 7) && <Panel title="Upcoming Birthdays" hint="In the next 7 days"><BirthdayList rows={birthdays.data.filter((b) => b.days_away <= 7)} /></Panel>}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[["/employee/attendance", "Punch In / Out", CalendarCheck], ["/employee/leave", "Apply for leave", CalendarClock], ["/employee/payslips", "View payslips", Wallet], ["/employee/help", "Raise a request", LifeBuoy]].map(([to, label, Icon]) => (
          <Link key={to} to={to} className="group flex items-center gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3.5 transition-colors hover:border-[var(--color-red-deep)] hover:bg-[var(--color-surface-2)]">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--color-surface-2)] text-[var(--color-text-muted)] group-hover:bg-[var(--color-red-wash)] group-hover:text-[var(--color-red-hover)]"><Icon size={17} strokeWidth={1.8} /></span>
            <span className="text-[13px] font-medium text-[var(--color-text)]">{label}</span>
          </Link>
        ))}
      </div>
    </>
  );
}

/* ===== EmpDocuments.jsx ===== */
const title = (f) => f.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ");

export function EmpDocuments() {
  const { user } = useAuth();
  const { employee } = useEmployee();
  const [tab, setTab] = useState("policies");
  const policies = useAsync(getPolicies, []);
  const acks = useAsync(() => getAcknowledged(user.email), [user.email]);

  const done = acks.data || new Set();
  const required = (policies.data || []).filter((p) => !done.has(p.name)).length;

  return (
    <>
      <PageHeader icon={FileText} title="Policies & Documents" subtitle="Employee handbook, company policies and your employment documents" />
      <Tabs value={tab} onChange={setTab} tabs={[{ id: "policies", label: "Policies & Handbook", count: policies.data ? required : undefined }, { id: "mine", label: "My Documents" }]} />

      {tab === "policies" && (
        <Panel title="Company Policies" hint={required ? `${required} awaiting acknowledgement` : "You've acknowledged everything"}>
          <Async state={policies}>
            {(rows) => rows.length === 0 ? <Empty text="No policies published yet. HR will publish company policies here." /> : (
              <ul className="divide-y divide-[var(--color-border)]">
                {rows.map((p) => (
                  <li key={p.name} className="flex flex-wrap items-center justify-between gap-3 py-3">
                    <div className="flex min-w-0 items-center gap-3"><FileText size={16} className="shrink-0 text-[var(--color-text-muted)]" /><div className="min-w-0"><p className="truncate text-[13px] text-[var(--color-text)]">{title(p.file_name)}</p><p className="text-[11px] text-[var(--color-text-muted)]">Published {dmy(p.creation)}</p></div></div>
                    <div className="flex items-center gap-3">
                      <a href={p.file_url} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-[12px] text-[var(--color-text-muted)] hover:text-[var(--color-text)]"><ExternalLink size={13} /> Read</a>
                      {acks.error ? null : done.has(p.name) ? <span className="flex items-center gap-1 text-[12px] text-[var(--color-green)]"><BadgeCheck size={14} /> Acknowledged</span> : <span className="text-[12px] text-[var(--color-text-muted)]">Acknowledgement pending</span>}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Async>
        </Panel>
      )}

      {tab === "mine" && <MyDocumentsPanel employee={employee} />}
    </>
  );
}

/* ===== EmpExpenses.jsx ===== */
export function EmpExpenses() {
  const { employee } = useEmployee();
  const q = useAsync(() => getExpenseClaims(employee.name), [employee.name]);
  const names = (q.data || []).map((r) => r.name);
  const reasons = useAsync(() => getRejectionReasons((q.data || []).filter((r) => r.approval_status === "Rejected" && !stripHtml(r.remark || "")).map((r) => r.name)), [q.data]);
  const bills = useAsync(() => billCounts(names), [names.join(",")]);
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(null);

  return (
    <>
      <PageHeader icon={Receipt} title="Expense Claims" subtitle="Upload bills and track reimbursement" actions={<Button onClick={() => setOpen(true)}><Plus size={14} /> New Claim</Button>} />
      <Async state={q}>
        {(rows) => {
          const sum = (pred, k) => rows.filter(pred).reduce((s, r) => s + (Number(r[k]) || 0), 0);
          return (
            <>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                {[["Claimed (pending approval)", sum((r) => r.docstatus === 0, "total_claimed_amount")], ["Awaiting reimbursement", sum((r) => r.status === "Unpaid" || r.status === "Partially Paid", "total_sanctioned_amount")], ["Reimbursed", sum((r) => r.status === "Paid" || r.status === "Partially Paid", "total_amount_reimbursed")]].map(([l, v]) => (
                  <div key={l} className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5"><p className="text-[12px] text-[var(--color-text-muted)]">{l}</p><p className="mt-2 text-2xl font-semibold text-[var(--color-text)]">{money(v)}</p></div>
                ))}
              </div>
              <Panel title="My Claims">
                <Grid rows={rows} empty="No expense claims yet." columns={[
                  { key: "name", label: "Claim" },
                  { key: "posting_date", label: "Date", render: (r) => dmy(r.posting_date) },
                  { key: "total_claimed_amount", label: "Claimed", render: (r) => money(r.total_claimed_amount) },
                  { key: "total_sanctioned_amount", label: "Approved", render: (r) => (r.approval_status === "Approved" ? money(r.total_sanctioned_amount) : "—") },
                  { key: "expense_approver", label: "Approver", render: (r) => r.expense_approver || "—" },
                  { key: "bills", label: "Bills", render: (r) => {
                    const n = bills.data?.[r.name];
                    return (
                      <span className="flex items-center gap-2">
                        {n == null ? "—" : n ? <span className="flex items-center gap-1"><Paperclip size={12} /> {n}</span> : <span className="text-[var(--color-amber)]">none</span>}
                        {r.docstatus === 0 && <button type="button" onClick={() => setAdding(r.name)} className="text-[11px] text-[var(--color-red-hover)] hover:underline">Add Bill</button>}
                      </span>
                    );
                  } },
                  { key: "approval_status", label: "Approval", render: (r) => <div><StatusPill status={r.approval_status} />{r.approval_status === "Rejected" && <p className="mt-1 max-w-xs text-[11px] text-[var(--color-red-hover)]">Reason: {stripHtml(r.remark || "") || reasons.data?.[r.name] || "not stated"}</p>}</div> },
                  { key: "status", label: "Reimbursement", render: (r) => <StatusPill status={r.approval_status === "Approved" ? r.status : r.docstatus === 0 ? "Pending" : r.status} /> },
                ]} />
              </Panel>
            </>
          );
        }}
      </Async>
      {open && <ClaimModal employee={employee} onClose={() => setOpen(false)} onSaved={() => { setOpen(false); q.reload(); }} />}
      {adding && <AddBillModal claim={adding} onClose={() => setAdding(null)} onSaved={() => { setAdding(null); bills.reload(); }} />}
    </>
  );
}

function BillPicker({ files, setFiles }) {
  const input = useRef(null);
  return (
    <div>
      <input ref={input} type="file" multiple accept="image/*,.pdf" className="hidden" onChange={(e) => setFiles(Array.from(e.target.files || []))} />
      <Button type="button" variant="secondary" onClick={() => input.current?.click()}><Paperclip size={14} /> {files.length ? `${files.length} bill(s) attached` : "Attach bills (required)"}</Button>
      {files.length > 0 && <ul className="mt-2 space-y-0.5 text-[11px] text-[var(--color-text-muted)]">{files.map((x) => <li key={x.name} className="truncate">{x.name}</li>)}</ul>}
      {!files.length && <p className="mt-1 text-[11px] text-[var(--color-text-faint)]">Photo or PDF of every bill / receipt. Claims can't be approved without one.</p>}
    </div>
  );
}

function AddBillModal({ claim, onClose, onSaved }) {
  const [files, setFiles] = useState([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setErr("");
    try { await addBills(claim, files); onSaved(); } catch (x) { setErr(x?.message || "Upload failed."); setBusy(false); }
  }
  return (
    <Modal title={`Add Bills to ${claim}`} onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <BillPicker files={files} setFiles={setFiles} />
        {err && <Notice>{err}</Notice>}
        <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={onClose}>Cancel</Button><Button type="submit" disabled={busy || !files.length}>{busy ? "Uploading…" : "Upload"}</Button></div>
      </form>
    </Modal>
  );
}

function ClaimModal({ employee, onClose, onSaved }) {
  const types = useAsync(() => frappe.getList("Expense Claim Type", { fields: ["name"], limit: 0, orderBy: "name asc" }), []);
  const [f, setF] = useState({ date: isoDate(), type: "", amount: "", description: "" });
  const [files, setFiles] = useState([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  // approver: the expense type's approver, then the business unit's, then the employee record's - skipping anyone on leave
  const approvers = useAsync(() => (f.type ? getApprovers(employee, "Expense Claim", f.type) : Promise.resolve([])), [f.type]);
  const list = approvers.data || [];
  const approver = pickApprover(list);
  const skipped = list.length > 1 && list[0].on_leave && approver && approver.email !== list[0].email;

  async function submit(e) {
    e.preventDefault();
    if (!files.length) return setErr("Attach at least one bill or receipt - it is required for every claim.");
    if (f.date > isoDate()) return setErr("The expense date can't be in the future.");
    setBusy(true);
    setErr("");
    try {
      const { failed } = await createExpenseClaim({ employee, approver: approver?.email, files, lines: [{ expense_date: f.date, expense_type: f.type, description: f.description, amount: f.amount }] });
      if (failed) alertDialog({ tone: "error", title: "Some Bills Weren't Uploaded", message: `${failed} of the bills couldn't be uploaded - the claim was created with the rest. Use "Add bill" to retry.` });
      onSaved();
    } catch (x) {
      setErr(x?.response ? errMsg(x, "Couldn't create the claim.") : x?.message || "Couldn't create the claim.");
    } finally {
      setBusy(false);
    }
  }

  const hint = !f.type ? undefined : approvers.loading && !approvers.data ? "Finding the approver…" : approver ? `Approver: ${approver.name}${approver.source ? ` (${approver.source})` : ""}` : "No approver is set for this expense type - HR will assign one.";

  return (
    <Modal title="New Expense Claim" onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <DateField label="Expense Date" value={f.date} onChange={(v) => setF({ ...f, date: v })} required />
        <Field label="Expense Type" hint={hint}><select required className={inputCls} value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}><option value="">Select…</option>{(types.data || []).map((t) => <option key={t.name}>{t.name}</option>)}</select></Field>
        {skipped && <Notice tone="info">{list[0].name} is on leave, so {approver.name} will approve this claim.</Notice>}
        <Field label="Amount"><input type="number" min="0.01" step="0.01" required className={inputCls} value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} /></Field>
        <Field label="Description"><textarea rows={2} className={inputCls} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
        <BillPicker files={files} setFiles={setFiles} />
        {err && <Notice>{err}</Notice>}
        <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={onClose}>Cancel</Button><Button type="submit" disabled={busy || !files.length || !f.type}>{busy ? "Submitting…" : "Submit Claim"}</Button></div>
      </form>
    </Modal>
  );
}

/* ===== EmpGoals.jsx ===== */
export function EmpGoals() {
  const { employee } = useEmployee();
  const emp = employee.name;
  const goals = useAsync(() => getGoals(emp), [emp]);
  const reviews = useAsync(() => getAppraisals(emp), [emp]);
  const feedback = useAsync(() => getFeedback(emp), [emp]);

  return (
    <>
      <PageHeader icon={Target} title="My Goals & Feedback" subtitle="Assigned goals, review dates and feedback from your manager" />
      <Panel title="Goals">
        <Async state={goals}>
          {(rows) => rows.length === 0 ? <Empty text="No goals have been assigned to you yet." /> : (
            <ul className="space-y-4">
              {rows.map((g) => (
                <li key={g.name}>
                  <div className="mb-1.5 flex items-center justify-between gap-3"><span className="text-[13px] text-[var(--color-text)]">{g.goal_name}</span><span className="flex items-center gap-3 text-[12px] text-[var(--color-text-muted)]">{g.end_date && `due ${dmy(g.end_date)}`}<StatusPill status={g.status} /></span></div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-[var(--color-surface-2)]"><div className="h-full rounded-full bg-[var(--color-green)]" style={{ width: `${Math.min(Number(g.progress) || 0, 100)}%` }} /></div>
                  <p className="mt-1 text-[11px] text-[var(--color-text-faint)]">{Math.round(Number(g.progress) || 0)}% complete{g.appraisal_cycle ? ` · ${g.appraisal_cycle}` : ""}</p>
                </li>
              ))}
            </ul>
          )}
        </Async>
      </Panel>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Panel title="Reviews" hint="Appraisal cycles and review dates">
          <Async state={reviews}>{(rows) => <Grid rows={rows} empty="No reviews scheduled." columns={[{ key: "appraisal_cycle", label: "Cycle" }, { key: "end_date", label: "Review By", render: (r) => dmy(r.end_date) || "—" }, { key: "status", label: "Status", render: (r) => <StatusPill status={r.status} /> }, { key: "final_score", label: "Score", render: (r) => r.final_score ?? "—" }]} />}</Async>
        </Panel>
        <Panel title="Feedback from Your Manager">
          <Async state={feedback}>
            {(rows) => rows.length === 0 ? <Empty text="No feedback has been shared yet." /> : (
              <ul className="space-y-3">{rows.map((f) => <li key={f.name} className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] p-3.5"><p className="text-[12px] text-[var(--color-text-muted)]">{f.reviewer_name || "Reviewer"} · {dmy(f.added_on || f.creation)}</p><p className="mt-1.5 text-[13px] leading-6 text-[var(--color-text)]">{stripHtml(f.feedback || "")}</p></li>)}</ul>
            )}
          </Async>
        </Panel>
      </div>
    </>
  );
}

/* ===== EmpHelp.jsx ===== */
export function EmpHelp() {
  const { user } = useAuth();
  const [tab, setTab] = useState("requests");
  const [modal, setModal] = useState(null);
  const requests = useAsync(() => getRequests(user.email), [user.email]);
  const isLetter = (r) => r.subject.startsWith("[Letter");

  async function withdraw(r) {
    if (!(await confirmDialog({ title: "Withdraw Request", message: `Withdraw "${splitRequest(r.subject).title}"? HR will no longer act on it.`, danger: true, confirmLabel: "Withdraw", cancelLabel: "Keep It" }))) return;
    try {
      await withdrawRequest(r.name);
      requests.reload();
    } catch (e) {
      alertDialog({ tone: "error", message: errMsg(e, "Couldn't withdraw this request.") });
    }
  }
  const requestStatus = (r) => <span><StatusPill status={r.status} />{r.hr_note && <span className="mt-1 block max-w-[18rem] break-words text-[11px] text-[var(--color-text-muted)]">Note from HR: {stripHtml(r.hr_note)}</span>}</span>;
  const requestActions = (r) => (r.status === "Open" ? (
    <div className="flex justify-end gap-3 whitespace-nowrap text-[12px]">
      <button type="button" onClick={() => setModal({ edit: r, ...splitRequest(r.subject), letter: isLetter(r) })} className="flex items-center gap-1 text-[var(--color-text-muted)] hover:text-[var(--color-text)]"><Pencil size={13} /> Edit</button>
      <button type="button" onClick={() => withdraw(r)} className="flex items-center gap-1 text-[var(--color-text-muted)] hover:text-[var(--color-red-hover)]"><Undo2 size={13} /> Withdraw</button>
    </div>
  ) : null);

  return (
    <>
      <PageHeader icon={LifeBuoy} title="Help & Requests" subtitle="HR and IT support, document requests, letters and who to contact" actions={<Button onClick={() => setModal({ category: "HR Support" })}><Plus size={14} /> New Request</Button>} />
      <Tabs value={tab} onChange={setTab} tabs={[{ id: "requests", label: "My Requests" }, { id: "letters", label: "Employee Letters" }, { id: "contacts", label: "HR & IT Contacts" }]} />

      {tab === "requests" && (
        <Panel title="My Requests">
          <Async state={requests}>{(rows) => <Grid rows={rows} empty="You haven't raised any requests." columns={[{ key: "name", label: "Ref" }, { key: "category", label: "Type", render: (r) => splitRequest(r.subject).category || "—" }, { key: "subject", label: "Subject", render: (r) => splitRequest(r.subject).title }, { key: "creation", label: "Raised", render: (r) => dmy(r.creation) }, { key: "status", label: "Status", render: requestStatus }, { key: "_a", label: "", render: requestActions }]} />}</Async>
        </Panel>
      )}

      {tab === "letters" && (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {LETTER_TYPES.map((l) => (
              <div key={l.key} className="flex items-center justify-between gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
                <div><p className="text-[13px] font-medium text-[var(--color-text)]">{l.key}</p><p className="mt-0.5 text-[12px] text-[var(--color-text-muted)]">{l.hint}</p></div>
                <Button variant="secondary" onClick={() => setModal({ category: "Letter", subject: l.key, letter: true })}>Request</Button>
              </div>
            ))}
          </div>
          <Panel title="My Letter Requests" hint="Issued letters appear under Policies & Documents > My documents">
            <Async state={requests}>{(rows) => <Grid rows={rows.filter(isLetter)} empty="No letter requests yet." columns={[{ key: "subject", label: "Letter", render: (r) => r.subject.replace(/^\[Letter\]\s*/, "") }, { key: "creation", label: "Requested", render: (r) => dmy(r.creation) }, { key: "status", label: "Status", render: requestStatus }, { key: "_a", label: "", render: requestActions }]} />}</Async>
          </Panel>
        </>
      )}

      {tab === "contacts" && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {CONTACTS.map((c) => (
            <div key={c.area} className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
              <p className="text-[12px] uppercase tracking-wide text-[var(--color-text-faint)]">{c.area}</p>
              {c.name || c.email || c.phone ? (
                <>
                  {c.name && <p className="mt-2 text-[14px] font-medium text-[var(--color-text)]">{c.name}</p>}
                  {c.email && <a href={`mailto:${c.email}`} className="mt-1 flex items-center gap-2 text-[13px] text-[var(--color-red-hover)] hover:underline"><Mail size={13} /> {c.email}</a>}
                  {c.phone && <a href={`tel:${c.phone}`} className="mt-1 flex items-center gap-2 text-[13px] text-[var(--color-text-muted)] hover:text-[var(--color-text)]"><Phone size={13} /> {c.phone}</a>}
                </>
              ) : <p className="mt-2 text-[13px] text-[var(--color-text-muted)]">Contact details haven't been added yet.</p>}
            </div>
          ))}
        </div>
      )}

      {modal && <RequestModal init={modal} user={user.email} onClose={() => setModal(null)} onSaved={() => { setModal(null); requests.reload(); }} />}
    </>
  );
}

function RequestModal({ init, user, onClose, onSaved }) {
  const [f, setF] = useState({ category: init.category, subject: init.title || init.subject || "", description: init.edit ? stripHtml(init.edit.description || "") : "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setErr("");
    try {
      if (init.edit) await updateRequest(init.edit.name, f);
      else await createRequest({ ...f, user });
      onSaved();
    } catch (x) {
      setErr(errMsg(x, "Couldn't send the request."));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal title={init.edit ? "Edit Request" : init.letter ? `Request: ${init.subject}` : "New Request"} onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        {!init.letter && (
          <>
            <Field label="Category"><select className={inputCls} value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>{REQUEST_CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select></Field>
            <Field label="Subject"><input required className={inputCls} value={f.subject} onChange={(e) => setF({ ...f, subject: e.target.value })} /></Field>
          </>
        )}
        <Field label={init.letter ? "Purpose (e.g. bank loan, visa) and any details" : "Details"}><textarea required rows={4} className={inputCls} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
        {err && <Notice>{err}</Notice>}
        <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={onClose}>Cancel</Button><Button type="submit" disabled={busy}>{busy ? "Saving…" : init.edit ? "Save" : "Send"}</Button></div>
      </form>
    </Modal>
  );
}

/* ===== EmpLeave.jsx ===== */
export function EmpLeave() {
  const { employee } = useEmployee();
  const emp = employee.name;
  const balance = useAsync(() => getLeaveBalance(emp), [emp]);
  const apps = useAsync(() => getLeaveApplications(emp), [emp]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);

  async function withdraw(row) {
    if (!(await confirmDialog(`Withdraw this leave request (${dmy(row.from_date)} – ${dmy(row.to_date)})?`))) return;
    try {
      await frappe.deleteDoc("Leave Application", row.name);
      apps.reload();
      balance.reload();
    } catch (e) {
      alertDialog({ tone: "error", message: errMsg(e, "Couldn't withdraw this request.") });
    }
  }

  return (
    <>
      <PageHeader icon={CalendarClock} title="Leave" subtitle="Your balance, applications and approval status" actions={<Button onClick={() => setOpen(true)}><Plus size={14} /> Apply for Leave</Button>} />

      <Async state={balance}>
        {(rows) => rows.length === 0 ? <Notice tone="info">No leave has been allocated to you yet.</Notice> : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {rows.map((b) => (
              <div key={b.leave_type} className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
                <p className="text-[12px] text-[var(--color-text-muted)]">{b.leave_type}</p>
                <p className="mt-2 text-3xl font-semibold text-[var(--color-text)]">{b.remaining}<span className="ml-1 text-[13px] font-normal text-[var(--color-text-muted)]">of {b.total} left</span></p>
                <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[var(--color-surface-2)]"><div className="h-full rounded-full bg-[#4f8cff]" style={{ width: `${b.total ? Math.min((b.remaining / b.total) * 100, 100) : 0}%` }} /></div>
                <p className="mt-2 text-[11px] text-[var(--color-text-muted)]">Taken {b.taken}{b.pending ? ` · ${b.pending} pending approval` : ""}</p>
              </div>
            ))}
          </div>
        )}
      </Async>

      <Panel title="My Applications">
        <Async state={apps}>
          {(rows) => <Grid rows={rows} empty="You haven't applied for leave yet." columns={[
            { key: "leave_type", label: "Type" },
            { key: "from_date", label: "Dates", render: (r) => `${dmy(r.from_date)}${r.to_date !== r.from_date ? ` – ${dmy(r.to_date)}` : ""}${r.half_day ? " (half day)" : ""}` },
            { key: "total_leave_days", label: "Days" },
            { key: "description", label: "Reason", render: (r) => <span className="text-[var(--color-text-muted)]">{r.description?.replace(/<[^>]*>/g, "") || "—"}</span> },
            { key: "leave_approver_name", label: "Approver", render: (r) => r.leave_approver_name || r.leave_approver || "—" },
            { key: "status", label: "Status", render: (r) => <StatusPill status={r.status} /> },
            // Until it's decided, a request can be changed (dates, type, reason, approver) or withdrawn.
            { key: "_a", label: "", render: (r) => r.status === "Open" && r.docstatus === 0 ? (
              <span className="flex items-center justify-end gap-3">
                <button type="button" title="Edit" onClick={() => setEditing(r)} className="flex items-center gap-1 text-[11px] text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:underline"><Pencil size={12} /> Edit</button>
                <button type="button" title="Withdraw" onClick={() => withdraw(r)} className="flex items-center gap-1 text-[11px] text-[var(--color-red-hover)] hover:underline"><Undo2 size={12} /> Withdraw</button>
              </span>
            ) : null },
          ]} />}
        </Async>
      </Panel>

      {open && <ApplyModal employee={employee} balance={balance.data || []} onClose={() => setOpen(false)} onSaved={() => { setOpen(false); apps.reload(); balance.reload(); }} />}
      {editing && <ApplyModal employee={employee} balance={balance.data || []} leave={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); apps.reload(); balance.reload(); }} />}
    </>
  );
}

/** Apply for leave, or change an open request (`leave`). */
function ApplyModal({ employee, balance, leave, onClose, onSaved }) {
  // Types with an allocation, plus Leave Without Pay (needs no balance). With no allocations at all, every type is listed.
  const types = useAsync(async () => {
    const all = await getLeaveTypes().catch(() => []);
    if (!balance.length) return all.map((x) => x.name);
    const mine = balance.map((b) => b.leave_type);
    return [...mine, ...all.filter((x) => Number(x.is_lwp) && !mine.includes(x.name)).map((x) => x.name)];
  }, []);
  const [f, setF] = useState(() => leave
    ? { leave_type: leave.leave_type || "", from_date: leave.from_date, to_date: leave.to_date, half_day: Boolean(Number(leave.half_day)), ...(() => { const r = splitLeaveReason(stripHtml(leave.description || "")); return { reason: r.reason, description: r.details }; })() }
    : { leave_type: "", from_date: isoDate(), to_date: isoDate(), half_day: false, reason: "", description: "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const days = daysBetween(f.from_date, f.to_date) - (f.half_day ? 0.5 : 0);
  const left = balance.find((b) => b.leave_type === f.leave_type)?.remaining;

  // Approver = the employee's business unit (Department) approvers, then the Employee record's; anyone on leave today is skipped
  const approvers = useAsync(() => getApprovers(employee, "Leave Application"), [employee.name]);
  const [chosen, setChosen] = useState(leave?.leave_approver || "");
  const list = approvers.data || [];
  const auto = pickApprover(list);
  const approver = list.find((a) => a.email === chosen && !a.on_leave)?.email || auto?.email || "";
  const switched = list.length > 1 && list[0].on_leave && auto && auto.email !== list[0].email;

  async function submit(e) {
    e.preventDefault();
    if (f.to_date < f.from_date) return setErr("The end date can't be before the start date.");
    if (f.reason === OTHER_REASON && !f.description.trim()) return setErr("Describe the reason for your leave.");
    const description = joinLeaveReason(f.reason, f.description);
    setBusy(true);
    setErr("");
    try {
      if (leave) {
        await frappe.updateDoc("Leave Application", leave.name, { leave_type: f.leave_type, from_date: f.from_date, to_date: f.to_date, half_day: f.half_day ? 1 : 0, half_day_date: f.half_day ? f.from_date : null, description, ...(approver ? { leave_approver: approver } : {}) });
        onSaved();
        return;
      }
      await frappe.createDoc("Leave Application", { employee: employee.name, leave_type: f.leave_type, from_date: f.from_date, to_date: f.to_date, half_day: f.half_day ? 1 : 0, ...(f.half_day ? { half_day_date: f.from_date } : {}), description, posting_date: isoDate(), status: "Open", leave_approver: approver || undefined });
      onSaved();
    } catch (x) {
      setErr(errMsg(x, leave ? "Couldn't save the changes." : "Couldn't submit your leave application."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title={leave ? "Edit Leave Request" : "Apply for Leave"} onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <Field label="Leave Type" hint={left != null ? `${left} day(s) available` : undefined}>
          <select required className={inputCls} value={f.leave_type} onChange={(e) => setF({ ...f, leave_type: e.target.value })}><option value="">Select…</option>{(types.data || []).map((t) => <option key={t}>{t}</option>)}</select>
        </Field>
        <div className="grid grid-cols-2 gap-3"><DateField label="From" value={f.from_date} onChange={(v) => setF({ ...f, from_date: v, to_date: f.to_date < v ? v : f.to_date })} required /><DateField label="To" value={f.to_date} onChange={(v) => setF({ ...f, to_date: v })} required /></div>
        <label className="flex items-center gap-2 text-[13px] text-[var(--color-text-muted)]"><input type="checkbox" checked={f.half_day} onChange={(e) => setF({ ...f, half_day: e.target.checked })} /> Half day (on the first date)</label>
        <Field label="Leave Approver" hint={list.length ? "From your business unit (department). If an approver is on leave, the next one is used." : undefined}>
          {approvers.loading && !approvers.data ? <p className="py-2 text-[13px] text-[var(--color-text-muted)]">Finding your approver…</p> : list.length === 0 ? <p className="py-2 text-[13px] text-[var(--color-amber)]">No approver is set for your business unit yet - HR will assign one.</p> : (
            <select className={inputCls} value={approver} onChange={(e) => setChosen(e.target.value)}>{list.map((a) => <option key={a.email} value={a.email} disabled={a.on_leave}>{a.name}{a.on_leave ? " (on leave)" : ""}</option>)}</select>
          )}
        </Field>
        {switched && <Notice tone="info">{list[0].name} is on leave, so {auto.name} will approve instead.</Notice>}
        {list.length > 0 && approvers.data && !approvers.data.checked && <p className="text-[11px] text-[var(--color-text-faint)]">Couldn't check approvers' availability; HR re-assigns if your approver is away.</p>}
        <Field label="Reason">
          <select required className={inputCls} value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })}><option value="">Select…</option>{LEAVE_REASONS.map((r) => <option key={r} value={r}>{r === OTHER_REASON ? "Other (Please Specify)" : r}</option>)}</select>
        </Field>
        <Field label={f.reason === OTHER_REASON ? "Details" : "Details (Optional)"}><textarea rows={3} required={f.reason === OTHER_REASON} className={inputCls} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} placeholder={f.reason === OTHER_REASON ? "Tell your approver the reason" : ""} /></Field>
        <p className="text-[12px] text-[var(--color-text-muted)]">Requesting about <b className="text-[var(--color-text)]">{Math.max(days, 0)}</b> day(s). Weekly offs and holidays are excluded automatically.</p>
        {err && <Notice>{err}</Notice>}
        <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={onClose}>Cancel</Button><Button type="submit" disabled={busy || !f.leave_type}>{busy ? "Saving…" : leave ? "Save Changes" : "Submit"}</Button></div>
      </form>
    </Modal>
  );
}

/* ===== EmpNotifications.jsx ===== */
export function EmpNotifications() {
  const { user } = useAuth();
  const [tab, setTab] = useState("all");
  const notifs = useAsync(() => getNotifications(user.email), [user.email]);
  const news = useAsync(() => getAnnouncements(30), []);
  const unread = (notifs.data || []).filter((n) => !n.read).length;

  async function markOne(n) {
    if (n.read) return;
    try {
      await frappe.updateDoc("Notification Log", n.name, { read: 1 });
      notifs.reload();
    } catch { /* not allowed - ignore */ }
  }

  async function markAll() {
    if (!(await confirmDialog(`Mark all ${unread} notification(s) as read?`))) return;
    try {
      await frappe.callMethod("frappe.desk.doctype.notification_log.notification_log.mark_all_as_read");
      notifs.reload();
    } catch (e) {
      alertDialog({ tone: "error", message: errMsg(e, "Couldn't mark notifications as read.") });
    }
  }

  return (
    <>
      <PageHeader icon={Bell} title="Notifications" subtitle="Approval updates, reminders and company announcements" actions={unread > 0 && tab === "all" ? <Button variant="secondary" onClick={markAll}><CheckCheck size={14} /> Mark All Read</Button> : null} />
      <Tabs value={tab} onChange={setTab} tabs={[{ id: "all", label: "Updates", count: notifs.data ? unread : undefined }, { id: "news", label: "Announcements" }]} />

      {tab === "all" && (
        <Panel>
          <Async state={notifs}>
            {(rows) => rows.length === 0 ? <Empty icon={Bell} text="No notifications yet." /> : (
              <ul className="divide-y divide-[var(--color-border)]">
                {rows.map((n) => (
                  <li key={n.name}>
                    <button type="button" onClick={() => markOne(n)} className="flex w-full items-start gap-3 py-3 text-left">
                      <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${n.read ? "bg-transparent" : "bg-[var(--color-red)]"}`} />
                      <span className="min-w-0 flex-1"><span className={`block text-[13px] ${n.read ? "text-[var(--color-text-muted)]" : "text-[var(--color-text)]"}`}>{stripHtml(n.subject)}</span><span className="mt-0.5 block text-[11px] text-[var(--color-text-faint)]">{n.document_type ? `${n.document_type} · ` : ""}{dmyHm(n.creation)}</span></span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Async>
        </Panel>
      )}

      {tab === "news" && (
        <Async state={news}>
          {(rows) => rows.length === 0 ? <Panel><Empty icon={Megaphone} text="No announcements right now." /></Panel> : (
            <div className="space-y-3">{rows.map((n) => <Panel key={n.name}><p className="text-[14px] font-medium text-[var(--color-text)]">{n.title}</p><p className="mt-1 text-[11px] text-[var(--color-text-faint)]">{dmyHm(n.creation)}</p><p className="mt-3 whitespace-pre-line text-[13px] leading-6 text-[var(--color-text-muted)]">{stripHtml(n.content)}</p></Panel>)}</div>
          )}
        </Async>
      )}
    </>
  );
}

/* ===== EmpPayslips.jsx ===== */
const pdfUrl = (name) => `/api/method/frappe.utils.print_format.download_pdf?doctype=Salary%20Slip&name=${encodeURIComponent(name)}&no_letterhead=0`;

export function EmpPayslips() {
  const { employee } = useEmployee();
  const q = useAsync(() => getPayslips(employee.name), [employee.name]);
  const [year, setYear] = useState("all");
  const [month, setMonth] = useState("all"); // "01".."12" or "all"
  const [open, setOpen] = useState(null);

  return (
    <>
      <PageHeader icon={Wallet} title="Payslips" subtitle="Monthly payslips with your salary breakdown and deductions" />
      <Async state={q}>
        {(rows) => {
          const years = [...new Set(rows.map((r) => r.end_date.slice(0, 4)))];
          // Months that have a payslip in the chosen year (or in any year)
          const months = [...new Set(rows.filter((r) => year === "all" || r.end_date.startsWith(year)).map((r) => r.end_date.slice(5, 7)))].sort();
          const shown = rows.filter((r) => (year === "all" || r.end_date.startsWith(year)) && (month === "all" || r.end_date.slice(5, 7) === month));
          const period = [month !== "all" ? MONTHS_LONG[Number(month) - 1] : "", year !== "all" ? year : ""].filter(Boolean).join(" ");
          const sum = (k) => shown.reduce((s, r) => s + (Number(r[k]) || 0), 0);
          const cur = rows[0]?.currency || "INR";
          return (
            <>
              {shown.length > 0 && (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  {[["Gross earnings", sum("gross_pay")], ["Total deductions", sum("total_deduction")], ["Net pay", sum("net_pay")]].map(([l, v]) => (
                    <div key={l} className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5"><p className="text-[12px] text-[var(--color-text-muted)]">{l}{period ? ` · ${period}` : ""}</p><p className="mt-2 text-2xl font-semibold text-[var(--color-text)]">{money(v, cur)}</p></div>
                  ))}
                </div>
              )}
              <Panel title="Payslips" action={
                <div className="flex gap-2">
                  <select aria-label="Month" value={month} onChange={(e) => setMonth(e.target.value)} className={`${inputCls} !w-auto !py-1`}><option value="all">All months</option>{months.map((m) => <option key={m} value={m}>{MONTHS_LONG[Number(m) - 1]}</option>)}</select>
                  <select aria-label="Year" value={year} onChange={(e) => { setYear(e.target.value); setMonth("all"); }} className={`${inputCls} !w-auto !py-1`}><option value="all">All years</option>{years.map((y) => <option key={y}>{y}</option>)}</select>
                </div>
              }>
                <Grid rows={shown} empty={rows.length ? "No payslip for this month." : "No payslips have been issued yet."} columns={[
                  { key: "end_date", label: "Month", render: (r) => <button type="button" className="text-left text-[var(--color-text)] hover:text-[var(--color-red-hover)]" onClick={() => setOpen(r.name)}>{MONTHS_LONG[Number(r.end_date.slice(5, 7)) - 1]} {r.end_date.slice(0, 4)}</button> },
                  { key: "start_date", label: "Period", render: (r) => `${dmy(r.start_date)} – ${dmy(r.end_date)}` },
                  { key: "gross_pay", label: "Gross", render: (r) => money(r.gross_pay, r.currency) },
                  { key: "total_deduction", label: "Deductions", render: (r) => money(r.total_deduction, r.currency) },
                  { key: "net_pay", label: "Net Pay", render: (r) => <b>{money(r.net_pay, r.currency)}</b> },
                  { key: "status", label: "Status", render: (r) => <StatusPill status={r.status} /> },
                  { key: "_p", label: "", render: (r) => <a href={pdfUrl(r.name)} target="_blank" rel="noreferrer" title="Download PDF" className="text-[var(--color-text-muted)] hover:text-[var(--color-text)]"><Download size={14} /></a> },
                ]} />
              </Panel>
            </>
          );
        }}
      </Async>
      {open && <Detail name={open} onClose={() => setOpen(null)} />}
    </>
  );
}

function Detail({ name, onClose }) {
  const q = useAsync(() => frappe.getDoc("Salary Slip", name), [name]);
  return (
    <Modal title={`Payslip ${name}`} onClose={onClose} wide>
      <Async state={q}>
        {(d) => (
          <>
            <p className="mb-4 text-[12px] text-[var(--color-text-muted)]">{dmy(d.start_date)} – {dmy(d.end_date)} · Paid days {d.payment_days ?? "—"} of {d.total_working_days ?? "—"}</p>
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              {[["Earnings", d.earnings, d.gross_pay], ["Deductions", d.deductions, d.total_deduction]].map(([title, items, total]) => (
                <div key={title}>
                  <h4 className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">{title}</h4>
                  <ul className="space-y-1.5 text-[13px]">{(items || []).map((i) => <li key={i.salary_component} className="flex justify-between"><span className="text-[var(--color-text-muted)]">{i.salary_component}</span><span className="text-[var(--color-text)]">{money(i.amount, d.currency)}</span></li>)}</ul>
                  <p className="mt-2 flex justify-between border-t border-[var(--color-border)] pt-2 text-[13px] font-medium text-[var(--color-text)]"><span>Total</span><span>{money(total, d.currency)}</span></p>
                </div>
              ))}
            </div>
            <p className="mt-5 flex items-center justify-between rounded-lg bg-[var(--color-surface-2)] px-4 py-3 text-[14px] font-semibold text-[var(--color-text)]"><span>Net pay</span><span>{money(d.net_pay, d.currency)}</span></p>
            <a href={pdfUrl(name)} target="_blank" rel="noreferrer" className="mt-4 inline-flex items-center gap-1.5 text-[13px] text-[var(--color-red-hover)] hover:underline"><Download size={14} /> Download PDF</a>
          </>
        )}
      </Async>
    </Modal>
  );
}

/* ===== EmpProfile.jsx ===== */
// Everything on the profile except Employment (and the contract end date) is the employee's own to keep up to date.
// Must match the server method ethx_update_my_contact (teamSetup.js).
const BLOOD_GROUPS = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];
const MARITAL = ["Single", "Married", "Divorced", "Widowed"];
const EDIT_SECTIONS = [
  ["Personal details", [
    ["date_of_birth", "Date of birth", "date"], ["gender", "Gender", "gender"],
    ["blood_group", "Blood group", BLOOD_GROUPS], ["marital_status", "Marital status", MARITAL],
    ["cell_number", "Mobile number", "tel"], ["personal_email", "Personal email", "email"],
    ["current_address", "Current address", "area"], ["permanent_address", "Permanent address", "area"],
  ]],
  ["Emergency contact", [["person_to_be_contacted", "Name"], ["relation", "Relation"], ["emergency_phone_number", "Phone", "tel"]]],
  ["Passport", [["passport_number", "Passport number"], ["valid_upto", "Valid until", "date"]]],
  ["Identity", [["custom_pan_number", "PAN number", "pan"], ["custom_aadhaar_number", "Aadhaar number", "aadhaar"]]],
];
const maskAadhaar = (v) => (v ? `XXXX XXXX ${String(v).slice(-4)}` : "");
const EDITABLE = EDIT_SECTIONS.flatMap(([, fields]) => fields);

const DOCUMENT_TYPES = ["PAN Card", "Aadhaar Card", "Bank Details", "Passport", "Education Certificate", "Other"];
const EXPECTED_DOCUMENTS = ["PAN Card", "Aadhaar Card", "Bank Details"];
const MAX_DOCUMENT_MB = 10; // PDFs; photos are scaled down before upload, so they may be bigger
const MAX_PHOTO_MB = 25;

/** Upload identity and bank documents. Stored privately on the employee's own record, for them and HR. */
function MyDocumentsPanel({ employee }) {
  const { user } = useAuth();
  const docs = useAsync(() => getMyDocuments(employee.name), [employee.name]);
  const input = useRef(null);
  const [type, setType] = useState(DOCUMENT_TYPES[0]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function upload(file) {
    if (input.current) input.current.value = "";
    if (!file) return;
    setErr("");
    const photo = /\.(png|jpe?g|webp)$/i.test(file.name);
    if (!photo && !/\.pdf$/i.test(file.name)) return setErr(/\.hei[cf]$/i.test(file.name) ? "iPhone HEIC photos can't be uploaded. Change the camera format to JPG (Most Compatible), or upload a PDF." : "Upload a PDF or a photo (JPG, PNG, WebP).");
    if (file.size > (photo ? MAX_PHOTO_MB : MAX_DOCUMENT_MB) * 1024 * 1024) return setErr(photo ? `Photos must be ${MAX_PHOTO_MB} MB or smaller.` : `PDFs must be ${MAX_DOCUMENT_MB} MB or smaller.`);
    if (!(await confirmDialog({ title: `Upload ${type}`, message: `Upload "${file.name}" as your ${type}? It's stored privately on your record for HR to see.`, confirmLabel: "Upload" }))) return;
    setBusy(true);
    try {
      await uploadMyDocument(file, type);
      docs.reload();
    } catch (x) {
      setErr(errMsg(x, "Couldn't upload this document."));
    }
    setBusy(false);
  }

  async function remove(d) {
    if (!(await confirmDialog({ message: `Remove "${d.file_name}"?`, danger: true, confirmLabel: "Remove" }))) return;
    setErr("");
    try {
      await removeMyDocument(d.name);
      docs.reload();
    } catch (x) {
      setErr(errMsg(x, "Couldn't remove this document."));
    }
  }

  return (
    <Panel title="My Documents" hint="Choose the type, then upload a PDF or a photo. For bank details, upload a cancelled cheque or the passbook page. Private to you and HR.">
      {docs.data && (
        <div className="mb-4 flex flex-wrap gap-2">
          {EXPECTED_DOCUMENTS.map((t) => {
            const has = docs.data.some((d) => d.file_name.startsWith(`${t} - `));
            return <span key={t} className="inline-flex items-center gap-1.5 rounded-full border border-[var(--color-border)] px-2.5 py-1 text-[11.5px] text-[var(--color-text-muted)]">{has ? <BadgeCheck size={13} className="text-[var(--color-green)]" /> : <Upload size={12} />}{t}: {has ? "Uploaded" : "Not Uploaded"}</span>;
          })}
        </div>
      )}
      <div className="mb-4 flex flex-wrap items-end gap-2">
        <div className="w-56"><Field label="Document Type"><select className={inputCls} value={type} onChange={(ev) => setType(ev.target.value)}>{DOCUMENT_TYPES.map((t) => <option key={t}>{t}</option>)}</select></Field></div>
        <input ref={input} type="file" accept=".pdf,.png,.jpg,.jpeg,.webp" className="hidden" onChange={(ev) => upload(ev.target.files?.[0])} />
        <Button type="button" onClick={() => input.current?.click()} disabled={busy}><Upload size={14} /> {busy ? "Uploading…" : "Upload Document"}</Button>
      </div>
      {err && <div className="mb-3"><Notice>{err}</Notice></div>}
      <Async state={docs}>
        {(rows) => (rows.length === 0 ? <Empty text="No documents uploaded yet." /> : (
          <ul className="divide-y divide-[var(--color-border)]">
            {rows.map((d) => (
              <li key={d.name} className="flex flex-wrap items-center justify-between gap-3 py-2.5 text-[13px]">
                <span className="flex min-w-0 items-center gap-2 text-[var(--color-text)]"><FileText size={15} className="shrink-0 text-[var(--color-text-muted)]" /><span className="truncate">{d.file_name}</span><span className="shrink-0 text-[11px] text-[var(--color-text-faint)]">{dmy(d.creation)}</span></span>
                <span className="flex shrink-0 items-center gap-3 text-[12px]">
                  <a href={d.file_url} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-[var(--color-text-muted)] hover:text-[var(--color-text)]"><ExternalLink size={13} /> Open</a>
                  {d.owner === user.email && <button type="button" onClick={() => remove(d)} className="flex items-center gap-1 text-[var(--color-text-muted)] hover:text-[var(--color-red-hover)]"><Trash2 size={13} /> Remove</button>}
                </span>
              </li>
            ))}
          </ul>
        ))}
      </Async>
    </Panel>
  );
}

export function EmpProfile() {
  const { employee: e, reload } = useEmployee();
  // PAN / Aadhaar come from a server rule that returns only the caller's own numbers (never with the shared record).
  const ids = useAsync(getMyIdentity, []);
  const idv = { custom_pan_number: ids.data?.pan || "", custom_aadhaar_number: ids.data?.aadhaar || "" };
  const [editing, setEditing] = useState(false);
  const [pwOpen, setPwOpen] = useState(false);
  const documentsRef = useRef(null);
  const [form, setForm] = useState({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  function open() {
    setForm(Object.fromEntries(EDITABLE.map(([k]) => [k, (k in idv ? idv[k] : e[k]) || ""])));
    setError("");
    setEditing(true);
  }

  async function save(ev) {
    ev.preventDefault();
    setBusy(true);
    setError("");
    try {
      // Employees can't edit their Employee record directly; the server method changes only these contact fields.
      try {
        await frappe.callMethod("ethx_update_my_contact", { values: JSON.stringify(form) });
      } catch (err) {
        if (err?.response?.status !== 404 && !/not found|not whitelisted|Failed to get method/i.test(String(err?.response?.data?.exception || ""))) throw err;
        await frappe.updateDoc("Employee", e.name, form); // server rules not installed yet
      }
      setEditing(false);
      reload();
      ids.reload();
    } catch (err) {
      setError(errMsg(err, "Couldn't save. Updating your own details is set up automatically the next time the Administrator signs in - try again after that."));
    } finally {
      setBusy(false);
    }
  }

  const validity = (label, date) => date && [label, `${dmy(date)} (${daysUntil(date) < 0 ? "expired" : `${daysUntil(date)} days left`})`];

  return (
    <>
      <PageHeader icon={UserRound} avatar={<ProfileAvatar size={72} />} title={e.employee_name} subtitle={`${e.designation || "Employee"} · ${e.name}`} actions={<><Button variant="secondary" onClick={() => setPwOpen(true)}><KeyRound size={14} /> Change Password</Button><Button variant="secondary" onClick={() => documentsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}><Upload size={14} /> Upload Documents</Button><Button variant="secondary" onClick={open}><Pencil size={14} /> Edit My Details</Button></>} />

      <Panel title="Employment">
        <KeyValue items={[
          ["Employee ID", e.name], ["Designation", e.designation], ["Department", e.department], ["Branch", e.branch],
          ["Reporting manager", e.reports_to_name ? `${e.reports_to_name} (${e.reports_to})` : e.reports_to],
          ["Date of joining", dmy(e.date_of_joining)], ["Employment type", e.employment_type], ["Grade", e.grade], ["Company", e.company], ["Status", e.status],
          ["Work email", e.company_email || e.user_id],
        ]} />
      </Panel>

      <Panel title="Personal Details">
        <KeyValue items={[
          ["Date of birth", dmy(e.date_of_birth)], ["Gender", e.gender], ["Blood group", e.blood_group], ["Marital status", e.marital_status],
          ["Mobile", e.cell_number], ["Personal email", e.personal_email], ["Current address", e.current_address], ["Permanent address", e.permanent_address],
          ["PAN number", idv.custom_pan_number], ["Aadhaar number", maskAadhaar(idv.custom_aadhaar_number)],
        ]} />
      </Panel>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Panel title="Emergency Contact"><KeyValue items={[["Name", e.person_to_be_contacted], ["Relation", e.relation], ["Phone", e.emergency_phone_number]]} /></Panel>
        <Panel title="Document Validity"><KeyValue items={[validity("Passport valid until", e.valid_upto), validity("Contract ends", e.contract_end_date), e.passport_number && ["Passport number", e.passport_number]].filter(Boolean)} />{!e.valid_upto && !e.contract_end_date && <p className="text-[13px] text-[var(--color-text-muted)]">No expiry dates on file.</p>}</Panel>
      </div>

      <div ref={documentsRef} className="scroll-mt-4"><MyDocumentsPanel employee={e} /></div>

      {pwOpen && <Modal title="Change Password" onClose={() => setPwOpen(false)}><ChangePasswordForm onCancel={() => setPwOpen(false)} /></Modal>}

      {editing && (
        <Modal title="Edit My Details" onClose={() => setEditing(false)} wide>
          <form onSubmit={save} className="space-y-3">
            {/* PAN / Aadhaar can be entered once ERPNext Setup has added those fields. */}
            {EDIT_SECTIONS.filter(([title]) => title !== "Identity" || ids.data?.available).map(([title, fields]) => (
              <fieldset key={title} className="space-y-3">
                <legend className="mb-1 text-[12px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">{title}</legend>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {fields.map(([key, label, type]) => {
                    const set = (v) => setForm((f) => ({ ...f, [key]: v }));
                    if (type === "gender") return <LinkField key={key} label={label} linkDoctype="Gender" value={form[key]} onChange={set} frappe={frappe} />;
                    return (
                      <div key={key} className={type === "area" ? "sm:col-span-2" : ""}>
                        <Field label={label}>
                          {type === "area" ? <textarea rows={2} className={inputCls} value={form[key]} onChange={(ev) => set(ev.target.value)} />
                            : Array.isArray(type) ? <select className={inputCls} value={form[key]} onChange={(ev) => set(ev.target.value)}><option value="">—</option>{type.map((o) => <option key={o}>{o}</option>)}</select>
                              : type === "pan" ? <input className={inputCls} value={form[key]} maxLength={10} placeholder="ABCDE1234F" onChange={(ev) => set(ev.target.value.toUpperCase())} />
                                : type === "aadhaar" ? <input className={inputCls} value={form[key]} maxLength={14} inputMode="numeric" placeholder="12 digits" onChange={(ev) => set(ev.target.value.replace(/[^\d ]/g, ""))} />
                                  : <input className={inputCls} type={type || "text"} max={key === "date_of_birth" ? isoDate() : undefined} value={form[key]} onChange={(ev) => set(ev.target.value)} />}
                        </Field>
                      </div>
                    );
                  })}
                </div>
              </fieldset>
            ))}
            <p className="text-[11px] text-[var(--color-text-faint)]">Employment details (designation, department, manager, joining date, contract) are managed by HR.</p>
            {error && <Notice>{error}</Notice>}
            <div className="flex justify-end gap-2 pt-1"><Button type="button" variant="ghost" onClick={() => setEditing(false)}>Cancel</Button><Button type="submit" disabled={busy}>{busy ? "Saving…" : "Save"}</Button></div>
          </form>
        </Modal>
      )}
    </>
  );
}

/* ===== EmpSearch.jsx ===== */
/** The full Search page: every page and record the person can open (lib/appSearch.js), grouped. */
export function EmpSearch() {
  const { user } = useAuth();
  const { employee } = useEmployee();
  const [params, setParams] = useSearchParams();
  const q = (params.get("q") || "").trim();
  const [text, setText] = useState(q);
  const [res, setRes] = useState({ q: "", groups: [] });

  useEffect(() => {
    let off = false;
    if (!q) return undefined;
    searchRecords(user, employee, q).catch(() => []).then((groups) => { if (!off) setRes({ q, groups }); });
    return () => { off = true; };
  }, [q, user, employee]);

  const pages = useMemo(() => (q ? searchPages(user, q) : []), [user, q]);
  const groups = [...(pages.length ? [{ id: "pages", title: "Pages", items: pages.map((p) => ({ key: p.to, label: p.label, sub: p.trail, to: p.to })) }] : []), ...(res.q === q ? res.groups : [])];
  const loading = Boolean(q) && res.q !== q;
  const total = groups.reduce((n, g) => n + g.items.length, 0);

  return (
    <>
      <PageHeader icon={Search} title="Search" subtitle="Everything in the app you can open: pages, people, candidates, openings, projects, holidays, policies, documents and help" />
      <form data-no-preview onSubmit={(e) => { e.preventDefault(); setParams(text.trim() ? { q: text.trim() } : {}); }} className="relative">
        <Search size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--color-text-faint)]" />
        <input autoFocus value={text} onChange={(e) => setText(e.target.value)} placeholder="Try “leave”, “payslip”, a colleague's name, “Diwali”…" className="w-full rounded-lg border border-[var(--color-border-strong)] bg-[var(--color-surface-2)] py-3 pl-10 pr-3 text-[14px] text-[var(--color-text)] placeholder:text-[var(--color-text-faint)] outline-none focus:border-[var(--color-red)]" />
      </form>

      {!q && <Panel><Empty icon={Search} text="Type something to search the whole app." /></Panel>}
      {q && <p className="text-[12px] text-[var(--color-text-muted)]">{loading ? `Searching for “${q}”…` : `${total} result${total === 1 ? "" : "s"} for “${q}”`}</p>}
      {q && !loading && total === 0 && <Panel><Empty icon={Search} text={`Nothing found for “${q}”.`} /></Panel>}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {groups.map((g) => {
          const Icon = GROUP_ICONS[g.id] || Search;
          return (
            <Panel key={g.id} title={`${g.title} (${g.items.length})`}>
              <ul className="divide-y divide-[var(--color-border)]">
                {g.items.map((it) => {
                  const body = (
                    <>
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--color-surface-2)] text-[var(--color-text-muted)] group-hover:bg-[var(--color-red-wash)] group-hover:text-[var(--color-red-hover)]"><Icon size={15} /></span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] font-medium text-[var(--color-text)] group-hover:text-[var(--color-red-hover)]">{it.label}</span>
                        {it.sub && <span className="block truncate text-[11.5px] text-[var(--color-text-muted)]">{it.sub}</span>}
                      </span>
                      {it.href ? <ExternalLink size={13} className="shrink-0 text-[var(--color-text-faint)]" /> : <ArrowRight size={13} className="shrink-0 text-[var(--color-text-faint)] opacity-0 group-hover:opacity-100" />}
                    </>
                  );
                  return (
                    <li key={it.key}>
                      {it.href
                        ? <a href={it.href} target="_blank" rel="noreferrer" className="group flex items-center gap-3 py-2.5">{body}</a>
                        : <Link to={it.to} className="group flex items-center gap-3 py-2.5">{body}</Link>}
                    </li>
                  );
                })}
              </ul>
            </Panel>
          );
        })}
      </div>
    </>
  );
}

/* ===== EmpTimesheet.jsx ===== */
// Moved to its own file; re-exported so existing imports keep working.
export { EmpTimesheet } from "./EmpTimesheet";

/* ===== EmpTraining.jsx ===== */
export function EmpTraining() {
  const { employee } = useEmployee();
  const q = useAsync(() => getMyTraining(employee.name), [employee.name]);
  return (
    <>
      <PageHeader icon={GraduationCap} title="Training & Learning" subtitle="Assigned training, deadlines and your completion record" />
      <Panel>
        <Async state={q}>
          {(rows) => <Grid rows={rows} rowKey={(r) => r.parent} empty="No training has been assigned to you." columns={[
            { key: "event", label: "Training", render: (r) => <span>{r.event.event_name}{r.is_mandatory ? <span className="ml-2 text-[11px] text-[var(--color-amber)]">Mandatory</span> : null}</span> },
            { key: "type", label: "Type", render: (r) => r.event.type || "—" },
            { key: "start", label: "Starts", render: (r) => dmy(r.event.start_time) || "—" },
            { key: "end", label: "Deadline", render: (r) => { const d = r.event.end_time; if (!d) return "—"; const left = daysUntil(d); return <span className={left < 0 ? "text-[var(--color-text-muted)]" : left <= 7 ? "text-[var(--color-amber)]" : ""}>{dmy(d)}{left >= 0 && left <= 7 ? ` (${left}d left)` : ""}</span>; } },
            { key: "attendance", label: "Attendance", render: (r) => r.attendance || "—" },
            { key: "status", label: "Status", render: (r) => <StatusPill status={r.status || r.event.status} /> },
          ]} />}
        </Async>
      </Panel>
    </>
  );
}``