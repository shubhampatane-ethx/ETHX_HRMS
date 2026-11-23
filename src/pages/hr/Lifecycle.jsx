// HR › Lifecycle: promotions, transfers and exits on HRMS's own records (Employee Promotion, Employee Transfer,
// Employee Separation). Submitting a promotion / transfer updates the Employee record (HRMS does this on its
// effective date), and can be edited while a draft, revised or withdrawn after; an exit runs the separation checklist, then HR marks the employee as Left. HR can cancel an exit
// (the employee withdraws their resignation), which puts the Employee record back to Active.
import { useRef, useState } from "react";
import { ExternalLink, FileDown, LogOut, Paperclip, Pencil, Plus, Trash2, TrendingUp, Undo2, Upload } from "lucide-react";
import { frappe } from "../../lib/api/frappeClient";
import { Button, DateField, LinkField } from "../../components/ui/primitives";
import { Async, Field, Grid, inputCls, Modal, Notice, PageHeader, Panel, StatusPill, Tabs } from "../../components/employee/EmployeeShell";
import { dmy, errMsg, isoDate, listTry, money, useAsync } from "../../lib/employeePortal";
import { confirmDialog } from "../../components/ui/dialogs";

// Employee fields a promotion or transfer can change, with the doctype they link to.
const PROPS = [
  { fieldname: "designation", label: "Designation", link: "Designation" },
  { fieldname: "department", label: "Department", link: "Department" },
  { fieldname: "grade", label: "Grade", link: "Employee Grade" },
  { fieldname: "branch", label: "Branch", link: "Branch" },
  { fieldname: "reports_to", label: "Reports To", link: "Employee", title: "employee_name" },
];
const statusOf = (d) => (d.docstatus === 2 ? "Cancelled" : d.docstatus === 1 ? "Submitted" : "Draft");

export default function Lifecycle() {
  const [tab, setTab] = useState("promotions");
  return (
    <div className="space-y-5">
      <PageHeader icon={TrendingUp} title="Employee Lifecycle" subtitle="Promotions, transfers and exits - each updates the employee record when it takes effect" />
      <Tabs value={tab} onChange={setTab} tabs={[{ id: "promotions", label: "Promotions" }, { id: "transfers", label: "Transfers" }, { id: "exits", label: "Exits" }]} />
      {tab === "promotions" && <Moves kind="promotion" />}
      {tab === "transfers" && <Moves kind="transfer" />}
      {tab === "exits" && <Exits />}
    </div>
  );
}

const DT = { promotion: "Employee Promotion", transfer: "Employee Transfer" };

