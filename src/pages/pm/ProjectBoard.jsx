// Projects page body: one card per project with everything at a glance - stage and status, manager and leads, dates
// and time left, time used vs progress, hours allocated vs worked, tasks, every delay, and the team with each
// member's role, dates and hours. Figures come from lib/projectInsights.js.
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, ArrowRight, Briefcase, CalendarClock, ChevronDown, Clock, Flag, ListChecks, Plus, Timer, TriangleAlert, Users } from "lucide-react";
import { Empty, Skeleton, Stat, StatusPill } from "../../components/employee/EmployeeShell";
import { dmy, useAsync } from "../../lib/employeePortal";
import { loadProjectInsights } from "../../lib/projectInsights";
import { managerOf } from "../../lib/projectRoles";
import { stageOf } from "../../lib/projectLifecycle";
import { StagePill } from "./ProjectDetail";

const label = (p) => (p.project_name && p.project_name !== p.name ? p.project_name : p.name);
const HEALTH = {
  "On Track": "var(--color-green)",
  "At Risk": "var(--color-amber)",
  Delayed: "var(--color-red-hover)",
  Overdue: "var(--color-red-hover)",
  Completed: "var(--color-text-muted)",
  Cancelled: "var(--color-text-muted)",
};
const hrs = (n) => `${Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 1 })} h`;
const initials = (n) => String(n || "?").trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();

function Health({ value }) {
  const tone = HEALTH[value] || "var(--color-text-muted)";
  return <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ background: `color-mix(in srgb, ${tone} 14%, transparent)`, color: tone }}>{value}</span>;
}

function Bar({ pct, tone = "var(--color-green)", marker }) {
  return (
    <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-[var(--color-surface-2)]">
      <div className="h-full rounded-full" style={{ width: `${Math.max(0, Math.min(100, pct || 0))}%`, background: tone }} />
      {marker != null && <span className="absolute top-[-2px] h-[10px] w-0.5 rounded bg-[var(--color-text-muted)]" style={{ left: `${Math.min(100, marker)}%` }} />}
    </div>
  );
}

function Metric({ icon: Icon, label: l, value, sub, children }) {
  return (
    <div className="min-w-0 rounded-lg border border-[var(--color-border)] px-3.5 py-3">
      <div className="flex items-center gap-1.5 text-[10.5px] font-medium uppercase tracking-wide text-[var(--color-text-faint)]"><Icon size={12} />{l}</div>
      <div className="mt-1 truncate text-[15px] font-semibold text-[var(--color-text)]">{value}</div>
      {children && <div className="mt-2">{children}</div>}
      {sub && <div className="mt-1.5 truncate text-[11px] text-[var(--color-text-muted)]">{sub}</div>}
    </div>
  );
}

/** Summary tiles + project cards. `list` is already filtered; `all` is every project (for the tiles). */
export function ProjectBoard({ all, list, assignments, employees, nameOf, isAdmin, onEnd }) {
  const insights = useAsync(() => loadProjectInsights(all, assignments, employees), [all, assignments, employees]);
  const data = insights.data;
  const live = all.filter((p) => !["Completed", "Cancelled"].includes(p.status));
  const totals = useMemo(() => {
    if (!data) return null;
    const people = new Set(live.flatMap((p) => (data[p.name]?.current || []).map((m) => m.email)));
    return {
      people: people.size,
      worked: live.reduce((s, p) => s + (data[p.name]?.worked || 0), 0),
      allocated: live.reduce((s, p) => s + (data[p.name]?.allocated || 0), 0),
      delayed: live.filter((p) => ["Delayed", "Overdue"].includes(data[p.name]?.health)).length,
    };
  }, [data, live]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat icon={Briefcase} label="Live Projects" value={live.length} sub={`${all.length} in total`} />
        <Stat icon={Users} label="People Assigned" value={totals?.people} sub="On live projects" accent="#2563eb" />
        <Stat icon={Timer} label="Hours Worked" value={totals ? hrs(totals.worked) : undefined} sub={totals ? `of ${hrs(totals.allocated)} allocated` : ""} accent="var(--color-green)" />
        <Stat icon={AlertTriangle} label="Delayed or Overdue" value={totals?.delayed} sub="Live projects needing attention" accent="var(--color-red-hover)" />
      </div>
      {list.length === 0 ? <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]"><Empty icon={Briefcase} text="No projects here." /></div> : list.map((p) => (
        <ProjectCard key={p.name} p={p} info={data?.[p.name]} loading={insights.loading} nameOf={nameOf} isAdmin={isAdmin} onEnd={onEnd} />
      ))}
    </div>
  );
}

