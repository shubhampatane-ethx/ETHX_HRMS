// Integrations (Admin › Integrations): what other systems need on the ERPNext side.
//  - INTEGRATION_ROLE: given to API users created for other systems (biometric devices, payroll or ERP tools). It
//    opens the biometric endpoint; anything else they read or write follows the roles the Administrator adds.
//  - ethx_biometric_punch: attendance devices (or their software) send punches here. Each punch names the person by
//    the Attendance Device ID on their employee record (or their employee ID), the time, and IN / OUT. Punches become
//    Employee Checkins, which the attendance rules then turn into attendance. Repeats are ignored, so a device can
//    safely resend.

export const INTEGRATION_ROLE = "HRMS 360 Integration";

export const INTEGRATION_RECORDS = [
  { doctype: "Role", name: INTEGRATION_ROLE, what: "Role for API users of other systems (biometric devices, payroll tools)", doc: { role_name: INTEGRATION_ROLE, desk_access: 0 } },
];

const BIOMETRIC_API = `
user = frappe.session.user
roles = frappe.get_all("Has Role", filters={"parent": user, "parenttype": "User"}, pluck="role")
if user != "Administrator" and "${INTEGRATION_ROLE}" not in roles and "System Manager" not in roles and "HR Manager" not in roles:
    frappe.throw("This account isn't allowed to send attendance punches.")
raw = frappe.form_dict.get("punches")
if raw is None:
    items = [frappe.form_dict]
elif isinstance(raw, str):
    items = json.loads(raw)
else:
    items = raw
if isinstance(items, dict):
    items = [items]
created = 0
duplicates = 0
unknown = []
failed = []
for item in items:
    ident = str(item.get("device_id") or item.get("employee") or item.get("user_id") or "").strip()
    when = str(item.get("timestamp") or item.get("time") or "").strip()
    if not ident or not when:
        failed.append({"punch": ident or when, "error": "Needs device_id (or employee) and timestamp"})
        continue
    emp = frappe.db.get_value("Employee", {"attendance_device_id": ident, "status": "Active"}, "name")
    if not emp and frappe.db.exists("Employee", {"name": ident, "status": "Active"}):
        emp = ident
    if not emp:
        if ident not in unknown:
            unknown.append(ident)
        continue
    try:
        moment = frappe.utils.get_datetime(when)
    except Exception:
        failed.append({"punch": ident, "error": "Unreadable time: " + when})
        continue
    kind = str(item.get("log_type") or item.get("type") or "").strip().upper()
    log_type = None
    if kind in ("IN", "0", "CHECKIN", "CHECK-IN"):
        log_type = "IN"
    elif kind in ("OUT", "1", "CHECKOUT", "CHECK-OUT"):
        log_type = "OUT"
    if frappe.db.exists("Employee Checkin", {"employee": emp, "time": moment}):
        duplicates += 1
        continue
    try:
        frappe.get_doc({"doctype": "Employee Checkin", "employee": emp, "time": moment, "log_type": log_type, "device_id": str(item.get("device") or ident)}).insert(ignore_permissions=True)
        created += 1
    except Exception as e:
        failed.append({"punch": ident, "error": str(e)})
frappe.response["message"] = {"received": len(items), "created": created, "duplicates": duplicates, "unknown": unknown, "failed": failed}
`;

export const INTEGRATION_SCRIPTS = [
  { name: "ETHX - Biometric punches", script_type: "API", api_method: "ethx_biometric_punch", script: BIOMETRIC_API, what: "Attendance devices send punches, which become employee check-ins" },
];
