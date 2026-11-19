// Company communication: the two mail accounts (internal mail through Outlook / Microsoft 365, candidate mail through
// Gmail), announcements emailed to employees, automatic birthday and event emails with editable templates, and
// AI-written job descriptions (Claude). Settings live in one record, "ETHX Communication Settings", created by
// System Setup; the server rules below are installed with it (siteSetup.js, module "comms").
import { frappe } from "./api/frappeClient";

export const SETTINGS = "ETHX Communication Settings";
export const INTERNAL_ACCOUNT = "ETHX Internal Mail";
export const CANDIDATE_ACCOUNT = "ETHX Candidate Mail";
export const AI_MODELS = [
  { id: "claude-opus-5-5", label: "Claude Opus 5.5 (best writing)" },
  { id: "claude-sonnet-5-5", label: "Claude Sonnet 5.5 (faster, cheaper)" },
  { id: "claude-haiku-5-5", label: "Claude Haiku 5.5 (fastest, cheapest)" },
];

export const DEFAULT_BIRTHDAY_SUBJECT = "Happy Birthday, {first_name}! 🎂";
export const DEFAULT_BIRTHDAY_TEMPLATE = `Dear {employee_name},

Wishing you a very Happy Birthday! 🎂

May your day be filled with happiness, positivity, and wonderful moments.

Wishing you continued success, good health, and many more achievements in the year ahead. Have a fantastic celebration! 🎉`;
export const DEFAULT_EVENT_SUBJECT = "Reminder: {event} on {date}";
export const DEFAULT_EVENT_TEMPLATE = `Dear {employee_name},

This is a reminder about {event} on {date}{time}.

{details}

See you there!`;
export const PLACEHOLDERS = {
  birthday: ["{employee_name}", "{first_name}", "{company}"],
  event: ["{employee_name}", "{first_name}", "{company}", "{event}", "{date}", "{time}", "{details}"],
};

/* --------------------------------- setup --------------------------------- */

const perm = (role, write) => ({ role, read: 1, ...(write ? { write: 1, create: 1 } : {}) });

export const COMMS_DOCTYPES = [{
  name: SETTINGS,
  what: "Communication settings (mail accounts, birthday / event templates, AI)",
  onlyIfMissing: true,
  doc: {
    name: SETTINGS, module: "Custom", custom: 1, issingle: 1, track_changes: 1,
    // HR reads the template and sender settings; only the Administrator changes them. The API key is a Password
    // field, which ERPNext never sends to the browser.
    permissions: [perm("System Manager", true), perm("HR Manager"), perm("HR User")],
    fields: [
      { fieldname: "mail_section", label: "Mail Accounts", fieldtype: "Section Break" },
      { fieldname: "internal_email_account", label: "Internal Mail Account (Outlook)", fieldtype: "Link", options: "Email Account" },
      { fieldname: "internal_sender", label: "Internal Sender Address", fieldtype: "Data", read_only: 1 },
      { fieldname: "candidate_email_account", label: "Candidate Mail Account (Gmail)", fieldtype: "Link", options: "Email Account" },
      { fieldname: "candidate_sender", label: "Candidate Sender Address", fieldtype: "Data", read_only: 1 },
      { fieldname: "birthday_section", label: "Birthday Emails", fieldtype: "Section Break" },
      { fieldname: "birthday_emails", label: "Send Birthday Emails", fieldtype: "Check", default: "1" },
      { fieldname: "birthday_subject", label: "Birthday Subject", fieldtype: "Data" },
      { fieldname: "birthday_template", label: "Birthday Message", fieldtype: "Text" },
      { fieldname: "event_section", label: "Event Reminders", fieldtype: "Section Break" },
      { fieldname: "event_emails", label: "Send Event Reminder Emails", fieldtype: "Check", default: "1" },
      { fieldname: "event_days_before", label: "Days Before the Event", fieldtype: "Int", default: "1" },
      { fieldname: "event_subject", label: "Event Subject", fieldtype: "Data" },
      { fieldname: "event_template", label: "Event Message", fieldtype: "Text" },
      { fieldname: "ai_section", label: "AI Job Descriptions", fieldtype: "Section Break" },
      { fieldname: "ai_enabled", label: "Use AI for Job Descriptions", fieldtype: "Check" },
      { fieldname: "ai_model", label: "Claude Model", fieldtype: "Data", default: "claude-opus-5-5" },
      { fieldname: "ai_api_key", label: "Anthropic API Key", fieldtype: "Password" },
    ],
  },
}];

