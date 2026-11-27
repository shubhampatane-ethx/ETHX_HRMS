// HR › Hierarchy (HR and the Administrator): the reporting tree (Employee.reports_to), who covers each manager's
// approvals today, and what needs fixing - people who left but still hold a team, approvals or projects, people
// reporting to someone who has left, and loops in the chain.
//
// Cover follows the same order as the server rules (lib/approvalSetup.js): the business unit / expense type approver,
// the approver on the Employee record, then the reporting manager and on up the chain - skipping anyone on approved
// leave today or no longer active.
import { useMemo, useState } from "react";
import { AlertTriangle, ChevronDown, ChevronRight, ChevronsDownUp, ChevronsUpDown, Network, Search, UserMinus, Users, UserX, Workflow } from "lucide-react";
import { frappe } from "../../lib/api/frappeClient";
import { Button } from "../../components/ui/primitives";
import { Async, Empty, inputCls, Notice, PageHeader, Panel, Stat, Tabs } from "../../components/employee/EmployeeShell";
import { dmy, errMsg, isoDate, listTry, useAsync } from "../../lib/employeePortal";
import { confirmDialog } from "../../components/ui/dialogs";
import { HandoverModal } from "../../components/Handover";

const EMP_FIELDS = ["name", "employee_name", "designation", "department", "reports_to", "status", "user_id", "leave_approver", "expense_approver", "image", "company"];
const EMP_BASIC = ["name", "employee_name", "designation", "department", "reports_to", "status", "user_id"];

async function loadHierarchy() {
  const today = isoDate();
  const [employees, leaves, projects] = await Promise.all([
    listTry("Employee", { fields: EMP_FIELDS, orderBy: "employee_name asc" }, EMP_BASIC),
    frappe.getList("Leave Application", { filters: [["status", "=", "Approved"], ["docstatus", "=", 1], ["from_date", "<=", today], ["to_date", ">=", today]], fields: ["employee", "to_date"], limit: 0 }).catch(() => []),
    listTry("Project", { filters: [["status", "=", "Open"]], fields: ["name", "project_name", "custom_project_manager"] }).catch(() => []),
  ]);
  const byId = Object.fromEntries(employees.map((e) => [e.name, e]));
  const byUser = Object.fromEntries(employees.filter((e) => e.user_id).map((e) => [e.user_id, e]));
  const away = Object.fromEntries(leaves.map((l) => [l.employee, l.to_date]));
  const kids = {};
  employees.forEach((e) => { if (e.reports_to && byId[e.reports_to]) (kids[e.reports_to] ||= []).push(e); });
  return { employees, byId, byUser, away, kids, projects };
}

const active = (e) => e && e.status === "Active";
const initials = (n) => String(n || "?").trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();

/** The chain above someone, stopping at a loop. */
function chain(d, e) {
  const out = [];
  const seen = new Set([e.name]);
  let cur = d.byId[e.reports_to];
  while (cur && !seen.has(cur.name)) {
    out.push(cur);
    seen.add(cur.name);
    cur = d.byId[cur.reports_to];
  }
  return { up: out, loop: Boolean(cur) };
}

/**
 * Top-level people: active and without an active manager. Anyone not reachable from them (a reporting loop) is added
 * too, one per loop, so nobody is missing from the chart.
 */
function topOf(d) {
  const roots = d.employees.filter((e) => active(e) && !active(d.byId[e.reports_to]));
  const reached = new Set();
  const walk = (e) => { if (reached.has(e.name)) return; reached.add(e.name); (d.kids[e.name] || []).filter(active).forEach(walk); };
  roots.forEach(walk);
  for (const e of d.employees) if (active(e) && !reached.has(e.name)) { roots.push(e); walk(e); }
  return roots;
}

/** The first manager above someone who is active and not on leave today. */
const coverFor = (d, e) => chain(d, e).up.find((m) => active(m) && !d.away[m.name]) || null;

