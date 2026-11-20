// Timesheet review: custom fields and server rules (installed from Admin › ERPNext Setup).
//
// Review state now lives in real fields instead of comments:
//   Timesheet.custom_review_status   Draft → Pending Review → Partly Approved → Approved → Finalized (locked)
//                                     or Returned (the cancelled sheet and its editable amended copy)
//   Timesheet Detail.custom_line_*    per-line status, so each project manager approves only their project's hours
//                                     (HR views and downloads timesheets; it doesn't approve them)
//   Project.custom_project_manager    who approves hours on that project (falls back to the project's creator)
// All review actions go through one server method (ethx_review_timesheet) that checks who may act on which lines,
// blocks self-review, requires a reason for HR overrides and returns, and refuses stale updates (version check).
const sel = (...o) => o.join("\n");

export const TIMESHEET_FIELDS = [
  { dt: "Timesheet", fieldname: "custom_review_section", label: "Review", fieldtype: "Section Break", insert_after: "time_logs" },
  { dt: "Timesheet", fieldname: "custom_review_status", label: "Review Status", fieldtype: "Select", options: sel("", "Draft", "Pending Review", "Partly Approved", "Approved", "Finalized", "Returned"), allow_on_submit: 1, read_only: 1, in_list_view: 1, in_standard_filter: 1, insert_after: "custom_review_section" },
  { dt: "Timesheet", fieldname: "custom_reviewed_by", label: "Last Reviewed By", fieldtype: "Link", options: "User", allow_on_submit: 1, read_only: 1, insert_after: "custom_review_status" },
  { dt: "Timesheet", fieldname: "custom_reviewed_on", label: "Last Reviewed On", fieldtype: "Datetime", allow_on_submit: 1, read_only: 1, insert_after: "custom_reviewed_by" },
  { dt: "Timesheet", fieldname: "custom_review_note", label: "Review Note", fieldtype: "Small Text", allow_on_submit: 1, read_only: 1, insert_after: "custom_reviewed_on" },
  { dt: "Timesheet", fieldname: "custom_review_version", label: "Review Version", fieldtype: "Int", allow_on_submit: 1, read_only: 1, hidden: 1, insert_after: "custom_review_note" },
  { dt: "Timesheet Detail", fieldname: "custom_line_status", label: "Line Status", fieldtype: "Select", options: sel("", "Pending", "Approved"), allow_on_submit: 1, read_only: 1, in_list_view: 1, insert_after: "description" },
  { dt: "Timesheet Detail", fieldname: "custom_line_approver", label: "Approved By", fieldtype: "Link", options: "User", allow_on_submit: 1, read_only: 1, insert_after: "custom_line_status" },
  { dt: "Timesheet Detail", fieldname: "custom_line_approved_on", label: "Approved On", fieldtype: "Datetime", allow_on_submit: 1, read_only: 1, insert_after: "custom_line_approver" },
  { dt: "Project", fieldname: "custom_project_manager", label: "Project Manager (approves timesheets)", fieldtype: "Link", options: "User", insert_after: "project_name" },
];

export const TIMESHEET_TRACK = ["Timesheet", "Project"];

// RestrictedPython: comprehensions can't see other local variables - plain loops only.
const ON_SUBMIT = `
doc.custom_review_status = "Pending Review"
doc.custom_reviewed_by = None
doc.custom_reviewed_on = None
doc.custom_review_version = frappe.utils.cint(doc.custom_review_version) + 1
for row in doc.time_logs:
    row.custom_line_status = "Pending"
    row.custom_line_approver = None
    row.custom_line_approved_on = None
`;

const ON_SAVE = `
if doc.docstatus == 0 and not doc.custom_review_status:
    doc.custom_review_status = "Draft"
`;

