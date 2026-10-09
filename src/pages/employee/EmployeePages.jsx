// Employee portal: all employee pages in one file.
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { ArrowRight, BadgeCheck, Bell, CalendarCheck, CalendarClock, CalendarDays, CheckCheck, ChevronLeft, ChevronRight, ClipboardCheck, Download, ExternalLink, FileText, GraduationCap, HeartPulse, KeyRound, Laptop, LifeBuoy, LogIn, LogOut, Mail, Megaphone, Paperclip, Pencil, Phone, Plus, Receipt, Search, Send, ShieldAlert, Target, Timer, Undo2, Upload, UserRound, Users, Wallet, Wrench, X } from "lucide-react";
import { Async, ChangePasswordForm, chipCls, Empty, ErrorState, Field, Grid, inputCls, KeyValue, Loading, Modal, Notice, PageHeader, Panel, Skeleton, Stat, StatusPill, Tabs, useEmployee } from "../../components/employee/EmployeeShell";
import { acknowledgePolicy, CONTACTS, createRequest, daysBetween, daysUntil, dmy, dmyHm, errMsg, EXPIRY_WARN_DAYS, getAcknowledged, getAnnouncements, getAppraisals, getApprovals, getAssignedTasks, getAttendanceHistory, getAttendanceRequests, getBenefitClaims, getCheckinsBetween, getEvents, getExpenseClaims, getFeedback, getGoals, getHelpArticles, getHolidays, getLeaveApplications, getLeaveBalance, getLeaveTypes, getMyAssets, getMyDocuments, getMyLeavesBetween, getMyTraining, getNotifications, getPayslips, getPolicies, getRequests, getShiftAssignments, getTeamAvailability, getTimesheets, getTodayAttendance, hm, hoursLabel, isoDate, LETTER_TYPES, money, MONTHS, MONTHS_LONG, nowStamp, pad, POLICY_FOLDER, REQUEST_CATEGORIES, stripHtml, summariseCheckins, useAsync, WEEKDAYS } from "../../lib/employeePortal";
import { useAuth } from "../../context/AuthContext";
import { Button, DateField } from "../../components/ui/primitives";
import { frappe } from "../../lib/api/frappeClient";

/* ===== EmpApprovals.jsx ===== */
const TYPES = ["All", "Leave", "Attendance", "Timesheet", "Expense"];

export function EmpApprovals() {
  const { employee } = useEmployee();
  const q = useAsync(() => getApprovals(employee.name), [employee.name]);
  const [type, setType] = useState("All");
  const [onlyPending, setOnlyPending] = useState(false);

  return (
    <>
      <PageHeader icon={ClipboardCheck} title="My Approvals" subtitle="Every leave, attendance, timesheet and expense request in one place" />
      <Async state={q}>
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
                  { key: "title", label: "Request", render: (r) => <><span>{r.title}</span>{r.detail && <span className="ml-2 text-[11px] text-[var(--color-text-faint)]">{r.detail}</span>}</> },
                  { key: "from", label: "Date", render: (r) => `${dmy(r.from)}${r.to && r.to !== r.from ? ` – ${dmy(r.to)}` : ""}` },
                  { key: "created", label: "Requested", render: (r) => dmy(r.created) },
                  { key: "status", label: "Status", render: (r) => <StatusPill status={r.status} /> },
                  { key: "_l", label: "", render: (r) => <Link to={r.link} className="text-[11px] text-[var(--color-red-hover)] hover:underline">Open</Link> },
                ]} />
              </Panel>
            </>
          );
        }}
      </Async>
    </>
  );
}

/* ===== EmpAssets.jsx ===== */
export function EmpAssets() {
  const { user } = useAuth();
  const { employee } = useEmployee();
  const assets = useAsync(() => getMyAssets(employee.name), [employee.name]);
  const requests = useAsync(() => getRequests(user.email, "Asset"), [user.email]);
  const [req, setReq] = useState(null);

  return (
    <>
      <PageHeader icon={Laptop} title="My Assets" subtitle="Equipment assigned to you, plus repair and return requests" />
      <Panel title="Assigned to me">
        <Async state={assets}>
          {(rows) => <Grid rows={rows} empty="No equipment is assigned to you." columns={[
            { key: "asset_name", label: "Asset", render: (r) => <span>{r.asset_name}<span className="ml-2 text-[11px] text-[var(--color-text-faint)]">{r.name}</span></span> },
            { key: "asset_category", label: "Category" },
            { key: "location", label: "Location" },
            { key: "purchase_date", label: "Issued", render: (r) => dmy(r.purchase_date) },
            { key: "status", label: "Status", render: (r) => <StatusPill status={r.status} /> },
            { key: "_a", label: "", render: (r) => <div className="flex gap-3 text-[11px]"><button type="button" onClick={() => setReq({ type: "Repair", asset: r })} className="flex items-center gap-1 text-[var(--color-red-hover)] hover:underline"><Wrench size={12} /> Repair</button><button type="button" onClick={() => setReq({ type: "Return", asset: r })} className="text-[var(--color-text-muted)] hover:text-[var(--color-text)]">Return</button></div> },
          ]} />}
        </Async>
      </Panel>
      <Panel title="My asset requests">
        <Async state={requests}>{(rows) => <Grid rows={rows} empty="No repair or return requests." columns={[{ key: "subject", label: "Request" }, { key: "creation", label: "Raised", render: (r) => dmy(r.creation) }, { key: "status", label: "Status", render: (r) => <StatusPill status={r.status} /> }]} />}</Async>
      </Panel>
      {req && <ReqModal req={req} user={user.email} onClose={() => setReq(null)} onSaved={() => { setReq(null); requests.reload(); }} />}
    </>
  );
}

function ReqModal({ req, user, onClose, onSaved }) {
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setErr("");
    try {
      await createRequest({ category: `Asset ${req.type.toLowerCase()}`, subject: `${req.asset.asset_name} (${req.asset.name})`, description: notes, user });
      onSaved();
    } catch (x) {
      setErr(errMsg(x, "Couldn't raise the request."));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal title={`${req.type} request`} onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <p className="text-[13px] text-[var(--color-text)]">{req.asset.asset_name} <span className="text-[var(--color-text-faint)]">({req.asset.name})</span></p>
        <Field label={req.type === "Repair" ? "What's wrong?" : "Reason / handover details"}><textarea required rows={3} className={inputCls} value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
        {err && <Notice>{err}</Notice>}
        <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={onClose}>Cancel</Button><Button type="submit" disabled={busy}>{busy ? "Sending…" : "Send request"}</Button></div>
      </form>
    </Modal>
  );
}

