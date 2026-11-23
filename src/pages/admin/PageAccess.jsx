import { useMemo, useState } from "react";
import { ListChecks, Lock, Search, ShieldCheck } from "lucide-react";
import { Async, CONTRACTOR_NAV, Empty, EMPLOYEE_NAV, inputCls, Notice, PageHeader, Panel, Tabs } from "../../components/employee/EmployeeShell";
import { Button } from "../../components/ui/primitives";
import { hrNav } from "../../components/layout/HRLayout";
import { pmNav } from "../../components/layout/PMLayout";
import { frappe } from "../../lib/api/frappeClient";
import { clientUsers } from "../../lib/clientPeople";
import { errMsg, useAsync } from "../../lib/employeePortal";
import { confirmDialog } from "../../components/ui/dialogs";
import { ALWAYS_ALLOWED } from "../../permissions/pageAccess";
import { appRolesFor } from "../../permissions/roles";

const SETUP_MISSING = /Failed to get method|not whitelisted|has no attribute|No module named/i;

async function loadPeople() {
  try {
    const [people, scope] = await Promise.all([frappe.callMethod("ethx_page_access_list"), clientUsers()]);
    // Viewing one client: only that client's people (the Administrator is never listed here).
    return { people: scope ? (people || []).filter((p) => scope.has(p.email)) : people, ready: true };
  } catch (e) {
    const d = e?.response?.data || {};
    if (e?.response?.status === 404 || SETUP_MISSING.test(String(d.exception || d.exc || d._server_messages || ""))) return { people: [], ready: false };
    throw e;
  }
}

/** Menu items -> groups of pages. Top-level links go in one "General" group. */
function toGroups(items) {
  const general = [];
  const groups = [];
  for (const item of items) {
    if (item.children) groups.push({ label: item.label, pages: item.children.flatMap((c) => (c.children ? c.children : [c])) });
    else general.push(item);
  }
  return [...(general.length ? [{ label: "General", pages: general }] : []), ...groups];
}

// The roles the Administrator can give anyone. The server accepts only these.
const ROLES = ["Employee", "HR Manager", "HR User", "Projects Manager", "Contractor", "Interviewer", "Leave Approver", "Expense Approver"];

/**
 * Every workspace, taken from the real menus so this list can't drift from what people see. `appRole` says who already has
 * the workspace, and `grant` is the role that ticking one of its pages gives.
 */
const WORKSPACES = (roles) => [
  { title: "Employee Self-Service", appRole: "Employee", grant: "Employee", groups: toGroups(roles.has("Interviewer") ? [...EMPLOYEE_NAV, { to: "/employee/interviews", label: "My Interviews" }] : EMPLOYEE_NAV) },
  { title: "HR Workspace", appRole: "HR User", grant: "HR User", groups: toGroups(hrNav({ permissions: ["dashboard.hr"] })) },
  { title: "Project Manager Workspace", appRole: "Projects Manager", grant: "Projects Manager", groups: toGroups(pmNav({ permissions: ["dashboard.pm"] })) },
  { title: "Contractor Pages", appRole: "Contractor", grant: "Contractor", groups: toGroups(CONTRACTOR_NAV) },
];
const pagesOf = (workspace) => workspace.groups.flatMap((g) => g.pages);

const roleLabel = (roles) => roles.filter((r) => ROLES.includes(r)).join(", ") || "No role";
const sameSet = (set, list) => set.size === list.length && list.every((x) => set.has(x));

