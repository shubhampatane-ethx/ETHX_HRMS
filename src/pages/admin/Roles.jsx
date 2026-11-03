import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Check, Loader2, Plus, RefreshCw, ShieldCheck, Wand2 } from "lucide-react";
import { frappe } from "../../lib/api/frappeClient";
import { errMsg } from "../../lib/employeePortal";
import { serverLoginsReady } from "../../lib/securitySetup";
import { applyItem, getPerms, HR_PRESET, loadItems, loadRestrictions, loadStaffRestrictions, missingFlags, PM, PM_PRESET, PRESETS, restrict, ROLES, tightenHr } from "../../lib/rolePresets";
import { AutoSetupStatus } from "../../components/AutoSetup";
import { Button, Card } from "../../components/ui/primitives";
import { confirmDialog } from "../../components/ui/dialogs";

/**
 * Admin-only editor for the role permissions that the HR and Employee workspaces rely on.
 * It uses the platform's Role Permissions Manager methods, which copy the standard permissions into
 * Custom DocPerm first - so granting one permission never wipes the others.
 */
const FLAGS = ["read", "write", "create", "delete", "submit", "cancel", "amend", "report", "export", "share", "print", "email"];

const chip = (active) =>
  `rounded-md border px-3 py-1.5 text-[12px] transition-colors ${active ? "border-[var(--color-red)] bg-[var(--color-red-wash)] text-[var(--color-text)]" : "border-[var(--color-border)] text-[var(--color-text-muted)] hover:text-[var(--color-text)]"}`;

function Section({ title, hint, action, children }) {
  return (
    <Card className="p-5">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div><h2 className="text-[14px] font-semibold text-[var(--color-text)]">{title}</h2>{hint && <p className="mt-1 text-[12px] text-[var(--color-text-muted)]">{hint}</p>}</div>
        {action}
      </div>
      {children}
    </Card>
  );
}

function TightenHr() {
  const ready = useAsyncValue(() => serverLoginsReady(frappe));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  async function run() {
    if (!(await confirmDialog("Remove HR's rights to create or edit Users and User Permissions? Employee logins then go only through the server-side method, which can't touch HR or admin accounts."))) return;
    setBusy(true);
    setMsg(null);
    try {
      const changed = await tightenHr();
      setMsg({ ok: true, text: changed ? `Removed ${changed} right(s). HR keeps read access to Users. HR users must sign out and back in.` : "HR already has no elevated rights." });
    } catch (e) {
      setMsg({ ok: false, text: errMsg(e, "The change was refused. Sign in as an administrator and try again.") });
    }
    setBusy(false);
  }
  return (
    <Section title="Tighten HR Access" hint="Employee logins are created and reset by a server-side method that can only touch plain employee accounts and always restricts them. HR then doesn't need to create or edit Users and User Permissions - which would also let them reset an administrator's password or widen their own access.">
      {ready === null ? <p className="text-[12px] text-[var(--color-text-muted)]">Checking…</p> : ready ? (
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="secondary" onClick={run} disabled={busy}>{busy ? <Loader2 size={14} className="animate-spin" /> : <ShieldCheck size={14} />} Remove HR's elevated rights</Button>
          {msg && <span className={`text-[12px] ${msg.ok ? "text-[var(--color-green)]" : "text-[var(--color-red-hover)]"}`}>{msg.text}</span>}
        </div>
      ) : <p className="text-[12px] text-[var(--color-amber)]">The secure login method isn't installed yet - it's added by the automatic setup (System Setup › Apply Again).</p>}
    </Section>
  );
}

