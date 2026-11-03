// Manager self-service: employee logins are restricted to their own Employee record, so a line manager can't read
// their team directly. These server methods return only the manager's own team (employees whose Reports To is the
// manager, or whose Leave Approver is the manager). Only a leave application's assigned approver can decide it.
const TEAM_API = `
user = frappe.session.user
me = frappe.db.get_value("Employee", {"user_id": user, "status": "Active"}, ["name", "employee_name"], as_dict=True)
team = []
if me:
    team = frappe.get_all("Employee", filters={"reports_to": me.name, "status": "Active"}, fields=["name", "employee_name", "designation", "department", "user_id", "image"], order_by="employee_name asc")
ids = []
for t in team:
    ids.append(t.name)
apps = frappe.get_all("Leave Application", filters={"docstatus": 0, "status": "Open", "leave_approver": user}, fields=["name", "employee", "employee_name", "leave_type", "from_date", "to_date", "total_leave_days", "half_day", "description", "posting_date"], order_by="from_date asc")
today = frappe.utils.nowdate()
soon = frappe.utils.add_days(today, 14)
away = []
present = {}
if ids:
    away = frappe.get_all("Leave Application", filters={"docstatus": 1, "status": "Approved", "employee": ["in", ids], "to_date": [">=", today], "from_date": ["<=", soon]}, fields=["employee", "employee_name", "leave_type", "from_date", "to_date", "half_day"], order_by="from_date asc")
    for c in frappe.get_all("Employee Checkin", filters={"employee": ["in", ids], "time": [">=", today + " 00:00:00"]}, fields=["employee", "log_type", "time"], order_by="time asc"):
        present[c.employee] = {"log_type": c.log_type, "time": str(c.time)}
    for at in frappe.get_all("Attendance", filters={"employee": ["in", ids], "attendance_date": today, "docstatus": 1}, fields=["employee", "status"]):
        present[at.employee] = {"status": at.status}
frappe.response["message"] = {"me": me, "team": team, "leave": apps, "away": away, "today": present}
`;

const LEAVE_DECISION_API = `
user = frappe.session.user
name = frappe.form_dict.get("leave")
status = frappe.form_dict.get("status")
note = (frappe.form_dict.get("note") or "").strip()
if status not in ("Approved", "Rejected"):
    frappe.throw("Choose Approved or Rejected.")
if status == "Rejected" and not note:
    frappe.throw("Give the reason for rejecting.")
doc = frappe.get_doc("Leave Application", name)
if doc.docstatus != 0 or doc.status != "Open":
    frappe.throw("This leave application has already been decided.")
owner_user = frappe.db.get_value("Employee", doc.employee, "user_id")
if owner_user == user:
    frappe.throw("You can't decide on your own leave.")
if doc.leave_approver != user:
    frappe.throw("Only the assigned leave approver can approve or reject this leave.")
doc.status = "Approved" if status == "Approved" else "Rejected"
doc.flags.ignore_permissions = True
doc.submit()
frappe.get_doc({"doctype": "Comment", "comment_type": "Info", "reference_doctype": "Leave Application", "reference_name": name, "content": "Leave " + status.lower() + " by " + user + (": " + note if note else "")}).insert(ignore_permissions=True)
frappe.response["message"] = {"status": doc.status}
`;

