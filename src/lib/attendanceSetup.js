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

export const ATTENDANCE_SCRIPTS = [
  { name: "ETHX - Attendance from punches", script_type: "Scheduler Event", event_frequency: "Daily", script: MARK_FROM_PUNCHES, what: `Every night, days with punches but no attendance are marked Present (Half Day under ${HALF_DAY_HOURS} h)` },
];
