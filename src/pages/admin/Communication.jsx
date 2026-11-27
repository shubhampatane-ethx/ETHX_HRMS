// Admin › Communication: the two mail accounts (internal Outlook / Microsoft 365, candidate Gmail), the automatic
// birthday and event emails with their templates, and AI job descriptions (Claude). See lib/comms.js.
import { useState } from "react";
import { AlertTriangle, CalendarDays, Cake, CheckCircle2, ExternalLink, LogIn, Mail, Pencil, Plus, Send, Sparkles, Trash2 } from "lucide-react";
import { frappe } from "../../lib/api/frappeClient";
import { SharedAcrossClients } from "../../components/layout/ClientSwitcher";
import { useAuth } from "../../context/AuthContext";
import { Button } from "../../components/ui/primitives";
import { Async, Field, Grid, inputCls, Modal, Notice, PageHeader, Panel, Tabs } from "../../components/employee/EmployeeShell";
import { dmy, dmyHm, errMsg, isoDate, useAsync } from "../../lib/employeePortal";
import { confirmDialog } from "../../components/ui/dialogs";
import {
  AI_MODELS, commsError, DEFAULT_BIRTHDAY_SUBJECT, DEFAULT_BIRTHDAY_TEMPLATE, DEFAULT_EVENT_SUBJECT, DEFAULT_EVENT_TEMPLATE, fillTemplate, generateJdWithAi,
  connectedAppInfo, findOAuthMailAccount, getCommsSettings, MAIL_PRESETS, mailDelivery, PLACEHOLDERS, saveMailAccount, sendTestEmail, SETTINGS, startMicrosoftSignIn,
  setInternalMailAccount,
} from "../../lib/comms";

async function load() {
  const settings = await getCommsSettings();
  const accounts = await frappe.getList("Email Account", { filters: [["name", "in", Object.values(MAIL_PRESETS).map((p) => p.account)]], fields: ["name", "email_id", "enable_outgoing", "default_outgoing", "smtp_server", "smtp_port"], limit: 0 }).catch(() => []);
  const oauth = await findOAuthMailAccount(settings);
  const [app, delivery] = await Promise.all([connectedAppInfo(oauth?.connected_app), mailDelivery()]);
  return { settings, accounts: Object.fromEntries(accounts.map((a) => [a.name, a])), oauth: oauth && { ...oauth, app }, delivery };
}

export default function Communication() {
  const data = useAsync(load, []);
  const [tab, setTab] = useState("mail");
  return (
    <div className="space-y-5">
      <PageHeader icon={Mail} title="Communication" subtitle="Mail accounts, automatic birthday and event emails, and AI job descriptions" actions={<SharedAcrossClients what="Mail and email settings" />} />
      <Async state={data}>
        {(d) => !d.settings ? (
          <Notice>Communication settings aren't set up on this site yet. They're created by the automatic setup - use Apply Again on Admin › Roles &amp; Permissions, then come back.</Notice>
        ) : (
          <>
            <Tabs value={tab} onChange={setTab} tabs={[{ id: "mail", label: "Mail Accounts" }, { id: "auto", label: "Birthday & Event Emails" }, { id: "ai", label: "AI Job Descriptions" }]} />
            {tab === "mail" && <div className="grid grid-cols-1 gap-5 xl:grid-cols-2"><OutlookAccount account={d.oauth} settings={d.settings} delivery={d.delivery} onSaved={data.reload} /><MailAccount kind="candidate" account={d.accounts[MAIL_PRESETS.candidate.account]} onSaved={data.reload} /></div>}
            {tab === "auto" && <AutoEmails settings={d.settings} onSaved={data.reload} />}
            {tab === "ai" && <AiSettings settings={d.settings} onSaved={data.reload} />}
          </>
        )}
      </Async>
    </div>
  );
}

/**
 * HR › Birthday & Event Emails: the same templates as Admin › Communication, plus the company events the reminders
 * are sent for. Mail accounts and the AI key stay with the Administrator.
 */
