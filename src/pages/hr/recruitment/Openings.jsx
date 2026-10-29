// Job openings: role, skills, salary range, careers-page publishing, vacancies and the ordered interview rounds.
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowDown, ArrowUp, Briefcase, ExternalLink, Globe, KanbanSquare, Pencil, Plus, Trash2, X } from "lucide-react";
import { frappe } from "../../../lib/api/frappeClient";
import { Button, DateField, LinkField } from "../../../components/ui/primitives";
import { Async, chipCls, Field, Grid, inputCls, Modal, Notice, PageHeader, Panel, StatusPill } from "../../../components/employee/EmployeeShell";
import { dmy, errMsg, money, useAsync } from "../../../lib/employeePortal";
import { listApplicants, listOffers, listOpenings, listRounds, roundsOf, stageOf, vacanciesOf } from "../../../lib/recruitment";
import { enc, SetupHint } from "./shared";
import { alertDialog, confirmDialog } from "../../../components/ui/dialogs";

export function useOpeningStats(openings) {
  return useAsync(async () => {
    const apps = await listApplicants();
    const accepted = await listOffers([["docstatus", "=", 1], ["status", "=", "Accepted"]]).catch(() => []);
    const acceptedApps = new Set(accepted.filter((o) => !["No-show", "Withdrawn"].includes(o.custom_joining_status)).map((o) => o.job_applicant));
    const m = {};
    apps.forEach((a) => {
      const k = a.job_title || "";
      const s = (m[k] ||= { total: 0, active: 0, accepted: 0, hired: 0 });
      s.total += 1;
      const st = stageOf(a);
      if (!["Rejected", "Withdrawn", "Hired"].includes(st)) s.active += 1;
      if (acceptedApps.has(a.name)) s.accepted += 1;
      if (st === "Hired") s.hired += 1;
    });
    return m;
  }, [openings?.length]);
}

