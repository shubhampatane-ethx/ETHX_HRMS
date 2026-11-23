// HR › Announcements: write once, email it to every employee (or one company, department or office) from the
// internal mail account, and show it on the employee portal. Sent through the ethx_announce server rule (lib/comms.js).
import { useMemo, useState } from "react";
import { Megaphone, Send } from "lucide-react";
import { frappe } from "../../lib/api/frappeClient";
import { Button } from "../../components/ui/primitives";
import { Async, Field, Grid, inputCls, Notice, PageHeader, Panel, StatusPill } from "../../components/employee/EmployeeShell";
import { confirmDialog } from "../../components/ui/dialogs";
import { dmyHm, errMsg, stripHtml, useAsync } from "../../lib/employeePortal";
import { announce, commsError, getCommsSettings, toHtml } from "../../lib/comms";

const AUDIENCES = [["all", "All Employees"], ["company", "One Company"], ["department", "One Department"], ["branch", "One Office"]];
const mailOf = (e) => [e.company_email, e.user_id, e.personal_email].find((a) => a && a.includes("@"));

async function loadPeople() {
  const opts = { filters: [["status", "=", "Active"]], fields: ["name", "employee_name", "company", "department", "branch", "company_email", "user_id", "personal_email", "custom_is_contractor"], limit: 0 };
  const rows = await frappe.getList("Employee", opts).catch(() => frappe.getList("Employee", { ...opts, fields: opts.fields.filter((f) => f !== "custom_is_contractor") }));
  return rows.filter((e) => !Number(e.custom_is_contractor));
}
const loadHistory = () => frappe.getList("Note", { fields: ["name", "title", "content", "public", "creation", "owner", "custom_audience", "custom_emailed"], orderBy: "creation desc", limit: 30 })
  .catch(() => frappe.getList("Note", { fields: ["name", "title", "content", "public", "creation", "owner"], orderBy: "creation desc", limit: 30 }));

export default function Announcements() {
  const people = useAsync(loadPeople, []);
  const history = useAsync(loadHistory, []);
  const settings = useAsync(() => getCommsSettings().catch(() => null), []);
  const [f, setF] = useState({ subject: "", message: "", audience: "all", value: "", email: true, portal: true });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value, ...(k === "audience" ? { value: "" } : {}) }));

  const choices = useMemo(() => (f.audience === "all" ? [] : [...new Set((people.data || []).map((e) => e[f.audience]).filter(Boolean))].sort()), [people.data, f.audience]);
  const reach = useMemo(() => (people.data || []).filter((e) => f.audience === "all" || e[f.audience] === f.value), [people.data, f.audience, f.value]);
  const reachable = reach.filter(mailOf).length;
  const sender = settings.data?.internal_sender;

  async function send(e) {
    e.preventDefault();
    setMsg(null);
    if (!f.email && !f.portal) return setMsg({ ok: false, text: "Choose email, the portal, or both." });
    if (f.audience !== "all" && !f.value) return setMsg({ ok: false, text: "Choose who to send it to." });
    const where = [f.email && `email ${reachable} employee(s)${sender ? ` from ${sender}` : ""}`, f.portal && "post it on the employee portal"].filter(Boolean).join(" and ");
    if (!(await confirmDialog({ title: "Send Announcement", message: `"${f.subject}" will ${where}. Emails can't be recalled once sent.`, confirmLabel: "Send Now" }))) return;
    setBusy(true);
    try {
      const r = await announce({ subject: f.subject.trim(), message: toHtml(f.message.trim()), audience: f.audience, value: f.value, send_email: f.email ? 1 : 0, post_to_portal: f.portal ? 1 : 0 });
      setMsg({ ok: true, text: `Sent. ${f.email ? `${r.emailed} email(s) queued - they go out within a few minutes.` : ""}${f.portal ? " It's on the employee portal now." : ""}` });
      setF((x) => ({ ...x, subject: "", message: "" }));
      history.reload();
    } catch (x) {
      setMsg({ ok: false, text: commsError(x, errMsg, "The announcement couldn't be sent.") });
    }
    setBusy(false);
  }

  return (
    <div className="space-y-5">
      <PageHeader icon={Megaphone} title="Announcements" subtitle="Email everyone at once and post it on the employee portal" />
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-5">
        <Panel title="New Announcement" className="xl:col-span-3">
          <form onSubmit={send} className="space-y-3 text-[13px]">
            <Field label="Subject"><input required maxLength={140} className={inputCls} value={f.subject} onChange={set("subject")} placeholder="e.g. Office closed on 25 December" /></Field>
            <Field label="Message" hint="Blank lines start a new paragraph. {first_name} and {employee_name} are replaced with each person's name.">
              <textarea required rows={9} className={inputCls} value={f.message} onChange={set("message")} placeholder={"Dear {first_name},\n\n…\n\nRegards,\nHR Team"} />
            </Field>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Send To"><select className={inputCls} value={f.audience} onChange={set("audience")}>{AUDIENCES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
              {f.audience !== "all" && <Field label={AUDIENCES.find(([v]) => v === f.audience)[1].replace("One ", "")}><select required className={inputCls} value={f.value} onChange={set("value")}><option value="">Select…</option>{choices.map((c) => <option key={c}>{c}</option>)}</select></Field>}
            </div>
            <div className="flex flex-wrap gap-4 text-[12px] text-[var(--color-text-muted)]">
              <label className="flex items-center gap-2"><input type="checkbox" checked={f.email} onChange={set("email")} /> Email each employee</label>
              <label className="flex items-center gap-2"><input type="checkbox" checked={f.portal} onChange={set("portal")} /> Show on the employee portal</label>
            </div>
            <p className="text-[12px] text-[var(--color-text-muted)]">
              {people.loading ? "Counting recipients…" : `${reach.length} employee(s) selected${f.email ? `, ${reachable} with an email address${reach.length - reachable ? ` (${reach.length - reachable} without one will only see it on the portal)` : ""}` : ""}.`}
              {f.email && (sender ? ` Sent from ${sender}.` : " No internal mail account is set up - emails go from ERPNext's default account.")}
            </p>
            {msg && <Notice tone={msg.ok ? "info" : "error"}>{msg.text}</Notice>}
            <div className="flex justify-end"><Button type="submit" disabled={busy || people.loading}><Send size={14} /> {busy ? "Sending…" : "Send Announcement"}</Button></div>
          </form>
        </Panel>
        <Panel title="Sent Announcements" className="xl:col-span-2">
          <Async state={history}>
            {(rows) => <Grid rows={rows} empty="Nothing sent yet." columns={[
              { key: "title", label: "Announcement", render: (n) => <span><b className="font-medium">{n.title}</b><span className="mt-0.5 block max-w-[20rem] truncate text-[11px] text-[var(--color-text-muted)]">{stripHtml(n.content || "")}</span></span> },
              { key: "creation", label: "Sent", render: (n) => <span className="whitespace-nowrap">{dmyHm(n.creation)}<span className="block text-[11px] text-[var(--color-text-faint)]">{n.custom_audience || ""}{n.custom_emailed ? ` · ${n.custom_emailed} emailed` : ""}</span></span> },
              { key: "public", label: "Portal", render: (n) => <StatusPill status={Number(n.public) ? "Published" : "Email only"} /> },
            ]} />}
          </Async>
        </Panel>
      </div>
    </div>
  );
}
