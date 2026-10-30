import { useState } from "react";
import { Pencil, Plus, ShieldCheck, Trash2 } from "lucide-react";
import { Async, Field, Grid, inputCls, Modal, Notice, PageHeader, Panel, StatusPill } from "../../components/employee/EmployeeShell";
import { Button } from "../../components/ui/primitives";
import { errMsg, useAsync } from "../../lib/employeePortal";
import { deleteProjectRole, loadProjectRoles, saveProjectRole } from "../../lib/projectRoles";
import { confirmDialog } from "../../components/ui/dialogs";

/** The roles employees can hold on a project. Which employee has which role is set per project under Assignments. */
export default function ProjectRoles() {
  const data = useAsync(loadProjectRoles, []);
  const [modal, setModal] = useState(null);
  const [error, setError] = useState("");
  const installed = data.data?.installed;

  async function remove(r) {
    if (!(await confirmDialog({ message: `Delete the role "${r.role_name}"? People already assigned keep it on their current assignments.`, danger: true, confirmLabel: "Delete" }))) return;
    setError("");
    try {
      await deleteProjectRole(r.name);
      data.reload();
    } catch (e) {
      setError(errMsg(e, "Couldn't delete this role."));
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader icon={ShieldCheck} title="Project Roles" subtitle="Roles employees can hold on a project. Give them to people per project under Assignments." actions={<Button type="button" disabled={!installed} onClick={() => setModal({})}><Plus size={14} /> Add role</Button>} />
      {data.data && !installed && <Notice tone="info">Run <b>System Setup</b> once to create this list. Until then the assignment form offers the default roles shown here.</Notice>}
      {error && <Notice>{error}</Notice>}
      <Panel>
        <Async state={data}>
          {({ roles }) => <Grid rows={roles} empty="No project roles yet." columns={[
            { key: "role_name", label: "Role", render: (r) => <span><b className="font-medium">{r.role_name}</b>{r.description && <span className="block text-[11px] text-[var(--color-text-faint)]">{r.description}</span>}</span> },
            { key: "manages_project", label: "Access on the Project", render: (r) => (Number(r.manages_project) ? "Manages it: assigns the team, approves timesheets" : "Team member") },
            { key: "disabled", label: "Status", render: (r) => <StatusPill status={Number(r.disabled) ? "Disabled" : "Active"} /> },
            { key: "_a", label: "", render: (r) => installed && (
              <div className="flex justify-end gap-1">
                <button type="button" title="Edit role" aria-label={`Edit ${r.role_name}`} onClick={() => setModal({ role: r })} className="rounded p-1 text-[var(--color-text-muted)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text)]"><Pencil size={14} /></button>
                <button type="button" title="Delete role" aria-label={`Delete ${r.role_name}`} onClick={() => remove(r)} className="rounded p-1 text-[var(--color-text-muted)] hover:text-[var(--color-red-hover)]"><Trash2 size={14} /></button>
              </div>
            ) },
          ]} />}
        </Async>
      </Panel>
      {modal && <RoleModal role={modal.role} onClose={() => setModal(null)} onSaved={() => { setModal(null); data.reload(); }} />}
    </div>
  );
}

function RoleModal({ role, onClose, onSaved }) {
  const [f, setF] = useState({ role_name: role?.role_name || "", description: role?.description || "", manages_project: Number(role?.manages_project) || 0, disabled: Number(role?.disabled) || 0 });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setErr("");
    try {
      const { role_name, ...rest } = f;
      await saveProjectRole(role?.name, role ? rest : { role_name: role_name.trim(), ...rest });
      onSaved();
    } catch (x) {
      setErr(errMsg(x, "ERPNext refused the role."));
      setBusy(false);
    }
  }

  return (
    <Modal title={role ? `Edit ${role.role_name}` : "Add Project Role"} onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        {!role && <Field label="Role name"><input required className={inputCls} value={f.role_name} onChange={(e) => setF({ ...f, role_name: e.target.value })} placeholder="e.g. Scrum Master" /></Field>}
        <Field label="Description (optional)"><input className={inputCls} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
        <label className="flex items-start gap-2 text-[12.5px] text-[var(--color-text)]"><input type="checkbox" className="mt-0.5" checked={Boolean(f.manages_project)} onChange={(e) => setF({ ...f, manages_project: e.target.checked ? 1 : 0 })} /><span>Manages the project<span className="block text-[11px] text-[var(--color-text-muted)]">The holder runs that project: assigns its team and approves its timesheets. A project has one manager at a time.</span></span></label>
        {role && <label className="flex items-center gap-2 text-[12.5px] text-[var(--color-text)]"><input type="checkbox" checked={Boolean(f.disabled)} onChange={(e) => setF({ ...f, disabled: e.target.checked ? 1 : 0 })} /> Disabled (no longer offered for new assignments)</label>}
        {err && <Notice>{err}</Notice>}
        <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={onClose}>Cancel</Button><Button type="submit" disabled={busy}>{busy ? "Saving…" : role ? "Save role" : "Add role"}</Button></div>
      </form>
    </Modal>
  );
}
