// HR › Settings › Employee Groups: create groups and add or remove their members in one place.
// An employee can belong to several groups; the group shown on the employee's record (Employee Group field) is the
// main one. Removing someone here doesn't change that field, and choosing a group on the record adds them here.
import { useMemo, useState } from "react";
import { Plus, Search, Trash2, Users, X } from "lucide-react";
import { frappe } from "../../lib/api/frappeClient";
import { Button } from "../../components/ui/primitives";
import { Async, Field, Grid, inputCls, Modal, Notice, PageHeader, Panel } from "../../components/employee/EmployeeShell";
import { errMsg, useAsync } from "../../lib/employeePortal";
import { confirmDialog } from "../../components/ui/dialogs";

const loadGroups = async () => {
  const groups = await frappe.getList("Employee Group", { fields: ["name", "modified"], orderBy: "name asc", limit: 0 });
  const members = groups.length ? await frappe.getList("Employee Group Table", { parent: "Employee Group", filters: [["parent", "in", groups.map((g) => g.name)]], fields: ["parent", "employee"], limit: 0 }).catch(() => []) : [];
  return groups.map((g) => ({ ...g, count: members.filter((m) => m.parent === g.name).length }));
};

export default function EmployeeGroups() {
  const groups = useAsync(loadGroups, []);
  const [open, setOpen] = useState(null); // group name | "" for new
  return (
    <div className="space-y-5">
      <PageHeader icon={Users} title="Employee Groups" subtitle="Group employees (a team, a location, a shift…) and manage who is in each group" actions={<Button onClick={() => setOpen("")}><Plus size={14} /> New Group</Button>} />
      <Panel>
        <Async state={groups}>
          {(rows) => <Grid rows={rows} empty="No employee groups yet. Create one, then add employees to it." columns={[
            { key: "name", label: "Group", render: (g) => <button type="button" onClick={() => setOpen(g.name)} className="text-left font-medium text-[var(--color-text)] hover:underline">{g.name}</button> },
            { key: "count", label: "Members", render: (g) => `${g.count} employee${g.count === 1 ? "" : "s"}` },
            { key: "_a", label: "", render: (g) => <div className="flex justify-end"><Button variant="secondary" onClick={() => setOpen(g.name)}>Manage Members</Button></div> },
          ]} />}
        </Async>
      </Panel>
      {open !== null && <GroupModal group={open} onClose={() => setOpen(null)} onSaved={() => { setOpen(null); groups.reload(); }} />}
    </div>
  );
}

