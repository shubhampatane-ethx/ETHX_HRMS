import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Building2, Check, Circle, Layers, Plus, ScrollText, ShieldCheck, SlidersHorizontal, UserCog, Users } from "lucide-react";
import { frappe } from "../../lib/api/frappeClient";
import { useAuth } from "../../context/AuthContext";
import { greetingName } from "../../lib/names";
import { Card } from "../../components/ui/primitives";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const QUICK_LINKS = [
  { to: "/admin/users", label: "HR Users", hint: "Create & manage HR", icon: Users },
  { to: "/admin/organization", label: "Organization", hint: "Companies & departments", icon: Building2 },
  { to: "/admin/roles", label: "Roles & Permissions", hint: "Review access", icon: ShieldCheck },
  { to: "/admin/settings", label: "Settings", hint: "Platform options", icon: SlidersHorizontal },
  { to: "/admin/audit-logs", label: "Audit Logs", hint: "Who did what", icon: ScrollText },
];

const greeting = (h) => (h < 12 ? "Good Morning" : h < 17 ? "Good Afternoon" : "Good Evening");

function dmy(value = "") {
  const [y, m, d] = value.slice(0, 10).split("-").map(Number);
  return m ? `${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}/${y}` : "";
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

function SectionTitle({ title, hint, to, linkLabel = "View all" }) {
  return (
    <div className="mb-4 flex items-center justify-between">
      <div>
        <h2 className="text-[13px] font-semibold text-[var(--color-text)]">{title}</h2>
        {hint && <p className="mt-0.5 text-[12px] text-[var(--color-text-muted)]">{hint}</p>}
      </div>
      {to && <Link to={to} className="flex items-center gap-1 text-[12px] text-[var(--color-red-hover)] hover:underline">{linkLabel} <ArrowRight size={12} /></Link>}
    </div>
  );
}

export default function AdminDashboard() {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const now = useMemo(() => new Date(), []);

  useEffect(() => {
    async function load() {
      // HR users = real User records holding an HR role (Has Role rows also exist for reports/pages, so filter on parenttype)
      const hrUsers = frappe
        .getList("Has Role", { parent: "User", filters: [["role", "in", ["HR Manager", "HR User"]], ["parenttype", "=", "User"]], fields: ["parent", "role"], limit: 0 })
        .then(async (rows) => {
          const names = [...new Set(rows.map((r) => r.parent))];
          if (!names.length) return [];
          const users = await frappe.getList("User", { filters: [["name", "in", names]], fields: ["name", "full_name", "enabled", "creation"], limit: 0, orderBy: "creation desc" });
          return users.map((u) => ({ ...u, role: rows.find((r) => r.parent === u.name)?.role }));
        });
      const [users, employees, companies, departments] = await Promise.allSettled([
        hrUsers,
        frappe.getList("Employee", { filters: [["status", "=", "Active"]], fields: ["name"], limit: 0 }),
        frappe.getList("Company", { fields: ["name"], limit: 0 }),
        frappe.getList("Department", { filters: [["is_group", "=", 0]], fields: ["name"], limit: 0 }),
      ]);
      const val = (r) => (r.status === "fulfilled" ? r.value : null);
      setData({ users: val(users), employees: val(employees), companies: val(companies), departments: val(departments) });
    }
    load();
  }, []);

  const users = data?.users;
  const enabledUsers = users?.filter((u) => u.enabled).length;
  const count = (list) => (list ? list.length : data ? "—" : undefined);

  const checklist = [
    { label: "Create Your First HR User", done: users ? users.length > 0 : null, to: "/admin/users", cta: "Create HR" },
    { label: "Set Up a Company", done: data?.companies ? data.companies.length > 0 : null, to: "/admin/organization", cta: "Open" },
    { label: "Add Departments", done: data?.departments ? data.departments.length > 0 : null, to: "/admin/organization", cta: "Open" },
    { label: "Review Roles & Permissions", done: null, to: "/admin/roles", cta: "Review" },
    { label: "HR adds employees", done: data?.employees ? data.employees.length > 0 : null, to: "/admin/organization", cta: null },
  ];
  const measurable = checklist.filter((c) => c.done !== null);
  const doneCount = measurable.filter((c) => c.done).length;
  const progress = measurable.length ? Math.round((doneCount / measurable.length) * 100) : 0;

  return (
    <div className="space-y-6">
      {/* Hero */}
      <section className="relative overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] px-7 py-7">
        <div className="pointer-events-none absolute inset-0" style={{ background: "radial-gradient(600px 220px at 100% 0%, color-mix(in srgb, var(--color-red) 22%, transparent), transparent 70%), radial-gradient(400px 200px at 0% 100%, color-mix(in srgb, var(--color-red) 8%, transparent), transparent 70%)" }} />
        <div className="relative flex flex-wrap items-center justify-between gap-5">
          <div>
            <p className="text-[12px] font-medium uppercase tracking-[0.14em] text-[var(--color-red-hover)]">{DAYS[now.getDay()]}, {String(now.getDate()).padStart(2, "0")} {MONTHS[now.getMonth()]} {now.getFullYear()}</p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-[var(--color-text)]">{greeting(now.getHours())}, {user?.email === "Administrator" ? "Administrator" : greetingName(user?.fullName, user?.email)}</h2>
            <p className="mt-1.5 text-[13px] text-[var(--color-text-muted)]">
              {data ? `${users?.length ?? 0} HR user${users?.length === 1 ? "" : "s"} manage ${data.employees?.length ?? 0} active employees across ${data.companies?.length ?? 0} ${data.companies?.length === 1 ? "company" : "companies"}.` : "Loading your platform…"}
            </p>
          </div>
          <div className="flex flex-wrap gap-2.5">
            <Link to="/admin/users" className="flex items-center gap-2 rounded-lg bg-[var(--color-red)] px-4 py-2.5 text-[13px] font-medium text-[var(--color-on-accent)] transition-colors hover:bg-[var(--color-red-hover)]"><Plus size={15} /> Create HR User</Link>
            <Link to="/admin/organization" className="flex items-center gap-2 rounded-lg border border-[var(--color-border-strong)] bg-[var(--color-surface-2)] px-4 py-2.5 text-[13px] font-medium text-[var(--color-text)] transition-colors hover:border-[var(--color-text-faint)]"><Building2 size={15} /> Organization</Link>
          </div>
        </div>
      </section>

      {/* Stats */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat to="/admin/users" icon={UserCog} label="HR Users" value={count(users)} sub={users ? `${enabledUsers} enabled` : "Manager & User roles"} accent="#4f8cff" />
        <Stat to="/admin/organization" icon={Users} label="Active Employees" value={count(data?.employees)} sub="Across all companies" accent="var(--color-green)" />
        <Stat to="/admin/organization" icon={Building2} label="Companies" value={count(data?.companies)} sub="Registered companies" accent="var(--color-amber)" />
        <Stat to="/admin/organization" icon={Layers} label="Departments" value={count(data?.departments)} sub="Excluding group nodes" accent="var(--color-red-hover)" />
      </div>

      {/* Setup progress + recent HR users */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="rounded-xl p-5 lg:col-span-2">
          <SectionTitle title="Getting Started" hint={data ? `${doneCount} of ${measurable.length} setup steps done` : "Checking your setup…"} />
          <div className="mb-5 h-1.5 overflow-hidden rounded-full bg-[var(--color-surface-2)]">
            <div className="h-full rounded-full transition-all" style={{ width: `${progress}%`, background: "linear-gradient(90deg, var(--color-red-deep), var(--color-red-hover))" }} />
          </div>
          <ul className="divide-y divide-[var(--color-border)]">
            {checklist.map((c) => (
              <li key={c.label} className="flex items-center justify-between gap-4 py-3">
                <div className="flex items-center gap-3">
                  <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${c.done ? "bg-[color-mix(in_srgb,var(--color-green)_20%,transparent)] text-[var(--color-green)]" : "border border-[var(--color-border-strong)] text-[var(--color-text-faint)]"}`}>
                    {c.done ? <Check size={13} strokeWidth={2.5} /> : <Circle size={7} />}
                  </span>
                  <span className={`text-[13px] ${c.done ? "text-[var(--color-text-muted)] line-through decoration-[var(--color-text-faint)]" : "text-[var(--color-text)]"}`}>{c.label}</span>
                </div>
                {c.cta && !c.done && <Link to={c.to} className="flex shrink-0 items-center gap-1 text-[12px] text-[var(--color-red-hover)] hover:underline">{c.cta} <ArrowRight size={12} /></Link>}
              </li>
            ))}
          </ul>
        </Card>

        <Card className="rounded-xl p-5">
          <SectionTitle title="Recent HR Users" to="/admin/users" />
          {!users ? <Skeleton className="h-36 w-full" /> : users.length === 0 ? (
            <div className="flex h-36 flex-col items-center justify-center gap-2 text-center text-[13px] text-[var(--color-text-muted)]">
              No HR users yet.
              <Link to="/admin/users" className="text-[var(--color-red-hover)] hover:underline">Create the First One</Link>
            </div>
          ) : (
            <ul className="space-y-3.5">
              {users.slice(0, 5).map((u) => (
                <li key={u.name} className="flex items-center gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--color-red-wash)] text-[12px] font-semibold text-[var(--color-red-hover)]">{(u.full_name || u.name)[0].toUpperCase()}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-medium text-[var(--color-text)]">{u.full_name || u.name}</p>
                    <p className="truncate text-[11px] text-[var(--color-text-muted)]">{u.role}{u.creation ? ` · added ${dmy(u.creation)}` : ""}</p>
                  </div>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${u.enabled ? "bg-[color-mix(in_srgb,var(--color-green)_16%,transparent)] text-[var(--color-green)]" : "bg-[var(--color-surface-2)] text-[var(--color-text-muted)]"}`}>{u.enabled ? "Enabled" : "Disabled"}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {/* Quick access */}
      <section>
        <h2 className="mb-3 text-[13px] font-semibold text-[var(--color-text)]">Quick Access</h2>
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