// HR › Lifecycle: promotions, transfers and exits on HRMS's own records (Employee Promotion, Employee Transfer,
// Employee Separation). Submitting a promotion / transfer updates the Employee record (HRMS does this on its
// effective date); an exit runs the separation checklist, then HR marks the employee as Left.
import { useState } from "react";
import { LogOut, Plus, TrendingUp } from "lucide-react";
import { frappe } from "../../lib/api/frappeClient";
import { Button, DateField, LinkField } from "../../components/ui/primitives";
import { Async, Field, Grid, inputCls, Modal, Notice, PageHeader, Panel, StatusPill, Tabs } from "../../components/employee/EmployeeShell";
import { dmy, errMsg, isoDate, listTry, money, useAsync } from "../../lib/employeePortal";
import { confirmDialog } from "../../components/ui/dialogs";

// Employee fields a promotion or transfer can change, with the doctype they link to.
const PROPS = [
  { fieldname: "designation", label: "Designation", link: "Designation" },
  { fieldname: "department", label: "Department", link: "Department" },
  { fieldname: "grade", label: "Grade", link: "Employee Grade" },
  { fieldname: "branch", label: "Branch", link: "Branch" },
  { fieldname: "reports_to", label: "Reports To", link: "Employee", title: "employee_name" },
];
const statusOf = (d) => (d.docstatus === 2 ? "Cancelled" : d.docstatus === 1 ? "Submitted" : "Draft");

export default function Lifecycle() {
  const [tab, setTab] = useState("promotions");
  return (
    <div className="space-y-5">
      <PageHeader icon={TrendingUp} title="Employee Lifecycle" subtitle="Promotions, transfers and exits - each updates the employee record when it takes effect" />
      <Tabs value={tab} onChange={setTab} tabs={[{ id: "promotions", label: "Promotions" }, { id: "transfers", label: "Transfers" }, { id: "exits", label: "Exits" }]} />
      {tab === "promotions" && <Moves kind="promotion" />}
      {tab === "transfers" && <Moves kind="transfer" />}
      {tab === "exits" && <Exits />}
    </div>
  );
}

const DT = { promotion: "Employee Promotion", transfer: "Employee Transfer" };

function Moves({ kind }) {
  const dt = DT[kind];
  const date = kind === "promotion" ? "promotion_date" : "transfer_date";
  const list = useAsync(() => listTry(dt, { fields: ["name", "employee", "employee_name", date, "docstatus", "company", ...(kind === "promotion" ? ["revised_ctc", "current_ctc"] : ["new_company"])], orderBy: `${date} desc` }, ["name", "employee", "employee_name", date, "docstatus"]), [dt]);
  const details = useAsync(async () => {
    const names = (list.data || []).map((r) => r.name);
    if (!names.length) return {};
    const rows = await frappe.getList("Employee Property History", { parent: dt, filters: [["parent", "in", names]], fields: ["parent", "property", "current", "new"], limit: 0 }).catch(() => []);
    const m = {};
    rows.forEach((r) => { (m[r.parent] ||= []).push(r); });
    return m;
  }, [list.data]);
  const [open, setOpen] = useState(false);
  const [msg, setMsg] = useState(null);

  async function submit(r) {
    if (r[date] > isoDate()) return setMsg({ ok: false, text: `A ${kind} can only be submitted on or after its effective date (${dmy(r[date])}). Submit it then.` });
    if (!(await confirmDialog(`Submit this ${kind}? The employee record is updated now.`))) return;
    try {
      await frappe.submitDoc(await frappe.getDoc(dt, r.name));
      setMsg({ ok: true, text: `${r.employee_name}: ${kind} submitted.` });
      list.reload();
    } catch (e) {
      setMsg({ ok: false, text: errMsg(e, `Couldn't submit the ${kind}.`) });
    }
  }

  return (
    <Panel action={<Button onClick={() => setOpen(true)}><Plus size={14} /> New {kind}</Button>}>
      {msg && <div className="mb-3"><Notice tone={msg.ok ? "info" : "error"}>{msg.text}</Notice></div>}
      <Async state={list}>
        {(rows) => <Grid rows={rows} empty={`No ${kind}s yet.`} columns={[
          { key: "employee_name", label: "Employee", render: (r) => <span>{r.employee_name}<span className="block text-[11px] text-[var(--color-text-faint)]">{r.name}</span></span> },
          { key: date, label: "Effective", render: (r) => dmy(r[date]) },
          { key: "changes", label: "Changes", render: (r) => <span className="text-[12px]">{(details.data?.[r.name] || []).map((p) => `${p.property}: ${p.current || "—"} → ${p.new}`).join(" · ") || "—"}{kind === "transfer" && r.new_company && r.new_company !== r.company ? ` · Company → ${r.new_company}` : ""}{kind === "promotion" && Number(r.revised_ctc) ? ` · CTC → ${money(r.revised_ctc)}` : ""}</span> },
          { key: "status", label: "Status", render: (r) => <StatusPill status={statusOf(r)} /> },
          { key: "_a", label: "", render: (r) => (r.docstatus === 0 ? (r[date] > isoDate() ? <span className="text-[11px] text-[var(--color-text-faint)]">Submit on {dmy(r[date])}</span> : <Button variant="secondary" className="!px-2 !py-1 text-[11px]" onClick={() => submit(r)}>Submit</Button>) : null) },
        ]} />}
      </Async>
      {open && <MoveModal kind={kind} onClose={() => setOpen(false)} onSaved={() => { setOpen(false); list.reload(); }} />}
    </Panel>
  );
}

