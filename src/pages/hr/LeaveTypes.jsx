// HR › Settings › Leave Types: the leave types employees can apply for, and how each behaves.
// "Add standard leave types" creates the usual Indian set (CL, SL, EL/PL, Comp Off, LWP, Maternity, Paternity,
// Bereavement, Marriage, RH) - only the missing ones; existing types are never changed by it.
// How many days each employee gets is set by allocating leave (HR › Leave › Allocate), not here.
import { useState } from "react";
import { CalendarDays, Pencil, Plus, Sparkles } from "lucide-react";
import { frappe } from "../../lib/api/frappeClient";
import { Button } from "../../components/ui/primitives";
import { Async, Field, Grid, inputCls, Modal, Notice, PageHeader, Panel } from "../../components/employee/EmployeeShell";
import { errMsg, useAsync } from "../../lib/employeePortal";
import { LEAVE_TYPE_RECORDS } from "../../lib/hrFixesSetup";

const FIELDS = ["name", "max_leaves_allowed", "max_continuous_days_allowed", "applicable_after", "is_lwp", "is_carry_forward", "is_optional_leave", "is_compensatory", "include_holiday", "allow_negative", "is_earned_leave"];
const FLAGS = [
  ["is_lwp", "Leave without pay", "No balance needed; the days are unpaid"],
  ["is_carry_forward", "Carry forward", "Unused days move to the next leave period"],
  ["is_compensatory", "Compensatory off", "Earned by working on a holiday (Compensatory Leave Request)"],
  ["is_optional_leave", "Optional / restricted holiday", "Taken only on days in the optional holiday list"],
  ["include_holiday", "Count holidays", "Weekends and holidays inside the leave are counted as leave"],
  ["allow_negative", "Allow negative balance", "Employees can apply beyond their balance"],
];
const num = (v) => (v === "" || v == null ? 0 : Number(v));
const kind = (t) => [Number(t.is_lwp) && "Unpaid", Number(t.is_compensatory) && "Comp off", Number(t.is_optional_leave) && "Optional", Number(t.is_carry_forward) && "Carry forward", Number(t.include_holiday) && "Counts holidays"].filter(Boolean).join(" · ") || "Paid";

export default function LeaveTypes() {
  const types = useAsync(() => frappe.getList("Leave Type", { fields: FIELDS, orderBy: "name asc", limit: 0 }).catch(() => frappe.getList("Leave Type", { fields: ["name"], orderBy: "name asc", limit: 0 })), []);
  const [open, setOpen] = useState(null); // null | {} new | { type }
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  const have = new Set((types.data || []).map((t) => t.name.toLowerCase()));
  const missing = LEAVE_TYPE_RECORDS.filter((r) => !have.has(r.name.toLowerCase()));

  async function addStandard() {
    setBusy(true);
    setMsg(null);
    const added = [];
    const failed = [];
    for (const r of missing) {
      try { await frappe.createDoc("Leave Type", r.doc); added.push(r.name); } catch (e) { failed.push(`${r.name}: ${errMsg(e, "not added")}`); }
    }
    setBusy(false);
    setMsg(failed.length ? { ok: false, text: `${added.length ? `Added ${added.join(", ")}. ` : ""}Couldn't add: ${failed.join("; ")}` } : { ok: true, text: `Added ${added.join(", ")}. Allocate days to employees under HR › Leave › Allocate.` });
    types.reload();
  }

  return (
    <div className="space-y-5">
      <PageHeader icon={CalendarDays} title="Leave Types" subtitle="Casual, sick, earned, comp off, unpaid, maternity… and how each one behaves" actions={<div className="flex gap-2">{missing.length > 0 && <Button variant="secondary" disabled={busy} onClick={addStandard}><Sparkles size={14} /> {busy ? "Adding…" : `Add Standard Leave Types (${missing.length})`}</Button>}<Button onClick={() => setOpen({})}><Plus size={14} /> New Leave Type</Button></div>} />
      {missing.length > 0 && <Notice tone="info">Missing from the standard set: {missing.map((m) => m.name).join(", ")}.</Notice>}
      {msg && <Notice tone={msg.ok ? "info" : "error"}>{msg.text}</Notice>}
      <Panel hint="Half day is chosen by the employee when applying (any leave type). Days per employee come from leave allocations.">
        <Async state={types}>
          {(rows) => <Grid rows={rows} empty="No leave types yet." columns={[
            { key: "name", label: "Leave Type", render: (t) => <b className="font-medium">{t.name}</b> },
            { key: "kind", label: "Behaviour", render: (t) => <span className="text-[12px]">{kind(t)}</span> },
            { key: "max_leaves_allowed", label: "Max per period", render: (t) => (num(t.max_leaves_allowed) ? `${num(t.max_leaves_allowed)} days` : "As allocated") },
            { key: "max_continuous_days_allowed", label: "Max in a row", render: (t) => (num(t.max_continuous_days_allowed) ? `${num(t.max_continuous_days_allowed)} days` : "—") },
            { key: "_e", label: "", render: (t) => <button type="button" title="Edit" onClick={() => setOpen({ type: t })} className="rounded p-1 text-[var(--color-text-muted)] hover:text-[var(--color-text)]"><Pencil size={14} /></button> },
          ]} />}
        </Async>
      </Panel>
      {open && <TypeModal type={open.type} onClose={() => setOpen(null)} onSaved={() => { setOpen(null); types.reload(); }} />}
    </div>
  );
}

