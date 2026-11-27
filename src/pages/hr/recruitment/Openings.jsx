// Job openings: role, skills, salary range, careers-page publishing, vacancies and the ordered interview rounds.
// Job posting (share links, ready-to-paste post text, where it's been posted) and AI-written descriptions.
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowDown, ArrowUp, Briefcase, Copy, ExternalLink, Globe, KanbanSquare, Megaphone, Pencil, Plus, Sparkles, Trash2, X } from "lucide-react";
import { frappe } from "../../../lib/api/frappeClient";
import { Button, DateField, LinkField } from "../../../components/ui/primitives";
import { Async, chipCls, Field, Grid, inputCls, Modal, Notice, PageHeader, Panel, StatusPill } from "../../../components/employee/EmployeeShell";
import { dmy, errMsg, isoDate, money, useAsync } from "../../../lib/employeePortal";
import { commsError, generateJdWithAi, getCommsSettings, templateJd } from "../../../lib/comms";
import { useAuth } from "../../../context/AuthContext";
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
  const [posting, setPosting] = useState(null);
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
      <PageHeader icon={Briefcase} title="Job Openings" subtitle="Positions you're hiring for, their interview rounds and how far each one has got" actions={<Button onClick={() => setModal({})}><Plus size={14} /> New Opening</Button>} />
      <SetupHint />
      <Panel>
        <div className="mb-4 flex flex-wrap gap-2">{[["Open", "Open"], ["Closed", "Closed"], ["all", "All"]].map(([v, l]) => <button key={v} type="button" onClick={() => setFilter(v)} className={chipCls(filter === v)}>{l}</button>)}</div>
        <Async state={openings}>
          {() => <Grid rows={rows} empty="No openings here." columns={[
            { key: "job_title", label: "Opening", render: (o) => <Link to={`/hr/recruitment/openings/${enc(o.name)}`} className="hover:underline"><b className="font-medium">{o.job_title}</b><span className="block text-[11px] text-[var(--color-text-faint)]">{[o.designation, o.department, o.location].filter(Boolean).join(" · ")}</span></Link> },
            { key: "vac", label: "Filled", render: (o) => { const s = stats.data?.[o.name]; const v = vacanciesOf(o); return <span>{s ? s.accepted : stats.data ? 0 : "…"} / {v || "—"}</span>; } },
            { key: "pipe", label: "Candidates", render: (o) => { const s = stats.data?.[o.name]; return s ? <span>{s.active} active<span className="block text-[11px] text-[var(--color-text-faint)]">{s.total} total</span></span> : "0"; } },
            { key: "rounds", label: "Rounds", render: (o) => roundsOf(o).length ? <span className="text-[11.5px]">{roundsOf(o).join(" → ")}</span> : <span className="text-[11px] text-[var(--color-amber)]">Not set</span> },
            { key: "salary", label: "Salary Range", render: (o) => (o.lower_range || o.upper_range ? `${money(o.lower_range, o.currency || "INR")} – ${money(o.upper_range, o.currency || "INR")}` : "—") },
            { key: "closes_on", label: "Closes", render: (o) => (o.status === "Closed" ? `Closed ${dmy(o.closed_on)}` : dmy(o.closes_on) || "—") },
            { key: "status", label: "Status", render: (o) => <span className="flex items-center gap-1.5"><StatusPill status={o.status} />{Number(o.publish) === 1 && <Globe size={12} className="text-[var(--color-green)]" title="On the Careers Page" />}</span> },
            { key: "_a", label: "", render: (o) => (
              <div className="flex justify-end gap-1 whitespace-nowrap">
                <Link to={`/hr/recruitment/openings/${enc(o.name)}`} title="Pipeline Board" className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] transition-colors hover:border-[var(--color-border-strong)] hover:bg-[var(--color-surface-2)] text-[var(--color-text-muted)] hover:text-[var(--color-text)]"><KanbanSquare size={14} /></Link>
                <button type="button" title="Edit" onClick={() => setModal({ opening: o })} className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] transition-colors hover:border-[var(--color-border-strong)] hover:bg-[var(--color-surface-2)] text-[var(--color-text-muted)] hover:text-[var(--color-text)]"><Pencil size={14} /></button>
                {o.status === "Open" && <button type="button" title="Post Job" onClick={() => setPosting(o)} className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] transition-colors hover:border-[var(--color-border-strong)] hover:bg-[var(--color-surface-2)] text-[var(--color-text-muted)] hover:!text-[var(--color-red-hover)]"><Megaphone size={14} /></button>}
                {Number(o.publish) === 1 && o.route && o.status === "Open" && <a href={`/${o.route}`} target="_blank" rel="noreferrer" title="Open on careers page" className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] transition-colors hover:border-[var(--color-border-strong)] hover:bg-[var(--color-surface-2)] text-[var(--color-text-muted)] hover:text-[var(--color-text)]"><ExternalLink size={14} /></a>}
                <button type="button" onClick={() => toggle(o, "status", o.status === "Open" ? "Closed" : "Open")} className="rounded px-1.5 py-1 text-[11px] text-[var(--color-text-muted)] hover:bg-[var(--color-surface-2)]">{o.status === "Open" ? "Close" : "Reopen"}</button>
                <button type="button" title="Delete" onClick={() => remove(o)} className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] transition-colors hover:border-[var(--color-border-strong)] hover:bg-[var(--color-surface-2)] text-[var(--color-text-muted)] hover:!text-[var(--color-red-hover)]"><Trash2 size={14} /></button>
              </div>
            ) },
          ]} />}
        </Async>
      </Panel>
      {modal && <OpeningModal opening={modal.opening} onClose={() => setModal(null)} onSaved={() => { setModal(null); openings.reload(); }} />}
      {posting && <PostJobModal opening={posting} onClose={() => setPosting(null)} onChanged={openings.reload} />}
    </div>
  );
}

