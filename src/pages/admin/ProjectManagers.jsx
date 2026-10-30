import { useCallback, useEffect, useState } from "react";
import { Briefcase, Building2, KeyRound, Plus, Power, Settings2, X } from "lucide-react";
import { frappe } from "../../lib/api/frappeClient";
import { dmyHm, errMsg } from "../../lib/employeePortal";
import { Button, Card, Input, LinkField } from "../../components/ui/primitives";
import { setUserCompany } from "./Users";
import { confirmDialog } from "../../components/ui/dialogs";

/**
 * Admin sets who is a Project Manager. Project Managers hold ERPNext's standard "Projects Manager"
 * role and are tied to one company (like HR users), so they only see that company's projects,
 * employees and tasks.
 */
const ROLE = "Projects Manager";

async function loadManagers() {
  const rows = await frappe.getList("Has Role", { parent: "User", filters: [["role", "=", ROLE], ["parenttype", "=", "User"]], fields: ["parent"], limit: 0 });
  const names = [...new Set(rows.map((r) => r.parent))];
  if (!names.length) return [];
  const [users, perms] = await Promise.all([
    frappe.getList("User", { filters: [["name", "in", names]], fields: ["name", "full_name", "enabled", "last_login"], limit: 0, orderBy: "creation desc" }),
    frappe.getList("User Permission", { filters: [["user", "in", names], ["allow", "=", "Company"]], fields: ["user", "for_value"], limit: 0 }).catch(() => []),
  ]);
  return users.map((u) => ({ ...u, company: perms.find((p) => p.user === u.name)?.for_value || "" }));
}

const Shell = ({ title, onClose, children }) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
    <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-[14px] font-semibold text-[var(--color-text)]">{title}</h2>
        <button type="button" onClick={onClose} className="text-[var(--color-text-muted)] hover:text-[var(--color-text)]"><X size={16} /></button>
      </div>
      {children}
    </div>
  </div>
);
const ErrorNote = ({ children }) => <p className="rounded-md border border-[var(--color-red-deep)] bg-[var(--color-red-wash)] px-3 py-2 text-[12px] text-[var(--color-red-hover)]">{children}</p>;

