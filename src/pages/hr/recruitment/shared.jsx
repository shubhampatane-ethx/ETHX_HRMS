// Recruitment UI pieces used by several screens: stage badge, stars, candidate form, stage moves,
// interview scheduling / decision, offers and hiring.
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, CalendarPlus, Star } from "lucide-react";
import { frappe } from "../../../lib/api/frappeClient";
import { Button, DateField, LinkField } from "../../../components/ui/primitives";
import { Field, inputCls, Modal, Notice } from "../../../components/employee/EmployeeShell";
import { dmy, errMsg, isoDate, nowStamp, useAsync } from "../../../lib/employeePortal";
import {
  addComment, ALL_STAGES, createEmployee, decideInterview, downloadIcs, emailDocument, employeeForApplicant, feedbackFor, findSamePerson,
  fmtTime, interviewClashes, interviewersOf, isoPlus, listRounds, listUsers, moveStage, onboardingForApplicant, prepareInterviewers,
  recordJoining, recordResponse, regretEmail, roundsOf, roundsStatus, saveOffer, scheduleInterview, stageOf, STAGE_TONE, startOnboarding, toStars,
} from "../../../lib/recruitment";
import { recruitmentReady } from "../../../lib/recruitmentSetup";
import { useAuth } from "../../../context/AuthContext";

export const enc = encodeURIComponent;
export const candidateUrl = (name) => `/hr/recruitment/candidates/${enc(name)}`;

/* ------------------------------- small bits ------------------------------- */

export function StageBadge({ stage }) {
  const tone = STAGE_TONE[stage] || "var(--color-text-muted)";
  return <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium" style={{ background: `color-mix(in srgb, ${tone} 16%, transparent)`, color: tone }}>{stage}</span>;
}

export function Stars({ value, onChange, size = 14 }) {
  const v = Number(value) || 0;
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`${v} of 5`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button key={n} type="button" disabled={!onChange} onClick={() => onChange?.(n)} className={onChange ? "cursor-pointer" : "cursor-default"} title={onChange ? `${n} of 5` : undefined}>
          <Star size={size} className={n <= Math.round(v) ? "fill-[var(--color-amber)] text-[var(--color-amber)]" : "text-[var(--color-text-faint)]"} />
        </button>
      ))}
    </span>
  );
}

export function Rating({ fraction }) {
  const s = toStars(fraction);
  return s == null || s === 0 ? <span className="text-[var(--color-text-faint)]">—</span> : <span className="inline-flex items-center gap-1"><Stars value={s} size={12} /><span className="text-[11px] text-[var(--color-text-muted)]">{s}</span></span>;
}

/** Shown when the Administrator hasn't run the one-time recruitment setup yet. */
export function SetupHint() {
  const ready = useAsync(recruitmentReady, []);
  const { user } = useAuth();
  if (ready.loading || ready.data) return null;
  return (
    <Notice>
      Recruitment isn't fully set up yet (pipeline stages, CTC, offer approval and retention fields are missing).{" "}
      {user?.email === "Administrator" ? <Link to="/hr/recruitment/setup" className="underline">Run the one-time setup</Link> : "Ask the Administrator to open HR › Recruitment › Setup and run it."}
    </Notice>
  );
}

export function Row({ children }) {
  return <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">{children}</div>;
}

function Buttons({ onClose, busy, label, busyLabel = "Saving…", disabled }) {
  return (
    <div className="flex justify-end gap-2 pt-1">
      <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
      <Button type="submit" disabled={busy || disabled}>{busy ? busyLabel : label}</Button>
    </div>
  );
}

/** Wraps an async submit with busy/error state. */
function useSubmit() {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const run = async (fn, fallback) => {
    setBusy(true);
    setErr("");
    try {
      await fn();
    } catch (x) {
      setErr(x?.friendly || errMsg(x, fallback));
      setBusy(false);
    }
  };
  return { busy, err, setErr, run };
}

/* -------------------------------- candidate -------------------------------- */

