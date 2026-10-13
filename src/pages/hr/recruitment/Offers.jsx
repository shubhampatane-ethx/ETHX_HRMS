// Offers: draft → HR Manager approval (maker-checker) → send → candidate response → joining / hire.
import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Check, FileDown, Handshake, Mail, Pencil, RotateCcw, Send, Trash2, UserPlus, X } from "lucide-react";
import { frappe } from "../../../lib/api/frappeClient";
import { Button } from "../../../components/ui/primitives";
import { Async, chipCls, Field, Grid, inputCls, Modal, Notice, PageHeader, Panel, StatusPill } from "../../../components/employee/EmployeeShell";
import { dmy, errMsg, money, useAsync } from "../../../lib/employeePortal";
import { acceptedForOpening, canApprove, emailDocument, listOffers, offerStage, reviseOffer, sendOffer, setOfferApproval, vacanciesOf } from "../../../lib/recruitment";
import { useAuth } from "../../../context/AuthContext";
import { candidateUrl, HireModal, NoShowModal, OfferModal, ResponseModal, SetupHint } from "./shared";

const FILTERS = [["open", "In progress"], ["approval", "Needs approval"], ["Sent", "Sent"], ["Accepted", "Accepted"], ["done", "Joined / closed"], ["all", "All"]];
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
      setMsg({ ok: false, text: errMsg(e, "ERPNext refused this action.") });
    }
  }

  async function afterAccepted(o) {
    const opening = o.custom_job_opening ? await frappe.getDoc("Job Opening", o.custom_job_opening).catch(() => null) : null;
    if (!opening || opening.status !== "Open") return;
    const filled = await acceptedForOpening(opening);
    const v = vacanciesOf(opening);
    if (v && filled >= v && window.confirm(`${filled} of ${v} vacancies for ${opening.job_title} are now filled. Close the opening?`)) {
      await frappe.updateDoc("Job Opening", opening.name, { status: "Closed" }).catch((e) => window.alert(errMsg(e, "Couldn't close the opening.")));
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader icon={Handshake} title="Offers" subtitle="Draft → HR Manager approval → send → candidate response → joining" />
      <SetupHint />
      {!approver && <Notice tone="info">You can draft offers and send them for approval. Approving needs an HR Manager other than the person who drafted the offer.</Notice>}
      {msg && <Notice tone={msg.ok ? "info" : "error"}>{msg.text}</Notice>}
      <Panel>
        <div className="mb-4 flex flex-wrap gap-2">{FILTERS.map(([v, l]) => <button key={v} type="button" onClick={() => setFilter(v)} className={chipCls(filter === v)}>{l}{v === "approval" && (offers.data || []).filter((o) => offerStage(o) === "Pending Approval").length ? ` (${(offers.data || []).filter((o) => offerStage(o) === "Pending Approval").length})` : ""}</button>)}</div>
        <Async state={offers}>
          {() => <Grid rows={rows} empty="No offers here." columns={[
            { key: "applicant_name", label: "Candidate", render: (o) => <Link to={candidateUrl(o.job_applicant)} className="hover:underline"><b className="font-medium">{o.applicant_name}</b><span className="block text-[11px] text-[var(--color-text-faint)]">{o.name}{o.amended_from ? ` · revises ${o.amended_from}` : ""}</span></Link> },
            { key: "designation", label: "Role", render: (o) => <span>{o.designation}<span className="block text-[11px] text-[var(--color-text-faint)]">{o.company}</span></span> },
            { key: "custom_ctc", label: "CTC", render: (o) => (o.custom_ctc ? money(o.custom_ctc) : "—") },
            { key: "dates", label: "Joining / valid till", render: (o) => <span>{dmy(o.custom_joining_date) || "—"}<span className="block text-[11px] text-[var(--color-text-faint)]">valid till {dmy(o.custom_valid_till) || "—"}</span></span> },
            { key: "stage", label: "Status", render: (o) => <span><StatusPill status={offerStage(o)} />{o.custom_approved_by && <span className="block text-[10.5px] text-[var(--color-text-faint)]">{o.custom_approval_status} by {o.custom_approved_by}</span>}{o.custom_rounds_override && <span className="block text-[10.5px] text-[var(--color-amber)]" title={o.custom_rounds_override}>Rounds overridden</span>}</span> },
            { key: "_a", label: "", render: (o) => <Actions o={o} user={user} approver={approver} setModal={setModal} act={act} /> },
          ]} />}
        </Async>
      </Panel>
      {modal?.kind === "edit" && <EditOffer offer={modal.offer} onClose={() => setModal(null)} onSaved={() => { setModal(null); offers.reload(); }} />}
      {modal?.kind === "decide" && <ApproveModal offer={modal.offer} approve={modal.approve} onClose={() => setModal(null)} onSaved={() => { setModal(null); offers.reload(); }} />}
      {modal?.kind === "send" && <SendModal offer={modal.offer} onClose={() => setModal(null)} onSaved={(text) => { setModal(null); setMsg({ ok: true, text }); offers.reload(); }} />}
      {modal?.kind === "response" && <ResponseModal offer={modal.offer} onClose={() => setModal(null)} onSaved={async (status) => { const o = modal.offer; setModal(null); offers.reload(); if (status === "Accepted") await afterAccepted(o); }} />}
      {modal?.kind === "hire" && <HireModal offer={modal.offer} onClose={() => setModal(null)} onSaved={(r) => { setModal(null); setMsg({ ok: true, text: r.employee ? `Employee ${r.employee.name} created. Give them a portal login from HR › Employees.` : `Onboarding ${r.onboarding.name} started.` }); offers.reload(); }} />}
      {modal?.kind === "noshow" && <NoShowWrapper offer={modal.offer} onClose={() => setModal(null)} onSaved={() => { setModal(null); offers.reload(); }} />}
    </div>
  );
}

