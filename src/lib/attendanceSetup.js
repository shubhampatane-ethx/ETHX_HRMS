// Attendance from punches (installed from Admin › ERPNext Setup). Employees punch in / out as Employee Checkins;
// ERPNext only turns those into Attendance when a Shift Type has auto-attendance configured. This daily job marks
// every day of the last week that has punches but no attendance yet:
//   - Present when the time worked (each punch in to the next punch out, added up) is FULL_DAY_HOURS or more;
//   - shorter days, and days with no punch out, are not marked: the employee asks for a correction or HR marks them;
//   - days that already have attendance (marked by HR, or On Leave from an approved leave) are left alone.
// The screens show the same rule (employeePortal.punchDayStatus). HR can still change any record on the Attendance page.

export const FULL_DAY_HOURS = 8;

const MARK_FROM_PUNCHES = `
today = frappe.utils.getdate(frappe.utils.nowdate())
for back in range(1, 8):
    day = frappe.utils.add_days(today, -back)
    start = str(day) + " 00:00:00"
    end = str(day) + " 23:59:59"
    logs = frappe.get_all("Employee Checkin", filters={"time": ["between", [start, end]]}, fields=["employee", "time", "log_type"], order_by="time asc")
    by_emp = {}
    for l in logs:
        by_emp.setdefault(l.employee, []).append(l)
    for emp, rows in by_emp.items():
        if frappe.db.exists("Attendance", {"employee": emp, "attendance_date": day, "docstatus": ["<", 2]}):
            continue
        info = frappe.db.get_value("Employee", emp, ["company", "status"], as_dict=True)
        if not info or info.status == "Left":
            continue
        hours = 0
        open_in = None
        for r in rows:
            if r.log_type == "IN":
                if not open_in:
                    open_in = r.time
            elif r.log_type == "OUT" and open_in:
                hours += frappe.utils.time_diff_in_hours(r.time, open_in)
                open_in = None
        if hours < ${FULL_DAY_HOURS}:
            continue
        ins = [r.time for r in rows if r.log_type == "IN"]
        outs = [r.time for r in rows if r.log_type == "OUT"]
        att = frappe.get_doc({"doctype": "Attendance", "employee": emp, "attendance_date": day, "status": "Present", "company": info.company, "working_hours": round(hours, 2), "in_time": min(ins), "out_time": max(outs)})
        att.insert(ignore_permissions=True)
        att.submit()
`;

// Every hour: anyone working today who hasn't punched in 15 minutes after their shift starts, or out 15 minutes after it
// ends, gets one notification per day for each. Shifts default to 09:30 - 18:30, as in PunchReminder.jsx.
const PUNCH_REMINDERS = `
today = frappe.utils.nowdate()
weekday = frappe.utils.getdate(today).weekday()
parts = str(frappe.utils.nowtime()).split(":")
current = int(parts[0]) * 60 + int(parts[1])
filters = {"status": "Active", "user_id": ["is", "set"]}
if frappe.get_meta("Employee").has_field("custom_is_contractor"):
    filters["custom_is_contractor"] = 0
for e in frappe.get_all("Employee", filters=filters, fields=["name", "user_id", "holiday_list", "default_shift", "company"]):
    holidays = e.holiday_list or frappe.db.get_value("Company", e.company, "default_holiday_list")
    if holidays:
        if frappe.db.exists("Holiday", {"parent": holidays, "holiday_date": today}):
            continue
    elif weekday >= 5:
        continue
    if frappe.db.count("Leave Application", {"employee": e.name, "status": "Approved", "docstatus": 1, "from_date": ["<=", today], "to_date": [">=", today]}):
        continue
    shift = e.default_shift
    for a in frappe.get_all("Shift Assignment", filters={"employee": e.name, "docstatus": 1, "status": "Active", "start_date": ["<=", today]}, fields=["shift_type", "end_date"], order_by="start_date desc"):
        if not a.end_date or str(a.end_date) >= today:
            shift = a.shift_type
            break
    start = 570
    end = 1110
    times = frappe.db.get_value("Shift Type", shift, ["start_time", "end_time"], as_dict=True) if shift else None
    if times:
        s = str(times.start_time).split(":")
        f = str(times.end_time).split(":")
        start = int(s[0]) * 60 + int(s[1])
        end = int(f[0]) * 60 + int(f[1])
    logs = frappe.get_all("Employee Checkin", filters={"employee": e.name, "time": [">=", today + " 00:00:00"]}, fields=["log_type"], order_by="time asc")
    subject = None
    if current >= start + 15 and current < end and not logs:
        subject = "Punch In Reminder: you haven't punched in today."
    elif current >= end + 15 and logs and logs[len(logs) - 1].log_type == "IN":
        subject = "Punch Out Reminder: you haven't punched out today."
    if subject and not frappe.db.exists("Notification Log", {"for_user": e.user_id, "subject": subject, "creation": [">=", today + " 00:00:00"]}):
        frappe.get_doc({"doctype": "Notification Log", "for_user": e.user_id, "type": "Alert", "subject": subject, "document_type": "Employee", "document_name": e.name}).insert(ignore_permissions=True)
`;