export function HrCommunication() {
  const settings = useAsync(getCommsSettings, []);
  const [tab, setTab] = useState("templates");
  return (
    <div className="space-y-5">
      <PageHeader icon={Cake} title="Birthday & Event Emails" subtitle="Write the birthday wishes and event reminders, and keep the company events up to date" />
      <Tabs value={tab} onChange={setTab} tabs={[{ id: "templates", label: "Email Templates" }, { id: "events", label: "Company Events" }]} />
      {tab === "templates" && (
        <Async state={settings}>
          {(s) => !s ? <Notice>Birthday and event emails aren't set up on this site yet. They're set up automatically the next time the Administrator signs in.</Notice> : <AutoEmails settings={s} onSaved={settings.reload} />}
        </Async>
      )}
      {tab === "events" && <CompanyEvents />}
    </div>
  );
}

const toInput = (v) => (v ? String(v).replace(" ", "T").slice(0, 16) : "");
const toStamp = (v) => (v ? `${v.replace("T", " ")}:00` : null);

/** Public events on the company calendar: every employee sees them and gets the reminder email. */
function CompanyEvents() {
  const [since] = useState(() => isoDate(new Date(Date.now() - 30 * 86400000)));
  const events = useAsync(() => frappe.getList("Event", { filters: [["event_type", "=", "Public"], ["starts_on", ">=", `${since} 00:00:00`]], fields: ["name", "subject", "starts_on", "ends_on", "all_day", "description"], orderBy: "starts_on asc", limit: 0 }), [since]);
  const [editing, setEditing] = useState(null); // null | {} (new) | event row
  const [err, setErr] = useState("");

  async function remove(ev) {
    if (!(await confirmDialog({ title: "Delete Event", message: `Delete "${ev.subject}" on ${dmy(ev.starts_on)}? No reminder is sent for it.`, danger: true, confirmLabel: "Delete" }))) return;
    setErr("");
    try {
      await frappe.deleteDoc("Event", ev.name);
      events.reload();
    } catch (x) {
      setErr(errMsg(x, "Couldn't delete the event."));
    }
  }

  return (
    <Panel title="Company Events" hint="Public events from the last 30 days onwards. Reminders go to every employee before the event and on the day." action={<Button onClick={() => setEditing({})}><Plus size={14} /> Add Event</Button>}>
      {err && <div className="mb-3"><Notice>{err}</Notice></div>}
      <Async state={events}>
        {(rows) => <Grid rows={rows} empty="No company events yet." columns={[
          { key: "subject", label: "Event", render: (e) => <span className="font-medium">{e.subject}</span> },
          { key: "starts_on", label: "When", render: (e) => (Number(e.all_day) ? dmy(e.starts_on) : dmyHm(e.starts_on)) },
          { key: "description", label: "Details", render: (e) => <span className="text-[12px] text-[var(--color-text-muted)]">{String(e.description || "").replace(/<[^>]*>/g, " ").trim() || "—"}</span> },
          { key: "_a", label: "", render: (e) => (
            <div className="flex justify-end gap-1">
              <button type="button" title="Edit" onClick={() => setEditing(e)} className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] transition-colors hover:border-[var(--color-border-strong)] hover:bg-[var(--color-surface-2)] text-[var(--color-text-muted)] hover:text-[var(--color-text)]"><Pencil size={14} /></button>
              <button type="button" title="Delete" onClick={() => remove(e)} className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] transition-colors hover:border-[var(--color-border-strong)] hover:bg-[var(--color-surface-2)] text-[var(--color-text-muted)] hover:!text-[var(--color-red-hover)]"><Trash2 size={14} /></button>
            </div>
          ) },
        ]} />}
      </Async>
      {editing && <EventForm event={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); events.reload(); }} />}
    </Panel>
  );
}

