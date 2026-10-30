// Job requisitions: a manager asks for a hire; an HR Manager approves, holds or rejects it; HR turns an
// approved requisition into a job opening. Project Managers use the same screen in "mine" mode.
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Ban, Check, ClipboardList, ExternalLink, PauseCircle, Plus, X } from "lucide-react";
import { frappe } from "../../../lib/api/frappeClient";
import { Button, DateField, LinkField } from "../../../components/ui/primitives";
import { Async, chipCls, Field, Grid, inputCls, Modal, Notice, PageHeader, Panel, StatusPill } from "../../../components/employee/EmployeeShell";
import { dmy, errMsg, getMyEmployee, isoDate, money, useAsync } from "../../../lib/employeePortal";
import { canApprove, listOpenings, listRequisitions, openingFromRequisition } from "../../../lib/recruitment";
import { useAuth } from "../../../context/AuthContext";
import { SetupHint } from "./shared";

const FILTERS = [["active", "Active"], ["Pending", "Awaiting Decision"], ["Open & Approved", "Approved"], ["closed", "Closed"], ["all", "All"]];
const ACTIVE = ["Pending", "Open & Approved", "On Hold"];

export default function Requisitions({ mine = false }) {
  const { user } = useAuth();
  const me = useAsync(() => getMyEmployee(user.email).catch(() => null), [user.email]);
  const reqs = useAsync(() => (mine ? (me.data ? listRequisitions([["requested_by", "=", me.data.name]]) : Promise.resolve([])) : listRequisitions()), [mine, me.data?.name]);
  const openings = useAsync(() => listOpenings([["job_requisition", "is", "set"]]).catch(() => []), []);
  const [filter, setFilter] = useState("active");
  const [modal, setModal] = useState(null);
  const approver = canApprove(user) && !mine;

  const byReq = useMemo(() => {
    const m = {};
    (openings.data || []).forEach((o) => { (m[o.job_requisition] ||= []).push(o); });
    return m;
  }, [openings.data]);

  const rows = (reqs.data || []).filter((r) => (filter === "all" ? true : filter === "active" ? ACTIVE.includes(r.status) : filter === "closed" ? !ACTIVE.includes(r.status) : r.status === filter));
  const reload = () => { reqs.reload(); openings.reload(); };

  return (
    <div className="space-y-5">
      <PageHeader icon={ClipboardList} title={mine ? "My Hiring Requests" : "Job Requisitions"} subtitle={mine ? "Ask HR for a hire for your project - HR approves it and opens the position" : "Hiring requests from managers: approve, hold or reject, then open the position"} actions={<Button onClick={() => setModal({ kind: "new" })} disabled={mine && !me.data}><Plus size={14} /> New requisition</Button>} />
      {!mine && <SetupHint />}
      {mine && me.data === null && !me.loading && <Notice>Your login isn't linked to an employee profile. Ask HR to link your sign-in email to your employee record.</Notice>}
      {!mine && !approver && <Notice tone="info">You can raise and edit requisitions. Approving or rejecting needs an HR Manager.</Notice>}
      <Panel>
        <div className="mb-4 flex flex-wrap gap-2">{FILTERS.map(([v, l]) => <button key={v} type="button" onClick={() => setFilter(v)} className={chipCls(filter === v)}>{l}</button>)}</div>
        <Async state={reqs}>
          {() => <Grid rows={rows} empty="No requisitions here." columns={[
            { key: "designation", label: "Role", render: (r) => <span><b className="font-medium">{r.designation}</b><span className="block text-[11px] text-[var(--color-text-faint)]">{r.name}{r.department ? ` · ${r.department}` : ""}</span></span> },
            { key: "no_of_positions", label: "Positions" },
            { key: "requested_by_name", label: "Requested by", render: (r) => <span>{r.requested_by_name || r.requested_by}{r.custom_project && <span className="block text-[11px] text-[var(--color-text-faint)]">Project: {r.custom_project}</span>}</span> },
            { key: "expected_compensation", label: "Budget / Position", render: (r) => money(r.expected_compensation) },
            { key: "expected_by", label: "Needed by", render: (r) => dmy(r.expected_by) || "—" },
            { key: "status", label: "Status", render: (r) => <span><StatusPill status={r.status === "Open & Approved" ? "Approved" : r.status} />{r.custom_approved_by && <span className="block text-[10.5px] text-[var(--color-text-faint)]">by {r.custom_approved_by}</span>}</span> },
            { key: "opening", label: "Opening", render: (r) => (byReq[r.name] || []).map((o) => <Link key={o.name} to={`/hr/recruitment/openings/${encodeURIComponent(o.name)}`} className="block text-[12px] text-[var(--color-red-hover)] hover:underline">{o.job_title} <ExternalLink size={10} className="inline" /></Link>) },
            { key: "_a", label: "", render: (r) => (
              <div className="flex justify-end gap-1 whitespace-nowrap">
                {r.status === "Pending" && <button type="button" onClick={() => setModal({ kind: "edit", req: r })} className="rounded px-1.5 py-1 text-[11px] text-[var(--color-text-muted)] hover:bg-[var(--color-surface-2)]">Edit</button>}
                {approver && ["Pending", "On Hold"].includes(r.status) && <>
                  <IconBtn title="Approve" onClick={() => setModal({ kind: "decide", req: r, to: "Open & Approved" })} className="text-[var(--color-green)]"><Check size={14} /></IconBtn>
                  {r.status !== "On Hold" && <IconBtn title="Put on hold" onClick={() => setModal({ kind: "decide", req: r, to: "On Hold" })}><PauseCircle size={14} /></IconBtn>}
                  <IconBtn title="Reject" onClick={() => setModal({ kind: "decide", req: r, to: "Rejected" })} className="hover:text-[var(--color-red-hover)]"><X size={14} /></IconBtn>
                </>}
                {!mine && r.status === "Open & Approved" && !(byReq[r.name] || []).length && <Button variant="secondary" className="!px-2 !py-1 text-[11px]" onClick={() => setModal({ kind: "opening", req: r })}>Create opening</Button>}
                {(mine || !approver) && r.status === "Pending" && <IconBtn title="Cancel request" onClick={() => setModal({ kind: "decide", req: r, to: "Cancelled" })}><Ban size={14} /></IconBtn>}
              </div>
            ) },
          ]} />}
        </Async>
      </Panel>
      {modal?.kind === "new" && <RequisitionModal me={me.data} mine={mine} onClose={() => setModal(null)} onSaved={() => { setModal(null); reload(); }} />}
      {modal?.kind === "edit" && <RequisitionModal req={modal.req} me={me.data} mine={mine} onClose={() => setModal(null)} onSaved={() => { setModal(null); reload(); }} />}
      {modal?.kind === "decide" && <DecideModal req={modal.req} to={modal.to} onClose={() => setModal(null)} onSaved={() => { setModal(null); reload(); }} />}
      {modal?.kind === "opening" && <CreateOpeningModal req={modal.req} onClose={() => setModal(null)} onSaved={() => { setModal(null); reload(); }} />}
    </div>
  );
}

function IconBtn({ title, onClick, className = "", children }) {
  return <button type="button" title={title} onClick={onClick} className={`rounded p-1 text-[var(--color-text-muted)] hover:bg-[var(--color-surface-2)] ${className}`}>{children}</button>;
}

function RequisitionModal({ req, me, mine, onClose, onSaved }) {
  const [f, setF] = useState({
    designation: req?.designation || "", department: req?.department || me?.department || "", no_of_positions: req?.no_of_positions || 1, expected_compensation: req?.expected_compensation || "",
    company: req?.company || me?.company || "", requested_by: req?.requested_by || me?.name || "", expected_by: req?.expected_by || "", reason_for_requesting: req?.reason_for_requesting || "",
    description: "", custom_project: req?.custom_project || "", kind: "New position",
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setErr("");
    try {
      const reason = req ? f.reason_for_requesting : `${f.kind}${f.reason_for_requesting ? ` - ${f.reason_for_requesting}` : ""}`;
      const doc = { designation: f.designation, department: f.department || null, no_of_positions: Number(f.no_of_positions) || 1, expected_compensation: Number(f.expected_compensation) || 0, company: f.company, requested_by: f.requested_by, expected_by: f.expected_by || null, reason_for_requesting: reason, custom_project: f.custom_project || null };
      if (!req) Object.assign(doc, { status: "Pending", posting_date: isoDate(), description: f.description || reason || f.designation });
      else if (f.description) doc.description = f.description;
      if (req) await frappe.updateDoc("Job Requisition", req.name, doc);
      else await frappe.createDoc("Job Requisition", doc);
      onSaved();
    } catch (x) {
      setErr(errMsg(x, "Couldn't save the requisition."));
      setBusy(false);
    }
  }

  return (
    <Modal title={req ? `Edit ${req.name}` : "New job requisition"} onClose={onClose} wide>
      <form onSubmit={submit} className="space-y-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <LinkField label="Role (designation)" linkDoctype="Designation" value={f.designation} onChange={(v) => setF({ ...f, designation: v })} required frappe={frappe} />
          <LinkField label="Department" linkDoctype="Department" value={f.department} onChange={(v) => setF({ ...f, department: v })} frappe={frappe} />
          <LinkField label="Company" linkDoctype="Company" value={f.company} onChange={(v) => setF({ ...f, company: v })} required frappe={frappe} />
          {mine ? <Field label="Requested by"><p className="py-2 text-[13px] text-[var(--color-text)]">{me?.employee_name}</p></Field> : <LinkField label="Requested by (employee)" linkDoctype="Employee" value={f.requested_by} onChange={(v) => setF({ ...f, requested_by: v })} required frappe={frappe} />}
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Field label="Positions"><input type="number" min="1" required className={inputCls} value={f.no_of_positions} onChange={(e) => setF({ ...f, no_of_positions: e.target.value })} /></Field>
          <Field label="Budget per position (₹/yr)"><input type="number" min="0" required className={inputCls} value={f.expected_compensation} onChange={(e) => setF({ ...f, expected_compensation: e.target.value })} /></Field>
          <DateField label="Needed by (joining)" value={f.expected_by} onChange={(v) => setF({ ...f, expected_by: v })} />
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <LinkField label="Project (optional)" linkDoctype="Project" titleField="project_name" value={f.custom_project} onChange={(v) => setF({ ...f, custom_project: v })} frappe={frappe} />
          {!req && <Field label="Type"><select className={inputCls} value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}>{["New position", "New project", "Backfill / replacement", "Client requirement"].map((k) => <option key={k}>{k}</option>)}</select></Field>}
        </div>
        <Field label="Reason"><input className={inputCls} value={f.reason_for_requesting} onChange={(e) => setF({ ...f, reason_for_requesting: e.target.value })} placeholder="e.g. Oracle Fusion rollout for client X needs a second SCM consultant" /></Field>
        <Field label="Job description / must-have skills" hint={req ? "Leave empty to keep the current description." : undefined}><textarea rows={4} required={!req} className={inputCls} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
        {err && <Notice>{err}</Notice>}
        <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={onClose}>Cancel</Button><Button type="submit" disabled={busy}>{busy ? "Saving…" : req ? "Save" : "Submit request"}</Button></div>
      </form>
    </Modal>
  );
}

function DecideModal({ req, to, onClose, onSaved }) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const label = { "Open & Approved": "Approve", "On Hold": "Put on hold", Rejected: "Reject", Cancelled: "Cancel request" }[to];
  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setErr("");
    try {
      await frappe.updateDoc("Job Requisition", req.name, { status: to, custom_decision_note: note || null });
      onSaved();
    } catch (x) {
      setErr(errMsg(x, "Couldn't update the requisition."));
      setBusy(false);
    }
  }
  return (
    <Modal title={`${label} · ${req.designation} × ${req.no_of_positions}`} onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <p className="text-[12px] text-[var(--color-text-muted)]">Requested by {req.requested_by_name || req.requested_by} · budget {money(req.expected_compensation)} per position{req.reason_for_requesting ? ` · ${req.reason_for_requesting}` : ""}</p>
        <Field label={to === "Open & Approved" ? "Note (optional)" : "Reason"}><textarea rows={2} required={to !== "Open & Approved"} className={inputCls} value={note} onChange={(e) => setNote(e.target.value)} /></Field>
        {err && <Notice>{err}</Notice>}
        <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={onClose}>Back</Button><Button type="submit" disabled={busy}>{busy ? "Saving…" : label}</Button></div>
      </form>
    </Modal>
  );
}

