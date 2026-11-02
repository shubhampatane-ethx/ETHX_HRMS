// HR › Employee Requests: everything employees raise from Help & Requests (ERPNext Issues, category in the subject).
// HR moves a request along or closes it with a note; once it leaves Open the employee can't edit or withdraw it.
import { useMemo, useState } from "react";
import { CheckCircle2, Hourglass, LifeBuoy, MessageSquareReply } from "lucide-react";
import { frappe } from "../../lib/api/frappeClient";
import { Async, chipCls, Grid, inputCls, PageHeader, Panel, StatusPill } from "../../components/employee/EmployeeShell";
import { alertDialog, promptDialog } from "../../components/ui/dialogs";
import { dmy, errMsg, splitRequest, stripHtml, useAsync } from "../../lib/employeePortal";

const OTHER = "Other";
const STATUSES = ["Open", "In Progress", "Replied", "On Hold", "Resolved", "Closed"];
const ALWAYS_SHOWN = ["Open", "In Progress", "Replied", "Closed"];
const ACTIONS = [
  { status: "In Progress", label: "In Progress", icon: Hourglass, title: "Move to In Progress" },
  { status: "Replied", label: "Replied", icon: MessageSquareReply, title: "Mark as Replied" },
  { status: "Closed", label: "Close", icon: CheckCircle2, title: "Close Request", noteRequired: true },
];

async function loadRequests() {
  const [rows, employees, comments] = await Promise.all([
    frappe.getList("Issue", { fields: ["name", "subject", "description", "status", "raised_by", "owner", "creation"], orderBy: "creation desc", limit: 0 }),
    frappe.getList("Employee", { filters: [["user_id", "is", "set"]], fields: ["name", "employee_name", "user_id", "department"], limit: 0 }).catch(() => []),
    frappe.getList("Comment", { filters: [["reference_doctype", "=", "Issue"], ["comment_type", "=", "Info"]], fields: ["reference_name", "content"], orderBy: "creation asc", limit: 0 }).catch(() => []),
  ]);
  const byUser = new Map(employees.map((e) => [e.user_id, e]));
  const lastNote = new Map(comments.map((c) => [c.reference_name, stripHtml(c.content)]));
  return rows.map((r) => {
    const { category, title } = splitRequest(r.subject);
    const details = stripHtml(r.description || "");
    const who = r.raised_by || r.owner;
    return { ...r, type: category || OTHER, title, details: details === title ? "" : details, who, employee: byUser.get(who), note: lastNote.get(r.name) || "" };
  });
}

// "In Progress" isn't a stock Issue status: System Setup adds it, and ERPNext refuses it until then.
const statusError = (e, status) => (/should be one of/i.test(errMsg(e, ""))
  ? `"${status}" isn't available on the server yet. Ask the Administrator to run System Setup › Run setup.`
  : errMsg(e, "Couldn't update this request."));

export default function EmployeeRequests() {
  const q = useAsync(loadRequests, []);
  const [status, setStatus] = useState("all");
  const [type, setType] = useState("all");
  const [busy, setBusy] = useState("");

  const all = useMemo(() => q.data || [], [q.data]);
  const types = useMemo(() => [...new Set(all.map((r) => r.type))].sort(), [all]);
  const rows = useMemo(() => all.filter((r) => (status === "all" || r.status === status) && (type === "all" || r.type === type)), [all, status, type]);
  const count = (s) => all.filter((r) => r.status === s).length;
  const chips = STATUSES.filter((s) => ALWAYS_SHOWN.includes(s) || count(s));

  async function act(r, action) {
    const name = r.employee?.employee_name || r.who;
    const note = await promptDialog({
      title: `${action.title} · ${r.name}`,
      message: `"${r.title}" from ${name}.${r.status === "Open" ? "\nThe employee will no longer be able to edit or withdraw it." : ""}`,
      label: action.noteRequired ? "Note (Visible to the Employee)" : "Note (Optional, Visible to the Employee)",
      required: Boolean(action.noteRequired),
      placeholder: action.noteRequired ? "What was done, or why it is being closed" : "",
      confirmLabel: action.label === "Close" ? "Close Request" : `Move to ${action.label}`,
    });
    if (note === null) return;
    setBusy(r.name);
    try {
      // The employee can withdraw or edit until now, so don't act on what this page loaded earlier.
      const current = await frappe.getDoc("Issue", r.name);
      if (current.status !== r.status) {
        await alertDialog({ tone: "info", title: "Request Already Changed", message: `This request is now ${current.status}, so nothing was changed. Check the refreshed list and try again.` });
        return;
      }
      try {
        await frappe.updateDoc("Issue", r.name, { status: action.status });
      } catch (e) {
        await alertDialog({ tone: "error", message: statusError(e, action.status) });
        return;
      }
      if (note) {
        await frappe.createDoc("Comment", { comment_type: "Info", reference_doctype: "Issue", reference_name: r.name, content: note }).catch((e) =>
          alertDialog({ tone: "error", message: `The request is now ${action.status}, but the note wasn't saved. ${errMsg(e, "")}`.trim() }));
      }
    } catch (e) {
      await alertDialog({ tone: "error", message: errMsg(e, "Couldn't update this request.") });
    } finally {
      setBusy("");
      q.reload();
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader icon={LifeBuoy} title="Employee Requests" subtitle="HR and IT support, letters and document requests raised from Help & Requests" />
      <Panel>
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => setStatus("all")} className={chipCls(status === "all")}>All{q.data ? ` (${all.length})` : ""}</button>
          {chips.map((s) => <button key={s} type="button" onClick={() => setStatus(s)} className={chipCls(status === s)}>{s}{q.data ? ` (${count(s)})` : ""}</button>)}
          <select aria-label="Type" className={`${inputCls} !w-48 !py-1`} value={type} onChange={(e) => setType(e.target.value)}>
            <option value="all">All Types</option>
            {types.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <Async state={q}>
          {() => <Grid rows={rows} empty="No requests here." columns={[
            { key: "employee", label: "Employee", render: (r) => <span>{r.employee?.employee_name || r.who || "—"}<span className="block text-[11px] text-[var(--color-text-faint)]">{(r.employee ? [r.employee.name, r.employee.department] : []).filter(Boolean).join(" · ")}</span></span> },
            { key: "type", label: "Type" },
            { key: "title", label: "Subject", render: (r) => <span>{r.title}<span className="block text-[11px] text-[var(--color-text-faint)]">{r.name}</span></span> },
            { key: "details", label: "Details", render: (r) => <span className="block max-w-[22rem] whitespace-pre-line break-words">{r.details || "—"}</span> },
            { key: "creation", label: "Date", render: (r) => dmy(r.creation) },
            { key: "status", label: "Status", render: (r) => <span><StatusPill status={r.status} />{r.note && <span className="mt-1 block max-w-[14rem] break-words text-[11px] text-[var(--color-text-muted)]">Note: {r.note}</span>}</span> },
            { key: "_a", label: "", render: (r) => r.status === "Closed" ? null : (
              <div className="flex justify-end gap-3 whitespace-nowrap text-[12px]">
                {ACTIONS.filter((a) => a.status !== r.status).map((a) => (
                  <button key={a.status} type="button" disabled={busy === r.name} onClick={() => act(r, a)} className="flex items-center gap-1 text-[var(--color-text-muted)] hover:text-[var(--color-text)] disabled:opacity-40"><a.icon size={13} /> {a.label}</button>
                ))}
              </div>
            ) },
          ]} />}
        </Async>
      </Panel>
    </div>
  );
}
