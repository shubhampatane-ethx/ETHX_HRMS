// Offers: draft → HR Manager approval (maker-checker) → send → candidate response → joining / hire.
import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Check, FileDown, Handshake, Mail, Paperclip, Pencil, Plus, RotateCcw, Send, Trash2, UserPlus, X } from "lucide-react";
import { frappe } from "../../../lib/api/frappeClient";
import { Button } from "../../../components/ui/primitives";
import { Async, chipCls, Field, Grid, inputCls, Modal, Notice, PageHeader, Panel, StatusPill } from "../../../components/employee/EmployeeShell";
import { dmy, errMsg, money, useAsync } from "../../../lib/employeePortal";
import { acceptedForOpening, attachedFiles, canApprove, offerTemplates, uploadOfferTemplate, emailDocument, listApplicants, listOffers, offerStage, stageOf, reviseOffer, sendOffer, setOfferApproval, vacanciesOf } from "../../../lib/recruitment";
import { useAuth } from "../../../context/AuthContext";
import { candidateUrl, HireModal, NoShowModal, OfferModal, ResponseModal, SetupHint, StageBadge, WithApplicant } from "./shared";
import { alertDialog, confirmDialog } from "../../../components/ui/dialogs";

const FILTERS = [["open", "In Progress"], ["approval", "Needs Approval"], ["Sent", "Sent"], ["Accepted", "Accepted"], ["done", "Joined / Closed"], ["all", "All"]];
const pdfUrl = (o) => `/api/method/frappe.utils.print_format.download_pdf?doctype=Job%20Offer&name=${encodeURIComponent(o.name)}&format=Standard&no_letterhead=0`;

