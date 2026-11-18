// Add many candidates at once: CVs (PDF / Word, see CvImport.jsx), or a CSV / Excel file or rows pasted from Excel. Every row is checked first (name and
// email present, not repeated in the file, not already a candidate), then the good rows are added as Applied.
import { useMemo, useRef, useState } from "react";
import { CheckCircle2, Download, Upload, XCircle } from "lucide-react";
import { Button } from "../../../components/ui/primitives";
import { chipCls, Field, Grid, inputCls, Modal, Notice } from "../../../components/employee/EmployeeShell";
import { CvImport } from "./CvImport";
import { errMsg, nowStamp } from "../../../lib/employeePortal";
import { frappe } from "../../../lib/api/frappeClient";
import { listApplicants } from "../../../lib/recruitment";
import { SOURCES } from "../../../lib/recruitmentSetup";
import { downloadSheet, parseCsv, readSheets } from "../../../lib/sheet";

// Header text -> field. Checked in order, so "Current CTC" is matched before "Current Company".
const COLUMNS = [
  ["current_ctc", /current\s*ctc/i],
  ["expected_ctc", /expected\s*ctc/i],
  ["email", /e-?mail/i],
  ["phone", /phone|mobile|contact\s*(no|number)/i],
  ["opening", /opening|position|job|role/i],
  ["company", /company|employer/i],
  ["experience", /experience|^exp(\.|\s|$)/i],
  ["notice", /notice/i],
  ["location", /location|city/i],
  ["skills", /skill/i],
  ["source", /source/i],
  ["resume", /resume|cv/i],
  ["name", /name|candidate|applicant/i],
];
const TEMPLATE = [
  ["Full Name", "Email", "Phone", "Opening", "Current Company", "Total Experience (Years)", "Notice Period (Days)", "Location", "Skills", "Current CTC", "Expected CTC", "Source", "Resume Link"],
  ["Example (delete this row)", "asha.rao@example.com", "+91 98765 43210", "", "Acme Ltd", "4", "30", "Pune", "React, Node", "800000", "1000000", "LinkedIn", "https://…"],
];

const clean = (v) => (v == null ? "" : v instanceof Date ? v.toISOString().slice(0, 10) : String(v).replace(/\s+/g, " ").trim());
const num = (v) => { const n = Number(String(v).replace(/[^\d.]/g, "")); return String(v).trim() && Number.isFinite(n) ? n : null; };
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** First rows of a sheet -> { header index, column map } when it looks like a candidate list. */
function findHeader(data) {
  for (let i = 0; i < Math.min(data.length, 10); i += 1) {
    const map = {};
    (data[i] || []).forEach((c, idx) => {
      const h = clean(c);
      const hit = h && COLUMNS.find(([k, re]) => map[k] == null && re.test(h));
      if (hit) map[hit[0]] = idx;
    });
    if (map.name != null && map.email != null) return { header: i, map };
  }
  return null;
}

function rowsFrom(sheets) {
  for (const { data } of sheets) {
    const h = findHeader(data);
    if (!h) continue;
    return data.slice(h.header + 1).map((cells, i) => {
      const get = (k) => (h.map[k] == null ? "" : clean(cells[h.map[k]]));
      return { line: h.header + i + 2, name: get("name"), email: get("email").toLowerCase(), phone: get("phone"), opening: get("opening"), company: get("company"), experience: get("experience"), notice: get("notice"), location: get("location"), skills: get("skills"), current_ctc: get("current_ctc"), expected_ctc: get("expected_ctc"), source: get("source"), resume: get("resume") };
    }).filter((r) => (r.name || r.email) && !/^example/i.test(r.name));
  }
  return null;
}

