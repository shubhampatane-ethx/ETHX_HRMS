// HR › Training: programs, events with invited employees, attendance / completion, and employee feedback.
import { useState } from "react";
import { CalendarClock, GraduationCap, Pencil, Plus } from "lucide-react";
import { frappe } from "../../lib/api/frappeClient";
import { Button, LinkField } from "../../components/ui/primitives";
import { Async, chipCls, Field, Grid, inputCls, Modal, Notice, PageHeader, Panel, StatusPill, Tabs } from "../../components/employee/EmployeeShell";
import { dmy, dmyHm, errMsg, listTry, useAsync } from "../../lib/employeePortal";
import { confirmDialog } from "../../components/ui/dialogs";

export default function Training() {
  const [tab, setTab] = useState("events");
  return (
    <div className="space-y-5">
      <PageHeader icon={GraduationCap} title="Training" subtitle="Schedule training, invite employees, record attendance and read their feedback" />
      <Tabs value={tab} onChange={setTab} tabs={[{ id: "events", label: "Events" }, { id: "programs", label: "Programs" }, { id: "feedback", label: "Feedback" }]} />
      {tab === "events" && <Events />}
      {tab === "programs" && <Programs />}
      {tab === "feedback" && <Feedback />}
    </div>
  );
}

function Events() {
  const [filter, setFilter] = useState("Scheduled");
  const events = useAsync(async () => {
    const all = await listTry("Training Event", { fields: ["name", "event_name", "training_program", "type", "level", "event_status", "start_time", "end_time", "location", "trainer_name", "docstatus", "amended_from"], orderBy: "start_time desc" }, ["name", "event_name", "event_status", "start_time", "end_time", "docstatus"]);
    const replaced = new Set(all.map((r) => r.amended_from).filter(Boolean));
    const rows = all.filter((r) => !replaced.has(r.name)).map((r) => ({ ...r, status: r.docstatus === 2 ? "Cancelled" : r.docstatus === 0 ? "Draft" : r.event_status }));
    const people = rows.length ? await frappe.getList("Training Event Employee", { parent: "Training Event", filters: [["parent", "in", rows.map((r) => r.name)]], fields: ["parent", "status", "attendance"], limit: 0 }).catch(() => []) : [];
    return rows.map((r) => { const p = people.filter((x) => x.parent === r.name); return { ...r, invited: p.length, present: p.filter((x) => x.attendance === "Present").length, feedback: p.filter((x) => x.status === "Feedback Submitted").length }; });
  }, []);
  const [modal, setModal] = useState(null);
  const rows = (events.data || []).filter((e) => filter === "all" || e.status === filter);
  return (
    <Panel action={<Button onClick={() => setModal({ kind: "new" })}><Plus size={14} /> New Event</Button>}>
      <div className="mb-4 flex gap-2">{[["Scheduled", "Scheduled"], ["Completed", "Completed"], ["Cancelled", "Cancelled"], ["all", "All"]].map(([v, l]) => <button key={v} type="button" onClick={() => setFilter(v)} className={chipCls(filter === v)}>{l}</button>)}</div>
      <Async state={events}>
        {() => <Grid rows={rows} empty="No training events here." columns={[
          { key: "event_name", label: "Event", render: (e) => <button type="button" onClick={() => setModal({ kind: "open", event: e })} className="text-left hover:underline"><b className="font-medium">{e.event_name}</b><span className="block text-[11px] text-[var(--color-text-faint)]">{[e.training_program, e.type, e.level].filter(Boolean).join(" · ")}</span></button> },
          { key: "start_time", label: "When", render: (e) => dmyHm(e.start_time) },
          { key: "location", label: "Where", render: (e) => e.location || "—" },
          { key: "invited", label: "Invited / Present", render: (e) => `${e.invited} / ${e.present}` },
          { key: "feedback", label: "Feedback", render: (e) => e.feedback },
          { key: "event_status", label: "Status", render: (e) => <StatusPill status={e.status} /> },
        ]} />}
      </Async>
      {modal?.kind === "new" && <EventModal onClose={() => setModal(null)} onSaved={() => { setModal(null); events.reload(); }} />}
      {modal?.kind === "open" && <EventDetail event={modal.event} onEdit={(doc) => setModal({ kind: "edit", doc })} onClose={() => { setModal(null); events.reload(); }} />}
      {modal?.kind === "edit" && <EventModal doc={modal.doc} onClose={() => { setModal(null); events.reload(); }} onSaved={() => { setModal(null); events.reload(); }} />}
    </Panel>
  );
}

