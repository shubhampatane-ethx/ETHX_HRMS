// Attendance from punches (installed from Admin › ERPNext Setup). Employees punch in / out as Employee Checkins;
// ERPNext only turns those into Attendance when a Shift Type has auto-attendance configured. This daily job marks
// every day of the last week that has punches but no attendance yet:
//   - Half Day when the first-in to last-out time is under HALF_DAY_HOURS, otherwise Present;
//   - days that already have attendance (marked by HR, or On Leave from an approved leave) are left alone.
// HR can still change any record on the Attendance page.

export const HALF_DAY_HOURS = 4;

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
        ins = [r.time for r in rows if r.log_type != "OUT"]
        outs = [r.time for r in rows if r.log_type == "OUT"]
        status = "Present"
        hours = 0
        if ins and outs and max(outs) > min(ins):
            hours = frappe.utils.time_diff_in_hours(max(outs), min(ins))
            if hours < ${HALF_DAY_HOURS}:
                status = "Half Day"
        att = frappe.get_doc({"doctype": "Attendance", "employee": emp, "attendance_date": day, "status": status, "company": info.company, "working_hours": hours, "in_time": min(ins) if ins else None, "out_time": max(outs) if outs else None})
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
// them (the request is submitted and HRMS marks the days) or rejects them with a reason.
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
if doc.get("custom_approver") != user:
    frappe.throw("Only the assigned approver can approve or reject this request.")
if status == "Approved":
    doc.flags.ignore_permissions = True
    doc.submit()
else:
    frappe.db.set_value("Attendance Request", name, {"custom_decision": "Rejected", "custom_decision_note": note})
frappe.get_doc({"doctype": "Comment", "comment_type": "Info", "reference_doctype": "Attendance Request", "reference_name": name, "content": "Attendance request " + status.lower() + " by " + user + (": " + note if note else "")}).insert(ignore_permissions=True)
if owner:
    frappe.get_doc({"doctype": "Notification Log", "for_user": owner, "type": "Alert", "subject": "Your attendance request was " + status.lower() + (": " + note if note else "."), "document_type": "Attendance Request", "document_name": name}).insert(ignore_permissions=True)
frappe.response["message"] = {"status": status}
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
  { name: "ETHX - Attendance request decision", script_type: "API", api_method: "ethx_attendance_decision", script: ATTENDANCE_DECISION_API, what: "Only the assigned approver approves or rejects an attendance request" },
  { name: "ETHX - Punch reminders", script_type: "Scheduler Event", event_frequency: "Hourly", script: PUNCH_REMINDERS, what: "Employees are notified when they haven't punched in or out on time" },
  { name: "ETHX - Attendance from punches", script_type: "Scheduler Event", event_frequency: "Daily", script: MARK_FROM_PUNCHES, what: `Every night, days with punches but no attendance are marked Present (Half Day under ${HALF_DAY_HOURS} h)` },
];
