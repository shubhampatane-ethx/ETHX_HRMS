import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight, Building2, CalendarCheck, CalendarClock, ClipboardList, FileBarChart, GraduationCap,
  LineChart, Plus, UserCheck, UserPlus, UserSearch, Users, Wallet,
} from "lucide-react";
import { frappe } from "../../lib/api/frappeClient";
import { useAuth } from "../../context/AuthContext";
import { Card } from "../../components/ui/primitives";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
function dmy(isoStr = "") {
  const [, m, d] = isoStr.split("-").map(Number);
  return m ? `${String(d).padStart(2, "0")} ${MONTHS[m - 1]}` : "";
}

// Status groups used by the charts
const ATTENDED = ["Present", "Work From Home", "Half Day"];
const SEGMENTS = [
  { key: "Present", color: "var(--color-green)" },
  { key: "Work From Home", color: "#4f8cff" },
  { key: "Half Day", color: "#e0b341" },
  { key: "On Leave", color: "var(--color-amber)" },
  { key: "Absent", color: "var(--color-red)" },
];

const QUICK_LINKS = [
  { to: "/hr/employees", label: "Employees", hint: "Profiles & records", icon: Users },
  { to: "/hr/attendance", label: "Attendance", hint: "Mark & review", icon: CalendarCheck },
  { to: "/hr/leave", label: "Leave", hint: "Approve requests", icon: CalendarClock },
  { to: "/hr/payroll", label: "Payroll", hint: "Salary runs", icon: Wallet },
  { to: "/hr/recruitment", label: "Recruitment", hint: "Openings & hiring", icon: UserSearch },
  { to: "/hr/onboarding", label: "Onboarding", hint: "New joiners", icon: ClipboardList },
  { to: "/hr/performance", label: "Performance", hint: "Reviews & goals", icon: LineChart },
  { to: "/hr/training", label: "Training", hint: "Programs", icon: GraduationCap },
  { to: "/hr/reports", label: "Reports", hint: "Insights", icon: FileBarChart },
];

function greeting(hour) {
  return hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
}

function Skeleton({ className = "" }) {
  return <div className={`animate-pulse rounded bg-[var(--color-surface-2)] ${className}`} />;
}

function Stat({ to, icon: Icon, label, value, sub, accent }) {
  return (
    <Link to={to} className="group relative overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 transition-colors hover:border-[var(--color-border-strong)]">
      <div className="pointer-events-none absolute -right-6 -top-6 h-24 w-24 rounded-full opacity-[0.12] blur-2xl" style={{ background: accent }} />
      <div className="flex items-center justify-between">
        <span className="text-[12px] font-medium text-[var(--color-text-muted)]">{label}</span>
        <span className="flex h-9 w-9 items-center justify-center rounded-lg" style={{ background: `color-mix(in srgb, ${accent} 16%, transparent)`, color: accent }}>
          <Icon size={17} strokeWidth={1.9} />
        </span>
      </div>
      <div className="mt-3 text-3xl font-semibold tracking-tight text-[var(--color-text)]">{value ?? <Skeleton className="h-8 w-14" />}</div>
      <div className="mt-1 flex items-center justify-between text-[12px] text-[var(--color-text-muted)]">
        <span>{sub}</span>
        <ArrowRight size={14} className="opacity-0 transition-opacity group-hover:opacity-100" />
      </div>
    </Link>
  );
}

function SectionTitle({ title, hint, to }) {
  return (
    <div className="mb-4 flex items-center justify-between">
      <div>
        <h2 className="text-[13px] font-semibold text-[var(--color-text)]">{title}</h2>
        {hint && <p className="mt-0.5 text-[12px] text-[var(--color-text-muted)]">{hint}</p>}
      </div>
      {to && <Link to={to} className="flex items-center gap-1 text-[12px] text-[var(--color-red-hover)] hover:underline">View all <ArrowRight size={12} /></Link>}
    </div>
  );
}

