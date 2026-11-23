// Admin › Modules & People: the super admin's page for the client chosen in the sidebar - the one place a company is picked.
// The super admin adds companies, decides which HRMS 360 modules each one has, and assigns the people who run it
// (admins, HR and Project Managers are tied to their company with an ERPNext "Company" user permission). Only the
// Administrator account can open it (permissions/pageAccess.js).
import { useMemo, useState } from "react";
import { Boxes, Building2, BriefcaseBusiness, ClipboardList, GraduationCap, KeyRound, ShieldCheck, UserCog, UserPlus, UserSearch, Users } from "lucide-react";
import { frappe } from "../../lib/api/frappeClient";
import { Button } from "../../components/ui/primitives";
import { Async, Empty, Field, inputCls, Modal, Notice, PageHeader, Panel } from "../../components/employee/EmployeeShell";
import { confirmDialog } from "../../components/ui/dialogs";
import { errMsg, useAsync } from "../../lib/employeePortal";
import { MODULE_SETTINGS, MODULES, PRODUCT_NAME, SUPER_ADMIN } from "../../lib/modules";
import { useClientScope } from "../../lib/clientScope";
import { setUserCompany } from "./Users";

const ICONS = { employee: Users, recruitment: UserSearch, projects: BriefcaseBusiness, learning: GraduationCap };
const ROLE_LABELS = [["System Manager", "Admin"], ["HR Manager", "HR Manager"], ["HR User", "HR User"], ["Projects Manager", "Project Manager"]];
const STAFF_ROLES = ROLE_LABELS.map(([r]) => r);
const parse = (raw) => String(raw || "").split(",").map((x) => x.trim()).filter((id) => MODULES.some((m) => m.id === id));
const missing = (e) => e?.response?.status === 404 || /DoesNotExist|not found/i.test(String(e?.response?.data?.exc_type || e?.response?.data?.exception || ""));

async function load(client) {
  const [company, employees, users, roles, tied, defaults] = await Promise.all([
    frappe.getDoc("Company", client),
    frappe.getList("Employee", { filters: [["company", "=", client], ["status", "=", "Active"]], fields: ["name", "employee_name", "user_id"], limit: 0 }),
    frappe.getList("User", { filters: [["enabled", "=", 1], ["user_type", "=", "System User"]], fields: ["name", "full_name"], orderBy: "full_name asc", limit: 0 }).catch(() => []),
    frappe.getList("Has Role", { parent: "User", filters: [["parenttype", "=", "User"], ["role", "in", STAFF_ROLES]], fields: ["parent", "role"], limit: 0 }).catch(() => []),
    frappe.getList("User Permission", { filters: [["allow", "=", "Company"]], fields: ["user", "for_value"], limit: 0 }).catch(() => []),
    frappe.getDoc("Global Defaults", "Global Defaults").catch(() => null),
  ]);

  let modulesReady = true;
  let record = null;
  try {
    const rows = await frappe.getList(MODULE_SETTINGS, { filters: [["name", "=", client]], fields: ["name", "disabled_modules"], limit: 1 });
    record = rows[0] || null;
  } catch (e) {
    if (!missing(e)) throw e;
    modulesReady = false;
  }

  const tiedTo = Object.fromEntries(tied.map((p) => [p.user, p.for_value]));
  const empUsers = new Set(employees.map((e) => e.user_id).filter(Boolean));
  const isDefault = defaults?.default_company === client;
  // People who run this company: staff roles, tied to it - or, untied, its employees (or anyone, for the default company).
  const belongs = (u) => (tiedTo[u] ? tiedTo[u] === client : empUsers.has(u) || isDefault);
  const rolesOf = {};
  for (const r of roles) (rolesOf[r.parent] ||= []).push(r.role);
  const staff = users
    .filter((u) => u.name !== SUPER_ADMIN && rolesOf[u.name] && belongs(u.name))
    .map((u) => ({ user: u.name, name: u.full_name || u.name, roles: rolesOf[u.name], tied: tiedTo[u.name] === client }));

  return {
    company,
    isDefault,
    modulesReady,
    hasRecord: Boolean(record),
    off: parse(record?.disabled_modules),
    employees: employees.length,
    logins: empUsers.size,
    staff,
    // Accounts that can be assigned here: everyone not already tied to this company.
    assignable: users.filter((u) => u.name !== SUPER_ADMIN && tiedTo[u.name] !== client).map((u) => ({ ...u, current: tiedTo[u.name] || "" })),
  };
}