export default function Offers() {
  const { user } = useAuth();
  const [params] = useSearchParams();
  const focus = params.get("offer");
  const offers = useAsync(() => listOffers(), []);
  const [filter, setFilter] = useState(focus ? "all" : "open");
  const [modal, setModal] = useState(null);
  const [msg, setMsg] = useState(null);
  const approver = canApprove(user);

  const rows = useMemo(() => (offers.data || []).filter((o) => {
    if (focus && filter === "all") return o.name === focus || o.amended_from === focus;
    const s = offerStage(o);
    if (filter === "open") return ["Draft", "Pending Approval", "Approved", "Rejected", "Sent", "Accepted"].includes(s);
    if (filter === "approval") return s === "Pending Approval";
    if (filter === "done") return ["Joined", "No-show", "Withdrawn", "Declined", "Expired", "Cancelled"].includes(s);
    if (filter === "all") return true;
    return s === filter;
  }), [offers.data, filter, focus]);

  async function act(fn, ok) {
    setMsg(null);
    try {
      await fn();
      if (ok) setMsg({ ok: true, text: ok });
      offers.reload();
    } catch (e) {
      setMsg({ ok: false, text: errMsg(e, "This action was refused.") });
    }
  }

  async function afterAccepted(o) {
    const opening = o.custom_job_opening ? await frappe.getDoc("Job Opening", o.custom_job_opening).catch(() => null) : null;
    if (!opening || opening.status !== "Open") return;
    const filled = await acceptedForOpening(opening);
    const v = vacanciesOf(opening);
    if (v && filled >= v && (await confirmDialog(`${filled} of ${v} vacancies for ${opening.job_title} are now filled. Close the opening?`))) {
      await frappe.updateDoc("Job Opening", opening.name, { status: "Closed" }).catch((e) => alertDialog({ tone: "error", message: errMsg(e, "Couldn't close the opening.") }));
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader icon={Handshake} title="Offers" subtitle="Draft → HR Manager approval → send → candidate response → joining" actions={<><Button variant="secondary" onClick={() => setModal({ kind: "templates" })}><Paperclip size={14} /> Offer Letter Templates</Button><Button onClick={() => setModal({ kind: "pick" })}><Plus size={14} /> New Offer</Button></>} />
      <SetupHint />
      {!approver && <Notice tone="info">You can draft offers and send them for approval. An HR Manager approves them.</Notice>}
      {msg && <Notice tone={msg.ok ? "info" : "error"}>{msg.text}</Notice>}
      <Panel>
        <div className="mb-4 flex flex-wrap gap-2">{FILTERS.map(([v, l]) => <button key={v} type="button" onClick={() => setFilter(v)} className={chipCls(filter === v)}>{l}{v === "approval" && (offers.data || []).filter((o) => offerStage(o) === "Pending Approval").length ? ` (${(offers.data || []).filter((o) => offerStage(o) === "Pending Approval").length})` : ""}</button>)}</div>
        <Async state={offers}>
          {() => <Grid rows={rows} empty={filter === "all" || filter === "open" ? "No offers yet. Use New Offer to make one for a selected candidate." : "No offers here."} columns={[
            { key: "applicant_name", label: "Candidate", render: (o) => <Link to={candidateUrl(o.job_applicant)} className="hover:underline"><b className="font-medium">{o.applicant_name}</b><span className="block text-[11px] text-[var(--color-text-faint)]">{o.name}{o.amended_from ? ` · revises ${o.amended_from}` : ""}</span></Link> },
            { key: "designation", label: "Role", render: (o) => <span>{o.designation}<span className="block text-[11px] text-[var(--color-text-faint)]">{o.company}</span></span> },
            { key: "custom_ctc", label: "CTC", render: (o) => (o.custom_ctc ? money(o.custom_ctc) : "—") },
            { key: "dates", label: "Joining / Valid Till", render: (o) => <span>{dmy(o.custom_joining_date) || "—"}<span className="block text-[11px] text-[var(--color-text-faint)]">valid till {dmy(o.custom_valid_till) || "—"}</span></span> },
            { key: "stage", label: "Status", render: (o) => <span><StatusPill status={offerStage(o)} />{o.custom_approved_by && <span className="block text-[10.5px] text-[var(--color-text-faint)]">{o.custom_approval_status} by {o.custom_approved_by}</span>}{o.custom_rounds_override && <span className="block text-[10.5px] text-[var(--color-amber)]" title={o.custom_rounds_override}>Rounds overridden</span>}</span> },
            { key: "_a", label: "", render: (o) => <Actions o={o} user={user} approver={approver} setModal={setModal} act={act} /> },
          ]} />}
        </Async>
      </Panel>
      {modal?.kind === "templates" && <TemplatesModal onClose={() => setModal(null)} />}
      {modal?.kind === "pick" && <PickCandidate offers={offers.data || []} onClose={() => setModal(null)} onPick={(name) => setModal({ kind: "new", applicant: name })} />}
      {modal?.kind === "new" && <WithApplicant name={modal.applicant} onClose={() => setModal(null)}>{({ applicant, opening }) => <OfferModal applicant={applicant} opening={opening} onClose={() => setModal(null)} onSaved={() => { setModal(null); setFilter("open"); setMsg({ ok: true, text: `Offer drafted for ${applicant.applicant_name}. Send it for approval from the list.` }); offers.reload(); }} />}</WithApplicant>}
      {modal?.kind === "edit" && <EditOffer offer={modal.offer} onClose={() => setModal(null)} onSaved={() => { setModal(null); offers.reload(); }} />}
      {modal?.kind === "decide" && <ApproveModal offer={modal.offer} approve={modal.approve} onClose={() => setModal(null)} onSaved={async () => {
        const o = modal.offer;
        setModal(null);
        offers.reload();
        if (modal.approve && (await confirmDialog({ title: "Offer Approved", message: `Send ${o.applicant_name}'s offer now?`, confirmLabel: "Send Now", cancelLabel: "Later" }))) setModal({ kind: "send", offer: { ...o, custom_approval_status: "Approved" } });
      }} />}
      {modal?.kind === "send" && <SendModal offer={modal.offer} onClose={() => setModal(null)} onSaved={(text) => { setModal(null); setMsg({ ok: true, text }); offers.reload(); }} />}
      {modal?.kind === "response" && <ResponseModal offer={modal.offer} onClose={() => setModal(null)} onSaved={async (status) => {
        const o = modal.offer;
        setModal(null);
        offers.reload();
        if (status !== "Accepted") return;
        await afterAccepted(o);
        if (await confirmDialog({ title: "Offer Accepted", message: `Create ${o.applicant_name}'s employee record now (or start onboarding)?`, confirmLabel: "Hire Now", cancelLabel: "Later" })) setModal({ kind: "hire", offer: { ...o, status: "Accepted" } });
      }} />}
      {modal?.kind === "hire" && <HireModal offer={modal.offer} onClose={() => setModal(null)} onSaved={(r) => { setModal(null); setMsg({ ok: true, text: r.employee ? `Employee ${r.employee.name} created. Give them a portal login from HR › Employees.` : `Onboarding ${r.onboarding.name} started.` }); offers.reload(); }} />}
      {modal?.kind === "noshow" && <NoShowWrapper offer={modal.offer} onClose={() => setModal(null)} onSaved={() => { setModal(null); offers.reload(); }} />}
    </div>
  );
}

// Candidates who can get an offer: still in the process (not hired, rejected or withdrawn) and without an open offer.
// Selected candidates come first.
const OFFER_READY = ["Selected", "Interview", "Shortlisted", "Screening", "Applied", "Hold"];
function PickCandidate({ offers, onClose, onPick }) {
  const apps = useAsync(() => listApplicants(), []);
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState("");
  const live = new Set(offers.filter((o) => o.docstatus < 2 && !["Declined", "Withdrawn", "Expired"].includes(offerStage(o))).map((o) => o.job_applicant));
  const list = (apps.data || [])
    .filter((a) => OFFER_READY.includes(stageOf(a)) && !live.has(a.name))
    .filter((a) => !q || [a.applicant_name, a.email_id].some((v) => String(v || "").toLowerCase().includes(q.toLowerCase())))
    .sort((a, b) => OFFER_READY.indexOf(stageOf(a)) - OFFER_READY.indexOf(stageOf(b)));
  return (
    <Modal title="New Offer · Choose Candidate" onClose={onClose} wide>
      <div className="space-y-3">
        <input className={inputCls} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name or email" />
        <Async state={apps}>
          {() => (list.length ? (
            <div className="max-h-80 overflow-y-auto rounded-md border border-[var(--color-border)]">
              {list.map((a) => (
                <label key={a.name} className={`flex cursor-pointer items-center justify-between gap-3 border-b border-[var(--color-border)] px-3 py-2 text-[13px] last:border-0 ${picked === a.name ? "bg-[var(--color-surface-2)]" : ""}`}>
                  <span className="flex items-center gap-2"><input type="radio" name="offer-candidate" checked={picked === a.name} onChange={() => setPicked(a.name)} /><span>{a.applicant_name}<span className="block text-[11px] text-[var(--color-text-faint)]">{a.email_id}</span></span></span>
                  <StageBadge stage={stageOf(a)} />
                </label>
              ))}
            </div>
          ) : <Notice tone="info">No candidates are waiting for an offer. Move a candidate to Selected (Candidates › Change Status) first.</Notice>)}
        </Async>
        <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={onClose}>Cancel</Button><Button type="button" disabled={!picked} onClick={() => onPick(picked)}>Continue</Button></div>
      </div>
    </Modal>
  );
}

function Actions({ o, user, approver, setModal, act }) {
  const s = offerStage(o);
  const btn = "rounded p-1 text-[var(--color-text-muted)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text)]";
  return (
    <div className="flex flex-wrap justify-end gap-1 whitespace-nowrap">
      {o.docstatus === 0 && <button type="button" title="Edit" className={btn} onClick={() => setModal({ kind: "edit", offer: o })}><Pencil size={14} /></button>}
      {["Draft", "Rejected"].includes(s) && <Button variant="secondary" className="!px-2 !py-1 text-[11px]" onClick={async () => (await confirmDialog(`Send ${o.applicant_name}'s offer for approval?`)) && act(() => setOfferApproval(o, "Pending Approval"), "Sent for approval.")}>Send for Approval</Button>}
      {/* The drafter can approve only when no other HR Manager exists (the server checks). */}
      {s === "Pending Approval" && approver && <>
        <button type="button" title="Approve" className={`${btn} !text-[var(--color-green)]`} onClick={() => setModal({ kind: "decide", offer: o, approve: true })}><Check size={14} /></button>
        <button type="button" title="Reject" className={btn} onClick={() => setModal({ kind: "decide", offer: o, approve: false })}><X size={14} /></button>
      </>}
      {s === "Pending Approval" && !approver && <span className="px-1 text-[11px] text-[var(--color-text-faint)]">Awaiting HR Manager approval</span>}
      {s === "Approved" && <Button className="!px-2 !py-1 text-[11px]" onClick={() => setModal({ kind: "send", offer: o })}><Send size={12} /> Send</Button>}
      {o.docstatus === 1 && <a href={pdfUrl(o)} title="Offer letter PDF" className={btn}><FileDown size={14} /></a>}
      {["Sent", "Expired"].includes(s) && <>
        <Button variant="secondary" className="!px-2 !py-1 text-[11px]" onClick={() => setModal({ kind: "response", offer: o })}>Response</Button>
        <button type="button" title="Revise (cancel and create an amended copy)" className={btn} onClick={async () => (await confirmDialog("Revise this offer? It is cancelled and a new draft copy is created, which needs approval again.")) && act(() => reviseOffer(o), "Revised - edit the new draft and send it for approval.")}><RotateCcw size={14} /></button>
      </>}
      {s === "Accepted" && <>
        <Button className="!px-2 !py-1 text-[11px]" onClick={() => setModal({ kind: "hire", offer: o })}><UserPlus size={12} /> Hire</Button>
        <Button variant="ghost" className="!px-2 !py-1 text-[11px]" onClick={() => setModal({ kind: "noshow", offer: o })}>Didn't Join</Button>
      </>}
      {o.docstatus === 0 && <button type="button" title="Delete Draft" className={`${btn} hover:!text-[var(--color-red-hover)]`} onClick={async () => (await confirmDialog("Delete this draft offer?")) && act(() => frappe.deleteDoc("Job Offer", o.name), "Draft deleted.")}><Trash2 size={14} /></button>}
    </div>
  );
}

function EditOffer({ offer, onClose, onSaved }) {
  const data = useAsync(async () => {
    const applicant = await frappe.getDoc("Job Applicant", offer.job_applicant);
    const openingName = offer.custom_job_opening || applicant.job_title;
    const opening = openingName ? await frappe.getDoc("Job Opening", openingName).catch(() => null) : null;
    const full = await frappe.getDoc("Job Offer", offer.name);
    return { applicant, opening, full };
  }, [offer.name]);
  if (!data.data) return <Modal title="Loading…" onClose={onClose}><p className="text-[13px] text-[var(--color-text-muted)]">{data.error ? errMsg(data.error) : "Loading…"}</p></Modal>;
  return <OfferModal applicant={data.data.applicant} opening={data.data.opening} offer={{ ...offer, ...data.data.full }} onClose={onClose} onSaved={onSaved} />;
}

function ApproveModal({ offer, approve, onClose, onSaved }) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    try {
      await setOfferApproval(offer, approve ? "Approved" : "Rejected", note.trim());
      onSaved();
    } catch (x) {
      setErr(errMsg(x, "Couldn't record the decision."));
      setBusy(false);
    }
  }
  return (
    <Modal title={`${approve ? "Approve" : "Reject"} Offer · ${offer.applicant_name}`} onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <p className="text-[12px] text-[var(--color-text-muted)]">{offer.designation} · {offer.custom_ctc ? money(offer.custom_ctc) : "CTC not set"} · joining {dmy(offer.custom_joining_date) || "—"} · drafted by {offer.owner}</p>
        {offer.custom_rounds_override && <Notice tone="info">Interview rounds overridden: {offer.custom_rounds_override}</Notice>}
        <Field label={approve ? "Note (Optional)" : "What needs to change?"}><textarea rows={2} required={!approve} className={inputCls} value={note} onChange={(e) => setNote(e.target.value)} /></Field>
        {err && <Notice>{err}</Notice>}
        <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={onClose}>Cancel</Button><Button type="submit" disabled={busy}>{busy ? "Saving…" : approve ? "Approve" : "Reject"}</Button></div>
      </form>
    </Modal>
  );
}