function Moves({ kind }) {
  const dt = DT[kind];
  const date = kind === "promotion" ? "promotion_date" : "transfer_date";
  const list = useAsync(() => listTry(dt, { fields: ["name", "employee", "employee_name", date, "docstatus", "company", "amended_from", ...(kind === "promotion" ? ["revised_ctc", "current_ctc"] : ["new_company"])], orderBy: `${date} desc` }, ["name", "employee", "employee_name", date, "docstatus"]), [dt]);
  const details = useAsync(async () => {
    const names = (list.data || []).map((r) => r.name);
    if (!names.length) return {};
    const rows = await frappe.getList("Employee Property History", { parent: dt, filters: [["parent", "in", names]], fields: ["parent", "property", "current", "new"], limit: 0 }).catch(() => []);
    const m = {};
    rows.forEach((r) => { (m[r.parent] ||= []).push(r); });
    return m;
  }, [list.data]);
  const [modal, setModal] = useState(null); // { record?, revise? }
  const [msg, setMsg] = useState(null);
  const done = (text) => { setMsg({ ok: true, text }); list.reload(); };

  async function submit(r) {
    if (r[date] > isoDate()) return setMsg({ ok: false, text: `A ${kind} can only be submitted on or after its effective date (${dmy(r[date])}). Submit it then.` });
    if (!(await confirmDialog(`Submit this ${kind}? The employee record is updated now.`))) return;
    try {
      await frappe.submitDoc(await frappe.getDoc(dt, r.name));
      done(`${r.employee_name}: ${kind} submitted.`);
    } catch (e) {
      setMsg({ ok: false, text: errMsg(e, `Couldn't submit the ${kind}.`) });
    }
  }

  // A draft is simply deleted; a submitted one is cancelled, which makes HRMS put the employee record back.
  async function withdraw(r) {
    const submitted = r.docstatus === 1;
    const ok = await confirmDialog({
      title: `Withdraw ${kind === "promotion" ? "Promotion" : "Transfer"}`,
      message: submitted ? `Cancel ${r.employee_name}'s ${kind}? The employee record goes back to what it was before (${(details.data?.[r.name] || []).map((p) => `${p.property}: ${p.current || "—"}`).join(", ") || "previous details"}).` : `Delete ${r.employee_name}'s draft ${kind}? Nothing on the employee record has changed yet.`,
      confirmLabel: submitted ? "Cancel It" : "Delete Draft",
      danger: true,
    });
    if (!ok) return;
    try {
      if (submitted) await frappe.cancelDoc(dt, r.name);
      else await frappe.deleteDoc(dt, r.name);
      done(submitted ? `${r.employee_name}: ${kind} cancelled and the employee record restored.` : `${r.employee_name}: draft ${kind} deleted.`);
    } catch (e) {
      setMsg({ ok: false, text: errMsg(e, `Couldn't withdraw the ${kind}.`) });
    }
  }

  async function letter(r) {
    setMsg(null);
    try {
      const [doc, emp] = await Promise.all([frappe.getDoc(dt, r.name), frappe.getDoc("Employee", r.employee)]);
      downloadLetter(kind, doc, emp);
    } catch (e) {
      setMsg({ ok: false, text: errMsg(e, "Couldn't prepare the letter.") });
    }
  }

  const act = "flex items-center gap-1 rounded px-1.5 py-1 text-[11.5px] text-[var(--color-text-muted)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text)]";
  return (
    <Panel action={<div className="flex flex-wrap gap-2"><Button variant="secondary" onClick={() => downloadTemplate(kind)}><FileDown size={14} /> Letter Template</Button><Button onClick={() => setModal({})}><Plus size={14} /> New {kind === "promotion" ? "Promotion" : "Transfer"}</Button></div>}>
      {msg && <div className="mb-3"><Notice tone={msg.ok ? "info" : "error"}>{msg.text}</Notice></div>}
      <Async state={list}>
        {(rows) => <Grid rows={rows} empty={`No ${kind}s yet.`} columns={[
          { key: "employee_name", label: "Employee", render: (r) => <span>{r.employee_name}<span className="block text-[11px] text-[var(--color-text-faint)]">{r.name}{r.amended_from ? ` · revises ${r.amended_from}` : ""}</span></span> },
          { key: date, label: "Effective", render: (r) => dmy(r[date]) },
          { key: "changes", label: "Changes", render: (r) => <span className="text-[12px]">{(details.data?.[r.name] || []).map((p) => `${p.property}: ${p.current || "—"} → ${p.new}`).join(" · ") || "—"}{kind === "transfer" && r.new_company && r.new_company !== r.company ? ` · Company → ${r.new_company}` : ""}{kind === "promotion" && Number(r.revised_ctc) ? ` · CTC → ${money(r.revised_ctc)}` : ""}</span> },
          { key: "status", label: "Status", render: (r) => <StatusPill status={statusOf(r)} /> },
          { key: "_a", label: "", render: (r) => (
            <div className="flex flex-wrap items-center justify-end gap-1">
              {r.docstatus === 0 && (r[date] > isoDate() ? <span className="mr-1 text-[11px] text-[var(--color-text-faint)]">Submit on {dmy(r[date])}</span> : <Button variant="secondary" className="!px-2 !py-1 text-[11px]" onClick={() => submit(r)}>Submit</Button>)}
              {r.docstatus === 0 && <button type="button" className={act} onClick={() => setModal({ record: r })}><Pencil size={12} /> Edit</button>}
              {r.docstatus === 1 && <button type="button" className={act} title="Cancel this one and save a corrected copy" onClick={() => setModal({ record: r, revise: true })}><Pencil size={12} /> Revise</button>}
              {r.docstatus < 2 && <button type="button" className={act} onClick={() => letter(r)}><FileDown size={12} /> Letter</button>}
              {r.docstatus < 2 && <button type="button" className={`${act} hover:!text-[var(--color-red-hover)]`} onClick={() => withdraw(r)}><Undo2 size={12} /> Withdraw</button>}
            </div>
          ) },
        ]} />}
      </Async>
      {modal && <MoveModal kind={kind} record={modal.record} revise={modal.revise} onClose={() => setModal(null)} onSaved={(text) => { setModal(null); done(text); }} />}
    </Panel>
  );
}

/* --------------------------- promotion / transfer letters --------------------------- */

