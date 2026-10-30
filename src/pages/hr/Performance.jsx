// HR › Performance on HRMS's appraisal model: templates (KRAs + weightages), appraisal cycles, appraisals and goals.
import { useMemo, useState } from "react";
import { Plus, Target, TrendingUp } from "lucide-react";
import { frappe } from "../../lib/api/frappeClient";
import { Button, DateField, LinkField } from "../../components/ui/primitives";
import { Async, chipCls, Field, Grid, inputCls, Modal, Notice, PageHeader, Panel, StatusPill, Tabs } from "../../components/employee/EmployeeShell";
import { dmy, errMsg, isoDate, listTry, useAsync } from "../../lib/employeePortal";
import { alertDialog, confirmDialog, promptDialog } from "../../components/ui/dialogs";

const runDoc = (dt, dn, method) => frappe.client.post("/method/run_doc_method", { dt, dn, method }).then((r) => r.data);
const pct = (v) => (v == null || v === "" ? "—" : `${Math.round(Number(v) * 10) / 10}`);

export default function Performance() {
  const [tab, setTab] = useState("cycles");
  return (
    <div className="space-y-5">
      <PageHeader icon={TrendingUp} title="Performance" subtitle="Appraisal cycles, appraisals, goals and appraisal templates" />
      <Tabs value={tab} onChange={setTab} tabs={[{ id: "cycles", label: "Cycles" }, { id: "appraisals", label: "Appraisals" }, { id: "goals", label: "Goals" }, { id: "templates", label: "Templates" }]} />
      {tab === "cycles" && <Cycles />}
      {tab === "appraisals" && <Appraisals />}
      {tab === "goals" && <Goals />}
      {tab === "templates" && <Templates />}
    </div>
  );
}

/* --------------------------------- cycles --------------------------------- */

function Cycles() {
  const cycles = useAsync(() => listTry("Appraisal Cycle", { fields: ["name", "cycle_name", "company", "start_date", "end_date", "status", "department", "kra_evaluation_method"], orderBy: "start_date desc" }, ["name", "cycle_name", "start_date", "end_date", "status"]), []);
  const counts = useAsync(async () => {
    const rows = await frappe.getList("Appraisal", { filters: [["docstatus", "<", 2]], fields: ["appraisal_cycle", "docstatus"], limit: 0 }).catch(() => []);
    const m = {};
    rows.forEach((r) => { const c = (m[r.appraisal_cycle] ||= { total: 0, done: 0 }); c.total += 1; if (r.docstatus === 1) c.done += 1; });
    return m;
  }, [cycles.data]);
  const [modal, setModal] = useState(null);
  return (
    <Panel action={<Button onClick={() => setModal({ kind: "new" })}><Plus size={14} /> New cycle</Button>}>
      <Async state={cycles}>
        {(rows) => <Grid rows={rows} empty="No appraisal cycles yet." columns={[
          { key: "cycle_name", label: "Cycle", render: (c) => <button type="button" onClick={() => setModal({ kind: "open", cycle: c })} className="text-left hover:underline"><b className="font-medium">{c.cycle_name}</b><span className="block text-[11px] text-[var(--color-text-faint)]">{[c.company, c.department].filter(Boolean).join(" · ")}</span></button> },
          { key: "period", label: "Period", render: (c) => `${dmy(c.start_date)} – ${dmy(c.end_date)}` },
          { key: "appraisals", label: "Appraisals", render: (c) => { const n = counts.data?.[c.name]; return n ? `${n.done}/${n.total} submitted` : "—"; } },
          { key: "status", label: "Status", render: (c) => <StatusPill status={c.status === "In Progress" ? "In Progress" : c.status === "Completed" ? "Completed" : "Pending"} /> },
        ]} />}
      </Async>
      {modal?.kind === "new" && <NewCycle onClose={() => setModal(null)} onSaved={() => { setModal(null); cycles.reload(); }} />}
      {modal?.kind === "open" && <CycleModal cycle={modal.cycle} onClose={() => { setModal(null); cycles.reload(); counts.reload(); }} />}
    </Panel>
  );
}