function SendModal({ offer, onClose, onSaved }) {
  const [email, setEmail] = useState(true);
  const files = useAsync(() => attachedFiles("Job Offer", offer.name).catch(() => []), [offer.name]);
  const hasLetter = (files.data || []).length > 0;
  const [pdf, setPdf] = useState(null); // null = default: the system PDF only when HR attached no letter of their own
  const withPdf = pdf ?? !hasLetter;
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  async function go() {
    if (email && !withPdf && !hasLetter) return setErr("Attach the offer letter to the offer, or include the system-generated PDF.");
    setBusy(true);
    setErr("");
    try {
      await sendOffer(offer);
    } catch (x) {
      setErr(errMsg(x, "This offer couldn't be sent."));
      setBusy(false);
      return;
    }
    if (email && offer.applicant_email) {
      try {
        await emailDocument({ doctype: "Job Offer", name: offer.name, to: offer.applicant_email, files: (files.data || []).map((x) => x.name), printFormat: withPdf ? undefined : false, subject: `Offer of employment - ${offer.designation}`, message: `<p>Dear ${String(offer.applicant_name || "").split(" ")[0]},</p><p>We are delighted to offer you the position of ${offer.designation}. Please find your offer letter attached${offer.custom_valid_till ? `; this offer is valid until ${dmy(offer.custom_valid_till)}` : ""}.</p><p>Regards,<br/>HR Team</p>` });
        return onSaved(`Offer sent and emailed with ${[hasLetter && `${files.data.length} attached letter(s)`, withPdf && "the PDF letter"].filter(Boolean).join(" and ")}.`);
      } catch (x) {
        return onSaved(`Offer marked as sent, but the email failed (${errMsg(x, "check the outgoing email settings")}). Download the PDF and send it yourself.`);
      }
    }
    onSaved("Offer marked as sent.");
  }
  return (
    <Modal title={`Send Offer · ${offer.applicant_name}`} onClose={onClose}>
      <p className="text-[13px] text-[var(--color-text-muted)]">Sending locks the offer. To change it later, use Revise.</p>
      <label className="mt-3 flex items-center gap-2 text-[12px] text-[var(--color-text-muted)]"><input type="checkbox" checked={email} onChange={(e) => setEmail(e.target.checked)} /><Mail size={13} /> Email the offer to {offer.applicant_email || "the candidate"}</label>
      {email && (
        <div className="ml-6 mt-2 space-y-1.5 text-[12px] text-[var(--color-text-muted)]">
          {files.loading ? <p>Checking attachments…</p> : hasLetter ? <p className="flex flex-wrap items-center gap-1"><Paperclip size={12} /> Attached: {files.data.map((x) => x.file_name).join(", ")}</p> : <p>No offer letter is attached - edit the offer to attach one.</p>}
          <label className="flex items-center gap-2"><input type="checkbox" checked={withPdf} onChange={(e) => setPdf(e.target.checked)} /> Also include the system-generated PDF letter</label>
        </div>
      )}
      {err && <div className="mt-3"><Notice>{err}</Notice></div>}
      <div className="mt-4 flex justify-end gap-2"><Button variant="ghost" onClick={onClose}>Cancel</Button><Button onClick={go} disabled={busy}>{busy ? "Sending…" : "Send Offer"}</Button></div>
    </Modal>
  );
}

