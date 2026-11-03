// Interviews across all openings (upcoming, awaiting a decision, completed) and the interview-round master:
// each round has its skills scorecard and default interviewers.
import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { CalendarClock, Gavel, Pencil, Plus, Trash2 } from "lucide-react";
import { frappe } from "../../../lib/api/frappeClient";
import { Button, LinkField } from "../../../components/ui/primitives";
import { Async, Field, Grid, inputCls, Modal, Notice, PageHeader, Panel, Tabs } from "../../../components/employee/EmployeeShell";
import { dmy, errMsg, isoDate, useAsync } from "../../../lib/employeePortal";
import { feedbackFor, fmtTime, interviewersOf, isClosedStage, listApplicants, listInterviews, listOpenings, listRounds, listUsers, saveRound, stageOf, toStars } from "../../../lib/recruitment";
import { candidateUrl, DecideModal, IcsButton, Rating, ScheduleModal, SetupHint, StageBadge, Stars } from "./shared";
import { alertDialog, confirmDialog } from "../../../components/ui/dialogs";

export default function Interviews() {
  const [params, setParams] = useSearchParams();
  const tab = params.get("tab") || "upcoming";
  const data = useAsync(async () => {
    const list = await listInterviews();
    const names = list.map((i) => i.name);
    const [panel, fb, apps] = await Promise.all([interviewersOf(names).catch(() => ({})), feedbackFor(names).catch(() => ({})), listApplicants([["name", "in", [...new Set(list.map((i) => i.job_applicant))]]]).catch(() => [])]);
    const appMap = Object.fromEntries(apps.map((a) => [a.name, a]));
    return list.map((i) => ({ ...i, panel: panel[i.name] || [], feedback: fb[i.name] || [], applicant: appMap[i.job_applicant] }));
  }, []);
  const [modal, setModal] = useState(null);
  const today = isoDate();

  const groups = useMemo(() => {
    const all = data.data || [];
    const upcoming = all.filter((i) => i.docstatus === 0 && i.scheduled_on >= today).sort((a, b) => `${a.scheduled_on}${a.from_time}`.localeCompare(`${b.scheduled_on}${b.from_time}`));
    const decide = all.filter((i) => i.docstatus === 0 && i.scheduled_on < today);
    const done = all.filter((i) => i.docstatus === 1);
    return { upcoming, decide, done };
  }, [data.data, today]);

  const columns = [
    { key: "when", label: "When", render: (i) => <span>{dmy(i.scheduled_on)}<span className="block text-[11px] text-[var(--color-text-faint)]">{fmtTime(i.from_time)}–{fmtTime(i.to_time)}{i.custom_mode ? ` · ${i.custom_mode}` : ""}</span></span> },
    { key: "cand", label: "Candidate", render: (i) => <Link to={candidateUrl(i.job_applicant)} className="hover:underline">{i.applicant?.applicant_name || i.job_applicant}</Link> },
    { key: "interview_round", label: "Round" },
    { key: "panel", label: "Panel", render: (i) => <span className="text-[11.5px]">{i.panel.join(", ") || "—"}</span> },
    { key: "fb", label: "Feedback", render: (i) => `${i.feedback.length}/${i.panel.length || "?"}` },
    { key: "avg", label: "Avg", render: (i) => <Rating fraction={i.average_rating} /> },
    { key: "status", label: "Result", render: (i) => (i.docstatus === 1 ? <span className={i.status === "Cleared" ? "text-[var(--color-green)]" : "text-[var(--color-red-hover)]"}>{i.status}</span> : <span className="text-[var(--color-text-muted)]">{i.status}</span>) },
    { key: "_a", label: "", render: (i) => i.docstatus === 0 ? (
      <div className="flex justify-end gap-1">
        <IcsButton interview={i} applicantName={i.applicant?.applicant_name} />
        {i.applicant && <button type="button" title="Reschedule" onClick={() => setModal({ kind: "reschedule", interview: i })} className="rounded p-1 text-[var(--color-text-muted)] hover:bg-[var(--color-surface-2)]"><Pencil size={14} /></button>}
        <Button variant="secondary" className="!px-2 !py-1 text-[11px]" onClick={() => setModal({ kind: "decide", interview: i })}><Gavel size={12} /> Decide</Button>
      </div>
    ) : null },
  ];

  return (
    <div className="space-y-5">
      <PageHeader icon={CalendarClock} title="Interviews" subtitle="Schedule interviews for any candidate, then decide once the panel has given feedback" actions={<Button onClick={() => setModal({ kind: "new" })}><Plus size={14} /> Schedule Interview</Button>} />
      <SetupHint />
      <Tabs value={tab} onChange={(t) => setParams({ tab: t })} tabs={[
        { id: "upcoming", label: "Upcoming", count: groups.upcoming.length },
        { id: "decide", label: "Awaiting Decision", count: groups.decide.length },
        { id: "done", label: "Completed", count: groups.done.length },
        { id: "rounds", label: "Rounds & Scorecards" },
      ]} />
      {tab === "rounds" ? <Rounds /> : (
        <Panel>
          <Async state={data}>{() => <Grid rows={groups[tab] || []} columns={columns} empty={tab === "decide" ? "Nothing waiting for a decision." : "No interviews here."} />}</Async>
        </Panel>
      )}
      {modal?.kind === "decide" && <DecideModal interview={modal.interview} applicant={modal.interview.applicant} onClose={() => setModal(null)} onSaved={() => { setModal(null); data.reload(); }} />}
      {modal?.kind === "new" && <NewInterview onClose={() => setModal(null)} onSaved={() => { setModal(null); data.reload(); setParams({ tab: "upcoming" }); }} />}
      {modal?.kind === "reschedule" && <ScheduleModal applicant={modal.interview.applicant} interview={modal.interview} onClose={() => setModal(null)} onSaved={() => { setModal(null); data.reload(); }} />}
    </div>
  );
}