// Employees may change their own personal, emergency-contact and passport details (everything on their profile except
// employment), but have no write access to Employee itself. Must match EDIT_SECTIONS in EmployeePages.jsx.
const MY_CONTACT_API = `
allowed = ["date_of_birth", "gender", "blood_group", "marital_status", "cell_number", "personal_email", "current_address", "permanent_address", "person_to_be_contacted", "relation", "emergency_phone_number", "passport_number", "valid_upto"]
meta = frappe.get_meta("Employee")
for k in ["custom_pan_number", "custom_aadhaar_number"]:
    if meta.has_field(k):
        allowed.append(k)
emp = frappe.db.get_value("Employee", {"user_id": frappe.session.user}, ["name", "date_of_joining"], as_dict=True)
if not emp:
    frappe.throw("No employee record is linked to your login.")
values = frappe.parse_json(frappe.form_dict.get("values") or "{}")
clean = {}
for k in allowed:
    if k in values:
        v = values.get(k)
        clean[k] = v.strip() if isinstance(v, str) else v
for k in ["date_of_birth", "valid_upto", "blood_group", "marital_status", "gender"]:
    if k in clean and not clean[k]:
        clean[k] = None
if clean.get("date_of_birth"):
    dob = frappe.utils.getdate(clean["date_of_birth"])
    if dob >= frappe.utils.getdate(frappe.utils.nowdate()):
        frappe.throw("Date of birth must be in the past.")
    if emp.date_of_joining and dob >= frappe.utils.getdate(emp.date_of_joining):
        frappe.throw("Date of birth must be before your date of joining.")
if "date_of_birth" in clean and not clean["date_of_birth"]:
    frappe.throw("Date of birth can't be empty.")
if "gender" in clean and not clean["gender"]:
    frappe.throw("Gender can't be empty.")
if clean.get("gender") and not frappe.db.exists("Gender", clean["gender"]):
    frappe.throw("Choose a gender from the list.")
if clean.get("blood_group") and clean["blood_group"] not in ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"]:
    frappe.throw("Choose a blood group from the list.")
if clean.get("marital_status") and clean["marital_status"] not in ["Single", "Married", "Divorced", "Widowed"]:
    frappe.throw("Choose a marital status from the list.")
if "custom_pan_number" in clean:
    clean["custom_pan_number"] = (clean["custom_pan_number"] or "").upper().replace(" ", "")
    pan = clean["custom_pan_number"]
    if pan and not (len(pan) == 10 and pan[:5].isalpha() and pan[5:9].isdigit() and pan[9].isalpha()):
        frappe.throw("PAN must be 10 characters, like ABCDE1234F.")
if "custom_aadhaar_number" in clean:
    clean["custom_aadhaar_number"] = (clean["custom_aadhaar_number"] or "").replace(" ", "").replace("-", "")
    aadhaar = clean["custom_aadhaar_number"]
    if aadhaar and (len(aadhaar) != 12 or not aadhaar.isdigit()):
        frappe.throw("Aadhaar must be 12 digits.")
if clean.get("personal_email") and ("@" not in clean["personal_email"] or "." not in clean["personal_email"] or " " in clean["personal_email"]):
    frappe.throw("Enter a valid personal email address.")
if clean:
    frappe.db.set_value("Employee", emp.name, clean)
frappe.response["message"] = {"employee": emp.name, "updated": list(clean.keys())}
`;

// Everyone's upcoming birthdays in the caller's company: name and day only, never the year of birth.
const BIRTHDAYS_API = `
me = frappe.db.get_value("Employee", {"user_id": frappe.session.user}, "company")
filters = {"status": "Active", "date_of_birth": ["is", "set"]}
if me:
    filters["company"] = me
if frappe.get_meta("Employee").has_field("custom_is_contractor"):
    filters["custom_is_contractor"] = 0
by_day = {}
for e in frappe.get_all("Employee", filters=filters, fields=["employee_name", "date_of_birth"], order_by="employee_name asc"):
    day = str(e.date_of_birth)[5:10]
    by_day.setdefault(day, []).append(e.employee_name)
today = frappe.utils.getdate(frappe.utils.nowdate())
out = []
for i in range(0, 31):
    d = str(frappe.utils.add_days(today, i))[:10]
    for name in by_day.get(d[5:10], []):
        out.append({"name": name, "date": d, "days_away": i})
frappe.response["message"] = out
`;

