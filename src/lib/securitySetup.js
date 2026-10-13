// Security & audit: server-side employee logins (so HR no longer needs rights over Users and User Permissions),
// restricted salary / bank fields on Employee, and change history on the records the Audit Log page reports on.
export const SECURITY_FIELDS = [];

// Change history for the Audit Log page.
export const SECURITY_TRACK = ["Employee", "User", "User Permission", "Leave Application", "Expense Claim", "Attendance", "Salary Structure Assignment"];

// Salary and bank details on Employee move to permission level 1: only roles granted level-1 access (HR, via the
// Roles & Permissions preset) can read or change them. Employees and project managers no longer see them.
const SENSITIVE = ["ctc", "salary_currency", "salary_mode", "bank_name", "bank_ac_no", "iban"];
export const SECURITY_PROPERTIES = SENSITIVE.map((f) => ({ doc_type: "Employee", field_name: f, property: "permlevel", property_type: "Int", value: 1, what: `Employee › ${f.replace(/_/g, " ")} restricted to HR` }));

const ROLE_CHECK = `
user = frappe.session.user
roles = frappe.get_all("Has Role", filters={"parent": user, "parenttype": "User"}, pluck="role")
if user != "Administrator" and not ("HR Manager" in roles or "HR User" in roles or "System Manager" in roles):
    frappe.throw("Only HR can manage employee logins.")
`;

// The only roles an employee login may hold; anything else (HR, admin, PM) can't be touched through this method.
const LOGIN_API = `${ROLE_CHECK}
args = frappe.form_dict
employee = args.get("employee")
email = (args.get("email") or "").strip().lower()
password = args.get("password") or ""
mode = args.get("mode") or "create"
safe_roles = ["Employee", "Interviewer", "Desk User", "All", "Guest", "Employee Self Service"]
if len(password) < 8:
    frappe.throw("The temporary password must be at least 8 characters.")
emp = frappe.get_doc("Employee", employee)
if mode == "reset":
    email = emp.user_id
    if not email:
        frappe.throw("This employee has no login yet.")
if not email or "@" not in email:
    frappe.throw("Enter a valid email address.")
other = frappe.db.get_value("Employee", {"user_id": email, "name": ["!=", employee]}, "name")
if other:
    frappe.throw("That email is already the login of employee " + other + ".")
exists = frappe.db.exists("User", email)
if exists:
    held = frappe.get_all("Has Role", filters={"parent": email, "parenttype": "User"}, pluck="role")
    for r in held:
        if r not in safe_roles:
            frappe.throw("That email belongs to an account with the " + r + " role. HR can only manage plain employee logins - ask the Administrator.")
    u = frappe.get_doc("User", email)
    u.new_password = password
    u.enabled = 1
else:
    if mode == "reset":
        frappe.throw("The employee's login no longer exists.")
    parts = (emp.employee_name or emp.first_name or email).split(" ")
    u = frappe.get_doc({"doctype": "User", "email": email, "first_name": parts[0], "last_name": " ".join(parts[1:]) or None, "user_type": "System User", "send_welcome_email": 0, "enabled": 1, "new_password": password})
u.flags.ignore_permissions = True
if exists:
    u.save()
else:
    u.insert()
# Link first: ERPNext strips the Employee role from users that aren't linked to an Employee record.
if emp.user_id != email:
    frappe.db.set_value("Employee", employee, "user_id", email)
u = frappe.get_doc("User", email)
has_emp = False
for r in u.roles:
    if r.role == "Employee":
        has_emp = True
if not has_emp:
    u.append("roles", {"role": "Employee"})
    u.flags.ignore_permissions = True
    u.save()
frappe.db.set_value("User", email, "last_password_reset_date", None)
for allow, value in (("Employee", employee), ("Company", emp.company)):
    if value and not frappe.db.exists("User Permission", {"user": email, "allow": allow, "for_value": value}):
        frappe.get_doc({"doctype": "User Permission", "user": email, "allow": allow, "for_value": value, "apply_to_all_doctypes": 1}).insert(ignore_permissions=True)
frappe.get_doc({"doctype": "Comment", "comment_type": "Info", "reference_doctype": "Employee", "reference_name": employee, "content": ("Portal password reset" if mode == "reset" else "Portal login created: " + email) + " by " + frappe.session.user}).insert(ignore_permissions=True)
frappe.response["message"] = {"email": email, "restricted": True}
`;

const DISABLE_API = `${ROLE_CHECK}
args = frappe.form_dict
employee = args.get("employee")
enable = frappe.utils.cint(args.get("enable"))
email = frappe.db.get_value("Employee", employee, "user_id")
if not email:
    frappe.throw("This employee has no login.")
held = frappe.get_all("Has Role", filters={"parent": email, "parenttype": "User"}, pluck="role")
for r in held:
    if r not in ["Employee", "Interviewer", "Desk User", "All", "Guest", "Employee Self Service"]:
        frappe.throw("This login has the " + r + " role - only the Administrator can change it.")
frappe.db.set_value("User", email, "enabled", enable)
frappe.get_doc({"doctype": "Comment", "comment_type": "Info", "reference_doctype": "Employee", "reference_name": employee, "content": ("Portal login enabled" if enable else "Portal login disabled") + " by " + frappe.session.user}).insert(ignore_permissions=True)
frappe.response["message"] = {"enabled": enable}
`;

export const SECURITY_SCRIPTS = [
  { name: "ETHX - Employee login", script_type: "API", api_method: "ethx_employee_login", script: LOGIN_API, what: "HR creates / resets employee logins server-side - only plain employee accounts, always restricted to their own record and company" },
  { name: "ETHX - Employee login access", script_type: "API", api_method: "ethx_employee_login_access", script: DISABLE_API, what: "HR enables / disables employee logins (never HR or admin accounts)" },
];

// Recruitment: putting someone on an interview panel gives them HRMS's Interviewer role (only that role).
const INTERVIEWER_API = `${ROLE_CHECK}
email = frappe.form_dict.get("user")
if not frappe.db.exists("User", email):
    frappe.throw("User not found.")
held = frappe.get_all("Has Role", filters={"parent": email, "parenttype": "User"}, pluck="role")
if "Interviewer" not in held:
    u = frappe.get_doc("User", email)
    u.append("roles", {"role": "Interviewer"})
    u.flags.ignore_permissions = True
    u.save()
frappe.response["message"] = {"user": email}
`;

SECURITY_SCRIPTS.push({ name: "ETHX - Add interviewer", script_type: "API", api_method: "ethx_add_interviewer", script: INTERVIEWER_API, what: "Adds only the Interviewer role when HR puts someone on an interview panel" });

/** True once the server-side login methods are installed - HR then no longer needs rights over Users. */
export async function serverLoginsReady(frappe) {
  try {
    const rows = await frappe.getList("Server Script", { filters: [["name", "=", "ETHX - Employee login"], ["disabled", "=", 0]], fields: ["name"], limit: 1 });
    return rows.length > 0;
  } catch {
    return false;
  }
}