/* --------------------------------- job posting --------------------------------- */

const BOARDS = ["Careers Page", "LinkedIn", "Naukri", "Indeed", "Foundit", "Instahire", "Internal Referral", "WhatsApp Groups"];
const parseBoards = (o) => { try { return JSON.parse(o.custom_job_boards || "[]"); } catch { return []; } };
const plain = (html) => String(html || "").replace(/<\/(p|div|li|h\d)>/gi, "\n").replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/\n{3,}/g, "\n\n").trim();

/** Get an opening out: careers-page link, one-click shares, a post to paste into job boards, and where it's been posted. */
function PostJobModal({ opening, onClose, onChanged }) {
  const { user } = useAuth();
  const full = useAsync(() => frappe.getDoc("Job Opening", opening.name), [opening.name]);
  const [edited, setBoards] = useState(null); // null until HR ticks a board: then the saved list comes from the record
  const boards = edited ?? parseBoards(full.data || opening);
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState(null);
  const o = full.data || opening;
  const published = Number(o.publish) === 1 && o.route;
  const link = published ? `${window.location.origin}/${o.route}` : "";
  const salary = Number(o.publish_salary_range) === 1 && (o.lower_range || o.upper_range) ? `${money(o.lower_range, o.currency || "INR")} – ${money(o.upper_range, o.currency || "INR")} per ${String(o.salary_per || "year").toLowerCase()}` : "";
  const post = [
    `We're hiring: ${o.job_title}${o.company ? ` at ${o.company}` : ""}`,
    "",
    [o.location && `📍 ${o.location}`, o.employment_type && `💼 ${o.employment_type}`, o.custom_experience && `🧭 ${o.custom_experience} experience`, salary && `💰 ${salary}`].filter(Boolean).join("   "),
    o.custom_skills && `Key skills: ${o.custom_skills}`,
    "",
    plain(o.description),
    "",
    link ? `Apply here: ${link}` : "Interested? Send your CV to our HR team.",
  ].filter((l) => l !== false && l !== undefined && l !== null).join("\n").replace(/\n{3,}/g, "\n\n").trim();
  const shareText = `We're hiring: ${o.job_title}${o.location ? ` (${o.location})` : ""}. ${link ? `Apply: ${link}` : ""}`.trim();

  async function copy(text, what) {
    try { await navigator.clipboard.writeText(text); setMsg({ ok: true, text: `${what} copied.` }); } catch { setMsg({ ok: false, text: "Couldn't copy - select the text and copy it manually." }); }
  }

  async function publish() {
    setBusy("publish");
    setMsg(null);
    try {
      await frappe.updateDoc("Job Opening", o.name, { publish: 1 });
      await full.reload();
      onChanged();
      setMsg({ ok: true, text: "Published on the careers page." });
    } catch (x) {
      setMsg({ ok: false, text: errMsg(x, "Couldn't publish the opening.") });
    }
    setBusy("");
  }

  async function toggleBoard(board) {
    const next = boards.some((b) => b.board === board) ? boards.filter((b) => b.board !== board) : [...boards, { board, on: isoDate(), by: user?.email || "" }];
    setBoards(next);
    try {
      await frappe.updateDoc("Job Opening", o.name, { custom_job_boards: JSON.stringify(next) });
      onChanged();
    } catch (x) {
      setBoards(boards);
      setMsg({ ok: false, text: /custom_job_boards/.test(String(x?.response?.data?.exception || "")) ? "Tracking job boards isn't set up on the server yet - it's added the next time the Administrator signs in." : errMsg(x, "Couldn't save where it was posted.") });
    }
  }

  const share = [
    ["LinkedIn", link && `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(link)}`],
    ["WhatsApp", `https://wa.me/?text=${encodeURIComponent(shareText)}`],
    ["X", `https://x.com/intent/post?text=${encodeURIComponent(shareText)}`],
    ["Email", `mailto:?subject=${encodeURIComponent(`Job opening: ${o.job_title}`)}&body=${encodeURIComponent(post)}`],
  ].filter(([, url]) => url);

  return (
    <Modal title={`Post Job · ${o.job_title}`} onClose={onClose} wide="xl">
      <div className="grid grid-cols-1 gap-5 text-[13px] lg:grid-cols-5">
        <div className="space-y-4 lg:col-span-2">
          <div className="rounded-lg border border-[var(--color-border)] p-3">
            <p className="mb-2 font-medium text-[var(--color-text)]">Careers Page</p>
            {published ? (
              <>
                <div className="flex gap-2"><input readOnly className={`${inputCls} !text-[12px]`} value={link} onFocus={(e) => e.target.select()} /><Button type="button" variant="secondary" onClick={() => copy(link, "Link")}><Copy size={13} /></Button></div>
                <a href={link} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 text-[12px] text-[var(--color-red-hover)] hover:underline"><ExternalLink size={12} /> Open the public page</a>
                <p className="mt-1 text-[11px] text-[var(--color-text-faint)]">Candidates apply there with their CV; applications appear under Candidates with source Careers Page.</p>
              </>
            ) : (
              <>
                <p className="mb-2 text-[12px] text-[var(--color-text-muted)]">Not published yet. Publishing gives the job a public page with an application form.</p>
                <Button type="button" disabled={busy === "publish"} onClick={publish}><Globe size={14} /> {busy === "publish" ? "Publishing…" : "Publish on Careers Page"}</Button>
              </>
            )}
          </div>
          <div className="rounded-lg border border-[var(--color-border)] p-3">
            <p className="mb-2 font-medium text-[var(--color-text)]">Share</p>
            <div className="flex flex-wrap gap-2">{share.map(([name, url]) => <a key={name} href={url} target="_blank" rel="noreferrer"><Button type="button" variant="secondary">{name}</Button></a>)}</div>
            {!link && <p className="mt-2 text-[11px] text-[var(--color-text-faint)]">Publish on the careers page to share a link candidates can apply through (LinkedIn needs it).</p>}
          </div>
          <div className="rounded-lg border border-[var(--color-border)] p-3">
            <p className="mb-1 font-medium text-[var(--color-text)]">Posted On</p>
            <p className="mb-2 text-[11px] text-[var(--color-text-faint)]">Tick each job board once you've posted it there, so the team knows where it's live.</p>
            <div className="grid grid-cols-2 gap-1.5">
              {BOARDS.map((b) => { const hit = boards.find((x) => x.board === b); return (
                <label key={b} className="flex items-start gap-2 text-[12px] text-[var(--color-text-muted)]"><input type="checkbox" className="mt-0.5" checked={Boolean(hit)} onChange={() => toggleBoard(b)} /><span>{b}{hit && <span className="block text-[10.5px] text-[var(--color-text-faint)]">{dmy(hit.on)}</span>}</span></label>
              ); })}
            </div>
          </div>
        </div>
        <div className="space-y-2 lg:col-span-3">
          <div className="flex items-center justify-between"><p className="font-medium text-[var(--color-text)]">Job Post</p><Button type="button" variant="secondary" onClick={() => copy(post, "Job post")}><Copy size={13} /> Copy</Button></div>
          <p className="text-[11px] text-[var(--color-text-faint)]">Ready to paste into Naukri, Indeed, LinkedIn Jobs or a WhatsApp group. Edit the opening to change the description.</p>
          <Async state={full}>{() => <textarea readOnly rows={18} className={`${inputCls} !text-[12.5px]`} value={post} />}</Async>
        </div>
      </div>
      {msg && <div className="mt-4"><Notice tone={msg.ok ? "info" : "error"}>{msg.text}</Notice></div>}
    </Modal>
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
        <Link to="/hr/recruitment/interviews?tab=rounds" className="text-[11px] text-[var(--color-red-hover)] hover:underline" target="_blank">Manage Rounds</Link>
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
  const ai = useAsync(() => getCommsSettings().then((s) => Boolean(s && Number(s.ai_enabled))).catch(() => false), []);
  const [notes, setNotes] = useState("");
  const [writing, setWriting] = useState(false);
  const [jdMsg, setJdMsg] = useState(null);

  // A description from the form's title, skills, experience, location and type (plus any notes): Claude when the
  // Administrator has switched AI on, otherwise a structured template draft. HR reviews it before saving.
  async function writeDescription() {
    setJdMsg(null);
    if (!f.job_title.trim() && !f.custom_skills.trim()) return setJdMsg({ ok: false, text: "Fill in the job title and key skills first." });
    if (desc && !(await confirmDialog({ title: "Replace the Description?", message: "The current job description will be replaced with a new draft.", confirmLabel: "Replace" }))) return;
    const details = { title: f.job_title, designation: f.designation, company: f.company, department: f.department, location: f.location, employment_type: f.employment_type, experience: f.custom_experience, keywords: f.custom_skills, notes,
      salary: f.publish_salary_range && (f.lower_range || f.upper_range) ? `${f.lower_range}–${f.upper_range} ${f.currency} per ${f.salary_per}` : "" };
    if (!ai.data) {
      setF((v) => ({ ...v, description: templateJd(details) }));
      return setJdMsg({ ok: true, text: "Draft written from your keywords - edit it before saving. (AI writing can be switched on by the Administrator in Admin › Communication.)" });
    }
    setWriting(true);
    try {
      const r = await generateJdWithAi(details);
      setF((v) => ({ ...v, description: r.text }));
      setJdMsg({ ok: true, text: "Written by AI - review and edit it before saving." });
    } catch (x) {
      setJdMsg({ ok: false, text: commsError(x, errMsg, "The AI couldn't write the description.") });
    }
    setWriting(false);
  }

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
          <Field label="Job Title"><input required className={inputCls} value={f.job_title} onChange={set("job_title")} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <LinkField label="Designation" linkDoctype="Designation" value={f.designation} onChange={(v) => setF({ ...f, designation: v })} required frappe={frappe} />
            <LinkField label="Department" linkDoctype="Department" value={f.department} onChange={(v) => setF({ ...f, department: v })} frappe={frappe} />
            <LinkField label="Company" linkDoctype="Company" value={f.company} onChange={(v) => setF({ ...f, company: v })} required frappe={frappe} />
            <LinkField label="Location (Branch)" linkDoctype="Branch" value={f.location} onChange={(v) => setF({ ...f, location: v })} frappe={frappe} />
            <LinkField label="Employment Type" linkDoctype="Employment Type" value={f.employment_type} onChange={(v) => setF({ ...f, employment_type: v })} frappe={frappe} />
            <Field label="Vacancies"><input type="number" min="1" className={inputCls} value={f.vacancies} onChange={set("vacancies")} /></Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Experience"><input className={inputCls} value={f.custom_experience} onChange={set("custom_experience")} placeholder="e.g. 4–7 years" /></Field>
            <DateField label="Applications Close On" value={f.closes_on} onChange={(v) => setF({ ...f, closes_on: v })} />
          </div>
          <Field label="Key Skills" hint="Comma separated"><input className={inputCls} value={f.custom_skills} onChange={set("custom_skills")} /></Field>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Salary From"><input type="number" min="0" className={inputCls} value={f.lower_range} onChange={set("lower_range")} /></Field>
            <Field label="Salary To"><input type="number" min="0" className={inputCls} value={f.upper_range} onChange={set("upper_range")} /></Field>
            <Field label="Per"><select className={inputCls} value={f.salary_per} onChange={set("salary_per")}><option>Year</option><option>Month</option></select></Field>
          </div>
          <label className="flex items-center gap-2 text-[12px] text-[var(--color-text-muted)]"><input type="checkbox" checked={f.publish} onChange={(e) => setF({ ...f, publish: e.target.checked })} /> Publish on the careers page</label>
          <label className="flex items-center gap-2 text-[12px] text-[var(--color-text-muted)]"><input type="checkbox" checked={f.publish_salary_range} onChange={(e) => setF({ ...f, publish_salary_range: e.target.checked })} /> Show the salary range publicly</label>
        </div>
        <div className="space-y-3">
          <div className="space-y-2 rounded-lg border border-[var(--color-border)] p-3">
            <div className="flex flex-wrap items-end gap-2">
              <div className="min-w-[12rem] flex-1"><Field label="Notes for the Description (Optional)"><input className={inputCls} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. client-facing, night shift, travel 20%" /></Field></div>
              <Button type="button" variant="secondary" disabled={writing || ai.loading} onClick={writeDescription}><Sparkles size={14} /> {writing ? "Writing…" : ai.data ? "Generate With AI" : "Generate Draft"}</Button>
            </div>
            <p className="text-[11px] text-[var(--color-text-faint)]">Uses the job title, key skills, experience, location and employment type above.</p>
            {jdMsg && <Notice tone={jdMsg.ok ? "info" : "error"}>{jdMsg.text}</Notice>}
          </div>
          <Field label="Job Description"><textarea rows={12} className={inputCls} value={desc} onChange={set("description")} placeholder="Responsibilities, must-haves, nice-to-haves…" /></Field>
          <div>
            <span className="mb-1.5 block text-[12px] text-[var(--color-text-muted)]">Interview Rounds, in Order</span>
            <RoundsPicker value={f.rounds} onChange={(rounds) => setF({ ...f, rounds })} designation={f.designation} />
          </div>
          <p className="text-[11px] text-[var(--color-text-faint)]">Offers can only be sent once every round here is Cleared, unless an HR override reason is given. Use Post Job on the openings list to share it and track where it is posted.</p>
        </div>
        {err && <div className="lg:col-span-2"><Notice>{err}</Notice></div>}
        <div className="flex justify-end gap-2 lg:col-span-2"><Button type="button" variant="ghost" onClick={onClose}>Cancel</Button><Button type="submit" disabled={busy}>{busy ? "Saving…" : o.name ? "Save" : "Create Opening"}</Button></div>
      </form>
    </Modal>
  );
}
