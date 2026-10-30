// Onboarding: ERPNext Employee Onboarding records started from accepted offers - task progress, create the
// employee once mandatory tasks are done, and mark onboarding complete.
import { useState } from "react";
import { Link } from "react-router-dom";
import { CheckCheck, ClipboardList, UserPlus } from "lucide-react";
import { frappe } from "../../lib/api/frappeClient";
import { Button } from "../../components/ui/primitives";
import { Async, chipCls, Grid, Modal, Notice, PageHeader, Panel, StatusPill } from "../../components/employee/EmployeeShell";
import { dmy, errMsg, listTry, useAsync } from "../../lib/employeePortal";
import { HireModal, candidateUrl } from "./recruitment/shared";
import { confirmDialog } from "../../components/ui/dialogs";

async function load() {
  const list = await listTry("Employee Onboarding", { filters: [["docstatus", "<", 2]], fields: ["name", "employee_name", "job_applicant", "job_offer", "employee", "date_of_joining", "boarding_status", "company", "designation", "department", "project", "docstatus", "creation"], orderBy: "creation desc" }, ["name", "employee_name", "job_applicant", "job_offer", "employee", "date_of_joining", "boarding_status", "docstatus"]);
  if (!list.length) return [];
  const acts = await frappe.getList("Employee Boarding Activity", { filters: [["parent", "in", list.map((l) => l.name)]], fields: ["parent", "activity_name", "user", "role", "task", "required_for_employee_creation"], limit: 0, parent: "Employee Onboarding" }).catch(() => []);
  const taskNames = acts.map((a) => a.task).filter(Boolean);
  const tasks = taskNames.length ? await frappe.getList("Task", { filters: [["name", "in", taskNames]], fields: ["name", "status", "exp_end_date"], limit: 0 }).catch(() => []) : [];
  const tmap = Object.fromEntries(tasks.map((t) => [t.name, t]));
  return list.map((l) => {
    const mine = acts.filter((a) => a.parent === l.name).map((a) => ({ ...a, status: tmap[a.task]?.status || (a.task ? "?" : "Not created"), due: tmap[a.task]?.exp_end_date }));
    const done = mine.filter((a) => ["Completed", "Cancelled"].includes(a.status)).length;
    const blocking = mine.filter((a) => Number(a.required_for_employee_creation) && !["Completed", "Cancelled"].includes(a.status));
    return { ...l, activities: mine, done, blocking };
  });
}

export default function Onboarding() {
  const data = useAsync(load, []);
  const [filter, setFilter] = useState("open");
  const [modal, setModal] = useState(null);
  const [msg, setMsg] = useState(null);
  const rows = (data.data || []).filter((r) => (filter === "open" ? r.boarding_status !== "Completed" : filter === "done" ? r.boarding_status === "Completed" : true));

  async function complete(r) {
    if (!(await confirmDialog(`Mark onboarding for ${r.employee_name} as completed? All its tasks are closed.`))) return;
    try {
      await frappe.client.post("/method/run_doc_method", { dt: "Employee Onboarding", dn: r.name, method: "mark_onboarding_as_completed" });
      data.reload();
    } catch (e) {
      setMsg(errMsg(e, "Couldn't complete the onboarding."));
    }
  }
  async function hire(r) {
    try {
      const offer = await frappe.getDoc("Job Offer", r.job_offer);
      setModal({ kind: "hire", offer });
    } catch (e) {
      setMsg(errMsg(e, "Couldn't open the job offer."));
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader icon={ClipboardList} title="Onboarding" subtitle="New joiners from accepted offers - pre-joining documents, laptop / email and buddy tasks" actions={<Link to="/hr/recruitment/offers"><Button variant="secondary">Accepted offers</Button></Link>} />
      {msg && <Notice>{msg}</Notice>}
      <Panel>
        <div className="mb-4 flex gap-2">{[["open", "In Progress"], ["done", "Completed"], ["all", "All"]].map(([v, l]) => <button key={v} type="button" onClick={() => setFilter(v)} className={chipCls(filter === v)}>{l}</button>)}</div>
        <Async state={data}>
          {() => <Grid rows={rows} empty="No onboarding in progress. Start one from an accepted offer (Offers › Hire)." columns={[
            { key: "employee_name", label: "New Joiner", render: (r) => <span><Link to={candidateUrl(r.job_applicant)} className="font-medium hover:underline">{r.employee_name}</Link><span className="block text-[11px] text-[var(--color-text-faint)]">{[r.designation, r.department].filter(Boolean).join(" · ")}</span></span> },
            { key: "date_of_joining", label: "Joining", render: (r) => dmy(r.date_of_joining) },
            { key: "tasks", label: "Tasks", render: (r) => (r.activities.length ? <button type="button" onClick={() => setModal({ kind: "tasks", row: r })} className="text-[var(--color-red-hover)] hover:underline">{r.done}/{r.activities.length} done</button> : "—") },
            { key: "boarding_status", label: "Status", render: (r) => <StatusPill status={r.docstatus === 0 ? "Draft" : r.boarding_status} /> },
            { key: "employee", label: "Employee", render: (r) => r.employee || (r.blocking.length ? <span className="text-[11px] text-[var(--color-amber)]">{r.blocking.length} required task(s) open</span> : "Not created") },
            { key: "_a", label: "", render: (r) => (
              <div className="flex justify-end gap-1">
                {!r.employee && r.docstatus === 1 && <Button className="!px-2 !py-1 text-[11px]" disabled={r.blocking.length > 0} onClick={() => hire(r)}><UserPlus size={12} /> Create employee</Button>}
                {r.docstatus === 1 && r.boarding_status !== "Completed" && <Button variant="ghost" className="!px-2 !py-1 text-[11px]" onClick={() => complete(r)}><CheckCheck size={12} /> Complete</Button>}
              </div>
            ) },
          ]} />}
        </Async>
      </Panel>
      {modal?.kind === "tasks" && (
        <Modal title={`Onboarding Tasks · ${modal.row.employee_name}`} onClose={() => setModal(null)} wide>
          <Grid rows={modal.row.activities} rowKey={(a, i) => `${a.activity_name}-${i}`} columns={[
            { key: "activity_name", label: "Activity", render: (a) => <span>{a.activity_name}{Number(a.required_for_employee_creation) ? <span className="ml-1 text-[10.5px] text-[var(--color-amber)]">required</span> : null}</span> },
            { key: "owner", label: "Owner", render: (a) => a.user || a.role || "—" },
            { key: "due", label: "Due", render: (a) => dmy(a.due) || "—" },
            { key: "status", label: "Status", render: (a) => <StatusPill status={a.status} /> },
          ]} />
          <p className="mt-3 text-[11px] text-[var(--color-text-faint)]">Task owners update their assigned tasks, or HR can mark the whole onboarding complete here.</p>
        </Modal>
      )}
      {modal?.kind === "hire" && <HireModal offer={modal.offer} onClose={() => setModal(null)} onSaved={() => { setModal(null); data.reload(); }} />}
    </div>
  );
}