function Actions({ o, user, approver, setModal, act }) {
  const s = offerStage(o);
  const mine = o.owner === user?.email;
  const btn = "rounded p-1 text-[var(--color-text-muted)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text)]";
  return (
    <div className="flex flex-wrap justify-end gap-1 whitespace-nowrap">
      {o.docstatus === 0 && <button type="button" title="Edit" className={btn} onClick={() => setModal({ kind: "edit", offer: o })}><Pencil size={14} /></button>}
      {["Draft", "Rejected"].includes(s) && <Button variant="secondary" className="!px-2 !py-1 text-[11px]" onClick={() => act(() => setOfferApproval(o, "Pending Approval"), "Sent for approval.")}>Send for approval</Button>}
      {s === "Pending Approval" && approver && (!mine || user?.email === "Administrator") && <>
        <button type="button" title="Approve" className={`${btn} !text-[var(--color-green)]`} onClick={() => setModal({ kind: "decide", offer: o, approve: true })}><Check size={14} /></button>
        <button type="button" title="Reject" className={btn} onClick={() => setModal({ kind: "decide", offer: o, approve: false })}><X size={14} /></button>
      </>}
      {s === "Pending Approval" && (mine || !approver) && <span className="px-1 text-[11px] text-[var(--color-text-faint)]">{mine && approver ? "Another HR Manager must approve" : "Awaiting HR Manager approval"}</span>}
      {s === "Approved" && <Button className="!px-2 !py-1 text-[11px]" onClick={() => setModal({ kind: "send", offer: o })}><Send size={12} /> Send</Button>}
      {o.docstatus === 1 && <a href={pdfUrl(o)} title="Offer letter PDF" className={btn}><FileDown size={14} /></a>}
      {["Sent", "Expired"].includes(s) && <>
        <Button variant="secondary" className="!px-2 !py-1 text-[11px]" onClick={() => setModal({ kind: "response", offer: o })}>Response</Button>
        <button type="button" title="Revise (cancel and create an amended copy)" className={btn} onClick={() => window.confirm("Revise this offer? It is cancelled and a new draft copy is created, which needs approval again.") && act(() => reviseOffer(o), "Revised - edit the new draft and send it for approval.")}><RotateCcw size={14} /></button>
      </>}
      {s === "Accepted" && <>
        <Button className="!px-2 !py-1 text-[11px]" onClick={() => setModal({ kind: "hire", offer: o })}><UserPlus size={12} /> Hire</Button>
        <Button variant="ghost" className="!px-2 !py-1 text-[11px]" onClick={() => setModal({ kind: "noshow", offer: o })}>Didn't join</Button>
      </>}
      {o.docstatus === 0 && <button type="button" title="Delete draft" className={`${btn} hover:!text-[var(--color-red-hover)]`} onClick={() => window.confirm("Delete this draft offer?") && act(() => frappe.deleteDoc("Job Offer", o.name), "Draft deleted.")}><Trash2 size={14} /></button>}
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
    <Modal title={`${approve ? "Approve" : "Reject"} offer · ${offer.applicant_name}`} onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <p className="text-[12px] text-[var(--color-text-muted)]">{offer.designation} · {offer.custom_ctc ? money(offer.custom_ctc) : "CTC not set"} · joining {dmy(offer.custom_joining_date) || "—"} · drafted by {offer.owner}</p>
        {offer.custom_rounds_override && <Notice tone="info">Interview rounds overridden: {offer.custom_rounds_override}</Notice>}
        <Field label={approve ? "Note (optional)" : "What needs to change?"}><textarea rows={2} required={!approve} className={inputCls} value={note} onChange={(e) => setNote(e.target.value)} /></Field>
        {err && <Notice>{err}</Notice>}
        <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={onClose}>Cancel</Button><Button type="submit" disabled={busy}>{busy ? "Saving…" : approve ? "Approve" : "Reject"}</Button></div>
      </form>
    </Modal>
  );
}