function useAsyncValue(fn) {
  const [v, setV] = useState(null);
  useEffect(() => { let off = false; fn().then((x) => !off && setV(x)).catch(() => !off && setV(false)); return () => { off = true; }; }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return v;
}

export default function Roles() {
  return (
    <div className="space-y-5">
      <Card className="p-5">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[var(--color-red-wash)] text-[var(--color-red-hover)]"><ShieldCheck size={18} /></span>
          <div>
            <h2 className="text-[15px] font-semibold text-[var(--color-text)]">Roles & Permissions</h2>
            <p className="mt-1 text-[13px] text-[var(--color-text-muted)]">What each role is allowed to do. Everything the workspaces need is applied automatically when the Administrator signs in (once, and again only when the app changes); the sections below are for checking or fine-tuning.</p>
            <div className="mt-4"><AutoSetupStatus /></div>
          </div>
        </div>
      </Card>
      <RequiredPermissions />
      <TightenHr />
      <AccountCheck />
      <EmployeeRestrictions />
      <StaffRestrictions />
      <PermissionEditor />
    </div>
  );
}

/* --------------------------- required permissions --------------------------- */

function RequiredPermissions() {
  const [role, setRole] = useState("HR Manager");
  const [items, setItems] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  const load = useCallback(async () => {
    setItems(null);
    const out = await loadItems(role);
    setItems(out);
  }, [role]);

  useEffect(() => { load(); }, [load]);

  const todo = (items || []).filter((i) => i.missing.length && !i.error);

  async function applyAll() {
    if (!(await confirmDialog(`Add ${todo.length} missing permission(s) for ${role}?`))) return;
    setBusy(true);
    setMsg(null);
    try {
      for (const item of todo) await applyItem(role, item);
      setMsg({ ok: true, text: `Permissions applied for ${role}. Ask the user to sign out and back in.` });
    } catch (e) {
      setMsg({ ok: false, text: errMsg(e, "The change was refused. Sign in as an administrator and try again.") });
    } finally {
      setBusy(false);
      load();
    }
  }

  return (
    <Section title="Required Permissions" hint="The permissions each role needs for the app to work. Only missing permissions are added - existing ones are never removed."
      action={<Button onClick={applyAll} disabled={busy || !todo.length}>{busy ? <Loader2 size={14} className="animate-spin" /> : <Wand2 size={14} />} {todo.length ? `Apply ${todo.length} missing` : "All set"}</Button>}>
      <div className="mb-4 flex flex-wrap gap-2">{ROLES.map((r) => <button key={r} type="button" onClick={() => setRole(r)} className={chip(role === r)}>{r}</button>)}</div>

      {!items ? <p className="flex items-center gap-2 py-6 text-[13px] text-[var(--color-text-muted)]"><Loader2 size={14} className="animate-spin" /> Checking permissions…</p> : (
        <ul className="divide-y divide-[var(--color-border)]">
          {items.map((i) => (
            <li key={`${i.doctype}-${i.permlevel ?? 0}`} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div className="min-w-0">
                <p className="text-[13px] font-medium text-[var(--color-text)]">{i.doctype}{i.permlevel ? ` (level ${i.permlevel})` : ""} <span className="ml-1 font-normal text-[var(--color-text-faint)]">{i.perms.join(", ")}</span></p>
                <p className="text-[12px] text-[var(--color-text-muted)]">{i.why}</p>
              </div>
              {i.error ? <span className="text-[12px] text-[var(--color-amber)]">{i.error}</span> : i.missing.length === 0
                ? <span className="flex items-center gap-1 text-[12px] text-[var(--color-green)]"><Check size={14} /> Granted</span>
                : <span className="text-[12px] text-[var(--color-amber)]">Missing: {i.missing.join(", ")}</span>}
            </li>
          ))}
        </ul>
      )}

      {role !== "Employee" && (
        <div className="mt-4 flex items-start gap-2 rounded-lg border border-[var(--color-border-strong)] bg-[var(--color-surface-2)] px-4 py-3 text-[12px] text-[var(--color-text-muted)]">
          <AlertTriangle size={15} className="mt-0.5 shrink-0 text-[var(--color-amber)]" />
          <span>Letting HR create and edit <b className="text-[var(--color-text)]">User</b> records also lets them set any user's password, including administrators'. Letting HR create <b className="text-[var(--color-text)]">User Permissions</b> means they can also widen their own company access, which weakens the one-company-per-HR rule. Only give this to HR staff you trust. A safer option is a server-side method that can only create Employee logins - ask if you'd like me to write it.</span>
        </div>
      )}
      {msg && <p className={`mt-3 text-[12px] ${msg.ok ? "text-[var(--color-green)]" : "text-[var(--color-red-hover)]"}`}>{msg.text}</p>}
    </Section>
  );
}

/* ------------------------- employee record restrictions ------------------------- */

function StaffRestrictions() {
  const [rows, setRows] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const load = useCallback(async () => { setRows(null); try { setRows(await loadStaffRestrictions()); } catch (e) { setRows([]); setError(errMsg(e, "Couldn't check staff logins.")); } }, []);
  useEffect(() => { load(); }, [load]);
  async function lift(list) {
    if (!(await confirmDialog({ message: `Remove the automatic Employee restriction from ${list.length} login(s)?`, confirmLabel: "Lift" }))) return;
    setBusy(true);
    setError("");
    try { for (const r of list) await frappe.deleteDoc("User Permission", r.name); } catch (e) { setError(errMsg(e, "Couldn't remove the restriction.")); }
    setBusy(false);
    load();
  }
  return (
    <Section title="HR & Project Manager Logins Limited to Their Own Record" hint="Employee-linked accounts are limited to that employee. For HR and Project Managers this hides other people's requisitions, timesheets and team data. Remove it for staff who need to see across the company (their Company restriction stays)."
      action={<Button onClick={() => lift(rows || [])} disabled={busy || !(rows || []).length}>{busy ? "Working…" : `Lift ${(rows || []).length || ""}`.trim()}</Button>}>
      {!rows ? <p className="flex items-center gap-2 py-3 text-[13px] text-[var(--color-text-muted)]"><Loader2 size={14} className="animate-spin" /> Checking…</p> : rows.length === 0 ? <p className="py-2 text-[13px] text-[var(--color-green)]"><Check size={14} className="mr-1 inline" /> No HR or Project Manager login is limited to its own employee record.</p> : (
        <ul className="divide-y divide-[var(--color-border)] text-[13px]">{rows.map((r) => <li key={r.name} className="flex items-center justify-between py-2"><span>{r.user} <span className="text-[11px] text-[var(--color-text-faint)]">{r.roles.join(", ")} · limited to {r.for_value}</span></span><button type="button" disabled={busy} onClick={() => lift([r])} className="text-[12px] text-[var(--color-red-hover)] hover:underline">Lift</button></li>)}</ul>
      )}
      {error && <p className="mt-3 text-[12px] text-[var(--color-red-hover)]">{error}</p>}
    </Section>
  );
}

function EmployeeRestrictions() {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setRows(null);
    setError("");
    try { setRows(await loadRestrictions()); } catch (e) { setRows([]); setError(errMsg(e, "Couldn't load employee logins.")); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const open = (rows || []).filter((r) => !r.hasEmployee || !r.hasCompany);

  async function fix(list) {
    if (!(await confirmDialog({ message: `Restrict ${list.length} employee login(s) to their own record and company?`, confirmLabel: "Restrict" }))) return;
    setBusy(true);
    setError("");
    try { for (const e of list) await restrict(e); } catch (e) { setError(errMsg(e, "Couldn't create the restriction.")); }
    setBusy(false);
    load();
  }

  return (
    <Section title="Employee Record Restrictions" hint="Employee logins should only see their own record and company. These restrictions may need administrator access to create - fix any gaps here."
      action={<div className="flex gap-2"><Button variant="secondary" onClick={load}><RefreshCw size={14} /> Refresh</Button><Button onClick={() => fix(open)} disabled={busy || !open.length}>{busy ? "Working…" : `Restrict ${open.length || ""}`.trim()}</Button></div>}>
      {!rows ? <p className="flex items-center gap-2 py-4 text-[13px] text-[var(--color-text-muted)]"><Loader2 size={14} className="animate-spin" /> Checking…</p> : rows.length === 0 ? <p className="py-3 text-[13px] text-[var(--color-text-muted)]">No employee-only logins yet.</p> : (
        <ul className="divide-y divide-[var(--color-border)]">
          {rows.map((r) => (
            <li key={r.name} className="flex items-center justify-between gap-3 py-2.5 text-[13px]">
              <span className="min-w-0"><span className="text-[var(--color-text)]">{r.employee_name}</span><span className="ml-2 text-[11px] text-[var(--color-text-faint)]">{r.user_id}</span></span>
              {r.hasEmployee && r.hasCompany ? <span className="flex items-center gap-1 text-[12px] text-[var(--color-green)]"><Check size={14} /> Restricted</span>
                : <button type="button" disabled={busy} onClick={() => fix([r])} className="text-[12px] text-[var(--color-red-hover)] hover:underline disabled:opacity-50">Not Restricted - Fix</button>}
            </li>
          ))}
        </ul>
      )}
      {error && <p className="mt-3 text-[12px] text-[var(--color-red-hover)]">{error}</p>}
    </Section>
  );
}

/* ------------------------------- permission editor ------------------------------- */

function PermissionEditor() {
  const [doctype, setDoctype] = useState("");
  const [loaded, setLoaded] = useState("");
  const [rows, setRows] = useState([]);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  async function load(name = doctype) {
    if (!name.trim()) return;
    setBusy("load");
    setError("");
    try {
      const all = await getPerms(name.trim());
      setRows(all.filter((r) => ROLES.includes(r.role)));
      setLoaded(name.trim());
    } catch (e) {
      setRows([]);
      setLoaded("");
      setError(errMsg(e, "Couldn't load permissions for that doctype."));
    }
    setBusy("");
  }

  async function toggle(row, ptype, value) {
    if (!(await confirmDialog(`${value ? "Give" : "Remove"} "${ptype}" permission ${value ? "to" : "from"} ${row.role} on ${loaded}?`))) return;
    const key = `${row.role}-${row.permlevel}-${ptype}`;
    setBusy(key);
    setError("");
    try {
      await frappe.callMethod(`${PM}.update`, { doctype: loaded, role: row.role, permlevel: row.permlevel, ptype, value: value ? 1 : 0, if_owner: Number(row.if_owner) || 0 });
      await load(loaded);
    } catch (e) {
      setError(errMsg(e, "The change was refused."));
      setBusy("");
    }
  }

  async function addRole(role) {
    if (!(await confirmDialog(`Give ${role} access to ${loaded}?`))) return;
    setBusy("add");
    setError("");
    try {
      await frappe.callMethod(`${PM}.add`, { parent: loaded, role, permlevel: 0 });
      await load(loaded);
    } catch (e) {
      setError(errMsg(e, "Couldn't add the role."));
      setBusy("");
    }
  }

  const missingRoles = ROLES.filter((r) => !rows.some((x) => x.role === r && Number(x.permlevel) === 0));

  return (
    <Section title="Permission Editor" hint="Advanced: view and change permissions of HR Manager, HR User and Employee on any doctype (for example Leave Application).">
      <form data-no-preview onSubmit={(e) => { e.preventDefault(); load(); }} className="mb-4 flex gap-2">
        <input value={doctype} onChange={(e) => setDoctype(e.target.value)} placeholder="Doctype name, e.g. Leave Application" className="w-full max-w-sm rounded-md border border-[var(--color-border-strong)] bg-[var(--color-surface-2)] px-3 py-2 text-[13px] text-[var(--color-text)] placeholder:text-[var(--color-text-faint)] outline-none focus:border-[var(--color-red)]" />
        <Button type="submit" variant="secondary" disabled={busy === "load"}>{busy === "load" ? "Loading…" : "Load"}</Button>
      </form>
      {error && <p className="mb-3 text-[12px] text-[var(--color-red-hover)]">{error}</p>}
      {loaded && (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[12.5px]">
              <thead><tr className="border-b border-[var(--color-border)] text-[var(--color-text-muted)]"><th className="px-3 py-2 font-medium">Role</th><th className="px-2 py-2 font-medium">Level</th>{FLAGS.map((f) => <th key={f} className="px-2 py-2 text-center font-medium capitalize">{f}</th>)}</tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={`${r.role}-${r.permlevel}-${r.if_owner}`} className="border-b border-[var(--color-border)] last:border-0">
                    <td className="px-3 py-2 text-[var(--color-text)]">{r.role}{Number(r.if_owner) ? <span className="ml-2 text-[10px] text-[var(--color-text-faint)]">own records only</span> : null}</td>
                    <td className="px-2 py-2 text-[var(--color-text-muted)]">{r.permlevel}</td>
                    {FLAGS.map((f) => (
                      <td key={f} className="px-2 py-2 text-center"><input type="checkbox" checked={Number(r[f]) === 1} disabled={busy !== ""} onChange={(e) => toggle(r, f, e.target.checked)} /></td>
                    ))}
                  </tr>
                ))}
                {rows.length === 0 && <tr><td colSpan={FLAGS.length + 2} className="px-3 py-4 text-[var(--color-text-muted)]">None of these roles has access to {loaded} yet.</td></tr>}
              </tbody>
            </table>
          </div>
          {missingRoles.length > 0 && <div className="mt-4 flex flex-wrap items-center gap-2 text-[12px] text-[var(--color-text-muted)]">Add access for: {missingRoles.map((r) => <button key={r} type="button" disabled={busy !== ""} onClick={() => addRole(r)} className="flex items-center gap-1 rounded-md border border-[var(--color-border)] px-2.5 py-1 hover:text-[var(--color-text)]"><Plus size={12} /> {r}</button>)}</div>}
        </>
      )}
    </Section>
  );
}

