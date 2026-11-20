// The super admin's dashboard (the Administrator account). HRMS 360 is sold per company, so this looks across every
// client at once: how big each one is, which modules it has, who runs it, and what needs support. Other admins keep
// the company dashboard (Dashboard.jsx). Lists here compare clients, so the client scope is left off (allCompanies).
import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AlertTriangle, ArrowRight, Boxes, BriefcaseBusiness, Building2, CheckCircle2, GraduationCap, KeyRound, Plus, ShieldAlert, UserSearch, Users } from "lucide-react";
import { frappe } from "../../lib/api/frappeClient";
import { MODULE_SETTINGS, MODULES, PRODUCT_NAME, SUPER_ADMIN } from "../../lib/modules";
import { useClientScope } from "../../lib/clientScope";
import { useBranding } from "../../context/BrandingContext";
import { useAsync } from "../../lib/employeePortal";
import { AddCompanyModal } from "../../components/admin/AddCompanyModal";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const greeting = (h) => (h < 12 ? "Good Morning" : h < 17 ? "Good Afternoon" : "Good Evening");
const MODULE_ICONS = { employee: Users, recruitment: UserSearch, projects: BriefcaseBusiness, learning: GraduationCap };
const SHORT = { employee: "Employee", recruitment: "Recruitment", projects: "Projects", learning: "L&D" };
const STAFF_ROLES = ["System Manager", "HR Manager", "HR User", "Projects Manager"];
const parse = (raw) => String(raw || "").split(",").map((x) => x.trim()).filter((id) => MODULES.some((m) => m.id === id));
const initials = (c) => (c.abbr || String(c.company_name || c.name).split(/\s+/).map((w) => w[0]).join("")).slice(0, 3).toUpperCase();

async function load() {
  const [companies, employees, users, roles, tied, defaults] = await Promise.all([
    frappe.getList("Company", { fields: ["name", "company_name", "abbr", "country", "creation"], orderBy: "name asc", limit: 0 }),
    frappe.getList("Employee", { filters: [["status", "=", "Active"]], fields: ["company", "user_id"], limit: 0, allCompanies: true }),
    frappe.getList("User", { filters: [["enabled", "=", 1], ["user_type", "=", "System User"]], fields: ["name"], limit: 0 }).catch(() => []),
    frappe.getList("Has Role", { parent: "User", filters: [["parenttype", "=", "User"], ["role", "in", STAFF_ROLES]], fields: ["parent", "role"], limit: 0 }).catch(() => []),
    frappe.getList("User Permission", { filters: [["allow", "=", "Company"]], fields: ["user", "for_value"], limit: 0 }).catch(() => []),
    frappe.getDoc("Global Defaults", "Global Defaults").catch(() => null),
  ]);
  let modulesReady = true;
  let saved = {};
  try {
    const rows = await frappe.getList(MODULE_SETTINGS, { fields: ["name", "disabled_modules"], limit: 0 });
    saved = Object.fromEntries(rows.map((r) => [r.name, parse(r.disabled_modules)]));
  } catch {
    modulesReady = false;
  }

  const enabled = new Set(users.map((u) => u.name));
  const tiedTo = Object.fromEntries(tied.map((p) => [p.user, p.for_value]));
  const empCompany = Object.fromEntries(employees.filter((e) => e.user_id).map((e) => [e.user_id, e.company]));
  const defaultCompany = defaults?.default_company || null;

  // Staff accounts (admins, HR, Project Managers) and the company each one runs.
  const rolesOf = {};
  for (const r of roles) if (r.parent !== SUPER_ADMIN && enabled.has(r.parent)) (rolesOf[r.parent] ||= new Set()).add(r.role);
  const staff = Object.entries(rolesOf).map(([user, set]) => ({ user, roles: set, company: tiedTo[user] || empCompany[user] || defaultCompany, tied: Boolean(tiedTo[user]) }));

  const clients = companies.map((c) => {
    const team = staff.filter((s) => s.company === c.name);
    const people = employees.filter((e) => e.company === c.name);
    const off = saved[c.name] || [];
    return {
      ...c,
      employees: people.length,
      logins: people.filter((e) => e.user_id && enabled.has(e.user_id)).length,
      admins: team.filter((s) => s.roles.has("System Manager")).length,
      hr: team.filter((s) => s.roles.has("HR Manager") || s.roles.has("HR User")).length,
      pms: team.filter((s) => s.roles.has("Projects Manager")).length,
      on: MODULES.filter((m) => !off.includes(m.id)).map((m) => m.id),
    };
  });

  return {
    clients,
    modulesReady,
    employees: employees.length,
    accounts: [...enabled].filter((u) => u !== SUPER_ADMIN).length,
    untied: staff.filter((s) => !s.tied),
  };
}

