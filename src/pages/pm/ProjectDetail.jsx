// One project from start to finish: its stage on the Planning → Closed path, who manages it, its dates, the team
// (now and before), and a timeline of every change - stage moves with notes, new dates, manager handovers, progress,
// and people joining or leaving. Managers move the stage and add notes; HR / the Administrator can also hand the
// project to a new manager (e.g. when the current one leaves); only the Administrator ends it.
import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, ArrowRight, Briefcase, CalendarClock, CalendarRange, Check, CircleDot, Flag, Gauge, History, MessageSquare, PauseCircle, Pencil, Plus, UserCog, UserMinus, UserPlus, Users, XCircle } from "lucide-react";
import { frappe } from "../../lib/api/frappeClient";
import { useAuth } from "../../context/AuthContext";
import { hasPermission } from "../../permissions/roles";
import { Button, DateField } from "../../components/ui/primitives";
import { Async, Empty, Field, inputCls, Modal, Notice, Panel, StatusPill } from "../../components/employee/EmployeeShell";
import { daysUntil, dmy, dmyHm, errMsg, isoDate, listTry, useAsync } from "../../lib/employeePortal";
import { listAssignments, parseAssignment } from "../../lib/assignments";
import { managerOf, setProjectManager } from "../../lib/projectRoles";
import { endProject, previewEndProject } from "../../lib/contractors";
import { addProjectNote, ENDING_STAGES, isMonday, loadProjectTimeline, MONDAY_START, mondayFrom, PROJECT_STAGES, setProjectDates, setStage, STAGE_PATH, STAGE_TONE, stageOf } from "../../lib/projectLifecycle";
import { TeamMemberSearch } from "../../components/TeamMemberSearch";
import { confirmDialog } from "../../components/ui/dialogs";

const ACTIVE = ["Open", "Working", "Pending Review", "Overdue"];
const label = (p) => (p.project_name && p.project_name !== p.name ? p.project_name : p.name);

export function StagePill({ stage }) {
  const tone = STAGE_TONE[stage] || "var(--color-text-muted)";
  return <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold" style={{ background: `color-mix(in srgb, ${tone} 15%, transparent)`, color: tone }}><span className="h-1.5 w-1.5 rounded-full" style={{ background: tone }} />{stage}</span>;
}