export default function Companies() {
  const client = useClientScope();
  const data = useAsync(() => (client ? load(client) : Promise.resolve(null)), [client]);
  const [assigning, setAssigning] = useState(false);

  return (
    <div className="space-y-5">
      <PageHeader icon={Building2} title="Modules & People" subtitle={`Which parts of ${PRODUCT_NAME} the client has, and who runs it. Choose or add the client in the sidebar.`} />
      {!client ? (
        <Panel><Empty icon={Building2} text="Choose a client under Viewing Client in the sidebar, or add the first one with + Add there." /></Panel>
      ) : (
        <Async state={data}>
          {(d) => d && <CompanyView d={d} reload={data.reload} onAssign={() => setAssigning(true)} />}
        </Async>
      )}
      {assigning && data.data && <AssignUser company={client} people={data.data.assignable} onClose={() => setAssigning(false)} onDone={() => { setAssigning(false); data.reload(); }} />}
    </div>
  );
}

function CompanyView({ d, reload, onAssign }) {
  const { company } = d;
  const [draft, setDraft] = useState(null); // Set of switched-off module ids while editing
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const off = useMemo(() => draft || new Set(d.off), [draft, d.off]);
  const changed = Boolean(draft) && (draft.size !== d.off.length || [...draft].some((id) => !d.off.includes(id)));
  const count = (label) => d.staff.filter((p) => roleLabel(p.roles) === label).length;

  const toggle = (id) => {
    setMsg(null);
    const next = new Set(off);
    if (next.has(id)) next.delete(id); else next.add(id);
    setDraft(next);
  };

  async function saveModules() {
    const on = MODULES.filter((m) => !off.has(m.id)).map((m) => m.label);
    const gone = MODULES.filter((m) => off.has(m.id)).map((m) => m.label);
    if (!(await confirmDialog({ title: "Save Modules", message: `${company.name} - ${on.length ? `Included: ${on.join(", ")}.` : "No modules - only the base (dashboards, employees, profiles) stays."}${gone.length ? ` Switched off for this company's people: ${gone.join(", ")}.` : ""} They see the change the next time they open or refresh the app.`, confirmLabel: "Save" }))) return;
    setBusy(true);
    setMsg(null);
    try {
      const value = MODULES.filter((m) => off.has(m.id)).map((m) => m.id).join(",");
      if (d.hasRecord) await frappe.updateDoc(MODULE_SETTINGS, company.name, { disabled_modules: value });
      else await frappe.createDoc(MODULE_SETTINGS, { company: company.name, disabled_modules: value });
      setDraft(null);
      setMsg({ ok: true, text: "Modules saved. This company's people see the change on their next refresh." });
      reload();
    } catch (e) {
      setMsg({ ok: false, text: errMsg(e, "Couldn't save the modules.") });
    }
    setBusy(false);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <h2 className="text-[17px] font-semibold text-[var(--color-text)]">{company.company_name || company.name}</h2>
        {d.isDefault && <span className="rounded-full bg-[var(--color-surface-2)] px-2 py-0.5 text-[11px] text-[var(--color-text-muted)]">Default Company</span>}
        <span className="text-[12px] text-[var(--color-text-muted)]">{[company.abbr, company.country, company.default_currency].filter(Boolean).join(" · ")}</span>
      </div>

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-5">
        <Tile icon={Users} label="Active Employees" value={d.employees} />
        <Tile icon={KeyRound} label="With a Login" value={d.logins} />
        <Tile icon={ShieldCheck} label="Admins" value={count("Admin")} />
        <Tile icon={UserCog} label="HR Team" value={count("HR Manager") + count("HR User")} />
        <Tile icon={ClipboardList} label="Project Managers" value={count("Project Manager")} />
      </div>

      {msg && <Notice tone={msg.ok ? "info" : "error"}>{msg.text}</Notice>}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Panel title="Modules" hint="What this company's people can use. You always see every module."
          action={d.modulesReady && <Button onClick={saveModules} disabled={busy || !changed}>{busy ? "Saving…" : "Save Modules"}</Button>}>
          {!d.modulesReady ? (
            <Notice>Modules aren't set up on this site yet. Use <b>Apply Again</b> on Admin › Roles &amp; Permissions. Until then every company has every module.</Notice>
          ) : (
            <div className="space-y-2">
              {MODULES.map((m) => {
                const Icon = ICONS[m.id] || Boxes;
                const on = !off.has(m.id);
                return (
                  <button key={m.id} type="button" onClick={() => toggle(m.id)} aria-pressed={on} title={m.hint}
                    className={`flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors ${on ? "border-[var(--color-red-deep)]" : "border-[var(--color-border)] opacity-70 hover:opacity-100"}`}>
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg" style={{ background: on ? "var(--color-red-wash)" : "var(--color-surface-2)", color: on ? "var(--color-red-hover)" : "var(--color-text-muted)" }}><Icon size={16} /></span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[13px] font-medium text-[var(--color-text)]">{m.label}</span>
                      <span className="block truncate text-[11.5px] text-[var(--color-text-muted)]">{m.hint}</span>
                    </span>
                    <span className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${on ? "bg-[var(--color-red)]" : "bg-[var(--color-border-strong)]"}`}><span className={`inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${on ? "translate-x-5" : "translate-x-0.5"}`} /></span>
                  </button>
                );
              })}
              <p className="pt-1 text-[11.5px] text-[var(--color-text-faint)]">Always included: dashboards, employees and profiles, organisation setup and the admin pages.</p>
            </div>
          )}
        </Panel>

        <Panel title="Who Runs This Company" hint="Admins, HR and Project Managers assigned here. They only see this company's records."
          action={<Button variant="secondary" onClick={onAssign}><UserPlus size={14} className="mr-1 inline" />Assign User</Button>}>
          {!d.staff.length ? (
            <Empty icon={ShieldCheck} text="No one assigned yet. Use Assign User, or create HR users and Project Managers under Users." />
          ) : (
            <ul className="divide-y divide-[var(--color-border)]">
              {d.staff.map((p) => (
                <li key={p.user} className="flex items-center justify-between gap-3 py-2.5">
                  <span className="min-w-0">
                    <span className="block truncate text-[13px] font-medium text-[var(--color-text)]">{p.name}</span>
                    <span className="block truncate text-[11.5px] text-[var(--color-text-muted)]">{p.user}{p.tied ? "" : " · not assigned yet - sees every company"}</span>
                  </span>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] ${p.tied ? "bg-[var(--color-surface-2)] text-[var(--color-text-muted)]" : "bg-[var(--color-red-wash)] text-[var(--color-red-hover)]"}`}>{roleLabel(p.roles)}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  );
}

const roleLabel = (roles) => ROLE_LABELS.find(([r]) => roles.includes(r))?.[1] || "Staff";

function Tile({ icon: Icon, label, value }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3">
      <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--color-red-wash)] text-[var(--color-red-hover)]"><Icon size={16} /></span>
      <span>
        <span className="block text-[18px] font-semibold leading-tight text-[var(--color-text)]">{value}</span>
        <span className="block text-[11.5px] text-[var(--color-text-muted)]">{label}</span>
      </span>
    </div>
  );
}

function AssignUser({ company, people, onClose, onDone }) {
  const [user, setUser] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const picked = people.find((p) => p.name === user);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await setUserCompany(user, company);
      onDone();
    } catch (err) {
      setError(errMsg(err, "Couldn't assign the user."));
      setBusy(false);
    }
  }

  return (
    <Modal title={`Assign a User to ${company}`} onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <Field label="User">
          <select required value={user} onChange={(e) => setUser(e.target.value)} className={inputCls}>
            <option value="">Choose an account…</option>
            {people.map((p) => <option key={p.name} value={p.name}>{p.full_name || p.name} ({p.name}){p.current ? ` - now ${p.current}` : ""}</option>)}
          </select>
        </Field>
        <p className="text-[12px] text-[var(--color-text-muted)]">
          {picked?.current ? `They move from ${picked.current} to ${company} and will only see the records of ${company}.` : `They will only see the employees and records of ${company}.`} Their roles stay as they are - set them under Access Control.
        </p>
        {error && <Notice>{error}</Notice>}
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={busy || !user}>{busy ? "Assigning…" : "Assign"}</Button>
        </div>
      </form>
    </Modal>
  );
}