export function ImportCandidatesModal({ openings, onClose, onDone }) {
  const fileRef = useRef(null);
  const open = useMemo(() => (openings || []).filter((o) => o.status === "Open"), [openings]);
  const [rows, setRows] = useState(null);
  const [paste, setPaste] = useState("");
  const [opening, setOpening] = useState("");
  const [source, setSource] = useState("");
  const [consent, setConsent] = useState(false);
  const [existing, setExisting] = useState(new Set());
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [log, setLog] = useState(null);
  const [tab, setTab] = useState("cv");

  async function load(list) {
    setErr("");
    setLog(null);
    if (!list) { setRows(null); return setErr("Couldn't find the header row. The first rows need at least a \"Name\" and an \"Email\" column - download the template to see the expected columns."); }
    if (!list.length) { setRows(null); return setErr("The header row is there but no candidates are under it."); }
    const emails = [...new Set(list.map((r) => r.email).filter(Boolean))];
    const found = emails.length ? await listApplicants([["email_id", "in", emails]]).catch(() => []) : [];
    setExisting(new Set(found.map((a) => String(a.email_id || "").toLowerCase())));
    setRows(list);
  }

  async function pickFile(file) {
    if (fileRef.current) fileRef.current.value = "";
    if (!file) return;
    if (!/\.(xlsx|csv|txt)$/i.test(file.name)) return setErr("Choose a CSV or Excel (.xlsx) file.");
    try { await load(rowsFrom(await readSheets(file))); } catch (e) { setErr(`Couldn't read ${file.name}: ${e?.message || e}`); }
  }

  const openingFor = (r) => {
    if (!r.opening) return opening;
    const t = r.opening.toLowerCase();
    return (openings || []).find((o) => o.name.toLowerCase() === t || String(o.job_title || "").toLowerCase() === t)?.name || "";
  };
  const sourceFor = (r) => SOURCES.find((s) => s.toLowerCase() === (r.source || source).toLowerCase()) || "";

  // Each row's verdict, in file order (a repeated email: the first one counts).
  const checked = useMemo(() => {
    const seen = new Set();
    return (rows || []).map((r) => {
      const problems = [];
      if (!r.name) problems.push("No name");
      if (!r.email) problems.push("No email");
      else if (!EMAIL.test(r.email)) problems.push("Email doesn't look right");
      else if (existing.has(r.email)) problems.push("Already a candidate");
      else if (seen.has(r.email)) problems.push("Repeated in this file");
      if (r.email) seen.add(r.email);
      if (r.opening && !openingFor(r)) problems.push(`Opening "${r.opening}" not found`);
      return { ...r, problems, key: `${r.line}` };
    });
  }, [rows, existing, opening, openings]); // eslint-disable-line react-hooks/exhaustive-deps
  const good = checked.filter((r) => !r.problems.length);

  async function importRows() {
    setErr("");
    if (!consent) return setErr("Confirm that these candidates agreed to their data being processed.");
    setBusy(true);
    const results = [];
    for (const r of good) {
      const job = openingFor(r);
      const o = (openings || []).find((x) => x.name === job);
      try {
        const doc = await frappe.createDoc("Job Applicant", {
          applicant_name: r.name, email_id: r.email, phone_number: r.phone || null, job_title: job || null, designation: o?.designation || null,
          source: sourceFor(r) || null, custom_current_company: r.company || null, custom_total_experience: num(r.experience), custom_notice_days: num(r.notice),
          custom_location: r.location || null, custom_skills: r.skills || null, custom_current_ctc: num(r.current_ctc), custom_expected_ctc: num(r.expected_ctc), resume_link: r.resume || null,
          status: "Open", custom_ethx_stage: "Applied", custom_stage_since: nowStamp(), custom_consent: 1, custom_consent_on: nowStamp(),
        });
        results.push({ key: r.key, name: r.name, ok: true, text: `Added ${doc.name}` });
      } catch (e) {
        results.push({ key: r.key, name: r.name, ok: false, text: errMsg(e, "Refused") });
      }
      setLog([...results]);
    }
    setBusy(false);
    const failed = results.filter((x) => !x.ok).length;
    if (!failed) onDone(`${results.length} candidate(s) added.`);
    else setErr(`${results.length - failed} added, ${failed} couldn't be added - see the reasons below.`);
  }

  return (
    <Modal title="Import Candidates" onClose={onClose} wide="xl">
      <div className="mb-4 flex gap-2">
        <button type="button" onClick={() => setTab("cv")} className={chipCls(tab === "cv")}>CVs (PDF / Word)</button>
        <button type="button" onClick={() => setTab("sheet")} className={chipCls(tab === "sheet")}>Spreadsheet (CSV / Excel)</button>
      </div>
      {tab === "cv" ? <CvImport openings={openings} onDone={onDone} /> : (
      <div className="space-y-4 text-[13px]">
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="secondary" onClick={() => downloadSheet("candidates-template.csv", TEMPLATE)}><Download size={14} /> Template</Button>
          <Button type="button" variant="secondary" onClick={() => fileRef.current?.click()}><Upload size={14} /> Upload CSV / Excel</Button>
          <input ref={fileRef} type="file" accept=".csv,.xlsx,.txt" className="hidden" onChange={(e) => pickFile(e.target.files[0])} />
          <span className="text-[12px] text-[var(--color-text-faint)]">or paste rows copied from Excel, with the header row:</span>
        </div>
        <div className="flex gap-2">
          <textarea rows={3} className={inputCls} value={paste} onChange={(e) => setPaste(e.target.value)} placeholder={"Full Name\tEmail\tPhone\nAsha Rao\tasha@example.com\t98765 43210"} />
          <Button type="button" variant="ghost" disabled={!paste.trim()} onClick={() => load(rowsFrom([{ sheet: "Pasted", data: parseCsv(paste) }]))}>Read</Button>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Opening (for rows without one)">
            <select className={inputCls} value={opening} onChange={(e) => setOpening(e.target.value)}>
              <option value="">Talent pool (no opening)</option>
              {open.map((o) => <option key={o.name} value={o.name}>{o.job_title || o.name}</option>)}
            </select>
          </Field>
          <Field label="Source (for rows without one)">
            <select className={inputCls} value={source} onChange={(e) => setSource(e.target.value)}>
              <option value="">Not set</option>
              {SOURCES.filter((s) => s !== "Employee Referral").map((s) => <option key={s}>{s}</option>)}
            </select>
          </Field>
        </div>

        {rows && (
          <>
            <p className="text-[12px] text-[var(--color-text-muted)]">{good.length} of {checked.length} row(s) ready to add{checked.length - good.length ? `; ${checked.length - good.length} will be skipped` : ""}.</p>
            <Grid rows={checked} rowKey={(r) => r.key} columns={[
              { key: "line", label: "Row" },
              { key: "name", label: "Name", render: (r) => r.name || "—" },
              { key: "email", label: "Email", render: (r) => r.email || "—" },
              { key: "phone", label: "Phone", render: (r) => r.phone || "—" },
              { key: "opening", label: "Opening", render: (r) => { const o = (openings || []).find((x) => x.name === openingFor(r)); return o ? o.job_title || o.name : "Talent pool"; } },
              { key: "problems", label: "Check", render: (r) => {
                const done = log?.find((x) => x.key === r.key);
                if (done) return <span className={`flex items-center gap-1 ${done.ok ? "text-[var(--color-green)]" : "text-[var(--color-red-hover)]"}`}>{done.ok ? <CheckCircle2 size={13} /> : <XCircle size={13} />} {done.text}</span>;
                return r.problems.length ? <span className="text-[var(--color-amber)]">Skipped: {r.problems.join(", ")}</span> : <span className="text-[var(--color-green)]">Ready</span>;
              } },
            ]} />
            <label className="flex items-center gap-2 text-[12px] text-[var(--color-text-muted)]"><input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} /> These candidates agreed to their data being processed for recruitment</label>
          </>
        )}
        {err && <Notice>{err}</Notice>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>{log ? "Close" : "Cancel"}</Button>
          <Button type="button" disabled={busy || !good.length || Boolean(log?.length === good.length && !err)} onClick={importRows}>{busy ? `Adding ${log?.length || 0} of ${good.length}…` : `Add ${good.length} Candidate(s)`}</Button>
        </div>
      </div>
      )}
    </Modal>
  );
}
