// All candidates across openings, with search and filters, plus CSV export.
import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Download, Pencil, Plus, Users } from "lucide-react";
import { Button } from "../../../components/ui/primitives";
import { Async, chipCls, Grid, inputCls, Modal, Notice, PageHeader, Panel } from "../../../components/employee/EmployeeShell";
import { dmy, errMsg, useAsync } from "../../../lib/employeePortal";
import { frappe } from "../../../lib/api/frappeClient";
import { ALL_STAGES, downloadCsv, listApplicants, listOpenings, stageLabel, stageOf } from "../../../lib/recruitment";
import { CandidateModal, candidateUrl, MoveStageModal, Rating, SetupHint, StageBadge } from "./shared";

export default function Candidates() {
  const [params, setParams] = useSearchParams();
  const apps = useAsync(() => listApplicants(), []);
  const openings = useAsync(() => listOpenings(), []);
  const [q, setQ] = useState("");
  const [stage, setStage] = useState(params.get("stage") || "active");
  const [opening, setOpening] = useState(params.get("opening") || "");
  const [source, setSource] = useState("");
  const [adding, setAdding] = useState(params.get("add") === "1");
  const [editing, setEditing] = useState(null);
  const [moving, setMoving] = useState(null); // { applicant, to }
  const titles = useMemo(() => Object.fromEntries((openings.data || []).map((o) => [o.name, o.job_title])), [openings.data]);
  const sources = useMemo(() => [...new Set((apps.data || []).map((a) => a.source).filter(Boolean))].sort(), [apps.data]);

  const rows = (apps.data || []).filter((a) => {
    const st = stageOf(a);
    if (stage === "active" ? ["Hired", "Rejected", "Withdrawn"].includes(st) : stage !== "all" && st !== stage) return false;
    if (opening && (opening === "-" ? a.job_title : a.job_title !== opening)) return false;
    if (source && a.source !== source) return false;
    if (q) {
      const t = q.toLowerCase();
      return [a.applicant_name, a.email_id, a.phone_number, a.custom_skills, a.custom_current_company].some((v) => String(v || "").toLowerCase().includes(t));
    }
    return true;
  });

  function exportCsv() {
    downloadCsv("candidates.csv", ["ID", "Name", "Email", "Phone", "Opening", "Stage", "Source", "Experience (yrs)", "Notice (days)", "Current CTC", "Expected CTC", "Skills", "Added on"],
      rows.map((a) => [a.name, a.applicant_name, a.email_id, a.phone_number, titles[a.job_title] || a.job_title, stageOf(a), a.source, a.custom_total_experience, a.custom_notice_days, a.custom_current_ctc, a.custom_expected_ctc, a.custom_skills, dmy(a.creation)]));
  }

  return (
    <div className="space-y-5">
      <PageHeader icon={Users} title="Candidates" subtitle="Everyone who applied or was sourced, across all openings" actions={<>
        <Button variant="secondary" onClick={exportCsv} disabled={!rows.length}><Download size={14} /> CSV</Button>
        <Button onClick={() => setAdding(true)}><Plus size={14} /> Add Candidate</Button>
      </>} />
      <SetupHint />
      <Panel>
        <div className="mb-4 flex flex-wrap items-center gap-2">
          {[["active", "In Process"], ["all", "All"], ...ALL_STAGES.map((s) => [s.id, stageLabel(s.id)])].map(([v, l]) => <button key={v} type="button" onClick={() => setStage(v)} className={chipCls(stage === v)}>{l}</button>)}
        </div>
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, email, phone, skills…" className={`${inputCls} !w-64 !py-1`} />
          <select value={opening} onChange={(e) => setOpening(e.target.value)} className={`${inputCls} !w-auto !py-1`}><option value="">All openings</option><option value="-">No opening (talent pool)</option>{(openings.data || []).map((o) => <option key={o.name} value={o.name}>{o.job_title}{o.status === "Closed" ? " (closed)" : ""}</option>)}</select>
          <select value={source} onChange={(e) => setSource(e.target.value)} className={`${inputCls} !w-auto !py-1`}><option value="">All sources</option>{sources.map((s) => <option key={s}>{s}</option>)}</select>
          <span className="text-[12px] text-[var(--color-text-muted)]">{rows.length} shown</span>
        </div>
        <Async state={apps}>
          {() => <Grid rows={rows} empty="No candidates match." columns={[
            { key: "applicant_name", label: "Candidate", render: (a) => <Link to={candidateUrl(a.name)} className="hover:underline"><b className="font-medium">{a.applicant_name}</b><span className="block text-[11px] text-[var(--color-text-faint)]">{a.email_id}{a.phone_number ? ` · ${a.phone_number}` : ""}</span></Link> },
            { key: "job_title", label: "Opening", render: (a) => (a.job_title ? <Link to={`/hr/recruitment/openings/${encodeURIComponent(a.job_title)}`} className="hover:underline">{titles[a.job_title] || a.job_title}</Link> : <span className="text-[var(--color-text-faint)]">Talent pool</span>) },
            { key: "stage", label: "Stage", render: (a) => <StageBadge stage={stageOf(a)} /> },
            { key: "exp", label: "Exp / Notice", render: (a) => [a.custom_total_experience ? `${a.custom_total_experience}y` : null, Number(a.custom_notice_days) > 0 ? `${a.custom_notice_days}d` : null].filter(Boolean).join(" · ") || "—" },
            { key: "source", label: "Source", render: (a) => a.source || "—" },
            { key: "applicant_rating", label: "Rating", render: (a) => <Rating fraction={a.applicant_rating} /> },
            { key: "creation", label: "Added", render: (a) => dmy(a.creation) },
            // Status can be changed and details edited straight from the list (Hired comes from the accepted offer).
            { key: "_a", label: "", render: (a) => (
              <div className="flex items-center justify-end gap-1.5">
                {stageOf(a) !== "Hired" && (
                  <select aria-label={`Change status of ${a.applicant_name}`} value="" onChange={(e) => e.target.value && setMoving({ applicant: a, to: e.target.value })} className={`${inputCls} !w-auto !py-1 text-[12px]`}>
                    <option value="">Change Status…</option>
                    {ALL_STAGES.filter((s) => s.id !== stageOf(a) && s.id !== "Hired").map((s) => <option key={s.id} value={s.id}>{stageLabel(s.id)}</option>)}
                  </select>
                )}
                <button type="button" title="Edit candidate details" onClick={() => setEditing(a)} className="rounded p-1 text-[var(--color-text-muted)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text)]"><Pencil size={14} /></button>
              </div>
            ) },
          ]} />}
        </Async>
      </Panel>
      {editing && <EditCandidate name={editing.name} openings={openings.data || []} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); apps.reload(); }} />}
      {moving && <MoveStageModal applicant={moving.applicant} to={moving.to} opening={(openings.data || []).find((o) => o.name === moving.applicant.job_title)} onClose={() => setMoving(null)} onSaved={() => { setMoving(null); apps.reload(); }} />}
      {adding && <CandidateModal openings={openings.data || []} defaultOpening={opening && opening !== "-" ? opening : ""} onClose={() => { setAdding(false); if (params.get("add")) setParams({}); }} onSaved={() => { setAdding(false); apps.reload(); }} />}
    </div>
  );
}

/** The list carries only some fields, so the full record is loaded before editing (nothing is blanked on save). */
function EditCandidate({ name, openings, onClose, onSaved }) {
  const doc = useAsync(() => frappe.getDoc("Job Applicant", name), [name]);
  if (doc.data) return <CandidateModal applicant={doc.data} openings={openings} onClose={onClose} onSaved={onSaved} />;
  return <Modal title="Edit Candidate" onClose={onClose}>{doc.error ? <Notice>{errMsg(doc.error, "Couldn't open this candidate.")}</Notice> : <p className="text-[13px] text-[var(--color-text-muted)]">Loading…</p>}</Modal>;
}
