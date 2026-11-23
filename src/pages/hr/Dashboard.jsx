import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Bell, BellRing, Cake, CalendarClock, CalendarX, Clock3, LifeBuoy, Receipt, UserCheck, UserX, Users } from "lucide-react";
import { frappe } from "../../lib/api/frappeClient";
import { getCheckinsBetween, getNotifications, getUpcomingBirthdays, listTry, summariseCheckins } from "../../lib/employeePortal";
import { getWaitingForMe } from "../../lib/approvals";
import { isStaffEmployee } from "../../permissions/roles";
import { isPageBlocked } from "../../permissions/pageAccess";
import { useAuth } from "../../context/AuthContext";
import { Card } from "../../components/ui/primitives";
import { StatusPill } from "../../components/employee/EmployeeShell";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
function dmy(isoStr = "") {
  const [, m, d] = isoStr.split("-").map(Number);
  return m ? `${String(d).padStart(2, "0")} ${MONTHS[m - 1]}` : "";
}

const ATTENDED = ["Present", "Work From Home", "Half Day"];


const ago = (stamp) => {
  const mins = Math.max(0, Math.round((Date.now() - new Date(String(stamp).replace(" ", "T")).getTime()) / 60000));
  return mins < 60 ? `${mins || 1} min ago` : mins < 1440 ? `${Math.round(mins / 60)} h ago` : `${Math.round(mins / 1440)} d ago`;
};

/**
 * Everything waiting for HR, first thing on the dashboard: requests to act on (each links to its page), the
 * signed-in person's unread notifications and the week's birthdays.
 */