/** Everything that needs HR's attention. */
function findIssues(d) {
  const issues = [];
  const holds = (e) => {
    const reports = (d.kids[e.name] || []).filter(active);
    const approverOf = e.user_id ? d.employees.filter((x) => active(x) && (x.leave_approver === e.user_id || x.expense_approver === e.user_id)) : [];
    const projects = e.user_id ? d.projects.filter((p) => p.custom_project_manager === e.user_id) : [];
    return { reports, approverOf, projects };
  };
  for (const e of d.employees) {
    if (active(e)) continue;
    const h = holds(e);
    if (h.reports.length || h.approverOf.length || h.projects.length) issues.push({ key: `gone-${e.name}`, kind: "gone", emp: e, ...h });
  }
  const loops = new Set();
  for (const e of d.employees.filter(active)) {
    const c = chain(d, e);
    if (c.loop && !loops.has(e.name)) {
      const ring = [e, ...c.up];
      ring.forEach((x) => loops.add(x.name));
      issues.push({ key: `loop-${e.name}`, kind: "loop", emp: e, ring });
    }
    if (e.reports_to && !d.byId[e.reports_to]) issues.push({ key: `missing-${e.name}`, kind: "missing", emp: e });
  }
  return issues;
}

export default function Hierarchy() {
  const data = useAsync(loadHierarchy, []);
  const [tab, setTab] = useState("chart");
  const [handover, setHandover] = useState(null);
  const [msg, setMsg] = useState(null);
  const d = data.data;
  const issues = useMemo(() => (d ? findIssues(d) : []), [d]);
  const managers = d ? Object.keys(d.kids).filter((id) => active(d.byId[id]) && d.kids[id].some(active)) : [];
  const managersAway = d ? managers.filter((id) => d.away[id]) : [];

  return (
    <div className="space-y-5">
      <PageHeader icon={Network} title="Hierarchy" subtitle="Who reports to whom, and who takes over approvals and assignments when someone is away or leaves" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat icon={Users} label="Active Employees" value={d ? d.employees.filter(active).length : null} sub="In the hierarchy" />
        <Stat icon={Workflow} label="Managers" value={d ? managers.length : null} sub="With at least one direct report" accent="#2563eb" />
        <Stat icon={UserMinus} label="Managers Away Today" value={d ? managersAway.length : null} sub="Their approvals go one level up" accent="var(--color-amber)" />
        <Stat icon={AlertTriangle} label="Needs Attention" value={d ? issues.length : null} sub="Gaps left by people who left" accent="var(--color-red-hover)" />
      </div>
      {msg && <Notice tone={msg.ok ? "info" : "error"}>{msg.text}</Notice>}
      <Tabs value={tab} onChange={setTab} tabs={[{ id: "chart", label: "Org Chart" }, { id: "attention", label: "Needs Attention", count: d ? issues.length : undefined }, { id: "away", label: "Away Today", count: d ? managersAway.length : undefined }, { id: "rules", label: "How Cover Works" }]} />
      <Async state={data}>
        {(v) => (
          <>
            {tab === "chart" && <OrgChart d={v} onHandover={setHandover} />}
            {tab === "attention" && <Attention d={v} issues={issues} onHandover={setHandover} onFixed={(text) => { setMsg({ ok: true, text }); data.reload(); }} onError={(text) => setMsg({ ok: false, text })} />}
            {tab === "away" && <AwayToday d={v} ids={managersAway} />}
            {tab === "rules" && <Rules />}
          </>
        )}
      </Async>
      {handover && d && <HandoverModal emp={handover} people={d.employees} onClose={() => setHandover(null)} onDone={(text, ok) => { setHandover(null); setMsg({ ok, text }); data.reload(); }} />}
    </div>
  );
}

/* --------------------------------- org chart --------------------------------- */