// Announcements keep their audience and how many people were emailed on the Note that shows them in the portal.
export const COMMS_FIELDS = [
  { dt: "Note", fieldname: "custom_audience", label: "Audience", fieldtype: "Data", read_only: 1, insert_after: "public" },
  { dt: "Note", fieldname: "custom_emailed", label: "Emailed To", fieldtype: "Int", read_only: 1, insert_after: "custom_audience" },
];

// Shared by the rules below (restricted sandbox: no imports, no str.format, no frappe.get_roles).
const HR_CHECK = `
user = frappe.session.user
roles = frappe.get_all("Has Role", filters={"parent": user, "parenttype": "User"}, pluck="role")
if not (user == "Administrator" or "HR Manager" in roles or "HR User" in roles or "System Manager" in roles):
    frappe.throw("Only HR or the Administrator can do this.")
`;
const SETTINGS_EXIST = `has_settings = frappe.db.exists("DocType", "${SETTINGS}")`;

// Everyone active (not contractors), with the address mail should go to: company email, else login, else personal.
const PEOPLE = `
def mail_of(e):
    for a in [e.company_email, e.user_id, e.personal_email]:
        if a and "@" in a:
            return a
    return None
filters = {"status": "Active"}
if frappe.get_meta("Employee").has_field("custom_is_contractor"):
    filters["custom_is_contractor"] = 0
`;

const ANNOUNCE_API = `${HR_CHECK}
${SETTINGS_EXIST}
${PEOPLE}
args = frappe.form_dict
subject = (args.get("subject") or "").strip()
message = (args.get("message") or "").strip()
audience = args.get("audience") or "all"
value = args.get("value") or ""
if not subject or not message:
    frappe.throw("Give the announcement a subject and a message.")
if audience in ("company", "department", "branch"):
    if not value:
        frappe.throw("Choose which " + audience + " to send to.")
    filters[audience] = value
people = frappe.get_all("Employee", filters=filters, fields=["name", "employee_name", "first_name", "company", "company_email", "user_id", "personal_email"])
sender = frappe.db.get_single_value("${SETTINGS}", "internal_sender") if has_settings else None
sent = 0
if frappe.utils.cint(args.get("send_email")):
    for e in people:
        to = mail_of(e)
        if not to:
            continue
        first = e.first_name or (e.employee_name or "").split(" ")[0]
        body = message.replace("{employee_name}", e.employee_name or "").replace("{first_name}", first or "").replace("{company}", e.company or "")
        if sender:
            frappe.sendmail(recipients=[to], sender=sender, subject=subject, message=body, reference_doctype="Employee", reference_name=e.name)
        else:
            frappe.sendmail(recipients=[to], subject=subject, message=body, reference_doctype="Employee", reference_name=e.name)
        sent = sent + 1
label = "All employees" if audience == "all" else (audience.capitalize() + ": " + value)
note = frappe.get_doc({"doctype": "Note", "title": subject[:140], "content": message, "public": 1 if frappe.utils.cint(args.get("post_to_portal")) else 0})
if frappe.get_meta("Note").has_field("custom_audience"):
    note.custom_audience = label
    note.custom_emailed = sent
note.insert(ignore_permissions=True)
frappe.response["message"] = {"emailed": sent, "people": len(people), "note": note.name}
`;