export default function Openings() {
  const openings = useAsync(() => listOpenings(), []);
  const stats = useOpeningStats(openings.data);
  const [filter, setFilter] = useState("Open");
  const [modal, setModal] = useState(null);
  const rows = (openings.data || []).filter((o) => filter === "all" || o.status === filter);

  async function toggle(o, field, value) {
    if (field === "status" && !(await confirmDialog(value === "Closed" ? `Close the opening ${o.job_title}? No new candidates can be added.` : `Reopen ${o.job_title}?`))) return;
    try {
      await frappe.updateDoc("Job Opening", o.name, { [field]: value });
      openings.reload();
    } catch (e) {
      alertDialog({ tone: "error", message: errMsg(e, "Couldn't update the opening.") });
    }
  }
  async function remove(o) {
    if (!(await confirmDialog(`Delete ${o.job_title}? This only works when no candidates are linked to it.`))) return;
    try {
      await frappe.deleteDoc("Job Opening", o.name);
      openings.reload();
    } catch (e) {
      alertDialog({ tone: "error", message: errMsg(e, "Couldn't delete this opening (it probably has candidates - close it instead).") });
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader icon={Briefcase} title="Job openings" subtitle="Positions you're hiring for, their interview rounds and how far each one has got" actions={<Button onClick={() => setModal({})}><Plus size={14} /> New opening</Button>} />
      <SetupHint />
      <Panel>
        <div className="mb-4 flex flex-wrap gap-2">{[["Open", "Open"], ["Closed", "Closed"], ["all", "All"]].map(([v, l]) => <button key={v} type="button" onClick={() => setFilter(v)} className={chipCls(filter === v)}>{l}</button>)}</div>
        <Async state={openings}>
          {() => <Grid rows={rows} empty="No openings here." columns={[
            { key: "job_title", label: "Opening", render: (o) => <Link to={`/hr/recruitment/openings/${enc(o.name)}`} className="hover:underline"><b className="font-medium">{o.job_title}</b><span className="block text-[11px] text-[var(--color-text-faint)]">{[o.designation, o.department, o.location].filter(Boolean).join(" · ")}</span></Link> },
            { key: "vac", label: "Filled", render: (o) => { const s = stats.data?.[o.name]; const v = vacanciesOf(o); return <span>{s ? s.accepted : stats.data ? 0 : "…"} / {v || "—"}</span>; } },
            { key: "pipe", label: "Candidates", render: (o) => { const s = stats.data?.[o.name]; return s ? <span>{s.active} active<span className="block text-[11px] text-[var(--color-text-faint)]">{s.total} total</span></span> : "0"; } },
            { key: "rounds", label: "Rounds", render: (o) => roundsOf(o).length ? <span className="text-[11.5px]">{roundsOf(o).join(" → ")}</span> : <span className="text-[11px] text-[var(--color-amber)]">Not set</span> },
            { key: "salary", label: "Salary range", render: (o) => (o.lower_range || o.upper_range ? `${money(o.lower_range, o.currency || "INR")} – ${money(o.upper_range, o.currency || "INR")}` : "—") },
            { key: "closes_on", label: "Closes", render: (o) => (o.status === "Closed" ? `Closed ${dmy(o.closed_on)}` : dmy(o.closes_on) || "—") },
            { key: "status", label: "Status", render: (o) => <span className="flex items-center gap-1.5"><StatusPill status={o.status} />{Number(o.publish) === 1 && <Globe size={12} className="text-[var(--color-green)]" title="On the careers page" />}</span> },
            { key: "_a", label: "", render: (o) => (
              <div className="flex justify-end gap-1 whitespace-nowrap">
                <Link to={`/hr/recruitment/openings/${enc(o.name)}`} title="Pipeline board" className="rounded p-1 text-[var(--color-text-muted)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text)]"><KanbanSquare size={14} /></Link>
                <button type="button" title="Edit" onClick={() => setModal({ opening: o })} className="rounded p-1 text-[var(--color-text-muted)] hover:bg-[var(--color-surface-2)]"><Pencil size={14} /></button>
                {Number(o.publish) === 1 && o.route && o.status === "Open" && <a href={`/${o.route}`} target="_blank" rel="noreferrer" title="Open on careers page" className="rounded p-1 text-[var(--color-text-muted)] hover:bg-[var(--color-surface-2)]"><ExternalLink size={14} /></a>}
                <button type="button" onClick={() => toggle(o, "status", o.status === "Open" ? "Closed" : "Open")} className="rounded px-1.5 py-1 text-[11px] text-[var(--color-text-muted)] hover:bg-[var(--color-surface-2)]">{o.status === "Open" ? "Close" : "Reopen"}</button>
                <button type="button" title="Delete" onClick={() => remove(o)} className="rounded p-1 text-[var(--color-text-muted)] hover:text-[var(--color-red-hover)]"><Trash2 size={14} /></button>
              </div>
            ) },
          ]} />}
        </Async>
      </Panel>
      {modal && <OpeningModal opening={modal.opening} onClose={() => setModal(null)} onSaved={() => { setModal(null); openings.reload(); }} />}
    </div>
  );
}

/** Ordered list of interview rounds for an opening: add, remove, reorder. */
export function RoundsPicker({ value, onChange, designation }) {
  const rounds = useAsync(listRounds, []);
  const options = useMemo(() => (rounds.data || []).filter((r) => !value.includes(r.name) && (!r.designation || !designation || r.designation === designation)), [rounds.data, value, designation]);
  const move = (i, d) => { const v = [...value]; [v[i], v[i + d]] = [v[i + d], v[i]]; onChange(v); };
  return (
    <div className="space-y-2">
      {value.length === 0 && <p className="text-[12px] text-[var(--color-text-muted)]">No rounds yet - offers can then be sent without interview checks.</p>}
      <ol className="space-y-1">
        {value.map((r, i) => (
          <li key={r} className="flex items-center gap-2 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2.5 py-1.5 text-[12.5px] text-[var(--color-text)]">
            <span className="w-5 text-[11px] text-[var(--color-text-faint)]">{i + 1}.</span>
            <span className="flex-1">{r}{(() => { const d = (rounds.data || []).find((x) => x.name === r); return d?.skills?.length ? <span className="ml-2 text-[11px] text-[var(--color-text-faint)]">{d.skills.join(", ")}</span> : null; })()}</span>
            <button type="button" disabled={i === 0} onClick={() => move(i, -1)} className="text-[var(--color-text-muted)] disabled:opacity-30"><ArrowUp size={13} /></button>
            <button type="button" disabled={i === value.length - 1} onClick={() => move(i, 1)} className="text-[var(--color-text-muted)] disabled:opacity-30"><ArrowDown size={13} /></button>
            <button type="button" onClick={() => onChange(value.filter((x) => x !== r))} className="text-[var(--color-text-muted)] hover:text-[var(--color-red-hover)]"><X size={13} /></button>
          </li>
        ))}
      </ol>
      <div className="flex items-center gap-2">
        <select className={`${inputCls} !w-auto`} value="" onChange={(e) => e.target.value && onChange([...value, e.target.value])}>
          <option value="">+ Add a round…</option>
          {options.map((r) => <option key={r.name} value={r.name}>{r.round_name}{r.designation ? ` (${r.designation})` : ""}</option>)}
        </select>
        <Link to="/hr/recruitment/interviews?tab=rounds" className="text-[11px] text-[var(--color-red-hover)] hover:underline" target="_blank">Manage rounds</Link>
      </div>
    </div>
  );
}

export function OpeningModal({ opening, onClose, onSaved }) {
  const o = opening || {};
  const [f, setF] = useState({
    job_title: o.job_title || "", designation: o.designation || "", department: o.department || "", company: o.company || "", location: o.location || "", employment_type: o.employment_type || "",
    vacancies: o.vacancies || o.planned_vacancies || 1, closes_on: o.closes_on || "", currency: o.currency || "INR", lower_range: o.lower_range || "", upper_range: o.upper_range || "", salary_per: o.salary_per || "Year",
    publish_salary_range: Number(o.publish_salary_range) === 1, publish: Number(o.publish) === 1, custom_skills: o.custom_skills || "", custom_experience: o.custom_experience || "", description: "", rounds: roundsOf(o),
  });
  const full = useAsync(() => (o.name ? frappe.getDoc("Job Opening", o.name) : Promise.resolve(null)), [o.name]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const set = (k) => (e) => setF((v) => ({ ...v, [k]: e.target.value }));
  const desc = f.description || (full.data?.description || "").replace(/<[^>]+>/g, "\n").replace(/\n{2,}/g, "\n").trim();

  async function submit(e) {
    e.preventDefault();
    if (f.lower_range && f.upper_range && Number(f.upper_range) < Number(f.lower_range)) return setErr("The upper salary can't be below the lower one.");
    setBusy(true);
    setErr("");
    try {
      const doc = {
        job_title: f.job_title.trim(), designation: f.designation, department: f.department || null, company: f.company, location: f.location || null, employment_type: f.employment_type || null,
        vacancies: Number(f.vacancies) || 0, closes_on: f.closes_on || null, currency: f.currency || null, lower_range: Number(f.lower_range) || 0, upper_range: Number(f.upper_range) || 0, salary_per: f.salary_per,
        publish_salary_range: f.publish_salary_range ? 1 : 0, publish: f.publish ? 1 : 0, custom_skills: f.custom_skills || null, custom_experience: f.custom_experience || null,
        custom_interview_rounds: JSON.stringify(f.rounds), description: desc ? desc.split("\n").map((l) => `<p>${l.replace(/</g, "&lt;")}</p>`).join("") : undefined,
      };
      if (!o.name) doc.status = "Open";
      if (o.name) await frappe.updateDoc("Job Opening", o.name, doc);
      else await frappe.createDoc("Job Opening", doc);
      onSaved();
    } catch (x) {
      setErr(errMsg(x, "Couldn't save the opening."));
      setBusy(false);
    }
  }

  return (
    <Modal title={o.name ? `Edit ${o.job_title}` : "New job opening"} onClose={onClose} wide="xl">
      <form onSubmit={submit} className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <div className="space-y-3">
          <Field label="Job title"><input required className={inputCls} value={f.job_title} onChange={set("job_title")} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <LinkField label="Designation" linkDoctype="Designation" value={f.designation} onChange={(v) => setF({ ...f, designation: v })} required frappe={frappe} />
            <LinkField label="Department" linkDoctype="Department" value={f.department} onChange={(v) => setF({ ...f, department: v })} frappe={frappe} />
            <LinkField label="Company" linkDoctype="Company" value={f.company} onChange={(v) => setF({ ...f, company: v })} required frappe={frappe} />
            <LinkField label="Location (branch)" linkDoctype="Branch" value={f.location} onChange={(v) => setF({ ...f, location: v })} frappe={frappe} />
            <LinkField label="Employment type" linkDoctype="Employment Type" value={f.employment_type} onChange={(v) => setF({ ...f, employment_type: v })} frappe={frappe} />
            <Field label="Vacancies"><input type="number" min="1" className={inputCls} value={f.vacancies} onChange={set("vacancies")} /></Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Experience"><input className={inputCls} value={f.custom_experience} onChange={set("custom_experience")} placeholder="e.g. 4–7 years" /></Field>
            <DateField label="Applications close on" value={f.closes_on} onChange={(v) => setF({ ...f, closes_on: v })} />
          </div>
          <Field label="Key skills" hint="Comma separated"><input className={inputCls} value={f.custom_skills} onChange={set("custom_skills")} /></Field>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Salary from"><input type="number" min="0" className={inputCls} value={f.lower_range} onChange={set("lower_range")} /></Field>
            <Field label="Salary to"><input type="number" min="0" className={inputCls} value={f.upper_range} onChange={set("upper_range")} /></Field>
            <Field label="Per"><select className={inputCls} value={f.salary_per} onChange={set("salary_per")}><option>Year</option><option>Month</option></select></Field>
          </div>
          <label className="flex items-center gap-2 text-[12px] text-[var(--color-text-muted)]"><input type="checkbox" checked={f.publish} onChange={(e) => setF({ ...f, publish: e.target.checked })} /> Publish on the careers page</label>
          <label className="flex items-center gap-2 text-[12px] text-[var(--color-text-muted)]"><input type="checkbox" checked={f.publish_salary_range} onChange={(e) => setF({ ...f, publish_salary_range: e.target.checked })} /> Show the salary range publicly</label>
        </div>
        <div className="space-y-3">
          <Field label="Job description"><textarea rows={8} className={inputCls} value={desc} onChange={set("description")} placeholder="Responsibilities, must-haves, nice-to-haves…" /></Field>
          <div>
            <span className="mb-1.5 block text-[12px] text-[var(--color-text-muted)]">Interview rounds, in order</span>
            <RoundsPicker value={f.rounds} onChange={(rounds) => setF({ ...f, rounds })} designation={f.designation} />
          </div>
          <p className="text-[11px] text-[var(--color-text-faint)]">Offers can only be sent once every round here is Cleared, unless an HR override reason is given. LinkedIn / Naukri: post manually for now and record the source on each candidate.</p>
        </div>
        {err && <div className="lg:col-span-2"><Notice>{err}</Notice></div>}
        <div className="flex justify-end gap-2 lg:col-span-2"><Button type="button" variant="ghost" onClick={onClose}>Cancel</Button><Button type="submit" disabled={busy}>{busy ? "Saving…" : o.name ? "Save" : "Create opening"}</Button></div>
      </form>
    </Modal>
  );
}