/** Add or edit a candidate. New candidates are checked for duplicates by email and phone. */
export function CandidateModal({ applicant, openings, defaultOpening, onClose, onSaved }) {
  const edit = Boolean(applicant);
  const a = applicant || {};
  const [f, setF] = useState({
    applicant_name: a.applicant_name || "", email_id: a.email_id || "", phone_number: a.phone_number || "", job_title: a.job_title || defaultOpening || "",
    source: a.source || "", source_name: a.source_name || "", custom_current_company: a.custom_current_company || "", custom_total_experience: a.custom_total_experience ?? "",
    custom_notice_days: a.custom_notice_days ?? "", custom_location: a.custom_location || "", custom_skills: a.custom_skills || "", custom_current_ctc: a.custom_current_ctc ?? "",
    custom_expected_ctc: a.custom_expected_ctc ?? "", resume_link: a.resume_link || "", cover_letter: a.cover_letter || "", consent: Boolean(a.custom_consent),
  });
  const [file, setFile] = useState(null);
  const [dupes, setDupes] = useState(null);
  const { busy, err, setErr, run } = useSubmit();
  const set = (k) => (e) => setF((v) => ({ ...v, [k]: e.target.value }));
  const openOnes = (openings || []).filter((o) => o.status === "Open" || o.name === f.job_title);

  async function checkDupes() {
    if (edit || (!f.email_id && !f.phone_number)) return setDupes(null);
    try { setDupes(await findSamePerson({ email: f.email_id, phone: f.phone_number })); } catch { setDupes(null); }
  }

  function submit(e) {
    e.preventDefault();
    if (!edit && !f.consent) return setErr("Record the candidate's consent to process their data before adding them.");
    const sameOpening = (dupes || []).find((d) => d.job_title && d.job_title === f.job_title);
    if (!edit && sameOpening) return setErr(`${sameOpening.applicant_name} has already applied for this opening.`);
    run(async () => {
      const opening = openOnes.find((o) => o.name === f.job_title);
      const num = (v) => (v === "" || v == null ? null : Number(v));
      const doc = {
        applicant_name: f.applicant_name.trim(), email_id: f.email_id.trim(), phone_number: f.phone_number.trim() || null, job_title: f.job_title || null,
        designation: opening?.designation || a.designation || null, source: f.source || null, source_name: f.source === "Employee Referral" ? f.source_name || null : null,
        custom_current_company: f.custom_current_company || null, custom_total_experience: num(f.custom_total_experience), custom_notice_days: num(f.custom_notice_days),
        custom_location: f.custom_location || null, custom_skills: f.custom_skills || null, custom_current_ctc: num(f.custom_current_ctc), custom_expected_ctc: num(f.custom_expected_ctc),
        resume_link: f.resume_link || null, cover_letter: f.cover_letter || null,
      };
      if (!edit) Object.assign(doc, { status: "Open", custom_ethx_stage: "Applied", custom_stage_since: nowStamp(), custom_consent: 1, custom_consent_on: nowStamp() });
      else if (f.consent && !a.custom_consent) Object.assign(doc, { custom_consent: 1, custom_consent_on: nowStamp() });
      const saved = edit ? await frappe.updateDoc("Job Applicant", a.name, doc) : await frappe.createDoc("Job Applicant", doc);
      if (file) {
        const up = await frappe.uploadFile(file, { doctype: "Job Applicant", docname: saved.name, isPrivate: true });
        await frappe.updateDoc("Job Applicant", saved.name, { resume_attachment: up.file_url });
      }
      onSaved(saved);
    }, "Couldn't save the candidate.");
  }

  return (
    <Modal title={edit ? `Edit ${a.applicant_name}` : "Add candidate"} onClose={onClose} wide>
      <form onSubmit={submit} className="space-y-3">
        <Row>
          <Field label="Full name"><input required className={inputCls} value={f.applicant_name} onChange={set("applicant_name")} /></Field>
          <Field label="Opening">
            <select className={inputCls} value={f.job_title} onChange={set("job_title")}>
              <option value="">General / talent pool</option>
              {openOnes.map((o) => <option key={o.name} value={o.name}>{o.job_title}{o.department ? ` · ${o.department}` : ""}</option>)}
            </select>
          </Field>
          <Field label="Email"><input required type="email" className={inputCls} value={f.email_id} onChange={set("email_id")} onBlur={checkDupes} disabled={edit} /></Field>
          <Field label="Phone"><input className={inputCls} value={f.phone_number} onChange={set("phone_number")} onBlur={checkDupes} /></Field>
        </Row>
        {dupes?.length > 0 && (
          <Notice tone="info">
            <AlertTriangle size={12} className="mr-1 inline" /> Same person found: {dupes.map((d) => <span key={d.name} className="mr-2"><Link className="underline" to={candidateUrl(d.name)} target="_blank">{d.applicant_name}</Link> ({d.job_title || "no opening"} · {stageOf(d)})</span>)}
            A new application for a different opening is fine; the same opening is blocked.
          </Notice>
        )}
        <Row>
          <Field label="Source">
            <select className={inputCls} value={f.source} onChange={set("source")}>
              <option value="">—</option>
              {["Careers Page", "LinkedIn", "Naukri", "Employee Referral", "Agency", "Walk In", "Campaign"].map((s) => <option key={s}>{s}</option>)}
            </select>
          </Field>
          {f.source === "Employee Referral" ? <LinkField label="Referred by (employee)" linkDoctype="Employee" value={f.source_name} onChange={(v) => setF({ ...f, source_name: v })} frappe={frappe} /> : <Field label="Current company"><input className={inputCls} value={f.custom_current_company} onChange={set("custom_current_company")} /></Field>}
        </Row>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Field label="Experience (yrs)"><input type="number" min="0" step="0.5" className={inputCls} value={f.custom_total_experience} onChange={set("custom_total_experience")} /></Field>
          <Field label="Notice (days)"><input type="number" min="0" className={inputCls} value={f.custom_notice_days} onChange={set("custom_notice_days")} /></Field>
          <Field label="Current CTC (₹/yr)"><input type="number" min="0" className={inputCls} value={f.custom_current_ctc} onChange={set("custom_current_ctc")} /></Field>
          <Field label="Expected CTC (₹/yr)"><input type="number" min="0" className={inputCls} value={f.custom_expected_ctc} onChange={set("custom_expected_ctc")} /></Field>
        </div>
        <Row>
          <Field label="Current location"><input className={inputCls} value={f.custom_location} onChange={set("custom_location")} /></Field>
          <Field label="Key skills" hint="Comma separated"><input className={inputCls} value={f.custom_skills} onChange={set("custom_skills")} placeholder="Oracle Fusion, SQL, OIC" /></Field>
        </Row>
        <Row>
          <Field label={a.resume_attachment ? "Replace CV" : "CV (PDF / Word)"}><input type="file" accept=".pdf,.doc,.docx" className={inputCls} onChange={(e) => setFile(e.target.files?.[0] || null)} /></Field>
          <Field label="Or CV / profile link"><input className={inputCls} value={f.resume_link} onChange={set("resume_link")} placeholder="https://" /></Field>
        </Row>
        <Field label="Cover note (optional)"><textarea rows={2} className={inputCls} value={f.cover_letter} onChange={set("cover_letter")} /></Field>
        {(!edit || !a.custom_consent) && (
          <label className="flex items-start gap-2 text-[12px] text-[var(--color-text-muted)]">
            <input type="checkbox" className="mt-0.5" checked={f.consent} onChange={(e) => setF({ ...f, consent: e.target.checked })} />
            The candidate has consented to ETHX processing their personal data for recruitment (DPDP Act 2023). Data is kept for 12 months after the process ends, then anonymised.
          </label>
        )}
        {err && <Notice>{err}</Notice>}
        <Buttons onClose={onClose} busy={busy} label={edit ? "Save" : "Add candidate"} />
      </form>
    </Modal>
  );
}