function TypeModal({ type, onClose, onSaved }) {
  const [f, setF] = useState(() => ({
    name: type?.name || "",
    max_leaves_allowed: type ? String(num(type.max_leaves_allowed) || "") : "",
    max_continuous_days_allowed: type ? String(num(type.max_continuous_days_allowed) || "") : "",
    applicable_after: type ? String(num(type.applicable_after) || "") : "",
    ...Object.fromEntries(FLAGS.map(([k]) => [k, Boolean(Number(type?.[k]))])),
  }));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setErr("");
    try {
      const body = {
        max_leaves_allowed: num(f.max_leaves_allowed), max_continuous_days_allowed: num(f.max_continuous_days_allowed), applicable_after: num(f.applicable_after),
        ...Object.fromEntries(FLAGS.map(([k]) => [k, f[k] ? 1 : 0])),
      };
      if (type) await frappe.updateDoc("Leave Type", type.name, body);
      else await frappe.createDoc("Leave Type", { leave_type_name: f.name.trim(), ...body });
      onSaved();
    } catch (x) {
      setErr(errMsg(x, "Couldn't save the leave type."));
      setBusy(false);
    }
  }
  return (
    <Modal title={type ? `Edit ${type.name}` : "New Leave Type"} onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <Field label="Name"><input required disabled={Boolean(type)} className={inputCls} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="e.g. Birthday Leave" /></Field>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Max days per period" hint="0 = as allocated"><input type="number" min="0" step="0.5" className={inputCls} value={f.max_leaves_allowed} onChange={(e) => setF({ ...f, max_leaves_allowed: e.target.value })} /></Field>
          <Field label="Max days in a row" hint="0 = no limit"><input type="number" min="0" className={inputCls} value={f.max_continuous_days_allowed} onChange={(e) => setF({ ...f, max_continuous_days_allowed: e.target.value })} /></Field>
          <Field label="After working days" hint="Can apply only after"><input type="number" min="0" className={inputCls} value={f.applicable_after} onChange={(e) => setF({ ...f, applicable_after: e.target.value })} /></Field>
        </div>
        <div className="space-y-2">
          {FLAGS.map(([k, label, hint]) => (
            <label key={k} className="flex items-start gap-2 text-[13px] text-[var(--color-text)]">
              <input type="checkbox" className="mt-0.5" checked={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.checked })} />
              <span>{label}<span className="block text-[11.5px] text-[var(--color-text-muted)]">{hint}</span></span>
            </label>
          ))}
        </div>
        {err && <Notice>{err}</Notice>}
        <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={onClose}>Cancel</Button><Button type="submit" disabled={busy}>{busy ? "Saving…" : type ? "Save Changes" : "Create"}</Button></div>
      </form>
    </Modal>
  );
}