function Stat({ icon: Icon, label, value, sub, accent }) {
  return (
    <div className="relative overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
      <div className="pointer-events-none absolute -right-6 -top-6 h-24 w-24 rounded-full opacity-[0.12] blur-2xl" style={{ background: accent }} />
      <div className="flex items-center justify-between">
        <span className="text-[12px] font-medium text-[var(--color-text-muted)]">{label}</span>
        <span className="flex h-9 w-9 items-center justify-center rounded-lg" style={{ background: `color-mix(in srgb, ${accent} 16%, transparent)`, color: accent }}><Icon size={17} strokeWidth={1.9} /></span>
      </div>
      <div className="mt-3 text-3xl font-semibold tracking-tight text-[var(--color-text)]">{value ?? <span className="inline-block h-8 w-14 animate-pulse rounded bg-[var(--color-surface-2)]" />}</div>
      <div className="mt-1 text-[12px] text-[var(--color-text-muted)]">{sub}</div>
    </div>
  );
}

const Card = ({ title, hint, action, children, className = "" }) => (
  <section className={`rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 ${className}`}>
    <div className="mb-4 flex items-start justify-between gap-3">
      <div>
        <h2 className="text-[13px] font-semibold text-[var(--color-text)]">{title}</h2>
        {hint && <p className="mt-0.5 text-[12px] text-[var(--color-text-muted)]">{hint}</p>}
      </div>
      {action}
    </div>
    {children}
  </section>
);