/* -------------------------------- stage move -------------------------------- */

/** Move to a stage, asking for a reason on exits and offering the regret email on rejection. */
export function MoveStageModal({ applicant, to, opening, onClose, onSaved }) {
  const needsReason = ["Rejected", "Withdrawn", "Hold"].includes(to);
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [regret, setRegret] = useState(to === "Rejected");
  const [warn, setWarn] = useState("");
  const { busy, err, run } = useSubmit();

  function submit(e) {
    e.preventDefault();
    run(async () => {
      await moveStage(applicant, to, { reason: needsReason ? reason.trim() : "", note: note.trim() });
      if (to === "Rejected" && regret) {
        try {
          const m = regretEmail(applicant, opening);
          await emailDocument({ doctype: "Job Applicant", name: applicant.name, to: applicant.email_id, subject: m.subject, message: m.message, printFormat: false });
        } catch (x) {
          setWarn(`Rejected, but the email couldn't be sent: ${errMsg(x, "check the outgoing email settings")}`);
          return;
        }
      }
      onSaved();
    }, "Couldn't move the candidate.");
  }

  return (
    <Modal title={`Move ${applicant.applicant_name} to ${to}`} onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <p className="text-[12px] text-[var(--color-text-muted)]">{ALL_STAGES.find((s) => s.id === to)?.hint}</p>
        {needsReason && <Field label={to === "Hold" ? "Why on hold?" : "Reason"}><textarea required rows={2} className={inputCls} value={reason} onChange={(e) => setReason(e.target.value)} /></Field>}
        <Field label="Note for the timeline (optional)"><input className={inputCls} value={note} onChange={(e) => setNote(e.target.value)} /></Field>
        {to === "Rejected" && <label className="flex items-center gap-2 text-[12px] text-[var(--color-text-muted)]"><input type="checkbox" checked={regret} onChange={(e) => setRegret(e.target.checked)} /> Email a polite regret note to {applicant.email_id}</label>}
        {["Rejected", "Withdrawn", "Hold"].includes(to) && <p className="text-[11px] text-[var(--color-text-faint)]">The candidate's data will be kept for 12 months, then it can be anonymised from Recruitment › Setup.</p>}
        {warn ? <><Notice tone="info">{warn}</Notice><div className="flex justify-end"><Button type="button" onClick={onSaved}>Close</Button></div></> : <>{err && <Notice>{err}</Notice>}<Buttons onClose={onClose} busy={busy} label={`Move to ${to}`} /></>}
      </form>
    </Modal>
  );
}

/* -------------------------------- interviews -------------------------------- */

/** Schedule (or reschedule) an interview: round, panel, time slot, with a clash check on the panel. */
export function ScheduleModal({ applicant, opening, interview, onClose, onSaved }) {
  const rounds = useAsync(listRounds, []);
  const users = useAsync(listUsers, []);
  const existingPanel = useAsync(() => (interview ? interviewersOf([interview.name]).then((m) => m[interview.name] || []) : Promise.resolve(null)), [interview?.name]);
  const configured = roundsOf(opening);
  const [f, setF] = useState({ round: interview?.interview_round || "", date: interview?.scheduled_on || isoPlus(1), from: fmtTime(interview?.from_time) || "11:00", to: fmtTime(interview?.to_time) || "12:00", mode: interview?.custom_mode || "Video call", link: interview?.custom_meeting_link || "", panel: [] });
  const [clashes, setClashes] = useState([]);
  const [problems, setProblems] = useState(null);
  const { busy, err, setErr, run } = useSubmit();

  useEffect(() => { if (existingPanel.data) setF((v) => ({ ...v, panel: existingPanel.data })); }, [existingPanel.data]);

  // Suggest the next configured round not yet scheduled.
  const roundList = useMemo(() => {
    const all = rounds.data || [];
    const fits = all.filter((r) => !r.designation || !applicant.designation || r.designation === applicant.designation);
    return [...configured.map((n) => fits.find((r) => r.name === n)).filter(Boolean), ...fits.filter((r) => !configured.includes(r.name))];
  }, [rounds.data, configured, applicant.designation]);

  function pickRound(name) {
    const r = (rounds.data || []).find((x) => x.name === name);
    setF((v) => ({ ...v, round: name, panel: v.panel.length ? v.panel : r?.interviewers || [] }));
  }
  const togglePanel = (u) => setF((v) => ({ ...v, panel: v.panel.includes(u) ? v.panel.filter((x) => x !== u) : [...v.panel, u] }));

  useEffect(() => {
    let off = false;
    interviewClashes({ date: f.date, from: f.from, to: f.to, interviewers: f.panel, exclude: interview?.name }).then((c) => !off && setClashes(c)).catch(() => {});
    return () => { off = true; };
  }, [f.date, f.from, f.to, f.panel, interview?.name]);

  function submit(e) {
    e.preventDefault();
    if (!f.panel.length) return setErr("Pick at least one interviewer.");
    if (f.to <= f.from) return setErr("The end time must be after the start time.");
    run(async () => {
      await scheduleInterview({ applicant, round: f.round, date: f.date, from: f.from, to: f.to, interviewers: f.panel, mode: f.mode, link: f.link, existing: interview });
      if (interview && (interview.scheduled_on !== f.date || fmtTime(interview.from_time) !== f.from)) {
        try { await addComment("Job Applicant", applicant.name, `${f.round} rescheduled from ${dmy(interview.scheduled_on)} ${fmtTime(interview.from_time)} to ${dmy(f.date)} ${f.from}`); } catch { /* optional */ }
      }
      const p = await prepareInterviewers(f.panel, applicant.name);
      if (p.length) setProblems(p);
      else onSaved();
    }, "Couldn't schedule the interview.");
  }

  if (problems) {
    return (
      <Modal title="Interview Scheduled" onClose={onSaved}>
        <Notice tone="info">The interview is saved, but some interviewers may not be able to open it yet:</Notice>
        <ul className="my-3 list-disc pl-5 text-[12px] text-[var(--color-text-muted)]">{problems.map((p) => <li key={p}>{p}</li>)}</ul>
        <div className="flex justify-end"><Button onClick={onSaved}>OK</Button></div>
      </Modal>
    );
  }

  return (
    <Modal title={`${interview ? "Reschedule" : "Schedule"} Interview · ${applicant.applicant_name}`} onClose={onClose} wide>
      <form onSubmit={submit} className="space-y-3">
        <Field label="Round" hint={configured.length ? `This opening's rounds: ${configured.join(" → ")}` : "No rounds configured for this opening - any round can be used."}>
          <select required className={inputCls} value={f.round} onChange={(e) => pickRound(e.target.value)} disabled={Boolean(interview)}>
            <option value="">Select…</option>
            {roundList.map((r) => <option key={r.name} value={r.name}>{r.round_name}{r.designation ? ` · ${r.designation}` : ""}</option>)}
          </select>
        </Field>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <DateField label="Date" value={f.date} onChange={(v) => setF({ ...f, date: v })} required />
          <Field label="From"><input type="time" required className={inputCls} value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} /></Field>
          <Field label="To"><input type="time" required className={inputCls} value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} /></Field>
        </div>
        <Row>
          <Field label="Mode"><select className={inputCls} value={f.mode} onChange={(e) => setF({ ...f, mode: e.target.value })}>{["Video call", "In person", "Phone"].map((m) => <option key={m}>{m}</option>)}</select></Field>
          <Field label={f.mode === "In person" ? "Location" : "Meeting link"}><input className={inputCls} value={f.link} onChange={(e) => setF({ ...f, link: e.target.value })} placeholder={f.mode === "In person" ? "Office, room" : "Teams / Meet link"} /></Field>
        </Row>
        <Field label="Panel" hint="Interviewers get access to this candidate's profile.">
          <div className="max-h-40 overflow-y-auto rounded-md border border-[var(--color-border-strong)] bg-[var(--color-surface-2)] p-2">
            {(users.data || []).map((u) => (
              <label key={u.name} className="flex items-center gap-2 py-0.5 text-[12.5px] text-[var(--color-text)]">
                <input type="checkbox" checked={f.panel.includes(u.name)} onChange={() => togglePanel(u.name)} /> {u.full_name || u.name} <span className="text-[11px] text-[var(--color-text-faint)]">{u.name}</span>
              </label>
            ))}
            {users.loading && <p className="text-[12px] text-[var(--color-text-muted)]">Loading people…</p>}
          </div>
        </Field>
        {clashes.length > 0 && <Notice tone="info"><AlertTriangle size={12} className="mr-1 inline" />Clash: {clashes.map((c) => `${c.user} is in ${c.interview.interview_round} (${fmtTime(c.interview.from_time)}–${fmtTime(c.interview.to_time)})`).join("; ")}</Notice>}
        {err && <Notice>{err}</Notice>}
        <Buttons onClose={onClose} busy={busy} label={interview ? "Save new time" : "Schedule"} />
      </form>
    </Modal>
  );
}