export default function HRDashboard() {
  const { user } = useAuth();
  const [data, setData] = useState(null);

  const now = useMemo(() => new Date(), []);
  const today = iso(now);

  useEffect(() => {
    async function load() {
      const from = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6);
      const [emp, att, leave] = await Promise.allSettled([
        frappe.getList("Employee", { filters: [["status", "=", "Active"]], fields: ["name", "employee_name", "department"], limit: 0 }),
        frappe.getList("Attendance", { filters: [["attendance_date", ">=", iso(from)], ["docstatus", "<", 2]], fields: ["employee", "attendance_date", "status"], limit: 0 }),
        frappe.getList("Leave Application", { filters: [["status", "=", "Open"], ["docstatus", "<", 2]], fields: ["name", "employee_name", "leave_type", "from_date", "to_date", "total_leave_days"], limit: 0, orderBy: "from_date asc" }),
      ]);
      setData({
        employees: emp.status === "fulfilled" ? emp.value : null,
        attendance: att.status === "fulfilled" ? att.value : null,
        leave: leave.status === "fulfilled" ? leave.value : null,
      });
    }
    load();
  }, [now]);

  const employees = data?.employees;
  const attendance = data?.attendance;
  const leave = data?.leave;
  const headcount = employees?.length;

  // Today's breakdown
  const todayCounts = useMemo(() => {
    const c = {};
    for (const r of attendance || []) if (r.attendance_date === today) c[r.status] = (c[r.status] || 0) + 1;
    return c;
  }, [attendance, today]);
  const marked = Object.values(todayCounts).reduce((a, b) => a + b, 0);
  const attendedToday = ATTENDED.reduce((a, k) => a + (todayCounts[k] || 0), 0);
  const notMarked = headcount != null ? Math.max(headcount - marked, 0) : null;

  // Last 7 days
  const week = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (6 - i));
      const key = iso(d);
      const rows = (attendance || []).filter((r) => r.attendance_date === key);
      return {
        key,
        label: DAYS[d.getDay()].slice(0, 3),
        date: `${String(d.getDate()).padStart(2, "0")} ${MONTHS[d.getMonth()]}`,
        attended: rows.filter((r) => ATTENDED.includes(r.status)).length,
        leave: rows.filter((r) => r.status === "On Leave").length,
        absent: rows.filter((r) => r.status === "Absent").length,
        isToday: key === today,
      };
    });
  }, [attendance, now, today]);
  const weekMax = Math.max(headcount || 0, ...week.map((w) => w.attended + w.leave + w.absent), 1);

  // Headcount by department
  const departments = useMemo(() => {
    const map = {};
    for (const e of employees || []) {
      const name = (e.department || "Unassigned").replace(/\s-\s[A-Z0-9]+$/i, ""); // "Sales - DPL" -> "Sales"
      map[name] = (map[name] || 0) + 1;
    }
    return Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, 6);
  }, [employees]);

  // Donut geometry
  const R = 52, C = 2 * Math.PI * R;
  const donutTotal = Math.max(headcount || 0, marked, 1);
  const present = SEGMENTS.filter((s) => todayCounts[s.key]);
  const arcs = present.map((s, i) => ({
    ...s,
    len: (todayCounts[s.key] / donutTotal) * C,
    offset: present.slice(0, i).reduce((sum, p) => sum + (todayCounts[p.key] / donutTotal) * C, 0),
  }));

  const firstName = (() => {
    const part = (user?.email || "").split("@")[0].split(/[._-]/)[0];
    return part ? part[0].toUpperCase() + part.slice(1) : "there";
  })();

  return (
    <div className="space-y-6">
      {/* Hero */}
      <section className="relative overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] px-7 py-7">
        <div className="pointer-events-none absolute inset-0" style={{ background: "radial-gradient(600px 220px at 100% 0%, rgba(232,16,42,0.22), transparent 70%), radial-gradient(400px 200px at 0% 100%, rgba(232,16,42,0.08), transparent 70%)" }} />
        <div className="relative flex flex-wrap items-center justify-between gap-5">
          <div>
            <p className="text-[12px] font-medium uppercase tracking-[0.14em] text-[var(--color-red-hover)]">{DAYS[now.getDay()]}, {String(now.getDate()).padStart(2, "0")} {MONTHS[now.getMonth()]} {now.getFullYear()}</p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-[var(--color-text)]">{greeting(now.getHours())}, {firstName}</h2>
            <p className="mt-1.5 text-[13px] text-[var(--color-text-muted)]">
              {headcount == null ? "Loading your workspace…" : notMarked > 0 ? `${notMarked} of ${headcount} employees have no attendance marked today.` : "Attendance is marked for everyone today."}
              {leave?.length > 0 && ` ${leave.length} leave request${leave.length > 1 ? "s" : ""} waiting for review.`}
            </p>
          </div>
          <div className="flex flex-wrap gap-2.5">
            <Link to="/hr/attendance" className="flex items-center gap-2 rounded-lg bg-[var(--color-red)] px-4 py-2.5 text-[13px] font-medium text-white transition-colors hover:bg-[var(--color-red-hover)]"><Plus size={15} /> Mark attendance</Link>
            <Link to="/hr/leave" className="flex items-center gap-2 rounded-lg border border-[var(--color-border-strong)] bg-[var(--color-surface-2)] px-4 py-2.5 text-[13px] font-medium text-[var(--color-text)] transition-colors hover:border-[var(--color-text-faint)]"><CalendarClock size={15} /> Review leave</Link>
            <Link to="/hr/employees" className="flex items-center gap-2 rounded-lg border border-[var(--color-border-strong)] bg-[var(--color-surface-2)] px-4 py-2.5 text-[13px] font-medium text-[var(--color-text)] transition-colors hover:border-[var(--color-text-faint)]"><UserPlus size={15} /> Add employee</Link>
          </div>
        </div>
      </section>

      {/* Stats */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat to="/hr/employees" icon={Users} label="Active employees" value={headcount ?? (data ? "—" : undefined)} sub="Current headcount" accent="#4f8cff" />
        <Stat to="/hr/attendance" icon={UserCheck} label="Present today" value={attendance ? attendedToday : data ? "—" : undefined} sub={headcount != null && attendance ? `of ${headcount} employees` : "Marked today"} accent="var(--color-green)" />
        <Stat to="/hr/attendance" icon={CalendarCheck} label="Not marked today" value={notMarked ?? (data ? "—" : undefined)} sub="Awaiting attendance" accent="var(--color-amber)" />
        <Stat to="/hr/leave" icon={CalendarClock} label="Pending leave requests" value={leave ? leave.length : data ? "—" : undefined} sub="Need your review" accent="var(--color-red-hover)" />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="rounded-xl p-5 lg:col-span-2">
          <SectionTitle title="Attendance - last 7 days" hint="Employees attended, on leave and absent per day" to="/hr/attendance" />
          {!attendance ? <Skeleton className="h-44 w-full" /> : (
            <>
              <div className="flex h-44 items-end gap-3">
                {week.map((w) => {
                  const total = w.attended + w.leave + w.absent;
                  return (
                    <div key={w.key} className="flex h-full flex-1 flex-col items-center justify-end gap-2" title={`${w.date}: ${w.attended} attended, ${w.leave} on leave, ${w.absent} absent`}>
                      <span className="text-[11px] font-medium text-[var(--color-text-muted)]">{total || ""}</span>
                      <div className="flex w-full max-w-[44px] flex-1 flex-col-reverse overflow-hidden rounded-md bg-[var(--color-surface-2)]">
                        <div style={{ height: `${(w.attended / weekMax) * 100}%`, background: "var(--color-green)" }} />
                        <div style={{ height: `${(w.leave / weekMax) * 100}%`, background: "var(--color-amber)" }} />
                        <div style={{ height: `${(w.absent / weekMax) * 100}%`, background: "var(--color-red)" }} />
                      </div>
                      <div className={`text-center text-[11px] leading-tight ${w.isToday ? "font-semibold text-[var(--color-text)]" : "text-[var(--color-text-muted)]"}`}>{w.label}<br /><span className="text-[10px] text-[var(--color-text-faint)]">{w.date}</span></div>
                    </div>
                  );
                })}
              </div>
              <div className="mt-4 flex gap-4 text-[11px] text-[var(--color-text-muted)]">
                {[["Attended", "var(--color-green)"], ["On leave", "var(--color-amber)"], ["Absent", "var(--color-red)"]].map(([l, c]) => <span key={l} className="flex items-center gap-1.5"><i className="h-2 w-2 rounded-full" style={{ background: c }} />{l}</span>)}
              </div>
            </>
          )}
        </Card>

        <Card className="rounded-xl p-5">
          <SectionTitle title="Today's attendance" hint={`${marked} marked${notMarked != null ? `, ${notMarked} pending` : ""}`} />
          {!attendance ? <Skeleton className="mx-auto h-36 w-36 rounded-full" /> : (
            <div className="flex flex-col items-center gap-5">
              <div className="relative h-36 w-36">
                <svg viewBox="0 0 130 130" className="h-full w-full -rotate-90">
                  <circle cx="65" cy="65" r={R} fill="none" stroke="var(--color-surface-2)" strokeWidth="14" />
                  {arcs.map((a) => <circle key={a.key} cx="65" cy="65" r={R} fill="none" stroke={a.color} strokeWidth="14" strokeDasharray={`${Math.max(a.len - 2, 0)} ${C}`} strokeDashoffset={-a.offset} />)}
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-2xl font-semibold text-[var(--color-text)]">{attendedToday}</span>
                  <span className="text-[11px] text-[var(--color-text-muted)]">attended</span>
                </div>
              </div>
              <ul className="w-full space-y-1.5 text-[12px]">
                {SEGMENTS.filter((s) => todayCounts[s.key]).map((s) => <li key={s.key} className="flex items-center justify-between"><span className="flex items-center gap-2 text-[var(--color-text-muted)]"><i className="h-2 w-2 rounded-full" style={{ background: s.color }} />{s.key}</span><span className="font-medium text-[var(--color-text)]">{todayCounts[s.key]}</span></li>)}
                {notMarked > 0 && <li className="flex items-center justify-between"><span className="flex items-center gap-2 text-[var(--color-text-muted)]"><i className="h-2 w-2 rounded-full bg-[var(--color-border-strong)]" />Not marked</span><span className="font-medium text-[var(--color-text)]">{notMarked}</span></li>}
              </ul>
            </div>
          )}
        </Card>
      </div>

      {/* Leave + departments */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="rounded-xl p-5 lg:col-span-2">
          <SectionTitle title="Pending leave requests" hint="Oldest start dates first" to="/hr/leave" />
          {!leave ? <Skeleton className="h-28 w-full" /> : leave.length === 0 ? (
            <div className="flex h-28 items-center justify-center text-[13px] text-[var(--color-text-muted)]">You're all caught up - no requests waiting.</div>
          ) : (
            <ul className="divide-y divide-[var(--color-border)]">
              {leave.slice(0, 5).map((l) => (
                <li key={l.name} className="flex items-center justify-between gap-4 py-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--color-red-wash)] text-[12px] font-semibold text-[var(--color-red-hover)]">{(l.employee_name || "?")[0]}</span>
                    <div className="min-w-0">
                      <p className="truncate text-[13px] font-medium text-[var(--color-text)]">{l.employee_name}</p>
                      <p className="truncate text-[12px] text-[var(--color-text-muted)]">{l.leave_type}</p>
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-[13px] text-[var(--color-text)]">{dmy(l.from_date)}{l.to_date !== l.from_date && ` - ${dmy(l.to_date)}`}</p>
                    <p className="text-[12px] text-[var(--color-text-muted)]">{l.total_leave_days} day{l.total_leave_days === 1 ? "" : "s"}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="rounded-xl p-5">
          <SectionTitle title="Headcount by department" hint="Active employees" />
          {!employees ? <Skeleton className="h-28 w-full" /> : departments.length === 0 ? (
            <div className="flex h-28 items-center justify-center text-[13px] text-[var(--color-text-muted)]">No employees yet.</div>
          ) : (
            <ul className="space-y-3.5">
              {departments.map(([name, n]) => (
                <li key={name}>
                  <div className="mb-1.5 flex items-center justify-between text-[12px]"><span className="flex items-center gap-1.5 text-[var(--color-text-muted)]"><Building2 size={12} />{name}</span><span className="font-medium text-[var(--color-text)]">{n}</span></div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-[var(--color-surface-2)]"><div className="h-full rounded-full" style={{ width: `${(n / departments[0][1]) * 100}%`, background: "linear-gradient(90deg, var(--color-red-deep), var(--color-red-hover))" }} /></div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {/* Quick access */}
      <section>
        <h2 className="mb-3 text-[13px] font-semibold text-[var(--color-text)]">Quick access</h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
          {QUICK_LINKS.map(({ to, label, hint, icon: Icon }) => (
            <Link key={to} to={to} className="group flex items-center gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3.5 transition-colors hover:border-[var(--color-red-deep)] hover:bg-[var(--color-surface-2)]">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--color-surface-2)] text-[var(--color-text-muted)] transition-colors group-hover:bg-[var(--color-red-wash)] group-hover:text-[var(--color-red-hover)]"><Icon size={17} strokeWidth={1.8} /></span>
              <span className="min-w-0"><span className="block truncate text-[13px] font-medium text-[var(--color-text)]">{label}</span><span className="block truncate text-[11px] text-[var(--color-text-muted)]">{hint}</span></span>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}