// Attendance correction requests go to an approver (the employee's leave approver, else their manager), who approves
// them (the request is submitted and HRMS marks the days) or rejects them with a reason. HR can decide any request
// from HR › Attendance Requests (never their own).
const ATTENDANCE_REQUEST_ASSIGN = `
owner = frappe.db.get_value("Employee", doc.employee, ["user_id", "leave_approver", "reports_to"], as_dict=True)
if owner:
    if not doc.get("custom_approver"):
        approver = owner.leave_approver
        if not approver and owner.reports_to:
            approver = frappe.db.get_value("Employee", owner.reports_to, "user_id")
        doc.custom_approver = approver
    if doc.get("custom_approver") and doc.custom_approver == owner.user_id:
        doc.custom_approver = None
`;

const ATTENDANCE_REQUESTS_API = `
rows = frappe.get_all("Attendance Request", filters={"docstatus": 0, "custom_approver": frappe.session.user}, fields=["name", "employee", "employee_name", "from_date", "to_date", "reason", "explanation", "custom_decision", "creation"], order_by="from_date asc")
out = []
for r in rows:
    if r.custom_decision != "Rejected":
        out.append(r)
frappe.response["message"] = out
`;

const ATTENDANCE_DECISION_API = `
user = frappe.session.user
name = frappe.form_dict.get("request")
status = frappe.form_dict.get("status")
note = (frappe.form_dict.get("note") or "").strip()
if status not in ("Approved", "Rejected"):
    frappe.throw("Choose Approved or Rejected.")
if status == "Rejected" and not note:
    frappe.throw("Give the reason for rejecting.")
doc = frappe.get_doc("Attendance Request", name)
if doc.docstatus != 0 or doc.get("custom_decision") == "Rejected":
    frappe.throw("This request has already been decided.")
owner = frappe.db.get_value("Employee", doc.employee, "user_id")
if owner == user:
    frappe.throw("You can't decide on your own request.")
roles = frappe.get_all("Has Role", filters={"parent": user, "parenttype": "User"}, pluck="role")
is_hr = user == "Administrator" or "HR Manager" in roles or "HR User" in roles or "System Manager" in roles
# HR staff's own requests are decided by their approver or manager, not by fellow HR.
owner_staff = owner and frappe.get_all("Has Role", filters={"parent": owner, "parenttype": "User", "role": ["in", ["HR Manager", "HR User"]]}, pluck="role")
if owner_staff and user != "Administrator":
    info = frappe.db.get_value("Employee", doc.employee, ["reports_to", "leave_approver"], as_dict=True) or {}
    boss = frappe.db.get_value("Employee", info.get("reports_to"), "user_id") if info.get("reports_to") else None
    if user not in (doc.get("custom_approver"), boss, info.get("leave_approver")) and "System Manager" not in roles:
        frappe.throw("This is an HR team member's request, so their approver, their manager or an admin decides it.")
elif doc.get("custom_approver") != user and not is_hr:
    frappe.throw("Only the assigned approver or HR can approve or reject this request.")
if status == "Approved":
    doc.flags.ignore_permissions = True
    doc.submit()
    if note:
        frappe.db.set_value("Attendance Request", name, "custom_decision_note", note)
else:
    frappe.db.set_value("Attendance Request", name, {"custom_decision": "Rejected", "custom_decision_note": note})
frappe.get_doc({"doctype": "Comment", "comment_type": "Info", "reference_doctype": "Attendance Request", "reference_name": name, "content": "Attendance request " + status.lower() + " by " + user + (": " + note if note else "")}).insert(ignore_permissions=True)
if owner:
    frappe.get_doc({"doctype": "Notification Log", "for_user": owner, "type": "Alert", "subject": "Your attendance request was " + status.lower() + (": " + note if note else "."), "document_type": "Attendance Request", "document_name": name}).insert(ignore_permissions=True)
frappe.response["message"] = {"status": status}
`;