const LETTER = {
  promotion: { title: "Letter of Promotion", body: "We are pleased to inform you that, in recognition of your performance and contribution, you have been promoted with effect from {date}." },
  transfer: { title: "Letter of Transfer", body: "This is to inform you that you are being transferred with effect from {date}, as detailed below." },
};
const escapeHtml = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// A Word-compatible letter (HTML saved as .doc opens in Word for edits and printing on letterhead).
function letterHtml(kind, v) {
  const L = LETTER[kind];
  const rows = v.changes.map((c) => `<tr><td style="padding:4px 12px 4px 0">${escapeHtml(c.property)}</td><td style="padding:4px 12px">${escapeHtml(c.current || "—")}</td><td style="padding:4px 12px"><b>${escapeHtml(c.new)}</b></td></tr>`).join("");
  return `<html><head><meta charset="utf-8"><title>${L.title}</title></head><body style="font-family:Calibri,Arial,sans-serif;font-size:11pt;line-height:1.5">
<p style="text-align:right">Date: ${escapeHtml(v.today)}</p>
<p>To,<br><b>${escapeHtml(v.name)}</b><br>Employee ID: ${escapeHtml(v.id)}<br>${escapeHtml(v.designation)}${v.department ? `, ${escapeHtml(v.department)}` : ""}</p>
<p style="text-align:center"><b><u>${L.title.toUpperCase()}</u></b></p>
<p>Dear ${escapeHtml(v.first)},</p>
<p>${escapeHtml(L.body.replace("{date}", v.date))}</p>
${rows ? `<table style="border-collapse:collapse;margin:8px 0"><tr><th style="text-align:left;padding:4px 12px 4px 0">Detail</th><th style="text-align:left;padding:4px 12px">Current</th><th style="text-align:left;padding:4px 12px">New</th></tr>${rows}</table>` : ""}
${v.ctc ? `<p>Your revised annual CTC will be <b>${escapeHtml(v.ctc)}</b>. All other terms of your employment remain unchanged.</p>` : "<p>All other terms of your employment remain unchanged.</p>"}
${kind === "transfer" && v.newCompany ? `<p>You will now be part of <b>${escapeHtml(v.newCompany)}</b>.</p>` : ""}
<p>We wish you continued success in your ${kind === "promotion" ? "new role" : "new assignment"}.</p>
<p>Yours sincerely,<br><br><br>For <b>${escapeHtml(v.company)}</b><br>Authorised Signatory<br>Human Resources</p>
</body></html>`;
}