function MoveModal({ kind, onClose, onSaved }) {
  const [employee, setEmployee] = useState("");
  const emp = useAsync(() => (employee ? frappe.getDoc("Employee", employee) : Promise.resolve(null)), [employee]);
  const [values, setValues] = useState({});
  const [f, setF] = useState({ date: isoDate(), revised_ctc: "", new_company: "", submitNow: false });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const e = emp.data;
  const changes = e ? PROPS.filter((p) => values[p.fieldname] && values[p.fieldname] !== (e[p.fieldname] || "")) : [];

  async function submit(ev) {
    ev.preventDefault();
    if (!changes.length && !(kind === "promotion" && f.revised_ctc) && !(kind === "transfer" && f.new_company && f.new_company !== e.company)) return setErr("Change at least one detail.");
    // ERPNext requires at least one property row on a transfer (e.g. the department in the new company)
    if (kind === "transfer" && !changes.length) return setErr("Also choose what changes with the transfer (for example the department or designation in the new company).");
    if (f.submitNow && f.date > isoDate()) return setErr(`A ${kind} can only be submitted on or after its effective date - save it now and submit it on ${dmy(f.date)}.`);
    setBusy(true);
    setErr("");
    try {
      const details = changes.map((p) => ({ property: p.label, fieldname: p.fieldname, current: e[p.fieldname] || "", new: values[p.fieldname] }));
      const doc = kind === "promotion"
        ? { employee, promotion_date: f.date, company: e.company, promotion_details: details, ...(f.revised_ctc ? { revised_ctc: Number(f.revised_ctc), current_ctc: e.ctc || 0, salary_currency: e.salary_currency || undefined } : {}) }
        : { employee, transfer_date: f.date, company: e.company, new_company: f.new_company || e.company, transfer_details: details };
      const saved = await frappe.createDoc(DT[kind], doc);
      if (f.submitNow) await frappe.submitDoc(await frappe.getDoc(DT[kind], saved.name));
      onSaved();
    } catch (x) {
      setErr(errMsg(x, `Couldn't save the ${kind}.`));
      setBusy(false);
    }
  }

  return (
    <Modal title={kind === "promotion" ? "New Promotion" : "New Transfer"} onClose={onClose} wide>
      <form onSubmit={submit} className="space-y-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <LinkField label="Employee" linkDoctype="Employee" value={employee} onChange={(v) => { setEmployee(v); setValues({}); }} required frappe={frappe} />
          <DateField label={kind === "promotion" ? "Promotion Date" : "Transfer Date"} value={f.date} onChange={(v) => setF({ ...f, date: v })} required />
        </div>
        {e && (
          <>
            <table className="w-full text-left text-[12.5px]">
              <thead><tr className="text-[var(--color-text-muted)]"><th className="py-1.5 font-medium">Detail</th><th className="py-1.5 font-medium">Current</th><th className="py-1.5 font-medium">New (Leave Empty to Keep)</th></tr></thead>
              <tbody>
                {PROPS.map((p) => (
                  <tr key={p.fieldname} className="border-t border-[var(--color-border)]">
                    <td className="py-1.5 pr-3 text-[var(--color-text)]">{p.label}</td>
                    <td className="py-1.5 pr-3 text-[var(--color-text-muted)]">{e[p.fieldname] || "—"}</td>
                    <td className="py-1.5"><LinkField label="" linkDoctype={p.link} titleField={p.title} value={values[p.fieldname] || ""} onChange={(v) => setValues({ ...values, [p.fieldname]: v })} frappe={frappe} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
            {kind === "promotion" && <Field label={`Revised CTC (₹/yr)${e.ctc ? ` - current ${money(e.ctc)}` : ""}`}><input type="number" min="0" className={inputCls} value={f.revised_ctc} onChange={(x) => setF({ ...f, revised_ctc: x.target.value })} /></Field>}
            {kind === "transfer" && <LinkField label={`New company (current: ${e.company})`} linkDoctype="Company" value={f.new_company} onChange={(v) => setF({ ...f, new_company: v })} frappe={frappe} />}
          </>
        )}
        <label className="flex items-center gap-2 text-[12px] text-[var(--color-text-muted)]"><input type="checkbox" checked={f.submitNow} onChange={(x) => setF({ ...f, submitNow: x.target.checked })} /> Submit now (otherwise saved as a draft to review)</label>
        {err && <Notice>{err}</Notice>}
        <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={onClose}>Cancel</Button><Button type="submit" disabled={busy || !e}>{busy ? "Saving…" : "Save"}</Button></div>
      </form>
    </Modal>
  );
}

/* ---------------------------------- exits ---------------------------------- */

function Exits() {
  const list = useAsync(() => listTry("Employee Separation", { fields: ["name", "employee", "employee_name", "resignation_letter_date", "boarding_begins_on", "boarding_status", "docstatus", "department", "designation"], orderBy: "creation desc" }, ["name", "employee", "employee_name", "boarding_begins_on", "boarding_status", "docstatus"]), []);
  const emps = useAsync(async () => {
    const ids = [...new Set((list.data || []).map((r) => r.employee))];
    if (!ids.length) return {};
    const rows = await frappe.getList("Employee", { filters: [["name", "in", ids]], fields: ["name", "status", "relieving_date", "user_id"], limit: 0 });
    return Object.fromEntries(rows.map((r) => [r.name, r]));
  }, [list.data]);
  const [modal, setModal] = useState(null);
  const [msg, setMsg] = useState(null);

  return (
    <Panel action={<Button onClick={() => setModal({ kind: "new" })}><Plus size={14} /> Start Exit</Button>}>
      {msg && <div className="mb-3"><Notice tone={msg.ok ? "info" : "error"}>{msg.text}</Notice></div>}
      <Async state={list}>
        {(rows) => <Grid rows={rows} empty="No exits in progress." columns={[
          { key: "employee_name", label: "Employee", render: (r) => <span>{r.employee_name}<span className="block text-[11px] text-[var(--color-text-faint)]">{[r.designation, r.department].filter(Boolean).join(" · ")}</span></span> },
          { key: "resignation_letter_date", label: "Resigned", render: (r) => dmy(r.resignation_letter_date) || "—" },
          { key: "boarding_begins_on", label: "Last Working Day", render: (r) => dmy(r.boarding_begins_on) },
          { key: "boarding_status", label: "Checklist", render: (r) => <StatusPill status={r.docstatus === 0 ? "Draft" : r.boarding_status} /> },
          { key: "emp", label: "Employee Status", render: (r) => { const e = emps.data?.[r.employee]; return e ? <span><StatusPill status={e.status} />{e.relieving_date && <span className="block text-[10.5px] text-[var(--color-text-faint)]">relieved {dmy(e.relieving_date)}</span>}</span> : "…"; } },
          { key: "_a", label: "", render: (r) => {
            const e = emps.data?.[r.employee];
            return <div className="flex justify-end gap-1">
              {r.docstatus === 0 && <Button variant="secondary" className="!px-2 !py-1 text-[11px]" onClick={async () => { if (!(await confirmDialog(`Start the separation checklist for ${r.employee_name || r.employee}?`))) return; try { await frappe.submitDoc(await frappe.getDoc("Employee Separation", r.name)); list.reload(); } catch (x) { setMsg({ ok: false, text: errMsg(x, "Couldn't start the checklist.") }); } }}>Start Checklist</Button>}
              {e && e.status !== "Left" && <Button variant="ghost" className="!px-2 !py-1 text-[11px]" onClick={() => setModal({ kind: "left", row: r, emp: e })}><LogOut size={12} /> Mark as Left</Button>}
            </div>;
          } },
        ]} />}
      </Async>
      {modal?.kind === "new" && <ExitModal onClose={() => setModal(null)} onSaved={() => { setModal(null); list.reload(); }} />}
      {modal?.kind === "left" && <LeftModal row={modal.row} emp={modal.emp} onClose={() => setModal(null)} onSaved={(text) => { setModal(null); setMsg({ ok: true, text }); list.reload(); emps.reload(); }} />}
    </Panel>
  );
}

function ExitModal({ onClose, onSaved }) {
  const [f, setF] = useState({ employee: "", resigned: isoDate(), last: "", template: "", reason: "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setErr("");
    try {
      const emp = await frappe.getDoc("Employee", f.employee);
      let activities;
      if (f.template) {
        const t = await frappe.getDoc("Employee Separation Template", f.template);
        activities = (t.activities || []).map(({ activity_name, user, role, required_for_employee_creation, description, duration, begin_on, task_weight }) => ({ activity_name, user, role, required_for_employee_creation, description, duration, begin_on, task_weight }));
      }
      // Record the notice on the employee first: the separation copies the resignation date from the employee.
      try { await frappe.updateDoc("Employee", f.employee, { resignation_letter_date: f.resigned, relieving_date: f.last, reason_for_leaving: f.reason || undefined }); } catch { /* not allowed - HR can set it later */ }
      await frappe.createDoc("Employee Separation", { employee: f.employee, company: emp.company, department: emp.department, designation: emp.designation, resignation_letter_date: f.resigned, boarding_begins_on: f.last, employee_separation_template: f.template || undefined, activities });
      onSaved();
    } catch (x) {
      setErr(errMsg(x, "Couldn't start the exit."));
      setBusy(false);
    }
  }
  return (
    <Modal title="Start an Exit" onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <LinkField label="Employee" linkDoctype="Employee" value={f.employee} onChange={(v) => setF({ ...f, employee: v })} required frappe={frappe} />
        <div className="grid grid-cols-2 gap-3"><DateField label="Resignation Date" value={f.resigned} onChange={(v) => setF({ ...f, resigned: v })} required /><DateField label="Last Working Day" value={f.last} onChange={(v) => setF({ ...f, last: v })} required /></div>
        <LinkField label="Exit Checklist Template (Optional)" linkDoctype="Employee Separation Template" value={f.template} onChange={(v) => setF({ ...f, template: v })} frappe={frappe} />
        <Field label="Reason for Leaving"><input className={inputCls} value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} /></Field>
        {err && <Notice>{err}</Notice>}
        <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={onClose}>Cancel</Button><Button type="submit" disabled={busy}>{busy ? "Saving…" : "Start Exit"}</Button></div>
      </form>
    </Modal>
  );
}

function LeftModal({ row, emp, onClose, onSaved }) {
  const [date, setDate] = useState(emp.relieving_date || row.boarding_begins_on || isoDate());
  const [disable, setDisable] = useState(Boolean(emp.user_id));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setErr("");
    try {
      await frappe.updateDoc("Employee", row.employee, { status: "Left", relieving_date: date });
      let note = "";
      if (disable && emp.user_id) {
        try { await frappe.callMethod("ethx_employee_login_access", { employee: row.employee, enable: 0 }); note = " Portal login disabled."; } catch { note = " Disable the portal login from HR › Employees."; }
      }
      onSaved(`${row.employee_name} marked as Left from ${dmy(date)}.${note}`);
    } catch (x) {
      setErr(errMsg(x, "Couldn't update the employee."));
      setBusy(false);
    }
  }
  return (
    <Modal title={`Mark ${row.employee_name} as Left`} onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <DateField label="Relieving Date" value={date} onChange={setDate} required />
        {emp.user_id && <label className="flex items-center gap-2 text-[12px] text-[var(--color-text-muted)]"><input type="checkbox" checked={disable} onChange={(e) => setDisable(e.target.checked)} /> Disable their portal login ({emp.user_id})</label>}
        {err && <Notice>{err}</Notice>}
        <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={onClose}>Cancel</Button><Button type="submit" disabled={busy}>{busy ? "Saving…" : "Mark as Left"}</Button></div>
      </form>
    </Modal>
  );
}