const BEFORE_CANCEL = `
st = doc.custom_review_status or ""
if st == "Finalized":
    frappe.throw("This timesheet is finalized and locked. Ask HR to reopen it if it really needs correcting.")
if st in ("Approved", "Partly Approved") and not doc.flags.get("ethx_review"):
    frappe.throw("Approved hours can only be sent back from HRMS 360 (Timesheets › Return), which records who did it and why.")
`;

const REVIEW_API = `
args = frappe.form_dict
name = args.get("timesheet")
action = args.get("action")
note = (args.get("note") or "").strip()
version = frappe.utils.cint(args.get("version"))
only = None
if args.get("projects"):
    only = json.loads(args.get("projects"))
user = frappe.session.user
roles = frappe.get_all("Has Role", filters={"parent": user, "parenttype": "User"}, pluck="role")
is_hr = user == "Administrator" or ("HR Manager" in roles) or ("HR User" in roles) or ("System Manager" in roles)

current = frappe.db.get_value("Timesheet", name, ["docstatus", "custom_review_version", "custom_review_status"], as_dict=True, for_update=True)
if not current:
    frappe.throw("Timesheet not found.")
if frappe.utils.cint(current.custom_review_version) != version:
    frappe.throw("Someone else has just reviewed this timesheet. Reload to see the latest state.")
doc = frappe.get_doc("Timesheet", name)
status = doc.custom_review_status or "Pending Review"
owner_user = None
if doc.employee:
    owner_user = frappe.db.get_value("Employee", doc.employee, "user_id")
if owner_user and owner_user == user and user != "Administrator":
    frappe.throw("You can't review your own timesheet.")

# Approvals belong to project managers only (HR views and downloads timesheets but doesn't approve them).
# Hours on a project -> that project's manager (or its creator); hours with no project -> the employee's line manager.
managers = {}
line_manager = None
if doc.employee:
    rt = frappe.db.get_value("Employee", doc.employee, "reports_to")
    if rt:
        line_manager = frappe.db.get_value("Employee", rt, "user_id")
for row in doc.time_logs:
    p = row.project or ""
    if p not in managers:
        if p:
            managers[p] = frappe.db.get_value("Project", p, "custom_project_manager") or frappe.db.get_value("Project", p, "owner")
        else:
            managers[p] = line_manager

mine = []
for row in doc.time_logs:
    p = row.project or ""
    if managers.get(p) and managers.get(p) == user:
        if only is None or p in only:
            mine.append(row)

now = frappe.utils.now()

def log(target, text):
    frappe.get_doc({"doctype": "Comment", "comment_type": "Info", "reference_doctype": "Timesheet", "reference_name": target, "content": text}).insert(ignore_permissions=True)

if action == "approve":
    if doc.docstatus != 1:
        frappe.throw("Only submitted timesheets can be approved.")
    if status == "Finalized":
        frappe.throw("This timesheet is already finalized.")
    if not mine:
        frappe.throw("None of the hours on this timesheet are on projects you manage.")
    override = []
    for row in mine:
        if row.custom_line_status != "Approved":
            frappe.db.set_value("Timesheet Detail", row.name, {"custom_line_status": "Approved", "custom_line_approver": user, "custom_line_approved_on": now})
            row.custom_line_status = "Approved"
    total = 0
    done = 0
    for row in doc.time_logs:
        total += 1
        if row.custom_line_status == "Approved":
            done += 1
    new = "Approved" if done == total else "Partly Approved"
    frappe.db.set_value("Timesheet", name, {"custom_review_status": new, "custom_reviewed_by": user, "custom_reviewed_on": now, "custom_review_note": note or None, "custom_review_version": version + 1})
    projects = []
    for row in mine:
        if (row.project or "-") not in projects:
            projects.append(row.project or "-")
    log(name, "Timesheet approved by project manager: " + ", ".join(projects) + (" - " + note if note else ""))
    frappe.response["message"] = {"status": new}
elif action == "return":
    if doc.docstatus != 1:
        frappe.throw("Only submitted timesheets can be returned.")
    if status == "Finalized":
        frappe.throw("This timesheet is finalized. Reopen it first.")
    if not mine:
        frappe.throw("None of the hours on this timesheet are on projects you manage.")
    if not note:
        frappe.throw("Tell the employee what to correct.")
    doc.flags.ethx_review = True
    doc.flags.ignore_permissions = True
    doc.cancel()
    copy = frappe.copy_doc(doc)
    copy.amended_from = name
    copy.custom_review_status = "Returned"
    copy.custom_review_note = note
    copy.custom_reviewed_by = user
    copy.custom_reviewed_on = now
    copy.custom_review_version = 0
    for row in copy.time_logs:
        row.custom_line_status = None
        row.custom_line_approver = None
        row.custom_line_approved_on = None
        row.sales_invoice = None
    copy.flags.ignore_permissions = True
    copy.insert()
    frappe.db.set_value("Timesheet", name, {"custom_review_status": "Returned", "custom_reviewed_by": user, "custom_reviewed_on": now, "custom_review_note": note, "custom_review_version": version + 1})
    log(name, "Timesheet returned for correction: " + note)
    log(copy.name, "Timesheet returned for correction: " + note)
    frappe.response["message"] = {"status": "Returned", "draft": copy.name}
elif action in ("finalize", "reopen"):
    if not is_hr:
        frappe.throw("Only HR can finalize or reopen timesheets.")
    if action == "finalize" and status != "Approved":
        frappe.throw("Only fully approved timesheets can be finalized.")
    if action == "reopen" and status != "Finalized":
        frappe.throw("Only finalized timesheets can be reopened.")
    if action == "reopen" and not note:
        frappe.throw("Give a reason for reopening a finalized timesheet.")
    new = "Finalized" if action == "finalize" else "Approved"
    frappe.db.set_value("Timesheet", name, {"custom_review_status": new, "custom_reviewed_by": user, "custom_reviewed_on": now, "custom_review_note": note or None, "custom_review_version": version + 1})
    log(name, ("Timesheet finalized" if action == "finalize" else "Timesheet reopened: " + note))
    frappe.response["message"] = {"status": new}
else:
    frappe.throw("Unknown action.")
`;