// Every morning: public events coming up in N days (and today) are emailed to everyone, once per event and day.
const EVENT_REMINDERS = `
${SETTINGS_EXIST}
${PEOPLE}
enabled = frappe.db.get_single_value("${SETTINGS}", "event_emails") if has_settings else 1
if enabled:
    days = frappe.utils.cint(frappe.db.get_single_value("${SETTINGS}", "event_days_before")) if has_settings else 1
    subject_t = (frappe.db.get_single_value("${SETTINGS}", "event_subject") if has_settings else None) or "${DEFAULT_EVENT_SUBJECT}"
    body_t = (frappe.db.get_single_value("${SETTINGS}", "event_template") if has_settings else None) or ${JSON.stringify(DEFAULT_EVENT_TEMPLATE)}
    sender = frappe.db.get_single_value("${SETTINGS}", "internal_sender") if has_settings else None
    today = frappe.utils.getdate(frappe.utils.nowdate())
    targets = [str(today)]
    if days > 0:
        targets.append(str(frappe.utils.add_days(today, days)))
    people = frappe.get_all("Employee", filters=filters, fields=["name", "employee_name", "first_name", "company", "company_email", "user_id", "personal_email"])
    for day in targets:
        events = frappe.get_all("Event", filters={"event_type": "Public", "starts_on": ["between", [day + " 00:00:00", day + " 23:59:59"]]}, fields=["name", "subject", "starts_on", "all_day", "description"])
        for ev in events:
            marker = "Reminder emailed for " + day
            if frappe.db.exists("Comment", {"reference_doctype": "Event", "reference_name": ev.name, "content": marker}):
                continue
            when = frappe.utils.formatdate(ev.starts_on, "dd MMM yyyy")
            at = "" if ev.all_day else (" at " + str(ev.starts_on)[11:16])
            details = frappe.utils.strip_html(ev.description or "")
            for e in people:
                to = mail_of(e)
                if not to:
                    continue
                first = e.first_name or (e.employee_name or "").split(" ")[0]
                def fill(t):
                    return t.replace("{employee_name}", e.employee_name or "").replace("{first_name}", first or "").replace("{company}", e.company or "").replace("{event}", ev.subject or "").replace("{date}", when).replace("{time}", at).replace("{details}", details)
                body = fill(body_t).replace("\\n", "<br>")
                if sender:
                    frappe.sendmail(recipients=[to], sender=sender, subject=fill(subject_t), message=body)
                else:
                    frappe.sendmail(recipients=[to], subject=fill(subject_t), message=body)
            frappe.get_doc({"doctype": "Comment", "comment_type": "Info", "reference_doctype": "Event", "reference_name": ev.name, "content": marker}).insert(ignore_permissions=True)
`;

const TEST_EMAIL_API = `
user = frappe.session.user
roles = frappe.get_all("Has Role", filters={"parent": user, "parenttype": "User"}, pluck="role")
if not (user == "Administrator" or "System Manager" in roles):
    frappe.throw("Only the Administrator can test mail accounts.")
account = frappe.form_dict.get("account")
to = frappe.form_dict.get("to")
sender = frappe.db.get_value("Email Account", account, "email_id")
if not sender:
    frappe.throw("That mail account isn't set up yet.")
if not to or "@" not in to:
    frappe.throw("Enter the address to send the test to.")
frappe.sendmail(recipients=[to], sender=sender, subject="Test email from ETHX HRMS", message="<p>This is a test email sent through the <b>" + account + "</b> account (" + sender + ").</p><p>If you received it, the account is working.</p>", now=True)
frappe.response["message"] = {"sent": to, "from": sender}
`;