// Who may mark or change a person's attendance by hand (the Attendance page, ERPNext desk). Nobody decides their own
// days, and HR staff's attendance is decided by their manager - their Leave Approver or Reports To, the same people
// attendance corrections go to - or by an admin (System Manager), not by themselves or by fellow HR. Days
// that come from an approved leave or attendance request follow those approvals, and the nightly job runs as
// Administrator, so neither is checked here. Without a manager set, HR (other than the person) may decide.
const ATTENDANCE_GUARD = `
user = frappe.session.user
if user != "Administrator" and not doc.get("leave_application") and not doc.get("attendance_request"):
    emp = frappe.db.get_value("Employee", doc.employee, ["user_id", "reports_to", "leave_approver", "employee_name"], as_dict=True)
    if emp and emp.user_id:
        if emp.user_id == user:
            frappe.throw("You can't mark or change your own attendance - your manager does that.")
        staff = frappe.get_all("Has Role", filters={"parent": emp.user_id, "parenttype": "User", "role": ["in", ["HR Manager", "HR User"]]}, pluck="role")
        if staff:
            managers = []
            if emp.leave_approver:
                managers.append(emp.leave_approver)
            if emp.reports_to:
                boss = frappe.db.get_value("Employee", emp.reports_to, "user_id")
                if boss:
                    managers.append(boss)
            is_admin = frappe.db.exists("Has Role", {"parent": user, "parenttype": "User", "role": "System Manager"})
            if managers and user not in managers and not is_admin:
                frappe.throw((emp.employee_name or doc.employee) + " is HR staff, so their attendance is decided by their manager (" + " or ".join(managers) + ").")
`;