export function icsFor(interview, applicantName) {
  downloadIcs({
    uid: interview.name,
    title: `Interview: ${applicantName || interview.job_applicant} – ${interview.interview_round}`,
    description: `${interview.interview_round} interview with ${applicantName || interview.job_applicant}.${interview.custom_meeting_link ? `\n${interview.custom_meeting_link}` : ""}\nGive feedback in ETHX HRMS › My Interviews.`,
    date: interview.scheduled_on,
    from: fmtTime(interview.from_time),
    to: fmtTime(interview.to_time),
    location: interview.custom_meeting_link,
  });
}

export function IcsButton({ interview, applicantName }) {
  return <button type="button" title="Download calendar invite (.ics) for Outlook" onClick={() => icsFor(interview, applicantName)} className="rounded p-1 text-[var(--color-text-muted)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text)]"><CalendarPlus size={14} /></button>;
}

/** Interviewers' scorecards side by side: one column per interviewer, one row per skill. */
export function FeedbackMatrix({ items }) {
  if (!items?.length) return <p className="text-[12px] text-[var(--color-text-muted)]">No feedback submitted yet.</p>;
  const skills = [...new Set(items.flatMap((f) => f.skills.map((s) => s.skill)))];
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-[12px]">
        <thead>
          <tr className="border-b border-[var(--color-border)] text-[var(--color-text-muted)]">
            <th className="px-2 py-1.5 font-medium">Skill</th>
            {items.map((f) => <th key={f.name} className="px-2 py-1.5 font-medium">{f.interviewer}</th>)}
          </tr>
        </thead>
        <tbody>
          {skills.map((s) => (
            <tr key={s} className="border-b border-[var(--color-border)]">
              <td className="px-2 py-1.5 text-[var(--color-text)]">{s}</td>
              {items.map((f) => { const r = f.skills.find((x) => x.skill === s); return <td key={f.name} className="px-2 py-1.5">{r ? <Rating fraction={r.rating} /> : "—"}</td>; })}
            </tr>
          ))}
          <tr className="border-b border-[var(--color-border)]">
            <td className="px-2 py-1.5 font-medium text-[var(--color-text)]">Recommendation</td>
            {items.map((f) => <td key={f.name} className="px-2 py-1.5"><span className={f.result === "Cleared" ? "text-[var(--color-green)]" : "text-[var(--color-red-hover)]"}>{f.result}</span> · <Rating fraction={f.average_rating} /></td>)}
          </tr>
          <tr>
            <td className="px-2 py-1.5 align-top font-medium text-[var(--color-text)]">Comments</td>
            {items.map((f) => <td key={f.name} className="max-w-xs whitespace-pre-wrap px-2 py-1.5 align-top text-[var(--color-text-muted)]">{f.feedback || "—"}</td>)}
          </tr>
        </tbody>
      </table>
    </div>
  );
}