export default function SuperAdminDashboard() {
  const data = useAsync(load, []);
  const client = useClientScope();
  const { selectCompany } = useBranding();
  const navigate = useNavigate();
  const [adding, setAdding] = useState(false);
  const now = useMemo(() => new Date(), []);
  const d = data.data;
  const clients = d?.clients || [];

  // Open a client: it becomes the client being viewed, on its Modules & People page.
  const open = (name) => { if (name !== client) selectCompany(name); navigate("/admin/modules"); };

  const sold = clients.reduce((n, c) => n + c.on.length, 0);
  const attention = d ? [
    !d.modulesReady && { tone: "red", text: "Modules aren't installed on this site yet, so every client has every module.", to: "/admin/roles", cta: "Apply Again" },
    d.untied.length > 0 && { tone: "red", text: `${d.untied.length} staff ${d.untied.length === 1 ? "account isn't" : "accounts aren't"} assigned to a company and can see every client's data.`, to: "/admin/users", cta: "Review" },
    ...clients.filter((c) => !c.admins && !c.hr).map((c) => ({ tone: "amber", text: `${c.company_name || c.name} has no admin or HR assigned.`, client: c.name, cta: "Assign" })),
    ...clients.filter((c) => !c.employees).map((c) => ({ tone: "amber", text: `${c.company_name || c.name} has no active employees yet.`, client: c.name, cta: "Open" })),
  ].filter(Boolean) : [];

  return (
    <div className="space-y-6">
      {/* Hero */}
      <section className="relative overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] px-7 py-7">
        <div className="pointer-events-none absolute inset-0" style={{ background: "radial-gradient(600px 220px at 100% 0%, color-mix(in srgb, var(--color-red) 22%, transparent), transparent 70%), radial-gradient(400px 200px at 0% 100%, color-mix(in srgb, var(--color-red) 8%, transparent), transparent 70%)" }} />
        <div className="relative flex flex-wrap items-center justify-between gap-5">
          <div>
            <p className="text-[12px] font-medium uppercase tracking-[0.14em] text-[var(--color-red-hover)]">{DAYS[now.getDay()]}, {String(now.getDate()).padStart(2, "0")} {MONTHS[now.getMonth()]} {now.getFullYear()}</p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-[var(--color-text)]">{greeting(now.getHours())}, Administrator</h2>
            <p className="mt-1.5 text-[13px] text-[var(--color-text-muted)]">
              {d ? `${PRODUCT_NAME} runs ${clients.length} ${clients.length === 1 ? "client" : "clients"} with ${d.employees} active employees.${attention.length ? ` ${attention.length} ${attention.length === 1 ? "thing needs" : "things need"} your attention.` : " Everything looks in order."}` : "Loading your clients…"}
            </p>
          </div>
          <div className="flex flex-wrap gap-2.5">
            <button type="button" onClick={() => setAdding(true)} className="flex items-center gap-2 rounded-lg bg-[var(--color-red)] px-4 py-2.5 text-[13px] font-medium text-[var(--color-on-accent)] transition-colors hover:bg-[var(--color-red-hover)]"><Plus size={15} /> Add Company</button>
            <Link to="/admin/modules" className="flex items-center gap-2 rounded-lg border border-[var(--color-border-strong)] bg-[var(--color-surface-2)] px-4 py-2.5 text-[13px] font-medium text-[var(--color-text)] transition-colors hover:border-[var(--color-text-faint)]"><Boxes size={15} /> Modules &amp; People</Link>
          </div>
        </div>
      </section>

      {/* Totals across every client */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat icon={Building2} label="Clients" value={d ? clients.length : undefined} sub="Companies on this site" accent="var(--color-amber)" />
        <Stat icon={Users} label="Active Employees" value={d?.employees} sub="Across all clients" accent="var(--color-green)" />
        <Stat icon={KeyRound} label="User Accounts" value={d?.accounts} sub="Enabled sign-ins" accent="#4f8cff" />
        <Stat icon={Boxes} label="Modules In Use" value={d ? `${sold}/${clients.length * MODULES.length}` : undefined} sub="Switched on across clients" accent="var(--color-red-hover)" />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        {/* Every client */}
        <Card title="Clients" hint="Open a client to set its modules and the people who run it." className="xl:col-span-2">
          {!d ? <div className="h-40 animate-pulse rounded-lg bg-[var(--color-surface-2)]" /> : !clients.length ? (
            <div className="flex h-40 flex-col items-center justify-center gap-2 text-[13px] text-[var(--color-text-muted)]">
              No clients yet.
              <button type="button" onClick={() => setAdding(true)} className="text-[var(--color-red-hover)] hover:underline">Add the First Company</button>
            </div>
          ) : (
            <div className="-mx-2 overflow-x-auto">
              <table className="w-full min-w-[620px] text-left text-[12.5px]">
                <thead>
                  <tr className="text-[11px] uppercase tracking-wide text-[var(--color-text-faint)]">
                    <th className="px-2 pb-2 font-medium">Client</th>
                    <th className="px-2 pb-2 font-medium">Employees</th>
                    <th className="px-2 pb-2 font-medium">Team</th>
                    <th className="px-2 pb-2 font-medium">Modules</th>
                    <th className="px-2 pb-2" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--color-border)]">
                  {clients.map((c) => (
                    <tr key={c.name} className={c.name === client ? "bg-[color-mix(in_srgb,var(--color-red)_6%,transparent)]" : ""}>
                      <td className="px-2 py-2.5">
                        <div className="flex items-center gap-2.5">
                          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[10px] font-semibold text-white" style={{ background: "linear-gradient(135deg, var(--color-red), var(--color-red-deep))" }}>{initials(c)}</span>
                          <span className="min-w-0">
                            <span className="block truncate font-medium text-[var(--color-text)]">{c.company_name || c.name}</span>
                            <span className="block truncate text-[11px] text-[var(--color-text-muted)]">{[c.country, c.name === client && "Viewing now"].filter(Boolean).join(" · ") || "—"}</span>
                          </span>
                        </div>
                      </td>
                      <td className="px-2 py-2.5 text-[var(--color-text)]">{c.employees}<span className="ml-1 text-[11px] text-[var(--color-text-muted)]">· {c.logins} with login</span></td>
                      <td className="px-2 py-2.5 text-[11.5px] text-[var(--color-text-muted)]">
                        {c.admins + c.hr + c.pms ? [c.admins && `${c.admins} Admin`, c.hr && `${c.hr} HR`, c.pms && `${c.pms} PM`].filter(Boolean).join(" · ") : <span className="text-[var(--color-amber)]">No one assigned</span>}
                      </td>
                      <td className="px-2 py-2.5">
                        <div className="flex flex-wrap gap-1">
                          {MODULES.map((m) => {
                            const has = c.on.includes(m.id);
                            return <span key={m.id} title={`${m.label}: ${has ? "included" : "switched off"}`} className={`rounded-md px-1.5 py-0.5 text-[10.5px] font-medium ${has ? "bg-[var(--color-red-wash)] text-[var(--color-red-hover)]" : "bg-[var(--color-surface-2)] text-[var(--color-text-faint)] line-through"}`}>{SHORT[m.id]}</span>;
                          })}
                        </div>
                      </td>
                      <td className="px-2 py-2.5 text-right">
                        <button type="button" onClick={() => open(c.name)} className="inline-flex items-center gap-1 text-[12px] font-medium text-[var(--color-red-hover)] hover:underline">Open <ArrowRight size={12} /></button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        {/* Support */}
        <Card title="Needs Attention" hint="Setup gaps that clients may call support about.">
          {!d ? <div className="h-40 animate-pulse rounded-lg bg-[var(--color-surface-2)]" /> : !attention.length ? (
            <div className="flex h-40 flex-col items-center justify-center gap-2 text-center text-[13px] text-[var(--color-text-muted)]">
              <CheckCircle2 size={22} className="text-[var(--color-green)]" />
              Every client is set up.
            </div>
          ) : (
            <ul className="space-y-2">
              {attention.slice(0, 7).map((a, i) => (
                <li key={i} className="flex items-start gap-2.5 rounded-lg border border-[var(--color-border)] px-3 py-2.5">
                  {a.tone === "red" ? <ShieldAlert size={15} className="mt-0.5 shrink-0 text-[var(--color-red-hover)]" /> : <AlertTriangle size={15} className="mt-0.5 shrink-0 text-[var(--color-amber)]" />}
                  <span className="min-w-0 flex-1 text-[12.5px] text-[var(--color-text)]">{a.text}</span>
                  {a.to ? <Link to={a.to} className="shrink-0 text-[12px] font-medium text-[var(--color-red-hover)] hover:underline">{a.cta}</Link>
                    : <button type="button" onClick={() => open(a.client)} className="shrink-0 text-[12px] font-medium text-[var(--color-red-hover)] hover:underline">{a.cta}</button>}
                </li>
              ))}
              {attention.length > 7 && <li className="px-1 text-[11.5px] text-[var(--color-text-muted)]">and {attention.length - 7} more</li>}
            </ul>
          )}
        </Card>
      </div>

      {/* Module adoption */}
      <Card title="Modules Across Clients" hint="How many clients have each part of the product.">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {MODULES.map((m) => {
            const Icon = MODULE_ICONS[m.id] || Boxes;
            const count = clients.filter((c) => c.on.includes(m.id)).length;
            const pct = clients.length ? Math.round((count / clients.length) * 100) : 0;
            return (
              <div key={m.id} className="rounded-xl border border-[var(--color-border)] p-4">
                <div className="flex items-center gap-2.5">
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--color-red-wash)] text-[var(--color-red-hover)]"><Icon size={16} /></span>
                  <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-[var(--color-text)]">{m.label}</span>
                </div>
                <div className="mt-3 flex items-baseline justify-between">
                  <span className="text-xl font-semibold text-[var(--color-text)]">{d ? count : "–"}<span className="ml-1 text-[12px] font-normal text-[var(--color-text-muted)]">of {clients.length} clients</span></span>
                  <span className="text-[12px] text-[var(--color-text-muted)]">{pct}%</span>
                </div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[var(--color-surface-2)]">
                  <div className="h-full rounded-full" style={{ width: `${pct}%`, background: "linear-gradient(90deg, var(--color-red-deep), var(--color-red-hover))" }} />
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      {adding && <AddCompanyModal onClose={() => setAdding(false)} onAdded={(name) => { setAdding(false); selectCompany(name); navigate("/admin/modules"); }} />}
    </div>
  );
}