// Lines a project manager can act on, across all submitted timesheets (for the PM approvals screen).
const PM_QUEUE_API = `
user = frappe.session.user
projects = frappe.get_all("Project", filters={"custom_project_manager": user}, pluck="name")
for p in frappe.get_all("Project", filters={"owner": user, "custom_project_manager": ["is", "not set"]}, pluck="name"):
    projects.append(p)
fields = ["name", "parent", "project", "task", "from_time", "hours", "description", "custom_line_status", "custom_line_approver"]
rows = []
if projects:
    rows = frappe.get_all("Timesheet Detail", filters={"project": ["in", projects], "parenttype": "Timesheet"}, fields=fields, order_by="from_time asc")
# hours without a project go to the employee's line manager
me = frappe.db.get_value("Employee", {"user_id": user}, "name")
if me:
    team = frappe.get_all("Employee", filters={"reports_to": me}, pluck="name")
    if team:
        team_sheets = frappe.get_all("Timesheet", filters={"employee": ["in", team], "docstatus": ["<", 2]}, pluck="name")
        if team_sheets:
            for r in frappe.get_all("Timesheet Detail", filters={"parent": ["in", team_sheets], "parenttype": "Timesheet", "project": ["is", "not set"]}, fields=fields, order_by="from_time asc"):
                rows.append(r)
if not rows:
    frappe.response["message"] = []
else:
    parents = []
    for r in rows:
        if r.parent not in parents:
            parents.append(r.parent)
    sheets = {}
    if parents:
        for s in frappe.get_all("Timesheet", filters={"name": ["in", parents], "docstatus": ["<", 2]}, fields=["name", "employee", "employee_name", "start_date", "end_date", "docstatus", "custom_review_status", "custom_review_version", "custom_review_note", "total_hours"]):
            sheets[s.name] = s
    out = []
    for r in rows:
        s = sheets.get(r.parent)
        if s:
            r["sheet"] = s
            out.append(r)
    frappe.response["message"] = out
`;

