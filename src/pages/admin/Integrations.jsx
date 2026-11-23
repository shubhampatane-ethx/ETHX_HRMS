// Admin › Integrations: connecting HRMS 360 to other systems.
//  - API Access: API users (key + secret) for other systems, and how to call the REST API.
//  - Webhooks: HRMS 360 tells another system when something happens (ERPNext's Webhook doctype), with delivery logs.
//  - Biometric Attendance: the endpoint devices push punches to (ethx_biometric_punch, integrationSetup.js) and each
//    employee's Attendance Device ID.
//  - Bank Salary File: a month's submitted salary slips as a bank transfer file (CSV).
import { useMemo, useState } from "react";
import { Copy, Download, Fingerprint, KeyRound, Landmark, Plug, Plus, RefreshCw, Search, Trash2, Webhook } from "lucide-react";
import { frappe } from "../../lib/api/frappeClient";
import { Button } from "../../components/ui/primitives";
import { Async, chipCls, Empty, Field, Grid, inputCls, Modal, Notice, PageHeader, Panel, StatusPill, Tabs } from "../../components/employee/EmployeeShell";
import { alertDialog, confirmDialog } from "../../components/ui/dialogs";
import { dmy, dmyHm, errMsg, listTry, money, useAsync } from "../../lib/employeePortal";
import { downloadCsv } from "../../lib/recruitment";
import { INTEGRATION_ROLE } from "../../lib/integrationSetup";
import { SharedAcrossClients } from "../../components/layout/ClientSwitcher";
import { thisMonth, monthLabel } from "../../lib/analytics";

const TABS = [{ id: "api", label: "API Access" }, { id: "webhooks", label: "Webhooks" }, { id: "biometric", label: "Biometric Attendance" }, { id: "bank", label: "Bank Salary File" }];
const origin = () => window.location.origin;

export default function Integrations() {
  const [tab, setTab] = useState("api");
  return (
    <div className="space-y-5">
      <PageHeader icon={Plug} title="Integrations" subtitle="Connect HRMS 360 to biometric devices, banks, payroll and other systems" actions={tab !== "bank" && <SharedAcrossClients what="API users, webhooks and the biometric endpoint" />} />
      <Tabs value={tab} onChange={setTab} tabs={TABS} />
      {tab === "api" && <ApiAccess />}
      {tab === "webhooks" && <Webhooks />}
      {tab === "biometric" && <Biometric />}
      {tab === "bank" && <BankFile />}
    </div>
  );
}

function CopyBox({ label, value, mono = true }) {
  const [done, setDone] = useState(false);
  const copy = async () => { try { await navigator.clipboard.writeText(value); setDone(true); setTimeout(() => setDone(false), 1500); } catch { /* clipboard blocked */ } };
  return (
    <div>
      {label && <p className="mb-1 text-[11.5px] font-medium text-[var(--color-text-muted)]">{label}</p>}
      <div className="flex items-start gap-2 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2">
        <code className={`min-w-0 flex-1 whitespace-pre-wrap break-all text-[12px] text-[var(--color-text)] ${mono ? "font-mono" : ""}`}>{value}</code>
        <button type="button" onClick={copy} title="Copy" className="shrink-0 text-[11.5px] text-[var(--color-red-hover)] hover:underline">{done ? "Copied" : <Copy size={13} />}</button>
      </div>
    </div>
  );
}

/* -------------------------------- API access -------------------------------- */

async function loadApiUsers() {
  const roles = await frappe.getList("Has Role", { parent: "User", filters: [["parenttype", "=", "User"], ["role", "=", INTEGRATION_ROLE]], fields: ["parent"], limit: 0 });
  const names = [...new Set(roles.map((r) => r.parent))];
  if (!names.length) return [];
  return listTry("User", { filters: [["name", "in", names]], fields: ["name", "full_name", "enabled", "api_key", "creation"], orderBy: "creation desc" }, ["name", "full_name", "enabled", "creation"]);
}