function EventForm({ event, onClose, onSaved }) {
  const edit = Boolean(event.name);
  const [f, setF] = useState({ subject: event.subject || "", starts: toInput(event.starts_on), ends: toInput(event.ends_on), allDay: Boolean(Number(event.all_day)), details: String(event.description || "").replace(/<[^>]*>/g, "").trim() });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  async function submit(e) {
    e.preventDefault();
    if (f.ends && f.ends < f.starts) return setErr("The end can't be before the start.");
    setBusy(true);
    setErr("");
    try {
      const body = { subject: f.subject.trim(), event_type: "Public", event_category: "Event", all_day: f.allDay ? 1 : 0, starts_on: toStamp(f.starts), ends_on: toStamp(f.ends), description: f.details.trim() };
      if (edit) await frappe.updateDoc("Event", event.name, body);
      else await frappe.createDoc("Event", body);
      onSaved();
    } catch (x) {
      setErr(errMsg(x, "Couldn't save the event."));
      setBusy(false);
    }
  }
  return (
    <Modal title={edit ? `Edit ${event.subject}` : "Add Company Event"} onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <Field label="Event"><input required className={inputCls} value={f.subject} onChange={(e) => setF({ ...f, subject: e.target.value })} placeholder="e.g. Annual Day" /></Field>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Starts"><input required type="datetime-local" className={inputCls} value={f.starts} onChange={(e) => setF({ ...f, starts: e.target.value })} /></Field>
          <Field label="Ends (Optional)"><input type="datetime-local" className={inputCls} value={f.ends} onChange={(e) => setF({ ...f, ends: e.target.value })} /></Field>
        </div>
        <label className="flex items-center gap-2 text-[12px] text-[var(--color-text-muted)]"><input type="checkbox" checked={f.allDay} onChange={(e) => setF({ ...f, allDay: e.target.checked })} /> All day</label>
        <Field label="Details (Optional)" hint="Shown as {details} in the reminder email: venue, dress code, agenda…"><textarea rows={3} className={inputCls} value={f.details} onChange={(e) => setF({ ...f, details: e.target.value })} /></Field>
        {err && <Notice>{err}</Notice>}
        <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={onClose}>Cancel</Button><Button type="submit" disabled={busy}><CalendarDays size={14} /> {busy ? "Saving…" : edit ? "Save Changes" : "Add Event"}</Button></div>
      </form>
    </Modal>
  );
}

/* ------------------------------- mail accounts ------------------------------- */

/**
 * Internal mail through Microsoft 365. Microsoft blocks password sign-in (Security Defaults, and basic SMTP auth ends
 * for all tenants), so this account signs in with OAuth: an ERPNext Email Account with Method OAuth and a Connected App.
 * This card finds it, uses it for internal mail, can renew the Microsoft sign-in, and never sets a password on it.
 */