// A week's timesheet can be saved as a draft all week, and submitted from its Sunday onwards.
const SUBMIT_FROM_SUNDAY = `
last = doc.end_date or doc.start_date
if last:
    last = frappe.utils.getdate(last)
    sunday = frappe.utils.getdate(frappe.utils.add_days(last, 6 - last.weekday()))
    if frappe.utils.getdate(frappe.utils.nowdate()) < sunday:
        frappe.throw("This week's timesheet can be submitted from Sunday " + str(sunday) + ". Until then, save it as a draft.")
`;

// Every night: drafts whose week has finished are submitted. A sheet HR returned for correction waits for the employee,
// and an empty one stays a draft. If a sheet can't be submitted, the reason is noted on it and the others carry on.
const AUTO_SUBMIT_WEEKS = `
today = frappe.utils.getdate(frappe.utils.nowdate())
activity = None
if frappe.db.exists("Activity Type", "Execution"):
    activity = "Execution"
else:
    types = frappe.get_all("Activity Type", filters={"disabled": 0}, pluck="name", limit=1)
    if types:
        activity = types[0]
for s in frappe.get_all("Timesheet", filters={"docstatus": 0, "employee": ["is", "set"]}, fields=["name", "start_date", "end_date", "total_hours", "custom_review_status"]):
    last = s.end_date or s.start_date
    if not last or s.custom_review_status == "Returned" or not frappe.utils.flt(s.total_hours) > 0:
        continue
    last = frappe.utils.getdate(last)
    sunday = frappe.utils.getdate(frappe.utils.add_days(last, 6 - last.weekday()))
    if today <= sunday:
        continue
    text = "Submitted automatically after the week ended"
    try:
        ts = frappe.get_doc("Timesheet", s.name)
        for row in ts.time_logs:
            if not row.activity_type:
                row.activity_type = activity
        ts.flags.ignore_permissions = True
        ts.submit()
    except Exception as e:
        text = "Couldn't be submitted automatically: " + str(e)[:200]
    frappe.get_doc({"doctype": "Comment", "comment_type": "Info", "reference_doctype": "Timesheet", "reference_name": s.name, "content": text}).insert(ignore_permissions=True)
`;

export const TIMESHEET_SCRIPTS = [
  { name: "ETHX - Submit timesheet from Sunday", script_type: "DocType Event", reference_doctype: "Timesheet", doctype_event: "Before Submit", script: SUBMIT_FROM_SUNDAY, what: "A week's timesheet can be submitted from its Sunday" },
  { name: "ETHX - Auto-submit timesheets", script_type: "Scheduler Event", event_frequency: "Daily", script: AUTO_SUBMIT_WEEKS, what: "Drafts are submitted automatically once their week has ended" },
  { name: "ETHX - Timesheet submit", reference_doctype: "Timesheet", doctype_event: "Before Submit", script: ON_SUBMIT, what: "Submitting a timesheet puts every line in Pending review" },
  { name: "ETHX - Timesheet draft", reference_doctype: "Timesheet", doctype_event: "Before Save", script: ON_SAVE, what: "New timesheets start as Draft" },
  { name: "ETHX - Timesheet lock", reference_doctype: "Timesheet", doctype_event: "Before Cancel", script: BEFORE_CANCEL, what: "Finalized timesheets are locked; approved ones can only be returned through the app" },
  { name: "ETHX - Review timesheet", script_type: "API", api_method: "ethx_review_timesheet", script: REVIEW_API, what: "Only project managers approve / return hours on their projects (line manager for hours without a project); no self-review, no stale updates" },
  { name: "ETHX - PM timesheet queue", script_type: "API", api_method: "ethx_pm_timesheet_queue", script: PM_QUEUE_API, what: "Project managers see only hours on their own projects" },
];

