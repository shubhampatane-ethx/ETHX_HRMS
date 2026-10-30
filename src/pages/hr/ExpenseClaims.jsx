// HR › Expense Claims: every claim with its bills, approver and status. HR can approve / reject (a rejection needs a
// reason, an approval needs a bill), change the approver, and raise a claim for an employee (bill required).
import { useMemo, useState } from "react";
import { Ban, Check, Download, Paperclip, Plus, Receipt, UserCog } from "lucide-react";
import { frappe } from "../../lib/api/frappeClient";
import { Button, DateField, LinkField } from "../../components/ui/primitives";
import { Async, chipCls, Field, Grid, inputCls, Modal, Notice, PageHeader, Panel, StatusPill } from "../../components/employee/EmployeeShell";
import { DecideModal } from "../../components/approvals/ApprovalQueue";
import { dmy, errMsg, isoDate, listTry, money, stripHtml, useAsync } from "../../lib/employeePortal";
import { createExpenseClaim, getApprovers, getRejectionReasons, pickApprover } from "../../lib/approvals";
import { downloadCsv } from "../../lib/recruitment";
import { previewDialog } from "../../components/ui/dialogs";

const FIELDS = ["name", "employee", "employee_name", "department", "company", "posting_date", "total_claimed_amount", "total_sanctioned_amount", "total_amount_reimbursed", "status", "approval_status", "docstatus", "expense_approver", "remark", "currency"];
const BASIC = ["name", "employee", "employee_name", "posting_date", "total_claimed_amount", "status", "approval_status", "docstatus", "expense_approver", "remark"];

async function loadClaims() {
  const rows = await listTry("Expense Claim", { filters: [["docstatus", "<", 2]], fields: FIELDS, orderBy: "posting_date desc, creation desc", limit: 500 }, BASIC);
  const names = rows.map((r) => r.name);
  const [files, lines, reasons] = await Promise.all([
    names.length ? frappe.getList("File", { filters: [["attached_to_doctype", "=", "Expense Claim"], ["attached_to_name", "in", names]], fields: ["attached_to_name", "file_name", "file_url"], limit: 0 }).catch(() => null) : [],
    names.length ? frappe.getList("Expense Claim Detail", { filters: [["parent", "in", names]], fields: ["parent", "expense_type", "description"], parent: "Expense Claim", limit: 0 }).catch(() => []) : [],
    getRejectionReasons(rows.filter((r) => r.approval_status === "Rejected" && !stripHtml(r.remark || "")).map((r) => r.name)),
  ]);
  return rows.map((r) => ({
    ...r,
    bills: files === null ? null : files.filter((f) => f.attached_to_name === r.name),
    types: [...new Set(lines.filter((l) => l.parent === r.name).map((l) => l.expense_type))],
    reason: stripHtml(r.remark || "") || reasons[r.name] || "",
  }));
}

const FILTERS = [["Draft", "Awaiting Approval"], ["Approved", "Approved"], ["Rejected", "Rejected"], ["all", "All"]];

