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

export const ATTENDANCE_SCRIPTS = [
  { name: "ETHX - Punch reminders", script_type: "Scheduler Event", event_frequency: "Hourly", script: PUNCH_REMINDERS, what: "Employees are notified when they haven't punched in or out on time" },
  { name: "ETHX - Attendance from punches", script_type: "Scheduler Event", event_frequency: "Daily", script: MARK_FROM_PUNCHES, what: `Every night, days with punches but no attendance are marked Present (Half Day under ${HALF_DAY_HOURS} h)` },
];