function GroupModal({ group, onClose, onSaved }) {
  const isNew = !group;
  const data = useAsync(async () => {
    const [emps, doc] = await Promise.all([
      frappe.getList("Employee", { filters: [["status", "=", "Active"]], fields: ["name", "employee_name", "department", "designation", "user_id"], orderBy: "employee_name asc", limit: 0 }),
      isNew ? Promise.resolve(null) : frappe.getDoc("Employee Group", group),
    ]);
    return { emps, members: (doc?.employee_list || []).map((r) => r.employee) };
  }, [group]);
  const [name, setName] = useState("");
  const [members, setMembers] = useState(null); // null until loaded
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const list = members ?? data.data?.members ?? [];
  const emps = data.data?.emps || [];
  const byId = useMemo(() => Object.fromEntries(emps.map((e) => [e.name, e])), [emps]);
  const q = search.trim().toLowerCase();
  const candidates = emps.filter((e) => !list.includes(e.name) && (!q || `${e.employee_name} ${e.name} ${e.department || ""} ${e.designation || ""}`.toLowerCase().includes(q)));

  const add = (ids) => setMembers([...list, ...ids.filter((id) => !list.includes(id))]);
  const remove = (id) => setMembers(list.filter((x) => x !== id));

  async function save(e) {
    e.preventDefault();
    if (isNew && !name.trim()) return setErr("Give the group a name.");
    setBusy(true);
    setErr("");
    try {
      const rows = list.map((id) => ({ employee: id, employee_name: byId[id]?.employee_name, user_id: byId[id]?.user_id || undefined }));
      if (isNew) await frappe.createDoc("Employee Group", { employee_group_name: name.trim(), employee_list: rows });
      else await frappe.updateDoc("Employee Group", group, { employee_list: rows });
      onSaved();
    } catch (x) {
      setErr(errMsg(x, "Couldn't save the group."));
      setBusy(false);
    }
  }
  async function deleteGroup() {
    if (!(await confirmDialog({ message: `Delete the group ${group}? Employees stay; only the group is removed.`, danger: true, confirmLabel: "Delete Group" }))) return;
    setBusy(true);
    try {
      await frappe.deleteDoc("Employee Group", group);
      onSaved();
    } catch (x) {
      setErr(errMsg(x, "Couldn't delete the group. Employees may still have it as their main group."));
      setBusy(false);
    }
  }

  return (
    <Modal title={isNew ? "New Employee Group" : `Members of ${group}`} onClose={onClose} wide>
      <Async state={data}>
        {() => (
          <form onSubmit={save} className="space-y-4">
            {isNew && <Field label="Group Name"><input required className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Oracle Fusion Team" /></Field>}
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <p className="mb-1.5 text-[12px] font-medium text-[var(--color-text)]">In this group ({list.length})</p>
                <div className="max-h-72 space-y-1 overflow-y-auto rounded-md border border-[var(--color-border)] p-2">
                  {list.length === 0 && <p className="p-2 text-[12px] text-[var(--color-text-muted)]">No members yet. Add employees from the list on the right.</p>}
                  {list.map((id) => (
                    <div key={id} className="flex items-center justify-between rounded px-2 py-1 text-[13px] hover:bg-[var(--color-surface-2)]">
                      <span>{byId[id]?.employee_name || id}<span className="ml-1.5 text-[11px] text-[var(--color-text-faint)]">{byId[id]?.department || id}</span></span>
                      <button type="button" title="Remove from group" onClick={() => remove(id)} className="rounded p-1 text-[var(--color-text-muted)] hover:text-[var(--color-red-hover)]"><X size={13} /></button>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <div className="mb-1.5 flex items-center justify-between gap-2">
                  <p className="text-[12px] font-medium text-[var(--color-text)]">Add employees</p>
                  {candidates.length > 0 && <button type="button" onClick={() => add(candidates.map((c) => c.name))} className="text-[11.5px] text-[var(--color-red-hover)] hover:underline">Add all {q ? "shown" : ""} ({candidates.length})</button>}
                </div>
                <div className="relative mb-2"><Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--color-text-faint)]" /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name, department…" className={`${inputCls} !pl-8`} /></div>
                <div className="max-h-60 space-y-1 overflow-y-auto rounded-md border border-[var(--color-border)] p-2">
                  {candidates.length === 0 && <p className="p-2 text-[12px] text-[var(--color-text-muted)]">{q ? "No one matches." : "Everyone is already in this group."}</p>}
                  {candidates.map((e) => (
                    <button key={e.name} type="button" onClick={() => add([e.name])} className="flex w-full items-center justify-between rounded px-2 py-1 text-left text-[13px] hover:bg-[var(--color-surface-2)]">
                      <span>{e.employee_name}<span className="ml-1.5 text-[11px] text-[var(--color-text-faint)]">{e.department || e.name}</span></span>
                      <Plus size={13} className="text-[var(--color-text-muted)]" />
                    </button>
                  ))}
                </div>
              </div>
            </div>
            {err && <Notice>{err}</Notice>}
            <div className="flex items-center justify-between gap-2">
              {!isNew ? <Button type="button" variant="ghost" disabled={busy} onClick={deleteGroup}><Trash2 size={14} /> Delete Group</Button> : <span />}
              <div className="flex gap-2"><Button type="button" variant="ghost" onClick={onClose}>Cancel</Button><Button type="submit" disabled={busy}>{busy ? "Saving…" : isNew ? "Create Group" : "Save Members"}</Button></div>
            </div>
          </form>
        )}
      </Async>
    </Modal>
  );
}
