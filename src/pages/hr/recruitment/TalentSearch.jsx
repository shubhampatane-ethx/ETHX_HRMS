// Talent Search: the candidate repository's search (SRCH-01 to SRCH-05) and JD-to-CV matching (MATCH-01 to MATCH-04).
// Works before any opening exists. Filter by title, skills / keywords (all must match) and total experience; keywords search skill tags,
// profile fields and the CV text, with aliases and quoted phrases. With a JD, every candidate gets a match score with
// the evidence behind it and the mandatory requirements it misses.
import { Fragment, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronDown, ChevronRight, Download, FileSearch, Paperclip, Search, Target, Upload, UserPlus, X } from "lucide-react";
import { Button } from "../../../components/ui/primitives";
import { Async, chipCls, Field, inputCls, Modal, Notice, PageHeader, Panel } from "../../../components/employee/EmployeeShell";
import { dmy, errMsg, nowStamp, useAsync } from "../../../lib/employeePortal";
import { frappe } from "../../../lib/api/frappeClient";
import { useAuth } from "../../../context/AuthContext";
import { listApplicants, listOpenings, stageLabel, stageOf } from "../../../lib/recruitment";
import { CvError, readDocument } from "../../../lib/cvText";
import { matchCandidate, parseJd, searchCandidates, splitList, yearsLabel } from "../../../lib/talent";
import { downloadSheet } from "../../../lib/sheet";
import { candidateUrl, StageBadge } from "./shared";

const EMPTY = { title: "", keywords: "", mode: "all", totalMin: "", totalMax: "", relMin: "", relMax: "", includeUnknown: false, cities: [], cityScope: "either", allowRemote: false, workMode: "", noticeMax: "", source: "", stage: "all", updatedSince: "" };
const PAGE = 25;
const NO_JD = { title: "", mandatory: "", preferred: "", domain: "", minYears: "", locations: "", workMode: "" };

const toCriteria = (f) => ({ title: f.title, mandatory: splitList(f.mandatory), preferred: splitList(f.preferred), domain: splitList(f.domain), minYears: f.minYears === "" ? "" : Number(f.minYears), locations: splitList(f.locations), workMode: f.workMode });
const toForm = (c) => ({ title: c.title || "", mandatory: (c.mandatory || []).join(", "), preferred: (c.preferred || []).join(", "), domain: (c.domain || []).join(", "), minYears: c.minYears ?? "", locations: (c.locations || []).join(", "), workMode: c.workMode || "" });
const savedCriteria = (o) => { try { return o?.custom_jd_criteria ? JSON.parse(o.custom_jd_criteria) : null; } catch { return null; } };

function Mark({ excerpt, as }) {
  if (!as) return excerpt;
  const i = excerpt.toLowerCase().indexOf(as.toLowerCase());
  if (i < 0) return excerpt;
  return <>{excerpt.slice(0, i)}<mark className="rounded bg-[color-mix(in_srgb,var(--color-amber)_35%,transparent)] px-0.5 text-[var(--color-text)]">{excerpt.slice(i, i + as.length)}</mark>{excerpt.slice(i + as.length)}</>;
}