/**
 * Schedule an interview from this page: pick the candidate, then the same form as on their profile (round from the
 * opening, date and time, mode and link, panel with clash check). A candidate not yet in Interview moves there.
 */
function NewInterview({ onClose, onSaved }) {
  const apps = useAsync(() => listApplicants(), []);
  const openings = useAsync(() => listOpenings(), []);
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState("");
  const chosen = useAsync(async () => {
    if (!picked) return null;
    const applicant = await frappe.getDoc("Job Applicant", picked);
    const opening = applicant.job_title ? await frappe.getDoc("Job Opening", applicant.job_title).catch(() => null) : null;
    return { applicant, opening };
  }, [picked]);

  if (picked && chosen.data) return <ScheduleModal applicant={chosen.data.applicant} opening={chosen.data.opening} onClose={onClose} onSaved={onSaved} />;

  const titles = Object.fromEntries((openings.data || []).map((o) => [o.name, o.job_title]));
  const t = q.trim().toLowerCase();
  const rows = (apps.data || [])
    .filter((a) => !isClosedStage(stageOf(a)))
    .filter((a) => !t || [a.applicant_name, a.email_id, a.phone_number, titles[a.job_title]].some((v) => String(v || "").toLowerCase().includes(t)));

  return (
    <Modal title="Schedule Interview" onClose={onClose} wide>
      <div className="space-y-3">
        <Field label="Candidate" hint="Candidates still in process. Not listed? Add them under Candidates first.">
          <input autoFocus className={inputCls} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, email, phone or opening…" />
        </Field>
        {chosen.error && <Notice>{errMsg(chosen.error, "Couldn't open this candidate.")}</Notice>}
        <Async state={apps}>
          {() => rows.length === 0 ? <p className="py-4 text-center text-[13px] text-[var(--color-text-muted)]">No candidates match.</p> : (
            <ul className="max-h-80 divide-y divide-[var(--color-border)] overflow-y-auto rounded-md border border-[var(--color-border)]">
              {rows.map((a) => (
                <li key={a.name}>
                  <button type="button" disabled={Boolean(picked) && chosen.loading} onClick={() => setPicked(a.name)} className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left text-[13px] hover:bg-[var(--color-surface-2)] disabled:opacity-60">
                    <span className="min-w-0"><span className="block font-medium text-[var(--color-text)]">{a.applicant_name}</span><span className="block truncate text-[11px] text-[var(--color-text-faint)]">{titles[a.job_title] || "Talent pool"}{a.email_id ? ` · ${a.email_id}` : ""}</span></span>
                    <span className="flex shrink-0 items-center gap-2"><StageBadge stage={stageOf(a)} />{picked === a.name && chosen.loading && <span className="text-[11px] text-[var(--color-text-muted)]">Opening…</span>}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Async>
        <div className="flex justify-between gap-2"><Link to="/hr/recruitment/candidates?add=1" className="self-center text-[12px] text-[var(--color-red-hover)] hover:underline">Add a Candidate</Link><Button type="button" variant="ghost" onClick={onClose}>Cancel</Button></div>
      </div>
    </Modal>
  );
}

function Rounds() {
  const rounds = useAsync(listRounds, []);
  const [modal, setModal] = useState(null);
  async function remove(r) {
    if (!(await confirmDialog(`Delete the round "${r.round_name}"? Rounds already used in interviews can't be deleted.`))) return;
    try {
      await frappe.deleteDoc("Interview Round", r.name);
      rounds.reload();
    } catch (e) {
      alertDialog({ tone: "error", message: errMsg(e, "Couldn't delete this round - it's probably used by interviews.") });
    }
  }
  return (
    <Panel title="Interview Rounds" hint="Reusable rounds with a 1–5 skill scorecard and default interviewers. Pick and order them per opening." action={<Button onClick={() => setModal({})}><Plus size={14} /> New Round</Button>}>
      <Async state={rounds}>
        {(list) => <Grid rows={list} empty="No rounds yet - create e.g. Technical 1, Technical 2, HR." columns={[
          { key: "round_name", label: "Round", render: (r) => <b className="font-medium">{r.round_name}</b> },
          { key: "designation", label: "For Role", render: (r) => r.designation || "Any" },
          { key: "skills", label: "Scorecard Skills", render: (r) => <span className="text-[11.5px]">{r.skills.join(", ") || "—"}</span> },
          { key: "interviewers", label: "Default Panel", render: (r) => <span className="text-[11.5px]">{r.interviewers.join(", ") || "—"}</span> },
          { key: "expected", label: "Pass Mark", render: (r) => (r.expected_average_rating ? <Stars value={toStars(r.expected_average_rating)} size={11} /> : "—") },
          { key: "_a", label: "", render: (r) => <div className="flex justify-end gap-1"><button type="button" onClick={() => setModal({ round: r })} className="rounded p-1 text-[var(--color-text-muted)] hover:bg-[var(--color-surface-2)]"><Pencil size={14} /></button><button type="button" onClick={() => remove(r)} className="rounded p-1 text-[var(--color-text-muted)] hover:text-[var(--color-red-hover)]"><Trash2 size={14} /></button></div> },
        ]} />}
      </Async>
      {modal && <RoundModal round={modal.round} onClose={() => setModal(null)} onSaved={() => { setModal(null); rounds.reload(); }} />}
    </Panel>
  );
}

function RoundModal({ round, onClose, onSaved }) {
  const users = useAsync(listUsers, []);
  const [f, setF] = useState({ round_name: round?.round_name || "", designation: round?.designation || "", interview_type: round?.interview_type || "", skills: (round?.skills || []).join(", "), interviewers: round?.interviewers || [], expected: toStars(round?.expected_average_rating) || 3 });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const toggle = (u) => setF((v) => ({ ...v, interviewers: v.interviewers.includes(u) ? v.interviewers.filter((x) => x !== u) : [...v.interviewers, u] }));
  async function submit(e) {
    e.preventDefault();
    const skills = f.skills.split(",").map((s) => s.trim()).filter(Boolean);
    if (!skills.length) return setErr("Add at least one skill for the scorecard.");
    setBusy(true);
    setErr("");
    try {
      await saveRound(round, { ...f, skills });
      onSaved();
    } catch (x) {
      setErr(errMsg(x, "Couldn't save the round."));
      setBusy(false);
    }
  }
  return (
    <Modal title={round ? `Edit ${round.round_name}` : "New interview round"} onClose={onClose} wide>
      <form onSubmit={submit} className="space-y-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Round Name"><input required disabled={Boolean(round)} className={inputCls} value={f.round_name} onChange={(e) => setF({ ...f, round_name: e.target.value })} placeholder="e.g. Technical 1" /></Field>
          <LinkField label="Only for Designation (Optional)" linkDoctype="Designation" value={f.designation} onChange={(v) => setF({ ...f, designation: v })} frappe={frappe} />
        </div>
        <Field label="Scorecard Skills" hint="Comma separated - each is rated 1–5 by every interviewer. New skills are created automatically."><input className={inputCls} value={f.skills} onChange={(e) => setF({ ...f, skills: e.target.value })} placeholder="Oracle Fusion SCM, SQL, Communication" /></Field>
        <Field label="Pass Mark (Average Stars)"><Stars value={f.expected} onChange={(n) => setF({ ...f, expected: n })} /></Field>
        <Field label="Default Interviewers">
          <div className="max-h-40 overflow-y-auto rounded-md border border-[var(--color-border-strong)] bg-[var(--color-surface-2)] p-2">
            {(users.data || []).map((u) => <label key={u.name} className="flex items-center gap-2 py-0.5 text-[12.5px] text-[var(--color-text)]"><input type="checkbox" checked={f.interviewers.includes(u.name)} onChange={() => toggle(u.name)} /> {u.full_name || u.name}</label>)}
          </div>
        </Field>
        {err && <Notice>{err}</Notice>}
        <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={onClose}>Cancel</Button><Button type="submit" disabled={busy}>{busy ? "Saving…" : "Save Round"}</Button></div>
      </form>
    </Modal>
  );
}