/** Close an interview as Cleared / Rejected after reading the panel's feedback. */
export function DecideModal({ interview, applicant, onClose, onSaved }) {
  const fb = useAsync(() => feedbackFor([interview.name]).then((m) => m[interview.name] || []), [interview.name]);
  const panel = useAsync(() => interviewersOf([interview.name]).then((m) => m[interview.name] || []), [interview.name]);
  const [result, setResult] = useState("");
  const [summary, setSummary] = useState("");
  const [alsoReject, setAlsoReject] = useState(true);
  const { busy, err, run } = useSubmit();
  const pending = (panel.data || []).filter((u) => !(fb.data || []).some((f) => f.interviewer === u));

  function submit(e) {
    e.preventDefault();
    run(async () => {
      await decideInterview(interview, result, summary.trim());
      if (result === "Rejected" && alsoReject && applicant && !["Rejected", "Withdrawn"].includes(stageOf(applicant))) {
        await moveStage(applicant, "Rejected", { reason: `${interview.interview_round} not cleared${summary ? `: ${summary.trim()}` : ""}` });
      }
      onSaved();
    }, "Couldn't record the decision.");
  }

  return (
    <Modal title={`${interview.interview_round} · Decision`} onClose={onClose} wide="xl">
      <form onSubmit={submit} className="space-y-4">
        <FeedbackMatrix items={fb.data} />
        {pending.length > 0 && <Notice tone="info">Still waiting for feedback from: {pending.join(", ")}</Notice>}
        <div className="flex flex-wrap gap-2">
          {["Cleared", "Rejected"].map((r) => <button key={r} type="button" onClick={() => setResult(r)} className={`rounded-md border px-3 py-1.5 text-[12px] ${result === r ? "border-[var(--color-red)] bg-[var(--color-red-wash)] text-[var(--color-text)]" : "border-[var(--color-border)] text-[var(--color-text-muted)]"}`}>{r}</button>)}
        </div>
        <Field label="Summary"><textarea rows={2} className={inputCls} value={summary} onChange={(e) => setSummary(e.target.value)} /></Field>
        {result === "Rejected" && applicant && <label className="flex items-center gap-2 text-[12px] text-[var(--color-text-muted)]"><input type="checkbox" checked={alsoReject} onChange={(e) => setAlsoReject(e.target.checked)} /> Also move the candidate to Rejected</label>}
        <p className="text-[11px] text-[var(--color-text-faint)]">Recording the decision submits the interview; it can't be edited afterwards.</p>
        {err && <Notice>{err}</Notice>}
        <Buttons onClose={onClose} busy={busy} disabled={!result} label="Record decision" />
      </form>
    </Modal>
  );
}