/* ===== EmpAttendance.jsx ===== */
const ATT_REQ_STATUS = { 0: "Pending", 1: "Approved", 2: "Cancelled" };

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
    const derived = summariseCheckins(logs).filter((d) => !have.has(d.attendance_date)).map((d) => ({ name: `punch-${d.attendance_date}`, attendance_date: d.attendance_date, status: "Present", in_time: d.in_time, out_time: d.stillIn ? null : d.out_time, working_hours: d.working_hours, derived: true }));
    return [...att, ...derived].sort((a, b) => b.attendance_date.localeCompare(a.attendance_date));
  }, [emp, from]);
  const requests = useAsync(() => getAttendanceRequests(emp), [emp]);

  const logs = todayQ.data?.logs || [];
  const last = logs[logs.length - 1];
  const nextType = last?.log_type === "IN" ? "OUT" : "IN";
  const clock = new Date(now);

  async function punch() {
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
      <PageHeader icon={CalendarCheck} title="Attendance" subtitle="Punch in and out, review your history and request corrections" actions={<Button variant="secondary" onClick={() => setRequest({ from_date: isoDate(), to_date: isoDate() })}><Plus size={14} /> Request correction</Button>} />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <Panel title="Today" className="lg:col-span-1">
          <div className="text-center">
            <p className="text-4xl font-semibold tracking-tight text-[var(--color-text)] tabular-nums">{pad(clock.getHours())}:{pad(clock.getMinutes())}<span className="text-xl text-[var(--color-text-muted)]">:{pad(clock.getSeconds())}</span></p>
            <p className="mt-1 text-[12px] text-[var(--color-text-muted)]">{WEEKDAYS[clock.getDay()]}, {dmy(isoDate(clock))}</p>
            <Button className="mt-5 w-full py-3" onClick={punch} disabled={busy || todayQ.loading}>{nextType === "IN" ? <LogIn size={16} /> : <LogOut size={16} />}{busy ? "Recording…" : nextType === "IN" ? "Punch in" : "Punch out"}</Button>
            {msg && <div className="mt-3 text-left"><Notice>{msg}</Notice></div>}
            {todayQ.data?.logsError && <div className="mt-3 text-left"><Notice tone="info">Punching isn't enabled for your account yet.</Notice></div>}
            <p className="mt-4 text-[12px] text-[var(--color-text-muted)]">Working today: <b className="text-[var(--color-text)]">{hoursLabel(workedToday(logs, now))}</b></p>
          </div>
          {logs.length > 0 && (
            <ul className="mt-4 space-y-1.5 border-t border-[var(--color-border)] pt-3 text-[12px]">
              {logs.map((l) => <li key={l.name} className="flex justify-between"><span className={l.log_type === "IN" ? "text-[var(--color-green)]" : "text-[var(--color-amber)]"}>{l.log_type === "IN" ? "Punch in" : "Punch out"}</span><span className="text-[var(--color-text-muted)]">{hm(l.time)}</span></li>)}
            </ul>
          )}
        </Panel>

        <Panel title="Attendance history" className="lg:col-span-2" action={
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

      <Panel title="Correction requests" hint="Missed punches, work from home or on-duty">
        <Async state={requests}>
          {(rows2) => <Grid rows={rows2} empty="No correction requests yet." columns={[
            { key: "from_date", label: "Period", render: (r) => `${dmy(r.from_date)}${r.to_date !== r.from_date ? ` – ${dmy(r.to_date)}` : ""}` },
            { key: "reason", label: "Reason" },
            { key: "explanation", label: "Details", render: (r) => <span className="text-[var(--color-text-muted)]">{stripHtml(r.explanation || "") || "—"}</span> },
            { key: "docstatus", label: "Status", render: (r) => <StatusPill status={ATT_REQ_STATUS[r.docstatus]} /> },
          ]} />}
        </Async>
      </Panel>

      {request && <CorrectionModal employee={employee} initial={request} onClose={() => setRequest(null)} onSaved={() => { setRequest(null); requests.reload(); }} />}
      {todayQ.error && <ErrorState error={todayQ.error} />}
    </>
  );
}

function CorrectionModal({ employee, initial, onClose, onSaved }) {
  const [f, setF] = useState({ ...initial, reason: "Work From Home", explanation: "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setErr("");
    try {
      await frappe.createDoc("Attendance Request", { employee: employee.name, company: employee.company, from_date: f.from_date, to_date: f.to_date, reason: f.reason, explanation: f.explanation });
      onSaved();
    } catch (x) {
      setErr(errMsg(x));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal title="Request attendance correction" onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <div className="grid grid-cols-2 gap-3"><DateField label="From" value={f.from_date} onChange={(v) => setF({ ...f, from_date: v })} required /><DateField label="To" value={f.to_date} onChange={(v) => setF({ ...f, to_date: v })} required /></div>
        <Field label="Reason"><select className={inputCls} value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })}><option>Work From Home</option><option>On Duty</option></select></Field>
        <Field label="Explanation"><textarea rows={3} required className={inputCls} value={f.explanation} onChange={(e) => setF({ ...f, explanation: e.target.value })} placeholder="e.g. Forgot to punch out, worked at client site" /></Field>
        {err && <Notice>{err}</Notice>}
        <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={onClose}>Cancel</Button><Button type="submit" disabled={busy || !f.from_date || !f.to_date}>{busy ? "Sending…" : "Send request"}</Button></div>
      </form>
    </Modal>
  );
}

/* ===== EmpBenefits.jsx ===== */
export function EmpBenefits() {
  const { employee: e } = useEmployee();
  const claims = useAsync(() => getBenefitClaims(e.name), [e.name]);
  const contact = CONTACTS.find((c) => c.area.startsWith("Insurance"));

  return (
    <>
      <PageHeader icon={HeartPulse} title="Benefits & Insurance" subtitle="Your coverage, benefit claims and who to contact" />
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Panel title="Health insurance">
          {e.health_insurance_provider || e.health_insurance_no ? <KeyValue items={[["Provider", e.health_insurance_provider], ["Policy / member number", e.health_insurance_no]]} /> : <p className="text-[13px] text-[var(--color-text-muted)]">No insurance details are on your profile yet. Contact HR to have them added.</p>}
        </Panel>
        <Panel title="Claim contact">
          {contact && (contact.name || contact.email || contact.phone) ? (
            <div className="space-y-1.5 text-[13px]">{contact.name && <p className="font-medium text-[var(--color-text)]">{contact.name}</p>}{contact.email && <a href={`mailto:${contact.email}`} className="flex items-center gap-2 text-[var(--color-red-hover)] hover:underline"><Mail size={13} /> {contact.email}</a>}{contact.phone && <a href={`tel:${contact.phone}`} className="flex items-center gap-2 text-[var(--color-text-muted)]"><Phone size={13} /> {contact.phone}</a>}</div>
          ) : <p className="text-[13px] text-[var(--color-text-muted)]">Claim contact details haven't been added yet.</p>}
        </Panel>
      </div>
      <Panel title="Benefit claims">
        <Async state={claims}>{(rows) => <Grid rows={rows} empty="You haven't made any benefit claims." columns={[{ key: "claim_date", label: "Date", render: (r) => dmy(r.claim_date) }, { key: "earning_component", label: "Benefit", render: (r) => r.earning_component || "—" }, { key: "claimed_amount", label: "Amount", render: (r) => money(r.claimed_amount) }, { key: "docstatus", label: "Status", render: (r) => <StatusPill status={r.docstatus === 1 ? "Approved" : "Pending"} /> }]} />}</Async>
      </Panel>
    </>
  );
}

/* ===== EmpCalendar.jsx ===== */
export function EmpCalendar() {
  const { employee } = useEmployee();
  const [tab, setTab] = useState("calendar");
  return (
    <>
      <PageHeader icon={CalendarDays} title="Calendar & Holidays" subtitle="Company holidays, weekly offs, your shifts and events" />
      <Tabs value={tab} onChange={setTab} tabs={[{ id: "calendar", label: "Calendar" }, { id: "shifts", label: "Shifts & events" }, { id: "team", label: "Team availability" }]} />
      {tab === "calendar" && <CalendarTab employee={employee} />}
      {tab === "shifts" && <ShiftsTab employee={employee} />}
      {tab === "team" && <TeamTab employee={employee} />}
    </>
  );
}

function CalendarTab({ employee }) {
  const t = new Date();
  const [cursor, setCursor] = useState({ y: t.getFullYear(), m: t.getMonth() });
  const holidays = useAsync(() => getHolidays(employee), [employee.name]);
  const start = `${cursor.y}-${pad(cursor.m + 1)}-01`;
  const end = `${cursor.y}-${pad(cursor.m + 1)}-${pad(new Date(cursor.y, cursor.m + 1, 0).getDate())}`;
  const leaves = useAsync(() => getMyLeavesBetween(employee.name, start, end), [employee.name, start]);

  const byDate = useMemo(() => Object.fromEntries((holidays.data?.holidays || []).map((h) => [h.date, h])), [holidays.data]);
  const leaveOn = (iso) => (leaves.data || []).find((l) => l.from_date <= iso && l.to_date >= iso);
  const first = new Date(cursor.y, cursor.m, 1).getDay();
  const dim = new Date(cursor.y, cursor.m + 1, 0).getDate();
  const cells = [...Array(first).fill(null), ...Array.from({ length: dim }, (_, i) => i + 1)];
  const upcoming = (holidays.data?.holidays || []).filter((h) => !h.weeklyOff && h.date >= isoDate()).slice(0, 8);
  const go = (d) => setCursor(({ y, m }) => { const n = new Date(y, m + d, 1); return { y: n.getFullYear(), m: n.getMonth() }; });

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
      <Panel className="lg:col-span-2" title={`${MONTHS_LONG[cursor.m]} ${cursor.y}`} hint={holidays.data?.name ? `Holiday list: ${holidays.data.name}` : undefined} action={
        <div className="flex gap-1"><button type="button" onClick={() => go(-1)} className="rounded p-1.5 text-[var(--color-text-muted)] hover:bg-[var(--color-surface-2)]"><ChevronLeft size={16} /></button><button type="button" onClick={() => setCursor({ y: t.getFullYear(), m: t.getMonth() })} className="rounded px-2 text-[12px] text-[var(--color-text-muted)] hover:bg-[var(--color-surface-2)]">Today</button><button type="button" onClick={() => go(1)} className="rounded p-1.5 text-[var(--color-text-muted)] hover:bg-[var(--color-surface-2)]"><ChevronRight size={16} /></button></div>}>
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
                  const isToday = iso === isoDate();
                  const bg = l ? "color-mix(in srgb, var(--color-amber) 22%, transparent)" : h && !h.weeklyOff ? "var(--color-red-wash)" : h?.weeklyOff ? "var(--color-surface-2)" : "transparent";
                  return (
                    <div key={iso} title={h?.description || (l ? "On leave" : "")} className={`flex h-14 flex-col rounded-md border p-1.5 text-[12px] ${isToday ? "border-[var(--color-red)]" : "border-[var(--color-border)]"}`} style={{ background: bg }}>
                      <span className={h?.weeklyOff ? "text-[var(--color-text-faint)]" : "text-[var(--color-text)]"}>{d}</span>
                      {h && !h.weeklyOff && <span className="mt-auto truncate text-[10px] text-[var(--color-red-hover)]">{h.description}</span>}
                      {l && !h && <span className="mt-auto truncate text-[10px] text-[var(--color-amber)]">Leave</span>}
                    </div>
                  );
                })}
              </div>
              <div className="mt-4 flex flex-wrap gap-4 text-[11px] text-[var(--color-text-muted)]">
                {[["var(--color-red-wash)", "Holiday"], ["var(--color-surface-2)", "Weekly off"], ["color-mix(in srgb, var(--color-amber) 22%, transparent)", "Your leave"]].map(([c, l]) => <span key={l} className="flex items-center gap-1.5"><i className="h-3 w-3 rounded border border-[var(--color-border)]" style={{ background: c }} />{l}</span>)}
              </div>
            </>
          )}
        </Async>
      </Panel>
      <Panel title="Upcoming holidays">
        {holidays.data && !holidays.data.name && <Empty text="No holiday list is assigned to you yet." />}
        {upcoming.length > 0 && <ul className="space-y-3">{upcoming.map((h) => <li key={h.date} className="flex items-center justify-between text-[13px]"><span className="text-[var(--color-text)]">{h.description}</span><span className="text-[var(--color-text-muted)]">{dmy(h.date)}</span></li>)}</ul>}
        {holidays.data?.name && upcoming.length === 0 && <Empty text="No more holidays this year." />}
      </Panel>
    </div>
  );
}