/** The company offer letter templates (Word / PDF) HR fills in for each candidate and attaches to the offer. */
function TemplatesModal({ onClose }) {
  const list = useAsync(offerTemplates, []);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  async function upload(picked) {
    const files = [...(picked || [])];
    if (!files.length) return;
    if (files.some((x) => x.size > 10 * 1024 * 1024)) return setMsg({ ok: false, text: "Each template must be 10 MB or smaller." });
    setBusy(true);
    setMsg(null);
    try {
      for (const file of files) await uploadOfferTemplate(file);
      setMsg({ ok: true, text: `${files.length} template(s) uploaded.` });
      list.reload();
    } catch (x) {
      setMsg({ ok: false, text: errMsg(x, "Couldn't upload the template.") });
    }
    setBusy(false);
  }
  async function remove(t) {
    if (!(await confirmDialog({ title: "Remove Template", message: `Remove ${t.file_name}? Offers that already have a letter attached keep theirs.`, confirmLabel: "Remove", danger: true }))) return;
    try { await frappe.deleteDoc("File", t.name); list.reload(); } catch (x) { setMsg({ ok: false, text: errMsg(x, "Couldn't remove it.") }); }
  }
  return (
    <Modal title="Offer Letter Templates" onClose={onClose} wide>
      <div className="space-y-3 text-[13px]">
        <p className="text-[12px] text-[var(--color-text-muted)]">Keep the company's offer letter formats here. For each offer, download a template, fill in the candidate's details, and attach it in the offer form - it's emailed when the offer is sent.</p>
        <label className="flex cursor-pointer items-center gap-2"><span className="inline-flex items-center gap-1.5 rounded-md border border-[var(--color-border-strong)] px-3 py-1.5 text-[12.5px] text-[var(--color-text)] hover:border-[var(--color-red)]"><Paperclip size={13} /> {busy ? "Uploading…" : "Upload Template"}</span><input type="file" multiple accept=".pdf,.doc,.docx" className="hidden" disabled={busy} onChange={(e) => { upload(e.target.files); e.target.value = ""; }} /></label>
        {msg && <Notice tone={msg.ok ? "info" : "error"}>{msg.text}</Notice>}
        <Async state={list}>
          {(rows) => <Grid rows={rows} empty="No templates yet - upload your offer letter format." columns={[
            { key: "file_name", label: "Template", render: (t) => <a href={t.file_url} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-[var(--color-red-hover)] hover:underline"><FileDown size={13} /> {t.file_name}</a> },
            { key: "creation", label: "Added", render: (t) => dmy(t.creation) },
            { key: "_a", label: "", render: (t) => <button type="button" onClick={() => remove(t)} className="text-[12px] text-[var(--color-text-faint)] hover:text-[var(--color-red-hover)]"><Trash2 size={13} /></button> },
          ]} />}
        </Async>
      </div>
    </Modal>
  );
}

function NoShowWrapper({ offer, onClose, onSaved }) {
  const opening = useAsync(() => (offer.custom_job_opening ? frappe.getDoc("Job Opening", offer.custom_job_opening).catch(() => null) : Promise.resolve(null)), [offer.name]);
  if (opening.loading) return null;
  return <NoShowModal offer={offer} opening={opening.data} onClose={onClose} onSaved={onSaved} />;
}