/* ---------------------------------- offers ---------------------------------- */

/** Draft or edit an offer. Checks the opening's interview rounds and asks for an override reason if any aren't cleared. */
export function OfferModal({ applicant, opening, offer, amendFrom, onClose, onSaved }) {
  const rs = useAsync(() => roundsStatus(applicant, opening), [applicant.name, opening?.name]);
  const o = offer || amendFrom || {};
  const [f, setF] = useState({
    offer_date: o.offer_date || isoDate(), designation: o.designation || applicant.designation || opening?.designation || "", company: o.company || opening?.company || "",
    ctc: o.custom_ctc ?? applicant.custom_expected_ctc ?? "", joining: o.custom_joining_date || isoPlus(Math.max(30, Number(applicant.custom_notice_days) || 30)),
    valid_till: o.custom_valid_till || isoPlus(7), template: o.job_offer_term_template || "", terms: o.terms || "", override: o.custom_rounds_override || "",
  });
  const { busy, err, setErr, run } = useSubmit();
  const missing = rs.data?.missing || [];

  function submit(e) {
    e.preventDefault();
    if (missing.length && !f.override.trim()) return setErr(`Rounds not cleared: ${missing.join(", ")}. Give an override reason or clear them first.`);
    if (f.valid_till && f.valid_till < f.offer_date) return setErr("The offer can't expire before the offer date.");
    run(async () => {
      const saved = await saveOffer(offer, { ...f, applicant: applicant.name, opening: opening?.name || applicant.job_title, amended_from: amendFrom?.name });
      if (!["Offer", "Hired"].includes(stageOf(applicant))) { try { await moveStage(applicant, "Offer", { note: `Offer ${saved.name} drafted` }); } catch { /* keep the offer */ } }
      onSaved(saved);
    }, "Couldn't save the offer.");
  }

  return (
    <Modal title={`${offer ? "Edit" : amendFrom ? "Revise" : "Draft"} Offer · ${applicant.applicant_name}`} onClose={onClose} wide>
      <form onSubmit={submit} className="space-y-3">
        {rs.data && rs.data.required.length > 0 && (missing.length ? <Notice tone="info">Interview rounds not cleared yet: <b>{missing.join(", ")}</b>. The offer can be drafted, but sending it needs an override reason.</Notice> : <Notice tone="info">All {rs.data.required.length} interview round(s) cleared.</Notice>)}
        <Row>
          <LinkField label="Designation" linkDoctype="Designation" value={f.designation} onChange={(v) => setF({ ...f, designation: v })} required frappe={frappe} />
          <LinkField label="Company" linkDoctype="Company" value={f.company} onChange={(v) => setF({ ...f, company: v })} required frappe={frappe} />
        </Row>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
          <Field label="Offered CTC (₹/yr)"><input type="number" min="0" required className={inputCls} value={f.ctc} onChange={(e) => setF({ ...f, ctc: e.target.value })} /></Field>
          <DateField label="Offer date" value={f.offer_date} onChange={(v) => setF({ ...f, offer_date: v })} required />
          <DateField label="Joining date" value={f.joining} onChange={(v) => setF({ ...f, joining: v })} required />
          <DateField label="Valid till" value={f.valid_till} onChange={(v) => setF({ ...f, valid_till: v })} required />
        </div>
        {(applicant.custom_expected_ctc || applicant.custom_current_ctc) && <p className="text-[11px] text-[var(--color-text-faint)]">Candidate: current {applicant.custom_current_ctc || "—"} · expected {applicant.custom_expected_ctc || "—"}</p>}
        <LinkField label="Offer terms template (optional)" linkDoctype="Job Offer Term Template" value={f.template} onChange={(v) => setF({ ...f, template: v })} frappe={frappe} />
        <Field label="Terms / letter body (optional)"><textarea rows={3} className={inputCls} value={f.terms} onChange={(e) => setF({ ...f, terms: e.target.value })} /></Field>
        {missing.length > 0 && <Field label="Override reason (required to send without all rounds cleared)"><input className={inputCls} value={f.override} onChange={(e) => setF({ ...f, override: e.target.value })} /></Field>}
        <p className="text-[11px] text-[var(--color-text-faint)]">The offer is saved as a draft. It then needs approval by an HR Manager other than you before it can be sent.</p>
        {err && <Notice>{err}</Notice>}
        <Buttons onClose={onClose} busy={busy} label={offer ? "Save offer" : "Save draft"} />
      </form>
    </Modal>
  );
}