export default function PageAccess() {
  const data = useAsync(loadPeople, []);
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState(null);
  const people = useMemo(() => (data.data?.people || []).filter((p) => !q || `${p.name} ${p.email}`.toLowerCase().includes(q.toLowerCase())), [data.data, q]);
  const person = (data.data?.people || []).find((p) => p.email === selected);

  return (
    <div className="space-y-5">
      <PageHeader icon={ListChecks} title="Access Control" subtitle="Choose each person's roles and the pages they can open. Ticking a page in another workspace also gives them that workspace's role. Changes apply at their next sign-in." />
      <Async state={data}>
        {({ ready }) => (!ready ? <Notice>Access Control is being set up. It's applied automatically for the Administrator - reload this page in a minute, or use <b>Apply Again</b> on Roles &amp; Permissions.</Notice> : (
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-[320px_minmax(0,1fr)]">
            <Panel title="People">
              <label className="relative mb-3 block">
                <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--color-text-faint)]" />
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name or email…" aria-label="Search people" className={`${inputCls} pl-8`} />
              </label>
              {people.length === 0 ? <Empty text="No one matches." /> : (
                <ul className="max-h-[60vh] space-y-1 overflow-y-auto">
                  {people.map((p) => (
                    <li key={p.email}>
                      <button type="button" onClick={() => setSelected(p.email)} className={`w-full rounded-md px-3 py-2 text-left transition-colors ${selected === p.email ? "bg-[var(--color-red-wash)]" : "hover:bg-[var(--color-surface-2)]"}`}>
                        <span className="block truncate text-[13px] text-[var(--color-text)]">{p.name}</span>
                        <span className="block truncate text-[11px] text-[var(--color-text-faint)]">{roleLabel(p.roles)}{p.denied.length ? ` · ${p.denied.length} blocked` : ""}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
            {person ? <AccessEditor key={person.email} person={person} onSaved={() => data.reload()} /> : <Panel><Empty icon={ShieldCheck} text="Choose a person to set their roles and pages." /></Panel>}
          </div>
        ))}
      </Async>
    </div>
  );
}

function AccessEditor({ person, onSaved }) {
  const heldRoles = person.roles.filter((r) => ROLES.includes(r));
  const [roles, setRoles] = useState(() => new Set(heldRoles));
  const [denied, setDenied] = useState(() => new Set(person.denied));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const workspaces = useMemo(() => WORKSPACES(roles), [roles]);
  const appRoles = appRolesFor([...roles]);
  const hasWorkspace = (w) => appRoles.includes(w.appRole);
  const dirty = !sameSet(denied, person.denied) || !sameSet(roles, heldRoles);
  // One workspace at a time: the first one they have, else the first.
  const [ws, setWs] = useState(() => (workspaces.find((w) => appRolesFor(heldRoles).includes(w.appRole)) || workspaces[0]).title);
  const current = workspaces.find((w) => w.title === ws) || workspaces[0];
  const openCount = (w) => pagesOf(w).filter((p) => !ALWAYS_ALLOWED.has(p.to) && !denied.has(p.to)).length;

  /** Tick or untick pages. A page in a workspace they don't have gives them its role, with only the ticked pages open. */
  const change = (workspace, pages, allow) => {
    setSaved(false);
    const opening = allow && !hasWorkspace(workspace);
    if (opening) setRoles((r) => new Set(r).add(workspace.grant));
    setDenied((d) => {
      const next = new Set(d);
      if (opening) pagesOf(workspace).forEach((p) => next.add(p.to));
      pages.forEach((p) => { if (allow) next.delete(p.to); else next.add(p.to); });
      return next;
    });
  };

  /** A role ticked on its own opens all of its workspace's pages; losing a workspace forgets which of its pages were blocked. */
  const changeRole = (role, on) => {
    setSaved(false);
    const next = new Set(roles);
    if (on) next.add(role); else next.delete(role);
    setRoles(next);
    const nextApp = appRolesFor([...next]);
    const changed = WORKSPACES(next).filter((w) => appRoles.includes(w.appRole) !== nextApp.includes(w.appRole));
    if (changed.length) setDenied((d) => {
      const left = new Set(d);
      changed.forEach((w) => pagesOf(w).forEach((p) => left.delete(p.to)));
      return left;
    });
  };

  async function save() {
    const roleText = [...roles].join(", ") || "no role";
    const warning = appRoles.length ? "" : " With no workspace role they won't be able to open anything.";
    if (!(await confirmDialog({ title: "Save Access", message: `Give ${person.name} ${roleText}, with ${denied.size} page(s) blocked? This applies the next time they sign in.${warning}`, confirmLabel: "Save" }))) return;
    setBusy(true);
    setError("");
    try {
      const result = await frappe.callMethod("ethx_set_page_access", { user: person.email, denied: JSON.stringify([...denied]), roles: JSON.stringify([...roles]) });
      if (!result?.roles) setError("Access Control needs updating. Use Apply Again on Admin › Roles & Permissions, then save again.");
      else {
        const dropped = [...roles].filter((r) => !result.roles.includes(r));
        if (dropped.length) setError(`ERPNext didn't keep ${dropped.join(", ")} for ${person.name}. The Employee role needs a linked employee profile, so create one first.`);
        else setSaved(true);
        onSaved();
      }
    } catch (e) {
      setError(errMsg(e, "Couldn't save access."));
    }
    setBusy(false);
  }

  return (
    <Panel title={person.name} hint={`${person.email} · ${roleLabel(person.roles)}`} action={<Button type="button" onClick={save} disabled={busy || !dirty}>{busy ? "Saving…" : "Save Access"}</Button>}>
      {error && <div className="mb-3"><Notice>{error}</Notice></div>}
      {saved && !dirty && <div className="mb-3"><Notice tone="info">Saved. It applies the next time {person.name} signs in.</Notice></div>}
      <div className="space-y-5">
        <section>
          <h3 className="mb-2 text-[13px] font-semibold text-[var(--color-text)]">Roles</h3>
          <div className="grid grid-cols-1 gap-x-4 gap-y-1.5 rounded-lg border border-[var(--color-border)] p-3 sm:grid-cols-2 xl:grid-cols-4">
            {ROLES.map((r) => (
              <label key={r} className="flex items-center gap-2 text-[12.5px] text-[var(--color-text)]">
                <input type="checkbox" checked={roles.has(r)} onChange={(e) => changeRole(r, e.target.checked)} />
                {r}
              </label>
            ))}
          </div>
        </section>
        <section className="space-y-3">
          <Tabs value={current.title} onChange={setWs} tabs={workspaces.map((w) => ({ id: w.title, label: w.title.replace(" Workspace", "").replace(" Pages", ""), count: hasWorkspace(w) ? openCount(w) : undefined }))} />
        {[current].map((w) => { const on = hasWorkspace(w); return (
          <section key={w.title}>
            {!on && <p className="mb-3 text-[12px] text-[var(--color-text-muted)]">Not assigned. Ticking a page here gives {person.name} the {w.grant} role with only the ticked pages open.</p>}
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
              {w.groups.map((g) => {
                const open = g.pages.filter((p) => !ALWAYS_ALLOWED.has(p.to));
                const allOn = on && open.every((p) => !denied.has(p.to));
                return (
                  <fieldset key={g.label} className="rounded-lg border border-[var(--color-border)] px-3 pb-3 pt-1">
                    <legend className="px-1 text-[12px] font-medium text-[var(--color-text-muted)]">{g.label}</legend>
                    {open.length > 1 && <button type="button" onClick={() => change(w, open, !allOn)} className="mb-1.5 text-[11px] text-[var(--color-red-hover)] hover:underline">{allOn ? "Untick All" : "Tick All"}</button>}
                    <div className="space-y-1">
                      {g.pages.map((p) => (ALWAYS_ALLOWED.has(p.to) ? (
                        <p key={p.to} className="flex items-center gap-2 text-[12.5px] text-[var(--color-text-muted)]"><Lock size={12} /> {p.label} ({on ? "always on" : "comes with this workspace"})</p>
                      ) : (
                        <label key={p.to} className="flex items-center gap-2 text-[12.5px] text-[var(--color-text)]">
                          <input type="checkbox" checked={on && !denied.has(p.to)} onChange={(e) => change(w, [p], e.target.checked)} />
                          {p.label}
                        </label>
                      )))}
                    </div>
                  </fieldset>
                );
              })}
            </div>
          </section>
        ); })}
        </section>
      </div>
    </Panel>
  );
}