// Claude writes the JD (raw HTTPS: the server-script sandbox can't load the Anthropic SDK). The key never leaves the
// server. Effort "low": a JD is short, routine writing, and the HR user is waiting on the page.
const GENERATE_JD_API = `${HR_CHECK}
${SETTINGS_EXIST}
if not has_settings or not frappe.db.get_single_value("${SETTINGS}", "ai_enabled"):
    frappe.throw("AI job descriptions aren't switched on. The Administrator can turn them on in Admin > Communication.")
settings = frappe.get_doc("${SETTINGS}")
key = settings.get_password("ai_api_key", raise_exception=False)
if not key:
    frappe.throw("No Anthropic API key is saved. Add it in Admin > Communication.")
model = settings.ai_model or "claude-opus-5-5"
a = frappe.form_dict
lines = []
for label, field in [["Job title", "title"], ["Designation", "designation"], ["Company", "company"], ["Department", "department"], ["Location", "location"], ["Work mode", "work_mode"], ["Employment type", "employment_type"], ["Experience", "experience"], ["Key skills and keywords", "keywords"], ["Salary", "salary"], ["Notes from HR", "notes"]]:
    v = (a.get(field) or "").strip()
    if v:
        lines.append(label + ": " + v)
if not lines:
    frappe.throw("Give at least a job title or a few keywords.")
system = "You write job descriptions for an HR team in India. Write in plain text only: no markdown, no asterisks, no '#'. Use these section headings, each on its own line ending with a colon: About the Role, Key Responsibilities, Mandatory Skills, Good to Have, Experience & Qualifications, Location & Work Mode, What We Offer. Put list items on their own lines starting with '- '. Use only the facts given; where something isn't given (salary, benefits), write it generally without inventing numbers. Keep it under 450 words. Use inclusive language and don't mention age, gender, religion, marital status or other attributes unrelated to the job."
user_text = "Write the job description from these details:\\n" + "\\n".join(lines)
body = {"model": model, "max_tokens": 8000, "output_config": {"effort": "low"}, "system": system, "messages": [{"role": "user", "content": user_text}]}
headers = {"x-api-key": key, "anthropic-version": "2026-10-21", "content-type": "application/json"}
if model in ("claude-opus-5-5", "claude-sonnet-5-5"):
    headers["anthropic-beta"] = "server-side-fallback-2026-07-01"
    body["fallbacks"] = "default"
# ERPNext raises on an HTTP error (wrong key, unknown model, rate limit) and logs the details in its Error Log.
res = None
try:
    res = frappe.make_post_request("https://api.anthropic.com/v1/messages", headers=headers, json=body)
except:
    frappe.throw("Couldn't get a description from the AI service. Check the API key and model in Admin > Communication (details are in ERPNext's Error Log), or try again in a minute.")
if res.get("type") == "error":
    frappe.throw("The AI service refused the request: " + str((res.get("error") or {}).get("message") or "unknown error"))
if res.get("stop_reason") == "refusal":
    frappe.throw("The AI declined to write this description. Try different wording, or write it by hand.")
text = ""
for block in res.get("content") or []:
    if block.get("type") == "text":
        text = text + block.get("text")
if not text.strip():
    frappe.throw("The AI returned an empty description - try again.")
frappe.response["message"] = {"text": text.strip(), "model": res.get("model") or model}
`;

// A new leave request emails its approver (and shows in their notifications). Skipped when HRMS's own leave
// notification is switched on in HR Settings with a template, so nobody gets two emails.
const LEAVE_APPROVER_MAIL = `
${SETTINGS_EXIST}
approver = doc.get("leave_approver")
hrms_sends = frappe.db.get_single_value("HR Settings", "send_leave_notification") and frappe.db.get_single_value("HR Settings", "leave_approval_notification_template")
if approver and approver != doc.owner and not hrms_sends:
    who = doc.employee_name or doc.employee
    when = frappe.utils.formatdate(doc.from_date, "dd MMM yyyy")
    if str(doc.to_date) != str(doc.from_date):
        when = when + " to " + frappe.utils.formatdate(doc.to_date, "dd MMM yyyy")
    days = doc.get("total_leave_days")
    half = " (half day)" if doc.get("half_day") else ""
    reason = frappe.utils.strip_html(doc.get("description") or "")
    subject = "Leave request: " + who + ", " + (doc.leave_type or "Leave") + ", " + when
    message = "<p>" + who + " has applied for <b>" + (doc.leave_type or "leave") + "</b>" + half + " on <b>" + when + "</b>" + ((" (" + str(days) + " day(s))") if days else "") + ".</p>"
    if reason:
        message = message + "<p>Reason: " + reason + "</p>"
    message = message + "<p>Please approve or reject it from <b>My Approvals</b> in the HRMS portal.</p>"
    sender = frappe.db.get_single_value("${SETTINGS}", "internal_sender") if has_settings else None
    if sender:
        frappe.sendmail(recipients=[approver], sender=sender, subject=subject, message=message, reference_doctype="Leave Application", reference_name=doc.name)
    else:
        frappe.sendmail(recipients=[approver], subject=subject, message=message, reference_doctype="Leave Application", reference_name=doc.name)
    frappe.get_doc({"doctype": "Notification Log", "for_user": approver, "type": "Alert", "subject": subject, "document_type": "Leave Application", "document_name": doc.name}).insert(ignore_permissions=True)
`;

