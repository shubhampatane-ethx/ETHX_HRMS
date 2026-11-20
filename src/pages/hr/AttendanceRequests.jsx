// HR › Attendance Requests: every attendance correction employees raise (missed punch, work from home, on duty).
// HR sees the reason and details, and can approve or reject any pending request (never their own, and an HR member's
// only when they are its approver or that person's manager); a rejection needs
// a remark, which the employee sees. Decisions go through the ethx_attendance_decision server rule (attendanceSetup.js).
import { useMemo, useState } from "react";
import { Ban, CalendarCheck, Check, Plus } from "lucide-react";
import { frappe } from "../../lib/api/frappeClient";
import { attendanceDecider } from "../../lib/attendanceDeciders";
import { hasPermission } from "../../permissions/roles";
import { useAuth } from "../../context/AuthContext";
import { Button } from "../../components/ui/primitives";
import { HrRecordForm } from "../../components/hr/HrRecordForm";
import { DecideModal } from "../../components/approvals/ApprovalQueue";
import { Async, chipCls, Grid, inputCls, PageHeader, Panel, StatusPill } from "../../components/employee/EmployeeShell";
import { dmy, listTry, stripHtml, useAsync } from "../../lib/employeePortal";

const STATUSES = ["Pending", "Approved", "Rejected", "Cancelled"];
const FORM_FIELDS = [
  { name: "employee", label: "Employee", type: "link", linkDoctype: "Employee", required: true },
  { name: "company", label: "Company", type: "link", linkDoctype: "Company", required: true },
  { name: "from_date", label: "From Date", type: "date", required: true },
  { name: "to_date", label: "To Date", type: "date", required: true },
  { name: "reason", label: "Reason", type: "select", options: ["Work From Home", "On Duty"], required: true },
  { name: "explanation", label: "Details", type: "textarea" },
];

const statusOf = (r) => (Number(r.docstatus) === 2 ? "Cancelled" : Number(r.docstatus) === 1 ? "Approved" : r.custom_decision === "Rejected" ? "Rejected" : "Pending");
const dates = (r) => `${dmy(r.from_date)}${r.to_date && r.to_date !== r.from_date ? ` – ${dmy(r.to_date)}` : ""}`;

async function loadRequests() {
  const [rows, employees] = await Promise.all([
    listTry("Attendance Request", { fields: ["name", "employee", "employee_name", "from_date", "to_date", "reason", "explanation", "docstatus", "creation", "custom_approver", "custom_decision", "custom_decision_note"], orderBy: "creation desc" },
      ["name", "employee", "employee_name", "from_date", "to_date", "reason", "explanation", "docstatus", "creation"]),
    frappe.getList("Employee", { fields: ["name", "employee_name", "user_id", "department", "reports_to", "leave_approver"], limit: 0 }).catch(() => []),
  ]);
  const decide = await attendanceDecider(employees);
  const byId = new Map(employees.map((e) => [e.name, e]));
  const byUser = new Map(employees.filter((e) => e.user_id).map((e) => [e.user_id, e]));
  return rows.map((r) => ({
    ...r,
    status: statusOf(r),
    department: byId.get(r.employee)?.department,
    ownerUser: byId.get(r.employee)?.user_id,
    approverName: r.custom_approver ? byUser.get(r.custom_approver)?.employee_name || r.custom_approver : "",
    // Whether the signed-in person may decide it: not their own, and an HR member's only by their approver or manager.
    canDecide: (me, admin) => decide(r.employee, me, r.custom_approver, admin),
  }));
}