function SendModal({ offer, onClose, onSaved }) {
  const [email, setEmail] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  async function go() {
    setBusy(true);
    setErr("");
    try {
      await sendOffer(offer);
    } catch (x) {
      setErr(errMsg(x, "ERPNext refused to send this offer."));
      setBusy(false);
      return;
    }
    if (email && offer.applicant_email) {
      try {
        await emailDocument({ doctype: "Job Offer", name: offer.name, to: offer.applicant_email, subject: `Offer of employment - ${offer.designation}`, message: `<p>Dear ${String(offer.applicant_name || "").split(" ")[0]},</p><p>We are delighted to offer you the position of ${offer.designation}. Please find your offer letter attached${offer.custom_valid_till ? `; this offer is valid until ${dmy(offer.custom_valid_till)}` : ""}.</p><p>Regards,<br/>HR Team</p>` });
        return onSaved("Offer sent and emailed with the PDF letter.");
      } catch (x) {
        return onSaved(`Offer marked as sent, but the email failed (${errMsg(x, "check ERPNext's outgoing email account")}). Download the PDF and send it yourself.`);
      }
    }
    onSaved("Offer marked as sent.");
  }
  return (
    <Modal title={`Send offer · ${offer.applicant_name}`} onClose={onClose}>
      <p className="text-[13px] text-[var(--color-text-muted)]">Sending locks the offer (ERPNext submits it). To change it later, use Revise.</p>
      <label className="mt-3 flex items-center gap-2 text-[12px] text-[var(--color-text-muted)]"><input type="checkbox" checked={email} onChange={(e) => setEmail(e.target.checked)} /><Mail size={13} /> Email the PDF offer letter to {offer.applicant_email || "the candidate"}</label>
      {err && <div className="mt-3"><Notice>{err}</Notice></div>}
      <div className="mt-4 flex justify-end gap-2"><Button variant="ghost" onClick={onClose}>Cancel</Button><Button onClick={go} disabled={busy}>{busy ? "Sending…" : "Send offer"}</Button></div>
    </Modal>
  );
}

function NoShowWrapper({ offer, onClose, onSaved }) {
  const opening = useAsync(() => (offer.custom_job_opening ? frappe.getDoc("Job Opening", offer.custom_job_opening).catch(() => null) : Promise.resolve(null)), [offer.name]);
  if (opening.loading) return null;
  return <NoShowModal offer={offer} opening={opening.data} onClose={onClose} onSaved={onSaved} />;
}
