// Bulk CV upload (REP-01 to REP-04): drop many PDF / Word CVs, read each one in the browser, suggest the profile
// fields for review, flag duplicates (same file, same email or phone) and import the rest as candidates with the
// original CV attached. One bad file never stops the others; failed files can be retried on their own.
import { useMemo, useRef, useState } from "react";
import { FileText, RotateCcw, Upload } from "lucide-react";
import { Button } from "../../../components/ui/primitives";
import { chipCls, Field, inputCls, Notice } from "../../../components/employee/EmployeeShell";
import { errMsg, nowStamp } from "../../../lib/employeePortal";
import { frappe } from "../../../lib/api/frappeClient";
import { addComment, listApplicants } from "../../../lib/recruitment";
import { SOURCES } from "../../../lib/recruitmentSetup";
import { CvError, readDocument } from "../../../lib/cvText";
import { parseCv } from "../../../lib/talent";

const STATUS = {
  queued: { label: "Queued", cls: "text-[var(--color-text-faint)]" },
  processing: { label: "Processing", cls: "text-[var(--color-text-muted)]" },
  ready: { label: "Ready", cls: "text-[var(--color-green)]" },
  review: { label: "Needs Review", cls: "text-[var(--color-amber)]" },
  duplicate: { label: "Duplicate", cls: "text-[var(--color-amber)]" },
  failed: { label: "Failed", cls: "text-[var(--color-red-hover)]" },
  imported: { label: "Imported", cls: "text-[var(--color-green)]" },
};
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const digits = (p) => String(p || "").replace(/\D/g, "").slice(-10);
const MAX_TEXT = 120000; // CV text kept for search (Long Text)

let seq = 0;