async function issueKeys(user) {
  const res = await frappe.callMethod("frappe.core.doctype.user.user.generate_keys", { user });
  const doc = await frappe.getDoc("User", user);
  return { user, apiKey: res?.api_key || doc.api_key, apiSecret: res?.api_secret };
}

function ApiAccess() {
  const users = useAsync(loadApiUsers, []);
  const [adding, setAdding] = useState(false);
  const [keys, setKeys] = useState(null);

  async function newSecret(u) {
    if (!(await confirmDialog({ title: "New API Secret", message: `Issue a new secret for ${u.full_name || u.name}? The old secret stops working at once - update the other system straight after.`, confirmLabel: "Issue New Secret" }))) return;
    try { setKeys(await issueKeys(u.name)); users.reload(); } catch (e) { alertDialog({ tone: "error", message: errMsg(e, "Couldn't issue a new secret.") }); }
  }
  async function toggle(u) {
    const on = !Number(u.enabled);
    if (!(await confirmDialog({ title: on ? "Enable API User" : "Disable API User", message: on ? `Let ${u.name} connect again?` : `Stop ${u.name} from connecting? Its key stops working until enabled again.`, confirmLabel: on ? "Enable" : "Disable" }))) return;
    try { await frappe.updateDoc("User", u.name, { enabled: on ? 1 : 0 }); users.reload(); } catch (e) { alertDialog({ tone: "error", message: errMsg(e, "Couldn't change this user.") }); }
  }

  return (
    <div className="space-y-5">
      <Panel title="API Users" hint="One per connected system. Each signs in with its own key and secret, and can be disabled on its own."
        action={<Button onClick={() => setAdding(true)}><Plus size={14} /> Add API User</Button>}>
        <Async state={users}>
          {(rows) => rows.length === 0 ? <Empty icon={KeyRound} text="No API users yet. Add one for each system that connects - for example your biometric software." /> : <Grid rows={rows} columns={[
            { key: "full_name", label: "System", render: (u) => <span>{u.full_name || u.name}<span className="block text-[11px] text-[var(--color-text-faint)]">{u.name}</span></span> },
            { key: "api_key", label: "API Key", render: (u) => (u.api_key ? <code className="text-[12px]">{u.api_key}</code> : <span className="text-[12px] text-[var(--color-text-faint)]">No key yet</span>) },
            { key: "creation", label: "Added", render: (u) => dmy(u.creation) },
            { key: "enabled", label: "Status", render: (u) => <StatusPill status={Number(u.enabled) ? "Active" : "Disabled"} /> },
            { key: "_a", label: "", render: (u) => <div className="flex justify-end gap-3 whitespace-nowrap text-[12px]">
              <button type="button" onClick={() => newSecret(u)} className="flex items-center gap-1 text-[var(--color-red-hover)] hover:underline"><RefreshCw size={12} /> {u.api_key ? "New Secret" : "Issue Key"}</button>
              <button type="button" onClick={() => toggle(u)} className="text-[var(--color-text-muted)] hover:text-[var(--color-text)]">{Number(u.enabled) ? "Disable" : "Enable"}</button>
            </div> },
          ]} />}
        </Async>
      </Panel>

      <Panel title="Using the REST API" hint="Every ERPNext and HRMS record is available over REST, limited to what the API user's roles allow.">
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          <CopyBox label="Header on every request" value={"Authorization: token <api_key>:<api_secret>"} />
          <CopyBox label="List employees" value={`GET ${origin()}/api/resource/Employee?fields=["name","employee_name","department","status"]&limit_page_length=0`} />
          <CopyBox label="Read one record" value={`GET ${origin()}/api/resource/Leave Application/<name>`} />
          <CopyBox label="Send attendance punches" value={`POST ${origin()}/api/method/ethx_biometric_punch`} />
        </div>
        <p className="mt-3 text-[12px] text-[var(--color-text-muted)]">An API user starts with the {INTEGRATION_ROLE} role, which only allows sending punches. To let a system read or write HR records, give its user the right roles under Access Control.</p>
      </Panel>

      {adding && <AddApiUser onClose={() => setAdding(false)} onDone={(k) => { setAdding(false); setKeys(k); users.reload(); }} />}
      {keys && <KeysModal keys={keys} onClose={() => setKeys(null)} />}
    </div>
  );
}