const toDt = (v) => (v ? `${v.replace("T", " ")}:00` : "");
const toInput = (v) => (v ? String(v).replace(" ", "T").slice(0, 16) : "");

/**
 * New event, or edit / reschedule / postpone an existing one (`doc`). A scheduled event is submitted in HRMS, so
 * changing it cancels it and saves an amended copy with the new details - attendance and feedback rows are kept.
 */
function EventModal({ doc, onClose, onSaved }) {
  const [f, setF] = useState(() => doc
    ? { name: doc.event_name || "", program: doc.training_program || "", type: doc.type || "Workshop", level: doc.level || "", start: toInput(doc.start_time), end: toInput(doc.end_time), location: doc.location || "", trainer: doc.trainer_name || "", intro: doc.introduction || "", company: doc.company || "" }
    : { name: "", program: "", type: "Workshop", level: "", start: "", end: "", location: "", trainer: "", intro: "", company: "" });
  const [people, setPeople] = useState(() => (doc?.employees || []).map((r) => r.employee));
  const [pick, setPick] = useState("");
  const emps = useAsync(() => listTry("Employee", { filters: [["status", "=", "Active"]], fields: ["name", "employee_name", "department"], orderBy: "employee_name asc" }, ["name", "employee_name"]), []);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  async function submit(e) {
    e.preventDefault();
    if (f.end <= f.start) return setErr("The end must be after the start.");
    setBusy(true);
    setErr("");
    try {
      const kept = Object.fromEntries((doc?.employees || []).map((r) => [r.employee, { employee: r.employee, status: r.status, attendance: r.attendance, is_mandatory: r.is_mandatory }]));
      const body = { event_name: f.name.trim(), training_program: f.program || undefined, type: f.type, level: f.level || undefined, start_time: toDt(f.start), end_time: toDt(f.end), location: f.location, trainer_name: f.trainer || undefined, introduction: f.intro || f.name, company: f.company || undefined, event_status: "Scheduled", employees: people.map((p) => kept[p] || { employee: p, status: "Invited" }) };
      let saved;
      if (doc?.docstatus === 0) saved = await frappe.updateDoc("Training Event", doc.name, body);
      else if (doc) {
        await frappe.cancelDoc("Training Event", doc.name);
        saved = await frappe.createDoc("Training Event", { ...body, amended_from: doc.name });
      } else saved = await frappe.createDoc("Training Event", body);
      await frappe.submitDoc(await frappe.getDoc("Training Event", saved.name));
      onSaved();
    } catch (x) {
      setErr(errMsg(x, doc ? "Couldn't update the training." : "Couldn't schedule the training."));
      setBusy(false);
    }
  }
  const name = (id) => (emps.data || []).find((e) => e.name === id)?.employee_name || id;
  return (
    <Modal title={doc ? `Edit or Reschedule: ${doc.event_name}` : "New Training Event"} onClose={onClose} wide>
      <form onSubmit={submit} className="space-y-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Event Name"><input required className={inputCls} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
          <LinkField label="Program (Optional)" linkDoctype="Training Program" value={f.program} onChange={(v) => setF({ ...f, program: v })} frappe={frappe} />
          <Field label="Type"><select className={inputCls} value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}>{["Seminar", "Theory", "Workshop", "Conference", "Exam", "Internet", "Self-Study"].map((t) => <option key={t}>{t}</option>)}</select></Field>
          <Field label="Level"><select className={inputCls} value={f.level} onChange={(e) => setF({ ...f, level: e.target.value })}><option value="">—</option>{["Beginner", "Intermediate", "Advance"].map((t) => <option key={t}>{t}</option>)}</select></Field>
          <Field label="Starts"><input type="datetime-local" required className={inputCls} value={f.start} onChange={(e) => setF({ ...f, start: e.target.value })} /></Field>
          <Field label="Ends"><input type="datetime-local" required className={inputCls} value={f.end} onChange={(e) => setF({ ...f, end: e.target.value })} /></Field>
          <Field label="Location / Link"><input required className={inputCls} value={f.location} onChange={(e) => setF({ ...f, location: e.target.value })} /></Field>
          <Field label="Trainer"><input className={inputCls} value={f.trainer} onChange={(e) => setF({ ...f, trainer: e.target.value })} /></Field>
        </div>
        <Field label="Introduction"><textarea rows={2} className={inputCls} value={f.intro} onChange={(e) => setF({ ...f, intro: e.target.value })} /></Field>
        <Field label="Invite Employees">
          <div className="flex gap-2"><select className={inputCls} value={pick} onChange={(e) => setPick(e.target.value)}><option value="">Choose…</option>{(emps.data || []).filter((e) => !people.includes(e.name)).map((e) => <option key={e.name} value={e.name}>{e.employee_name}{e.department ? ` · ${e.department}` : ""}</option>)}</select><Button type="button" variant="secondary" disabled={!pick} onClick={() => { setPeople([...people, pick]); setPick(""); }}>Add</Button></div>
        </Field>
        {people.length > 0 && <div className="flex flex-wrap gap-1.5">{people.map((p) => <span key={p} className="rounded-full bg-[var(--color-surface-2)] px-2 py-0.5 text-[12px] text-[var(--color-text)]">{name(p)} <button type="button" onClick={() => setPeople(people.filter((x) => x !== p))} className="ml-1 text-[var(--color-text-muted)]">×</button></span>)}</div>}
        {err && <Notice>{err}</Notice>}
        <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={onClose}>Cancel</Button><Button type="submit" disabled={busy}>{busy ? "Saving…" : doc ? "Save Changes" : "Schedule"}</Button></div>
      </form>
    </Modal>
  );
}