function OutlookAccount({ account, settings, delivery, onSaved }) {
  const { user } = useAuth();
  const p = MAIL_PRESETS.internal;
  const [testTo, setTestTo] = useState(user?.email && user.email.includes("@") ? user.email : "");
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState(null);
  const origin = account?.app?.origin || "";
  const deskLink = origin && account ? `${origin}/app/email-account/${encodeURIComponent(account.name)}` : "";
  const linked = account && settings?.internal_email_account === account.name && settings?.internal_sender === account.email_id;
  const mine = account && (account.connected_user || "Administrator") === user?.email;

  async function link() {
    setMsg(null);
    setBusy("link");
    try {
      await setInternalMailAccount(account);
      setMsg({ ok: true, text: `Announcements, birthday wishes and event reminders now go out from ${account.email_id}.` });
      onSaved();
    } catch (x) {
      setMsg({ ok: false, text: errMsg(x, "Couldn't update the communication settings.") });
    }
    setBusy("");
  }

  async function signIn() {
    if (!(await confirmDialog({ title: "Connect with Microsoft", message: `Sign in to Microsoft as ${account.email_id} to renew this account's access? A new tab opens; after Microsoft, ERPNext saves the access and brings you back.`, confirmLabel: "Continue" }))) return;
    setMsg(null);
    setBusy("auth");
    // Open the tab first (browsers block pop-ups opened after a wait), then send it to Microsoft.
    const tab = window.open("", "_blank");
    try {
      const url = await startMicrosoftSignIn(account, `${window.location.origin}/admin/communication`);
      if (!url) throw new Error("ERPNext didn't return a Microsoft sign-in address.");
      if (tab) tab.location.href = url;
      else window.location.href = url;
      setMsg({ ok: true, text: "Finish signing in to Microsoft in the new tab, then send a test email here." });
    } catch (x) {
      tab?.close();
      setMsg({ ok: false, text: `${errMsg(x, "Couldn't start the Microsoft sign-in.").replace(/[.\s]*$/, ".")}${deskLink ? " Use Open in ERPNext and click Authorize API Access there instead." : ""}` });
    }
    setBusy("");
  }

  async function test() {
    setMsg(null);
    setBusy("test");
    try {
      const r = await sendTestEmail(account.name, testTo);
      setMsg({ ok: true, text: `Test email sent from ${r.from} to ${r.sent}. Check that inbox (and spam).` });
    } catch (x) {
      setMsg({ ok: false, text: commsError(x, errMsg, "The test email couldn't be sent.") });
    }
    setBusy("");
  }

  return (
    <Panel title={p.title} hint={p.hint}>
      {account ? (
        <div className="space-y-3 text-[13px]">
          <p className="flex flex-wrap items-center gap-1.5 text-[12.5px] text-[var(--color-green)]"><CheckCircle2 size={14} /> <b>Connected</b> · {account.email_id}</p>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-[12px]">
            <dt className="text-[var(--color-text-faint)]">Sign-in</dt><dd className="text-[var(--color-text)]">Microsoft (OAuth){account.app?.provider ? ` · ${account.app.provider}` : ""}</dd>
            <dt className="text-[var(--color-text-faint)]">ERPNext Mail Account</dt><dd className="text-[var(--color-text)]">{account.name}{Number(account.default_outgoing) ? " · default for system emails" : ""}</dd>
            <dt className="text-[var(--color-text-faint)]">Authorized By</dt><dd className="text-[var(--color-text)]">{account.connected_user || "—"}</dd>
            <dt className="text-[var(--color-text-faint)]">Server</dt><dd className="text-[var(--color-text)]">{account.smtp_server || "smtp.office365.com"}:{account.smtp_port || 587}</dd>
          </dl>
          {!linked && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2">
              <span className="text-[12px] text-[var(--color-text-muted)]">Internal emails aren't using this account yet.</span>
              <Button type="button" disabled={Boolean(busy)} onClick={link}>{busy === "link" ? "Saving…" : "Use for Internal Mail"}</Button>
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            {mine && account.connected_app && <Button type="button" variant="secondary" disabled={Boolean(busy)} onClick={signIn}><LogIn size={14} /> {busy === "auth" ? "Opening…" : "Connect with Microsoft"}</Button>}
            {deskLink && <a href={deskLink} target="_blank" rel="noreferrer"><Button type="button" variant="ghost"><ExternalLink size={14} /> Open in ERPNext</Button></a>}
          </div>
          <p className="text-[11px] text-[var(--color-text-faint)]">
            {mine ? "Use Connect with Microsoft only if sending starts failing (for example after a password change or revoked consent). Your ERPNext sign-in on the ERPNext site is needed when Microsoft sends you back." : `Only ${account.connected_user || "the connected user"} can renew the Microsoft sign-in (in ERPNext: Authorize API Access).`}
            {" "}The password isn't used and can't be set here.
          </p>
        </div>
      ) : (
        <div className="space-y-3 text-[13px]">
          <p className="flex items-center gap-1.5 text-[12px] text-[var(--color-amber)]"><AlertTriangle size={13} /> Not connected</p>
          <p className="text-[12.5px] text-[var(--color-text-muted)]">Microsoft 365 doesn't allow password sign-in for sending mail (Security Defaults, and basic SMTP sign-in is being switched off for all tenants), so this account signs in with Microsoft. Set it up once in ERPNext:</p>
          <ol className="list-decimal space-y-1 pl-5 text-[12px] text-[var(--color-text-muted)]">
            <li>Integrations › Connected App for Microsoft, with the scopes <code>https://outlook.office.com/SMTP.Send</code> and <code>offline_access</code>.</li>
            <li>Email Account with Method <b>OAuth</b>, that Connected App, Enable Outgoing (and Default Outgoing), smtp.office365.com port 587 TLS.</li>
            <li>Click <b>Authorize API Access</b> and sign in as the mailbox.</li>
          </ol>
          <p className="text-[11px] text-[var(--color-text-faint)]">This card picks the account up automatically once it can send.</p>
        </div>
      )}
      {account && (
        <div className="mt-4 flex flex-wrap items-end gap-2 border-t border-[var(--color-border)] pt-4">
          <div className="min-w-[14rem] flex-1"><Field label="Send a Test Email To"><input type="email" className={inputCls} value={testTo} onChange={(e) => setTestTo(e.target.value)} /></Field></div>
          <Button type="button" variant="secondary" disabled={Boolean(busy) || !testTo} onClick={test}><Send size={14} /> {busy === "test" ? "Sending…" : "Send Test"}</Button>
        </div>
      )}
      <Delivery delivery={delivery} />
      {msg && <div className="mt-3"><Notice tone={msg.ok ? "info" : "error"}>{msg.text}</Notice></div>}
    </Panel>
  );
}

/** Whether queued emails actually leave: ERPNext's scheduler and a queue worker send them every few minutes. */
function Delivery({ delivery }) {
  if (!delivery) return null;
  const { waiting, stuck, failed, lastRun } = delivery;
  const ok = !stuck && !failed.length;
  return (
    <div className={`mt-4 rounded-md border px-3 py-2.5 text-[12px] ${ok ? "border-[var(--color-border)] text-[var(--color-text-muted)]" : "border-[var(--color-amber)]/40 text-[var(--color-text)]"}`}>
      <p className="font-medium">{ok ? "Automatic sending is working" : "Automatic sending needs attention"}</p>
      <p className="mt-0.5">{waiting ? `${waiting} email(s) waiting to send` : "No emails waiting"}{stuck ? ` · ${stuck} waiting over 15 minutes` : ""}{failed.length ? ` · ${failed.length} failed` : ""}{lastRun ? ` · send job last ran ${dmyHm(lastRun.creation)} (${lastRun.status})` : ""}</p>
      {stuck > 0 && <p className="mt-1 text-[11.5px] text-[var(--color-text-muted)]">Emails are queued but not going out: ERPNext's scheduler or its queue worker isn't running. The server administrator can check with <code>bench --site &lt;site&gt; doctor</code> and turn it on with <code>bench --site &lt;site&gt; enable-scheduler</code>.</p>}
      {failed[0]?.error && <p className="mt-1 line-clamp-2 text-[11.5px] text-[var(--color-red-hover)]">Last error: {String(failed[0].error).replace(/<[^>]*>/g, " ").trim().slice(0, 240)}</p>}
    </div>
  );
}

function MailAccount({ kind, account, onSaved }) {
  const { user } = useAuth();
  const p = MAIL_PRESETS[kind];
  const [f, setF] = useState({ email: account?.email_id || "", password: "", smtpServer: account?.smtp_server || p.smtp_server, smtpPort: account?.smtp_port || p.smtp_port });
  const [testTo, setTestTo] = useState(user?.email && user.email.includes("@") ? user.email : "");
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState(null);
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  const gmail = kind === "candidate";

  async function save(e) {
    e.preventDefault();
    setMsg(null);
    if (!account && !f.password) return setMsg({ ok: false, text: "Enter the password (or app password) for this mailbox." });
    setBusy("save");
    try {
      await saveMailAccount(kind, f);
      setF((x) => ({ ...x, password: "" }));
      setMsg({ ok: true, text: "Saved - ERPNext signed in to the mail server successfully. Send a test email to be sure." });
      onSaved();
    } catch (x) {
      setMsg({ ok: false, text: `${errMsg(x, "ERPNext couldn't sign in to the mail server.").replace(/[.\s]*$/, ".")} ${gmail ? "For Gmail, turn on 2-Step Verification and use an App Password, not your normal password." : "For Microsoft 365, SMTP AUTH must be enabled for this mailbox (Microsoft 365 admin centre), and an app password used if MFA is on."}` });
    }
    setBusy("");
  }

  async function test() {
    setMsg(null);
    setBusy("test");
    try {
      const r = await sendTestEmail(p.account, testTo);
      setMsg({ ok: true, text: `Test email sent from ${r.from} to ${r.sent}. Check that inbox (and spam).` });
    } catch (x) {
      setMsg({ ok: false, text: commsError(x, errMsg, "The test email couldn't be sent.") });
    }
    setBusy("");
  }

  return (
    <Panel title={p.title} hint={p.hint}>
      <form onSubmit={save} className="space-y-3 text-[13px]">
        {account ? <p className="flex items-center gap-1.5 text-[12px] text-[var(--color-green)]"><CheckCircle2 size={13} /> Set up: {account.email_id}{Number(account.default_outgoing) ? " · default for system emails" : ""}</p> : <p className="text-[12px] text-[var(--color-amber)]">Not set up yet.</p>}
        <Field label="Email Address"><input type="email" required className={inputCls} value={f.email} onChange={set("email")} placeholder={gmail ? "careers@yourcompany.com or name@gmail.com" : "hr@yourcompany.com"} /></Field>
        <Field label={account ? "Password (Leave Blank to Keep)" : "Password"} hint={gmail ? "Gmail: a 16-character App Password (Google Account › Security › App passwords)" : "Outlook / Microsoft 365: the mailbox password, or an app password if MFA is on"}>
          <input type="password" autoComplete="new-password" className={inputCls} value={f.password} onChange={set("password")} />
        </Field>
        <div className="grid grid-cols-3 gap-3">
          <div className="col-span-2"><Field label="SMTP Server"><input required className={inputCls} value={f.smtpServer} onChange={set("smtpServer")} /></Field></div>
          <Field label="Port"><input type="number" required className={inputCls} value={f.smtpPort} onChange={set("smtpPort")} /></Field>
        </div>
        <p className="text-[11px] text-[var(--color-text-faint)]">{gmail ? "smtp.gmail.com, port 587 with TLS." : "smtp.office365.com, port 587 with TLS (Outlook.com: smtp-mail.outlook.com)."} ERPNext signs in when you save, so a wrong password is caught straight away.</p>
        <div className="flex justify-end"><Button type="submit" disabled={Boolean(busy)}>{busy === "save" ? "Saving…" : account ? "Save Changes" : "Set Up Account"}</Button></div>
      </form>
      {account && (
        <div className="mt-4 flex flex-wrap items-end gap-2 border-t border-[var(--color-border)] pt-4">
          <div className="min-w-[14rem] flex-1"><Field label="Send a Test Email To"><input type="email" className={inputCls} value={testTo} onChange={(e) => setTestTo(e.target.value)} /></Field></div>
          <Button type="button" variant="secondary" disabled={Boolean(busy) || !testTo} onClick={test}><Send size={14} /> {busy === "test" ? "Sending…" : "Send Test"}</Button>
        </div>
      )}
      {msg && <div className="mt-3"><Notice tone={msg.ok ? "info" : "error"}>{msg.text}</Notice></div>}
    </Panel>
  );
}

/* ------------------------------ automatic emails ------------------------------ */

const SAMPLE = { employee_name: "Asha Rao", first_name: "Asha", company: "Ethx Softcon Pvt Ltd", event: "Annual Day", date: "05 Dec 2026", time: " at 18:00", details: "Venue: Main Hall. Dress code: Smart casual." };

function AutoEmails({ settings, onSaved }) {
  const [f, setF] = useState({
    birthday_emails: settings.birthday_emails == null ? true : Boolean(Number(settings.birthday_emails)),
    birthday_subject: settings.birthday_subject || DEFAULT_BIRTHDAY_SUBJECT,
    birthday_template: settings.birthday_template || DEFAULT_BIRTHDAY_TEMPLATE,
    event_emails: settings.event_emails == null ? true : Boolean(Number(settings.event_emails)),
    event_days_before: settings.event_days_before ?? 1,
    event_subject: settings.event_subject || DEFAULT_EVENT_SUBJECT,
    event_template: settings.event_template || DEFAULT_EVENT_TEMPLATE,
  });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value }));

  async function save(e) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      await frappe.updateDoc(SETTINGS, SETTINGS, { ...f, birthday_emails: f.birthday_emails ? 1 : 0, event_emails: f.event_emails ? 1 : 0, event_days_before: Number(f.event_days_before) || 0 });
      setMsg({ ok: true, text: "Saved. Birthday and event emails go out every morning from the internal mail account." });
      onSaved();
    } catch (x) {
      setMsg({ ok: false, text: errMsg(x, "Couldn't save the templates.") });
    }
    setBusy(false);
  }

  const preview = (subject, body) => (
    <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] p-3 text-[12.5px]">
      <p className="mb-2 text-[11px] uppercase tracking-wide text-[var(--color-text-faint)]">Preview</p>
      <p className="mb-2 font-medium text-[var(--color-text)]">{fillTemplate(subject, SAMPLE)}</p>
      <p className="whitespace-pre-line text-[var(--color-text-muted)]">{fillTemplate(body, SAMPLE)}</p>
    </div>
  );

  return (
    <form onSubmit={save} className="space-y-5">
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        <Panel title="Birthday Wishes" hint="Sent to the employee on their birthday, every morning">
          <div className="space-y-3 text-[13px]">
            <label className="flex items-center gap-2 text-[12px] text-[var(--color-text-muted)]"><input type="checkbox" checked={f.birthday_emails} onChange={set("birthday_emails")} /> Send birthday emails</label>
            <Field label="Subject"><input className={inputCls} value={f.birthday_subject} onChange={set("birthday_subject")} /></Field>
            <Field label="Message" hint={`Placeholders: ${PLACEHOLDERS.birthday.join(" ")}`}><textarea rows={9} className={inputCls} value={f.birthday_template} onChange={set("birthday_template")} /></Field>
            {preview(f.birthday_subject, f.birthday_template)}
          </div>
        </Panel>
        <Panel title="Event Reminders" hint="Public events from the company calendar, emailed to every employee">
          <div className="space-y-3 text-[13px]">
            <label className="flex items-center gap-2 text-[12px] text-[var(--color-text-muted)]"><input type="checkbox" checked={f.event_emails} onChange={set("event_emails")} /> Send event reminder emails</label>
            <Field label="Days Before the Event" hint="Also sent on the day itself. 0 = on the day only."><input type="number" min="0" max="30" className={inputCls} value={f.event_days_before} onChange={set("event_days_before")} /></Field>
            <Field label="Subject"><input className={inputCls} value={f.event_subject} onChange={set("event_subject")} /></Field>
            <Field label="Message" hint={`Placeholders: ${PLACEHOLDERS.event.join(" ")}`}><textarea rows={7} className={inputCls} value={f.event_template} onChange={set("event_template")} /></Field>
            {preview(f.event_subject, f.event_template)}
          </div>
        </Panel>
      </div>
      {msg && <Notice tone={msg.ok ? "info" : "error"}>{msg.text}</Notice>}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={() => setF((x) => ({ ...x, birthday_subject: DEFAULT_BIRTHDAY_SUBJECT, birthday_template: DEFAULT_BIRTHDAY_TEMPLATE, event_subject: DEFAULT_EVENT_SUBJECT, event_template: DEFAULT_EVENT_TEMPLATE }))}>Restore Default Templates</Button>
        <Button type="submit" disabled={busy}>{busy ? "Saving…" : "Save Templates"}</Button>
      </div>
    </form>
  );
}