function CreateOpeningModal({ req, onClose, onSaved }) {
  const [f, setF] = useState({ job_title: req.designation, publish: true, closes_on: req.expected_by || "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setErr("");
    try {
      await openingFromRequisition(req, { job_title: f.job_title, publish: f.publish ? 1 : 0, closes_on: f.closes_on || null, company: req.company });
      onSaved();
    } catch (x) {
      setErr(errMsg(x, "Couldn't create the opening."));
      setBusy(false);
    }
  }
  return (
    <Modal title="Create Job Opening" onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <p className="text-[12px] text-[var(--color-text-muted)]">Copies the role, department, positions ({req.no_of_positions}), budget and description from {req.name}. You can add skills, salary range and interview rounds on the opening afterwards.</p>
        <Field label="Job title"><input required className={inputCls} value={f.job_title} onChange={(e) => setF({ ...f, job_title: e.target.value })} /></Field>
        <DateField label="Applications close on (optional)" value={f.closes_on} onChange={(v) => setF({ ...f, closes_on: v })} />
        <label className="flex items-center gap-2 text-[12px] text-[var(--color-text-muted)]"><input type="checkbox" checked={f.publish} onChange={(e) => setF({ ...f, publish: e.target.checked })} /> Publish on the careers page</label>
        {err && <Notice>{err}</Notice>}
        <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={onClose}>Cancel</Button><Button type="submit" disabled={busy}>{busy ? "Creating…" : "Create opening"}</Button></div>
      </form>
    </Modal>
  );
}