export default function ProjectDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const seesAll = hasPermission(user, "dashboard.admin") || hasPermission(user, "dashboard.hr");
  const isAdmin = seesAll; // HR and the Administrator may end projects and close stages
  const project = useAsync(() => frappe.getDoc("Project", id), [id]);
  const employees = useAsync(() => listTry("Employee", { fields: ["name", "employee_name", "user_id", "designation", "department", "status", "image"], orderBy: "employee_name asc" }, ["name", "employee_name", "user_id", "status"]), []);
  const tasks = useAsync(listAssignments, []);
  const byUser = useMemo(() => Object.fromEntries((employees.data || []).filter((e) => e.user_id).map((e) => [e.user_id, e])), [employees.data]);
  const nameOf = (email) => byUser[email]?.employee_name || email;
  const team = useMemo(() => (tasks.data || []).map(parseAssignment).filter((a) => a.project === id).map((a) => ({ ...a, employee: byUser[a.assignees[0]] })), [tasks.data, id, byUser]);
  const timeline = useAsync(() => (tasks.data && employees.data ? loadProjectTimeline(id, team, nameOf) : Promise.resolve(null)), [id, tasks.data, employees.data]);
  const [modal, setModal] = useState(null);
  const [msg, setMsg] = useState(null);
  const reload = (text) => { if (text) setMsg({ ok: true, text }); project.reload(); timeline.reload(); };

  return (
    <div className="space-y-5">
      <Link to="/pm/projects" className="inline-flex items-center gap-1.5 text-[12.5px] text-[var(--color-text-muted)] hover:text-[var(--color-text)]"><ArrowLeft size={14} /> All Projects</Link>
      <Async state={project}>
        {(p) => {
          const stage = stageOf(p);
          const manager = managerOf(p);
          const canManage = seesAll || manager === user.email;
          const ended = ENDING_STAGES.includes(stage);
          const today = isoDate();
          const current = team.filter((a) => ACTIVE.includes(a.status));
          const past = team.filter((a) => !ACTIVE.includes(a.status));
          const left = p.expected_end_date ? daysUntil(p.expected_end_date) : null;
          const managerGone = manager && byUser[manager] && byUser[manager].status !== "Active";
          return (
            <>
              <section className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-[var(--color-red-wash)] text-[var(--color-red-hover)]"><Briefcase size={19} /></span>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2"><h2 className="text-[17px] font-semibold text-[var(--color-text)]">{label(p)}</h2><StagePill stage={stage} /></div>
                      <p className="mt-0.5 text-[12.5px] text-[var(--color-text-muted)]">{[p.name !== label(p) && p.name, p.company].filter(Boolean).join(" · ")}</p>
                    </div>
                  </div>
                  {canManage && (
                    <div className="flex flex-wrap gap-2">
                      <Button variant="secondary" onClick={() => setModal({ kind: "note" })}><MessageSquare size={14} /> Add Note</Button>
                      {!ended && <Button variant="secondary" onClick={() => setModal({ kind: "dates" })}><CalendarRange size={14} /> Change Dates</Button>}
                      {seesAll && !ended && <Button variant="secondary" onClick={() => setModal({ kind: "manager" })}><UserCog size={14} /> Change Manager</Button>}
                      {!ended && <Button onClick={() => setModal({ kind: "stage" })}><ArrowRight size={14} /> Move Stage</Button>}
                    </div>
                  )}
                </div>
                {msg && <div className="mt-4"><Notice tone={msg.ok ? "info" : "error"}>{msg.text}</Notice></div>}
                {managerGone && <div className="mt-4"><Notice>{nameOf(manager)} is no longer active. {seesAll ? "Hand this project to a new manager with Change Manager." : "Ask HR to hand it to a new manager."}</Notice></div>}
                <StageStepper stage={stage} />
                <div className="mt-5 grid grid-cols-2 gap-3 border-t border-[var(--color-border)] pt-4 md:grid-cols-5">
                  <Fact label="Project Manager" value={manager ? nameOf(manager) : "—"} />
                  <Fact label="Start" value={dmy(p.expected_start_date) || "—"} />
                  <Fact label="ETA" value={dmy(p.expected_end_date) || "—"} sub={left == null || ended ? "" : left < 0 ? `${-left} day(s) overdue` : left === 0 ? "Due today" : `${left} day(s) left`} warn={left != null && left < 0 && !ended} />
                  <Fact label="Team" value={`${new Set(current.flatMap((a) => a.assignees)).size} active`} sub={past.length ? `${past.length} past assignment(s)` : ""} />
                  <div>
                    <div className="text-[10.5px] uppercase tracking-wide text-[var(--color-text-faint)]">Progress</div>
                    <div className="mt-1.5 flex items-center gap-2"><div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[var(--color-surface-2)]"><div className="h-full rounded-full bg-[var(--color-green)]" style={{ width: `${Math.min(100, Math.round(Number(p.percent_complete) || 0))}%` }} /></div><span className="text-[12.5px] font-semibold text-[var(--color-text)]">{Math.round(Number(p.percent_complete) || 0)}%</span></div>
                  </div>
                </div>
              </section>

              <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
                <Panel title="Project Timeline" hint="Every stage move, date change, manager handover, note and team change, newest first" className="xl:col-span-2">
                  <Async state={timeline}>{(events) => (events ? <Timeline events={events} /> : null)}</Async>
                </Panel>
                <div className="space-y-5">
                  <Panel title="Current Team" action={canManage && !ended ? <Link to={`/pm/assignments?assign=${encodeURIComponent(p.name)}`} className="flex items-center gap-1 text-[12px] text-[var(--color-red-hover)] hover:underline"><Plus size={12} /> Assign</Link> : null}>
                    <Async state={tasks}>{() => (current.length === 0 ? <Empty icon={Users} text="No one is assigned right now." /> : <TeamList rows={current} today={today} nameOf={nameOf} />)}</Async>
                  </Panel>
                  {past.length > 0 && <Panel title="Past Team"><TeamList rows={past} today={today} nameOf={nameOf} /></Panel>}
                </div>
              </div>

              {modal?.kind === "stage" && <StageModal p={p} stage={stage} isAdmin={isAdmin} onClose={() => setModal(null)} onSaved={(t) => { setModal(null); reload(t); }} />}
              {modal?.kind === "note" && <NoteModal p={p} onClose={() => setModal(null)} onSaved={(t) => { setModal(null); reload(t); }} />}
              {modal?.kind === "dates" && <DatesModal p={p} onClose={() => setModal(null)} onSaved={(t) => { setModal(null); reload(t); }} />}
              {modal?.kind === "manager" && <ManagerModal p={p} current={manager} people={(employees.data || []).filter((e) => e.user_id && e.status === "Active")} team={team} nameOf={nameOf} onClose={() => setModal(null)} onSaved={(t) => { setModal(null); reload(t); }} />}
            </>
          );
        }}
      </Async>
    </div>
  );
}