export function CvImport({ openings, onDone }) {
  const fileRef = useRef(null);
  const [items, setItems] = useState([]);
  const [opening, setOpening] = useState("");
  const [source, setSource] = useState("");
  const [consent, setConsent] = useState(false);
  const [running, setRunning] = useState(false);
  const [importing, setImporting] = useState(false);
  const [drag, setDrag] = useState(false);
  const [err, setErr] = useState("");
  const open = useMemo(() => (openings || []).filter((o) => o.status === "Open"), [openings]);

  const patch = (id, p) => setItems((list) => list.map((it) => (it.id === id ? { ...it, ...p } : it)));
  const setField = (id, k, v) => setItems((list) => list.map((it) => (it.id === id ? { ...it, fields: { ...it.fields, [k]: v }, edited: true } : it)));

  // A row is ready to import when it has a name and a valid email (ERPNext needs the email).
  const verdict = (it) => {
    if (["queued", "processing", "failed", "imported"].includes(it.status)) return it.status;
    if (it.dupKind === "file") return "duplicate";
    if (it.dupOf && it.action !== "import") return "duplicate";
    if (!it.fields.name.trim() || !EMAIL.test(it.fields.email.trim()) || it.quality === "low") return "review";
    return "ready";
  };

  async function process(list) {
    setRunning(true);
    setErr("");
    let existing = [];
    try { existing = await listApplicants(); } catch (e) { setErr(errMsg(e, "Couldn't load existing candidates for the duplicate check - duplicates won't be flagged.")); }
    const byHash = new Map(existing.filter((a) => a.custom_cv_hash).map((a) => [a.custom_cv_hash, a]));
    const seenHash = new Map();
    for (const it of list) {
      patch(it.id, { status: "processing", reason: "" });
      try {
        const doc = await readDocument(it.file);
        const p = parseCv(doc.text, it.file.name);
        const fields = { name: p.name, email: p.email, phone: p.phone, experience: p.experience ?? "", title: p.title, company: p.company, location: p.location, notice: p.notice ?? "", skills: p.skills.join(", ") };
        let dupOf = null;
        let dupKind = "";
        if (byHash.has(doc.hash)) { dupOf = byHash.get(doc.hash); dupKind = "file"; } else if (seenHash.has(doc.hash)) { dupOf = { applicant_name: seenHash.get(doc.hash), name: "" }; dupKind = "file"; } else {
          dupOf = existing.find((a) => (p.email && String(a.email_id || "").toLowerCase() === p.email) || (digits(p.phone).length === 10 && digits(a.phone_number) === digits(p.phone))) || null;
          if (dupOf) dupKind = "contact";
        }
        seenHash.set(doc.hash, it.file.name);
        const reason = doc.quality === "low" ? (doc.text.length < 50 ? "Little or no text could be read (scanned or image PDF?). Fill in the details from the CV." : "Read with low confidence - check the details.") : "";
        patch(it.id, { status: "parsed", text: doc.text, hash: doc.hash, quality: doc.quality, fields, confidence: p.confidence, dupOf, dupKind, action: dupOf ? (dupKind === "file" ? "skip" : "skip") : "import", reason });
      } catch (e) {
        patch(it.id, { status: "failed", reason: e instanceof CvError ? e.message : `Couldn't read the file: ${e?.message || e}` });
      }
    }
    setRunning(false);
  }

  function addFiles(fileList) {
    const files = [...(fileList || [])].filter((f) => f.size >= 0);
    if (!files.length) return;
    const fresh = files.map((file) => ({ id: (seq += 1), file, status: "queued", reason: "", fields: { name: "", email: "", phone: "", experience: "", title: "", company: "", location: "", notice: "", skills: "" }, confidence: {}, action: "import" }));
    setItems((list) => [...list, ...fresh]);
    process(fresh);
  }

  async function importAll() {
    setErr("");
    if (!consent) return setErr("Confirm that these candidates agreed to their data being processed.");
    const todo = items.filter((it) => ["ready", "review"].includes(verdict(it)) || (it.dupKind === "contact" && it.action === "update"));
    const blocked = todo.filter((it) => it.action !== "update" && (!it.fields.name.trim() || !EMAIL.test(it.fields.email.trim())));
    if (blocked.length) return setErr(`${blocked.length} CV(s) still need a name and a valid email - fill them in, or remove those rows.`);
    setImporting(true);
    const job = (openings || []).find((o) => o.name === opening);
    for (const it of todo) {
      const f = it.fields;
      try {
        if (it.action === "update" && it.dupOf?.name) {
          // New CV version for an existing profile: keep the recruiter's fields, flag what the new CV says differently.
          const a = it.dupOf;
          const up = await frappe.uploadFile(it.file, { doctype: "Job Applicant", docname: a.name, isPrivate: true });
          const diffs = [["Phone", a.phone_number, f.phone], ["Experience", a.custom_total_experience, f.experience], ["Location", a.custom_location, f.location], ["Title", a.custom_current_title, f.title]]
            .filter(([, was, now]) => now !== "" && now != null && String(was ?? "").trim() && String(was).trim().toLowerCase() !== String(now).trim().toLowerCase());
          await frappe.updateDoc("Job Applicant", a.name, { resume_attachment: up.file_url, custom_cv_text: it.text.slice(0, MAX_TEXT), custom_cv_hash: it.hash, custom_cv_updated_on: nowStamp(), ...(diffs.length ? { custom_needs_review: 1 } : {}) });
          await addComment("Job Applicant", a.name, `New CV uploaded (${it.file.name}).${diffs.length ? ` It differs from the profile: ${diffs.map(([k, was, now]) => `${k} ${was} → ${now}`).join("; ")}.` : ""}`).catch(() => {});
          patch(it.id, { status: "imported", reason: `CV added to ${a.applicant_name} (${a.name})${diffs.length ? " - differences flagged for review" : ""}` });
          continue;
        }
        const doc = await frappe.createDoc("Job Applicant", {
          applicant_name: f.name.trim(), email_id: f.email.trim().toLowerCase(), phone_number: f.phone.trim() || null,
          job_title: job?.name || null, designation: job?.designation || null, source: source || null,
          custom_total_experience: f.experience === "" ? null : Number(f.experience), custom_current_title: f.title || null, custom_current_company: f.company || null,
          custom_location: f.location || null, custom_notice_days: f.notice === "" ? null : Number(f.notice), custom_skills: f.skills || null,
          custom_cv_text: it.text.slice(0, MAX_TEXT), custom_cv_hash: it.hash, custom_cv_updated_on: nowStamp(), custom_needs_review: it.quality === "low" ? 1 : 0,
          status: "Open", custom_ethx_stage: "Applied", custom_stage_since: nowStamp(), custom_consent: 1, custom_consent_on: nowStamp(),
        });
        let note = "";
        try {
          const up = await frappe.uploadFile(it.file, { doctype: "Job Applicant", docname: doc.name, isPrivate: true });
          await frappe.updateDoc("Job Applicant", doc.name, { resume_attachment: up.file_url });
        } catch (e) { note = ` (profile saved, but the CV file didn't upload: ${errMsg(e, "refused")})`; }
        patch(it.id, { status: "imported", reason: `Added ${doc.name}${note}` });
      } catch (e) {
        patch(it.id, { status: "failed", reason: errMsg(e, "ERPNext refused this candidate."), retryImport: true });
      }
    }
    setImporting(false);
  }

  const shown = items.map((it) => ({ ...it, v: verdict(it) }));
  const count = (s) => shown.filter((it) => it.v === s).length;
  const toImport = shown.filter((it) => ["ready", "review"].includes(it.v) || (it.dupKind === "contact" && it.action === "update" && it.v !== "imported")).length;
  const failed = shown.filter((it) => it.v === "failed");
  const done = shown.filter((it) => it.v === "imported").length;
  const low = (it, k) => it.confidence?.[k] === "low" && !it.edited ? "!border-[var(--color-amber)]" : "";
  const cell = `${inputCls} !px-2 !py-1 !text-[12px]`;

  return (
    <div className="space-y-4 text-[13px]">
      <div
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); addFiles(e.dataTransfer.files); }}
        className={`flex flex-col items-center gap-2 rounded-lg border-2 border-dashed p-6 text-center ${drag ? "border-[var(--color-red-hover)] bg-[var(--color-surface-2)]" : "border-[var(--color-border-strong)]"}`}>
        <FileText size={22} className="text-[var(--color-text-faint)]" />
        <p className="text-[var(--color-text)]">Drop CVs here, or choose them - PDF or Word, as many as you like</p>
        <p className="text-[11.5px] text-[var(--color-text-faint)]">Each CV is read in your browser and the details are suggested for you to check. Up to 10 MB per file.</p>
        <Button type="button" variant="secondary" onClick={() => fileRef.current?.click()}><Upload size={14} /> Choose CVs</Button>
        <input ref={fileRef} type="file" multiple accept=".pdf,.docx,.doc" className="hidden" onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} />
      </div>

      {items.length > 0 && (
        <>
          <div className="flex flex-wrap items-center gap-2">
            {["queued", "processing", "ready", "review", "duplicate", "failed", "imported"].filter((s) => count(s)).map((s) => <span key={s} className={chipCls(false)}>{STATUS[s].label} {count(s)}</span>)}
            {failed.length > 0 && !running && !importing && <Button type="button" variant="ghost" onClick={() => { const retry = items.filter((it) => it.status === "failed" && !it.retryImport); if (retry.length) process(retry); setItems((l) => l.map((it) => (it.retryImport && it.status === "failed" ? { ...it, status: "parsed", retryImport: false } : it))); }}><RotateCcw size={13} /> Retry Failed</Button>}
          </div>
          <div className="max-h-[22rem] overflow-auto rounded-md border border-[var(--color-border)]">
            <table className="w-full text-left text-[12px]">
              <thead className="sticky top-0 bg-[var(--color-surface)] text-[11px] uppercase tracking-wide text-[var(--color-text-faint)]">
                <tr>{["CV", "Status", "Name", "Email", "Phone", "Exp (Yrs)", "Current Title", "Location", "Skills", ""].map((h) => <th key={h} className="px-2 py-2 font-medium">{h}</th>)}</tr>
              </thead>
              <tbody>
                {shown.map((it) => {
                  const editable = ["ready", "review"].includes(it.v) || (it.dupKind === "contact" && it.v === "duplicate");
                  return (
                    <tr key={it.id} className="border-t border-[var(--color-border)] align-top">
                      <td className="max-w-[10rem] break-words px-2 py-1.5 text-[var(--color-text)]">{it.file.name}</td>
                      <td className="px-2 py-1.5"><span className={`font-medium ${STATUS[it.v]?.cls}`}>{STATUS[it.v]?.label}</span>
                        {it.reason && <span className="mt-0.5 block max-w-[14rem] text-[11px] text-[var(--color-text-muted)]">{it.reason}</span>}
                        {it.dupOf && it.v !== "imported" && <span className="mt-0.5 block max-w-[14rem] text-[11px] text-[var(--color-text-muted)]">{it.dupKind === "file" ? "This exact CV is already imported" : "Same email / phone as"} {it.dupOf.applicant_name}{it.dupOf.name ? ` (${it.dupOf.name})` : ""}</span>}
                      </td>
                      {editable ? <>
                        <td className="px-1 py-1"><input className={`${cell} ${low(it, "name")} min-w-[8rem]`} value={it.fields.name} onChange={(e) => setField(it.id, "name", e.target.value)} /></td>
                        <td className="px-1 py-1"><input className={`${cell} ${low(it, "email")} min-w-[10rem]`} value={it.fields.email} onChange={(e) => setField(it.id, "email", e.target.value)} /></td>
                        <td className="px-1 py-1"><input className={`${cell} ${low(it, "phone")} min-w-[7rem]`} value={it.fields.phone} onChange={(e) => setField(it.id, "phone", e.target.value)} /></td>
                        <td className="px-1 py-1"><input type="number" step="0.1" min="0" className={`${cell} ${low(it, "experience")} w-16`} value={it.fields.experience} onChange={(e) => setField(it.id, "experience", e.target.value)} /></td>
                        <td className="px-1 py-1"><input className={`${cell} ${low(it, "title")} min-w-[8rem]`} value={it.fields.title} onChange={(e) => setField(it.id, "title", e.target.value)} /></td>
                        <td className="px-1 py-1"><input className={`${cell} ${low(it, "location")} min-w-[6rem]`} value={it.fields.location} onChange={(e) => setField(it.id, "location", e.target.value)} /></td>
                        <td className="px-1 py-1"><input className={`${cell} ${low(it, "skills")} min-w-[10rem]`} value={it.fields.skills} onChange={(e) => setField(it.id, "skills", e.target.value)} /></td>
                      </> : <td colSpan={7} className="px-2 py-1.5 text-[var(--color-text-muted)]">{it.v === "imported" || it.v === "failed" ? "" : it.v === "duplicate" ? "Skipped" : "…"}</td>}
                      <td className="px-1 py-1">
                        {it.dupKind === "contact" && it.v !== "imported" && (
                          <select className={`${cell} w-40`} value={it.action} onChange={(e) => patch(it.id, { action: e.target.value })}>
                            <option value="skip">Skip</option>
                            <option value="update">Add as New CV Version</option>
                            <option value="import">Import as Separate Candidate</option>
                          </select>
                        )}
                        {it.v !== "imported" && !importing && <button type="button" className="mt-1 block text-[11px] text-[var(--color-text-faint)] hover:text-[var(--color-red-hover)]" onClick={() => setItems((l) => l.filter((x) => x.id !== it.id))}>Remove</button>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="text-[11px] text-[var(--color-text-faint)]">Fields outlined in amber were guessed - check them against the CV. Rows marked Needs Review are imported flagged for review.</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Opening (Optional)">
              <select className={inputCls} value={opening} onChange={(e) => setOpening(e.target.value)}>
                <option value="">Talent pool (no opening)</option>
                {open.map((o) => <option key={o.name} value={o.name}>{o.job_title || o.name}</option>)}
              </select>
            </Field>
            <Field label="Source">
              <select className={inputCls} value={source} onChange={(e) => setSource(e.target.value)}>
                <option value="">Not set</option>
                {SOURCES.filter((s) => s !== "Employee Referral").map((s) => <option key={s}>{s}</option>)}
              </select>
            </Field>
          </div>
          <label className="flex items-center gap-2 text-[12px] text-[var(--color-text-muted)]"><input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} /> These candidates agreed to their data being processed for recruitment</label>
        </>
      )}
      {err && <Notice>{err}</Notice>}
      {done > 0 && !importing && !toImport && <Notice tone="info">{done} CV(s) imported.</Notice>}
      <div className="flex justify-end gap-2">
        {done > 0 && <Button type="button" variant="ghost" onClick={() => onDone(`${done} candidate(s) imported from CVs.`)}>Done</Button>}
        <Button type="button" disabled={running || importing || !toImport} onClick={importAll}>{importing ? "Importing…" : running ? "Reading CVs…" : `Import ${toImport} CV(s)`}</Button>
      </div>
    </div>
  );
}