/** Candidate's answer to a sent offer. Accepting can close the opening once all vacancies are filled. */
export function ResponseModal({ offer, onClose, onSaved }) {
  const [status, setStatus] = useState("Accepted");
  const [date, setDate] = useState(isoDate());
  const [reason, setReason] = useState("");
  const { busy, err, run } = useSubmit();
  function submit(e) {
    e.preventDefault();
    run(async () => {
      await recordResponse(offer, status, date);
      const app = await frappe.getDoc("Job Applicant", offer.job_applicant);
      if (status === "Rejected") await moveStage(app, "Withdrawn", { reason: reason || "Declined the offer" });
      else await addComment("Job Applicant", app.name, `Offer ${offer.name} accepted on ${dmy(date)}`).catch(() => {});
      onSaved(status);
    }, "Couldn't record the response.");
  }
  return (
    <Modal title={`Candidate's Response · ${offer.applicant_name}`} onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <div className="flex gap-2">{[["Accepted", "Accepted"], ["Rejected", "Declined"]].map(([v, l]) => <button key={v} type="button" onClick={() => setStatus(v)} className={`rounded-md border px-3 py-1.5 text-[12px] ${status === v ? "border-[var(--color-red)] bg-[var(--color-red-wash)] text-[var(--color-text)]" : "border-[var(--color-border)] text-[var(--color-text-muted)]"}`}>{l}</button>)}</div>
        <DateField label="Responded on" value={date} onChange={setDate} required />
        {status === "Rejected" && <Field label="Reason (if known)"><input className={inputCls} value={reason} onChange={(e) => setReason(e.target.value)} /></Field>}
        {err && <Notice>{err}</Notice>}
        <Buttons onClose={onClose} busy={busy} label="Save" />
      </form>
    </Modal>
  );
}

