// Candidate profile: contact and screening details, CV preview, interviews with scorecards side by side,
// offers, other applications from the same person, and a timeline of every change and note.
import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, CalendarPlus, FileText, Gavel, Handshake, MessageSquarePlus, Pencil, ShieldOff, UserRound } from "lucide-react";
import { frappe } from "../../../lib/api/frappeClient";
import { Button } from "../../../components/ui/primitives";
import { Async, Empty, Field, Grid, inputCls, KeyValue, Modal, Notice, PageHeader, Panel, StatusPill } from "../../../components/employee/EmployeeShell";
import { dmy, dmyHm, errMsg, money, useAsync } from "../../../lib/employeePortal";
import {
  addComment, ALL_STAGES, anonymise, employeeForApplicant, feedbackFor, findSamePerson, fmtTime, interviewersOf, isClosedStage, listInterviews, listOffers, offerStage,
  roundsOf, stageOf, timelineOf, toStars, fromStars,
} from "../../../lib/recruitment";
import { CandidateModal, candidateUrl, DecideModal, FeedbackMatrix, IcsButton, MoveStageModal, OfferModal, ScheduleModal, SetupHint, StageBadge, Stars } from "./shared";
import { useAuth } from "../../../context/AuthContext";
import { alertDialog, confirmDialog, promptDialog } from "../../../components/ui/dialogs";