/* ------------------------------------ AI ------------------------------------ */

function AiSettings({ settings, onSaved }) {
  const [enabled, setEnabled] = useState(Boolean(Number(settings.ai_enabled)));
  const [model, setModel] = useState(settings.ai_model || "claude-opus-5-5");
  const [key, setKey] = useState("");
  const hasKey = Boolean(settings.ai_api_key);
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState(null);
  const [sample, setSample] = useState("");

  async function save(e) {
    e.preventDefault();
    setMsg(null);
    if (enabled && !hasKey && !key.trim()) return setMsg({ ok: false, text: "Add the Anthropic API key to switch AI on." });
    setBusy("save");
    try {
      await frappe.updateDoc(SETTINGS, SETTINGS, { ai_enabled: enabled ? 1 : 0, ai_model: model, ...(key.trim() ? { ai_api_key: key.trim() } : {}) });
      setKey("");
      setMsg({ ok: true, text: enabled ? "Saved. HR can now generate job descriptions from keywords when creating an opening." : "Saved. AI is off - HR gets a structured template draft instead." });
      onSaved();
    } catch (x) {
      setMsg({ ok: false, text: errMsg(x, "Couldn't save the AI settings.") });
    }
    setBusy("");
  }

  async function test() {
    setMsg(null);
    setSample("");
    setBusy("test");
    try {
      const r = await generateJdWithAi({ title: "Oracle Fusion Finance Consultant", keywords: "Oracle Fusion Financials, GL, AP, BI Publisher, OTBI", experience: "6-10 years", location: "Pune", work_mode: "Hybrid" });
      setSample(r.text);
      setMsg({ ok: true, text: `It works - written by ${r.model}.` });
    } catch (x) {
      setMsg({ ok: false, text: commsError(x, errMsg, "The AI request failed.") });
    }
    setBusy("");
  }

  return (
    <Panel title="AI Job Descriptions" hint="HR types a title and keywords; Claude writes the job description, which HR reviews and edits before saving">
      <form onSubmit={save} className="max-w-2xl space-y-3 text-[13px]">
        <label className="flex items-center gap-2 text-[12px] text-[var(--color-text-muted)]"><input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} /> Use AI (Claude) to write job descriptions</label>
        <Field label="Model"><select className={inputCls} value={model} onChange={(e) => setModel(e.target.value)}>{AI_MODELS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}</select></Field>
        <Field label={hasKey ? "Anthropic API Key (Saved - Enter a New One to Replace It)" : "Anthropic API Key"} hint="Create one at platform.claude.com › API Keys. It's stored encrypted on the ERPNext server and never sent to browsers.">
          <input type="password" autoComplete="new-password" className={inputCls} value={key} onChange={(e) => setKey(e.target.value)} placeholder={hasKey ? "••••••••" : "sk-ant-…"} />
        </Field>
        <p className="text-[11px] text-[var(--color-text-faint)]">Only the job details HR types (title, skills, experience, location) are sent to Anthropic - no employee or candidate data. Each description costs a fraction of a rupee to a few rupees, depending on the model. When AI is off, HR still gets a structured draft from the keywords.</p>
        {msg && <Notice tone={msg.ok ? "info" : "error"}>{msg.text}</Notice>}
        <div className="flex justify-end gap-2">
          {Number(settings.ai_enabled) === 1 && hasKey && <Button type="button" variant="secondary" disabled={Boolean(busy)} onClick={test}><Sparkles size={14} /> {busy === "test" ? "Writing a Sample…" : "Test With a Sample JD"}</Button>}
          <Button type="submit" disabled={Boolean(busy)}>{busy === "save" ? "Saving…" : "Save"}</Button>
        </div>
        {sample && <pre className="max-h-80 overflow-auto whitespace-pre-wrap rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] p-3 font-sans text-[12.5px] text-[var(--color-text)]">{sample}</pre>}
      </form>
    </Panel>
  );
}