// One-off migration (Administrator): timesheets reviewed before this version kept their review in comments.
// Sets the new status fields from those comments and gives projects without a manager their creator as manager.
const MIGRATE_API = `
if frappe.session.user != "Administrator":
    roles = frappe.get_all("Has Role", filters={"parent": frappe.session.user, "parenttype": "User"}, pluck="role")
    if "System Manager" not in roles:
        frappe.throw("Only the Administrator can run the timesheet migration.")
done = 0
for t in frappe.get_all("Timesheet", filters={"custom_review_status": ["in", ["", None]]}, fields=["name", "docstatus"]):
    last = None
    for c in frappe.get_all("Comment", filters={"reference_doctype": "Timesheet", "reference_name": t.name, "comment_type": "Info", "content": ["like", "%Timesheet %"]}, fields=["content", "owner", "creation"], order_by="creation asc"):
        text = frappe.utils.strip_html(c.content or "")
        if text.startswith("Timesheet approved") or text.startswith("Timesheet returned for correction"):
            last = c
    status = "Draft"
    if t.docstatus == 1:
        status = "Pending Review"
    if last:
        text = frappe.utils.strip_html(last.content or "")
        if text.startswith("Timesheet approved") and t.docstatus == 1:
            status = "Approved"
        elif text.startswith("Timesheet returned"):
            status = "Returned"
    values = {"custom_review_status": status, "custom_review_version": 1 if t.docstatus == 1 else 0}
    if last:
        values["custom_reviewed_by"] = last.owner
        values["custom_reviewed_on"] = last.creation
    frappe.db.set_value("Timesheet", t.name, values)
    if t.docstatus == 1:
        line = "Approved" if status == "Approved" else "Pending"
        for d in frappe.get_all("Timesheet Detail", filters={"parent": t.name, "parenttype": "Timesheet"}, pluck="name"):
            frappe.db.set_value("Timesheet Detail", d, {"custom_line_status": line, "custom_line_approver": last.owner if (last and line == "Approved") else None})
    done += 1
projects = 0
for p in frappe.get_all("Project", filters={"custom_project_manager": ["is", "not set"]}, fields=["name", "owner"]):
    frappe.db.set_value("Project", p.name, "custom_project_manager", p.owner)
    projects += 1
frappe.response["message"] = {"timesheets": done, "projects": projects}
`;

TIMESHEET_SCRIPTS.push({ name: "ETHX - Migrate timesheet reviews", script_type: "API", api_method: "ethx_migrate_timesheet_reviews", script: MIGRATE_API, what: "Converts comment-based timesheet approvals to the new review fields" });

// A timesheet for review by a project manager who can't read other employees' records directly (ERPNext restricts a
// PM's login to their own Employee). Only returned if they manage at least one project on it.
const GET_FOR_REVIEW_API = `
name = frappe.form_dict.get("timesheet")
user = frappe.session.user
doc = frappe.get_doc("Timesheet", name)
ok = user == "Administrator"
for row in doc.time_logs:
    p = row.project or ""
    if p and not ok:
        if (frappe.db.get_value("Project", p, "custom_project_manager") or frappe.db.get_value("Project", p, "owner")) == user:
            ok = True
if not ok and doc.employee:
    # line manager of the employee (approves hours that have no project)
    rt = frappe.db.get_value("Employee", doc.employee, "reports_to")
    if rt and frappe.db.get_value("Employee", rt, "user_id") == user:
        ok = True
if not ok:
    frappe.throw("You don't manage any project on this timesheet.")
frappe.response["message"] = doc.as_dict()
`;

TIMESHEET_SCRIPTS.push({ name: "ETHX - Timesheet for review", script_type: "API", api_method: "ethx_timesheet_for_review", script: GET_FOR_REVIEW_API, what: "Project managers can open timesheets that include their projects" });