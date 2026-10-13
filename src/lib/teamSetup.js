// Manager self-service: employee logins are restricted to their own Employee record, so a line manager can't read
// their team directly. These server methods return only the manager's own team (employees whose Reports To is the
// manager, or whose Leave Approver is the manager) and let them decide only those leave applications.
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
if ids:
    seen = []
    for a in apps:
        seen.append(a.name)
    for a in frappe.get_all("Leave Application", filters={"docstatus": 0, "status": "Open", "employee": ["in", ids]}, fields=["name", "employee", "employee_name", "leave_type", "from_date", "to_date", "total_leave_days", "half_day", "description", "posting_date"], order_by="from_date asc"):
        if a.name not in seen:
            apps.append(a)
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
me = frappe.db.get_value("Employee", {"user_id": user}, "name")
owner_user = frappe.db.get_value("Employee", doc.employee, "user_id")
if owner_user == user:
    frappe.throw("You can't decide on your own leave.")
manager = frappe.db.get_value("Employee", doc.employee, "reports_to")
if doc.leave_approver != user and not (me and manager == me):
    frappe.throw("You're not this employee's manager or leave approver.")
doc.status = "Approved" if status == "Approved" else "Rejected"
if not doc.leave_approver:
    doc.leave_approver = user
doc.flags.ignore_permissions = True
doc.submit()
frappe.get_doc({"doctype": "Comment", "comment_type": "Info", "reference_doctype": "Leave Application", "reference_name": name, "content": "Leave " + status.lower() + " by manager " + user + (": " + note if note else "")}).insert(ignore_permissions=True)
frappe.response["message"] = {"status": doc.status}
`;

export const TEAM_SCRIPTS = [
  { name: "ETHX - My team", script_type: "API", api_method: "ethx_my_team", script: TEAM_API, what: "Managers see their direct reports, who's in today, upcoming leave and leave waiting for them" },
  { name: "ETHX - Team leave decision", script_type: "API", api_method: "ethx_team_leave_decision", script: LEAVE_DECISION_API, what: "Managers approve / reject leave only for their own reports (or where they're the leave approver), never their own" },
];
