// Hand someone's work over to a successor in one go - used when they leave (HR › Lifecycle › Exits) or from the
// Hierarchy page. The server rule ethx_handover moves their pending leave / expense approvals, their approver roles
// (Employee records, business units, expense types) and their direct reports; the projects they manage are moved here
// through ethx_set_project_manager, which also gives the new manager the Projects workspace.
import { useMemo, useState } from "react";
import { Briefcase, CalendarCheck, Receipt, ShieldCheck, Users } from "lucide-react";
import { frappe } from "../lib/api/frappeClient";
import { setProjectManager } from "../lib/projectRoles";
import { errMsg, useAsync } from "../lib/employeePortal";
import { Button } from "./ui/primitives";
import { Field, Modal, Notice } from "./employee/EmployeeShell";
import { TeamMemberSearch } from "./TeamMemberSearch";

const NOT_READY = /Failed to get method|not whitelisted|has no attribute|No module named/i;
const friendly = (e, fallback) => {
  const d = e?.response?.data || {};
  if (e?.response?.status === 404 || NOT_READY.test(String(d.exception || d.exc || ""))) return "Handover isn't set up on the server yet. It's set up automatically the next time the Administrator signs in.";
  return errMsg(e, fallback);
};

export const previewHandover = (employee) => frappe.callMethod("ethx_handover", { employee, preview: 1 });

/** Hand everything over; returns { moved, projectsFailed }. */
export async function runHandover(employee, toUser, projects = []) {
  const moved = await frappe.callMethod("ethx_handover", { employee, to_user: toUser });
  const failed = [];
  for (const p of projects) {
    try { await setProjectManager(p.name, toUser); } catch { failed.push(p.project_name || p.name); }
  }
  return { moved, projectsFailed: failed };
}

/** Lines describing what would move. */
export function handoverLines(s) {
  if (!s) return [];
  const n = (x) => (Array.isArray(x) ? x.length : Number(x) || 0);
  return [
    n(s.reports) && { icon: Users, label: "Direct Reports", value: n(s.reports), detail: s.reports.map((r) => r.employee_name).join(", ") },
    n(s.projects) && { icon: Briefcase, label: "Projects Managed", value: n(s.projects), detail: s.projects.map((p) => p.project_name || p.name).join(", ") },
    n(s.leaves) && { icon: CalendarCheck, label: "Leave Requests Waiting", value: n(s.leaves), detail: s.leaves.map((l) => l.employee_name).join(", ") },
    n(s.claims) && { icon: Receipt, label: "Expense Claims Waiting", value: n(s.claims), detail: s.claims.map((c) => c.employee_name).join(", ") },
    (n(s.leave_approver_of) || n(s.expense_approver_of)) && { icon: ShieldCheck, label: "Approver For", value: n(s.leave_approver_of) + n(s.expense_approver_of), detail: [n(s.leave_approver_of) && `leave of ${n(s.leave_approver_of)} employee(s)`, n(s.expense_approver_of) && `expenses of ${n(s.expense_approver_of)} employee(s)`].filter(Boolean).join(", ") },
    (n(s.units) || n(s.expense_types)) && { icon: ShieldCheck, label: "Approver Roles", value: n(s.units) + n(s.expense_types), detail: [n(s.units) && `business units: ${s.units.join(", ")}`, n(s.expense_types) && `expense types: ${s.expense_types.join(", ")}`].filter(Boolean).join(" · ") },
  ].filter(Boolean);
}

/**
 * emp: { name, employee_name, user_id, reports_to }. people: employees to choose from (with user_id).
 * The successor starts as their own manager - the person who'd normally pick up their work.
 */
export function HandoverModal({ emp, people, onClose, onDone }) {
  const preview = useAsync(() => previewHandover(emp.name), [emp.name]);
  const choices = useMemo(() => people.filter((p) => p.user_id && p.name !== emp.name && (p.status || "Active") === "Active"), [people, emp.name]);
  const defaultTo = choices.find((p) => p.name === emp.reports_to)?.user_id || "";
  const [to, setTo] = useState(defaultTo);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const lines = handoverLines(preview.data);
  const nameOf = (email) => choices.find((p) => p.user_id === email)?.employee_name || email;

  async function submit(e) {
    e.preventDefault();
    if (!to) return setErr("Choose who takes over.");
    setBusy(true);
    setErr("");
    try {
      const { projectsFailed } = await runHandover(emp.name, to, preview.data?.projects || []);
      onDone(`${emp.employee_name}'s work handed over to ${nameOf(to)}.${projectsFailed.length ? ` These projects couldn't be moved - change their manager on the project page: ${projectsFailed.join(", ")}.` : ""}`, !projectsFailed.length);
    } catch (x) {
      setErr(friendly(x, "Couldn't hand over the work."));
      setBusy(false);
    }
  }

  return (
    <Modal title={`Hand Over Work · ${emp.employee_name}`} onClose={onClose} wide>
      <form onSubmit={submit} className="space-y-4">
        {preview.loading && <p className="text-[13px] text-[var(--color-text-muted)]">Checking what {emp.employee_name} is responsible for…</p>}
        {preview.error && <Notice>{friendly(preview.error, "Couldn't check their work.")}</Notice>}
        {preview.data && (lines.length === 0 ? <Notice tone="info">{emp.employee_name} has no team, approvals or projects to hand over.</Notice> : (
          <div className="overflow-hidden rounded-lg border border-[var(--color-border)]">
            {lines.map((l) => (
              <div key={l.label} className="flex items-start gap-3 border-b border-[var(--color-border)] px-3.5 py-2.5 last:border-0">
                <l.icon size={15} className="mt-0.5 shrink-0 text-[var(--color-text-muted)]" />
                <div className="min-w-0 flex-1"><div className="text-[12.5px] font-medium text-[var(--color-text)]">{l.label}</div><div className="truncate text-[11.5px] text-[var(--color-text-muted)]" title={l.detail}>{l.detail}</div></div>
                <span className="rounded-full bg-[var(--color-surface-2)] px-2 py-0.5 text-[11.5px] font-semibold text-[var(--color-text)]">{l.value}</span>
              </div>
            ))}
          </div>
        ))}
        {preview.data && lines.length > 0 && (
          <>
            <Field label="Hand Over To" hint="Their own reporting manager is suggested. Everything above moves to this person."><TeamMemberSearch people={choices} assignments={[]} value={to} onChange={setTo} /></Field>
            <p className="text-[11.5px] text-[var(--color-text-faint)]">Each moved request gets a note saying who it came from. Requests that come in later go to the new approver automatically.</p>
          </>
        )}
        {err && <Notice>{err}</Notice>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>{lines.length ? "Cancel" : "Close"}</Button>
          {lines.length > 0 && <Button type="submit" disabled={busy || !to}>{busy ? "Handing Over…" : "Hand Over"}</Button>}
        </div>
      </form>
    </Modal>
  );
}