export default function TalentSearch() {
  const apps = useAsync(() => listApplicants([], ["custom_cv_text"]), []);
  const openings = useAsync(() => listOpenings(), []);
  const [f, setF] = useState(EMPTY);
  const [sort, setSort] = useState("relevance");
  const [page, setPage] = useState(0);
  const [picked, setPicked] = useState([]);
  const [expanded, setExpanded] = useState(null);
  const [jdOpen, setJdOpen] = useState(false);
  const [jd, setJd] = useState(null); // { criteria, label, opening, version }
  const [onlyMandatory, setOnlyMandatory] = useState(false);
  const [adding, setAdding] = useState(false);
  const [msg, setMsg] = useState(null);
  const set = (k) => (v) => { setF((x) => ({ ...x, [k]: v })); setPage(0); };

  const list = useMemo(() => (apps.data || []).map((a) => ({ ...a, cv_text: a.custom_cv_text || "", _stage: stageOf(a) })), [apps.data]);
  const titles = useMemo(() => Object.fromEntries((openings.data || []).map((o) => [o.name, o.job_title])), [openings.data]);

  const results = useMemo(() => {
    let rows = searchCandidates(list, f).map((r) => ({ ...r, match: jd ? matchCandidate(r.a, jd.criteria) : null }));
    if (jd && onlyMandatory) rows = rows.filter((r) => r.match.mandatoryMet && r.match.score != null);
    const by = {
      relevance: (x, y) => (jd ? (y.match.score ?? -1) - (x.match.score ?? -1) : 0) || y.titleRank - x.titleRank || y.hits.length - x.hits.length,
      name: (x, y) => String(x.a.applicant_name).localeCompare(String(y.a.applicant_name)),
      experience: (x, y) => Number(y.a.custom_total_experience || 0) - Number(x.a.custom_total_experience || 0),
      updated: (x, y) => String(y.a.custom_cv_updated_on || y.a.modified || "").localeCompare(String(x.a.custom_cv_updated_on || x.a.modified || "")),
    };
    return rows.sort(by[sort] || by.relevance);
  }, [list, f, jd, onlyMandatory, sort]);

  const active = [
    f.title && ["title", `Title: ${f.title}`],
    f.keywords && ["keywords", `Skills: ${f.keywords}`],
    (f.totalMin !== "" || f.totalMax !== "") && ["total", `Total ${f.totalMin || 0}–${f.totalMax || "∞"} yrs`],
  ].filter(Boolean);
  const clear = (k) => {
    const reset = { title: { title: "" }, keywords: { keywords: "" }, total: { totalMin: "", totalMax: "" } }[k];
    setF((x) => ({ ...x, ...reset }));
  };

  const shown = results.slice(page * PAGE, page * PAGE + PAGE);
  const pages = Math.max(1, Math.ceil(results.length / PAGE));
  const toggle = (name) => setPicked((p) => (p.includes(name) ? p.filter((x) => x !== name) : [...p, name]));

  function exportCsv() {
    const rows = results.filter((r) => !picked.length || picked.includes(r.a.name));
    downloadSheet("talent-search.csv", [
      ["ID", "Name", "Email", "Phone", "Current Title", "Skills", "Total Exp (Yrs)", "Current Location", "Preferred Locations", "Stage", "Opening", "CV Updated", ...(jd ? ["Match %", "Missing Mandatory"] : [])],
      ...rows.map(({ a, match }) => [a.name, a.applicant_name, a.email_id, a.phone_number, a.custom_current_title, a.custom_skills, a.custom_total_experience, a.custom_location, a.custom_preferred_locations, stageLabel(a._stage), titles[a.job_title] || a.job_title, dmy(a.custom_cv_updated_on), ...(jd ? [match.score ?? "Review required", match.missing.join("; ")] : [])]),
    ]);
  }

  return (
    <div className="space-y-5">
      <PageHeader icon={FileSearch} title="Talent Search" subtitle="Search every CV in the repository, and rank candidates against a job description" actions={<>
        <Button variant={jd ? "primary" : "secondary"} onClick={() => setJdOpen(true)}><Target size={14} /> {jd ? `JD: ${jd.label}` : "Match Against JD"}</Button>
        {jd && <Button variant="ghost" onClick={() => { setJd(null); setOnlyMandatory(false); }}><X size={14} /> Clear JD</Button>}
      </>} />
      {msg && <Notice tone={msg.ok ? "info" : "error"}>{msg.text}</Notice>}

      <Panel>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <Field label="Position / Title"><input className={inputCls} value={f.title} onChange={(e) => set("title")(e.target.value)} placeholder="e.g. Oracle Fusion Finance Consultant" /></Field>
          <Field label="Skills / Keywords" hint='Commas separate terms; "quotes" keep a phrase together. Candidates must have all of them.'>
            <input className={inputCls} value={f.keywords} onChange={(e) => set("keywords")(e.target.value)} placeholder='"Oracle Fusion", GL, AP, BI Publisher' />
          </Field>
          <Field label="Total Experience (Years)"><div className="flex items-center gap-2"><input type="number" min="0" step="0.5" className={inputCls} value={f.totalMin} onChange={(e) => set("totalMin")(e.target.value)} placeholder="Min" /><span className="text-[var(--color-text-faint)]">–</span><input type="number" min="0" step="0.5" className={inputCls} value={f.totalMax} onChange={(e) => set("totalMax")(e.target.value)} placeholder="Max" /></div></Field>
        </div>
        {jd && (
          <div className="mt-3 flex flex-wrap items-center gap-4 text-[12px] text-[var(--color-text-muted)]">
            <label className="flex items-center gap-2"><input type="checkbox" checked={onlyMandatory} onChange={(e) => setOnlyMandatory(e.target.checked)} /> All Mandatory Criteria Met</label>
          </div>
        )}
        {active.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {active.map(([k, label]) => <span key={k} className={`${chipCls(true)} flex items-center gap-1`}>{label}<button type="button" aria-label={`Clear ${label}`} onClick={() => clear(k)}><X size={12} /></button></span>)}
            <button type="button" className="text-[12px] text-[var(--color-text-muted)] underline" onClick={() => { setF(EMPTY); setPage(0); }}>Reset All</button>
          </div>
        )}
      </Panel>

      <Panel>
        <Async state={apps}>
          {() => (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2 text-[12px] text-[var(--color-text-muted)]">
                <span><b className="text-[var(--color-text)]">{results.length}</b> candidate(s){jd ? ` · scored against ${jd.label}${jd.version ? ` (JD v${jd.version})` : ""}` : ""}{picked.length ? ` · ${picked.length} selected` : ""}</span>
                <div className="flex flex-wrap items-center gap-2">
                  <select aria-label="Sort" className={`${inputCls} !w-44 !py-1`} value={sort} onChange={(e) => setSort(e.target.value)}>
                    <option value="relevance">{jd ? "Best Match" : "Relevance"}</option><option value="experience">Most Experience</option><option value="updated">Recently Updated CV</option><option value="name">Name</option>
                  </select>
                  <Button variant="secondary" disabled={!picked.length} onClick={() => setAdding(true)}><UserPlus size={14} /> Add to Opening</Button>
                  <Button variant="secondary" disabled={!results.length} onClick={exportCsv}><Download size={14} /> Export</Button>
                </div>
              </div>
              {!results.length ? (
                <div className="py-10 text-center text-[13px] text-[var(--color-text-muted)]">
                  <p>{list.length ? "No candidates match these filters." : "The repository is empty - import CVs from Candidates › Import Candidates."}</p>
                  {active.length > 0 && <button type="button" className="mt-2 underline" onClick={() => setF(EMPTY)}>Clear the filters</button>}
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-[12.5px]">
                    <thead className="text-[11px] uppercase tracking-wide text-[var(--color-text-faint)]">
                      <tr>{["", "Candidate", "Title / Top Skills", "Experience", "Location", "CV", ...(jd ? ["Match"] : []), ""].map((h, i) => <th key={i} className="px-2 py-2 font-medium">{h}</th>)}</tr>
                    </thead>
                    <tbody>
                      {shown.map(({ a, hits, match }) => {
                        const open = expanded === a.name;
                        return (
                          <Fragment key={a.name}>
                            <tr className="border-t border-[var(--color-border)] align-top">
                              <td className="px-2 py-2"><input type="checkbox" aria-label={`Select ${a.applicant_name}`} checked={picked.includes(a.name)} onChange={() => toggle(a.name)} /></td>
                              <td className="px-2 py-2"><Link to={candidateUrl(a.name)} className="font-medium text-[var(--color-text)] hover:underline">{a.applicant_name}</Link><span className="block text-[11px] text-[var(--color-text-faint)]">{a.email_id}</span><span className="mt-1 inline-block"><StageBadge stage={a._stage} /></span>{Number(a.custom_needs_review) ? <span className="ml-1 text-[10.5px] text-[var(--color-amber)]">Needs review</span> : null}</td>
                              <td className="max-w-[18rem] px-2 py-2">{a.custom_current_title || a.designation || "—"}<span className="block text-[11px] text-[var(--color-text-muted)]">{splitList(a.custom_skills).slice(0, 5).join(" · ") || "—"}</span></td>
                              <td className="whitespace-nowrap px-2 py-2">{yearsLabel(a.custom_total_experience)}</td>
                              <td className="px-2 py-2">{a.custom_location || "—"}{a.custom_preferred_locations && <span className="block text-[11px] text-[var(--color-text-muted)]">Prefers {a.custom_preferred_locations}</span>}{a.custom_work_mode && <span className="block text-[11px] text-[var(--color-text-faint)]">{a.custom_work_mode}</span>}</td>
                              <td className="whitespace-nowrap px-2 py-2">{a.resume_attachment || a.resume_link ? <a href={a.resume_attachment || a.resume_link} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-[var(--color-red-hover)] hover:underline"><Paperclip size={12} /> CV</a> : "—"}<span className="block text-[11px] text-[var(--color-text-faint)]">{dmy(a.custom_cv_updated_on || a.modified)}</span></td>
                              {jd && <td className="whitespace-nowrap px-2 py-2">{match.score == null ? <span className="text-[var(--color-amber)]">Review required</span> : <span className={`text-[15px] font-semibold ${match.score >= 75 ? "text-[var(--color-green)]" : match.score >= 50 ? "text-[var(--color-amber)]" : "text-[var(--color-text-muted)]"}`}>{match.score}%</span>}{match.missing.length > 0 && <span className="block text-[11px] text-[var(--color-red-hover)]">Missing {match.missing.length} mandatory</span>}</td>}
                              <td className="px-2 py-2"><button type="button" onClick={() => setExpanded(open ? null : a.name)} className="flex items-center gap-1 text-[12px] text-[var(--color-text-muted)] hover:text-[var(--color-text)]">{open ? <ChevronDown size={13} /> : <ChevronRight size={13} />} {jd ? "Evidence" : "Matches"}</button></td>
                            </tr>
                            {open && (
                              <tr className="bg-[var(--color-surface-2)]">
                                <td />
                                <td colSpan={jd ? 7 : 6} className="space-y-2 px-2 py-3 text-[12px]">
                                  {jd && (
                                    <>
                                      {match.review && <p className="text-[var(--color-amber)]">{match.review}</p>}
                                      <div className="flex flex-wrap gap-3">{match.categories.map((c) => <span key={c.key} className="rounded border border-[var(--color-border)] px-2 py-1">{c.label} <b>{Math.round(c.fraction * 100)}%</b> <span className="text-[var(--color-text-faint)]">× {c.weight}%{c.note ? ` · ${c.note}` : ""}</span></span>)}</div>
                                      {match.missing.length > 0 && <p className="text-[var(--color-red-hover)]">Missing mandatory: {match.missing.join(", ")}</p>}
                                      {match.unknown.length > 0 && <p className="text-[var(--color-amber)]">Not found / unverified: {match.unknown.join("; ")}</p>}
                                    </>
                                  )}
                                  {(jd ? match.matched : hits).length ? (
                                    <ul className="space-y-1">{(jd ? match.matched : hits).map((h, i) => <li key={i}><b className="text-[var(--color-text)]">{h.term}</b>{h.kind ? <span className="text-[var(--color-text-faint)]"> ({h.kind})</span> : null}: <span className="text-[var(--color-text-muted)]"><Mark excerpt={h.excerpt} as={h.as} /></span></li>)}</ul>
                                  ) : <p className="text-[var(--color-text-muted)]">{a.cv_text ? "No keyword matches to show." : "No CV text on this profile - upload the CV to search inside it."}</p>}
                                </td>
                              </tr>
                            )}
                          </Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
              {pages > 1 && (
                <div className="flex items-center justify-end gap-2 text-[12px]">
                  <Button variant="ghost" disabled={page === 0} onClick={() => setPage(page - 1)}>Previous</Button>
                  <span className="text-[var(--color-text-muted)]">Page {page + 1} of {pages}</span>
                  <Button variant="ghost" disabled={page + 1 >= pages} onClick={() => setPage(page + 1)}>Next</Button>
                </div>
              )}
            </div>
          )}
        </Async>
      </Panel>

      {jdOpen && <JdModal openings={openings.data || []} current={jd} onClose={() => setJdOpen(false)} onUse={(next) => { setJd(next); setJdOpen(false); setSort("relevance"); }} onSaved={() => openings.reload()} />}
      {adding && <AddToOpening openings={openings.data || []} candidates={list.filter((a) => picked.includes(a.name))} onClose={() => setAdding(false)} onDone={(text) => { setAdding(false); setPicked([]); setMsg({ ok: true, text }); apps.reload(); }} />}
    </div>
  );
}

/* ----------------------------------- JD ----------------------------------- */

function JdModal({ openings, current, onClose, onUse, onSaved }) {
  const { user } = useAuth();
  const fileRef = useRef(null);
  const [opening, setOpening] = useState(current?.opening || "");
  const [text, setText] = useState("");
  const [file, setFile] = useState(null);
  const [form, setForm] = useState(current ? toForm(current.criteria) : NO_JD);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [note, setNote] = useState("");
  const o = openings.find((x) => x.name === opening);
  const [saved, setSaved] = useState(null); // criteria already confirmed on the chosen opening
  const set = (k) => (e) => setForm((x) => ({ ...x, [k]: e.target.value }));

  async function pickOpening(name) {
    setOpening(name);
    setErr("");
    setNote("");
    setSaved(null);
    const op = openings.find((x) => x.name === name);
    if (!op) return;
    const full = await frappe.getDoc("Job Opening", name).catch(() => op);
    const c = savedCriteria(full);
    setSaved(c);
    if (c) { setForm(toForm(c)); setNote(`Loaded the confirmed criteria saved with this opening (JD v${c.version || 1}, ${dmy(c.savedOn)}).`); setText(full.custom_jd_text || ""); return; }
    const jdText = full.custom_jd_text || [full.job_title, full.designation, full.description?.replace(/<[^>]+>/g, " "), full.custom_skills && `Key skills: ${full.custom_skills}`, full.custom_experience && `Experience: ${full.custom_experience}`, full.location && `Location: ${full.location}`].filter(Boolean).join("\n");
    setText(jdText);
    setForm(toForm(parseJd(jdText)));
    setNote("Criteria extracted from the opening's description - check them before scoring.");
  }

  async function readFile(f) {
    if (fileRef.current) fileRef.current.value = "";
    if (!f) return;
    setErr("");
    setBusy(true);
    try {
      const doc = await readDocument(f);
      if (!doc.text) throw new CvError("No text could be read from this file. Paste the JD text instead.");
      setFile(f);
      setText(doc.text);
      setForm(toForm(parseJd(doc.text)));
      setNote(`Criteria extracted from ${f.name} - check them before scoring.`);
    } catch (e) {
      setErr(e instanceof CvError ? e.message : `Couldn't read ${f.name}: ${e?.message || e}`);
    }
    setBusy(false);
  }

  const criteria = toCriteria(form);
  const empty = !criteria.mandatory.length && !criteria.preferred.length && !criteria.domain.length && criteria.minYears === "" && !criteria.locations.length && !criteria.workMode;

  async function saveToOpening() {
    setErr("");
    setBusy(true);
    try {
      const version = (saved?.version || 0) + 1;
      const payload = { ...criteria, version, savedOn: nowStamp(), savedBy: user?.email || "" };
      await frappe.updateDoc("Job Opening", opening, { custom_jd_criteria: JSON.stringify(payload), custom_jd_text: text || null });
      if (file) await frappe.uploadFile(file, { doctype: "Job Opening", docname: opening, isPrivate: true }).catch(() => {});
      setSaved(payload);
      onSaved();
      onUse({ criteria, label: o?.job_title || opening, opening, version });
    } catch (e) {
      setErr(/custom_jd/.test(String(e?.response?.data?.exception || "")) ? "Saving JD criteria isn't set up on the server yet - it's added the next time the Administrator signs in. You can still score without saving." : errMsg(e, "Couldn't save the criteria."));
    }
    setBusy(false);
  }

  return (
    <Modal title="Match Against a Job Description" onClose={onClose} wide="xl">
      <div className="space-y-4 text-[13px]">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <Field label="Opening (Optional)">
            <select className={inputCls} value={opening} onChange={(e) => pickOpening(e.target.value)}>
              <option value="">No opening - just score</option>
              {openings.map((x) => <option key={x.name} value={x.name}>{x.job_title || x.name}{x.status !== "Open" ? ` (${x.status})` : ""}</option>)}
            </select>
          </Field>
          <Field label="JD File (PDF / Word)">
            <div className="flex items-center gap-2">
              <Button type="button" variant="secondary" disabled={busy} onClick={() => fileRef.current?.click()}><Upload size={14} /> {file ? file.name : "Upload JD"}</Button>
              <input ref={fileRef} type="file" accept=".pdf,.docx,.doc,.txt" className="hidden" onChange={(e) => readFile(e.target.files[0])} />
            </div>
          </Field>
        </div>
        <Field label="Or Paste the JD">
          <div className="flex gap-2">
            <textarea rows={4} className={inputCls} value={text} onChange={(e) => setText(e.target.value)} placeholder="Paste the job description, then Extract Criteria" />
            <Button type="button" variant="ghost" disabled={!text.trim()} onClick={() => { setForm(toForm(parseJd(text))); setNote("Criteria extracted from the pasted text - check them before scoring."); }}><Search size={14} /> Extract Criteria</Button>
          </div>
        </Field>
        {note && <Notice tone="info">{note}</Notice>}
        <div className="rounded-lg border border-[var(--color-border)] p-3">
          <p className="mb-2 font-medium text-[var(--color-text)]">Confirmed Criteria <span className="font-normal text-[var(--color-text-faint)]">- edit before scoring; leave a field blank to leave it out of the score</span></p>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <Field label="Title"><input className={inputCls} value={form.title} onChange={set("title")} /></Field>
            <Field label="Minimum Relevant Experience (Years)"><input type="number" min="0" step="0.5" className={inputCls} value={form.minYears} onChange={set("minYears")} /></Field>
            <Field label="Mandatory Skills (50%)" hint="Comma separated"><textarea rows={2} className={inputCls} value={form.mandatory} onChange={set("mandatory")} /></Field>
            <Field label="Preferred Skills (15%)" hint="Comma separated"><textarea rows={2} className={inputCls} value={form.preferred} onChange={set("preferred")} /></Field>
            <Field label="Role / Domain (10%)" hint="e.g. Finance, Banking"><input className={inputCls} value={form.domain} onChange={set("domain")} /></Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Locations (5%)"><input className={inputCls} value={form.locations} onChange={set("locations")} placeholder="Pune, Mumbai" /></Field>
              <Field label="Work Mode"><select className={inputCls} value={form.workMode} onChange={set("workMode")}><option value="">Not specified</option>{["Onsite", "Hybrid", "Remote"].map((m) => <option key={m}>{m}</option>)}</select></Field>
            </div>
          </div>
          <p className="mt-2 text-[11px] text-[var(--color-text-faint)]">Score = weighted share of the criteria above that the candidate's profile or CV shows, out of the criteria the JD specifies. Relevant experience counts only when recorded on the profile. Missing mandatory skills are always flagged, whatever the score.</p>
        </div>
        {err && <Notice>{err}</Notice>}
        <div className="flex flex-wrap justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          {opening && <Button type="button" variant="secondary" disabled={busy || empty} onClick={saveToOpening}>Save to Opening{saved ? ` (as v${(saved.version || 1) + 1})` : ""} & Score</Button>}
          <Button type="button" disabled={busy || empty} onClick={() => onUse({ criteria, label: form.title || o?.job_title || "Pasted JD", opening, version: opening && saved ? saved.version : null })}>Score Candidates</Button>
        </div>
      </div>
    </Modal>
  );
}

/* ----------------------------- add to an opening ----------------------------- */

// One person can be in several openings: each opening gets its own Job Applicant record (the pipeline is per
// application), so adding someone already in another opening creates a new application with the same details.
function AddToOpening({ openings, candidates, onClose, onDone }) {
  const open = openings.filter((o) => o.status === "Open");
  const [opening, setOpening] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const COPY = ["applicant_name", "email_id", "phone_number", "source", "source_name", "resume_attachment", "resume_link", "custom_current_company", "custom_total_experience", "custom_notice_days", "custom_location", "custom_skills", "custom_current_ctc", "custom_expected_ctc",
    "custom_current_title", "custom_target_title", "custom_relevant_experience", "custom_preferred_locations", "custom_work_mode", "custom_cv_updated_on", "custom_cv_hash", "custom_cv_text", "custom_consent", "custom_consent_on"];

  async function run() {
    setErr("");
    setBusy(true);
    const o = openings.find((x) => x.name === opening);
    let added = 0;
    let moved = 0;
    let already = 0;
    const failed = [];
    for (const a of candidates) {
      try {
        if (a.job_title === opening) {
          if (!["Shortlisted", "Interview", "Selected", "Offer", "Hired"].includes(stageOf(a))) { await frappe.updateDoc("Job Applicant", a.name, { custom_ethx_stage: "Shortlisted", status: "Open", custom_stage_since: nowStamp() }); moved += 1; } else already += 1;
          continue;
        }
        const same = await listApplicants([["email_id", "=", a.email_id], ["job_title", "=", opening]]);
        if (same.length) { already += 1; continue; } // HIR-02: no duplicate application for the same opening
        if (!a.job_title) {
          await frappe.updateDoc("Job Applicant", a.name, { job_title: opening, designation: o?.designation || null, custom_ethx_stage: "Shortlisted", status: "Open", custom_stage_since: nowStamp() });
          moved += 1;
          continue;
        }
        const doc = Object.fromEntries(COPY.filter((k) => a[k] !== undefined && a[k] !== null && a[k] !== "").map((k) => [k, k === "custom_cv_text" ? a.cv_text || a[k] : a[k]]));
        await frappe.createDoc("Job Applicant", { ...doc, job_title: opening, designation: o?.designation || null, status: "Open", custom_ethx_stage: "Shortlisted", custom_stage_since: nowStamp() });
        added += 1;
      } catch (e) {
        failed.push(`${a.applicant_name}: ${errMsg(e, "refused")}`);
      }
    }
    setBusy(false);
    const parts = [moved && `${moved} shortlisted`, added && `${added} added as new applications`, already && `${already} already in this opening`].filter(Boolean).join(", ");
    if (failed.length) setErr(`${parts ? `${parts}. ` : ""}Couldn't add: ${failed.join("; ")}`);
    else onDone(`${o?.job_title || opening}: ${parts}.`);
  }

  return (
    <Modal title={`Add ${candidates.length} Candidate(s) to an Opening`} onClose={onClose}>
      <div className="space-y-3 text-[13px]">
        <Field label="Opening">
          <select className={inputCls} value={opening} onChange={(e) => setOpening(e.target.value)}>
            <option value="">Select…</option>
            {open.map((o) => <option key={o.name} value={o.name}>{o.job_title || o.name}</option>)}
          </select>
        </Field>
        <p className="text-[12px] text-[var(--color-text-muted)]">They're added as Shortlisted. Someone already in another opening gets a separate application for this one, so each pipeline keeps its own history.</p>
        {err && <Notice>{err}</Notice>}
        <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={onClose}>Cancel</Button><Button type="button" disabled={busy || !opening} onClick={run}>{busy ? "Adding…" : "Add as Shortlisted"}</Button></div>
      </div>
    </Modal>
  );
}