export default function AttendanceRequests() {
  const { user } = useAuth();
  const q = useAsync(loadRequests, []);
  const [status, setStatus] = useState("Pending");
  const [type, setType] = useState("all");
  const [decide, setDecide] = useState(null); // { row, approve }
  const [creating, setCreating] = useState(false);

  const all = useMemo(() => q.data || [], [q.data]);
  const types = useMemo(() => [...new Set(all.map((r) => r.reason).filter(Boolean))].sort(), [all]);
  const rows = useMemo(() => all.filter((r) => (status === "all" || r.status === status) && (type === "all" || r.reason === type)), [all, status, type]);
  const count = (s) => all.filter((r) => r.status === s).length;

  return (
    <div className="space-y-5">
      <PageHeader icon={CalendarCheck} title="Attendance Requests" subtitle="Missed punches, work from home and on duty days raised by employees" actions={<Button onClick={() => setCreating(true)}><Plus size={14} /> New Attendance Request</Button>} />
      {creating && <HrRecordForm doctype="Attendance Request" fields={FORM_FIELDS} onCancel={() => setCreating(false)} onSaved={() => { setCreating(false); q.reload(); }} />}
      <Panel>
        <div className="mb-4 flex flex-wrap items-center gap-2">
          {STATUSES.map((s) => <button key={s} type="button" onClick={() => setStatus(s)} className={chipCls(status === s)}>{s}{q.data ? ` (${count(s)})` : ""}</button>)}
          <button type="button" onClick={() => setStatus("all")} className={chipCls(status === "all")}>All{q.data ? ` (${all.length})` : ""}</button>
          <select aria-label="Type" className={`${inputCls} !w-48 !py-1`} value={type} onChange={(e) => setType(e.target.value)}>
            <option value="all">All Types</option>
            {types.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <Async state={q}>
          {() => <Grid rows={rows} empty={status === "Pending" ? "No attendance requests are waiting." : "No requests here."} columns={[
            { key: "employee_name", label: "Employee", render: (r) => <span>{r.employee_name || r.employee}<span className="block text-[11px] text-[var(--color-text-faint)]">{[r.employee, r.department].filter(Boolean).join(" · ")}</span></span> },
            { key: "from_date", label: "Dates", render: dates },
            { key: "reason", label: "Type", render: (r) => r.reason || "—" },
            { key: "explanation", label: "Reason", render: (r) => <span className="block max-w-[22rem] whitespace-pre-line break-words">{stripHtml(r.explanation || "") || "—"}</span> },
            { key: "creation", label: "Raised On", render: (r) => <span>{dmy(r.creation)}<span className="block text-[11px] text-[var(--color-text-faint)]">{r.name}</span></span> },
            { key: "approverName", label: "Approver", render: (r) => r.approverName || <span className="text-[var(--color-text-faint)]">HR</span> },
            { key: "status", label: "Status", render: (r) => <span><StatusPill status={r.status} />{r.custom_decision_note && <span className="mt-1 block max-w-[14rem] break-words text-[11px] text-[var(--color-text-muted)]">Remark: {stripHtml(r.custom_decision_note)}</span>}</span> },
            { key: "_a", label: "", render: (r) => {
              if (r.status !== "Pending") return null;
              const rule = r.canDecide(user?.email, hasPermission(user, "dashboard.admin"));
              const own = !rule.ok;
              const hint = own ? (r.ownerUser === user?.email ? "You can't decide on your own request" : rule.reason) : undefined;
              return (
                <div className="flex justify-end gap-3 whitespace-nowrap">
                  <button type="button" disabled={own} title={hint} onClick={() => setDecide({ row: r, approve: true })} className="flex items-center gap-1 text-[12px] text-[var(--color-green)] hover:underline disabled:cursor-not-allowed disabled:opacity-40 disabled:no-underline"><Check size={13} /> Approve</button>
                  <button type="button" disabled={own} title={hint} onClick={() => setDecide({ row: r, approve: false })} className="flex items-center gap-1 text-[12px] text-[var(--color-red-hover)] hover:underline disabled:cursor-not-allowed disabled:opacity-40 disabled:no-underline"><Ban size={13} /> Reject</button>
                </div>
              );
            } },
          ]} />}
        </Async>
      </Panel>
      {decide && <DecideModal kind="attendance" row={decide.row} approve={decide.approve} onClose={() => setDecide(null)} onDone={() => { setDecide(null); q.reload(); }} />}
    </div>
  );
}