/* ------------------------------- account checker ------------------------------- */

/** Why does this account still get "not permitted"? Shows its roles and which needed permissions they cover. */
function AccountCheck() {
  const [email, setEmail] = useState("");
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function check(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setResult(null);
    try {
      const user = await frappe.getDoc("User", email.trim());
      const roles = (user.roles || []).map((r) => r.role);
      const isHr = roles.some((r) => r === "HR Manager" || r === "HR User");
      const base = isHr ? HR_PRESET : roles.includes("Projects Manager") ? PM_PRESET : roles.includes("Employee") ? PRESETS.Employee : [];
      const wanted = roles.includes("Interviewer") && !isHr ? [...base, ...INTERVIEWER_PRESET] : base;
      const lines = await Promise.all(wanted.map(async (p) => {
        const rows = await getPerms(p.doctype);
        return { ...p, missing: missingFlags(rows, roles, p.perms, p.permlevel ?? 0) };
      }));
      setResult({ roles, isHr, lines, enabled: Boolean(user.enabled) });
    } catch (x) {
      setError(errMsg(x, "Couldn't find that user."));
    }
    setBusy(false);
  }

  return (
    <Section title="Check an Account" hint="Enter an HR or employee login email to see its roles and which required permissions those roles are missing.">
      <form data-no-preview onSubmit={check} className="flex gap-2">
        <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@company.com" className="w-full max-w-sm rounded-md border border-[var(--color-border-strong)] bg-[var(--color-surface-2)] px-3 py-2 text-[13px] text-[var(--color-text)] placeholder:text-[var(--color-text-faint)] outline-none focus:border-[var(--color-red)]" />
        <Button type="submit" variant="secondary" disabled={busy}>{busy ? "Checking…" : "Check"}</Button>
      </form>
      {error && <p className="mt-3 text-[12px] text-[var(--color-red-hover)]">{error}</p>}
      {result && (
        <div className="mt-4 space-y-3 text-[13px]">
          <p className="text-[var(--color-text-muted)]">Roles: {result.roles.length ? <b className="text-[var(--color-text)]">{result.roles.join(", ")}</b> : "none"}{!result.enabled && <span className="ml-2 text-[var(--color-amber)]">(account is disabled)</span>}</p>
          {!result.isHr && !result.roles.includes("Employee") && <p className="text-[var(--color-amber)]">This account has neither an HR role (HR Manager / HR User) nor the Employee role, so it has no HR or employee permissions at all.</p>}
          {result.lines.length > 0 && (
            <ul className="divide-y divide-[var(--color-border)]">
              {result.lines.map((l) => (
                <li key={`${l.doctype}-${l.permlevel ?? 0}`} className="flex items-center justify-between gap-3 py-2">
                  <span className="text-[var(--color-text)]">{l.doctype}{l.permlevel ? ` (level ${l.permlevel})` : ""} <span className="text-[var(--color-text-faint)]">{l.perms.join(", ")}</span></span>
                  {l.missing.length ? <span className="text-[12px] text-[var(--color-amber)]">Missing: {l.missing.join(", ")}</span> : <span className="flex items-center gap-1 text-[12px] text-[var(--color-green)]"><Check size={14} /> Covered</span>}
                </li>
              ))}
            </ul>
          )}
          {result.lines.some((l) => l.missing.length) && <p className="text-[12px] text-[var(--color-text-muted)]">Apply the missing permissions to the role(s) this account holds in <b>Required permissions</b> above - each role has its own tab.</p>}
        </div>
      )}
    </Section>
  );
}