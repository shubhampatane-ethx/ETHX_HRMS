// "My interviews" for anyone on an interview panel (employee portal, HR or Project Manager workspace):
// see the candidate and CV, add the slot to Outlook, and submit the 1-5 skill scorecard.
import { useState } from "react";
import { CalendarCheck, ClipboardCheck, ExternalLink } from "lucide-react";
import { frappe } from "../../../lib/api/frappeClient";
import { Button } from "../../../components/ui/primitives";
import { Async, chipCls, Empty, Field, Grid, inputCls, Modal, Notice, PageHeader, Panel } from "../../../components/employee/EmployeeShell";
import { dmy, errMsg, isoDate, useAsync } from "../../../lib/employeePortal";
import { expectedSkills, fmtTime, myInterviews, submitFeedback } from "../../../lib/recruitment";
import { useAuth } from "../../../context/AuthContext";
import { IcsButton, Stars } from "./shared";

async function loadMine(user) {
  const list = await myInterviews(user);
  // Candidate names: readable when HR shared the profile with the interviewer.
  const names = {};
  await Promise.all([...new Set(list.map((i) => i.job_applicant))].map(async (id) => {
    try { names[id] = (await frappe.getDoc("Job Applicant", id)).applicant_name; } catch { names[id] = id; }
  }));
  return list.map((i) => ({ ...i, applicantName: names[i.job_applicant] }));
}

export default function MyInterviews() {
  const { user } = useAuth();
  // Only interviewers (and HR, who can read every interview) can be on a panel - skip the lookup for everyone else.
  const canInterview = user.email === "Administrator" || (user.erpRoles || []).some((r) => ["Interviewer", "HR User", "HR Manager", "System Manager"].includes(r));
  const data = useAsync(() => (canInterview ? loadMine(user.email) : Promise.resolve([])), [user.email, canInterview]);
  const [filter, setFilter] = useState("todo");
  const [open, setOpen] = useState(null);
  const today = isoDate();
  const rows = (data.data || []).filter((i) => (filter === "todo" ? !i.myFeedback && i.docstatus === 0 : filter === "done" ? i.myFeedback || i.docstatus === 1 : true))
    .sort((a, b) => `${a.scheduled_on}${a.from_time}`.localeCompare(`${b.scheduled_on}${b.from_time}`));

  return (
    <div className="space-y-5">
      <PageHeader icon={ClipboardCheck} title="My interviews" subtitle="Interviews you're on the panel for - give your scorecard after each one" />
      <Panel>
        <div className="mb-4 flex gap-2">{[["todo", "Feedback Due"], ["done", "Done"], ["all", "All"]].map(([v, l]) => <button key={v} type="button" onClick={() => setFilter(v)} className={chipCls(filter === v)}>{l}</button>)}</div>
        <Async state={data}>
          {() => rows.length === 0 ? <Empty icon={CalendarCheck} text={(data.data || []).length === 0 ? "You're not on any interview panel yet." : filter === "todo" ? "No feedback due." : "Nothing here."} /> : <Grid rows={rows} columns={[
            { key: "when", label: "When", render: (i) => <span className={i.scheduled_on === today ? "font-medium text-[var(--color-red-hover)]" : ""}>{dmy(i.scheduled_on)} {fmtTime(i.from_time)}–{fmtTime(i.to_time)}</span> },
            { key: "applicantName", label: "Candidate" },
            { key: "interview_round", label: "Round" },
            { key: "where", label: "Where", render: (i) => (i.custom_meeting_link ? (/^https?:/.test(i.custom_meeting_link) ? <a href={i.custom_meeting_link} target="_blank" rel="noreferrer" className="text-[var(--color-red-hover)] hover:underline">Join <ExternalLink size={10} className="inline" /></a> : i.custom_meeting_link) : i.custom_mode || "—") },
            { key: "cv", label: "CV", render: (i) => (i.resume_link ? <a href={i.resume_link} target="_blank" rel="noreferrer" className="text-[var(--color-red-hover)] hover:underline">Open</a> : "—") },
            { key: "mine", label: "My feedback", render: (i) => (i.myFeedback ? <span className={i.myFeedback.result === "Cleared" ? "text-[var(--color-green)]" : "text-[var(--color-red-hover)]"}>{i.myFeedback.result}</span> : i.docstatus === 1 ? "Closed" : "Due") },
            { key: "_a", label: "", render: (i) => <div className="flex justify-end gap-1"><IcsButton interview={i} applicantName={i.applicantName} />{!i.myFeedback && i.docstatus === 0 && <Button className="!px-2 !py-1 text-[11px]" onClick={() => setOpen(i)} disabled={i.scheduled_on > today} title={i.scheduled_on > today ? "Available on the interview day" : undefined}>Give feedback</Button>}</div> },
          ]} />}
        </Async>
      </Panel>
      {open && <FeedbackModal interview={open} me={user.email} onClose={() => setOpen(null)} onSaved={() => { setOpen(null); data.reload(); }} />}
    </div>
  );
}

