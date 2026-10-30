// Interviews across all openings (upcoming, awaiting a decision, completed) and the interview-round master:
// each round has its skills scorecard and default interviewers.
import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { CalendarClock, Gavel, Pencil, Plus, Trash2 } from "lucide-react";
import { frappe } from "../../../lib/api/frappeClient";
import { Button, LinkField } from "../../../components/ui/primitives";
import { Async, Field, Grid, inputCls, Modal, Notice, PageHeader, Panel, Tabs } from "../../../components/employee/EmployeeShell";
import { dmy, errMsg, isoDate, useAsync } from "../../../lib/employeePortal";
import { feedbackFor, fmtTime, interviewersOf, listApplicants, listInterviews, listRounds, listUsers, saveRound, toStars } from "../../../lib/recruitment";
import { candidateUrl, DecideModal, IcsButton, Rating, ScheduleModal, SetupHint, Stars } from "./shared";
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
      <PageHeader icon={CalendarClock} title="Interviews" subtitle="Schedule from a candidate's profile or the pipeline board; decide here once the panel has given feedback" />
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
      {modal?.kind === "reschedule" && <ScheduleModal applicant={modal.interview.applicant} interview={modal.interview} onClose={() => setModal(null)} onSaved={() => { setModal(null); data.reload(); }} />}
    </div>
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