// Every morning: colleagues in the company get a notification on someone's birthday and the person gets a birthday
// email; HR is told the day before, so a card or wishes can be ready. Emails need an outgoing email account in ERPNext.
const BIRTHDAY_WISHES = `
today = frappe.utils.getdate(frappe.utils.nowdate())
day = str(today)[5:10]
tomorrow = str(frappe.utils.add_days(today, 1))[5:10]
filters = {"status": "Active", "date_of_birth": ["is", "set"]}
if frappe.get_meta("Employee").has_field("custom_is_contractor"):
    filters["custom_is_contractor"] = 0
people = frappe.get_all("Employee", filters=filters, fields=["name", "employee_name", "company", "user_id", "company_email", "personal_email", "date_of_birth"])
hr_users = []
for r in frappe.get_all("Has Role", filters={"role": ["in", ["HR Manager", "HR User"]], "parenttype": "User"}, fields=["parent"]):
    if r.parent not in hr_users and r.parent not in ("Administrator", "Guest"):
        hr_users.append(r.parent)
for p in people:
    born = str(p.date_of_birth)[5:10]
    if born == day:
        subject = "Today is " + p.employee_name + "'s birthday. Wish them a happy birthday!"
        for c in people:
            if c.user_id and c.name != p.name and c.company == p.company and not frappe.db.exists("Notification Log", {"for_user": c.user_id, "subject": subject, "creation": [">=", str(today) + " 00:00:00"]}):
                frappe.get_doc({"doctype": "Notification Log", "for_user": c.user_id, "type": "Alert", "subject": subject}).insert(ignore_permissions=True)
        to = p.user_id or p.company_email or p.personal_email
        if to and "@" in to:
            frappe.sendmail(recipients=[to], subject="Happy Birthday, " + p.employee_name + "!", message="<p>Dear " + p.employee_name + ",</p><p>Wishing you a very happy birthday and a wonderful year ahead, from all of us at " + p.company + ".</p>")
    if born == tomorrow:
        subject = "Tomorrow is " + p.employee_name + "'s birthday."
        for u in hr_users:
            if not frappe.db.exists("Notification Log", {"for_user": u, "subject": subject, "creation": [">=", str(today) + " 00:00:00"]}):
                frappe.get_doc({"doctype": "Notification Log", "for_user": u, "type": "Alert", "subject": subject}).insert(ignore_permissions=True)
`;

// Employees can't edit their Employee record, so their own documents are uploaded privately first, then attached here.
const ATTACH_DOCUMENT_API = `
user = frappe.session.user
emp = frappe.db.get_value("Employee", {"user_id": user}, "name")
if not emp:
    frappe.throw("No employee record is linked to your login.")
name = frappe.form_dict.get("file")
if not name or frappe.db.get_value("File", name, "owner") != user:
    frappe.throw("You can only attach a file you uploaded yourself.")
frappe.db.set_value("File", name, {"attached_to_doctype": "Employee", "attached_to_name": emp, "is_private": 1})
frappe.response["message"] = {"file": name}
`;

const REMOVE_DOCUMENT_API = `
user = frappe.session.user
emp = frappe.db.get_value("Employee", {"user_id": user}, "name")
row = frappe.db.get_value("File", frappe.form_dict.get("file") or "__none__", ["name", "owner", "attached_to_doctype", "attached_to_name"], as_dict=True)
if not emp or not row or row.owner != user or row.attached_to_doctype != "Employee" or row.attached_to_name != emp:
    frappe.throw("You can only remove documents you uploaded yourself.")
frappe.delete_doc("File", row.name, ignore_permissions=True)
frappe.response["message"] = {"file": row.name}
`;

