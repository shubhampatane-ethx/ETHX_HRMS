import { useMemo, useState } from "react";
import { ListChecks, Lock, Search, ShieldCheck } from "lucide-react";
import { Async, chipCls, CONTRACTOR_NAV, Empty, EMPLOYEE_NAV, inputCls, Notice, PageHeader, Panel } from "../../components/employee/EmployeeShell";
import { Button } from "../../components/ui/primitives";
import { hrNav } from "../../components/layout/HRLayout";
import { pmNav } from "../../components/layout/PMLayout";
import { frappe } from "../../lib/api/frappeClient";
import { errMsg, useAsync } from "../../lib/employeePortal";
import { confirmDialog } from "../../components/ui/dialogs";
import { ALWAYS_ALLOWED } from "../../permissions/pageAccess";
import { rolesToPermissions } from "../../permissions/roles";

const SETUP_MISSING = /Failed to get method|not whitelisted|has no attribute|No module named/i;

async function loadPeople() {
  try {
    return { people: await frappe.callMethod("ethx_page_access_list"), ready: true };
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

/** The pages this person's role allows, taken from the real menus so this list can't drift from what they see. */
function workspacesFor(roles) {
  const contractorOnly = roles.includes("Contractor") && !roles.includes("Projects Manager");
  const out = [];
  if (contractorOnly) return [{ title: "Contractor Pages", groups: toGroups(CONTRACTOR_NAV) }];
  const perms = rolesToPermissions(roles);
  if (perms.includes("dashboard.employee")) out.push({ title: "Employee Self-Service", groups: toGroups(roles.includes("Interviewer") ? [...EMPLOYEE_NAV, { to: "/employee/interviews", label: "My Interviews" }] : EMPLOYEE_NAV) });
  if (perms.includes("dashboard.hr")) out.push({ title: "HR Workspace", groups: toGroups(hrNav({ permissions: ["dashboard.hr"] })) });
  if (perms.includes("dashboard.pm")) out.push({ title: "Project Manager Workspace", groups: toGroups(pmNav({ permissions: ["dashboard.pm"] })) });
  return out;
}

const roleLabel = (roles) => roles.filter((r) => ["HR Manager", "HR User", "Projects Manager", "Employee", "Contractor"].includes(r)).join(", ") || "No workspace role";

export default function PageAccess() {
  const data = useAsync(loadPeople, []);
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState(null);
  const people = useMemo(() => (data.data?.people || []).filter((p) => !q || `${p.name} ${p.email}`.toLowerCase().includes(q.toLowerCase())), [data.data, q]);
  const person = (data.data?.people || []).find((p) => p.email === selected);

  return (
    <div className="space-y-5">
      <PageHeader icon={ListChecks} title="Access Control" subtitle="Choose what each person can open" />
      <Notice tone="info">Every page a person's role allows is ticked by default. Untick a page to remove it from their menu and block it. To open pages outside their role (such as HR pages), give them that role. Changes apply the next time they sign in.</Notice>
      <Async state={data}>
        {({ ready }) => (!ready ? <Notice>Access Control isn't set up yet. Run <b>System Setup › Run setup</b> first.</Notice> : (
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
            {person ? <AccessEditor key={person.email} person={person} onSaved={() => data.reload()} /> : <Panel><Empty icon={ShieldCheck} text="Choose a person to set what they can open." /></Panel>}
          </div>
        ))}
      </Async>
    </div>
  );
}

function AccessEditor({ person, onSaved }) {
  const [denied, setDenied] = useState(() => new Set(person.denied));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const workspaces = useMemo(() => workspacesFor(person.roles), [person.roles]);
  const dirty = denied.size !== person.denied.length || person.denied.some((p) => !denied.has(p));

  const change = (pages, allow) => {
    setSaved(false);
    setDenied((d) => {
      const next = new Set(d);
      pages.forEach((p) => { if (allow) next.delete(p.to); else next.add(p.to); });
      return next;
    });
  };

  async function save() {
    if (!(await confirmDialog({ title: "Save Access", message: `Block ${denied.size} page(s) for ${person.name}? This applies the next time they sign in.`, confirmLabel: "Save" }))) return;
    setBusy(true);
    setError("");
    try {
      await frappe.callMethod("ethx_set_page_access", { user: person.email, denied: JSON.stringify([...denied]) });
      setSaved(true);
      onSaved();
    } catch (e) {
      setError(errMsg(e, "Couldn't save access."));
    }
    setBusy(false);
  }

  return (
    <Panel title={person.name} hint={`${person.email} · ${roleLabel(person.roles)}`} action={<Button type="button" onClick={save} disabled={busy || !dirty}>{busy ? "Saving…" : "Save Access"}</Button>}>
      {error && <div className="mb-3"><Notice>{error}</Notice></div>}
      {saved && !dirty && <div className="mb-3"><Notice tone="info">Saved. It applies the next time {person.name} signs in.</Notice></div>}
      {workspaces.length === 0 && <Empty text="This login has no workspace role, so there is nothing to set." />}
      <div className="space-y-6">
        {workspaces.map((w) => (
          <section key={w.title}>
            <h3 className="mb-3 text-[13px] font-semibold text-[var(--color-text)]">{w.title}</h3>
            <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
              {w.groups.map((g) => {
                const open = g.pages.filter((p) => !ALWAYS_ALLOWED.has(p.to));
                const allOn = open.every((p) => !denied.has(p.to));
                return (
                  <fieldset key={g.label} className="rounded-lg border border-[var(--color-border)] p-3">
                    <legend className="px-1 text-[12px] font-medium text-[var(--color-text-muted)]">{g.label}</legend>
                    {open.length > 1 && <button type="button" onClick={() => change(open, !allOn)} className={`${chipCls(false)} mb-2`}>{allOn ? "Untick All" : "Tick All"}</button>}
                    <div className="space-y-1.5">
                      {g.pages.map((p) => (ALWAYS_ALLOWED.has(p.to) ? (
                        <p key={p.to} className="flex items-center gap-2 text-[12.5px] text-[var(--color-text-muted)]"><Lock size={12} /> {p.label} (always on)</p>
                      ) : (
                        <label key={p.to} className="flex items-center gap-2 text-[12.5px] text-[var(--color-text)]">
                          <input type="checkbox" checked={!denied.has(p.to)} onChange={(e) => change([p], e.target.checked)} />
                          {p.label}
                        </label>
                      )))}
                    </div>
                  </fieldset>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </Panel>
  );
}