function OrgChart({ d, onHandover }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(() => new Set());
  const [all, setAll] = useState(true);
  const roots = useMemo(() => topOf(d), [d]);
  const needle = q.trim().toLowerCase();
  const hit = (e) => needle && [e.employee_name, e.name, e.designation, e.department].some((x) => String(x || "").toLowerCase().includes(needle));
  // When searching, open the path to every match.
  const forced = useMemo(() => {
    const s = new Set();
    if (!needle) return s;
    d.employees.filter((e) => active(e) && hit(e)).forEach((e) => chain(d, e).up.forEach((m) => s.add(m.name)));
    return s;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [needle, d]);
  const isOpen = (id) => forced.has(id) || (all ? !open.has(id) : open.has(id));
  const toggle = (id) => setOpen((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const matches = needle ? d.employees.filter((e) => active(e) && hit(e)).length : null;

  return (
    <Panel title="Reporting Structure" hint="Built from each employee's Reports To. Badges show who is away today and who covers for them." action={
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative"><Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--color-text-faint)]" /><input className={`${inputCls} w-56 pl-8`} placeholder="Find a person…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <Button variant="secondary" onClick={() => { setAll(!all); setOpen(new Set()); }}>{all ? <><ChevronsDownUp size={14} /> Collapse All</> : <><ChevronsUpDown size={14} /> Expand All</>}</Button>
      </div>
    }>
      {matches != null && <p className="mb-3 text-[12px] text-[var(--color-text-muted)]">{matches} match{matches === 1 ? "" : "es"}</p>}
      {roots.length === 0 ? <Empty icon={Network} text="No reporting lines set up yet. Set Reports To on each employee." /> : (
        <ul className="space-y-1">
          {roots.map((e) => <Node key={e.name} d={d} e={e} depth={0} isOpen={isOpen} toggle={toggle} hit={hit} onHandover={onHandover} seen={new Set()} />)}
        </ul>
      )}
    </Panel>
  );
}

function Node({ d, e, depth, isOpen, toggle, hit, onHandover, seen }) {
  if (seen.has(e.name)) return null;
  const nextSeen = new Set(seen).add(e.name);
  const team = (d.kids[e.name] || []).filter(active);
  const open = team.length > 0 && isOpen(e.name);
  const awayTill = d.away[e.name];
  const cover = awayTill ? coverFor(d, e) : null;
  const approver = (email) => (email ? d.byUser[email]?.employee_name || email : "");
  const leaveBy = approver(e.leave_approver);
  const approverGone = [e.leave_approver, e.expense_approver].some((u) => u && d.byUser[u] && !active(d.byUser[u]));
  return (
    <li>
      <div className={`group flex items-center gap-2 rounded-lg border px-2.5 py-2 transition-colors ${hit(e) ? "border-[var(--color-red)] bg-[var(--color-red-wash)]" : "border-transparent hover:border-[var(--color-border)] hover:bg-[var(--color-surface-2)]"}`} style={{ marginLeft: depth * 26 }}>
        <button type="button" onClick={() => team.length && toggle(e.name)} className={`flex h-5 w-5 shrink-0 items-center justify-center rounded text-[var(--color-text-muted)] ${team.length ? "hover:bg-[var(--color-border)]" : "invisible"}`} aria-label={open ? "Collapse" : "Expand"}>{open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</button>
        <span className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[var(--color-red-wash)] text-[11px] font-semibold text-[var(--color-red-hover)]">{e.image ? <img src={e.image} alt="" className="h-full w-full object-cover" /> : initials(e.employee_name)}</span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <span className="text-[13px] font-medium text-[var(--color-text)]">{e.employee_name}</span>
            <span className="text-[11.5px] text-[var(--color-text-muted)]">{[e.designation, e.department].filter(Boolean).join(" · ")}</span>
            {awayTill && <span className="rounded-full bg-[color-mix(in_srgb,var(--color-amber)_16%,transparent)] px-2 py-0.5 text-[10.5px] font-semibold text-[var(--color-amber)]">On Leave · covered by {cover?.employee_name || "no one available"}</span>}
            {e.reports_to && d.byId[e.reports_to] && !active(d.byId[e.reports_to]) && <span className="rounded-full bg-[color-mix(in_srgb,var(--color-red-hover)_14%,transparent)] px-2 py-0.5 text-[10.5px] font-semibold text-[var(--color-red-hover)]">Manager {d.byId[e.reports_to].employee_name} has left</span>}
            {approverGone && <span className="rounded-full bg-[color-mix(in_srgb,var(--color-red-hover)_14%,transparent)] px-2 py-0.5 text-[10.5px] font-semibold text-[var(--color-red-hover)]">Approver has left</span>}
          </div>
          {leaveBy && <div className="text-[11px] text-[var(--color-text-faint)]">Leave approved by {leaveBy}</div>}
        </div>
        {team.length > 0 && <span className="shrink-0 rounded-full bg-[var(--color-surface-2)] px-2 py-0.5 text-[11px] text-[var(--color-text-muted)]" title="Direct reports">{team.length} report{team.length === 1 ? "" : "s"}</span>}
        <button type="button" onClick={() => onHandover(e)} className="shrink-0 rounded-md px-2 py-1 text-[11.5px] text-[var(--color-text-muted)] opacity-0 transition-opacity hover:bg-[var(--color-border)] hover:text-[var(--color-text)] group-hover:opacity-100 focus:opacity-100">Hand Over</button>
      </div>
      {open && (
        <ul className="mt-1 space-y-1 border-l border-dashed border-[var(--color-border)]" style={{ marginLeft: depth * 26 + 19 }}>
          {team.map((k) => <Node key={k.name} d={d} e={k} depth={0} isOpen={isOpen} toggle={toggle} hit={hit} onHandover={onHandover} seen={nextSeen} />)}
        </ul>
      )}
    </li>
  );
}

/* ------------------------------ needs attention ------------------------------ */

function Attention({ d, issues, onHandover, onFixed, onError }) {
  const [busy, setBusy] = useState("");
  async function moveUp(e) {
    const cover = coverFor(d, e);
    if (!(await confirmDialog({ title: "Fix Reporting Line", message: cover ? `${e.employee_name} will report to ${cover.employee_name}.` : `${e.employee_name}'s Reports To will be cleared.`, confirmLabel: "Fix" }))) return;
    setBusy(e.name);
    try {
      await frappe.updateDoc("Employee", e.name, { reports_to: cover?.name || null });
      onFixed(`${e.employee_name} now reports to ${cover?.employee_name || "no one"}.`);
    } catch (x) {
      onError(errMsg(x, "Couldn't change the reporting line."));
    }
    setBusy("");
  }
  if (!issues.length) return <Panel><Empty icon={Network} text="Nothing needs attention. Everyone's manager, approvers and projects are with active people." /></Panel>;
  return (
    <div className="space-y-3">
      {issues.map((it) => (
        <section key={it.key} className="flex flex-wrap items-start gap-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[color-mix(in_srgb,var(--color-red-hover)_12%,transparent)] text-[var(--color-red-hover)]">{it.kind === "gone" ? <UserX size={17} /> : <AlertTriangle size={17} />}</span>
          <div className="min-w-0 flex-1">
            {it.kind === "gone" && (
              <>
                <div className="text-[13px] font-semibold text-[var(--color-text)]">{it.emp.employee_name} {it.emp.status === "Left" ? "has left" : `is ${String(it.emp.status || "inactive").toLowerCase()}`} but still holds work</div>
                <ul className="mt-1.5 space-y-0.5 text-[12.5px] text-[var(--color-text-muted)]">
                  {it.reports.length > 0 && <li><b className="text-[var(--color-text)]">{it.reports.length}</b> direct report(s): {it.reports.map((r) => r.employee_name).join(", ")}</li>}
                  {it.approverOf.length > 0 && <li>Approver for <b className="text-[var(--color-text)]">{it.approverOf.length}</b> employee(s): {it.approverOf.map((r) => r.employee_name).join(", ")}</li>}
                  {it.projects.length > 0 && <li>Manages <b className="text-[var(--color-text)]">{it.projects.length}</b> open project(s): {it.projects.map((p) => p.project_name || p.name).join(", ")}</li>}
                </ul>
              </>
            )}
            {it.kind === "loop" && (
              <>
                <div className="text-[13px] font-semibold text-[var(--color-text)]">Reporting loop</div>
                <p className="mt-1 text-[12.5px] text-[var(--color-text-muted)]">{it.ring.map((x) => x.employee_name).join(" → ")} → back to {it.ring[0].employee_name}. Approvals can't climb past this; change one person's Reports To in HR › Employees.</p>
              </>
            )}
            {it.kind === "missing" && (
              <>
                <div className="text-[13px] font-semibold text-[var(--color-text)]">{it.emp.employee_name} reports to a record that no longer exists</div>
                <p className="mt-1 text-[12.5px] text-[var(--color-text-muted)]">Reports To is {it.emp.reports_to}.</p>
              </>
            )}
          </div>
          {it.kind === "gone" && <Button onClick={() => onHandover(it.emp)}>Hand Over Work</Button>}
          {it.kind === "missing" && <Button variant="secondary" disabled={busy === it.emp.name} onClick={() => moveUp(it.emp)}>Clear Reports To</Button>}
        </section>
      ))}
    </div>
  );
}

/* --------------------------------- away today --------------------------------- */

function AwayToday({ d, ids }) {
  if (!ids.length) return <Panel><Empty icon={Users} text="No managers are on leave today." /></Panel>;
  return (
    <Panel title="Managers on Leave Today" hint="Their team's new leave and expense requests, and any already waiting on them, go to the person covering">
      <div className="overflow-hidden rounded-lg border border-[var(--color-border)]">
        <table className="w-full text-left text-[12.5px]">
          <thead className="bg-[var(--color-surface-2)] text-[10.5px] uppercase tracking-wide text-[var(--color-text-faint)]"><tr><th className="px-3 py-2 font-medium">Manager</th><th className="px-3 py-2 font-medium">Back After</th><th className="px-3 py-2 font-medium">Team</th><th className="px-3 py-2 font-medium">Covered By</th></tr></thead>
          <tbody>
            {ids.map((id) => {
              const m = d.byId[id];
              const cover = coverFor(d, m);
              return (
                <tr key={id} className="border-t border-[var(--color-border)]">
                  <td className="px-3 py-2"><div className="font-medium text-[var(--color-text)]">{m.employee_name}</div><div className="text-[11px] text-[var(--color-text-faint)]">{m.designation}</div></td>
                  <td className="px-3 py-2">{dmy(d.away[id])}</td>
                  <td className="px-3 py-2">{(d.kids[id] || []).filter(active).length} people</td>
                  <td className="px-3 py-2">{cover ? <span className="font-medium text-[var(--color-text)]">{cover.employee_name}<span className="block text-[11px] font-normal text-[var(--color-text-faint)]">{cover.designation}</span></span> : <span className="text-[var(--color-red-hover)]">No one available above - set a business unit approver</span>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

/* --------------------------------- rules --------------------------------- */

function Rules() {
  const steps = [
    ["Expense type approver", "For expense claims, the approver named on the expense type."],
    ["Business unit approvers", "The approvers set on the employee's department, then its parent departments (Admin › Organization)."],
    ["Approver on the employee record", "The Leave / Expense Approver set on the employee."],
    ["Reporting manager", "The person in Reports To."],
    ["Higher managers", "Their manager, and on up the hierarchy until someone is available."],
  ];
  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
      <Panel title="Who Approves" hint="The first person in this order who is active and not on leave today">
        <ol className="space-y-3">
          {steps.map(([t, s], i) => (
            <li key={t} className="flex gap-3"><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--color-red-wash)] text-[11px] font-semibold text-[var(--color-red-hover)]">{i + 1}</span><div><div className="text-[13px] font-medium text-[var(--color-text)]">{t}</div><div className="text-[12px] text-[var(--color-text-muted)]">{s}</div></div></li>
          ))}
        </ol>
      </Panel>
      <Panel title="When Someone Is Away or Leaves">
        <ul className="space-y-3 text-[12.5px] text-[var(--color-text-muted)]">
          <li><b className="text-[var(--color-text)]">On leave:</b> new requests skip them, and every day requests already waiting on them move to the next person in the order.</li>
          <li><b className="text-[var(--color-text)]">Left the company:</b> they're skipped the same way. HR uses <b className="text-[var(--color-text)]">Hand Over Work</b> (here, or on the exit in Lifecycle) to move their direct reports, approver roles, waiting requests and the projects they manage to a successor in one step.</li>
          <li><b className="text-[var(--color-text)]">Project managers:</b> their projects move with the handover; HR can also change a single project's manager on the project page. The new manager approves its timesheets from then on.</li>
          <li>Every move is noted on the request or project, so it's clear who it came from.</li>
        </ul>
      </Panel>
    </div>
  );
}
