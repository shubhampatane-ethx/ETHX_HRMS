// Leave applications and expense claims waiting for the signed-in user's decision. Used by the employee portal
// (My Approvals), the Project Manager workspace and HR. Rejections always need a reason; an expense claim can't be
// approved without a bill.
import { useState } from "react";
import { Ban, Check, Paperclip } from "lucide-react";
import { Button } from "../ui/primitives";
import { Async, Field, Grid, inputCls, Modal, Notice, Panel } from "../employee/EmployeeShell";
import { useAuth } from "../../context/AuthContext";
import { dmy, errMsg, money, stripHtml, useAsync } from "../../lib/employeePortal";
import { decideExpense, decideLeave, getWaitingForMe } from "../../lib/approvals";

const failMsg = (e) => (e?.response ? errMsg(e, "This request couldn't be completed.") : e?.message || "Something went wrong.");
const dates = (r) => `${dmy(r.from_date)}${r.to_date && r.to_date !== r.from_date ? ` – ${dmy(r.to_date)}` : ""}${Number(r.half_day) ? " (half day)" : ""}`;

/** The signed-in user's queue (leave + expense claims waiting for them), as an async state. */
export function useApprovalQueue() {
  const { user } = useAuth();
  return useAsync(() => getWaitingForMe(user.email), [user.email]);
}

export function ApprovalQueue({ state }) {
  const [decide, setDecide] = useState(null); // { kind: "leave"|"expense", row, approve: bool }

  return (
    <Async state={state}>
      {(d) => (
        <>
          {d.failed.length > 0 && <Notice tone="info">Couldn't load {d.failed.join(" and ")} requests - your account may not have approver access yet. Ask HR to add you as an approver.</Notice>}
          <Panel title="Leave Requests" hint="Leave you approve as the business-unit approver or as the employee's manager">
            <Grid rows={d.leaves} empty="No leave requests are waiting for you." columns={[
              { key: "employee_name", label: "Employee", render: (r) => <span>{r.employee_name || r.employee}<span className="block text-[11px] text-[var(--color-text-faint)]">{[r.employee, r.department].filter(Boolean).join(" · ")}</span></span> },
              { key: "leave_type", label: "Type" },
              { key: "from_date", label: "Dates", render: dates },
              { key: "total_leave_days", label: "Days" },
              { key: "description", label: "Reason", render: (r) => <span className="text-[var(--color-text-muted)]">{stripHtml(r.description || "") || "—"}</span> },
              { key: "_a", label: "", render: (r) => (
                <div className="flex justify-end gap-3">
                  <button type="button" onClick={() => setDecide({ kind: "leave", row: r, approve: true })} className="flex items-center gap-1 text-[12px] text-[var(--color-green)] hover:underline"><Check size={13} /> Approve</button>
                  <button type="button" onClick={() => setDecide({ kind: "leave", row: r, approve: false })} className="flex items-center gap-1 text-[12px] text-[var(--color-red-hover)] hover:underline"><Ban size={13} /> Reject</button>
                </div>) },
            ]} />
          </Panel>
          <Panel title="Expense Claims" hint="Claims whose expense type (or business unit) has you as the approver">
            <Grid rows={d.expenses} empty="No expense claims are waiting for you." columns={[
              { key: "employee_name", label: "Employee" },
              { key: "posting_date", label: "Date", render: (r) => dmy(r.posting_date) },
              { key: "lines", label: "Expense", render: (r) => (d.lines[r.name] || []).map((l, i) => <span key={i} className="block">{l.expense_type}{l.description ? <span className="text-[11px] text-[var(--color-text-faint)]"> · {stripHtml(l.description)}</span> : null}</span>) },
              { key: "total_claimed_amount", label: "Amount", render: (r) => money(r.total_claimed_amount, r.currency || undefined) },
              { key: "bills", label: "Bills", render: (r) => (d.bills[r.name] || []).length ? <span className="flex flex-wrap gap-x-3">{d.bills[r.name].map((b) => <a key={b.file_url} href={b.file_url} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-[12px] text-[var(--color-red-hover)] hover:underline"><Paperclip size={12} /> {b.file_name}</a>)}</span> : <span className="text-[var(--color-amber)]">no bill attached</span> },
              { key: "_a", label: "", render: (r) => {
                const noBill = !(d.bills[r.name] || []).length;
                return (
                  <div className="flex justify-end gap-3">
                    <button type="button" disabled={noBill} title={noBill ? "A bill must be attached before this claim can be approved" : undefined} onClick={() => setDecide({ kind: "expense", row: r, approve: true })} className="flex items-center gap-1 text-[12px] text-[var(--color-green)] hover:underline disabled:cursor-not-allowed disabled:opacity-40 disabled:no-underline"><Check size={13} /> Approve</button>
                    <button type="button" onClick={() => setDecide({ kind: "expense", row: r, approve: false })} className="flex items-center gap-1 text-[12px] text-[var(--color-red-hover)] hover:underline"><Ban size={13} /> Reject</button>
                  </div>
                );
              } },
            ]} />
          </Panel>
          {decide && <DecideModal {...decide} onClose={() => setDecide(null)} onDone={() => { setDecide(null); state.reload(); }} />}
        </>
      )}
    </Async>
  );
}

export function DecideModal({ kind, row, approve, onClose, onDone }) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const min = kind === "expense" ? 5 : 3;
  const what = kind === "expense" ? `${row.employee_name}'s expense claim` : `${row.employee_name}'s leave`;
  const summary = kind === "expense" ? `${money(row.total_claimed_amount, row.currency || undefined)} · ${dmy(row.posting_date)}` : `${row.leave_type} · ${dates(row)} · ${row.total_leave_days ?? ""} day(s)`;

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setErr("");
    try {
      if (kind === "expense") await decideExpense(row.name, approve, note);
      else await decideLeave(row.name, approve ? "Approved" : "Rejected", note);
      onDone();
    } catch (x) {
      setErr(failMsg(x));
      setBusy(false);
    }
  }

  return (
    <Modal title={`${approve ? "Approve" : "Reject"} ${what}`} onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <p className="text-[13px] text-[var(--color-text-muted)]">{summary}</p>
        {approve ? (
          kind === "leave" && <Field label="Note (optional)"><textarea rows={2} className={inputCls} value={note} onChange={(e) => setNote(e.target.value)} /></Field>
        ) : (
          <Field label="Reason for rejection (required - the employee sees it)">
            <textarea required minLength={min} rows={3} className={inputCls} value={note} onChange={(e) => setNote(e.target.value)} placeholder={kind === "expense" ? "e.g. Receipt is unreadable / amount exceeds policy" : "e.g. Project deadline that week - please pick other dates"} />
          </Field>
        )}
        {err && <Notice>{err}</Notice>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={busy || (!approve && note.trim().length < min)}>{busy ? "Saving…" : approve ? "Approve" : "Reject"}</Button>
        </div>
      </form>
    </Modal>
  );
}