export const COMMS_SCRIPTS = [
  { name: "ETHX - Leave request email", script_type: "DocType Event", reference_doctype: "Leave Application", doctype_event: "After Insert", script: LEAVE_APPROVER_MAIL, what: "A new leave request emails the leave approver and appears in their notifications" },
  { name: "ETHX - Announce", script_type: "API", api_method: "ethx_announce", script: ANNOUNCE_API, what: "HR and the Administrator email announcements to all employees (or one company, department or office) and post them on the portal" },
  { name: "ETHX - Event reminders", script_type: "Scheduler Event", event_frequency: "Daily", script: EVENT_REMINDERS, what: "Every morning, upcoming public events are emailed to employees using the event template" },
  { name: "ETHX - Test mail account", script_type: "API", api_method: "ethx_test_email", script: TEST_EMAIL_API, what: "The Administrator sends a test email through a mail account" },
  { name: "ETHX - Generate JD", script_type: "API", api_method: "ethx_generate_jd", script: GENERATE_JD_API, what: "HR generates a job description from keywords with Claude (key kept on the server)" },
];

/* ------------------------------- in the app ------------------------------- */

const methodMissing = (e) => e?.response?.status === 404 || /not found|not whitelisted|Failed to get method|No module named/i.test(String(e?.response?.data?.exception || ""));
export const notSetUpMessage = "This isn't set up on the server yet. It's installed automatically the next time the Administrator signs in.";
export const commsError = (e, errMsg, fallback) => (methodMissing(e) ? notSetUpMessage : errMsg(e, fallback));

/** The settings record, or null when setup hasn't created it yet. */
export async function getCommsSettings() {
  try {
    return await frappe.getDoc(SETTINGS, SETTINGS);
  } catch (e) {
    if (e?.response?.status === 404 || /DoesNotExist|not found/i.test(String(e?.response?.data?.exc_type || e?.response?.data?.exception || ""))) return null;
    throw e;
  }
}

// Preset SMTP settings for the two services (Microsoft 365 / Outlook.com and Gmail both use STARTTLS on 587).
export const MAIL_PRESETS = {
  internal: { account: INTERNAL_ACCOUNT, title: "Internal Mail (Outlook / Microsoft 365)", hint: "Announcements, birthday wishes, event reminders and other emails to employees", smtp_server: "smtp.office365.com", smtp_port: 587, settingsField: "internal_email_account", senderField: "internal_sender", defaultOutgoing: true },
  candidate: { account: CANDIDATE_ACCOUNT, title: "Candidate Mail (Gmail)", hint: "Offer letters, interview and regret emails to external candidates", smtp_server: "smtp.gmail.com", smtp_port: 587, settingsField: "candidate_email_account", senderField: "candidate_sender", defaultOutgoing: false },
};