// My Team › Attendance to Decide: a manager's people (those who report to them, or whose leave approver they are) - past days in the last month that have punches but no
// attendance and were too short to be marked automatically (under FULL_DAY_HOURS, or never punched out).
const TEAM_ATTENDANCE_API = `
user = frappe.session.user
me = frappe.db.get_value("Employee", {"user_id": user, "status": "Active"}, "name")
out = []
names = {}
if me:
    for t in frappe.get_all("Employee", filters={"reports_to": me, "status": "Active"}, fields=["name", "employee_name", "user_id"]):
        if t.user_id != user:
            names[t.name] = t.employee_name
for t in frappe.get_all("Employee", filters={"leave_approver": user, "status": "Active"}, fields=["name", "employee_name", "user_id"]):
    if t.user_id != user:
        names[t.name] = t.employee_name
if names:
    today = frappe.utils.nowdate()
    since = str(frappe.utils.add_days(today, -31))
    ids = list(names.keys())
    have = set()
    for a in frappe.get_all("Attendance", filters={"employee": ["in", ids], "attendance_date": [">=", since], "docstatus": ["<", 2]}, fields=["employee", "attendance_date"]):
        have.add(a.employee + "|" + str(a.attendance_date))
    days = {}
    for l in frappe.get_all("Employee Checkin", filters={"employee": ["in", ids], "time": [">=", since + " 00:00:00"]}, fields=["employee", "time", "log_type"], order_by="time asc"):
        days.setdefault(l.employee + "|" + str(l.time)[:10], []).append(l)
    for key in days:
        parts = key.split("|")
        emp = parts[0]
        day = parts[1]
        if key in have or day >= today:
            continue
        rows = days[key]
        hours = 0
        open_in = None
        for r in rows:
            if r.log_type == "IN":
                if not open_in:
                    open_in = r.time
            elif r.log_type == "OUT" and open_in:
                hours += frappe.utils.time_diff_in_hours(r.time, open_in)
                open_in = None
        if hours >= ${FULL_DAY_HOURS}:
            continue
        ins = [r.time for r in rows if r.log_type == "IN"]
        outs = [r.time for r in rows if r.log_type == "OUT"]
        out.append({"employee": emp, "employee_name": names[emp], "date": day, "hours": round(hours, 2), "in_time": str(min(ins)) if ins else None, "out_time": str(max(outs)) if outs else None, "status": "Missed Punch Out" if open_in else "Short Hours"})
out = sorted(out, key=lambda x: x["date"], reverse=True)
frappe.response["message"] = out
`;

// A manager marks one of those days Present or Absent. Only the person's manager may, never for themselves, only for
// a finished day without attendance. The person is notified.
const TEAM_ATTENDANCE_DECIDE_API = `
user = frappe.session.user
emp_id = frappe.form_dict.get("employee")
day = str(frappe.form_dict.get("date") or "")
status = frappe.form_dict.get("status")
if status not in ("Present", "Absent"):
    frappe.throw("Choose Present or Absent.")
me = frappe.db.get_value("Employee", {"user_id": user, "status": "Active"}, "name")
emp = frappe.db.get_value("Employee", emp_id, ["reports_to", "leave_approver", "user_id", "company", "employee_name"], as_dict=True)
if not emp or not ((me and emp.reports_to == me) or emp.leave_approver == user):
    frappe.throw("Only this person's manager can decide their attendance here.")
if emp.user_id == user:
    frappe.throw("You can't decide your own attendance.")
if not day or day >= frappe.utils.nowdate():
    frappe.throw("Only a finished day can be decided.")
if frappe.db.exists("Attendance", {"employee": emp_id, "attendance_date": day, "docstatus": ["<", 2]}):
    frappe.throw("Attendance for this day is already marked.")
data = {"doctype": "Attendance", "employee": emp_id, "attendance_date": day, "status": status, "company": emp.company}
if status == "Present":
    rows = frappe.get_all("Employee Checkin", filters={"employee": emp_id, "time": ["between", [day + " 00:00:00", day + " 23:59:59"]]}, fields=["time", "log_type"], order_by="time asc")
    hours = 0
    open_in = None
    for r in rows:
        if r.log_type == "IN":
            if not open_in:
                open_in = r.time
        elif r.log_type == "OUT" and open_in:
            hours += frappe.utils.time_diff_in_hours(r.time, open_in)
            open_in = None
    ins = [r.time for r in rows if r.log_type == "IN"]
    outs = [r.time for r in rows if r.log_type == "OUT"]
    data["working_hours"] = round(hours, 2)
    if ins:
        data["in_time"] = min(ins)
    if outs:
        data["out_time"] = max(outs)
att = frappe.get_doc(data)
att.insert(ignore_permissions=True)
att.flags.ignore_permissions = True
att.submit()
frappe.get_doc({"doctype": "Comment", "comment_type": "Info", "reference_doctype": "Attendance", "reference_name": att.name, "content": "Marked " + status + " by their manager " + user}).insert(ignore_permissions=True)
if emp.user_id:
    frappe.get_doc({"doctype": "Notification Log", "for_user": emp.user_id, "type": "Alert", "subject": "Your manager marked your attendance on " + frappe.utils.formatdate(day) + " as " + status + ".", "document_type": "Attendance", "document_name": att.name}).insert(ignore_permissions=True)
frappe.response["message"] = {"name": att.name, "status": status}
`;