function AddApiUser({ onClose, onDone }) {
  const [f, setF] = useState({ name: "", email: "", hr: false });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setErr("");
    try {
      const email = f.email.trim().toLowerCase();
      await frappe.createDoc("User", { email, first_name: f.name.trim(), user_type: "System User", send_welcome_email: 0, roles: [{ role: INTEGRATION_ROLE }, ...(f.hr ? [{ role: "HR User" }] : [])] });
      onDone(await issueKeys(email));
    } catch (x) {
      setErr(errMsg(x, "Couldn't create the API user."));
      setBusy(false);
    }
  }
  return (
    <Modal title="Add API User" onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <Field label="System Name"><input required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} className={inputCls} placeholder="e.g. Biometric - Head Office" /></Field>
        <Field label="Account Email" hint="Any unique address - it is only an account name, nothing is sent to it"><input required type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} className={inputCls} placeholder="biometric@yourcompany.com" /></Field>
        <label className="flex items-start gap-2 text-[12.5px] text-[var(--color-text)]"><input type="checkbox" className="mt-0.5" checked={f.hr} onChange={(e) => setF({ ...f, hr: e.target.checked })} /> Also let it read and write HR records (HR User role) - for payroll or ERP tools, not needed for biometric devices.</label>
        {err && <Notice>{err}</Notice>}
        <div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit" disabled={busy}>{busy ? "Creating…" : "Create & Issue Key"}</Button></div>
      </form>
    </Modal>
  );
}

function KeysModal({ keys, onClose }) {
  return (
    <Modal title="API Key Issued" onClose={onClose}>
      <div className="space-y-3">
        <Notice tone="info">Copy the secret now - it is shown only once. If it's lost, issue a new secret.</Notice>
        <CopyBox label="API Key" value={keys.apiKey || "—"} />
        <CopyBox label="API Secret" value={keys.apiSecret || "—"} />
        <CopyBox label="Header for the other system" value={`Authorization: token ${keys.apiKey}:${keys.apiSecret}`} />
        <div className="flex justify-end"><Button onClick={onClose}>Done</Button></div>
      </div>
    </Modal>
  );
}

/* --------------------------------- webhooks --------------------------------- */

// What can be sent, and the fields each message carries (ERPNext fills {{ }} from the record).
const EVENTS = [
  { id: "employee_created", label: "Employee Created", doctype: "Employee", event: "after_insert", fields: ["employee_name", "company", "department", "designation", "date_of_joining", "status"] },
  { id: "employee_updated", label: "Employee Updated", doctype: "Employee", event: "on_update", fields: ["employee_name", "company", "department", "designation", "status", "relieving_date"] },
  { id: "checkin", label: "Punch Recorded", doctype: "Employee Checkin", event: "after_insert", fields: ["employee", "employee_name", "time", "log_type"] },
  { id: "attendance", label: "Attendance Marked", doctype: "Attendance", event: "on_submit", fields: ["employee", "employee_name", "attendance_date", "status", "company"] },
  { id: "leave", label: "Leave Approved", doctype: "Leave Application", event: "on_submit", fields: ["employee", "employee_name", "leave_type", "from_date", "to_date", "total_leave_days", "status"] },
  { id: "expense", label: "Expense Claim Submitted", doctype: "Expense Claim", event: "on_submit", fields: ["employee", "employee_name", "total_claimed_amount", "total_sanctioned_amount", "approval_status"] },
  { id: "salary", label: "Salary Slip Submitted", doctype: "Salary Slip", event: "on_submit", fields: ["employee", "employee_name", "start_date", "end_date", "gross_pay", "net_pay"] },
  { id: "candidate", label: "Candidate Added", doctype: "Job Applicant", event: "after_insert", fields: ["applicant_name", "email_id", "job_title", "status"] },
];
const eventOf = (w) => EVENTS.find((e) => e.doctype === w.webhook_doctype && e.event === w.webhook_docevent);
const template = (ev) => `{\n  "event": "${ev.id}",\n  "doctype": "{{ doc.doctype }}",\n  "name": "{{ doc.name }}",\n${ev.fields.map((f) => `  "${f}": "{{ doc.${f} or '' }}"`).join(",\n")},\n  "modified": "{{ doc.modified }}"\n}`;

