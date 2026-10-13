// Candidate pipeline board for one opening: a column per stage, drag a card to move the candidate.
import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, CalendarClock, KanbanSquare, Pencil, Plus } from "lucide-react";
import { frappe } from "../../../lib/api/frappeClient";
import { Button } from "../../../components/ui/primitives";
import { Async, Notice, PageHeader } from "../../../components/employee/EmployeeShell";
import { daysUntil, dmy, errMsg, useAsync } from "../../../lib/employeePortal";
import { EXITS, fmtTime, listApplicants, listInterviews, listOffers, moveStage, offerStage, roundsOf, stageOf, STAGES, vacanciesOf } from "../../../lib/recruitment";
import { CandidateModal, candidateUrl, MoveStageModal, OfferModal, Rating, ScheduleModal, SetupHint, StageBadge } from "./shared";
import { OpeningModal } from "./Openings";

export default function Board() {
  const { opening: id } = useParams();
  const opening = useAsync(() => frappe.getDoc("Job Opening", id), [id]);
  const apps = useAsync(() => listApplicants([["job_title", "=", id]]), [id]);
  const extra = useAsync(async () => {
    const names = (apps.data || []).map((a) => a.name);
    if (!names.length) return { interviews: [], offers: [] };
    const [interviews, offers] = await Promise.all([listInterviews([["job_applicant", "in", names]]), listOffers([["job_applicant", "in", names], ["docstatus", "<", 2]])]);
    return { interviews, offers };
  }, [apps.data]);
  const [modal, setModal] = useState(null);
  const [drag, setDrag] = useState(null);
  const [over, setOver] = useState(null);
  const [showExits, setShowExits] = useState(false);
  const [err, setErr] = useState("");

  const byStage = useMemo(() => {
    const m = {};
    (apps.data || []).forEach((a) => { (m[stageOf(a)] ||= []).push(a); });
    return m;
  }, [apps.data]);
  const nextInterview = (a) => (extra.data?.interviews || []).filter((i) => i.job_applicant === a.name && i.docstatus === 0).sort((x, y) => `${x.scheduled_on}${x.from_time}`.localeCompare(`${y.scheduled_on}${y.from_time}`))[0];
  const cleared = (a) => (extra.data?.interviews || []).filter((i) => i.job_applicant === a.name && i.docstatus === 1 && i.status === "Cleared").length;
  const offerOf = (a) => (extra.data?.offers || []).find((o) => o.job_applicant === a.name);
  const reload = () => { apps.reload(); opening.reload(); };

  async function dropOn(stage) {
    const a = (apps.data || []).find((x) => x.name === drag);
    setDrag(null);
    setOver(null);
    if (!a || stageOf(a) === stage) return;
    setErr("");
    if (stage === "Hired") return setErr("Candidates become Hired from Offers once they accept and an employee is created.");
    if (stage === "Interview") return setModal({ kind: "schedule", applicant: a });
    if (stage === "Offer" && !offerOf(a)) return setModal({ kind: "offer", applicant: a });
    if (["Rejected", "Withdrawn", "Hold"].includes(stage)) return setModal({ kind: "move", applicant: a, to: stage });
    try {
      await moveStage(a, stage);
      apps.reload();
    } catch (e) {
      setErr(errMsg(e, "Couldn't move the candidate."));
    }
  }

  const o = opening.data;
  const rounds = roundsOf(o);
  const columns = showExits ? [...STAGES, ...EXITS] : STAGES;
  const exitCount = EXITS.reduce((n, s) => n + (byStage[s.id]?.length || 0), 0);

  return (
    <div className="space-y-4">
      <Link to="/hr/recruitment/openings" className="inline-flex items-center gap-1 text-[12px] text-[var(--color-text-muted)] hover:text-[var(--color-text)]"><ArrowLeft size={13} /> All openings</Link>
      <Async state={opening}>
        {() => (
          <PageHeader icon={KanbanSquare} title={o.job_title} subtitle={[o.designation, o.department, o.company, `${vacanciesOf(o) || "?"} vacancies`, o.status].filter(Boolean).join(" · ")} actions={<>
            <Button variant="secondary" onClick={() => setModal({ kind: "edit" })}><Pencil size={14} /> Edit opening</Button>
            <Button onClick={() => setModal({ kind: "add" })} disabled={o.status !== "Open"}><Plus size={14} /> Add candidate</Button>
          </>} />
        )}
      </Async>
      <SetupHint />
      {o && <p className="text-[12px] text-[var(--color-text-muted)]">Rounds: {rounds.length ? rounds.join(" → ") : <span className="text-[var(--color-amber)]">none configured - edit the opening to add them</span>} · Drag a card to another column to move the candidate. Every move is recorded on their timeline.</p>}
      {err && <Notice>{err}</Notice>}
      <div className="flex items-center gap-2">
        <button type="button" onClick={() => setShowExits((v) => !v)} className="text-[12px] text-[var(--color-red-hover)] hover:underline">{showExits ? "Hide" : "Show"} Hold / Rejected / Withdrawn ({exitCount})</button>
      </div>
      <Async state={apps}>
        {() => (
          <div className="flex gap-3 overflow-x-auto pb-3">
            {columns.map((s) => (
              <section key={s.id}
                onDragOver={(e) => { e.preventDefault(); setOver(s.id); }}
                onDragLeave={() => setOver((v) => (v === s.id ? null : v))}
                onDrop={(e) => { e.preventDefault(); dropOn(s.id); }}
                className={`flex min-w-[11rem] flex-1 flex-col rounded-xl border bg-[var(--color-surface)] ${over === s.id ? "border-[var(--color-red)]" : "border-[var(--color-border)]"}`}>
                <header className="flex items-center justify-between border-b border-[var(--color-border)] px-3 py-2">
                  <div><StageBadge stage={s.id} /><p className="mt-0.5 text-[10.5px] text-[var(--color-text-faint)]">{s.hint}</p></div>
                  <span className="rounded-full bg-[var(--color-surface-2)] px-2 py-0.5 text-[11px] text-[var(--color-text-muted)]">{byStage[s.id]?.length || 0}</span>
                </header>
                <div className="flex min-h-24 flex-1 flex-col gap-2 p-2">
                  {(byStage[s.id] || []).map((a) => {
                    const ni = nextInterview(a);
                    const off = offerOf(a);
                    const since = a.custom_stage_since ? -daysUntil(a.custom_stage_since) : null;
                    return (
                      <Link key={a.name} to={candidateUrl(a.name)} draggable onDragStart={(e) => { setDrag(a.name); e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", a.name); }} onDragEnd={() => setDrag(null)}
                        className={`block rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] p-2.5 text-[12px] hover:border-[var(--color-border-strong)] ${drag === a.name ? "opacity-50" : ""}`}>
                        <div className="flex items-start justify-between gap-2">
                          <span className="font-medium text-[var(--color-text)]">{a.applicant_name}</span>
                          <Rating fraction={a.applicant_rating} />
                        </div>
                        <p className="mt-0.5 truncate text-[11px] text-[var(--color-text-muted)]">{[a.custom_total_experience ? `${a.custom_total_experience} yrs` : null, Number(a.custom_notice_days) > 0 ? `${a.custom_notice_days}d notice` : null, a.source].filter(Boolean).join(" · ") || a.email_id}</p>
                        {ni && <p className="mt-1 flex items-center gap-1 text-[11px] text-[var(--color-amber)]"><CalendarClock size={11} /> {ni.interview_round} · {dmy(ni.scheduled_on)} {fmtTime(ni.from_time)}</p>}
                        {s.id === "Interview" && rounds.length > 0 && <p className="mt-1 text-[10.5px] text-[var(--color-text-faint)]">{cleared(a)}/{rounds.length} rounds cleared</p>}
                        {off && <p className="mt-1 text-[10.5px] text-[var(--color-text-faint)]">Offer: {offerStage(off)}</p>}
                        {since != null && since > 0 && <p className={`mt-1 text-[10.5px] ${since > 14 ? "text-[var(--color-red-hover)]" : "text-[var(--color-text-faint)]"}`}>{since} day(s) in stage</p>}
                      </Link>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        )}
      </Async>
      {modal?.kind === "edit" && <OpeningModal opening={o} onClose={() => setModal(null)} onSaved={() => { setModal(null); opening.reload(); }} />}
      {modal?.kind === "add" && <CandidateModal openings={[o]} defaultOpening={o.name} onClose={() => setModal(null)} onSaved={() => { setModal(null); reload(); }} />}
      {modal?.kind === "move" && <MoveStageModal applicant={modal.applicant} to={modal.to} opening={o} onClose={() => setModal(null)} onSaved={() => { setModal(null); apps.reload(); }} />}
      {modal?.kind === "schedule" && <ScheduleModal applicant={modal.applicant} opening={o} onClose={() => setModal(null)} onSaved={() => { setModal(null); apps.reload(); extra.reload(); }} />}
      {modal?.kind === "offer" && <OfferModal applicant={modal.applicant} opening={o} onClose={() => setModal(null)} onSaved={() => { setModal(null); apps.reload(); extra.reload(); }} />}
    </div>
  );
}