function save(filename, html) {
  const url = URL.createObjectURL(new Blob(["﻿", html], { type: "application/msword" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function downloadLetter(kind, doc, emp) {
  const rows = (kind === "promotion" ? doc.promotion_details : doc.transfer_details) || [];
  save(`${kind}-letter-${emp.employee_name || emp.name}.doc`.replace(/\s+/g, "-"), letterHtml(kind, {
    today: dmy(isoDate()), name: emp.employee_name || emp.name, first: emp.first_name || String(emp.employee_name || "").split(" ")[0], id: emp.employee_number || emp.name,
    designation: rows.find((r) => r.fieldname === "designation")?.current || emp.designation || "", department: emp.department || "",
    date: dmy(doc.promotion_date || doc.transfer_date), changes: rows.map((r) => ({ property: r.property, current: r.current, new: r.new })),
    ctc: Number(doc.revised_ctc) ? money(doc.revised_ctc) : "", company: doc.company || emp.company || "", newCompany: doc.new_company && doc.new_company !== doc.company ? doc.new_company : "",
  }));
}

/** The letter with placeholders, for HR to adapt in Word. */
function downloadTemplate(kind) {
  save(`${kind}-letter-template.doc`, letterHtml(kind, {
    today: "{Letter Date}", name: "{Employee Name}", first: "{First Name}", id: "{Employee ID}", designation: "{Current Designation}", department: "{Department}", date: "{Effective Date}",
    changes: [{ property: "{Detail, e.g. Designation}", current: "{Current}", new: "{New}" }], ctc: kind === "promotion" ? "{Revised CTC}" : "", company: "{Company}", newCompany: kind === "transfer" ? "{New Company, if changing}" : "",
  }));
}

// Grades are a short list HR manages; one that's missing can be added straight from the picker.
const createGrade = async (text) => (await frappe.createDoc("Employee Grade", { __newname: text, name: text })).name || text;

function MoveModal({ kind, record, revise, onClose, onSaved }) {
  const dt = DT[kind];
  const editing = Boolean(record);
  const full = useAsync(() => (record ? frappe.getDoc(dt, record.name) : Promise.resolve(null)), [record?.name]);
  const [employee, setEmployee] = useState(record?.employee || "");
  const emp = useAsync(() => (employee ? frappe.getDoc("Employee", employee) : Promise.resolve(null)), [employee]);
  const [values, setValues] = useState(null); // null until loaded from the record (editing) or first change
  const [f, setF] = useState({ date: record ? record[kind === "promotion" ? "promotion_date" : "transfer_date"] : isoDate(), revised_ctc: "", new_company: "", submitNow: false });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const e = emp.data;
  // When editing, start from the record's own changes (and CTC / new company) once it has loaded.
  const loaded = full.data;
  const startValues = loaded ? Object.fromEntries(((kind === "promotion" ? loaded.promotion_details : loaded.transfer_details) || []).map((r) => [r.fieldname, r.new])) : {};
  const vals = values ?? startValues;
  const ctc = f.revised_ctc !== "" ? f.revised_ctc : loaded && Number(loaded.revised_ctc) ? String(loaded.revised_ctc) : "";
  const newCompany = f.new_company || (loaded?.new_company && loaded.new_company !== loaded.company ? loaded.new_company : "");
  // The "current" side: the record's own values when revising a submitted one (the employee already shows the new ones).
  const currentOf = (p) => {
    const row = ((kind === "promotion" ? loaded?.promotion_details : loaded?.transfer_details) || []).find((r) => r.fieldname === p.fieldname);
    return revise && row ? row.current || "" : e?.[p.fieldname] || "";
  };
  const changes = e ? PROPS.filter((p) => vals[p.fieldname] && vals[p.fieldname] !== currentOf(p)) : [];
  const setValue = (k, v) => setValues({ ...vals, [k]: v });

  async function submit(ev) {
    ev.preventDefault();
    if (!changes.length && !(kind === "promotion" && ctc) && !(kind === "transfer" && newCompany && newCompany !== e.company)) return setErr("Change at least one detail.");
    // ERPNext requires at least one property row on a transfer (e.g. the department in the new company)
    if (kind === "transfer" && !changes.length) return setErr("Also choose what changes with the transfer (for example the department or designation in the new company).");
    if (f.submitNow && f.date > isoDate()) return setErr(`A ${kind} can only be submitted on or after its effective date - save it now and submit it on ${dmy(f.date)}.`);
    if (revise && !(await confirmDialog({ title: `Revise ${kind === "promotion" ? "Promotion" : "Transfer"}`, message: `${record.name} is cancelled (the employee record goes back first) and a corrected copy is saved${f.submitNow ? " and submitted" : " as a draft"}.`, confirmLabel: "Revise" }))) return;
    setBusy(true);
    setErr("");
    try {
      const details = changes.map((p) => ({ property: p.label, fieldname: p.fieldname, current: currentOf(p), new: vals[p.fieldname] }));
      const doc = kind === "promotion"
        ? { employee, promotion_date: f.date, company: e.company, promotion_details: details, revised_ctc: ctc ? Number(ctc) : 0, ...(ctc ? { current_ctc: loaded?.current_ctc || e.ctc || 0, salary_currency: e.salary_currency || undefined } : {}) }
        : { employee, transfer_date: f.date, company: e.company, new_company: newCompany || e.company, transfer_details: details };
      let name;
      if (editing && !revise) {
        await frappe.updateDoc(dt, record.name, doc);
        name = record.name;
      } else {
        if (revise) await frappe.cancelDoc(dt, record.name);
        name = (await frappe.createDoc(dt, { ...doc, ...(revise ? { amended_from: record.name } : {}) })).name;
      }
      if (f.submitNow) await frappe.submitDoc(await frappe.getDoc(dt, name));
      const who = e.employee_name || employee;
      onSaved(revise ? `${who}: ${record.name} cancelled and revised as ${name}${f.submitNow ? " (submitted)" : " (draft)"}.` : editing ? `${who}: ${kind} updated${f.submitNow ? " and submitted" : ""}.` : `${who}: ${kind} saved${f.submitNow ? " and submitted" : " as a draft"}.`);
    } catch (x) {
      setErr(errMsg(x, `Couldn't save the ${kind}.`));
      setBusy(false);
    }
  }

  const title = `${revise ? "Revise" : editing ? "Edit" : "New"} ${kind === "promotion" ? "Promotion" : "Transfer"}${record ? ` · ${record.employee_name}` : ""}`;
  return (
    <Modal title={title} onClose={onClose} wide>
      <form onSubmit={submit} className="space-y-3">
        {revise && <Notice tone="info">This {kind} is already submitted. Revising cancels it (the employee record goes back) and saves a corrected copy.</Notice>}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {editing ? <Field label="Employee"><input readOnly className={inputCls} value={record.employee_name || record.employee} /></Field> : <LinkField label="Employee" linkDoctype="Employee" value={employee} onChange={(v) => { setEmployee(v); setValues({}); }} required frappe={frappe} />}
          <DateField label={kind === "promotion" ? "Promotion Date" : "Transfer Date"} value={f.date} onChange={(v) => setF({ ...f, date: v })} required />
        </div>
        {e && (!editing || loaded) && (
          <>
            <table className="w-full text-left text-[12.5px]">
              <thead><tr className="text-[var(--color-text-muted)]"><th className="py-1.5 font-medium">Detail</th><th className="py-1.5 font-medium">Current</th><th className="py-1.5 font-medium">New (Leave Empty to Keep)</th></tr></thead>
              <tbody>
                {PROPS.map((p) => (
                  <tr key={p.fieldname} className="border-t border-[var(--color-border)]">
                    <td className="py-1.5 pr-3 text-[var(--color-text)]">{p.label}</td>
                    <td className="py-1.5 pr-3 text-[var(--color-text-muted)]">{currentOf(p) || "—"}</td>
                    <td className="py-1.5"><LinkField label="" linkDoctype={p.link} titleField={p.title} value={vals[p.fieldname] || ""} onChange={(v) => setValue(p.fieldname, v)} frappe={frappe} onCreate={p.fieldname === "grade" ? createGrade : undefined} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="text-[11px] text-[var(--color-text-faint)]">Grade not in the list? Type it and choose "+ Create" to add it.</p>
            {kind === "promotion" && <Field label={`Revised CTC (₹/yr)${e.ctc ? ` - current ${money(e.ctc)}` : ""}`}><input type="number" min="0" className={inputCls} value={ctc} onChange={(x) => setF({ ...f, revised_ctc: x.target.value })} /></Field>}
            {kind === "transfer" && <LinkField label={`New company (current: ${e.company})`} linkDoctype="Company" value={newCompany} onChange={(v) => setF({ ...f, new_company: v })} frappe={frappe} />}
          </>
        )}
        {editing && !loaded && !full.error && <p className="text-[13px] text-[var(--color-text-muted)]">Loading…</p>}
        {full.error && <Notice>{errMsg(full.error, `Couldn't open this ${kind}.`)}</Notice>}
        <label className="flex items-center gap-2 text-[12px] text-[var(--color-text-muted)]"><input type="checkbox" checked={f.submitNow} onChange={(x) => setF({ ...f, submitNow: x.target.checked })} /> Submit now (otherwise saved as a draft to review)</label>
        {err && <Notice>{err}</Notice>}
        <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={onClose}>Cancel</Button><Button type="submit" disabled={busy || !e || (editing && !loaded)}>{busy ? "Saving…" : revise ? "Revise" : editing ? "Save Changes" : "Save"}</Button></div>
      </form>
    </Modal>
  );
}

/* ---------------------------------- exits ---------------------------------- */

function Exits() {
  const list = useAsync(() => listTry("Employee Separation", { filters: [["docstatus", "<", 2]], fields: ["name", "employee", "employee_name", "resignation_letter_date", "boarding_begins_on", "boarding_status", "docstatus", "department", "designation"], orderBy: "creation desc" }, ["name", "employee", "employee_name", "boarding_begins_on", "boarding_status", "docstatus"]), []);
  const emps = useAsync(async () => {
    const ids = [...new Set((list.data || []).map((r) => r.employee))];
    if (!ids.length) return {};
    const rows = await frappe.getList("Employee", { filters: [["name", "in", ids]], fields: ["name", "status", "relieving_date", "user_id"], limit: 0 });
    return Object.fromEntries(rows.map((r) => [r.name, r]));
  }, [list.data]);
  const [modal, setModal] = useState(null);
  const [msg, setMsg] = useState(null);

  return (
    <Panel action={<div className="flex flex-wrap gap-2"><Button variant="secondary" onClick={() => setModal({ kind: "templates" })}><Paperclip size={14} /> Template Documents</Button><Button onClick={() => setModal({ kind: "new" })}><Plus size={14} /> Start Exit</Button></div>}>
      {msg && <div className="mb-3"><Notice tone={msg.ok ? "info" : "error"}>{msg.text}</Notice></div>}
      <Async state={list}>
        {(rows) => <Grid rows={rows} empty="No exits in progress." columns={[
          { key: "employee_name", label: "Employee", render: (r) => <span>{r.employee_name}<span className="block text-[11px] text-[var(--color-text-faint)]">{[r.designation, r.department].filter(Boolean).join(" · ")}</span></span> },
          { key: "resignation_letter_date", label: "Resigned", render: (r) => dmy(r.resignation_letter_date) || "—" },
          { key: "boarding_begins_on", label: "Last Working Day", render: (r) => dmy(r.boarding_begins_on) },
          { key: "boarding_status", label: "Checklist", render: (r) => <StatusPill status={r.docstatus === 0 ? "Draft" : r.boarding_status} /> },
          { key: "emp", label: "Employee Status", render: (r) => { const e = emps.data?.[r.employee]; return e ? <span><StatusPill status={e.status} />{e.relieving_date && <span className="block text-[10.5px] text-[var(--color-text-faint)]">relieved {dmy(e.relieving_date)}</span>}</span> : "…"; } },
          { key: "_a", label: "", render: (r) => {
            const e = emps.data?.[r.employee];
            return <div className="flex justify-end gap-1">
              {r.docstatus === 0 && <Button variant="secondary" className="!px-2 !py-1 text-[11px]" onClick={async () => { if (!(await confirmDialog(`Start the separation checklist for ${r.employee_name || r.employee}?`))) return; try { await frappe.submitDoc(await frappe.getDoc("Employee Separation", r.name)); list.reload(); } catch (x) { setMsg({ ok: false, text: errMsg(x, "Couldn't start the checklist.") }); } }}>Start Checklist</Button>}
              <Button variant="ghost" className="!px-2 !py-1 text-[11px]" onClick={() => setModal({ kind: "documents", row: r })}><Paperclip size={12} /> Documents</Button>
              {e && e.status !== "Left" && <Button variant="ghost" className="!px-2 !py-1 text-[11px]" onClick={() => setModal({ kind: "left", row: r, emp: e })}><LogOut size={12} /> Mark as Left</Button>}
              {e && <Button variant="ghost" className="!px-2 !py-1 text-[11px]" onClick={() => setModal({ kind: "cancel", row: r, emp: e })}><Undo2 size={12} /> Cancel Exit</Button>}
            </div>;
          } },
        ]} />}
      </Async>
      {modal?.kind === "new" && <ExitModal onClose={() => setModal(null)} onSaved={(warning) => { setModal(null); if (warning) setMsg({ ok: false, text: warning }); list.reload(); }} />}
      {modal?.kind === "documents" && <Modal title={`Exit Documents · ${modal.row.employee_name || modal.row.employee}`} onClose={() => setModal(null)} wide><AttachedDocuments doctype="Employee Separation" name={modal.row.name} empty="No documents on this exit yet." /></Modal>}
      {modal?.kind === "templates" && <TemplateDocumentsModal onClose={() => setModal(null)} />}
      {modal?.kind === "cancel" && <CancelExitModal row={modal.row} emp={modal.emp} onClose={() => setModal(null)} onSaved={(text, ok) => { setModal(null); setMsg({ ok, text }); list.reload(); emps.reload(); }} />}
      {modal?.kind === "left" && <LeftModal row={modal.row} emp={modal.emp} onClose={() => setModal(null)} onSaved={(text) => { setModal(null); setMsg({ ok: true, text }); list.reload(); emps.reload(); }} />}
    </Panel>
  );
}

const MAX_ATTACHMENT_MB = 10;

const listAttached = (doctype, name) => frappe.getList("File", { filters: [["attached_to_doctype", "=", doctype], ["attached_to_name", "=", name]], fields: ["name", "file_name", "file_url", "is_private", "creation"], orderBy: "creation asc", limit: 0 });
const tooLarge = (file) => file.size > MAX_ATTACHMENT_MB * 1024 * 1024;

/** The files on a record: open, add and remove. */
function AttachedDocuments({ doctype, name, empty }) {
  const files = useAsync(() => listAttached(doctype, name), [doctype, name]);
  const input = useRef(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function upload(list) {
    const picked = [...(list || [])];
    if (input.current) input.current.value = "";
    if (!picked.length) return;
    setErr("");
    if (picked.some(tooLarge)) return setErr(`Each document must be ${MAX_ATTACHMENT_MB} MB or smaller.`);
    setBusy(true);
    try {
      for (const file of picked) await frappe.uploadFile(file, { doctype, docname: name, isPrivate: true });
      files.reload();
    } catch (x) {
      setErr(errMsg(x, "Couldn't upload this document."));
    }
    setBusy(false);
  }

  async function remove(file) {
    if (!(await confirmDialog({ message: `Remove "${file.file_name}"?`, danger: true, confirmLabel: "Remove" }))) return;
    setErr("");
    try {
      await frappe.deleteDoc("File", file.name);
      files.reload();
    } catch (x) {
      setErr(errMsg(x, "Couldn't remove this document."));
    }
  }

  return (
    <div className="space-y-3">
      <input ref={input} type="file" multiple className="hidden" aria-label="Choose documents" onChange={(e) => upload(e.target.files)} />
      <Button type="button" variant="secondary" disabled={busy} onClick={() => input.current?.click()}><Upload size={14} /> {busy ? "Uploading…" : "Add Documents"}</Button>
      {err && <Notice>{err}</Notice>}
      <Async state={files}>
        {(rows) => (rows.length === 0 ? <p className="text-[13px] text-[var(--color-text-muted)]">{empty}</p> : (
          <ul className="divide-y divide-[var(--color-border)]">
            {rows.map((d) => (
              <li key={d.name} className="flex flex-wrap items-center justify-between gap-3 py-2.5 text-[13px]">
                <span className="flex min-w-0 items-center gap-2 text-[var(--color-text)]"><Paperclip size={14} className="shrink-0 text-[var(--color-text-muted)]" /><span className="truncate">{d.file_name}</span><span className="shrink-0 text-[11px] text-[var(--color-text-faint)]">{dmy(d.creation)}</span></span>
                <span className="flex shrink-0 items-center gap-3 text-[12px]">
                  <a href={d.file_url} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-[var(--color-text-muted)] hover:text-[var(--color-text)]"><ExternalLink size={13} /> Open</a>
                  <button type="button" onClick={() => remove(d)} className="flex items-center gap-1 text-[var(--color-text-muted)] hover:text-[var(--color-red-hover)]"><Trash2 size={13} /> Remove</button>
                </span>
              </li>
            ))}
          </ul>
        ))}
      </Async>
    </div>
  );
}

/** Documents kept on an exit checklist template. Each new exit that uses the template gets a copy of them. */
function TemplateDocumentsModal({ onClose }) {
  const [template, setTemplate] = useState("");
  return (
    <Modal title="Exit Checklist Template Documents" onClose={onClose} wide>
      <div className="space-y-4">
        <LinkField label="Exit Checklist Template" linkDoctype="Employee Separation Template" value={template} onChange={setTemplate} frappe={frappe} />
        {template ? <AttachedDocuments key={template} doctype="Employee Separation Template" name={template} empty="No documents on this template yet." /> : <p className="text-[13px] text-[var(--color-text-muted)]">Choose a template to add its documents. Every new exit that uses it gets a copy.</p>}
      </div>
    </Modal>
  );
}

function ExitModal({ onClose, onSaved }) {
  const [f, setF] = useState({ employee: "", resigned: isoDate(), last: "", template: "", reason: "" });
  const [files, setFiles] = useState([]);
  const templateFiles = useAsync(() => (f.template ? listAttached("Employee Separation Template", f.template) : Promise.resolve([])), [f.template]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setErr("");
    try {
      const emp = await frappe.getDoc("Employee", f.employee);
      let activities;
      if (f.template) {
        const t = await frappe.getDoc("Employee Separation Template", f.template);
        activities = (t.activities || []).map(({ activity_name, user, role, required_for_employee_creation, description, duration, begin_on, task_weight }) => ({ activity_name, user, role, required_for_employee_creation, description, duration, begin_on, task_weight }));
      }
      // Record the notice on the employee first: the separation copies the resignation date from the employee.
      try { await frappe.updateDoc("Employee", f.employee, { resignation_letter_date: f.resigned, relieving_date: f.last, reason_for_leaving: f.reason || undefined }); } catch { /* not allowed - HR can set it later */ }
      const exit = await frappe.createDoc("Employee Separation", { employee: f.employee, company: emp.company, department: emp.department, designation: emp.designation, resignation_letter_date: f.resigned, boarding_begins_on: f.last, employee_separation_template: f.template || undefined, activities });
      // The exit is saved by now, so a document that fails is reported rather than undoing it.
      let failed = 0;
      for (const file of files) await frappe.uploadFile(file, { doctype: "Employee Separation", docname: exit.name, isPrivate: true }).catch(() => { failed += 1; });
      for (const d of templateFiles.data || []) await frappe.createDoc("File", { file_name: d.file_name, file_url: d.file_url, is_private: d.is_private, attached_to_doctype: "Employee Separation", attached_to_name: exit.name }).catch(() => { failed += 1; });
      onSaved(failed ? `The exit was started, but ${failed} document(s) couldn't be attached. Add them from Documents on the exit.` : "");
    } catch (x) {
      setErr(errMsg(x, "Couldn't start the exit."));
      setBusy(false);
    }
  }
  return (
    <Modal title="Start an Exit" onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <LinkField label="Employee" linkDoctype="Employee" value={f.employee} onChange={(v) => setF({ ...f, employee: v })} required frappe={frappe} />
        <div className="grid grid-cols-2 gap-3"><DateField label="Resignation Date" value={f.resigned} onChange={(v) => setF({ ...f, resigned: v })} required /><DateField label="Last Working Day" value={f.last} onChange={(v) => setF({ ...f, last: v })} required /></div>
        <LinkField label="Exit Checklist Template (Optional)" linkDoctype="Employee Separation Template" value={f.template} onChange={(v) => setF({ ...f, template: v })} frappe={frappe} />
        {templateFiles.data?.length > 0 && <p className="text-[11px] text-[var(--color-text-faint)]">From the template: {templateFiles.data.map((d) => d.file_name).join(", ")}</p>}
        <Field label="Attach Documents (Optional)"><input type="file" multiple className={inputCls} onChange={(e) => { const picked = [...e.target.files]; if (picked.some(tooLarge)) { setErr(`Each document must be ${MAX_ATTACHMENT_MB} MB or smaller.`); e.target.value = ""; setFiles([]); } else { setErr(""); setFiles(picked); } }} /></Field>
        <Field label="Reason for Leaving"><input className={inputCls} value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} /></Field>
        {err && <Notice>{err}</Notice>}
        <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={onClose}>Cancel</Button><Button type="submit" disabled={busy}>{busy ? "Saving…" : "Start Exit"}</Button></div>
      </form>
    </Modal>
  );
}

// The employee withdrew their resignation: drop the separation and put the Employee record back as it was before the exit.
function CancelExitModal({ row, emp, onClose, onSaved }) {
  const submitted = Number(row.docstatus) === 1;
  const wasLeft = emp.status === "Left";
  const [enableLogin, setEnableLogin] = useState(Boolean(emp.user_id) && wasLeft);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const name = row.employee_name || row.employee;
  const lastDay = emp.relieving_date || row.boarding_begins_on;
  const missed = Boolean(lastDay) && lastDay < isoDate();

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setErr("");
    try {
      // Re-read: the checklist may have been started (or the exit cancelled) since this page loaded.
      const current = await frappe.getDoc("Employee Separation", row.name);
      if (Number(current.docstatus) === 1) await frappe.cancelDoc("Employee Separation", row.name);
      else if (Number(current.docstatus) === 0) await frappe.deleteDoc("Employee Separation", row.name);
    } catch (x) {
      setErr(`${errMsg(x, "Couldn't cancel the exit.")} Nothing was changed.`);
      setBusy(false);
      return;
    }
    const problems = [];
    try {
      await frappe.updateDoc("Employee", row.employee, { status: "Active", relieving_date: null, resignation_letter_date: null, reason_for_leaving: null });
    } catch (x) {
      problems.push(`The employee record wasn't updated (${errMsg(x, "unknown error")}): clear the relieving date and set the status to Active from HR › Employees.`);
    }
    if (enableLogin && emp.user_id) {
      try { await frappe.callMethod("ethx_employee_login_access", { employee: row.employee, enable: 1 }); } catch { problems.push("The portal login wasn't re-enabled: do it from HR › Employees."); }
    }
    const attendance = missed ? ` Attendance after ${dmy(lastDay)} isn't marked automatically: add it from Attendance, or ask ${name} to raise attendance requests.` : "";
    onSaved(`Exit cancelled for ${name}. ${problems.join(" ")}${attendance}`.replace(/\s+/g, " ").trim(), problems.length === 0);
  }

  return (
    <Modal title={`Cancel Exit · ${name}`} onClose={onClose}>
      <form onSubmit={submit} className="space-y-3 text-[13px] text-[var(--color-text)]">
        <p>Use this when {name} withdraws their resignation. This will:</p>
        <ul className="list-disc space-y-1 pl-5 text-[var(--color-text-muted)]">
          <li>{submitted ? "Cancel the exit and its checklist" : "Delete the draft exit"} ({row.name})</li>
          <li>Set the employee status to Active{wasLeft ? " (currently Left)" : ""}</li>
          <li>Clear the resignation date{lastDay ? `, the last working day (${dmy(lastDay)})` : ""} and the reason for leaving</li>
        </ul>
        {emp.user_id && <label className="flex items-center gap-2 text-[12px] text-[var(--color-text-muted)]"><input type="checkbox" checked={enableLogin} onChange={(e) => setEnableLogin(e.target.checked)} /> Re-enable their portal login ({emp.user_id})</label>}
        {missed && <Notice tone="info">The last working day has passed. Attendance for the days after {dmy(lastDay)} will need to be added afterwards.</Notice>}
        {err && <Notice>{err}</Notice>}
        <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={onClose}>Keep Exit</Button><Button type="submit" disabled={busy}>{busy ? "Cancelling…" : "Cancel Exit"}</Button></div>
      </form>
    </Modal>
  );
}

function LeftModal({ row, emp, onClose, onSaved }) {
  const [date, setDate] = useState(emp.relieving_date || row.boarding_begins_on || isoDate());
  const [disable, setDisable] = useState(Boolean(emp.user_id));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setErr("");
    try {
      await frappe.updateDoc("Employee", row.employee, { status: "Left", relieving_date: date });
      let note = "";
      if (disable && emp.user_id) {
        try { await frappe.callMethod("ethx_employee_login_access", { employee: row.employee, enable: 0 }); note = " Portal login disabled."; } catch { note = " Disable the portal login from HR › Employees."; }
      }
      onSaved(`${row.employee_name} marked as Left from ${dmy(date)}.${note}`);
    } catch (x) {
      setErr(errMsg(x, "Couldn't update the employee."));
      setBusy(false);
    }
  }
  return (
    <Modal title={`Mark ${row.employee_name} as Left`} onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <DateField label="Relieving Date" value={date} onChange={setDate} required />
        {emp.user_id && <label className="flex items-center gap-2 text-[12px] text-[var(--color-text-muted)]"><input type="checkbox" checked={disable} onChange={(e) => setDisable(e.target.checked)} /> Disable their portal login ({emp.user_id})</label>}
        {err && <Notice>{err}</Notice>}
        <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={onClose}>Cancel</Button><Button type="submit" disabled={busy}>{busy ? "Saving…" : "Mark as Left"}</Button></div>
      </form>
    </Modal>
  );
}