function Webhooks() {
  const hooks = useAsync(() => frappe.getList("Webhook", { fields: ["name", "webhook_doctype", "webhook_docevent", "request_url", "enabled", "enable_security"], orderBy: "creation desc", limit: 0 }), []);
  const logs = useAsync(() => frappe.getList("Webhook Request Log", { fields: ["name", "webhook", "url", "error", "creation"], orderBy: "creation desc", limit: 15 }).catch(() => null), []);
  const [adding, setAdding] = useState(false);

  async function toggle(w) {
    try { await frappe.updateDoc("Webhook", w.name, { enabled: Number(w.enabled) ? 0 : 1 }); hooks.reload(); } catch (e) { alertDialog({ tone: "error", message: errMsg(e, "Couldn't change the webhook.") }); }
  }
  async function remove(w) {
    if (!(await confirmDialog({ title: "Delete Webhook", message: `Stop sending ${eventOf(w)?.label || w.webhook_doctype} events to ${w.request_url}?`, confirmLabel: "Delete" }))) return;
    try { await frappe.deleteDoc("Webhook", w.name); hooks.reload(); } catch (e) { alertDialog({ tone: "error", message: errMsg(e, "Couldn't delete the webhook.") }); }
  }

  return (
    <div className="space-y-5">
      <Panel title="Webhooks" hint="When something happens in HRMS 360, a JSON message is sent to the other system's URL."
        action={<Button onClick={() => setAdding(true)}><Plus size={14} /> Add Webhook</Button>}>
        <Async state={hooks}>
          {(rows) => rows.length === 0 ? <Empty icon={Webhook} text="No webhooks yet. Add one to tell a payroll, ERP or messaging system about new employees, leave, attendance and more." /> : <Grid rows={rows} columns={[
            { key: "event", label: "When", render: (w) => <span>{eventOf(w)?.label || `${w.webhook_doctype} · ${w.webhook_docevent}`}<span className="block text-[11px] text-[var(--color-text-faint)]">{w.webhook_doctype}</span></span> },
            { key: "request_url", label: "Sends To", render: (w) => <code className="break-all text-[12px]">{w.request_url}</code> },
            { key: "enable_security", label: "Signed", render: (w) => (Number(w.enable_security) ? "Yes" : "No") },
            { key: "enabled", label: "Status", render: (w) => <button type="button" onClick={() => toggle(w)} title="Click to switch on or off"><StatusPill status={Number(w.enabled) ? "Active" : "Disabled"} /></button> },
            { key: "_a", label: "", render: (w) => <div className="flex justify-end"><button type="button" onClick={() => remove(w)} title="Delete" className="rounded p-1 text-[var(--color-text-muted)] hover:text-[var(--color-red-hover)]"><Trash2 size={13} /></button></div> },
          ]} />}
        </Async>
      </Panel>
      <Panel title="Recent Deliveries" hint="The last messages sent, and any errors from the receiving system">
        {logs.data === null ? <p className="text-[12.5px] text-[var(--color-text-muted)]">Delivery logs aren't readable on this site.</p> : (
          <Async state={logs}>
            {(rows) => rows.length === 0 ? <Empty text="Nothing sent yet." /> : <Grid rows={rows} columns={[
              { key: "creation", label: "When", render: (r) => dmyHm(r.creation) },
              { key: "url", label: "To", render: (r) => <code className="break-all text-[12px]">{r.url}</code> },
              { key: "error", label: "Result", render: (r) => (r.error ? <span className="text-[12px] text-[var(--color-red-hover)]">{String(r.error).slice(0, 140)}</span> : <StatusPill status="Done" />) },
            ]} />}
          </Async>
        )}
      </Panel>
      {adding && <AddWebhook onClose={() => setAdding(false)} onDone={() => { setAdding(false); hooks.reload(); }} />}
    </div>
  );
}