export const ATTENDANCE_FIELDS = [
  { dt: "Attendance Request", fieldname: "custom_approver", label: "Approver", fieldtype: "Link", options: "User", insert_after: "employee_name" },
  { dt: "Attendance Request", fieldname: "custom_decision", label: "Decision", fieldtype: "Select", options: "\nRejected", read_only: 1, insert_after: "custom_approver" },
  { dt: "Attendance Request", fieldname: "custom_decision_note", label: "Decision Note", fieldtype: "Small Text", read_only: 1, insert_after: "custom_decision" },
];

// Saved attendance (submitted or cancelled history) can't be deleted; HR corrects a day with Edit, which cancels the
// record and saves an amended copy, so every change stays visible. Drafts can still be deleted.
const ATTENDANCE_NO_DELETE = `
if frappe.session.user != "Administrator" and doc.docstatus != 0:
    frappe.throw("Saved attendance can't be deleted. Use Edit on the Attendance page to correct the day - the previous entry is kept in the history.")
`;

export const ATTENDANCE_SCRIPTS = [
  { name: "ETHX - Attendance can't be deleted", script_type: "DocType Event", reference_doctype: "Attendance", doctype_event: "Before Delete", script: ATTENDANCE_NO_DELETE, what: "Saved attendance can't be deleted (only corrected with Edit, which keeps the history)" },
  { name: "ETHX - Attendance request approver", script_type: "DocType Event", reference_doctype: "Attendance Request", doctype_event: "Before Insert", script: ATTENDANCE_REQUEST_ASSIGN, what: "Attendance requests go to the employee's leave approver (else their manager)" },
  { name: "ETHX - Attendance requests for me", script_type: "API", api_method: "ethx_attendance_requests", script: ATTENDANCE_REQUESTS_API, what: "Approvers see the attendance requests waiting for them" },
  { name: "ETHX - Attendance request decision", script_type: "API", api_method: "ethx_attendance_decision", script: ATTENDANCE_DECISION_API, what: "Only the assigned approver or HR approves or rejects an attendance request" },
  { name: "ETHX - Punch reminders", script_type: "Scheduler Event", event_frequency: "Hourly", script: PUNCH_REMINDERS, what: "Employees are notified when they haven't punched in or out on time" },
  { name: "ETHX - Attendance by manager", script_type: "DocType Event", reference_doctype: "Attendance", doctype_event: "Before Validate", script: ATTENDANCE_GUARD, what: "Nobody marks their own attendance; HR staff's attendance is decided by their manager" },
  { name: "ETHX - Attendance by manager (cancel)", script_type: "DocType Event", reference_doctype: "Attendance", doctype_event: "Before Cancel", script: ATTENDANCE_GUARD, what: "Nobody cancels their own attendance; HR staff's is cancelled by their manager" },
  { name: "ETHX - Team attendance to decide", script_type: "API", api_method: "ethx_team_attendance", script: TEAM_ATTENDANCE_API, what: `Managers see their team's days under ${FULL_DAY_HOURS} hours or without a punch out` },
  { name: "ETHX - Team attendance decision", script_type: "API", api_method: "ethx_team_attendance_decide", script: TEAM_ATTENDANCE_DECIDE_API, what: "Only a person's manager marks those days Present or Absent, never their own" },
  { name: "ETHX - Attendance from punches", script_type: "Scheduler Event", event_frequency: "Daily", script: MARK_FROM_PUNCHES, what: `Every night, days with ${FULL_DAY_HOURS} or more hours punched are marked Present; shorter days are left for a correction` },
];