export default function CandidateProfile() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const app = useAsync(() => frappe.getDoc("Job Applicant", id), [id]);
  const a = app.data;
  const opening = useAsync(() => (a?.job_title ? frappe.getDoc("Job Opening", a.job_title) : Promise.resolve(null)), [a?.job_title]);
  const interviews = useAsync(async () => {
    const list = await listInterviews([["job_applicant", "=", id]]);
    const [fb, panel] = await Promise.all([feedbackFor(list.map((i) => i.name)), interviewersOf(list.map((i) => i.name)).catch(() => ({}))]);
    return list.sort((x, y) => `${x.scheduled_on}${x.from_time}`.localeCompare(`${y.scheduled_on}${y.from_time}`)).map((i) => ({ ...i, feedback: fb[i.name] || [], panel: panel[i.name] || [] }));
  }, [id]);
  const offers = useAsync(() => listOffers([["job_applicant", "=", id]]), [id]);
  const timeline = useAsync(() => timelineOf("Job Applicant", id), [id]);
  const others = useAsync(() => (a ? findSamePerson({ email: a.email_id, phone: a.phone_number, exclude: a.name }) : Promise.resolve([])), [a?.name]);
  const employee = useAsync(() => employeeForApplicant(id).catch(() => null), [id]);
  const [modal, setModal] = useState(null);
  const [moveTo, setMoveTo] = useState("");

  const reloadAll = () => { app.reload(); interviews.reload(); offers.reload(); timeline.reload(); };
  const stage = a ? stageOf(a) : "";
  const liveOffer = (offers.data || []).find((o) => o.docstatus < 2);
  const rounds = roundsOf(opening.data);
  const cleared = new Set((interviews.data || []).filter((i) => i.docstatus === 1 && i.status === "Cleared").map((i) => i.interview_round));

  async function rate(n) {
    if (!(await confirmDialog(`Set the HR rating to ${n} star(s)?`))) return;
    try {
      await frappe.updateDoc("Job Applicant", id, { applicant_rating: fromStars(n) });
      app.reload();
    } catch (e) {
      alertDialog({ tone: "error", message: errMsg(e, "Couldn't save the rating.") });
    }
  }
  async function cancelInterview(i) {
    const why = await promptDialog({ title: "Cancel interview", message: `Cancel ${i.interview_round} on ${dmy(i.scheduled_on)}?`, label: "Reason (optional)", required: false, danger: true, confirmLabel: "Cancel interview", cancelLabel: "Keep it" });
    if (why == null) return;
    try {
      await frappe.deleteDoc("Interview", i.name);
      await addComment("Job Applicant", id, `${i.interview_round} on ${dmy(i.scheduled_on)} cancelled${why ? `: ${why}` : ""}`);
      reloadAll();
    } catch (e) {
      alertDialog({ tone: "error", message: errMsg(e, "Couldn't cancel the interview.") });
    }
  }

  if (app.error) return <Notice>{errMsg(app.error, "Couldn't open this candidate.")}</Notice>;

  return (
    <div className="space-y-5">
      <Link to={a?.job_title ? `/hr/recruitment/openings/${encodeURIComponent(a.job_title)}` : "/hr/recruitment/candidates"} className="inline-flex items-center gap-1 text-[12px] text-[var(--color-text-muted)] hover:text-[var(--color-text)]"><ArrowLeft size={13} /> Back</Link>
      <SetupHint />
      <Async state={app}>
        {() => (
          <>
            <PageHeader icon={UserRound} title={a.applicant_name} subtitle={<span className="flex flex-wrap items-center gap-2"><StageBadge stage={stage} />{opening.data?.job_title || "Talent pool"}<span>·</span>{a.email_id}{a.phone_number && <><span>·</span>{a.phone_number}</>}</span>} actions={<>
              <Button variant="secondary" onClick={() => setModal({ kind: "edit" })}><Pencil size={14} /> Edit</Button>
              {!isClosedStage(stage) && <Button variant="secondary" onClick={() => setModal({ kind: "schedule" })}><CalendarPlus size={14} /> Schedule interview</Button>}
              {!isClosedStage(stage) && !liveOffer && <Button onClick={() => setModal({ kind: "offer" })}><Handshake size={14} /> Make offer</Button>}
              {liveOffer && <Link to={`/hr/recruitment/offers?offer=${encodeURIComponent(liveOffer.name)}`}><Button variant="secondary"><Handshake size={14} /> Offer: {offerStage(liveOffer)}</Button></Link>}
            </>} />

            {Number(a.custom_anonymised) === 1 && <Notice tone="info">This candidate's personal data has been anonymised under the retention policy.</Notice>}
            {employee.data && <Notice tone="info">Hired - employee <b>{employee.data.employee_name}</b> ({employee.data.name}).</Notice>}

            <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
              <div className="space-y-5 xl:col-span-2">
                <Panel title="Details" action={<span className="flex items-center gap-2 text-[12px] text-[var(--color-text-muted)]">HR rating <Stars value={toStars(a.applicant_rating) || 0} onChange={rate} /></span>}>
                  <KeyValue items={[
                    ["Current company", a.custom_current_company], ["Experience", a.custom_total_experience ? `${a.custom_total_experience} years` : ""],
                    ["Notice period", Number(a.custom_notice_days) > 0 ? `${a.custom_notice_days} days` : ""], ["Location", a.custom_location],
                    ["Current CTC", a.custom_current_ctc ? money(a.custom_current_ctc) : ""], ["Expected CTC", a.custom_expected_ctc ? money(a.custom_expected_ctc) : ""],
                    ["Key skills", a.custom_skills], ["Source", [a.source, a.source_name].filter(Boolean).join(" · ")],
                    ["In stage since", dmyHm(a.custom_stage_since)], ["Consent", Number(a.custom_consent) ? `Given ${dmyHm(a.custom_consent_on)}` : "Not recorded"],
                    ...(a.custom_reject_reason ? [["Reason", a.custom_reject_reason]] : []), ...(a.custom_retain_until ? [["Data kept until", dmy(a.custom_retain_until)]] : []),
                  ]} />
                  {a.cover_letter && <p className="mt-4 whitespace-pre-wrap rounded-md bg-[var(--color-surface-2)] p-3 text-[12.5px] text-[var(--color-text-muted)]">{a.cover_letter}</p>}
                </Panel>

                <Panel title="Interviews" hint={rounds.length ? `Rounds for this opening: ${rounds.map((r) => (cleared.has(r) ? `${r} ✓` : r)).join(" → ")}` : "No rounds configured on the opening"}>
                  <Async state={interviews}>
                    {(list) => list.length === 0 ? <Empty text="No interviews yet." /> : (
                      <div className="space-y-4">
                        {list.map((i) => (
                          <div key={i.name} className="rounded-lg border border-[var(--color-border)] p-3">
                            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                              <div className="text-[13px] text-[var(--color-text)]">
                                <b className="font-medium">{i.interview_round}</b> · {dmy(i.scheduled_on)} {fmtTime(i.from_time)}–{fmtTime(i.to_time)}{" "}
                                {i.docstatus === 1 ? <span className={`ml-1 text-[12px] font-medium ${i.status === "Cleared" ? "text-[var(--color-green)]" : "text-[var(--color-red-hover)]"}`}>{i.status}</span> : <StatusPill status={i.feedback.length ? "Pending Review" : "Pending"} />}
                                <span className="block text-[11px] text-[var(--color-text-faint)]">Panel: {i.panel.join(", ") || "—"}{i.custom_mode ? ` · ${i.custom_mode}` : ""}{i.custom_meeting_link ? ` · ${i.custom_meeting_link}` : ""}</span>
                              </div>
                              {i.docstatus === 0 && (
                                <div className="flex items-center gap-1">
                                  <IcsButton interview={i} applicantName={a.applicant_name} />
                                  <Button variant="ghost" className="!px-2 !py-1 text-[11px]" onClick={() => setModal({ kind: "reschedule", interview: i })}>Reschedule</Button>
                                  <Button variant="ghost" className="!px-2 !py-1 text-[11px]" onClick={() => cancelInterview(i)}>Cancel</Button>
                                  <Button variant="secondary" className="!px-2 !py-1 text-[11px]" onClick={() => setModal({ kind: "decide", interview: i })}><Gavel size={12} /> Decide</Button>
                                </div>
                              )}
                            </div>
                            <FeedbackMatrix items={i.feedback} />
                            {i.interview_summary && <p className="mt-2 text-[12px] text-[var(--color-text-muted)]">Summary: {i.interview_summary}</p>}
                          </div>
                        ))}
                      </div>
                    )}
                  </Async>
                </Panel>

                <Panel title="Offers">
                  <Async state={offers}>
                    {(list) => <Grid rows={list} empty="No offers yet." columns={[
                      { key: "name", label: "Offer", render: (o) => <Link to={`/hr/recruitment/offers?offer=${encodeURIComponent(o.name)}`} className="hover:underline">{o.name}{o.amended_from && <span className="block text-[10.5px] text-[var(--color-text-faint)]">revises {o.amended_from}</span>}</Link> },
                      { key: "custom_ctc", label: "CTC", render: (o) => (o.custom_ctc ? money(o.custom_ctc) : "—") },
                      { key: "custom_joining_date", label: "Joining", render: (o) => dmy(o.custom_joining_date) || "—" },
                      { key: "stage", label: "Status", render: (o) => <StatusPill status={offerStage(o)} /> },
                      { key: "creation", label: "Created", render: (o) => dmy(o.creation) },
                    ]} />}
                  </Async>
                </Panel>
              </div>

              <div className="space-y-5">
                <Panel title="Move Stage">
                  <div className="flex gap-2">
                    <select className={inputCls} value={moveTo} onChange={(e) => setMoveTo(e.target.value)}>
                      <option value="">Choose…</option>
                      {ALL_STAGES.filter((s) => s.id !== stage && s.id !== "Hired").map((s) => <option key={s.id} value={s.id}>{s.id}</option>)}
                    </select>
                    <Button disabled={!moveTo} onClick={() => setModal(moveTo === "Interview" ? { kind: "schedule" } : moveTo === "Offer" && !liveOffer ? { kind: "offer" } : { kind: "move", to: moveTo })}>Move</Button>
                  </div>
                  <p className="mt-2 text-[11px] text-[var(--color-text-faint)]">Hired is set automatically when the employee is created from the accepted offer.</p>
                </Panel>

                <Panel title="CV" action={a.resume_attachment && <a href={a.resume_attachment} target="_blank" rel="noreferrer" className="text-[12px] text-[var(--color-red-hover)] hover:underline">Open</a>}>
                  {a.resume_attachment ? (/\.pdf($|\?)/i.test(a.resume_attachment) ? <iframe title="CV" src={a.resume_attachment} className="h-96 w-full rounded-md border border-[var(--color-border)] bg-white" /> : <a href={a.resume_attachment} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-[13px] text-[var(--color-text)] hover:underline"><FileText size={15} /> {a.resume_attachment.split("/").pop()}</a>)
                    : a.resume_link ? <a href={a.resume_link} target="_blank" rel="noreferrer" className="break-all text-[13px] text-[var(--color-red-hover)] hover:underline">{a.resume_link}</a>
                    : <Empty text="No CV attached." />}
                </Panel>

                {others.data?.length > 0 && (
                  <Panel title="Other Applications" hint="Same email or phone">
                    <ul className="space-y-1.5 text-[12.5px]">{others.data.map((o) => <li key={o.name}><Link to={candidateUrl(o.name)} className="hover:underline">{o.job_title || "Talent pool"}</Link> <StageBadge stage={stageOf(o)} /> <span className="text-[11px] text-[var(--color-text-faint)]">{dmy(o.creation)}</span></li>)}</ul>
                  </Panel>
                )}

                <Panel title="Timeline" action={<button type="button" onClick={() => setModal({ kind: "note" })} className="flex items-center gap-1 text-[12px] text-[var(--color-red-hover)] hover:underline"><MessageSquarePlus size={13} /> Note</button>}>
                  <Async state={timeline}>
                    {(rows) => rows.length === 0 ? <Empty text="Nothing yet." /> : (
                      <ol className="max-h-[28rem] space-y-2.5 overflow-y-auto pr-1">
                        {rows.map((r, i) => (
                          <li key={i} className="border-l-2 pl-3 text-[12px]" style={{ borderColor: r.kind === "note" ? "var(--color-red)" : "var(--color-border-strong)" }}>
                            <p className="text-[var(--color-text)]">{r.text}</p>
                            <p className="text-[10.5px] text-[var(--color-text-faint)]">{dmyHm(r.at)} · {r.by}</p>
                          </li>
                        ))}
                      </ol>
                    )}
                  </Async>
                </Panel>

                {["Rejected", "Withdrawn", "Hold"].includes(stage) && Number(a.custom_anonymised) !== 1 && user && (
                  <Button variant="ghost" className="w-full" onClick={() => setModal({ kind: "anon" })}><ShieldOff size={14} /> Anonymise now</Button>
                )}
              </div>
            </div>

            {modal?.kind === "edit" && <CandidateModal applicant={a} openings={opening.data ? [opening.data] : []} onClose={() => setModal(null)} onSaved={() => { setModal(null); reloadAll(); }} />}
            {modal?.kind === "schedule" && <ScheduleModal applicant={a} opening={opening.data} onClose={() => setModal(null)} onSaved={() => { setModal(null); reloadAll(); }} />}
            {modal?.kind === "reschedule" && <ScheduleModal applicant={a} opening={opening.data} interview={modal.interview} onClose={() => setModal(null)} onSaved={() => { setModal(null); reloadAll(); }} />}
            {modal?.kind === "decide" && <DecideModal interview={modal.interview} applicant={a} onClose={() => setModal(null)} onSaved={() => { setModal(null); reloadAll(); }} />}
            {modal?.kind === "offer" && <OfferModal applicant={a} opening={opening.data} onClose={() => setModal(null)} onSaved={() => { setModal(null); reloadAll(); }} />}
            {modal?.kind === "move" && <MoveStageModal applicant={a} to={modal.to} opening={opening.data} onClose={() => setModal(null)} onSaved={() => { setModal(null); setMoveTo(""); reloadAll(); }} />}
            {modal?.kind === "note" && <NoteModal id={id} onClose={() => setModal(null)} onSaved={() => { setModal(null); timeline.reload(); }} />}
            {modal?.kind === "anon" && <AnonModal applicant={a} onClose={() => setModal(null)} onDone={(newId) => { setModal(null); navigate(candidateUrl(newId), { replace: true }); }} />}
          </>
        )}
      </Async>
    </div>
  );
}

function NoteModal({ id, onClose, onSaved }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    try {
      await addComment("Job Applicant", id, text.trim());
      onSaved();
    } catch (x) {
      setErr(errMsg(x, "Couldn't add the note."));
      setBusy(false);
    }
  }
  return (
    <Modal title="Add HR Note" onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <Field label="Note"><textarea required rows={3} className={inputCls} value={text} onChange={(e) => setText(e.target.value)} /></Field>
        {err && <Notice>{err}</Notice>}
        <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={onClose}>Cancel</Button><Button type="submit" disabled={busy}>Add note</Button></div>
      </form>
    </Modal>
  );
}

function AnonModal({ applicant, onClose, onDone }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  async function go() {
    setBusy(true);
    try {
      onDone(await anonymise(applicant));
    } catch (x) {
      setErr(errMsg(x, "Couldn't anonymise this candidate."));
      setBusy(false);
    }
  }
  return (
    <Modal title="Anonymise Candidate" onClose={onClose}>
      <p className="text-[13px] text-[var(--color-text-muted)]">Removes {applicant.applicant_name}'s name, email, phone, CV, CTC and notes fields, deletes attached files and renames the record. Stage, source, opening and dates stay for reporting. This can't be undone.</p>
      {err && <div className="mt-3"><Notice>{err}</Notice></div>}
      <div className="mt-4 flex justify-end gap-2"><Button variant="ghost" onClick={onClose}>Cancel</Button><Button onClick={go} disabled={busy}>{busy ? "Anonymising…" : "Anonymise"}</Button></div>
    </Modal>
  );
}