function AddWebhook({ onClose, onDone }) {
  const [f, setF] = useState({ event: EVENTS[0].id, url: "", secret: "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const ev = EVENTS.find((e) => e.id === f.event);
  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setErr("");
    try {
      await frappe.createDoc("Webhook", {
        webhook_doctype: ev.doctype, webhook_docevent: ev.event, request_url: f.url.trim(), request_method: "POST", request_structure: "JSON",
        webhook_json: template(ev), enabled: 1, ...(f.secret.trim() ? { enable_security: 1, webhook_secret: f.secret.trim() } : {}),
      });
      onDone();
    } catch (x) {
      setErr(errMsg(x, "Couldn't add the webhook."));
      setBusy(false);
    }
  }
  return (
    <Modal title="Add Webhook" onClose={onClose} wide>
      <form onSubmit={submit} className="space-y-3">
        <Field label="When"><select value={f.event} onChange={(e) => setF({ ...f, event: e.target.value })} className={inputCls}>{EVENTS.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}</select></Field>
        <Field label="Send To (URL)"><input required type="url" value={f.url} onChange={(e) => setF({ ...f, url: e.target.value })} className={inputCls} placeholder="https://other-system.example.com/hooks/hrms" /></Field>
        <Field label="Signing Secret (Optional)" hint="If set, each message carries an X-Frappe-Webhook-Signature header the other system can check"><input value={f.secret} onChange={(e) => setF({ ...f, secret: e.target.value })} className={inputCls} autoComplete="off" /></Field>
        <CopyBox label="Message sent" value={template(ev)} />
        {err && <Notice>{err}</Notice>}
        <div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit" disabled={busy}>{busy ? "Adding…" : "Add Webhook"}</Button></div>
      </form>
    </Modal>
  );
}

/* ---------------------------- biometric attendance ---------------------------- */

const SAMPLE = `{
  "punches": [
    { "device_id": "1024", "timestamp": "2026-11-23 09:02:11", "log_type": "IN", "device": "Head Office Gate" },
    { "device_id": "1024", "timestamp": "2026-11-23 18:15:40", "log_type": "OUT", "device": "Head Office Gate" }
  ]
}`;

function Biometric() {
  const emps = useAsync(() => listTry("Employee", { filters: [["status", "=", "Active"]], fields: ["name", "employee_name", "department", "attendance_device_id"], orderBy: "employee_name asc" }), []);
  const recent = useAsync(() => frappe.getList("Employee Checkin", { filters: [["device_id", "is", "set"]], fields: ["name", "employee_name", "time", "log_type", "device_id"], orderBy: "time desc", limit: 15 }).catch(() => []), []);
  const [q, setQ] = useState("");
  const [show, setShow] = useState("all");
  const [edits, setEdits] = useState({});
  const [saving, setSaving] = useState(null);
  const rows = useMemo(() => (emps.data || []).filter((e) => (show === "all" || (show === "missing" ? !e.attendance_device_id : e.attendance_device_id)) && (!q.trim() || `${e.employee_name} ${e.name} ${e.attendance_device_id || ""}`.toLowerCase().includes(q.trim().toLowerCase()))), [emps.data, q, show]);
  const mapped = (emps.data || []).filter((e) => e.attendance_device_id).length;

  async function saveId(e) {
    const value = (edits[e.name] ?? "").trim();
    if (value === (e.attendance_device_id || "")) return;
    const clash = value && (emps.data || []).find((x) => x.name !== e.name && x.attendance_device_id === value);
    if (clash) { alertDialog({ tone: "error", message: `Device ID ${value} already belongs to ${clash.employee_name}.` }); return; }
    setSaving(e.name);
    try { await frappe.updateDoc("Employee", e.name, { attendance_device_id: value }); setEdits((x) => { const n = { ...x }; delete n[e.name]; return n; }); emps.reload(); } catch (x) { alertDialog({ tone: "error", message: errMsg(x, "Couldn't save the device ID.") }); }
    setSaving(null);
  }

  return (
    <div className="space-y-5">
      <Panel title="How Devices Connect" hint="Point the biometric software (or the device's push/cloud setting) at this address, signed in with an API user's key.">
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          <div className="space-y-3">
            <CopyBox label="Endpoint (POST)" value={`${origin()}/api/method/ethx_biometric_punch`} />
            <CopyBox label="Header" value={"Authorization: token <api_key>:<api_secret>"} />
            <ul className="list-disc space-y-1 pl-5 text-[12px] text-[var(--color-text-muted)]">
              <li><b>device_id</b> is the person's ID on the device - set it below. The employee ID also works.</li>
              <li><b>log_type</b> is IN or OUT (0 / 1 accepted). Without it the punch is still recorded.</li>
              <li>Resending the same punch is safe - repeats are ignored. The reply lists unknown device IDs.</li>
              <li>Punches feed the attendance rules: 8 hours or more is marked Present automatically.</li>
            </ul>
          </div>
          <CopyBox label="Request body (JSON)" value={SAMPLE} />
        </div>
      </Panel>

      <Panel title={`Device IDs (${mapped} of ${(emps.data || []).length} set)`} hint="Each employee's ID on the attendance device. Type it and press Enter or click away to save.">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <label className="relative"><Search size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--color-text-faint)]" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search employees" className={`${inputCls} !w-56 pl-8`} /></label>
          {[["all", "All"], ["missing", "No Device ID"], ["set", "Has Device ID"]].map(([id, l]) => <button key={id} type="button" onClick={() => setShow(id)} className={chipCls(show === id)}>{l}</button>)}
        </div>
        <Async state={emps}>
          {() => <Grid rows={rows.slice(0, 200)} empty="No employees match." columns={[
            { key: "employee_name", label: "Employee", render: (e) => <span>{e.employee_name}<span className="block text-[11px] text-[var(--color-text-faint)]">{e.name}{e.department ? ` · ${e.department}` : ""}</span></span> },
            { key: "attendance_device_id", label: "Device ID", render: (e) => (
              <input value={edits[e.name] ?? e.attendance_device_id ?? ""} disabled={saving === e.name} onChange={(x) => setEdits({ ...edits, [e.name]: x.target.value })}
                onBlur={() => edits[e.name] !== undefined && saveId(e)} onKeyDown={(x) => x.key === "Enter" && x.currentTarget.blur()} placeholder="Not set" className={`${inputCls} !w-36 !py-1`} />
            ) },
          ]} />}
        </Async>
        {rows.length > 200 && <p className="mt-2 text-[11.5px] text-[var(--color-text-muted)]">Showing the first 200 - search to find others.</p>}
      </Panel>

      <Panel title="Recent Device Punches">
        <Async state={recent}>
          {(r) => r.length === 0 ? <Empty icon={Fingerprint} text="No punches from devices yet." /> : <Grid rows={r} columns={[
            { key: "employee_name", label: "Employee" },
            { key: "time", label: "Time", render: (x) => dmyHm(x.time) },
            { key: "log_type", label: "Type", render: (x) => x.log_type || "—" },
            { key: "device_id", label: "Device" },
          ]} />}
        </Async>
      </Panel>
    </div>
  );
}