// Insurance from the employee's record, benefits from their application and salary structure, and their claims.
const MY_BENEFITS_API = `
emp = frappe.db.get_value("Employee", {"user_id": frappe.session.user}, ["name", "health_insurance_provider", "health_insurance_no"], as_dict=True)
if not emp:
    frappe.throw("No employee record is linked to your login.")
benefits = []
try:
    for app in frappe.get_all("Employee Benefit Application", filters={"employee": emp.name, "docstatus": 1}, fields=["name"], order_by="creation desc", limit=1):
        for row in frappe.get_all("Employee Benefit Application Detail", filters={"parent": app.name}, fields=["earning_component", "amount", "max_benefit_amount"]):
            benefits.append({"benefit": row.earning_component, "amount": row.amount, "limit": row.max_benefit_amount, "source": "Benefit Application"})
except Exception:
    pass
try:
    for ssa in frappe.get_all("Salary Structure Assignment", filters={"employee": emp.name, "docstatus": 1}, fields=["salary_structure"], order_by="from_date desc", limit=1):
        for row in frappe.get_all("Salary Detail", filters={"parent": ssa.salary_structure, "parenttype": "Salary Structure", "parentfield": "earnings", "is_flexible_benefit": 1}, fields=["salary_component", "amount"]):
            taken = False
            for b in benefits:
                if b["benefit"] == row.salary_component:
                    taken = True
            if not taken:
                benefits.append({"benefit": row.salary_component, "amount": row.amount, "limit": None, "source": "Salary Structure"})
except Exception:
    pass
claims = []
for date_field in ["claim_date", "payroll_date"]:
    try:
        for c in frappe.get_all("Employee Benefit Claim", filters={"employee": emp.name, "docstatus": ["<", 2]}, fields=["name", date_field, "earning_component", "claimed_amount", "docstatus"], order_by="creation desc", limit=20):
            claims.append({"name": c.name, "claim_date": c.get(date_field), "earning_component": c.earning_component, "claimed_amount": c.claimed_amount, "docstatus": c.docstatus})
        break
    except Exception:
        pass
frappe.response["message"] = {"insurance": {"provider": emp.health_insurance_provider, "number": emp.health_insurance_no}, "benefits": benefits, "claims": claims}
`;

// A person's own requests: the ones they raised or created, whatever their role can read in ERPNext,
// each with HR's latest note (their own comments, like "Withdrawn by", aren't notes from HR).
const MY_REQUESTS_API = `
user = frappe.session.user
rows = frappe.get_all("Issue", or_filters={"raised_by": user, "owner": user}, fields=["name", "subject", "description", "status", "priority", "creation"], order_by="creation desc", limit=200)
names = []
for r in rows:
    names.append(r.name)
notes = {}
if names:
    for c in frappe.get_all("Comment", filters={"reference_doctype": "Issue", "reference_name": ["in", names], "comment_type": "Info", "owner": ["!=", user]}, fields=["reference_name", "content"], order_by="creation asc"):
        notes[c.reference_name] = c.content
out = []
for r in rows:
    out.append({"name": r.name, "subject": r.subject, "description": r.description, "status": r.status, "priority": r.priority, "creation": r.creation, "hr_note": notes.get(r.name)})
frappe.response["message"] = out
`;

// Raise, edit or withdraw your own request. Once HR has picked one up it can't be changed.
const MY_REQUEST_API = `
user = frappe.session.user
args = frappe.form_dict
action = args.get("action")
category = (args.get("category") or "").strip()
subject = (args.get("subject") or "").strip()
description = (args.get("description") or "").strip()
if action in ("create", "edit") and (not subject or not category):
    frappe.throw("Enter a subject for the request.")
title = "[" + category + "] " + subject
if action == "create":
    doc = frappe.get_doc({"doctype": "Issue", "subject": title, "description": description or subject, "raised_by": user, "priority": "Medium"})
    doc.insert(ignore_permissions=True)
    frappe.response["message"] = {"name": doc.name}
elif action in ("edit", "withdraw"):
    name = args.get("name")
    row = frappe.db.get_value("Issue", name or "__none__", ["name", "raised_by", "owner", "status"], as_dict=True)
    if not row or (row.raised_by != user and row.owner != user):
        frappe.throw("You can only change your own requests.")
    if row.status != "Open":
        frappe.throw("HR has already picked up this request, so it can't be changed.")
    if action == "edit":
        frappe.db.set_value("Issue", row.name, {"subject": title, "description": description or subject})
    else:
        frappe.db.set_value("Issue", row.name, "status", "Closed")
        frappe.get_doc({"doctype": "Comment", "comment_type": "Info", "reference_doctype": "Issue", "reference_name": row.name, "content": "Withdrawn by " + user}).insert(ignore_permissions=True)
    frappe.response["message"] = {"name": row.name}
else:
    frappe.throw("Unknown action.")
`;