function NewCycle({ onClose, onSaved }) {
  const y = new Date().getFullYear();
  const [f, setF] = useState({ name: `FY ${y}-${String(y + 1).slice(2)}`, company: "", department: "", start: `${y}-04-01`, end: `${y + 1}-03-31`, method: "Automated Based on Goal Progress" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setErr("");
    try {
      await frappe.createDoc("Appraisal Cycle", { cycle_name: f.name.trim(), company: f.company, department: f.department || undefined, start_date: f.start, end_date: f.end, kra_evaluation_method: f.method });
      onSaved();
    } catch (x) {
      setErr(errMsg(x, "Couldn't create the cycle."));
      setBusy(false);
    }
  }
  return (
    <Modal title="New Appraisal Cycle" onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <Field label="Name"><input required className={inputCls} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        <LinkField label="Company" linkDoctype="Company" value={f.company} onChange={(v) => setF({ ...f, company: v })} required frappe={frappe} />
        <LinkField label="Only department (optional)" linkDoctype="Department" value={f.department} onChange={(v) => setF({ ...f, department: v })} frappe={frappe} />
        <div className="grid grid-cols-2 gap-3"><DateField label="Start" value={f.start} onChange={(v) => setF({ ...f, start: v })} required /><DateField label="End" value={f.end} onChange={(v) => setF({ ...f, end: v })} required /></div>
        <Field label="KRA scoring"><select className={inputCls} value={f.method} onChange={(e) => setF({ ...f, method: e.target.value })}><option>Automated Based on Goal Progress</option><option>Manual Rating</option></select></Field>
        {err && <Notice>{err}</Notice>}
        <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={onClose}>Cancel</Button><Button type="submit" disabled={busy}>{busy ? "Saving…" : "Create cycle"}</Button></div>
      </form>
    </Modal>
  );
}

function CycleModal({ cycle, onClose }) {
  const doc = useAsync(() => frappe.getDoc("Appraisal Cycle", cycle.name), [cycle.name]);
  const [template, setTemplate] = useState("");
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState(null);
  const d = doc.data;

  async function act(label, fn) {
    const ask = { add: "Add every active employee of this company (and department) to the cycle?", create: "Create appraisals for everyone in this cycle?", start: "Start this cycle? Employees can then fill self-appraisals.", complete: { message: "Complete this cycle? Appraisals are closed.", danger: true, confirmLabel: "Complete cycle" } }[label];
    if (ask && !(await confirmDialog(ask))) return;
    setBusy(label);
    setMsg(null);
    try {
      const text = await fn();
      setMsg({ ok: true, text });
      doc.reload();
    } catch (e) {
      setMsg({ ok: false, text: errMsg(e, "This step was refused.") });
    }
    setBusy("");
  }
  // Add everyone active in the company (and department) - designation templates are used, or the one picked here.
  const addEmployees = () => act("add", async () => {
    const filters = [["status", "=", "Active"], ["company", "=", d.company], ...(d.department ? [["department", "=", d.department]] : [])];
    const [emps, desigs] = await Promise.all([
      frappe.getList("Employee", { filters, fields: ["name", "employee_name", "designation", "department", "branch"], limit: 0 }),
      frappe.getList("Designation", { fields: ["name", "appraisal_template"], limit: 0 }).catch(() => []),
    ]);
    const byDesig = Object.fromEntries(desigs.map((x) => [x.name, x.appraisal_template]));
    const appraisees = emps.map((e) => ({ employee: e.name, employee_name: e.employee_name, designation: e.designation, department: e.department, branch: e.branch, appraisal_template: byDesig[e.designation] || template || undefined }));
    await frappe.updateDoc("Appraisal Cycle", d.name, { appraisees });
    const missing = appraisees.filter((a) => !a.appraisal_template).length;
    return `${appraisees.length} employee(s) added.${missing ? ` ${missing} have no template - pick one above and add again.` : ""}`;
  });
  const create = () => act("create", async () => { await runDoc("Appraisal Cycle", d.name, "create_appraisals"); return "Appraisals created (large cycles are queued and appear in a few minutes)."; });
  const start = () => act("start", async () => { await frappe.updateDoc("Appraisal Cycle", d.name, { status: "In Progress" }); return "Cycle started - employees can now fill self-appraisals."; });
  const complete = () => act("complete", async () => { await runDoc("Appraisal Cycle", d.name, "complete_cycle"); return "Cycle completed."; });

  return (
    <Modal title={cycle.cycle_name} onClose={onClose} wide>
      {!d ? <p className="text-[13px] text-[var(--color-text-muted)]">{doc.error ? errMsg(doc.error) : "Loading…"}</p> : (
        <div className="space-y-4">
          <p className="text-[12px] text-[var(--color-text-muted)]">{dmy(d.start_date)} – {dmy(d.end_date)} · {d.company}{d.department ? ` · ${d.department}` : ""} · {d.kra_evaluation_method} · <StatusPill status={d.status === "Not Started" ? "Pending" : d.status} /></p>
          <div className="flex flex-wrap items-end gap-2">
            <div className="w-64"><LinkField label="Template for employees without one" linkDoctype="Appraisal Template" value={template} onChange={setTemplate} frappe={frappe} /></div>
            <Button variant="secondary" onClick={addEmployees} disabled={!!busy || d.status === "Completed"}>{busy === "add" ? "Adding…" : "Add employees"}</Button>
            <Button variant="secondary" onClick={create} disabled={!!busy || !(d.appraisees || []).length}>{busy === "create" ? "Creating…" : "Create appraisals"}</Button>
            {d.status === "Not Started" && <Button onClick={start} disabled={!!busy}>Start cycle</Button>}
            {d.status === "In Progress" && <Button onClick={complete} disabled={!!busy}>{busy === "complete" ? "Completing…" : "Complete cycle"}</Button>}
          </div>
          {msg && <Notice tone={msg.ok ? "info" : "error"}>{msg.text}</Notice>}
          <Grid rows={d.appraisees || []} rowKey={(r) => r.employee} empty="No employees added yet." columns={[
            { key: "employee_name", label: "Employee" }, { key: "designation", label: "Designation" }, { key: "department", label: "Department" },
            { key: "appraisal_template", label: "Template", render: (r) => r.appraisal_template || <span className="text-[var(--color-red-hover)]">missing</span> },
          ]} />
        </div>
      )}
    </Modal>
  );
}

/* ------------------------------- appraisals ------------------------------- */

function Appraisals() {
  const [cycle, setCycle] = useState("");
  const list = useAsync(() => listTry("Appraisal", { filters: [["docstatus", "<", 2], ...(cycle ? [["appraisal_cycle", "=", cycle]] : [])], fields: ["name", "employee", "employee_name", "department", "designation", "appraisal_cycle", "appraisal_template", "goal_score_percentage", "self_score", "avg_feedback_score", "final_score", "docstatus"], orderBy: "modified desc" }, ["name", "employee", "employee_name", "appraisal_cycle", "docstatus"]), [cycle]);
  const [msg, setMsg] = useState(null);
  async function submit(a) {
    if (!(await confirmDialog(`Submit ${a.employee_name}'s appraisal? It can't be edited afterwards.`))) return;
    try { await frappe.submitDoc(await frappe.getDoc("Appraisal", a.name)); list.reload(); } catch (e) { setMsg(errMsg(e, "Couldn't submit the appraisal.")); }
  }
  return (
    <Panel>
      <div className="mb-4 w-72"><LinkField label="Cycle" linkDoctype="Appraisal Cycle" value={cycle} onChange={setCycle} frappe={frappe} /></div>
      {msg && <div className="mb-3"><Notice>{msg}</Notice></div>}
      <Async state={list}>
        {(rows) => <Grid rows={rows} empty="No appraisals. Create them from a cycle." columns={[
          { key: "employee_name", label: "Employee", render: (a) => <span>{a.employee_name}<span className="block text-[11px] text-[var(--color-text-faint)]">{[a.designation, a.department].filter(Boolean).join(" · ")}</span></span> },
          { key: "appraisal_cycle", label: "Cycle" },
          { key: "goal_score_percentage", label: "Goal Score %", render: (a) => pct(a.goal_score_percentage) },
          { key: "self_score", label: "Self", render: (a) => pct(a.self_score) },
          { key: "avg_feedback_score", label: "Feedback", render: (a) => pct(a.avg_feedback_score) },
          { key: "final_score", label: "Final", render: (a) => <b>{pct(a.final_score)}</b> },
          { key: "status", label: "Status", render: (a) => <StatusPill status={a.docstatus === 1 ? "Submitted" : "Draft"} /> },
          { key: "_a", label: "", render: (a) => (a.docstatus === 0 ? <Button variant="secondary" className="!px-2 !py-1 text-[11px]" onClick={() => submit(a)}>Submit</Button> : null) },
        ]} />}
      </Async>
      <p className="mt-3 text-[11px] text-[var(--color-text-faint)]">Employees complete their self-appraisal and managers provide feedback in the HR workspace - scores update here automatically.</p>
    </Panel>
  );
}

/* ---------------------------------- goals ---------------------------------- */

function Goals() {
  const [status, setStatus] = useState("open");
  const goals = useAsync(() => listTry("Goal", { filters: [["is_group", "=", 0]], fields: ["name", "goal_name", "employee", "employee_name", "appraisal_cycle", "kra", "progress", "status", "start_date", "end_date"], orderBy: "modified desc" }, ["name", "goal_name", "employee", "employee_name", "progress", "status"]), []);
  const [modal, setModal] = useState(null);
  const rows = (goals.data || []).filter((g) => status === "all" || (status === "open" ? !["Completed", "Archived", "Closed"].includes(g.status) : ["Completed", "Archived", "Closed"].includes(g.status)));
  async function setProgress(g) {
    const v = await promptDialog({ title: "Update goal progress", message: `Progress for "${g.goal_name}" (0-100)`, label: "Progress (%)", multiline: false, inputType: "number", min: 0, max: 100, defaultValue: String(g.progress ?? 0), confirmLabel: "Save progress" });
    if (v == null) return;
    const n = Math.max(0, Math.min(100, Number(v) || 0));
    try { await frappe.updateDoc("Goal", g.name, { progress: n, status: n >= 100 ? "Completed" : n > 0 ? "In Progress" : "Pending" }); goals.reload(); } catch (e) { alertDialog({ tone: "error", message: errMsg(e, "Couldn't update the goal.") }); }
  }
  return (
    <Panel action={<Button onClick={() => setModal({})}><Plus size={14} /> New goal</Button>}>
      <div className="mb-4 flex gap-2">{[["open", "Open"], ["done", "Completed / Closed"], ["all", "All"]].map(([v, l]) => <button key={v} type="button" onClick={() => setStatus(v)} className={chipCls(status === v)}>{l}</button>)}</div>
      <Async state={goals}>
        {() => <Grid rows={rows} empty="No goals here." columns={[
          { key: "goal_name", label: "Goal", render: (g) => <span><Target size={12} className="mr-1 inline text-[var(--color-text-faint)]" />{g.goal_name}{g.kra && <span className="block text-[11px] text-[var(--color-text-faint)]">KRA: {g.kra}</span>}</span> },
          { key: "employee_name", label: "Employee" },
          { key: "appraisal_cycle", label: "Cycle", render: (g) => g.appraisal_cycle || "—" },
          { key: "dates", label: "Due", render: (g) => dmy(g.end_date) || "—" },
          { key: "progress", label: "Progress", render: (g) => <button type="button" onClick={() => setProgress(g)} className="flex items-center gap-2 hover:underline" title="Update progress"><span className="h-1.5 w-20 overflow-hidden rounded-full bg-[var(--color-surface-2)]"><span className="block h-full bg-[var(--color-red)]" style={{ width: `${Math.min(100, Number(g.progress) || 0)}%` }} /></span>{Math.round(Number(g.progress) || 0)}%</button> },
          { key: "status", label: "Status", render: (g) => <StatusPill status={g.status || "Pending"} /> },
        ]} />}
      </Async>
      {modal && <GoalModal onClose={() => setModal(null)} onSaved={() => { setModal(null); goals.reload(); }} />}
    </Panel>
  );
}

function GoalModal({ onClose, onSaved }) {
  const [f, setF] = useState({ employee: "", goal_name: "", cycle: "", kra: "", start: isoDate(), end: "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setErr("");
    try {
      await frappe.createDoc("Goal", { employee: f.employee, goal_name: f.goal_name.trim(), appraisal_cycle: f.cycle || undefined, kra: f.kra || undefined, start_date: f.start, end_date: f.end || undefined, progress: 0, status: "Pending" });
      onSaved();
    } catch (x) {
      setErr(errMsg(x, "Couldn't create the goal."));
      setBusy(false);
    }
  }
  return (
    <Modal title="New Goal" onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <LinkField label="Employee" linkDoctype="Employee" value={f.employee} onChange={(v) => setF({ ...f, employee: v })} required frappe={frappe} />
        <Field label="Goal"><input required className={inputCls} value={f.goal_name} onChange={(e) => setF({ ...f, goal_name: e.target.value })} placeholder="e.g. Close 3 Fusion SCM go-lives" /></Field>
        <div className="grid grid-cols-2 gap-3">
          <LinkField label="Appraisal cycle" linkDoctype="Appraisal Cycle" value={f.cycle} onChange={(v) => setF({ ...f, cycle: v })} frappe={frappe} />
          <LinkField label="KRA" linkDoctype="KRA" value={f.kra} onChange={(v) => setF({ ...f, kra: v })} frappe={frappe} />
          <DateField label="Start" value={f.start} onChange={(v) => setF({ ...f, start: v })} required />
          <DateField label="Due" value={f.end} onChange={(v) => setF({ ...f, end: v })} />
        </div>
        <p className="text-[11px] text-[var(--color-text-faint)]">With automated scoring, a goal's progress feeds its KRA score in the employee's appraisal (the KRA must be on their template).</p>
        {err && <Notice>{err}</Notice>}
        <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={onClose}>Cancel</Button><Button type="submit" disabled={busy}>{busy ? "Saving…" : "Create goal"}</Button></div>
      </form>
    </Modal>
  );
}

/* -------------------------------- templates -------------------------------- */

function Templates() {
  const list = useAsync(async () => {
    const rows = await listTry("Appraisal Template", { fields: ["name", "template_title", "description"], orderBy: "modified desc" }, ["name"]);
    const goals = rows.length ? await frappe.getList("Appraisal Template Goal", { parent: "Appraisal Template", filters: [["parent", "in", rows.map((r) => r.name)]], fields: ["parent", "key_result_area", "per_weightage"], limit: 0 }).catch(() => []) : [];
    return rows.map((r) => ({ ...r, goals: goals.filter((g) => g.parent === r.name) }));
  }, []);
  const [open, setOpen] = useState(false);
  return (
    <Panel action={<Button onClick={() => setOpen(true)}><Plus size={14} /> New template</Button>}>
      <Async state={list}>
        {(rows) => <Grid rows={rows} empty="No templates. Create one with the KRAs for a role." columns={[
          { key: "name", label: "Template", render: (t) => <b className="font-medium">{t.template_title || t.name}</b> },
          { key: "goals", label: "KRAs (Weightage)", render: (t) => <span className="text-[12px]">{t.goals.map((g) => `${g.key_result_area} ${g.per_weightage}%`).join(" · ") || "—"}</span> },
        ]} />}
      </Async>
      {open && <TemplateModal onClose={() => setOpen(false)} onSaved={() => { setOpen(false); list.reload(); }} />}
    </Panel>
  );
}

function TemplateModal({ onClose, onSaved }) {
  const [title, setTitle] = useState("");
  const [rows, setRows] = useState([{ kra: "", w: "50" }, { kra: "", w: "50" }]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const total = useMemo(() => rows.reduce((s, r) => s + (Number(r.w) || 0), 0), [rows]);
  async function submit(e) {
    e.preventDefault();
    const list = rows.filter((r) => r.kra.trim());
    if (!list.length) return setErr("Add at least one KRA.");
    if (Math.round(list.reduce((s, r) => s + (Number(r.w) || 0), 0)) !== 100) return setErr("Weightages must add up to 100%.");
    setBusy(true);
    setErr("");
    try {
      const have = new Set((await frappe.getList("KRA", { fields: ["name"], limit: 0 })).map((k) => k.name.toLowerCase()));
      for (const r of list) if (!have.has(r.kra.trim().toLowerCase())) await frappe.createDoc("KRA", { title: r.kra.trim() });
      await frappe.createDoc("Appraisal Template", { template_title: title.trim(), goals: list.map((r) => ({ key_result_area: r.kra.trim(), per_weightage: Number(r.w) })) });
      onSaved();
    } catch (x) {
      setErr(errMsg(x, "Couldn't create the template."));
      setBusy(false);
    }
  }
  return (
    <Modal title="New Appraisal Template" onClose={onClose} wide>
      <form onSubmit={submit} className="space-y-3">
        <Field label="Template name"><input required className={inputCls} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Oracle Fusion Consultant" /></Field>
        <div className="space-y-2">
          {rows.map((r, i) => (
            <div key={i} className="grid grid-cols-[1fr_7rem_2rem] gap-2">
              <input className={inputCls} placeholder="KRA, e.g. Delivery quality" value={r.kra} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, kra: e.target.value } : x)))} />
              <input className={inputCls} type="number" min="0" max="100" value={r.w} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, w: e.target.value } : x)))} />
              <button type="button" onClick={() => setRows(rows.filter((_, j) => j !== i))} className="text-[var(--color-text-muted)] hover:text-[var(--color-red-hover)]">×</button>
            </div>
          ))}
          <div className="flex items-center justify-between text-[12px]"><button type="button" onClick={() => setRows([...rows, { kra: "", w: "0" }])} className="text-[var(--color-red-hover)] hover:underline">+ Add KRA</button><span className={total === 100 ? "text-[var(--color-green)]" : "text-[var(--color-amber)]"}>Total {total}%</span></div>
        </div>
        {err && <Notice>{err}</Notice>}
        <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={onClose}>Cancel</Button><Button type="submit" disabled={busy}>{busy ? "Saving…" : "Create template"}</Button></div>
      </form>
    </Modal>
  );
}