/* ------------------------------ bank salary file ------------------------------ */

async function loadSlips(ym) {
  const [y, m] = ym.split("-").map(Number);
  const from = `${ym}-01`;
  const to = `${ym}-${String(new Date(y, m, 0).getDate()).padStart(2, "0")}`;
  const slips = await listTry("Salary Slip", { filters: [["docstatus", "=", 1], ["start_date", "between", [from, to]]], fields: ["name", "employee", "employee_name", "net_pay", "rounded_total", "bank_name", "bank_account_no", "company"], orderBy: "employee_name asc" }, ["name", "employee", "employee_name", "net_pay", "company"]);
  const ids = [...new Set(slips.map((s) => s.employee))];
  const emps = ids.length ? await listTry("Employee", { filters: [["name", "in", ids]], fields: ["name", "bank_name", "bank_ac_no", "ifsc_code"] }, ["name", "bank_name", "bank_ac_no"]).catch(() => []) : [];
  const byId = Object.fromEntries(emps.map((e) => [e.name, e]));
  return slips.map((s) => {
    const e = byId[s.employee] || {};
    const account = s.bank_account_no || e.bank_ac_no || "";
    const amount = Number(s.rounded_total) || Number(s.net_pay) || 0;
    return { ...s, bank: s.bank_name || e.bank_name || "", account, ifsc: e.ifsc_code || "", amount, ready: Boolean(account && amount > 0) };
  });
}