function NeedsAttention({ user }) {
  const [d, setD] = useState(null);
  useEffect(() => {
    let live = true;
    const count = (p) => p.then((rows) => rows.length).catch(() => null);
    Promise.all([
      count(frappe.getList("Leave Application", { filters: [["status", "=", "Open"], ["docstatus", "=", 0]], fields: ["name"], limit: 0 })),
      count(frappe.getList("Expense Claim", { filters: [["approval_status", "=", "Draft"], ["docstatus", "=", 0]], fields: ["name"], limit: 0 })),
      listTry("Attendance Request", { filters: [["docstatus", "=", 0]], fields: ["name", "custom_decision"], limit: 0 }, ["name"]).then((rows) => rows.filter((r) => r.custom_decision !== "Rejected").length).catch(() => null),
      count(frappe.getList("Issue", { filters: [["status", "in", ["Open", "In Progress"]]], fields: ["name"], limit: 0 })),
      getWaitingForMe(user.email).then((w) => w.leaves.length + w.expenses.length + (w.attendance?.length || 0)).catch(() => null),
      getNotifications(user.email, 30).then((rows) => rows.filter((n) => !Number(n.read))).catch(() => []),
      getUpcomingBirthdays().then((rows) => rows.filter((b) => b.days_away <= 7)).catch(() => []),
    ]).then(([leave, expense, attendance, requests, mine, unread, birthdays]) => {
      if (live) setD({ leave, expense, attendance, requests, mine, unread, birthdays });
    });
    return () => { live = false; };
  }, [user.email]);

  const staff = isStaffEmployee(user);
  const items = d ? [
    { to: "/hr/leave", icon: CalendarClock, label: "Leave Requests", n: d.leave },
    { to: "/hr/expenses", icon: Receipt, label: "Expense Claims", n: d.expense },
    { to: "/hr/setup/attendance-request", icon: Clock3, label: "Attendance Requests", n: d.attendance },
    { to: "/hr/requests", icon: LifeBuoy, label: "Employee Requests", n: d.requests },
    ...(staff ? [{ to: "/employee/approvals", icon: UserCheck, label: "Waiting for My Approval", n: d.mine }] : []),
  ].filter((i) => i.n != null && !isPageBlocked(user, i.to)) : []; // nothing from modules this client doesn't have
  const total = items.reduce((s, i) => s + i.n, 0);

  return (
    <Card className="rounded-xl p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-[13px] font-semibold text-[var(--color-text)]"><BellRing size={15} className="text-[var(--color-red-hover)]" /> Needs Your Attention</h2>
        {d && <span className="text-[12px] text-[var(--color-text-muted)]">{total ? `${total} pending` : "Nothing pending"}</span>}
      </div>
      {!d ? <Skeleton className="h-24 w-full" /> : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:col-span-2">
            {items.map(({ to, icon: Icon, label, n }) => (
              <Link key={label} to={to} className={`flex items-center justify-between gap-3 rounded-lg border px-3.5 py-3 transition-colors hover:border-[var(--color-border-strong)] ${n ? "border-[var(--color-red-deep)] bg-[var(--color-red-wash)]" : "border-[var(--color-border)]"}`}>
                <span className="flex items-center gap-2.5 text-[13px] text-[var(--color-text)]"><Icon size={15} className={n ? "text-[var(--color-red-hover)]" : "text-[var(--color-text-muted)]"} />{label}</span>
                <span className={`text-[15px] font-semibold ${n ? "text-[var(--color-red-hover)]" : "text-[var(--color-text-faint)]"}`}>{n}</span>
              </Link>
            ))}
          </div>
          <div className="space-y-3">
            <div>
              <p className="mb-1.5 flex items-center justify-between text-[11px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]"><span className="flex items-center gap-1.5"><Bell size={12} /> Notifications</span>{staff && <Link to="/employee/notifications" className="normal-case tracking-normal text-[var(--color-red-hover)] hover:underline">View all</Link>}</p>
              {d.unread.length === 0 ? <p className="text-[12px] text-[var(--color-text-faint)]">No unread notifications.</p> : (
                <ul className="space-y-1.5">{d.unread.slice(0, 4).map((n) => <li key={n.name} className="text-[12px] leading-snug text-[var(--color-text)]">{n.subject?.replace(/<[^>]*>/g, "")}<span className="ml-1.5 text-[10.5px] text-[var(--color-text-faint)]">{ago(n.creation)}</span></li>)}</ul>
              )}
            </div>
            {d.birthdays.length > 0 && (
              <div>
                <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]"><Cake size={12} /> Birthdays This Week</p>
                <ul className="space-y-1 text-[12px] text-[var(--color-text)]">{d.birthdays.slice(0, 4).map((b) => <li key={`${b.name}-${b.date}`}>{b.name}<span className="ml-1.5 text-[var(--color-text-faint)]">{b.days_away === 0 ? "Today" : b.days_away === 1 ? "Tomorrow" : dmy(b.date)}</span></li>)}</ul>
              </div>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}

function Skeleton({ className = "" }) {
  return <div className={`animate-pulse rounded bg-[var(--color-surface-2)] ${className}`} />;
}

const initials = (name = "") => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "?";
// A stable soft tint per person, from the app's own palette.
const TINTS = ["var(--color-red)", "#4f8cff", "var(--color-green)", "var(--color-amber)", "#e0b341", "var(--color-text-muted)"];
const tintOf = (name = "") => TINTS[[...name].reduce((n, c) => n + c.charCodeAt(0), 0) % TINTS.length];

function Avatar({ name, image, size = 32 }) {
  const tint = tintOf(name);
  return image
    ? <img src={image} alt="" className="shrink-0 rounded-full object-cover ring-2 ring-[var(--color-surface)]" style={{ width: size, height: size }} />
    : <span className="flex shrink-0 items-center justify-center rounded-full font-semibold ring-2 ring-[var(--color-surface)]" style={{ width: size, height: size, fontSize: size * 0.36, background: `color-mix(in srgb, ${tint} 22%, var(--color-surface))`, color: tint }}>{initials(name)}</span>;
}

function AvatarStack({ people }) {
  const shown = people.slice(0, 4);
  const more = people.length - shown.length;
  return (
    <span className="flex items-center">
      {shown.map((p, i) => <span key={p.name || i} className={i ? "-ml-2" : ""} title={p.employee_name}><Avatar name={p.employee_name} image={p.image} size={28} /></span>)}
      {more > 0 && <span className="-ml-2 flex h-7 w-7 items-center justify-center rounded-full bg-[var(--color-surface-2)] text-[10px] font-semibold text-[var(--color-text-muted)] ring-2 ring-[var(--color-surface)]">+{more}</span>}
    </span>
  );
}

/** A headline number: title and icon on top, then a "People" panel with the count and who they are. */
function Stat({ to, icon: Icon, label, people, accent, loading }) {
  return (
    <Link to={to} className="group rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 transition-colors hover:border-[var(--color-border-strong)]">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-[14px] font-semibold text-[var(--color-text)]">{label}</span>
        <span className="flex h-9 w-9 items-center justify-center rounded-full" style={{ background: `color-mix(in srgb, ${accent} 16%, transparent)`, color: accent }}><Icon size={17} strokeWidth={1.9} /></span>
      </div>
      <div className="flex items-end justify-between gap-2 rounded-xl bg-[var(--color-surface-2)] px-3.5 py-3">
        <div>
          <p className="text-[11px] text-[var(--color-text-muted)]">People</p>
          <p className="mt-0.5 text-2xl font-semibold leading-none tracking-tight text-[var(--color-text)]">{loading ? <Skeleton className="h-6 w-10" /> : people ? people.length : "—"}</p>
        </div>
        {people && people.length > 0 && <AvatarStack people={people} />}
      </div>
    </Link>
  );
}

function CardTitle({ title, to, action }) {
  return (
    <div className="mb-4 flex items-center justify-between gap-3">
      <h2 className="text-[15px] font-semibold text-[var(--color-text)]">{title}</h2>
      {action || (to && <Link to={to} className="rounded-md border border-[var(--color-border)] px-2.5 py-1 text-[11px] text-[var(--color-text-muted)] hover:text-[var(--color-text)]">See All</Link>)}
    </div>
  );
}

const SERIES = [
  { key: "present", label: "Present", color: "var(--color-green)" },
  { key: "absent", label: "Absent", color: "var(--color-red)" },
  { key: "leave", label: "Leave", color: "var(--color-amber)" },
];
const DEPT_COLORS = ["#4f8cff", "var(--color-red)", "var(--color-green)", "var(--color-amber)", "#e0b341", "var(--color-text-faint)"];
const shortDept = (d) => (d || "Unassigned").replace(/\s-\s[A-Z0-9]+$/i, ""); // "Sales - DPL" -> "Sales"

export default function HRDashboard() {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  // Widgets follow the product modules: attendance and leave are Employee Lifecycle, candidates are Recruitment.
  const hasEmployee = !isPageBlocked(user, "/hr/attendance");
  const hasRecruitment = !isPageBlocked(user, "/hr/recruitment/candidates");
  const [tabPick, setTab] = useState("leave");
  const tab = !hasEmployee ? "recruit" : !hasRecruitment ? "leave" : tabPick;

  const now = useMemo(() => new Date(), []);
  const today = iso(now);

  useEffect(() => {
    async function load() {
      const from = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6);
      const [emp, att, recentLeave, onLeave, chk, applicants] = await Promise.allSettled([
        listTry("Employee", { filters: [["status", "=", "Active"]], fields: ["name", "employee_name", "department", "designation", "company_email", "user_id", "image"], orderBy: "employee_name asc" }, ["name", "employee_name", "department"]),
        frappe.getList("Attendance", { filters: [["attendance_date", ">=", iso(from)], ["docstatus", "<", 2]], fields: ["employee", "attendance_date", "status"], limit: 0 }),
        frappe.getList("Leave Application", { filters: [["docstatus", "<", 2]], fields: ["name", "employee", "employee_name", "leave_type", "from_date", "to_date", "status"], orderBy: "creation desc", limit: 6 }),
        frappe.getList("Leave Application", { filters: [["status", "=", "Approved"], ["docstatus", "=", 1], ["from_date", "<=", today], ["to_date", ">=", today]], fields: ["employee"], limit: 0 }),
        getCheckinsBetween(null, iso(from), iso(now)),
        frappe.getList("Job Applicant", { fields: ["name", "applicant_name", "designation", "job_title", "status", "custom_ethx_stage"], orderBy: "creation desc", limit: 6 }).catch(() => frappe.getList("Job Applicant", { fields: ["name", "applicant_name", "designation", "status"], orderBy: "creation desc", limit: 6 })),
      ]);
      // Punch-ins without an attendance record yet count as present (only for employees this HR user can see)
      let attendance = att.status === "fulfilled" ? att.value : null;
      if (attendance && chk.status === "fulfilled" && emp.status === "fulfilled") {
        const mine = new Set(emp.value.map((e) => e.name));
        const have = new Set(attendance.map((r) => `${r.employee}|${r.attendance_date}`));
        const extra = summariseCheckins(chk.value.filter((l) => mine.has(l.employee))).filter((d) => !have.has(`${d.employee}|${d.attendance_date}`));
        attendance = [...attendance, ...extra.map((d) => ({ employee: d.employee, attendance_date: d.attendance_date, status: "Present" }))];
      }
      setData({
        employees: emp.status === "fulfilled" ? emp.value : null,
        attendance,
        recentLeave: recentLeave.status === "fulfilled" ? recentLeave.value : null,
        onLeave: onLeave.status === "fulfilled" ? onLeave.value : [],
        applicants: applicants.status === "fulfilled" ? applicants.value : null,
      });
    }
    load();
  }, [now, today]);

  const employees = data?.employees;
  const attendance = data?.attendance;

  // Each person's status today: Present / On Leave / Absent from attendance, approved leave covering today, else Not Marked.
  const statusToday = useMemo(() => {
    const m = {};
    for (const r of attendance || []) if (r.attendance_date === today) m[r.employee] = ATTENDED.includes(r.status) ? "Present" : r.status;
    for (const l of data?.onLeave || []) if (!m[l.employee] || m[l.employee] === "Absent") m[l.employee] = "On Leave";
    return m;
  }, [attendance, data, today]);
  const peopleWith = (status) => (employees ? employees.filter((e) => statusToday[e.name] === status) : null);

  // Last 7 days, as a share of headcount
  const headcount = employees?.length || 0;
  const week = useMemo(() => Array.from({ length: 7 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (6 - i));
    const key = iso(d);
    const rows = (attendance || []).filter((r) => r.attendance_date === key);
    return {
      key, label: DAYS[d.getDay()].slice(0, 3), date: `${String(d.getDate()).padStart(2, "0")} ${MONTHS[d.getMonth()]}`, isToday: key === today,
      present: rows.filter((r) => ATTENDED.includes(r.status)).length,
      absent: rows.filter((r) => r.status === "Absent").length,
      leave: rows.filter((r) => r.status === "On Leave").length,
    };
  }), [attendance, now, today]);
  const scale = Math.max(headcount, ...week.map((w) => w.present + w.absent + w.leave), 1);

  // Headcount by department (top five, the rest together)
  const departments = useMemo(() => {
    const map = {};
    for (const e of employees || []) map[shortDept(e.department)] = (map[shortDept(e.department)] || 0) + 1;
    const all = Object.entries(map).sort((a, b) => b[1] - a[1]);
    const top = all.slice(0, 5);
    const rest = all.slice(5).reduce((n, [, c]) => n + c, 0);
    return (rest ? [...top, ["Others", rest]] : top).map(([name, n], i) => ({ name, n, color: DEPT_COLORS[i % DEPT_COLORS.length] }));
  }, [employees]);
  const R = 52, C = 2 * Math.PI * R;
  const arcs = departments.map((d, i) => ({ ...d, len: (d.n / Math.max(headcount, 1)) * C, offset: departments.slice(0, i).reduce((sum, p) => sum + (p.n / Math.max(headcount, 1)) * C, 0) }));

  const listRows = (employees || []).slice(0, 6);

  return (
    <div className="space-y-5">
      {/* Headline numbers */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat to="/hr/employees" icon={Users} label="Total Employees" people={employees} accent="#4f8cff" loading={!data} />
        {hasEmployee && <>
          <Stat to="/hr/attendance" icon={UserCheck} label="Today Present" people={attendance ? peopleWith("Present") : null} accent="var(--color-green)" loading={!data} />
          <Stat to="/hr/attendance" icon={UserX} label="Today Absent" people={attendance ? peopleWith("Absent") : null} accent="var(--color-red)" loading={!data} />
          <Stat to="/hr/leave" icon={CalendarX} label="Today Leave" people={employees ? peopleWith("On Leave") : null} accent="var(--color-amber)" loading={!data} />
        </>}
      </div>

      {/* Attendance chart + leave & recruitment */}
      {(hasEmployee || hasRecruitment) && <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        {hasEmployee && <Card className="rounded-2xl p-5 xl:col-span-2">
          <CardTitle title="Attendance Statistic" to="/hr/attendance" />
          <div className="mb-3 flex gap-4 text-[11px] text-[var(--color-text-muted)]">{SERIES.map((s) => <span key={s.key} className="flex items-center gap-1.5"><i className="h-2 w-2 rounded-full" style={{ background: s.color }} />{s.label}</span>)}</div>
          {!attendance ? <Skeleton className="h-56 w-full" /> : (
            <div className="relative h-56 pl-9">
              <div className="absolute inset-x-0 bottom-6 top-0">
                {[100, 80, 60, 40, 20, 0].map((p) => (
                  <div key={p} className="absolute left-0 right-0 flex translate-y-1/2 items-center gap-2" style={{ bottom: `${p}%` }}>
                    <span className="w-7 text-right text-[10px] text-[var(--color-text-faint)]">{p}%</span>
                    <span className="h-px flex-1 border-t border-dashed border-[var(--color-border)]" />
                  </div>
                ))}
              </div>
              <div className="absolute inset-y-0 left-9 right-0 flex items-end gap-3 px-1">
                {week.map((w) => (
                  <div key={w.key} className="flex h-full flex-1 flex-col items-center justify-end" title={`${w.date}: ${w.present} present, ${w.absent} absent, ${w.leave} on leave`}>
                    <div className="flex w-full max-w-[46px] flex-col-reverse overflow-hidden rounded-t-lg" style={{ height: "calc(100% - 1.5rem)" }}>
                      {SERIES.map((s) => <div key={s.key} style={{ height: `${(w[s.key] / scale) * 100}%`, background: s.color, opacity: s.key === "present" ? 1 : 0.75 }} />)}
                    </div>
                    <span className={`mt-1.5 h-4 text-[11px] ${w.isToday ? "font-semibold text-[var(--color-text)]" : "text-[var(--color-text-muted)]"}`}>{w.label}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Card>}

        <Card className={`rounded-2xl p-5 ${hasEmployee ? "" : "xl:col-span-3"}`}>
          <CardTitle title={hasEmployee && hasRecruitment ? "Leave & Recruitment" : hasEmployee ? "Leave Applications" : "New Candidates"} to={tab === "leave" ? "/hr/leave" : "/hr/recruitment/candidates"} />
          {hasEmployee && hasRecruitment && <div className="mb-3 grid grid-cols-2 gap-1 rounded-lg bg-[var(--color-surface-2)] p-1">
            {[["leave", "Leave Applications"], ["recruit", "New Candidates"]].map(([id, label]) => (
              <button key={id} type="button" onClick={() => setTab(id)} className={`rounded-md py-1.5 text-[12px] font-medium transition-colors ${tab === id ? "bg-[var(--color-surface)] text-[var(--color-red-hover)] shadow-sm" : "text-[var(--color-text-muted)] hover:text-[var(--color-text)]"}`}>{label}</button>
            ))}
          </div>}
          {!data ? <Skeleton className="h-48 w-full" /> : (() => {
            const rows = tab === "leave"
              ? (data.recentLeave || []).map((l) => ({ key: l.name, name: l.employee_name, sub: `${l.leave_type} · ${dmy(l.from_date)}${l.to_date !== l.from_date ? ` - ${dmy(l.to_date)}` : ""}`, status: l.status }))
              : (data.applicants || []).map((a) => ({ key: a.name, name: a.applicant_name, sub: a.designation || a.job_title || "Talent pool", status: a.custom_ethx_stage || a.status }));
            return rows.length === 0 ? <p className="py-10 text-center text-[13px] text-[var(--color-text-muted)]">{tab === "leave" ? "No leave applications yet." : "No candidates yet."}</p> : (
              <ul className="divide-y divide-[var(--color-border)]">
                {rows.map((r) => (
                  <li key={r.key} className="flex items-center justify-between gap-3 py-2.5">
                    <span className="flex min-w-0 items-center gap-3"><Avatar name={r.name} size={36} /><span className="min-w-0"><span className="block truncate text-[13px] font-medium text-[var(--color-text)]">{r.name}</span><span className="block truncate text-[11px] text-[var(--color-text-muted)]">{r.sub}</span></span></span>
                    <StatusPill status={r.status} />
                  </li>
                ))}
              </ul>
            );
          })()}
        </Card>
      </div>}

      {/* Departments + employee list */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Card className="rounded-2xl p-5">
          <CardTitle title="Employee Statistics" />
          {!employees ? <Skeleton className="mx-auto h-44 w-44 rounded-full" /> : !headcount ? <p className="py-10 text-center text-[13px] text-[var(--color-text-muted)]">No employees yet.</p> : (
            <>
              <div className="relative mx-auto h-44 w-44">
                <svg viewBox="0 0 130 130" className="h-full w-full -rotate-90">
                  <circle cx="65" cy="65" r={R} fill="none" stroke="var(--color-surface-2)" strokeWidth="18" />
                  {arcs.map((a) => <circle key={a.name} cx="65" cy="65" r={R} fill="none" stroke={a.color} strokeWidth="18" strokeDasharray={`${Math.max(a.len - 1.5, 0)} ${C}`} strokeDashoffset={-a.offset} />)}
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center"><span className="text-[15px] font-semibold text-[var(--color-text)]">Total</span><span className="text-[11px] text-[var(--color-text-muted)]">{departments.length} department{departments.length === 1 ? "" : "s"}</span></div>
              </div>
              <div className="mt-4 grid grid-cols-3 gap-x-3 gap-y-3">
                {departments.map((d) => (
                  <div key={d.name} className="min-w-0">
                    <p className="flex items-center gap-1.5 truncate text-[11px] text-[var(--color-text-muted)]" title={d.name}><i className="h-2 w-2 shrink-0 rounded-sm" style={{ background: d.color }} />{d.name}</p>
                    <p className="text-[17px] font-semibold text-[var(--color-text)]">{Math.round((d.n / headcount) * 100)}%</p>
                  </div>
                ))}
              </div>
            </>
          )}
        </Card>

        <Card className="rounded-2xl p-5 xl:col-span-2">
          <CardTitle title="Employee List" to="/hr/employees" />
          {!employees ? <Skeleton className="h-56 w-full" /> : listRows.length === 0 ? <p className="py-10 text-center text-[13px] text-[var(--color-text-muted)]">No employees yet.</p> : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-[13px]">
                <thead><tr className="text-[12px] text-[var(--color-text-muted)]"><th className="px-3 pb-2 font-medium">Name</th><th className="px-3 pb-2 font-medium">Department</th><th className="px-3 pb-2 font-medium">Email</th><th className="px-3 pb-2 font-medium">Status</th></tr></thead>
                <tbody>
                  {listRows.map((e, i) => (
                    <tr key={e.name} className={i % 2 === 0 ? "bg-[var(--color-surface-2)]" : ""}>
                      <td className="rounded-l-lg px-3 py-2.5"><span className="flex items-center gap-2.5"><Avatar name={e.employee_name} image={e.image} size={30} /><span className="truncate text-[var(--color-text)]">{e.employee_name}</span></span></td>
                      <td className="px-3 py-2.5 text-[var(--color-text-muted)]">{shortDept(e.department)}</td>
                      <td className="px-3 py-2.5 text-[var(--color-text-muted)]">{e.company_email || e.user_id || "—"}</td>
                      <td className="rounded-r-lg px-3 py-2.5"><StatusPill status={hasEmployee ? statusToday[e.name] || "Not Marked" : "Active"} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>

      {user && <NeedsAttention user={user} />}
    </div>
  );
}