// Today's shift times for the punch reminder: an active shift assignment, then the employee's default shift.
const MY_SHIFT_API = `
today = frappe.utils.nowdate()
emp = frappe.db.get_value("Employee", {"user_id": frappe.session.user}, ["name", "default_shift"], as_dict=True)
shift = emp.default_shift if emp else None
if emp:
    for a in frappe.get_all("Shift Assignment", filters={"employee": emp.name, "docstatus": 1, "status": "Active", "start_date": ["<=", today]}, fields=["shift_type", "end_date"], order_by="start_date desc"):
        if not a.end_date or str(a.end_date) >= today:
            shift = a.shift_type
            break
times = frappe.db.get_value("Shift Type", shift, ["start_time", "end_time"], as_dict=True) if shift else None
frappe.response["message"] = {"shift": shift, "start": str(times.start_time), "end": str(times.end_time)} if times else None
`;

// HR's Employee Requests page moves requests to In Progress, which stock ERPNext Issues don't have.
export const TEAM_PROPERTIES = [
  { doc_type: "Issue", field_name: "status", property: "options", property_type: "Text", value: "Open\nIn Progress\nReplied\nOn Hold\nResolved\nClosed", what: "Issue › status can be In Progress" },
];

export const TEAM_SCRIPTS = [
  { name: "ETHX - My benefits", script_type: "API", api_method: "ethx_my_benefits", script: MY_BENEFITS_API, what: "Employees see their own insurance, benefits and benefit claims" },
  { name: "ETHX - My requests", script_type: "API", api_method: "ethx_my_requests", script: MY_REQUESTS_API, what: "Employees see the requests they raised" },
  { name: "ETHX - My request", script_type: "API", api_method: "ethx_my_request", script: MY_REQUEST_API, what: "Employees raise, edit and withdraw their own requests until HR picks them up" },
  { name: "ETHX - My shift", script_type: "API", api_method: "ethx_my_shift", script: MY_SHIFT_API, what: "Today's shift times for the punch reminder" },
  { name: "ETHX - Upcoming birthdays", script_type: "API", api_method: "ethx_upcoming_birthdays", script: BIRTHDAYS_API, what: "Birthday reminders on the calendar and dashboard" },
  { name: "ETHX - Birthday wishes", script_type: "Scheduler Event", event_frequency: "Daily", script: BIRTHDAY_WISHES, what: "On birthdays, colleagues are notified and the person gets a birthday email; HR is told the day before" },
  { name: "ETHX - Attach my document", script_type: "API", api_method: "ethx_attach_my_document", script: ATTACH_DOCUMENT_API, what: "Employees upload their own documents (PAN, Aadhaar, bank)" },
  { name: "ETHX - Remove my document", script_type: "API", api_method: "ethx_remove_my_document", script: REMOVE_DOCUMENT_API, what: "Employees remove documents they uploaded" },
  { name: "ETHX - Update my contact details", script_type: "API", api_method: "ethx_update_my_contact", script: MY_CONTACT_API, what: "Employees update their own personal details, emergency contact and passport" },
  { name: "ETHX - My team", script_type: "API", api_method: "ethx_my_team", script: TEAM_API, what: "Managers see their direct reports, who's in today, upcoming leave and leave waiting for them" },
  { name: "ETHX - Team leave decision", script_type: "API", api_method: "ethx_team_leave_decision", script: LEAVE_DECISION_API, what: "Only the assigned leave approver approves or rejects leave, never their own" },
];