function ProjectCard({ p, info, loading, nameOf, isAdmin, onEnd }) {
  const [open, setOpen] = useState(false);
  const ended = ["Completed", "Cancelled"].includes(p.status);
  const manager = managerOf(p);
  const s = info?.schedule;
  const to = `/pm/projects/${encodeURIComponent(p.name)}`;
  const behind = s?.timePct != null && info && s.timePct - info.progress >= 10;

  return (
    <section className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]">
      {/* header */}
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--color-border)] px-5 py-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Link to={to} className="text-[15px] font-semibold text-[var(--color-text)] hover:text-[var(--color-red-hover)] hover:underline">{label(p)}</Link>
            <span className="text-[11.5px] text-[var(--color-text-faint)]">{p.name}</span>
            <StagePill stage={stageOf(p)} />
            <StatusPill status={p.status} />
            {info && <Health value={info.health} />}
          </div>
          <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-[12px] text-[var(--color-text-muted)]">
            <span>Manager <b className="font-medium text-[var(--color-text)]">{manager ? nameOf(manager) : "Not set"}</b></span>
            <span>Lead{info?.leads.length > 1 ? "s" : ""} <b className="font-medium text-[var(--color-text)]">{info ? (info.leads.length ? info.leads.map((m) => `${m.name} (${m.role})`).join(", ") : "None assigned") : "…"}</b></span>
            {p.company && <span>{p.company}</span>}
            {p.priority && <span>Priority <b className="font-medium text-[var(--color-text)]">{p.priority}</b></span>}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {!ended && <Link to={`/pm/assignments?assign=${encodeURIComponent(p.name)}`} className="flex items-center gap-1 rounded-md border border-[var(--color-border)] px-2.5 py-1.5 text-[12px] text-[var(--color-text)] hover:bg-[var(--color-surface-2)]"><Plus size={13} /> Assign</Link>}
          {!ended && isAdmin && <button type="button" onClick={() => onEnd(p)} className="flex items-center gap-1 rounded-md border border-[var(--color-border)] px-2.5 py-1.5 text-[12px] text-[var(--color-text-muted)] hover:text-[var(--color-red-hover)]"><Flag size={13} /> End Project</button>}
          <Link to={to} className="flex items-center gap-1 rounded-md bg-[var(--color-red)] px-3 py-1.5 text-[12px] font-medium text-white hover:bg-[var(--color-red-hover)]">Open <ArrowRight size={13} /></Link>
        </div>
      </div>

      {/* figures */}
      <div className="grid grid-cols-1 gap-3 px-5 py-4 sm:grid-cols-2 xl:grid-cols-5">
        <Metric icon={CalendarClock} label="Schedule" value={`${dmy(s?.start || p.expected_start_date) || "—"} → ${dmy(s?.end || p.expected_end_date) || "—"}`}
          sub={!s ? "" : ended ? "Ended" : s.daysLeft == null ? "No ETA set" : s.daysLeft < 0 ? `${-s.daysLeft} day(s) overdue` : s.daysLeft === 0 ? "Due today" : `${s.daysLeft} day(s) left${s.total ? ` of ${s.total}` : ""}`} />
        <Metric icon={Clock} label="Time Used vs Progress" value={info ? `${s?.timePct ?? "—"}${s?.timePct != null ? "%" : ""} · ${info.progress}% done` : loading ? <Skeleton className="h-5 w-24" /> : "—"} sub={info ? (behind ? `${s.timePct - info.progress} pts behind schedule` : "In line with the schedule") : ""}>
          {info && <Bar pct={info.progress} tone={behind ? "var(--color-amber)" : "var(--color-green)"} marker={s?.timePct} />}
        </Metric>
        <Metric icon={Timer} label="Hours" value={info ? `${hrs(info.worked)} / ${hrs(info.allocated)}` : loading ? <Skeleton className="h-5 w-24" /> : "—"} sub={info ? (info.allocated ? (info.worked > info.allocated ? `${hrs(info.worked - info.allocated)} over allocation` : `${hrs(info.remainingHours)} remaining`) : "No hours allocated") : ""}>
          {info && info.allocated > 0 && <Bar pct={(info.worked / info.allocated) * 100} tone={info.worked > info.allocated ? "var(--color-red-hover)" : "#2563eb"} />}
        </Metric>
        <Metric icon={ListChecks} label="Tasks" value={info ? (info.tasks.total ? `${info.tasks.done} / ${info.tasks.total} done` : "No tasks") : loading ? <Skeleton className="h-5 w-24" /> : "—"} sub={info && info.tasks.total ? `${info.tasks.open} open${info.tasks.overdue ? ` · ${info.tasks.overdue} overdue` : ""}` : ""}>
          {info && info.tasks.total > 0 && <Bar pct={(info.tasks.done / info.tasks.total) * 100} />}
        </Metric>
        <Metric icon={Users} label="Team" value={info ? `${info.current.length} active` : loading ? <Skeleton className="h-5 w-16" /> : "—"} sub={info ? `${info.past.length} past assignment(s)` : ""} />
      </div>

      {/* delays */}
      {info?.delays.length > 0 && (
        <div className="mx-5 mb-4 rounded-lg border border-[color-mix(in_srgb,var(--color-red-hover)_30%,transparent)] bg-[color-mix(in_srgb,var(--color-red-hover)_6%,transparent)] px-3.5 py-2.5">
          <div className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-[var(--color-red-hover)]"><TriangleAlert size={12} /> Delays</div>
          <ul className="grid grid-cols-1 gap-x-6 gap-y-0.5 text-[12.5px] text-[var(--color-text)] md:grid-cols-2">{info.delays.map((d) => <li key={d}>• {d}</li>)}</ul>
        </div>
      )}

      {/* team */}
      {info && info.members.length > 0 && (
        <div className="border-t border-[var(--color-border)] px-5 py-3">
          <button type="button" onClick={() => setOpen(!open)} className="flex w-full items-center gap-3 text-left">
            <div className="flex -space-x-2">
              {info.current.slice(0, 6).map((m) => <span key={m.key} title={`${m.name} · ${m.role}`} className={`flex h-7 w-7 items-center justify-center rounded-full border-2 border-[var(--color-surface)] text-[10px] font-semibold ${m.lead ? "bg-[var(--color-red)] text-white" : "bg-[var(--color-red-wash)] text-[var(--color-red-hover)]"}`}>{initials(m.name)}</span>)}
              {info.current.length > 6 && <span className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-[var(--color-surface)] bg-[var(--color-surface-2)] text-[10px] text-[var(--color-text-muted)]">+{info.current.length - 6}</span>}
            </div>
            <span className="min-w-0 flex-1 truncate text-[12.5px] text-[var(--color-text-muted)]">{info.current.map((m) => `${m.name} (${m.role})`).join(", ") || "No one assigned now"}</span>
            <span className="flex shrink-0 items-center gap-1 text-[12px] font-medium text-[var(--color-text)]">{open ? "Hide" : "Team Details"} <ChevronDown size={14} className={`transition-transform ${open ? "rotate-180" : ""}`} /></span>
          </button>
          {open && (
            <div className="mt-3 overflow-x-auto rounded-lg border border-[var(--color-border)]">
              <table className="w-full min-w-[820px] text-left text-[12.5px]">
                <thead className="bg-[var(--color-surface-2)] text-[10.5px] uppercase tracking-wide text-[var(--color-text-faint)]">
                  <tr>{["Member", "Role", "Start", "ETA", "Hours / Day", "Allocated", "Worked", "Remaining", "Status"].map((h) => <th key={h} className="px-3 py-2 font-medium">{h}</th>)}</tr>
                </thead>
                <tbody>
                  {info.members.map((m) => (
                    <tr key={m.key} className={`border-t border-[var(--color-border)] ${m.live ? "" : "text-[var(--color-text-muted)]"}`}>
                      <td className="px-3 py-2"><div className="font-medium text-[var(--color-text)]">{m.name}{m.lead && <span className="ml-1.5 rounded bg-[var(--color-red-wash)] px-1.5 py-px text-[10px] font-semibold text-[var(--color-red-hover)]">Lead</span>}</div>{m.designation && <div className="text-[11px] text-[var(--color-text-faint)]">{m.designation}</div>}</td>
                      <td className="px-3 py-2">{m.role}</td>
                      <td className="px-3 py-2 whitespace-nowrap">{dmy(m.start) || "—"}</td>
                      <td className={`px-3 py-2 whitespace-nowrap ${m.pastEta ? "font-medium text-[var(--color-red-hover)]" : ""}`}>{dmy(m.eta) || "—"}{m.pastEta && <div className="text-[10.5px]">Past ETA</div>}</td>
                      <td className="px-3 py-2">{m.hoursPerDay}</td>
                      <td className="px-3 py-2">{hrs(m.allocated)}</td>
                      <td className="px-3 py-2">{hrs(m.worked)}</td>
                      <td className={`px-3 py-2 ${m.worked > m.allocated ? "text-[var(--color-red-hover)]" : ""}`}>{m.worked > m.allocated ? `+${hrs(m.worked - m.allocated)} over` : hrs(m.remaining)}</td>
                      <td className="px-3 py-2"><StatusPill status={m.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