/** Create or update one of the two mail accounts and point the settings at it. ERPNext signs in to SMTP on save. */
export async function saveMailAccount(kind, { email, senderName, password, smtpServer, smtpPort }) {
  const p = MAIL_PRESETS[kind];
  const exists = (await frappe.getList("Email Account", { filters: [["name", "=", p.account]], fields: ["name"], limit: 1 })).length > 0;
  const doc = {
    email_account_name: p.account, email_id: email.trim(), service: "", auth_method: "Basic",
    smtp_server: smtpServer || p.smtp_server, smtp_port: Number(smtpPort) || p.smtp_port, use_tls: 1, use_ssl_for_outgoing: 0,
    enable_outgoing: 1, enable_incoming: 0, default_outgoing: p.defaultOutgoing ? 1 : 0, awaiting_password: 0,
    always_use_account_email_id_as_sender: 1, always_use_account_name_as_sender_name: 0,
    ...(senderName ? { sender_name: senderName.trim() } : {}),
    ...(password ? { password } : {}),
  };
  if (exists) await frappe.updateDoc("Email Account", p.account, doc);
  else await frappe.createDoc("Email Account", doc);
  await frappe.updateDoc(SETTINGS, SETTINGS, { [p.settingsField]: p.account, [p.senderField]: email.trim() });
}

export const sendTestEmail = (account, to) => frappe.callMethod("ethx_test_email", { account, to });
export const announce = (payload) => frappe.callMethod("ethx_announce", payload);
export const generateJdWithAi = (details) => frappe.callMethod("ethx_generate_jd", details);

/** Candidate emails go out from the Gmail account when it's set up (HR can read the settings, not the password). */
export async function candidateSender() {
  try {
    const s = await getCommsSettings();
    return s?.candidate_sender || undefined;
  } catch {
    return undefined;
  }
}

/** Template text -> email HTML, with placeholders filled. */
export function fillTemplate(template, values) {
  let t = String(template || "");
  for (const [k, v] of Object.entries(values)) t = t.split(`{${k}}`).join(v ?? "");
  return t;
}
export const toHtml = (text) => String(text || "").split(/\n{2,}/).map((p) => `<p>${p.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/\n/g, "<br>")}</p>`).join("");

/**
 * A JD from keywords without AI: a structured draft in the same sections the AI uses (and the JD matcher reads),
 * for HR to edit. Used when AI isn't switched on.
 */
export function templateJd({ title, company, location, work_mode, employment_type, experience, keywords, notes }) {
  const skills = String(keywords || "").split(/[,;\n]/).map((s) => s.trim()).filter(Boolean);
  const must = skills.slice(0, Math.max(3, Math.ceil(skills.length * 0.6)));
  const nice = skills.slice(must.length);
  const role = title || "this role";
  return [
    "About the Role:",
    `${company ? `${company} is` : "We are"} looking for a ${role}${experience ? ` with ${experience} of experience` : ""} to join our team${location ? ` in ${location}` : ""}.${notes ? ` ${notes}` : ""}`,
    "",
    "Key Responsibilities:",
    `- Deliver high-quality work as ${/^[aeiou]/i.test(role) ? "an" : "a"} ${role}${must[0] ? `, with a focus on ${must.slice(0, 2).join(" and ")}` : ""}`,
    "- Work closely with stakeholders to understand requirements and turn them into solutions",
    "- Take ownership of tasks from analysis through delivery and support",
    "- Document work and share knowledge with the team",
    "",
    "Mandatory Skills:",
    ...(must.length ? must.map((s) => `- ${s}`) : ["- (add the must-have skills)"]),
    ...(nice.length ? ["", "Good to Have:", ...nice.map((s) => `- ${s}`)] : []),
    "",
    "Experience & Qualifications:",
    `- ${experience || "Relevant"} experience in a similar role`,
    "- Bachelor's degree in a relevant field, or equivalent experience",
    "- Clear communication and a collaborative approach",
    "",
    "Location & Work Mode:",
    `- ${[location, work_mode, employment_type].filter(Boolean).join(" · ") || "To be confirmed"}`,
    "",
    "What We Offer:",
    "- Competitive compensation and benefits",
    "- Learning and growth opportunities",
    "- A supportive, inclusive team",
  ].join("\n");
}