export default function ExpenseClaims() {
  const q = useAsync(loadClaims, []);
  const [filter, setFilter] = useState("Draft");
  const [search, setSearch] = useState("");
  const [modal, setModal] = useState(null);
  const rows = useMemo(() => (q.data || []).filter((r) => (filter === "all" || (r.approval_status || "Draft") === filter) && (!search || `${r.employee_name} ${r.employee} ${r.name} ${r.types.join(" ")}`.toLowerCase().includes(search.toLowerCase()))), [q.data, filter, search]);
  const count = (s) => (q.data || []).filter((r) => (r.approval_status || "Draft") === s).length;

  return (
    <div className="space-y-5">
      <PageHeader icon={Receipt} title="Expense claims" subtitle="Bills, approvers and reimbursement status for every employee" actions={<><Button variant="secondary" disabled={!rows.length} onClick={() => downloadCsv(`expense-claims-${isoDate()}.csv`, ["Claim", "Employee", "ID", "Date", "Types", "Claimed", "Approver", "Approval", "Status", "Reason"], rows.map((r) => [r.name, r.employee_name, r.employee, r.posting_date, r.types.join("; "), r.total_claimed_amount, r.expense_approver, r.approval_status, r.status, r.reason]))}><Download size={14} /> CSV</Button><Button onClick={() => setModal({ kind: "new" })}><Plus size={14} /> Claim for an employee</Button></>} />
      <Panel>
        <div className="mb-4 flex flex-wrap items-center gap-2">
          {FILTERS.map(([v, l]) => <button key={v} type="button" onClick={() => setFilter(v)} className={chipCls(filter === v)}>{l}{v !== "all" && q.data ? ` (${count(v)})` : ""}</button>)}
          <input className={`${inputCls} !w-60 !py-1`} placeholder="Search employee, claim or type…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Async state={q}>
          {() => <Grid rows={rows} empty="No expense claims here." columns={[
            { key: "employee_name", label: "Employee", render: (r) => <span>{r.employee_name || r.employee}<span className="block text-[11px] text-[var(--color-text-faint)]">{[r.name, r.department].filter(Boolean).join(" · ")}</span></span> },
            { key: "posting_date", label: "Date", render: (r) => dmy(r.posting_date) },
            { key: "types", label: "Type", render: (r) => r.types.join(", ") || "—" },
            { key: "total_claimed_amount", label: "Claimed", render: (r) => money(r.total_claimed_amount, r.currency || undefined) },
            { key: "expense_approver", label: "Approver", render: (r) => r.expense_approver || <span className="text-[var(--color-amber)]">not set</span> },
            { key: "bills", label: "Bills", render: (r) => r.bills === null ? "—" : r.bills.length ? <span className="flex flex-col">{r.bills.map((b) => <a key={b.file_url} href={b.file_url} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-[12px] text-[var(--color-red-hover)] hover:underline"><Paperclip size={12} /> {b.file_name}</a>)}</span> : <span className="text-[var(--color-amber)]">none</span> },
            { key: "approval_status", label: "Approval", render: (r) => <span><StatusPill status={r.approval_status} />{r.approval_status === "Rejected" && <span className="mt-1 block max-w-[14rem] text-[11px] text-[var(--color-red-hover)]">Reason: {r.reason || "not stated"}</span>}</span> },
            { key: "status", label: "Payment", render: (r) => (r.approval_status === "Approved" ? <StatusPill status={r.status} /> : "—") },
            { key: "_a", label: "", render: (r) => r.docstatus === 0 && (r.approval_status || "Draft") === "Draft" ? (
              <div className="flex justify-end gap-1">
                <button type="button" title="Change approver" onClick={() => setModal({ kind: "approver", row: r })} className="rounded p-1 text-[var(--color-text-muted)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text)]"><UserCog size={14} /></button>
                <button type="button" title={r.bills?.length === 0 ? "Attach a bill first" : "Approve"} disabled={r.bills?.length === 0} onClick={() => setModal({ kind: "decide", row: r, approve: true })} className="rounded p-1 text-[var(--color-green)] hover:bg-[var(--color-surface-2)] disabled:opacity-30"><Check size={14} /></button>
                <button type="button" title="Reject" onClick={() => setModal({ kind: "decide", row: r, approve: false })} className="rounded p-1 text-[var(--color-text-muted)] hover:text-[var(--color-red-hover)]"><Ban size={14} /></button>
              </div>
            ) : null },
          ]} />}
        </Async>
      </Panel>
      {modal?.kind === "decide" && <DecideModal kind="expense" row={modal.row} approve={modal.approve} onClose={() => setModal(null)} onDone={() => { setModal(null); q.reload(); }} />}
      {modal?.kind === "approver" && <ApproverModal row={modal.row} onClose={() => setModal(null)} onSaved={() => { setModal(null); q.reload(); }} />}
      {modal?.kind === "new" && <NewClaimModal onClose={() => setModal(null)} onSaved={() => { setModal(null); q.reload(); }} />}
    </div>
  );
}

function ApproverModal({ row, onClose, onSaved }) {
  const list = useAsync(() => getApprovers({ name: row.employee }, "Expense Claim", row.types[0] || ""), [row.employee]);
  const [pick, setPick] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const options = list.data || [];
  const chosen = pick || pickApprover(options.filter((a) => a.email !== row.expense_approver))?.email || "";
  async function save() {
    const who = options.find((a) => a.email === chosen);
    if (!(await previewDialog({ title: "Change approver", rows: [["Claim", row.name], ["Current approver", row.expense_approver || "—"], ["New approver", who ? `${who.name} (${who.email})` : chosen]], confirmLabel: "Confirm & save" }))) return;
    setBusy(true);
    setErr("");
    try { await frappe.updateDoc("Expense Claim", row.name, { expense_approver: chosen }); onSaved(); } catch (e) { setErr(errMsg(e, "The change was refused.")); setBusy(false); }
  }
  return (
    <Modal title={`Change approver · ${row.name}`} onClose={onClose}>
      <div className="space-y-3">
        <p className="text-[12px] text-[var(--color-text-muted)]">{row.employee_name} · {row.types.join(", ")} · now: {row.expense_approver || "none"}</p>
        <Async state={list}>
          {() => options.length === 0 ? <Notice tone="info">No approver is set for this expense type or business unit. Set them in Admin › Organization.</Notice> : (
            <Field label="New approver">
              <select className={inputCls} value={chosen} onChange={(e) => setPick(e.target.value)}>
                <option value="">Select…</option>
                {options.map((a) => <option key={a.email} value={a.email} disabled={a.email === row.expense_approver}>{a.name} - {a.source}{a.on_leave ? " (on leave)" : ""}{a.email === row.expense_approver ? " (current)" : ""}</option>)}
              </select>
            </Field>
          )}
        </Async>
        {err && <Notice>{err}</Notice>}
        <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={onClose}>Cancel</Button><Button onClick={save} disabled={busy || !chosen}>{busy ? "Saving…" : "Save"}</Button></div>
      </div>
    </Modal>
  );
}

function NewClaimModal({ onClose, onSaved }) {
  const [f, setF] = useState({ employee: "", date: isoDate(), type: "", amount: "", description: "" });
  const [files, setFiles] = useState([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const types = useAsync(() => frappe.getList("Expense Claim Type", { fields: ["name"], limit: 0, orderBy: "name asc" }), []);

  async function submit(e) {
    e.preventDefault();
    if (!files.length) return setErr("Attach at least one bill or receipt - it is required for every claim.");
    setBusy(true);
    setErr("");
    try {
      const emp = await frappe.getDoc("Employee", f.employee);
      const approver = pickApprover(await getApprovers(emp, "Expense Claim", f.type).catch(() => []));
      await createExpenseClaim({ employee: emp, approver: approver?.email, files, lines: [{ expense_date: f.date, expense_type: f.type, description: f.description, amount: f.amount }] });
      onSaved();
    } catch (x) {
      setErr(x?.response ? errMsg(x, "Couldn't create the claim.") : x?.message || "Couldn't create the claim.");
      setBusy(false);
    }
  }

  return (
    <Modal title="Expense claim for an employee" onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <LinkField label="Employee" linkDoctype="Employee" value={f.employee} onChange={(v) => setF({ ...f, employee: v })} required frappe={frappe} />
        <div className="grid grid-cols-2 gap-3">
          <DateField label="Expense date" value={f.date} onChange={(v) => setF({ ...f, date: v })} required />
          <Field label="Expense type"><select required className={inputCls} value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}><option value="">Select…</option>{(types.data || []).map((t) => <option key={t.name}>{t.name}</option>)}</select></Field>
        </div>
        <Field label="Amount"><input type="number" min="0.01" step="0.01" required className={inputCls} value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} /></Field>
        <Field label="Description"><textarea rows={2} className={inputCls} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
        <label className="block">
          <span className="mb-1.5 block text-[12px] text-[var(--color-text-muted)]">Bills (required)</span>
          <input type="file" multiple accept="image/*,.pdf" onChange={(e) => setFiles(Array.from(e.target.files || []))} className="block w-full text-[12px] text-[var(--color-text-muted)] file:mr-3 file:rounded-md file:border file:border-[var(--color-border-strong)] file:bg-[var(--color-surface-2)] file:px-3 file:py-1.5 file:text-[12px] file:text-[var(--color-text)]" />
        </label>
        <p className="text-[11px] text-[var(--color-text-faint)]">The approver comes from the expense type (or the employee's business unit); they decide it in their approvals.</p>
        {err && <Notice>{err}</Notice>}
        <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={onClose}>Cancel</Button><Button type="submit" disabled={busy || !files.length || !f.employee || !f.type}>{busy ? "Saving…" : "Create claim"}</Button></div>
      </form>
    </Modal>
  );
}