/** Hire: optionally start ERPNext onboarding, then create the Employee (once - duplicates are blocked). */
export function HireModal({ offer, onClose, onSaved }) {
  const state = useAsync(async () => {
    const applicant = await frappe.getDoc("Job Applicant", offer.job_applicant);
    const [employee, onboarding, company] = await Promise.all([employeeForApplicant(applicant.name), onboardingForApplicant(applicant.name).catch(() => null), frappe.getDoc("Company", offer.company).catch(() => null)]);
    return { applicant, employee, onboarding, holidayList: onboarding?.holiday_list || company?.default_holiday_list || "" };
  }, [offer.name]);
  const [f, setF] = useState({ joining: offer.custom_joining_date || isoDate(), gender: "", dob: "", department: "", template: "", holidayList: "", useOnboarding: false });
  useEffect(() => { if (state.data) setF((v) => ({ ...v, holidayList: v.holidayList || state.data.holidayList, useOnboarding: v.useOnboarding || state.data.onboarding?.docstatus === 0, template: v.template || state.data.onboarding?.employee_onboarding_template || "" })); }, [state.data]);
  const { busy, err, run } = useSubmit();
  const d = state.data;

  function submit(e) {
    e.preventDefault();
    run(async () => {
      let onboarding = d.onboarding;
      if (f.useOnboarding && (!onboarding || onboarding.docstatus === 0)) {
        onboarding = await startOnboarding({ offer, applicant: d.applicant, joining: f.joining, template: f.template, department: f.department, holidayList: f.holidayList, draft: onboarding });
        if (f.template) { onSaved({ onboarding }); return; } // template tasks may be required before the employee can be created
      }
      const emp = await createEmployee({ offer, applicant: d.applicant, onboarding: onboarding?.docstatus === 1 ? onboarding : null, joining: f.joining, gender: f.gender, dob: f.dob, department: f.department });
      await recordJoining(offer, "Joined");
      await moveStage(d.applicant, "Hired", { note: `Employee ${emp.name} created` });
      onSaved({ employee: emp });
    }, "Couldn't create the employee.");
  }

  return (
    <Modal title={`Hire · ${offer.applicant_name}`} onClose={onClose} wide>
      {state.loading && <p className="text-[13px] text-[var(--color-text-muted)]">Checking…</p>}
      {d?.employee ? (
        <div className="space-y-3">
          <Notice tone="info">Already an employee: <b>{d.employee.employee_name}</b> ({d.employee.name}). Give them a portal login from HR › Employees.</Notice>
          <div className="flex justify-end gap-2"><Link to="/hr/employees"><Button variant="secondary">Open Employees</Button></Link><Button onClick={onClose}>Close</Button></div>
        </div>
      ) : d && (
        <form onSubmit={submit} className="space-y-3">
          {d.onboarding?.docstatus === 1 && <Notice tone="info">Onboarding {d.onboarding.name} is {d.onboarding.boarding_status || "in progress"}. Mandatory onboarding tasks must be completed before the employee can be created.</Notice>}
          {d.onboarding?.docstatus === 0 && <Notice tone="info">Onboarding {d.onboarding.name} was saved as a draft but not started - check the details below and try again.</Notice>}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <DateField label="Joining date" value={f.joining} onChange={(v) => setF({ ...f, joining: v })} required />
            <Field label="Gender"><select required className={inputCls} value={f.gender} onChange={(e) => setF({ ...f, gender: e.target.value })}><option value="">Select…</option>{["Male", "Female", "Other", "Prefer not to say"].map((g) => <option key={g}>{g}</option>)}</select></Field>
            <DateField label="Date of birth" value={f.dob} onChange={(v) => setF({ ...f, dob: v })} required />
          </div>
          <LinkField label="Department" linkDoctype="Department" value={f.department} onChange={(v) => setF({ ...f, department: v })} frappe={frappe} />
          {d.onboarding?.docstatus !== 1 && (
            <label className="flex items-start gap-2 text-[12px] text-[var(--color-text-muted)]">
              <input type="checkbox" className="mt-0.5" checked={f.useOnboarding} onChange={(e) => setF({ ...f, useOnboarding: e.target.checked })} />
              Start onboarding first (documents, laptop / email, buddy tasks from a template)
            </label>
          )}
          {f.useOnboarding && d.onboarding?.docstatus !== 1 && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <LinkField label="Onboarding template" linkDoctype="Employee Onboarding Template" titleField="title" value={f.template} onChange={(v) => setF({ ...f, template: v })} frappe={frappe} />
              <LinkField label="Holiday list" linkDoctype="Holiday List" value={f.holidayList} onChange={(v) => setF({ ...f, holidayList: v })} required frappe={frappe} />
            </div>
          )}
          {f.useOnboarding && f.template && <p className="text-[11px] text-[var(--color-text-faint)]">With a template, the onboarding tasks are created now; come back here (or to HR › Onboarding) to create the employee once the mandatory tasks are done.</p>}
          {err && <Notice>{err}</Notice>}
          <Buttons onClose={onClose} busy={busy} label={f.useOnboarding && f.template && d.onboarding?.docstatus !== 1 ? "Start onboarding" : "Create employee"} />
        </form>
      )}
    </Modal>
  );
}

/** Mark a no-show / withdrawal after acceptance - the opening can be reopened. */
export function NoShowModal({ offer, opening, onClose, onSaved }) {
  const [kind, setKind] = useState("No-show");
  const [reason, setReason] = useState("");
  const [reopen, setReopen] = useState(opening?.status === "Closed");
  const { busy, err, run } = useSubmit();
  function submit(e) {
    e.preventDefault();
    run(async () => {
      await recordJoining(offer, kind);
      const app = await frappe.getDoc("Job Applicant", offer.job_applicant);
      await moveStage(app, "Withdrawn", { reason: `${kind}${reason ? `: ${reason}` : ""}` });
      if (reopen && opening) await frappe.updateDoc("Job Opening", opening.name, { status: "Open" });
      onSaved();
    }, "Couldn't update the offer.");
  }
  return (
    <Modal title={`Didn't Join · ${offer.applicant_name}`} onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <div className="flex gap-2">{["No-show", "Withdrawn"].map((v) => <button key={v} type="button" onClick={() => setKind(v)} className={`rounded-md border px-3 py-1.5 text-[12px] ${kind === v ? "border-[var(--color-red)] bg-[var(--color-red-wash)] text-[var(--color-text)]" : "border-[var(--color-border)] text-[var(--color-text-muted)]"}`}>{v}</button>)}</div>
        <Field label="Reason"><input className={inputCls} value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
        {opening && <label className="flex items-center gap-2 text-[12px] text-[var(--color-text-muted)]"><input type="checkbox" checked={reopen} onChange={(e) => setReopen(e.target.checked)} disabled={opening.status !== "Closed"} /> Reopen {opening.job_title}{opening.status !== "Closed" ? " (already open)" : ""}</label>}
        {err && <Notice>{err}</Notice>}
        <Buttons onClose={onClose} busy={busy} label="Save" />
      </form>
    </Modal>
  );
}