function EventDetail({ event, onEdit, onClose }) {
  const doc = useAsync(() => frappe.getDoc("Training Event", event.name), [event.name]);
  const [rows, setRows] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const d = doc.data;
  const list = rows || (d?.employees || []).map((r) => ({ ...r }));
  async function save(status) {
    if (!(await confirmDialog(status === "Cancelled" ? { message: `Cancel ${event.event_name}?`, danger: true, confirmLabel: "Cancel Event", cancelLabel: "Keep It" } : `Mark ${event.event_name} as ${status.toLowerCase()}?`))) return;
    setBusy(true);
    setMsg(null);
    try {
      // Attendance is fixed once submitted in HRMS, so only the completion status (allowed after submit) is updated.
      try {
        await frappe.updateDoc("Training Event", d.name, { event_status: status, employees: list.map((r) => ({ ...r, status: status === "Completed" && r.status !== "Feedback Submitted" && r.attendance === "Present" ? "Completed" : r.status })) });
      } catch (x) {
        // Sites where the status can't change after scheduling: cancel the event itself.
        if (status !== "Cancelled" || d.docstatus !== 1) throw x;
        await frappe.cancelDoc("Training Event", d.name);
      }
      setMsg({ ok: true, text: status === "Completed" ? "Marked as completed." : status === "Cancelled" ? "Cancelled." : "Saved." });
      doc.reload();
      setRows(null);
    } catch (x) {
      setMsg({ ok: false, text: errMsg(x, "Couldn't update the event.") });
    }
    setBusy(false);
  }
  return (
    <Modal title={event.event_name} onClose={onClose} wide>
      {!d ? <p className="text-[13px] text-[var(--color-text-muted)]">Loading…</p> : (
        <div className="space-y-3">
          <p className="text-[12px] text-[var(--color-text-muted)]">{dmyHm(d.start_time)} – {dmyHm(d.end_time)} · {d.location} · <StatusPill status={d.event_status} /></p>
          <Grid rows={list} rowKey={(r) => r.employee} empty="No one invited." columns={[
            { key: "employee_name", label: "Employee", render: (r) => r.employee_name || r.employee },
            { key: "attendance", label: "Attendance", render: (r) => <span>{r.attendance || "—"}</span> },
            { key: "status", label: "Status", render: (r) => <StatusPill status={r.status} /> },
          ]} />
          {msg && <Notice tone={msg.ok ? "info" : "error"}>{msg.text}</Notice>}
          {d.event_status === "Scheduled" && d.docstatus < 2 && <div className="flex flex-wrap justify-end gap-2"><Button variant="ghost" disabled={busy} onClick={() => save("Cancelled")}>Cancel Event</Button><Button variant="secondary" disabled={busy} onClick={() => onEdit(d)}><CalendarClock size={14} /> Edit / Reschedule</Button><Button disabled={busy} onClick={() => save("Completed")}>Mark Completed</Button></div>}
          <p className="text-[11px] text-[var(--color-text-faint)]">Attendees see this training in their portal (Training &amp; Learning) and can give feedback there.</p>
        </div>
      )}
    </Modal>
  );
}