function FeedbackModal({ interview, me, onClose, onSaved }) {
  const skills = useAsync(() => expectedSkills(interview.interview_round), [interview.interview_round]);
  const [ratings, setRatings] = useState({});
  const [result, setResult] = useState("");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  async function submit(e) {
    e.preventDefault();
    const list = (skills.data || []).map((skill) => ({ skill, stars: ratings[skill] || 0 }));
    if (list.some((s) => !s.stars)) return setErr("Rate every skill (1–5 stars).");
    if (!result) return setErr("Choose Cleared or Rejected.");
    setBusy(true);
    setErr("");
    try {
      await submitFeedback({ interview, interviewer: me, skills: list, result, feedback: text.trim() });
      onSaved();
    } catch (x) {
      setErr(errMsg(x, "Couldn't submit the feedback."));
      setBusy(false);
    }
  }
  return (
    <Modal title={`${interview.interview_round} · ${interview.applicantName}`} onClose={onClose} wide>
      <form onSubmit={submit} className="space-y-4">
        <Async state={skills}>
          {(list) => list.length === 0 ? <Notice tone="info">This round has no skills on its scorecard - ask HR to add them under Interviews › Rounds.</Notice> : (
            <div className="space-y-2">
              {list.map((s) => <div key={s} className="flex items-center justify-between gap-3 rounded-md border border-[var(--color-border)] px-3 py-2 text-[13px] text-[var(--color-text)]"><span>{s}</span><Stars value={ratings[s] || 0} onChange={(n) => setRatings({ ...ratings, [s]: n })} size={18} /></div>)}
            </div>
          )}
        </Async>
        <div className="flex gap-2">{["Cleared", "Rejected"].map((r) => <button key={r} type="button" onClick={() => setResult(r)} className={`rounded-md border px-3 py-1.5 text-[12px] ${result === r ? "border-[var(--color-red)] bg-[var(--color-red-wash)] text-[var(--color-text)]" : "border-[var(--color-border)] text-[var(--color-text-muted)]"}`}>{r === "Cleared" ? "Recommend (Cleared)" : "Don't recommend (Rejected)"}</button>)}</div>
        <Field label="Comments"><textarea rows={4} className={inputCls} value={text} onChange={(e) => setText(e.target.value)} placeholder="Strengths, concerns, anything HR should know" /></Field>
        <p className="text-[11px] text-[var(--color-text-faint)]">Submitted feedback can't be edited. HR sees all panel scorecards side by side before deciding.</p>
        {err && <Notice>{err}</Notice>}
        <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={onClose}>Cancel</Button><Button type="submit" disabled={busy || !(skills.data || []).length}>{busy ? "Submitting…" : "Submit feedback"}</Button></div>
      </form>
    </Modal>
  );
}