function Fact({ label: l, value, sub, warn }) {
  return (
    <div className="min-w-0">
      <div className="text-[10.5px] uppercase tracking-wide text-[var(--color-text-faint)]">{l}</div>
      <div className="mt-0.5 truncate text-[13px] font-medium text-[var(--color-text)]">{value}</div>
      {sub && <div className={`text-[11px] ${warn ? "text-[var(--color-red-hover)]" : "text-[var(--color-text-faint)]"}`}>{sub}</div>}
    </div>
  );
}

/** Planning → In Progress → Testing → Delivered → Closed, with On Hold / Cancelled shown on the step they left. */
function StageStepper({ stage }) {
  const side = !STAGE_PATH.includes(stage);
  const at = side ? -1 : STAGE_PATH.indexOf(stage);
  return (
    <div className="mt-5">
      <ol className="flex items-center">
        {STAGE_PATH.map((s, i) => {
          const done = i < at;
          const now = i === at;
          return (
            <li key={s} className="flex flex-1 items-center last:flex-none">
              <div className="flex flex-col items-center gap-1.5">
                <span className={`flex h-7 w-7 items-center justify-center rounded-full border-2 text-[11px] font-semibold ${done ? "border-[var(--color-green)] bg-[var(--color-green)] text-white" : now ? "border-[var(--color-red)] bg-[var(--color-red-wash)] text-[var(--color-red-hover)]" : "border-[var(--color-border-strong)] text-[var(--color-text-faint)]"}`}>{done ? <Check size={13} strokeWidth={3} /> : i + 1}</span>
                <span className={`whitespace-nowrap text-[11.5px] ${now ? "font-semibold text-[var(--color-text)]" : "text-[var(--color-text-muted)]"}`}>{s}</span>
              </div>
              {i < STAGE_PATH.length - 1 && <span className={`mx-2 mb-5 h-0.5 flex-1 rounded ${done ? "bg-[var(--color-green)]" : "bg-[var(--color-border)]"}`} />}
            </li>
          );
        })}
      </ol>
      {side && <p className="mt-3 flex items-center gap-1.5 text-[12px]" style={{ color: STAGE_TONE[stage] }}>{stage === "On Hold" ? <PauseCircle size={14} /> : <XCircle size={14} />} This project is {stage.toLowerCase()}.</p>}
    </div>
  );
}