function Programs() {
  const list = useAsync(() => listTry("Training Program", { fields: ["name", "training_program", "status", "trainer_name", "company", "description"], orderBy: "modified desc" }, ["name", "status"]), []);
  const [open, setOpen] = useState(null); // null | { program?: row }
  return (
    <Panel action={<Button onClick={() => setOpen({})}><Plus size={14} /> New Program</Button>}>
      <Async state={list}>
        {(rows) => <Grid rows={rows} empty="No training programs yet." columns={[
          { key: "name", label: "Program", render: (p) => <button type="button" onClick={() => setOpen({ program: p })} className="flex items-center gap-1.5 text-left hover:underline"><b className="font-medium">{p.training_program || p.name}</b><Pencil size={12} className="text-[var(--color-text-faint)]" /></button> },
          { key: "trainer_name", label: "Trainer", render: (p) => p.trainer_name || "—" },
          { key: "company", label: "Company" },
          { key: "status", label: "Status", render: (p) => <StatusPill status={p.status} /> },
        ]} />}
      </Async>
      {open && <ProgramModal program={open.program} onClose={() => setOpen(null)} onSaved={() => { setOpen(null); list.reload(); }} />}
    </Panel>
  );
}

function ProgramModal({ program, onClose, onSaved }) {
  const [f, setF] = useState({ name: program?.training_program || program?.name || "", company: program?.company || "", trainer: program?.trainer_name || "", description: program?.description || "", status: program?.status || "Scheduled" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    try {
      const body = { company: f.company, trainer_name: f.trainer || "", description: f.description || f.name, status: f.status };
      if (program) await frappe.updateDoc("Training Program", program.name, body);
      else await frappe.createDoc("Training Program", { training_program: f.name.trim(), ...body });
      onSaved();
    } catch (x) {
      setErr(errMsg(x, "Couldn't create the program."));
      setBusy(false);
    }
  }
  return (
    <Modal title={program ? `Edit ${program.training_program || program.name}` : "New Training Program"} onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <Field label="Program Name"><input required disabled={Boolean(program)} className={inputCls} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="e.g. Oracle Fusion SCM bootcamp" /></Field>
        {program && <Field label="Status"><select className={inputCls} value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}>{["Scheduled", "Completed", "Cancelled"].map((s) => <option key={s}>{s}</option>)}</select></Field>}
        <LinkField label="Company" linkDoctype="Company" value={f.company} onChange={(v) => setF({ ...f, company: v })} required frappe={frappe} />
        <Field label="Trainer"><input className={inputCls} value={f.trainer} onChange={(e) => setF({ ...f, trainer: e.target.value })} /></Field>
        <Field label="Description"><textarea rows={3} className={inputCls} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
        {err && <Notice>{err}</Notice>}
        <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={onClose}>Cancel</Button><Button type="submit" disabled={busy}>{busy ? "Saving…" : program ? "Save Changes" : "Create"}</Button></div>
      </form>
    </Modal>
  );
}

function Feedback() {
  const list = useAsync(() => listTry("Training Feedback", { filters: [["docstatus", "<", 2]], fields: ["name", "employee", "employee_name", "training_event", "event_name", "trainer_name", "feedback", "creation"], orderBy: "creation desc" }, ["name", "employee_name", "training_event", "feedback", "creation"]), []);
  return (
    <Panel>
      <Async state={list}>
        {(rows) => <Grid rows={rows} empty="No feedback yet." columns={[
          { key: "event", label: "Event", render: (r) => r.event_name || r.training_event },
          { key: "employee_name", label: "Employee" },
          { key: "feedback", label: "Feedback", render: (r) => <span className="text-[12px]">{r.feedback}</span> },
          { key: "creation", label: "Date", render: (r) => dmy(r.creation) },
        ]} />}
      </Async>
    </Panel>
  );
}
