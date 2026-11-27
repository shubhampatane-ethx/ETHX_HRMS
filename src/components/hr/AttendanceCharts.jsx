// The HR Attendance page's summary pieces, built to match the rest of the app: the same card as <Stat>, the same
// <Panel>, chips (chipCls) and the green / amber / red status tones StatusPill uses everywhere.
import { useState } from "react";
import { AlertTriangle, CalendarOff, CheckCircle2, Clock3, Home, LogIn, Timer, XCircle } from "lucide-react";
import { Panel } from "../employee/EmployeeShell";
import { EXTRA_STATUSES, MAIN_STATUSES, statusMeta } from "../../lib/attendanceStatus";

const ICONS = { Present: CheckCircle2, "Work From Home": Home, "Half Day": Clock3, "On Leave": CalendarOff, Absent: XCircle, "Short Hours": Timer, "Missed Punch Out": AlertTriangle, Working: LogIn };
const tint = (color, pct) => `color-mix(in srgb, ${color} ${pct}%, transparent)`;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** One card per status, styled like <Stat>. Click a card to show only that status; click it again to show all. */
export function StatusCards({ counts, total, active, onPick }) {
  const statuses = [...MAIN_STATUSES, ...EXTRA_STATUSES.filter((s) => counts[s])];
  return statuses.map((s) => {
    const m = statusMeta(s);
    const Icon = ICONS[s] || CheckCircle2;
    const n = counts[s] || 0;
    const on = active === s;
    return (
      <button key={s} type="button" aria-pressed={on} onClick={() => onPick(on ? null : s)} title={on ? "Show all days" : `Show only ${m.label}`}
        className={`group relative overflow-hidden rounded-xl border bg-[var(--color-surface)] p-5 text-left transition-colors ${on ? "" : "border-[var(--color-border)] hover:border-[var(--color-border-strong)]"}`}
        style={on ? { borderColor: m.tone, boxShadow: `inset 0 0 0 1px ${m.tone}` } : undefined}>
        <div className="pointer-events-none absolute -right-6 -top-6 h-24 w-24 rounded-full opacity-[0.12] blur-2xl" style={{ background: m.tone }} />
        <div className="flex items-center justify-between">
          <span className="text-[12px] font-medium text-[var(--color-text-muted)]">{m.label}</span>
          <span className="flex h-9 w-9 items-center justify-center rounded-lg" style={{ background: tint(m.tone, 16), color: m.tone }}><Icon size={17} strokeWidth={1.9} /></span>
        </div>
        <div className="mt-3 text-2xl font-semibold tracking-tight text-[var(--color-text)]">{n}</div>
        <div className="mt-1 flex items-center justify-between text-[12px] text-[var(--color-text-muted)]">
          <span>{total ? Math.round((n / total) * 100) : 0}% of days</span>
          <span className={`text-[11px] transition-opacity ${on ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`} style={{ color: on ? m.tone : undefined }}>{on ? "Filtered · clear" : "Filter"}</span>
        </div>
      </button>
    );
  });
}