function ShiftsTab({ employee }) {
  const shifts = useAsync(() => getShiftAssignments(employee.name), [employee.name]);
  const events = useAsync(getEvents, []);
  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
      <Panel title="My shifts" hint={employee.default_shift ? `Default shift: ${employee.default_shift}` : undefined}>
        <Async state={shifts}>{(rows) => <Grid rows={rows} empty="No shift assignments." columns={[{ key: "shift_type", label: "Shift" }, { key: "start_date", label: "From", render: (r) => dmy(r.start_date) }, { key: "end_date", label: "To", render: (r) => dmy(r.end_date) || "Ongoing" }, { key: "status", label: "Status", render: (r) => <StatusPill status={r.status} /> }]} />}</Async>
      </Panel>
      <Panel title="Important events" hint="Public company events">
        <Async state={events}>{(rows) => rows.length === 0 ? <Empty text="No upcoming events." /> : <ul className="space-y-3">{rows.map((e) => <li key={e.name} className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] p-3"><p className="text-[13px] font-medium text-[var(--color-text)]">{e.subject}</p><p className="text-[11px] text-[var(--color-text-muted)]">{e.all_day ? dmy(e.starts_on) : dmyHm(e.starts_on)}</p>{e.description && <p className="mt-1 line-clamp-2 text-[12px] text-[var(--color-text-muted)]">{stripHtml(e.description)}</p>}</li>)}</ul>}</Async>
      </Panel>
    </div>
  );
}

function TeamTab({ employee }) {
  const team = useAsync(() => getTeamAvailability(employee, 14), [employee.name]);
  return (
    <Panel title="Team availability" hint="Approved leave in your department over the next 14 days. Reasons are never shown.">
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
const greeting = (h) => (h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening");

export function EmpDashboard() {
  const { user } = useAuth();
  const { employee } = useEmployee();
  const navigate = useNavigate();
  const now = useMemo(() => new Date(), []);
  const emp = employee.name;

  const today = useAsync(() => getTodayAttendance(emp), [emp]);
  const balance = useAsync(() => getLeaveBalance(emp), [emp]);
  const approvals = useAsync(() => getApprovals(emp), [emp]);
  const notifs = useAsync(() => getNotifications(user.email, 30), [user.email]);
  const news = useAsync(() => getAnnouncements(4), []);
  const team = useAsync(() => getTeamAvailability(employee, 7), [emp]);

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
    { label: "Employment contract", date: employee.contract_end_date },
  ].filter((d) => d.date).map((d) => ({ ...d, days: daysUntil(d.date) })).filter((d) => d.days <= EXPIRY_WARN_DAYS);

  const onLeaveToday = (team.data?.onLeave || []).filter((l) => l.from_date <= isoDate() && l.to_date >= isoDate());

  return (
    <>
      <section className="relative overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] px-7 py-7">
        <div className="pointer-events-none absolute inset-0" style={{ background: "radial-gradient(600px 220px at 100% 0%, rgba(232,16,42,0.22), transparent 70%), radial-gradient(400px 200px at 0% 100%, rgba(232,16,42,0.08), transparent 70%)" }} />
        <div className="relative flex flex-wrap items-center justify-between gap-5">
          <div>
            <p className="text-[12px] font-medium uppercase tracking-[0.14em] text-[var(--color-red-hover)]">{WEEKDAYS[now.getDay()]}, {String(now.getDate()).padStart(2, "0")} {MONTHS[now.getMonth()]} {now.getFullYear()}</p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-[var(--color-text)]">{greeting(now.getHours())}, {(employee.first_name || employee.employee_name || "").split(" ")[0]}</h2>
            <p className="mt-1.5 text-[13px] text-[var(--color-text-muted)]">{[employee.designation, employee.department?.replace(/\s-\s[A-Z0-9]+$/i, ""), employee.company].filter(Boolean).join(" · ")}</p>
          </div>
          <form onSubmit={(e) => { e.preventDefault(); const q = new FormData(e.currentTarget).get("q"); navigate(`/employee/search?q=${encodeURIComponent(q || "")}`); }} className="relative w-full max-w-xs">
            <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-text-faint)]" />
            <input name="q" placeholder="Search policies, holidays, help…" className="w-full rounded-lg border border-[var(--color-border-strong)] bg-[var(--color-surface-2)] py-2.5 pl-9 pr-3 text-[13px] text-[var(--color-text)] placeholder:text-[var(--color-text-faint)] outline-none focus:border-[var(--color-red)]" />
          </form>
        </div>
      </section>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat to="/employee/attendance" icon={CalendarCheck} label="Today's attendance" value={attValue} sub={attSub} accent="var(--color-green)" />
        <Stat to="/employee/leave" icon={CalendarClock} label="Leave balance" value={typeof remaining === "number" ? `${remaining} days` : remaining} sub={balance.data ? `${balance.data.length} leave type(s)` : ""} accent="#4f8cff" />
        <Stat to="/employee/approvals" icon={ClipboardCheck} label="Pending requests" value={pending ? pending.length : approvals.error ? "—" : undefined} sub="Waiting for action" accent="var(--color-amber)" />
        <Stat to="/employee/notifications" icon={Bell} label="Unread notifications" value={unread} sub="Updates & reminders" accent="var(--color-red-hover)" />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Panel title="Leave balance" hint="Remaining days by type" action={<Link to="/employee/leave" className="flex items-center gap-1 text-[12px] text-[var(--color-red-hover)] hover:underline">Apply <ArrowRight size={12} /></Link>}>
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

        <Panel title="Pending requests" hint="Leave, attendance, timesheet & expense" className="lg:col-span-2" action={<Link to="/employee/approvals" className="flex items-center gap-1 text-[12px] text-[var(--color-red-hover)] hover:underline">View all <ArrowRight size={12} /></Link>}>
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
          <Panel title="Document reminders" hint={`Expiring within ${EXPIRY_WARN_DAYS} days`}>
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
          <Panel title="Team today" hint="Colleagues on approved leave">
            {team.loading && !team.data ? <Skeleton className="h-12 w-full" /> : team.error ? <p className="text-[12px] text-[var(--color-text-muted)]">Team availability isn't enabled for your account.</p> : onLeaveToday.length === 0 ? <Empty icon={Users} text="Everyone is available today." /> : (
              <ul className="space-y-2 text-[13px]">{onLeaveToday.map((l) => <li key={l.employee} className="flex justify-between"><span className="text-[var(--color-text)]">{l.employee_name}</span><span className="text-[var(--color-text-muted)]">till {dmy(l.to_date)}</span></li>)}</ul>
            )}
          </Panel>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[["/employee/attendance", "Punch in / out", CalendarCheck], ["/employee/leave", "Apply for leave", CalendarClock], ["/employee/payslips", "View payslips", Wallet], ["/employee/help", "Raise a request", LifeBuoy]].map(([to, label, Icon]) => (
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
  const mine = useAsync(() => getMyDocuments(employee.name), [employee.name]);
  const [busy, setBusy] = useState("");

  async function ack(name) {
    setBusy(name);
    try {
      await acknowledgePolicy(name);
      acks.reload();
    } catch (e) {
      window.alert(errMsg(e, "Couldn't record your acknowledgement."));
    } finally {
      setBusy("");
    }
  }

  const done = acks.data || new Set();
  const required = (policies.data || []).filter((p) => !done.has(p.name)).length;

  return (
    <>
      <PageHeader icon={FileText} title="Policies & Documents" subtitle="Employee handbook, company policies and your employment documents" />
      <Tabs value={tab} onChange={setTab} tabs={[{ id: "policies", label: "Policies & handbook", count: policies.data ? required : undefined }, { id: "mine", label: "My documents" }]} />

      {tab === "policies" && (
        <Panel title="Company policies" hint={required ? `${required} awaiting your acknowledgement` : "You've acknowledged everything"}>
          <Async state={policies}>
            {(rows) => rows.length === 0 ? <Empty text={`No policies published yet. HR can upload files to the "${POLICY_FOLDER}" folder in ERPNext.`} /> : (
              <ul className="divide-y divide-[var(--color-border)]">
                {rows.map((p) => (
                  <li key={p.name} className="flex flex-wrap items-center justify-between gap-3 py-3">
                    <div className="flex min-w-0 items-center gap-3"><FileText size={16} className="shrink-0 text-[var(--color-text-muted)]" /><div className="min-w-0"><p className="truncate text-[13px] text-[var(--color-text)]">{title(p.file_name)}</p><p className="text-[11px] text-[var(--color-text-muted)]">Published {dmy(p.creation)}</p></div></div>
                    <div className="flex items-center gap-3">
                      <a href={p.file_url} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-[12px] text-[var(--color-text-muted)] hover:text-[var(--color-text)]"><ExternalLink size={13} /> Read</a>
                      {acks.error ? null : done.has(p.name) ? <span className="flex items-center gap-1 text-[12px] text-[var(--color-green)]"><BadgeCheck size={14} /> Acknowledged</span> : <Button variant="secondary" disabled={busy === p.name || acks.loading} onClick={() => ack(p.name)}>{busy === p.name ? "Saving…" : "I have read this"}</Button>}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Async>
        </Panel>
      )}

      {tab === "mine" && (
        <Panel title="My documents" hint="Employment letters and files HR has attached to your profile">
          <Async state={mine}>
            {(rows) => rows.length === 0 ? <Empty text="No documents on your profile yet. Need a letter? Request it from Help & Requests." /> : (
              <ul className="divide-y divide-[var(--color-border)]">{rows.map((d) => <li key={d.name} className="flex items-center justify-between gap-3 py-3"><div className="flex min-w-0 items-center gap-3"><FileText size={16} className="shrink-0 text-[var(--color-text-muted)]" /><div className="min-w-0"><p className="truncate text-[13px] text-[var(--color-text)]">{d.file_name}</p><p className="text-[11px] text-[var(--color-text-muted)]">Added {dmy(d.creation)}</p></div></div><a href={d.file_url} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-[12px] text-[var(--color-red-hover)] hover:underline"><ExternalLink size={13} /> Open</a></li>)}</ul>
            )}
          </Async>
        </Panel>
      )}
    </>
  );
}

/* ===== EmpExpenses.jsx ===== */
export function EmpExpenses() {
  const { employee } = useEmployee();
  const q = useAsync(() => getExpenseClaims(employee.name), [employee.name]);
  const [open, setOpen] = useState(false);

  return (
    <>
      <PageHeader icon={Receipt} title="Expense Claims" subtitle="Upload bills and track reimbursement" actions={<Button onClick={() => setOpen(true)}><Plus size={14} /> New claim</Button>} />
      <Async state={q}>
        {(rows) => {
          const sum = (pred, k) => rows.filter(pred).reduce((s, r) => s + (Number(r[k]) || 0), 0);
          return (
            <>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                {[["Claimed (pending approval)", sum((r) => r.docstatus === 0, "total_claimed_amount")], ["Awaiting reimbursement", sum((r) => r.status === "Unpaid", "total_sanctioned_amount")], ["Reimbursed", sum((r) => r.status === "Paid", "total_amount_reimbursed")]].map(([l, v]) => (
                  <div key={l} className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5"><p className="text-[12px] text-[var(--color-text-muted)]">{l}</p><p className="mt-2 text-2xl font-semibold text-[var(--color-text)]">{money(v)}</p></div>
                ))}
              </div>
              <Panel title="My claims">
                <Grid rows={rows} empty="No expense claims yet." columns={[
                  { key: "name", label: "Claim" },
                  { key: "posting_date", label: "Date", render: (r) => dmy(r.posting_date) },
                  { key: "total_claimed_amount", label: "Claimed", render: (r) => money(r.total_claimed_amount) },
                  { key: "total_sanctioned_amount", label: "Approved", render: (r) => (r.total_sanctioned_amount ? money(r.total_sanctioned_amount) : "—") },
                  { key: "approval_status", label: "Approval", render: (r) => <StatusPill status={r.approval_status} /> },
                  { key: "status", label: "Reimbursement", render: (r) => <StatusPill status={r.status} /> },
                ]} />
              </Panel>
            </>
          );
        }}
      </Async>
      {open && <ClaimModal employee={employee} onClose={() => setOpen(false)} onSaved={() => { setOpen(false); q.reload(); }} />}
    </>
  );
}

function ClaimModal({ employee, onClose, onSaved }) {
  const types = useAsync(() => frappe.getList("Expense Claim Type", { fields: ["name"], limit: 0 }), []);
  const [f, setF] = useState({ date: isoDate(), type: "", amount: "", description: "" });
  const [files, setFiles] = useState([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const input = useRef(null);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setErr("");
    try {
      const amount = Number(f.amount);
      const doc = await frappe.createDoc("Expense Claim", {
        employee: employee.name,
        company: employee.company,
        posting_date: isoDate(),
        expenses: [{ expense_date: f.date, expense_type: f.type, description: f.description, amount, sanctioned_amount: amount }],
      });
      let failed = 0;
      for (const file of files) {
        try { await frappe.uploadFile(file, { doctype: "Expense Claim", docname: doc.name, isPrivate: true }); } catch { failed += 1; }
      }
      if (failed) window.alert(`The claim was created, but ${failed} bill(s) couldn't be uploaded. You can ask HR to attach them.`);
      onSaved();
    } catch (x) {
      setErr(errMsg(x, "Couldn't create the claim."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title="New expense claim" onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <DateField label="Expense date" value={f.date} onChange={(v) => setF({ ...f, date: v })} required />
        <Field label="Expense type"><select required className={inputCls} value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}><option value="">Select…</option>{(types.data || []).map((t) => <option key={t.name}>{t.name}</option>)}</select></Field>
        <Field label="Amount"><input type="number" min="0.01" step="0.01" required className={inputCls} value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} /></Field>
        <Field label="Description"><textarea rows={2} className={inputCls} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
        <div>
          <input ref={input} type="file" multiple accept="image/*,.pdf" className="hidden" onChange={(e) => setFiles(Array.from(e.target.files || []))} />
          <Button type="button" variant="secondary" onClick={() => input.current?.click()}><Paperclip size={14} /> {files.length ? `${files.length} bill(s) attached` : "Attach bills"}</Button>
          {files.length > 0 && <ul className="mt-2 space-y-0.5 text-[11px] text-[var(--color-text-muted)]">{files.map((x) => <li key={x.name} className="truncate">{x.name}</li>)}</ul>}
        </div>
        {err && <Notice>{err}</Notice>}
        <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={onClose}>Cancel</Button><Button type="submit" disabled={busy}>{busy ? "Submitting…" : "Submit claim"}</Button></div>
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
          <Async state={reviews}>{(rows) => <Grid rows={rows} empty="No reviews scheduled." columns={[{ key: "appraisal_cycle", label: "Cycle" }, { key: "end_date", label: "Review by", render: (r) => dmy(r.end_date) || "—" }, { key: "status", label: "Status", render: (r) => <StatusPill status={r.status} /> }, { key: "final_score", label: "Score", render: (r) => r.final_score ?? "—" }]} />}</Async>
        </Panel>
        <Panel title="Feedback from your manager">
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

  return (
    <>
      <PageHeader icon={LifeBuoy} title="Help & Requests" subtitle="HR and IT support, document requests, letters and who to contact" actions={<Button onClick={() => setModal({ category: "HR Support" })}><Plus size={14} /> New request</Button>} />
      <Tabs value={tab} onChange={setTab} tabs={[{ id: "requests", label: "My requests" }, { id: "letters", label: "Employee letters" }, { id: "contacts", label: "HR & IT contacts" }]} />

      {tab === "requests" && (
        <Panel title="My requests">
          <Async state={requests}>{(rows) => <Grid rows={rows.filter((r) => !isLetter(r))} empty="You haven't raised any requests." columns={[{ key: "name", label: "Ref" }, { key: "subject", label: "Subject" }, { key: "creation", label: "Raised", render: (r) => dmy(r.creation) }, { key: "status", label: "Status", render: (r) => <StatusPill status={r.status} /> }]} />}</Async>
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
          <Panel title="My letter requests" hint="Issued letters appear under Policies & Documents > My documents">
            <Async state={requests}>{(rows) => <Grid rows={rows.filter(isLetter)} empty="No letter requests yet." columns={[{ key: "subject", label: "Letter", render: (r) => r.subject.replace(/^\[Letter\]\s*/, "") }, { key: "creation", label: "Requested", render: (r) => dmy(r.creation) }, { key: "status", label: "Status", render: (r) => <StatusPill status={r.status} /> }]} />}</Async>
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
  const [f, setF] = useState({ category: init.category, subject: init.subject || "", description: "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setErr("");
    try {
      await createRequest({ ...f, user });
      onSaved();
    } catch (x) {
      setErr(errMsg(x, "Couldn't send the request."));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal title={init.letter ? `Request: ${init.subject}` : "New request"} onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        {!init.letter && (
          <>
            <Field label="Category"><select className={inputCls} value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>{REQUEST_CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select></Field>
            <Field label="Subject"><input required className={inputCls} value={f.subject} onChange={(e) => setF({ ...f, subject: e.target.value })} /></Field>
          </>
        )}
        <Field label={init.letter ? "Purpose (e.g. bank loan, visa) and any details" : "Details"}><textarea required rows={4} className={inputCls} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
        {err && <Notice>{err}</Notice>}
        <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={onClose}>Cancel</Button><Button type="submit" disabled={busy}>{busy ? "Sending…" : "Send"}</Button></div>
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

  async function withdraw(row) {
    if (!window.confirm(`Withdraw this leave request (${dmy(row.from_date)} – ${dmy(row.to_date)})?`)) return;
    try {
      await frappe.deleteDoc("Leave Application", row.name);
      apps.reload();
      balance.reload();
    } catch (e) {
      window.alert(errMsg(e, "Couldn't withdraw this request."));
    }
  }

  return (
    <>
      <PageHeader icon={CalendarClock} title="Leave" subtitle="Your balance, applications and approval status" actions={<Button onClick={() => setOpen(true)}><Plus size={14} /> Apply for leave</Button>} />

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

      <Panel title="My applications">
        <Async state={apps}>
          {(rows) => <Grid rows={rows} empty="You haven't applied for leave yet." columns={[
            { key: "leave_type", label: "Type" },
            { key: "from_date", label: "Dates", render: (r) => `${dmy(r.from_date)}${r.to_date !== r.from_date ? ` – ${dmy(r.to_date)}` : ""}${r.half_day ? " (half day)" : ""}` },
            { key: "total_leave_days", label: "Days" },
            { key: "description", label: "Reason", render: (r) => <span className="text-[var(--color-text-muted)]">{r.description?.replace(/<[^>]*>/g, "") || "—"}</span> },
            { key: "status", label: "Status", render: (r) => <StatusPill status={r.status} /> },
            { key: "_a", label: "", render: (r) => r.status === "Open" && r.docstatus === 0 ? <button type="button" title="Withdraw" onClick={() => withdraw(r)} className="flex items-center gap-1 text-[11px] text-[var(--color-red-hover)] hover:underline"><Undo2 size={12} /> Withdraw</button> : null },
          ]} />}
        </Async>
      </Panel>

      {open && <ApplyModal employee={employee} balance={balance.data || []} onClose={() => setOpen(false)} onSaved={() => { setOpen(false); apps.reload(); balance.reload(); }} />}
    </>
  );
}

function ApplyModal({ employee, balance, onClose, onSaved }) {
  const types = useAsync(async () => (balance.length ? balance.map((b) => b.leave_type) : (await getLeaveTypes()).map((t) => t.name)), []);
  const [f, setF] = useState({ leave_type: "", from_date: isoDate(), to_date: isoDate(), half_day: false, description: "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const days = daysBetween(f.from_date, f.to_date) - (f.half_day ? 0.5 : 0);
  const left = balance.find((b) => b.leave_type === f.leave_type)?.remaining;

  async function submit(e) {
    e.preventDefault();
    if (f.to_date < f.from_date) return setErr("The end date can't be before the start date.");
    setBusy(true);
    setErr("");
    try {
      await frappe.createDoc("Leave Application", { employee: employee.name, leave_type: f.leave_type, from_date: f.from_date, to_date: f.to_date, half_day: f.half_day ? 1 : 0, ...(f.half_day ? { half_day_date: f.from_date } : {}), description: f.description, posting_date: isoDate(), status: "Open" });
      onSaved();
    } catch (x) {
      setErr(errMsg(x, "Couldn't submit your leave application."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title="Apply for leave" onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <Field label="Leave type" hint={left != null ? `${left} day(s) available` : undefined}>
          <select required className={inputCls} value={f.leave_type} onChange={(e) => setF({ ...f, leave_type: e.target.value })}><option value="">Select…</option>{(types.data || []).map((t) => <option key={t}>{t}</option>)}</select>
        </Field>
        <div className="grid grid-cols-2 gap-3"><DateField label="From" value={f.from_date} onChange={(v) => setF({ ...f, from_date: v, to_date: f.to_date < v ? v : f.to_date })} required /><DateField label="To" value={f.to_date} onChange={(v) => setF({ ...f, to_date: v })} required /></div>
        <label className="flex items-center gap-2 text-[13px] text-[var(--color-text-muted)]"><input type="checkbox" checked={f.half_day} onChange={(e) => setF({ ...f, half_day: e.target.checked })} /> Half day (on the first date)</label>
        <Field label="Reason"><textarea rows={3} className={inputCls} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
        <p className="text-[12px] text-[var(--color-text-muted)]">Requesting about <b className="text-[var(--color-text)]">{Math.max(days, 0)}</b> day(s). Weekly offs and holidays are excluded automatically by ERPNext.</p>
        {err && <Notice>{err}</Notice>}
        <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={onClose}>Cancel</Button><Button type="submit" disabled={busy || !f.leave_type}>{busy ? "Submitting…" : "Submit"}</Button></div>
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
    try {
      await frappe.callMethod("frappe.desk.doctype.notification_log.notification_log.mark_all_as_read");
      notifs.reload();
    } catch (e) {
      window.alert(errMsg(e, "Couldn't mark notifications as read."));
    }
  }

  return (
    <>
      <PageHeader icon={Bell} title="Notifications" subtitle="Approval updates, reminders and company announcements" actions={unread > 0 && tab === "all" ? <Button variant="secondary" onClick={markAll}><CheckCheck size={14} /> Mark all read</Button> : null} />
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
  const [open, setOpen] = useState(null);

  return (
    <>
      <PageHeader icon={Wallet} title="Payslips" subtitle="Monthly payslips with your salary breakdown and deductions" />
      <Async state={q}>
        {(rows) => {
          const years = [...new Set(rows.map((r) => r.end_date.slice(0, 4)))];
          const shown = rows.filter((r) => year === "all" || r.end_date.startsWith(year));
          const sum = (k) => shown.reduce((s, r) => s + (Number(r[k]) || 0), 0);
          const cur = rows[0]?.currency || "INR";
          return (
            <>
              {shown.length > 0 && (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  {[["Gross earnings", sum("gross_pay")], ["Total deductions", sum("total_deduction")], ["Net pay", sum("net_pay")]].map(([l, v]) => (
                    <div key={l} className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5"><p className="text-[12px] text-[var(--color-text-muted)]">{l}{year !== "all" ? ` · ${year}` : ""}</p><p className="mt-2 text-2xl font-semibold text-[var(--color-text)]">{money(v, cur)}</p></div>
                  ))}
                </div>
              )}
              <Panel title="Payslips" action={<select value={year} onChange={(e) => setYear(e.target.value)} className={`${inputCls} !w-auto !py-1`}><option value="all">All years</option>{years.map((y) => <option key={y}>{y}</option>)}</select>}>
                <Grid rows={shown} empty="No payslips have been issued yet." columns={[
                  { key: "end_date", label: "Month", render: (r) => <button type="button" className="text-left text-[var(--color-text)] hover:text-[var(--color-red-hover)]" onClick={() => setOpen(r.name)}>{MONTHS_LONG[Number(r.end_date.slice(5, 7)) - 1]} {r.end_date.slice(0, 4)}</button> },
                  { key: "start_date", label: "Period", render: (r) => `${dmy(r.start_date)} – ${dmy(r.end_date)}` },
                  { key: "gross_pay", label: "Gross", render: (r) => money(r.gross_pay, r.currency) },
                  { key: "total_deduction", label: "Deductions", render: (r) => money(r.total_deduction, r.currency) },
                  { key: "net_pay", label: "Net pay", render: (r) => <b>{money(r.net_pay, r.currency)}</b> },
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
const EDITABLE = [
  ["cell_number", "Mobile number"],
  ["personal_email", "Personal email"],
  ["current_address", "Current address"],
  ["person_to_be_contacted", "Emergency contact name"],
  ["emergency_phone_number", "Emergency contact number"],
];

export function EmpProfile() {
  const { employee: e, reload } = useEmployee();
  const [editing, setEditing] = useState(false);
  const [pwOpen, setPwOpen] = useState(false);
  const [form, setForm] = useState({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  function open() {
    setForm(Object.fromEntries(EDITABLE.map(([k]) => [k, e[k] || ""])));
    setError("");
    setEditing(true);
  }

  async function save(ev) {
    ev.preventDefault();
    setBusy(true);
    setError("");
    try {
      await frappe.updateDoc("Employee", e.name, form);
      setEditing(false);
      reload();
    } catch (err) {
      setError(errMsg(err, "Couldn't save. Your account may not be allowed to edit its own profile."));
    } finally {
      setBusy(false);
    }
  }

  const validity = (label, date) => date && [label, `${dmy(date)} (${daysUntil(date) < 0 ? "expired" : `${daysUntil(date)} days left`})`];

  return (
    <>
      <PageHeader icon={UserRound} title={e.employee_name} subtitle={`${e.designation || "Employee"} · ${e.name}`} actions={<><Button variant="secondary" onClick={() => setPwOpen(true)}><KeyRound size={14} /> Change password</Button><Button variant="secondary" onClick={open}><Pencil size={14} /> Update contact details</Button></>} />

      <Panel title="Employment">
        <KeyValue items={[
          ["Employee ID", e.name], ["Designation", e.designation], ["Department", e.department], ["Branch", e.branch],
          ["Reporting manager", e.reports_to_name ? `${e.reports_to_name} (${e.reports_to})` : e.reports_to],
          ["Date of joining", dmy(e.date_of_joining)], ["Employment type", e.employment_type], ["Grade", e.grade], ["Company", e.company], ["Status", e.status],
          ["Work email", e.company_email || e.user_id],
        ]} />
      </Panel>

      <Panel title="Personal details">
        <KeyValue items={[
          ["Date of birth", dmy(e.date_of_birth)], ["Gender", e.gender], ["Blood group", e.blood_group], ["Marital status", e.marital_status],
          ["Mobile", e.cell_number], ["Personal email", e.personal_email], ["Current address", e.current_address], ["Permanent address", e.permanent_address],
        ]} />
      </Panel>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Panel title="Emergency contact"><KeyValue items={[["Name", e.person_to_be_contacted], ["Relation", e.relation], ["Phone", e.emergency_phone_number]]} /></Panel>
        <Panel title="Document validity"><KeyValue items={[validity("Passport valid until", e.valid_upto), validity("Contract ends", e.contract_end_date), e.passport_number && ["Passport number", e.passport_number]].filter(Boolean)} />{!e.valid_upto && !e.contract_end_date && <p className="text-[13px] text-[var(--color-text-muted)]">No expiry dates on file.</p>}</Panel>
      </div>

      {pwOpen && <Modal title="Change password" onClose={() => setPwOpen(false)}><ChangePasswordForm onCancel={() => setPwOpen(false)} /></Modal>}

      {editing && (
        <Modal title="Update contact details" onClose={() => setEditing(false)}>
          <form onSubmit={save} className="space-y-3">
            {EDITABLE.map(([key, label]) => (
              <Field key={key} label={label}>
                {key === "current_address" ? <textarea rows={3} className={inputCls} value={form[key]} onChange={(ev) => setForm((f) => ({ ...f, [key]: ev.target.value }))} /> : <input className={inputCls} value={form[key]} onChange={(ev) => setForm((f) => ({ ...f, [key]: ev.target.value }))} />}
              </Field>
            ))}
            <p className="text-[11px] text-[var(--color-text-faint)]">Employment details such as designation or department are managed by HR.</p>
            {error && <Notice>{error}</Notice>}
            <div className="flex justify-end gap-2 pt-1"><Button type="button" variant="ghost" onClick={() => setEditing(false)}>Cancel</Button><Button type="submit" disabled={busy}>{busy ? "Saving…" : "Save"}</Button></div>
          </form>
        </Modal>
      )}
    </>
  );
}

/* ===== EmpSearch.jsx ===== */
const PAGES = [
  ["/employee", "Dashboard"], ["/employee/profile", "My Profile"], ["/employee/attendance", "Attendance, punch in/out, correction"], ["/employee/leave", "Leave balance & apply"],
  ["/employee/approvals", "My Approvals"], ["/employee/calendar", "Calendar, holidays, shifts, team availability"], ["/employee/timesheet", "Timesheet"], ["/employee/expenses", "Expense claims & reimbursement"],
  ["/employee/payslips", "Payslips & salary"], ["/employee/documents", "Policies, handbook & documents"], ["/employee/assets", "My assets: laptop, mobile"], ["/employee/help", "Help, requests, letters, contacts"],
  ["/employee/notifications", "Notifications & announcements"], ["/employee/goals", "Goals & feedback"], ["/employee/training", "Training & learning"], ["/employee/benefits", "Benefits & insurance"],
];

export function EmpSearch() {
  const { employee } = useEmployee();
  const [params, setParams] = useSearchParams();
  const q = (params.get("q") || "").trim();
  const [text, setText] = useState(q);
  const [res, setRes] = useState(null);

  useEffect(() => {
    let off = false;
    if (!q) return undefined;
    const needle = q.toLowerCase();
    const has = (s) => String(s || "").toLowerCase().includes(needle);
    Promise.allSettled([getHolidays(employee), getPolicies(), getMyDocuments(employee.name), getHelpArticles(q)]).then(([h, p, d, a]) => {
      if (off) return;
      setRes({
        pages: PAGES.filter(([, label]) => has(label)),
        holidays: h.status === "fulfilled" ? h.value.holidays.filter((x) => !x.weeklyOff && has(x.description)) : [],
        policies: p.status === "fulfilled" ? p.value.filter((x) => has(x.file_name)) : [],
        docs: d.status === "fulfilled" ? d.value.filter((x) => has(x.file_name)) : [],
        articles: a.status === "fulfilled" ? a.value : [],
      });
    });
    return () => { off = true; };
  }, [q, employee]);

  const loading = Boolean(q) && !res;
  const total = res ? Object.values(res).reduce((s, a) => s + a.length, 0) : 0;

  return (
    <>
      <PageHeader icon={Search} title="Search" subtitle="Find policies, holidays, documents, help articles and pages" />
      <form onSubmit={(e) => { e.preventDefault(); setRes(null); setParams(text ? { q: text } : {}); }} className="relative">
        <Search size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--color-text-faint)]" />
        <input autoFocus value={text} onChange={(e) => setText(e.target.value)} placeholder="Try “leave policy”, “Diwali”, “laptop”…" className="w-full rounded-lg border border-[var(--color-border-strong)] bg-[var(--color-surface-2)] py-3 pl-10 pr-3 text-[14px] text-[var(--color-text)] placeholder:text-[var(--color-text-faint)] outline-none focus:border-[var(--color-red)]" />
      </form>

      {!q && <Panel><Empty icon={Search} text="Type something to search." /></Panel>}
      {loading && <Loading />}
      {res && total === 0 && <Panel><Empty icon={Search} text={`Nothing found for “${q}”.`} /></Panel>}

      {res?.pages.length > 0 && <Panel title="Pages"><ul className="space-y-2">{res.pages.map(([to, label]) => <li key={to}><Link to={to} className="text-[13px] text-[var(--color-red-hover)] hover:underline">{label}</Link></li>)}</ul></Panel>}
      {res?.holidays.length > 0 && <Panel title="Holidays"><ul className="space-y-2">{res.holidays.map((h) => <li key={h.date} className="flex items-center gap-2 text-[13px]"><CalendarDays size={14} className="text-[var(--color-text-muted)]" /><span className="text-[var(--color-text)]">{h.description}</span><span className="text-[var(--color-text-muted)]">{dmy(h.date)}</span></li>)}</ul></Panel>}
      {res?.policies.length > 0 && <Panel title="Policies"><ul className="space-y-2">{res.policies.map((f) => <li key={f.name}><a href={f.file_url} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-[13px] text-[var(--color-text)] hover:text-[var(--color-red-hover)]"><FileText size={14} /> {f.file_name} <ExternalLink size={12} /></a></li>)}</ul></Panel>}
      {res?.docs.length > 0 && <Panel title="My documents"><ul className="space-y-2">{res.docs.map((f) => <li key={f.name}><a href={f.file_url} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-[13px] text-[var(--color-text)] hover:text-[var(--color-red-hover)]"><FileText size={14} /> {f.file_name} <ExternalLink size={12} /></a></li>)}</ul></Panel>}
      {res?.articles.length > 0 && <Panel title="Help articles"><ul className="space-y-2">{res.articles.map((a) => <li key={a.name} className="flex items-center gap-2 text-[13px] text-[var(--color-text)]"><LifeBuoy size={14} className="text-[var(--color-text-muted)]" /> {a.title}{a.category && <span className="text-[var(--color-text-faint)]">· {a.category}</span>}</li>)}</ul></Panel>}
    </>
  );
}

/* ===== EmpTimesheet.jsx ===== */
export function EmpTimesheet() {
  const { user } = useAuth();
  const { employee } = useEmployee();
  const tasks = useAsync(() => getAssignedTasks(user.email), [user.email]);
  const sheets = useAsync(() => getTimesheets(employee.name), [employee.name]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState("");

  async function submitSheet(name) {
    if (!window.confirm("Submit this timesheet? You won't be able to edit it afterwards.")) return;
    setBusy(name);
    try {
      await frappe.submitDoc(await frappe.getDoc("Timesheet", name));
      sheets.reload();
    } catch (e) {
      window.alert(errMsg(e, "Couldn't submit this timesheet."));
    } finally {
      setBusy("");
    }
  }

  return (
    <>
      <PageHeader icon={Timer} title="Timesheet" subtitle="Fill in your hours for the month - projects and the work you did - and submit it to HR" actions={<Button onClick={() => setOpen(true)}><CalendarDays size={14} /> Monthly timesheet</Button>} />
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <Panel title="Assigned tasks" hint="Open tasks assigned to you" className="lg:col-span-1">
          <Async state={tasks}>
            {(rows) => rows.length === 0 ? <p className="text-[13px] text-[var(--color-text-muted)]">No open tasks assigned to you.</p> : (
              <ul className="space-y-2.5">{rows.map((t) => <li key={t.name} className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] p-3"><p className="text-[13px] text-[var(--color-text)]">{t.subject}</p><p className="mt-0.5 text-[11px] text-[var(--color-text-muted)]">{t.project || "No project"}{t.exp_end_date ? ` · due ${dmy(t.exp_end_date)}` : ""}</p><div className="mt-1.5"><StatusPill status={t.status} /></div></li>)}</ul>
            )}
          </Async>
        </Panel>
        <Panel title="My timesheets" className="lg:col-span-2">
          <Async state={sheets}>
            {(rows) => <Grid rows={rows} empty="No timesheets yet." columns={[
              { key: "name", label: "Timesheet" },
              { key: "start_date", label: "Period", render: (r) => `${dmy(r.start_date)}${r.end_date && r.end_date !== r.start_date ? ` – ${dmy(r.end_date)}` : ""}` },
              { key: "total_hours", label: "Hours", render: (r) => Number(r.total_hours || 0).toFixed(2) },
              { key: "status", label: "Status", render: (r) => <StatusPill status={r.status} /> },
              { key: "_a", label: "", render: (r) => r.docstatus === 0 ? <button type="button" disabled={busy === r.name} onClick={() => submitSheet(r.name)} className="flex items-center gap-1 text-[11px] text-[var(--color-red-hover)] hover:underline disabled:opacity-50"><Send size={12} /> Submit</button> : null },
            ]} />}
          </Async>
        </Panel>
      </div>
      {open && <MonthlyModal employee={employee} tasks={tasks.data || []} onClose={() => setOpen(false)} onSaved={() => { setOpen(false); sheets.reload(); }} />}
    </>
  );
}

const readList = (key) => { try { return JSON.parse(localStorage.getItem(key) || "[]"); } catch { return []; } };
const saveList = (key, list) => { try { localStorage.setItem(key, JSON.stringify(list)); } catch { /* ignore */ } };

/** A whole month in one timesheet: choose your projects, then per day enter hours and the work you did. */
function MonthlyModal({ employee, tasks, onClose, onSaved }) {
  const emp = employee.name;
  const storeKey = `ts-projects:${emp}`;
  const today = isoDate();
  const now = new Date();
  const [ym, setYm] = useState({ y: now.getFullYear(), m: now.getMonth() });
  const [myProjects, setMyProjects] = useState(() => readList(storeKey));
  const [newProject, setNewProject] = useState("");
  const [days, setDays] = useState({}); // iso -> [{ project, hours, task }]
  const [fill, setFill] = useState("8");
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const [info, setInfo] = useState("");
  const fileInput = useRef(null);

  const holidays = useAsync(() => getHolidays(employee), [emp]);
  const known = useAsync(() => frappe.getList("Project", { fields: ["name"], limit: 200 }), []);
  const knownNames = useMemo(() => new Set((known.data || []).map((p) => p.name)), [known.data]);

  const last = new Date(ym.y, ym.m + 1, 0).getDate();
  const from = `${ym.y}-${pad(ym.m + 1)}-01`;
  const to = `${ym.y}-${pad(ym.m + 1)}-${pad(last)}`;

  // Hours already logged in other timesheets this month (ERPNext rejects overlapping entries)
  const existing = useAsync(async () => {
    const sheets = await frappe.getList("Timesheet", { filters: [["employee", "=", emp], ["docstatus", "<", 2], ["end_date", ">=", from], ["start_date", "<=", to]], fields: ["name"], limit: 0 });
    const docs = await Promise.all(sheets.map((x) => frappe.getDoc("Timesheet", x.name)));
    const map = {};
    docs.forEach((d) => (d.time_logs || []).forEach((l) => { const day = String(l.from_time).slice(0, 10); if (day >= from && day <= to) map[day] = (map[day] || 0) + Number(l.hours || 0); }));
    return map;
  }, [emp, from]);

  const holidayMap = useMemo(() => Object.fromEntries((holidays.data?.holidays || []).map((h) => [h.date, h])), [holidays.data]);
  const listHasWeeklyOffs = (holidays.data?.holidays || []).some((h) => h.weeklyOff);
  const defaultProject = myProjects[0] || "";
  const blank = () => ({ project: "", hours: "", task: "" });

  const list = Array.from({ length: last }, (_, i) => {
    const date = `${ym.y}-${pad(ym.m + 1)}-${pad(i + 1)}`;
    const wd = new Date(ym.y, ym.m, i + 1).getDay();
    const h = holidayMap[date];
    // trust the holiday list for weekly offs when it has them, otherwise assume Saturday/Sunday
    const off = Boolean(h) || (!listHasWeeklyOffs && (wd === 0 || wd === 6));
    const logged = existing.data?.[date];
    return { date, wd, off, label: h ? (h.weeklyOff ? "Weekly off" : h.description) : off ? "Weekend" : "", logged, locked: date > today || logged != null };
  });

  const entriesOf = (date) => days[date] || [blank()];
  const patchEntry = (date, i, patch) => setDays((v) => { const arr = [...(v[date] || [blank()])]; arr[i] = { ...arr[i], ...patch }; return { ...v, [date]: arr }; });
  const addEntry = (date) => setDays((v) => ({ ...v, [date]: [...(v[date] || [blank()]), blank()] }));
  const removeEntry = (date, i) => setDays((v) => { const arr = (v[date] || []).filter((_, k) => k !== i); return { ...v, [date]: arr.length ? arr : [blank()] }; });

  const hoursOf = (date) => entriesOf(date).reduce((s, e) => s + (Number(e.hours) || 0), 0);
  const total = list.reduce((s, d) => s + (d.locked ? 0 : hoursOf(d.date)), 0);
  const filled = list.filter((d) => !d.locked && hoursOf(d.date) > 0).length;
  const move = (d) => { const n = new Date(ym.y, ym.m + d, 1); setYm({ y: n.getFullYear(), m: n.getMonth() }); setDays({}); setErr(""); setInfo(""); };

  function addProject(name = newProject) {
    const p = name.trim();
    if (!p || myProjects.some((x) => x.toLowerCase() === p.toLowerCase())) { setNewProject(""); return; }
    const next = [...myProjects, p];
    setMyProjects(next);
    saveList(storeKey, next);
    setNewProject("");
  }
  function removeProject(p) {
    const next = myProjects.filter((x) => x !== p);
    setMyProjects(next);
    saveList(storeKey, next);
  }

  function fillWorking() {
    const hrs = Number(fill);
    if (!(hrs > 0 && hrs <= 24)) return setErr("Enter hours between 0 and 24.");
    setErr("");
    setDays((v) => { const n = { ...v }; list.filter((d) => !d.off && !d.locked).forEach((d) => { n[d.date] = [{ ...(n[d.date]?.[0] || blank()), hours: String(hrs) }]; }); return n; });
  }

  function importCsv(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      let used = 0;
      let skipped = 0;
      const next = {};
      const found = [];
      String(reader.result).split(/\r?\n/).forEach((line) => {
        const [d, h, project = "", ...task] = line.split(",").map((x) => x.trim().replace(/^"|"$/g, ""));
        const m = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(d || "");
        const date = m ? `${m[3]}-${pad(m[2])}-${pad(m[1])}` : /^\d{4}-\d{2}-\d{2}$/.test(d || "") ? d : null;
        const hours = Number(h);
        if (!date || !(hours > 0)) return;
        const row = list.find((x) => x.date === date);
        if (!row || row.locked || hours > 24) { skipped += 1; return; }
        (next[date] = next[date] || []).push({ project, hours: String(hours), task: task.join(", ") });
        if (project) found.push(project);
        used += 1;
      });
      setDays((v) => ({ ...v, ...next }));
      const merged = [...myProjects];
      found.forEach((p) => { if (!merged.some((x) => x.toLowerCase() === p.toLowerCase())) merged.push(p); });
      if (merged.length !== myProjects.length) { setMyProjects(merged); saveList(storeKey, merged); }
      setErr("");
      setInfo(`Imported ${used} entr${used === 1 ? "y" : "ies"}${skipped ? `, skipped ${skipped} (other month, future or already logged)` : ""}.`);
    };
    reader.readAsText(file);
  }

  async function save(submit) {
    setErr("");
    const logs = [];
    for (const d of list.filter((x) => !x.locked)) {
      const entries = entriesOf(d.date).filter((e) => Number(e.hours) > 0);
      const dayTotal = entries.reduce((s, e) => s + Number(e.hours), 0);
      if (dayTotal > 24) return setErr(`${dmy(d.date)} has more than 24 hours.`);
      let offset = dayTotal <= 15 ? 9 : 0; // keep every entry inside its own day
      for (const e of entries) {
        const project = (e.project || defaultProject).trim();
        const hh = Math.floor(offset);
        const mm = Math.round((offset - hh) * 60);
        logs.push({
          from_time: `${d.date} ${pad(hh)}:${pad(mm)}:00`,
          hours: Number(e.hours),
          project: project && knownNames.has(project) ? project : undefined,
          description: [project && `Project: ${project}`, e.task.trim() && `Task: ${e.task.trim()}`].filter(Boolean).join("\n") || undefined,
        });
        offset += Number(e.hours);
      }
    }
    if (!logs.length) return setErr("Enter hours for at least one day.");
    setBusy(submit ? "submit" : "draft");
    try {
      const doc = await frappe.createDoc("Timesheet", { employee: emp, company: employee.company, time_logs: logs });
      if (submit) await frappe.submitDoc(await frappe.getDoc("Timesheet", doc.name));
      onSaved();
    } catch (x) {
      setErr(errMsg(x, "Couldn't save the timesheet."));
      setBusy("");
    }
  }

  const monthLabel = `${MONTHS_LONG[ym.m]} ${ym.y}`;
  const cell = `${inputCls} !py-1`;
  return (
    <Modal title="Monthly timesheet" onClose={onClose} wide="xl">
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => move(-1)} className="rounded p-1.5 text-[var(--color-text-muted)] hover:bg-[var(--color-surface-2)]"><ChevronLeft size={16} /></button>
            <span className="min-w-[8.5rem] text-center text-[14px] font-semibold text-[var(--color-text)]">{monthLabel}</span>
            <button type="button" onClick={() => move(1)} className="rounded p-1.5 text-[var(--color-text-muted)] hover:bg-[var(--color-surface-2)]"><ChevronRight size={16} /></button>
          </div>
          <p className="text-[12px] text-[var(--color-text-muted)]"><b className="text-[var(--color-text)]">{total.toFixed(2)} h</b> over {filled} day(s)</p>
        </div>

        <div>
          <p className="mb-1.5 text-[12px] text-[var(--color-text-muted)]">My projects <span className="text-[var(--color-text-faint)]">- add the projects you work on; they're remembered for next month</span></p>
          <div className="flex flex-wrap items-center gap-2">
            {myProjects.map((p) => <span key={p} className="flex items-center gap-1.5 rounded-full border border-[var(--color-border-strong)] bg-[var(--color-surface-2)] px-2.5 py-1 text-[12px] text-[var(--color-text)]">{p}<button type="button" title="Remove" onClick={() => removeProject(p)} className="text-[var(--color-text-muted)] hover:text-[var(--color-red-hover)]"><X size={12} /></button></span>)}
            <input list="ts-known-projects" value={newProject} onChange={(e) => setNewProject(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addProject(); } }} placeholder="Type a project name…" className={`${cell} !w-56`} />
            <Button type="button" variant="secondary" onClick={() => addProject()} disabled={!newProject.trim()}><Plus size={14} /> Add</Button>
            <datalist id="ts-known-projects">{(known.data || []).map((p) => <option key={p.name} value={p.name} />)}</datalist>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-[12px] text-[var(--color-text-muted)]">
          Fill working days with
          <input type="number" min="0.25" max="24" step="0.25" value={fill} onChange={(e) => setFill(e.target.value)} className={`${cell} !w-20`} /> h
          <Button type="button" variant="secondary" onClick={fillWorking}>Fill</Button>
          <Button type="button" variant="ghost" onClick={() => setDays({})}>Clear</Button>
          <input ref={fileInput} type="file" accept=".csv,text/csv" className="hidden" onChange={importCsv} />
          <Button type="button" variant="secondary" onClick={() => fileInput.current?.click()}><Upload size={14} /> Import CSV</Button>
          <span className="text-[11px] text-[var(--color-text-faint)]">CSV columns: date (dd/mm/yyyy), hours, project, task</span>
        </div>

        <datalist id="ts-tasks">{tasks.map((t) => <option key={t.name} value={t.subject} />)}</datalist>
        <div className="max-h-[42vh] overflow-auto rounded-lg border border-[var(--color-border)]">
          {existing.loading && !existing.data ? <p className="p-4 text-[13px] text-[var(--color-text-muted)]">Checking what you've already logged…</p> : (
            <table className="w-full min-w-[760px] table-fixed text-left text-[12.5px]">
              <colgroup><col className="w-[190px]" /><col className="w-[200px]" /><col className="w-[96px]" /><col /><col className="w-[40px]" /></colgroup>
              <thead className="sticky top-0 z-10 bg-[var(--color-surface)]"><tr className="border-b border-[var(--color-border)] text-[var(--color-text-muted)]"><th className="px-3 py-2 font-medium">Date</th><th className="px-2 py-2 font-medium">Project</th><th className="px-2 py-2 font-medium">Hours</th><th className="px-2 py-2 font-medium">Task / work done</th><th /></tr></thead>
              <tbody>
                {list.map((d) => d.locked ? (
                  <tr key={d.date} className={`border-b border-[var(--color-border)] ${d.off ? "bg-[var(--color-surface-2)]" : ""}`}>
                    <td className="whitespace-nowrap px-3 py-1.5 align-top text-[var(--color-text)]">{dmy(d.date)} <span className="text-[var(--color-text-faint)]">{WEEKDAYS[d.wd]}</span></td>
                    <td colSpan={4} className={`px-2 py-1.5 text-[11px] ${d.logged != null ? "text-[var(--color-amber)]" : "text-[var(--color-text-faint)]"}`}>{d.logged != null ? `Already logged (${Number(d.logged).toFixed(2)} h) in another timesheet` : "Upcoming day"}</td>
                  </tr>
                ) : entriesOf(d.date).map((e, i) => (
                  <tr key={`${d.date}-${i}`} className={`border-b border-[var(--color-border)] ${d.off ? "bg-[var(--color-surface-2)]" : ""}`}>
                    <td className="px-3 py-1 align-top text-[var(--color-text)]">{i === 0 ? <><span className="whitespace-nowrap">{dmy(d.date)} <span className="text-[var(--color-text-faint)]">{WEEKDAYS[d.wd]}</span></span>{d.label && <span className="block truncate text-[10px] text-[var(--color-text-faint)]">{d.label}</span>}</> : null}</td>
                    <td className="px-2 py-1 align-top"><select className={cell} value={e.project || defaultProject} onChange={(ev) => patchEntry(d.date, i, { project: ev.target.value })}>{myProjects.length === 0 && <option value="">Add a project above</option>}{myProjects.map((p) => <option key={p}>{p}</option>)}</select></td>
                    <td className="px-2 py-1 align-top"><input type="number" min="0" max="24" step="0.25" value={e.hours} onChange={(ev) => patchEntry(d.date, i, { hours: ev.target.value })} className={cell} /></td>
                    <td className="px-2 py-1 align-top"><input list="ts-tasks" value={e.task} onChange={(ev) => patchEntry(d.date, i, { task: ev.target.value })} placeholder="What did you do?" className={cell} /></td>
                    <td className="px-1 py-1 align-top">{i === 0 ? <button type="button" title="Add another project / task for this day" onClick={() => addEntry(d.date)} className="rounded p-1 text-[var(--color-text-muted)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text)]"><Plus size={14} /></button> : <button type="button" title="Remove this entry" onClick={() => removeEntry(d.date, i)} className="rounded p-1 text-[var(--color-text-muted)] hover:text-[var(--color-red-hover)]"><X size={14} /></button>}</td>
                  </tr>
                )))}
              </tbody>
            </table>
          )}
        </div>

        {info && <Notice tone="info">{info}</Notice>}
        {err && <Notice>{err}</Notice>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="button" variant="secondary" disabled={Boolean(busy)} onClick={() => save(false)}>{busy === "draft" ? "Saving…" : "Save as draft"}</Button>
          <Button type="button" disabled={Boolean(busy)} onClick={() => { if (window.confirm(`Submit ${monthLabel} (${total.toFixed(2)} h)? You won't be able to edit it afterwards.`)) save(true); }}>{busy === "submit" ? "Submitting…" : "Save & submit"}</Button>
        </div>
      </div>
    </Modal>
  );
}

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
}