const EVENT = {
  created: { icon: Flag, tone: "var(--color-green)" },
  stage: { icon: CircleDot, tone: "#2563eb" },
  status: { icon: CircleDot, tone: "var(--color-text-muted)" },
  dates: { icon: CalendarClock, tone: "var(--color-amber)" },
  manager: { icon: UserCog, tone: "var(--color-red-hover)" },
  progress: { icon: Gauge, tone: "var(--color-green)" },
  note: { icon: MessageSquare, tone: "var(--color-text-muted)" },
  joined: { icon: UserPlus, tone: "var(--color-green)" },
  left: { icon: UserMinus, tone: "var(--color-text-muted)" },
  other: { icon: Pencil, tone: "var(--color-text-muted)" },
};

function Timeline({ events }) {
  if (!events.length) return <Empty icon={History} text="Nothing recorded yet." />;
  return (
    <ol className="relative">
      {events.map((ev, i) => {
        const k = EVENT[ev.kind] || EVENT.other;
        const tone = ev.kind === "stage" ? STAGE_TONE[ev.to] || k.tone : k.tone;
        const hasTime = String(ev.at || "").length > 10;
        return (
          <li key={ev.key} className="relative flex gap-3.5 pb-5 last:pb-0">
            {i < events.length - 1 && <span className="absolute bottom-0 left-[15px] top-8 w-px bg-[var(--color-border)]" />}
            <span className="relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 bg-[var(--color-surface)]" style={{ borderColor: tone, color: tone }}><k.icon size={14} /></span>
            <div className="min-w-0 flex-1 pt-0.5">
              <div className="flex flex-wrap items-baseline gap-x-2">
                <span className="text-[13px] font-semibold text-[var(--color-text)]">{ev.title}</span>
                {ev.kind === "stage" && ev.from && <span className="flex items-center gap-1.5"><StagePill stage={ev.from} /><ArrowRight size={12} className="text-[var(--color-text-faint)]" /><StagePill stage={ev.to} /></span>}
                <span className="ml-auto text-[11px] text-[var(--color-text-faint)]">{hasTime ? dmyHm(ev.at) : dmy(ev.at)}{ev.by ? ` · ${ev.by}` : ""}</span>
              </div>
              {ev.sub && <p className="mt-0.5 text-[12px] text-[var(--color-text-muted)]">{ev.sub}</p>}
              {ev.changes && (
                <ul className="mt-1.5 space-y-0.5 text-[12.5px]">
                  {ev.changes.map((c) => <li key={c.label} className="flex flex-wrap items-center gap-1.5"><span className="text-[11px] uppercase tracking-wide text-[var(--color-text-faint)]">{c.label}</span><span className="text-[var(--color-text-muted)]">{c.from || "Not set"}</span><ArrowRight size={11} className="text-[var(--color-text-faint)]" /><span className="font-medium text-[var(--color-text)]">{c.to || "Not set"}</span></li>)}
                </ul>
              )}
              {ev.note && <p className="mt-1.5 rounded-md bg-[var(--color-surface-2)] px-3 py-2 text-[12.5px] text-[var(--color-text)]">{ev.note}</p>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function TeamList({ rows, today, nameOf }) {
  return (
    <ul className="divide-y divide-[var(--color-border)]">
      {rows.map((a) => (
        <li key={a.name} className="flex items-start justify-between gap-3 py-2.5">
          <div className="min-w-0">
            <div className="truncate text-[12.5px] font-medium text-[var(--color-text)]">{a.employee?.employee_name || nameOf(a.assignees[0]) || "—"}</div>
            <div className="text-[11.5px] text-[var(--color-text-muted)]">{a.role} · {a.hoursPerDay} h/day</div>
          </div>
          <div className="shrink-0 text-right text-[11px] text-[var(--color-text-faint)]">
            <div>{dmy(a.start)} – {dmy(a.end || a.eta)}</div>
            {ACTIVE.includes(a.status) ? (a.eta < today ? <span className="text-[var(--color-red-hover)]">Past ETA</span> : null) : <StatusPill status={a.status} />}
          </div>
        </li>
      ))}
    </ul>
  );
}

function StageModal({ p, stage, isAdmin, onClose, onSaved }) {
  const next = STAGE_PATH[STAGE_PATH.indexOf(stage) + 1];
  const [to, setTo] = useState(next && !ENDING_STAGES.includes(next) ? next : PROJECT_STAGES.find((s) => s !== stage && !ENDING_STAGES.includes(s)));
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const ending = ENDING_STAGES.includes(to);
  const needsNote = to === "On Hold" || to === "Cancelled";

  async function submit(e) {
    e.preventDefault();
    if (needsNote && !note.trim()) return setErr(`Say why the project is ${to === "On Hold" ? "on hold" : "cancelled"}.`);
    setBusy(true);
    setErr("");
    try {
      if (ending) {
        // Ending removes contractors who only work here - show who, the same as End Project.
        const { remove, kept } = await previewEndProject(p.name);
        const lines = [`Mark ${label(p)} as ${to}? The project is ended.`];
        if (remove.length) lines.push(`\nThese contractors' logins and details are deleted permanently:\n${remove.map((c) => `• ${c.name}`).join("\n")}`);
        if (kept.length) lines.push(`\nStaying because they work on another live project: ${kept.map((c) => c.name).join(", ")}.`);
        if (!(await confirmDialog({ title: `${to === "Closed" ? "Close" : "Cancel"} Project`, message: lines.join("\n"), danger: true, confirmLabel: to === "Closed" ? "Close Project" : "Cancel Project" }))) { setBusy(false); return; }
        await endProject(p.name);
      }
      await setStage(p.name, stage, to, note);
      onSaved(`${label(p)} moved to ${to}.`);
    } catch (x) {
      setErr(errMsg(x, "Couldn't change the stage."));
      setBusy(false);
    }
  }

  return (
    <Modal title={`Move Stage · ${label(p)}`} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <div className="flex items-center gap-2 text-[12.5px] text-[var(--color-text-muted)]">Now <StagePill stage={stage} /></div>
        <div className="grid grid-cols-2 gap-2">
          {PROJECT_STAGES.filter((s) => s !== stage).map((s) => {
            const locked = ENDING_STAGES.includes(s) && !isAdmin;
            return (
              <button key={s} type="button" disabled={locked} title={locked ? "Only the Administrator ends a project" : undefined} onClick={() => setTo(s)} className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-left text-[12.5px] transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${to === s ? "border-[var(--color-red)] bg-[var(--color-red-wash)] text-[var(--color-text)]" : "border-[var(--color-border)] text-[var(--color-text-muted)] hover:text-[var(--color-text)]"}`}>
                <span className="h-2 w-2 rounded-full" style={{ background: STAGE_TONE[s] }} />{s}
              </button>
            );
          })}
        </div>
        <Field label={needsNote ? "Reason" : "Note (Optional)"} hint="Shown on the project timeline"><textarea rows={3} className={inputCls} value={note} onChange={(e) => setNote(e.target.value)} placeholder={to === "On Hold" ? "e.g. Waiting for client sign-off" : to === "Testing" ? "e.g. Build 1.2 handed to QA" : ""} /></Field>
        {ending && <Notice tone="info">{to === "Closed" ? "Closing" : "Cancelling"} ends the project: it no longer takes timesheets, and contractors who only work on it lose their login.</Notice>}
        {err && <Notice>{err}</Notice>}
        <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={onClose}>Cancel</Button><Button type="submit" disabled={busy || !to}>{busy ? "Saving…" : `Move to ${to}`}</Button></div>
      </form>
    </Modal>
  );
}

function NoteModal({ p, onClose, onSaved }) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    try {
      await addProjectNote(p.name, note);
      onSaved("Note added to the timeline.");
    } catch (x) {
      setErr(errMsg(x, "Couldn't add the note."));
      setBusy(false);
    }
  }
  return (
    <Modal title={`Add Note · ${label(p)}`} onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <Field label="Note"><textarea required rows={4} className={inputCls} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Client approved the design" /></Field>
        {err && <Notice>{err}</Notice>}
        <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={onClose}>Cancel</Button><Button type="submit" disabled={busy}>{busy ? "Saving…" : "Add Note"}</Button></div>
      </form>
    </Modal>
  );
}

function DatesModal({ p, onClose, onSaved }) {
  const [f, setF] = useState({ start: p.expected_start_date || "", end: p.expected_end_date || "", reason: "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  async function submit(e) {
    e.preventDefault();
    // A changed start date must be a Monday (older projects keep theirs while only the ETA changes).
    if (f.start && f.start !== (p.expected_start_date || "") && !isMonday(f.start)) return setErr(`${MONDAY_START} The nearest is ${dmy(mondayFrom(f.start))}.`);
    if (f.start && f.end && f.end < f.start) return setErr("The ETA can't be before the start date.");
    setBusy(true);
    try {
      await setProjectDates(p.name, f, f.reason);
      onSaved("Dates updated.");
    } catch (x) {
      setErr(errMsg(x, "Couldn't change the dates."));
      setBusy(false);
    }
  }
  return (
    <Modal title={`Change Dates · ${label(p)}`} onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div><DateField label="Start (Monday)" value={f.start} onChange={(v) => setF({ ...f, start: v })} />{f.start && f.start !== (p.expected_start_date || "") && !isMonday(f.start) && <p className="mt-1 text-[11px] font-medium text-[var(--color-red-hover)]">Not a Monday</p>}</div>
          <DateField label="ETA (End)" value={f.end} onChange={(v) => setF({ ...f, end: v })} />
        </div>
        <Field label="Reason" hint="Shown on the project timeline"><input required className={inputCls} value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} placeholder="e.g. Scope extended by the client" /></Field>
        {err && <Notice>{err}</Notice>}
        <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={onClose}>Cancel</Button><Button type="submit" disabled={busy}>{busy ? "Saving…" : "Save Dates"}</Button></div>
      </form>
    </Modal>
  );
}

/** Hand the project to another manager (HR / Administrator), e.g. when the current one leaves. */
export function ManagerModal({ p, current, people, team, nameOf, onClose, onSaved }) {
  const [email, setEmail] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  async function submit(e) {
    e.preventDefault();
    if (!email) return setErr("Choose the new project manager.");
    if (email === current) return setErr("They already manage this project.");
    setBusy(true);
    try {
      await setProjectManager(p.name, email);
      if (reason.trim()) await addProjectNote(p.name, `Manager handover to ${nameOf(email)}: ${reason.trim()}`).catch(() => {});
      onSaved(`${nameOf(email)} now manages ${label(p)}.`);
    } catch (x) {
      setErr(errMsg(x, "Couldn't change the manager."));
      setBusy(false);
    }
  }
  return (
    <Modal title={`Change Manager · ${label(p)}`} onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <p className="text-[12.5px] text-[var(--color-text-muted)]">Currently managed by <b className="text-[var(--color-text)]">{current ? nameOf(current) : "no one"}</b>. The new manager gets this project in their workspace and approves its timesheets from now on.</p>
        <Field label="New Project Manager"><TeamMemberSearch people={people} assignments={team} value={email} onChange={setEmail} /></Field>
        <Field label="Reason (Optional)" hint="Shown on the project timeline"><input className={inputCls} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Previous manager left the company" /></Field>
        {err && <Notice>{err}</Notice>}
        <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={onClose}>Cancel</Button><Button type="submit" disabled={busy}>{busy ? "Saving…" : "Change Manager"}</Button></div>
      </form>
    </Modal>
  );
}