/** One month as a calendar: each day tinted by its status tone with its short code. Click a day to filter to it. */
export function MonthCalendar({ year, month, byDate, today, statusFilter, activeDay, onPickDay }) {
  const days = new Date(year, month + 1, 0).getDate();
  const lead = (new Date(year, month, 1).getDay() + 6) % 7; // Monday first
  const cells = [...Array(lead).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)];
  const iso = (d) => `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  return (
    <div>
      <div className="mb-1.5 grid grid-cols-7 gap-1.5 text-center text-[10.5px] font-semibold uppercase tracking-wide text-[var(--color-text-faint)]">
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => <span key={d}>{d}</span>)}
      </div>
      <div className="grid grid-cols-7 gap-1.5">
        {cells.map((d, i) => {
          if (!d) return <span key={`b${i}`} />;
          const key = iso(d);
          const r = byDate.get(key);
          const weekend = (lead + d - 1) % 7 >= 5;
          const m = r ? statusMeta(r.status) : null;
          const dim = (statusFilter && (!r || r.status !== statusFilter)) || (activeDay && activeDay !== key);
          return (
            <button key={key} type="button" disabled={!r} onClick={() => onPickDay(activeDay === key ? null : key)}
              title={r ? `${r.label} · ${m.label}${r.in_time ? ` · in ${String(r.in_time).slice(11, 16)}` : ""}${r.derived ? " · not confirmed" : ""}` : `${d} ${MONTHS[month]}${weekend ? " · weekend" : " · no record"}`}
              className={`relative flex h-11 flex-col items-center justify-center rounded-md border leading-tight transition-colors ${r ? "hover:brightness-110" : "cursor-default"} ${dim ? "opacity-30" : ""}`}
              style={r ? { background: tint(m.tone, activeDay === key ? 32 : 16), borderColor: key === today ? "var(--color-red)" : tint(m.tone, 40) } : { background: weekend ? "transparent" : "var(--color-surface-2)", borderColor: key === today ? "var(--color-red)" : "var(--color-border)", borderStyle: weekend ? "dashed" : "solid" }}>
              <span className={`text-[12px] font-medium ${r ? "text-[var(--color-text)]" : "text-[var(--color-text-faint)]"}`}>{d}</span>
              {r && <span className="text-[9.5px] font-semibold" style={{ color: m.tone }}>{m.short}</span>}
              {r?.derived && <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-[var(--color-amber)]" />}
            </button>
          );
        })}
      </div>
      <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-[var(--color-text-muted)]">
        {[["var(--color-green)", "Present / checked in"], ["var(--color-amber)", "WFH, half day, leave, short hours"], ["var(--color-red-hover)", "Absent / missed punch"]].map(([c, t]) => (
          <span key={t} className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: tint(c, 40), border: `1px solid ${c}` }} />{t}</span>
        ))}
      </div>
    </div>
  );
}

// "Team today" groups: the statuses each one collects.
const TODAY_GROUPS = [
  { id: "present", label: "Present today", tone: "var(--color-green)", icon: CheckCircle2, statuses: ["Present", "Working", "Short Hours", "Half Day"], empty: "Nobody has checked in yet." },
  { id: "wfh", label: "Work from home", tone: "#4f8cff", icon: Home, statuses: ["Work From Home"], empty: "Nobody is working from home today." },
  { id: "leave", label: "On leave", tone: "var(--color-amber)", icon: CalendarOff, statuses: ["On Leave"], empty: "Nobody is on leave today." },
  { id: "absent", label: "Absent today", tone: "var(--color-red-hover)", icon: XCircle, statuses: ["Absent", "Missed Punch Out"], empty: "Nobody is marked absent today." },
  { id: "none", label: "Not checked in yet", tone: "var(--color-text-faint)", icon: Clock3, statuses: ["Not marked"], empty: "Everyone has a status today." },
];

/** Today across everyone HR can see: who's present, WFH, on leave, absent or not in yet. Click a tile for the names. */
export function TeamToday({ people, todayRows, todayLabel, onOpen }) {
  const [open, setOpen] = useState("present");
  const byEmp = new Map(todayRows.map((r) => [r.employee, r]));
  const statusOf = (p) => byEmp.get(p.id)?.status || "Not marked";
  const groups = TODAY_GROUPS.map((g) => ({ ...g, people: people.filter((p) => g.statuses.includes(statusOf(p))) }));
  const total = people.length || 1;
  const current = groups.find((g) => g.id === open);
  return (
    <Panel title="Team today" hint={`${todayLabel} · ${people.length} people`}>
      <div className="flex h-2.5 overflow-hidden rounded-full bg-[var(--color-surface-2)]">
        {groups.filter((g) => g.people.length).map((g) => <div key={g.id} className="h-full border-r border-[var(--color-surface)] last:border-0" style={{ width: `${(g.people.length / total) * 100}%`, background: g.tone }} title={`${g.label}: ${g.people.length}`} />)}
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-5">
        {groups.map((g) => {
          const on = open === g.id;
          const Icon = g.icon;
          return (
            <button key={g.id} type="button" onClick={() => setOpen(on ? null : g.id)} aria-expanded={on}
              className={`group relative overflow-hidden rounded-lg border p-3 text-left transition-colors ${on ? "" : "border-[var(--color-border)] hover:border-[var(--color-border-strong)]"}`}
              style={on ? { borderColor: g.tone, background: tint(g.tone, 8) } : undefined}>
              <div className="flex items-center justify-between">
                <span className="text-[12px] font-medium text-[var(--color-text-muted)]">{g.label}</span>
                <span className="flex h-7 w-7 items-center justify-center rounded-md" style={{ background: tint(g.tone, 16), color: g.tone }}><Icon size={15} strokeWidth={1.9} /></span>
              </div>
              <div className="mt-1.5 flex items-baseline gap-1.5">
                <span className="text-xl font-semibold tracking-tight text-[var(--color-text)]">{g.people.length}</span>
                <span className="text-[11.5px] text-[var(--color-text-faint)]">{Math.round((g.people.length / total) * 100)}%</span>
              </div>
            </button>
          );
        })}
      </div>
      {current && (
        <div className="mt-4 border-t border-[var(--color-border)] pt-3">
          <p className="mb-2 text-[12px] font-medium text-[var(--color-text-muted)]">{current.label} <span className="text-[var(--color-text-faint)]">· {current.people.length}</span></p>
          {current.people.length === 0 ? <p className="text-[12.5px] text-[var(--color-text-faint)]">{current.empty}</p> : (
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {current.people.map((p) => {
                const r = byEmp.get(p.id);
                const s = statusOf(p);
                const detail = s === "Working" ? `In since ${String(r.in_time).slice(11, 16)}` : r?.in_time ? `${String(r.in_time).slice(11, 16)}${r.out_time && !r.stillIn ? ` – ${String(r.out_time).slice(11, 16)}` : ""}` : s === "Not marked" ? "No punch or attendance yet" : "";
                return (
                  <button key={p.id} type="button" onClick={() => onOpen(p.id)} disabled={!p.hasRecords} title={p.hasRecords ? `Open ${p.label}'s attendance` : "No attendance records yet"}
                    className="flex items-center gap-2.5 rounded-lg border border-[var(--color-border)] px-2.5 py-2 text-left transition-colors hover:border-[var(--color-border-strong)] hover:bg-[var(--color-surface-2)] disabled:cursor-default disabled:hover:bg-transparent">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold" style={{ background: tint(current.tone, 16), color: current.tone }}>{p.label.split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase()}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[12.5px] font-medium text-[var(--color-text)]">{p.label}</span>
                      <span className="block truncate text-[11.5px] text-[var(--color-text-muted)]">{detail}{s !== "Not marked" && current.statuses.length > 1 && <>{detail ? " · " : ""}{statusMeta(s).label}</>}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </Panel>
  );
}