function BankFile() {
  const [month, setMonth] = useState(thisMonth());
  const q = useAsync(() => loadSlips(month), [month]);
  const rows = q.data || [];
  const ready = rows.filter((r) => r.ready);
  const totalAmt = ready.reduce((n, r) => n + r.amount, 0);
  const narration = `Salary ${monthLabel(month)}`;

  function download() {
    downloadCsv(`salary-transfer-${month}.csv`, ["Employee ID", "Beneficiary Name", "Bank", "Account Number", "IFSC", "Amount", "Narration"],
      ready.map((r) => [r.employee, r.employee_name, r.bank, r.account, r.ifsc, r.amount.toFixed(2), narration]));
  }

  return (
    <div className="space-y-5">
      <Panel title="Salary Transfer File" hint="Submitted salary slips for the month as a bank upload file. Columns: employee, beneficiary, bank, account, IFSC, amount and narration."
        action={<div className="flex flex-wrap items-center gap-2">
          <input type="month" value={month} max={thisMonth()} onChange={(e) => e.target.value && setMonth(e.target.value)} className={`${inputCls} !w-40`} />
          <Button disabled={!ready.length} onClick={download}><Download size={14} /> Download ({ready.length})</Button>
        </div>}>
        <Async state={q}>
          {() => rows.length === 0 ? <Empty icon={Landmark} text={`No submitted salary slips for ${monthLabel(month)}.`} /> : (
            <>
              <div className="mb-3 flex flex-wrap gap-2 text-[12px]">
                <span className="rounded border border-[var(--color-border)] px-2 py-0.5 text-[var(--color-text)]">{ready.length} ready · {money(totalAmt)}</span>
                {rows.length > ready.length && <span className="rounded border border-[color-mix(in_srgb,var(--color-amber)_50%,transparent)] px-2 py-0.5 text-[var(--color-amber)]">{rows.length - ready.length} missing bank details - left out of the file</span>}
              </div>
              <Grid rows={rows} columns={[
                { key: "employee_name", label: "Employee", render: (r) => <span>{r.employee_name}<span className="block text-[11px] text-[var(--color-text-faint)]">{r.employee}</span></span> },
                { key: "bank", label: "Bank", render: (r) => r.bank || "—" },
                { key: "account", label: "Account", render: (r) => r.account || <span className="text-[var(--color-amber)]">Missing</span> },
                { key: "ifsc", label: "IFSC", render: (r) => r.ifsc || "—" },
                { key: "amount", label: "Net Pay", render: (r) => money(r.amount) },
              ]} />
            </>
          )}
        </Async>
        <p className="mt-3 text-[11.5px] text-[var(--color-text-faint)]">Bank details come from the salary slip, or else the employee record (Bank Name, Bank A/C No and IFSC). Most banks' bulk-upload templates take these columns; reorder them in a spreadsheet if your bank needs a different layout.</p>
      </Panel>
    </div>
  );
}