export default function ProjectManagers() {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState("");
  const [create, setCreate] = useState(false);
  const [manage, setManage] = useState(null);

  const load = useCallback(async () => {
    setRows(null);
    setError("");
    try { setRows(await loadManagers()); } catch (e) { setRows([]); setError(errMsg(e, "Couldn't load Project Managers.")); }
  }, []);
  useEffect(() => { load(); }, [load]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-2xl text-[13px] text-[var(--color-text-muted)]">Project Managers assign employees to projects with a role and an ETA. The assigned days then fill in automatically on each employee's monthly timesheet. Each Project Manager only sees their own company's data.</p>
        <Button onClick={() => setCreate(true)}><Plus size={14} /> Add Project Manager</Button>
      </div>

      <Card className="overflow-hidden">
        {rows === null ? <div className="flex h-32 items-center justify-center text-[13px] text-[var(--color-text-muted)]">Loading…</div> : rows.length === 0 ? (
          <div className="flex h-32 flex-col items-center justify-center gap-2 text-[13px] text-[var(--color-text-muted)]"><Briefcase size={18} className="text-[var(--color-text-faint)]" />No Project Managers yet.</div>
        ) : (
          <table className="w-full text-left text-[13px]">
            <thead><tr className="border-b border-[var(--color-border)] text-[12px] text-[var(--color-text-muted)]"><th className="px-4 py-2.5 font-medium">Name</th><th className="px-4 py-2.5 font-medium">Email</th><th className="px-4 py-2.5 font-medium">Company</th><th className="px-4 py-2.5 font-medium">Status</th><th className="px-4 py-2.5 font-medium">Last login</th><th /></tr></thead>
            <tbody>
              {rows.map((u) => (
                <tr key={u.name} className="border-b border-[var(--color-border)] last:border-0 hover:bg-[var(--color-surface-2)]">
                  <td className="px-4 py-2.5 text-[var(--color-text)]">{u.full_name || u.name}</td>
                  <td className="px-4 py-2.5 text-[var(--color-text-muted)]">{u.name}</td>
                  <td className="px-4 py-2.5">{u.company ? <span className="inline-flex items-center gap-1.5 text-[var(--color-text)]"><Building2 size={13} className="text-[var(--color-text-muted)]" />{u.company}</span> : <span className="text-[var(--color-amber)]" title="No company: sees every company's data">Not assigned</span>}</td>
                  <td className={`px-4 py-2.5 ${u.enabled ? "text-[var(--color-green)]" : "text-[var(--color-text-muted)]"}`}>{u.enabled ? "Active" : "Disabled"}</td>
                  <td className="px-4 py-2.5 text-[var(--color-text-muted)]">{dmyHm(u.last_login) || "Never"}</td>
                  <td className="px-4 py-2.5 text-right"><button type="button" title="Manage" onClick={() => setManage(u)} className="rounded p-1.5 text-[var(--color-text-muted)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text)]"><Settings2 size={14} /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
      {error && <ErrorNote>{error}</ErrorNote>}

      {create && <CreateModal onClose={() => setCreate(false)} onDone={load} />}
      {manage && <ManageModal user={manage} onClose={() => setManage(null)} onDone={load} />}
    </div>
  );
}

function CreateModal({ onClose, onDone }) {
  const [f, setF] = useState({ first: "", last: "", email: "", password: "", company: "", portal: false });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const set = (k) => (e) => setF((v) => ({ ...v, [k]: e.target.value }));

  async function submit(e) {
    e.preventDefault();
    if (!f.company) return setError("Choose the company this Project Manager will work for.");
    setBusy(true);
    setError("");
    let created = false;
    try {
      await frappe.createDoc("User", { email: f.email.trim(), first_name: f.first, ...(f.last ? { last_name: f.last } : {}), enabled: 1, user_type: "System User", send_welcome_email: 0, new_password: f.password });
      created = true;
      await frappe.updateDoc("User", f.email.trim(), { roles: [{ role: ROLE }, ...(f.portal ? [{ role: "Employee" }] : [])] });
      await setUserCompany(f.email.trim(), f.company);
      setDone(true);
      onDone();
    } catch (err) {
      if (created) onDone();
      setError(`${created ? "The user was created, but a later step failed. Use Manage to finish it. " : ""}${errMsg(err, "The change was refused.")}`);
    }
    setBusy(false);
  }

  if (done) {
    return (
      <Shell title="Project Manager Created" onClose={onClose}>
        <p className="text-[13px] text-[var(--color-text-muted)]">Share these details. They will be asked to choose their own password the first time they sign in.</p>
        <div className="mt-3 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] p-3 text-[13px] text-[var(--color-text)]"><p><span className="text-[var(--color-text-muted)]">Email:</span> {f.email}</p><p><span className="text-[var(--color-text-muted)]">Temporary password:</span> {f.password}</p></div>
        <div className="mt-4 flex justify-end"><Button onClick={onClose}>Done</Button></div>
      </Shell>
    );
  }
  return (
    <Shell title="Add Project Manager" onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <div className="grid grid-cols-2 gap-3"><Input label="First name" value={f.first} onChange={set("first")} required /><Input label="Last name" value={f.last} onChange={set("last")} /></div>
        <Input label="Email" type="email" value={f.email} onChange={set("email")} required />
        <Input label="Temporary password" value={f.password} onChange={set("password")} required minLength={8} autoComplete="off" />
        <LinkField label="Company" linkDoctype="Company" value={f.company} onChange={(v) => setF((x) => ({ ...x, company: v }))} required frappe={frappe} />
        <label className="flex items-start gap-2 text-[12px] text-[var(--color-text-muted)]"><input type="checkbox" className="mt-0.5" checked={f.portal} onChange={(e) => setF((x) => ({ ...x, portal: e.target.checked }))} /> Also give them the Employee portal (their own attendance, leave and timesheet). HR still has to link their Employee record to this email.</label>
        {error && <ErrorNote>{error}</ErrorNote>}
        <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={onClose}>Cancel</Button><Button type="submit" disabled={busy}>{busy ? "Creating…" : "Create"}</Button></div>
      </form>
    </Shell>
  );
}

function ManageModal({ user, onClose, onDone }) {
  const [company, setCompany] = useState(user.company);
  const [pwd, setPwd] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [note, setNote] = useState("");

  async function run(label, fn, ok, question) {
    if (!(await confirmDialog(question))) return;
    setBusy(label);
    setError("");
    setNote("");
    try { await fn(); setNote(ok); onDone(); } catch (e) { setError(errMsg(e, "The change was refused.")); }
    setBusy("");
  }

  return (
    <Shell title={user.full_name || user.name} onClose={onClose}>
      <div className="space-y-4">
        <p className="text-[12px] text-[var(--color-text-muted)]">{user.name} · {user.enabled ? "Active" : "Disabled"}</p>
        <div className="space-y-2">
          <LinkField label="Company" linkDoctype="Company" value={company} onChange={setCompany} frappe={frappe} />
          <Button variant="secondary" disabled={Boolean(busy) || !company || company === user.company} onClick={() => run("company", () => setUserCompany(user.name, company), "Company updated.", `Move ${user.full_name || user.name} to ${company}?`)}><Building2 size={14} /> {busy === "company" ? "Saving…" : "Change company"}</Button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input type="text" value={pwd} onChange={(e) => setPwd(e.target.value)} placeholder="New temporary password" autoComplete="off" className="w-56 rounded-md border border-[var(--color-border-strong)] bg-[var(--color-surface-2)] px-3 py-2 text-[13px] text-[var(--color-text)] placeholder:text-[var(--color-text-faint)] outline-none focus:border-[var(--color-red)]" />
          <Button variant="secondary" disabled={Boolean(busy) || pwd.length < 8} onClick={() => run("pwd", async () => { await frappe.updateDoc("User", user.name, { new_password: pwd, last_password_reset_date: null }); setPwd(""); }, "Password reset - they must change it at next sign-in.", `Reset ${user.full_name || user.name}'s password? They must change it at next sign-in.`)}><KeyRound size={14} /> Reset password</Button>
        </div>
        <Button variant="ghost" disabled={Boolean(busy)} onClick={() => run("enable", () => frappe.updateDoc("User", user.name, { enabled: user.enabled ? 0 : 1 }), user.enabled ? "Account disabled." : "Account enabled.", user.enabled ? { message: `Disable ${user.full_name || user.name}'s account? They won't be able to sign in.`, danger: true, confirmLabel: "Disable" } : `Enable ${user.full_name || user.name}'s account?`)}><Power size={14} /> {user.enabled ? "Disable account" : "Enable account"}</Button>
        {note && <p className="text-[12px] text-[var(--color-green)]">{note}</p>}
        {error && <ErrorNote>{error}</ErrorNote>}
      </div>
    </Shell>
  );
}