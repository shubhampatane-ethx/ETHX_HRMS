// Contractors (installed from Admin › ERPNext Setup): people who work on projects but aren't staff.
//  - HR creates them from the Employees page. A contractor is an Employee record marked custom_is_contractor, so the
//    Administrator and Project Managers assign them a role on a project exactly as they do for employees.
//  - Their login holds only the "Contractor" role: they see only the projects they are assigned to, and log time only on those.
//  - When the Administrator ends a project, contractors with no other live project are removed: their login and personal
//    details are deleted; their timesheets stay, with just their name. Removal happens only through that explicit
//    action: ERPNext can mark a project Completed by itself when all its tasks finish, and that must never delete people.
//
// RestrictedPython notes: no imports, no str.format, no frappe.get_roles; comprehensions can't see local variables.

export const CONTRACTOR_ROLE = "Contractor";

export const CONTRACTOR_RECORDS = [
  { doctype: "Role", name: CONTRACTOR_ROLE, what: "Contractor role", doc: { role_name: CONTRACTOR_ROLE, desk_access: 1 } },
];

// Everything a contractor reads or writes. System Setup grants these itself; Roles & Permissions shows them too.
export const CONTRACTOR_PRESET = [
  { doctype: "Project", perms: ["read"], why: "Their own projects (limited by a server rule)" },
  { doctype: "Task", perms: ["read"], why: "Their role on each project" },
  { doctype: "Timesheet", perms: ["read", "write", "create", "delete", "submit"], why: "Create and submit their own timesheet" },
  { doctype: "Employee", perms: ["read"], why: "Their own record, which timesheets link to" },
  { doctype: "Company", perms: ["read"], why: "Company on the timesheet" },
  { doctype: "Holiday List", perms: ["read"], why: "Days off when filling a timesheet" },
  { doctype: "Activity Type", perms: ["read"], why: "Timesheet details" },
  { doctype: "Comment", perms: ["read"], why: "Why a timesheet was returned" },
];

export const CONTRACTOR_PERMISSIONS = [{ role: CONTRACTOR_ROLE, what: "Contractor permissions", preset: CONTRACTOR_PRESET }];

export const CONTRACTOR_FIELDS = [
  { dt: "Employee", fieldname: "custom_is_contractor", label: "Project Contractor", fieldtype: "Check", read_only: 1, no_copy: 1, insert_after: "status" },
  { dt: "Employee", fieldname: "custom_contractor_removed", label: "Contractor Removed", fieldtype: "Check", read_only: 1, no_copy: 1, insert_after: "custom_is_contractor" },
];

const HELD = `
user = frappe.session.user
held = frappe.get_all("Has Role", filters={"parent": user, "parenttype": "User"}, pluck="role")
is_admin = user == "Administrator" or "System Manager" in held
sees_all = is_admin or "HR Manager" in held or "HR User" in held
`;

const ADD_API = `${HELD.trim()}
if not sees_all:
    frappe.throw("Only HR or the Administrator can create contractors.")
args = frappe.form_dict
email = (args.get("email") or "").strip().lower()
full_name = (args.get("full_name") or "").strip()
password = args.get("password") or ""
company = args.get("company")
joining = args.get("joining") or frappe.utils.nowdate()
branch = args.get("branch") or None
if not full_name:
    frappe.throw("Enter the contractor's name.")
if not company or not frappe.db.exists("Company", company):
    frappe.throw("Choose a company.")
if "@" not in email or "." not in email or " " in email:
    frappe.throw("Enter a valid email address.")
if len(password) < 8:
    frappe.throw("The temporary password must be at least 8 characters.")
if frappe.db.exists("User", email) or frappe.db.get_value("Employee", {"user_id": email}, "name"):
    frappe.throw("That email already has a login. Use a different email for this contractor.")
parts = full_name.split(" ")
gender = "Prefer not to say"
if not frappe.db.exists("Gender", gender):
    genders = frappe.get_all("Gender", pluck="name", limit=1)
    gender = genders[0] if genders else None
# ERPNext requires gender and date of birth on Employee. Contractors keep only work information, so these are placeholders.
emp = frappe.get_doc({"doctype": "Employee", "first_name": parts[0], "last_name": " ".join(parts[1:]) or None, "gender": gender, "date_of_birth": "1990-01-01", "date_of_joining": joining, "company": company, "branch": branch, "status": "Active", "employment_type": "Contract" if frappe.db.exists("Employment Type", "Contract") else None, "custom_is_contractor": 1})
emp.insert(ignore_permissions=True)
u = frappe.get_doc({"doctype": "User", "email": email, "first_name": parts[0], "last_name": " ".join(parts[1:]) or None, "user_type": "System User", "send_welcome_email": 0, "new_password": password, "roles": [{"role": "${CONTRACTOR_ROLE}"}]})
u.flags.ignore_permissions = True
u.insert()
# Set directly: saving the Employee would make ERPNext add the Employee role to the login.
frappe.db.set_value("Employee", emp.name, "user_id", email)
frappe.db.set_value("User", email, "last_password_reset_date", None)
for allow, value in (("Employee", emp.name), ("Company", company)):
    frappe.get_doc({"doctype": "User Permission", "user": email, "allow": allow, "for_value": value, "apply_to_all_doctypes": 1}).insert(ignore_permissions=True)
frappe.response["message"] = {"employee": emp.name, "name": emp.employee_name, "email": email}
`;

// HR can now edit contractors like employees, and ERPNext adds the Employee role to the login whenever an
// Employee record is saved. This keeps a contractor's login limited to the Contractor role, unless the Administrator
// gave them the Employee role in Access Control.
const STAYS_CONTRACTOR = `
if doc.get("custom_is_contractor") and doc.user_id:
    held = frappe.get_all("Has Role", filters={"parent": doc.user_id, "parenttype": "User"}, pluck="role")
    if "Employee" in held and "${CONTRACTOR_ROLE}" in held and not frappe.db.get_value("User", doc.user_id, "custom_keep_employee_role"):
        u = frappe.get_doc("User", doc.user_id)
        u.roles = [r for r in u.roles if r.role != "Employee"]
        u.flags.ignore_permissions = True
        u.save()
`;

const END_PROJECT_API = `${HELD.trim()}
if not sees_all:
    frappe.throw("Only HR or the Administrator can end a project.")
args = frappe.form_dict
project = args.get("project")
preview = frappe.utils.cint(args.get("preview"))
if not project or not frappe.db.exists("Project", project):
    frappe.throw("Project not found.")
tasks = frappe.get_all("Task", filters={"project": project}, pluck="name")
emails = []
if tasks:
    for t in frappe.get_all("ToDo", filters={"reference_type": "Task", "reference_name": ["in", tasks]}, pluck="allocated_to"):
        if t and t not in emails:
            emails.append(t)
remove = []
kept = []
for email in emails:
    emp = frappe.db.get_value("Employee", {"user_id": email, "custom_is_contractor": 1}, ["name", "employee_name"], as_dict=True)
    if not emp:
        continue
    # The Administrator took them off the Contractor role, so they stay when the project ends.
    if "${CONTRACTOR_ROLE}" not in frappe.get_all("Has Role", filters={"parent": email, "parenttype": "User"}, pluck="role"):
        continue
    theirs = frappe.get_all("ToDo", filters={"reference_type": "Task", "allocated_to": email}, pluck="reference_name")
    busy = False
    if theirs:
        for p in frappe.get_all("Task", filters={"name": ["in", theirs], "project": ["!=", project], "status": ["not in", ["Completed", "Cancelled"]]}, pluck="project"):
            if p and frappe.db.get_value("Project", p, "status") not in ("Completed", "Cancelled"):
                busy = True
    entry = {"employee": emp.name, "name": emp.employee_name, "email": email, "tasks": theirs, "unsubmitted": frappe.db.count("Timesheet", {"employee": emp.name, "docstatus": 0})}
    if busy:
        kept.append(entry)
    else:
        remove.append(entry)
if not preview:
    frappe.db.set_value("Project", project, {"status": "Completed", "is_active": "No"})
    for c in remove:
        for t in c["tasks"]:
            desc = frappe.db.get_value("Task", t, "description")
            if desc and c["email"] in desc:
                frappe.db.set_value("Task", t, "description", desc.replace(c["email"], c["name"]))
            if frappe.db.get_value("Task", t, "status") not in ("Completed", "Cancelled"):
                frappe.db.set_value("Task", t, "status", "Completed")
        for td in frappe.get_all("ToDo", filters={"allocated_to": c["email"]}, pluck="name"):
            frappe.delete_doc("ToDo", td, ignore_permissions=True)
        for t in c["tasks"]:
            frappe.db.set_value("Task", t, "_assign", None)
        for up in frappe.get_all("User Permission", filters={"user": c["email"]}, pluck="name"):
            frappe.delete_doc("User Permission", up, ignore_permissions=True)
        sheets = frappe.get_all("Timesheet", filters={"employee": c["employee"]}, pluck="name")
        frappe.db.set_value("Employee", c["employee"], "user_id", None)
        if frappe.get_meta("Timesheet").has_field("user"):
            for s in sheets:
                frappe.db.set_value("Timesheet", s, "user", None, update_modified=False)
        frappe.delete_doc("User", c["email"], ignore_permissions=True, force=True)
        if sheets:
            frappe.db.set_value("Employee", c["employee"], {"personal_email": None, "company_email": None, "prefered_email": None, "cell_number": None, "current_address": None, "permanent_address": None, "person_to_be_contacted": None, "emergency_phone_number": None, "relation": None, "image": None, "status": "Left", "relieving_date": frappe.utils.nowdate(), "custom_contractor_removed": 1})
        else:
            frappe.delete_doc("Employee", c["employee"], ignore_permissions=True, force=True)
    names = []
    for c in remove:
        names.append(c["name"])
    frappe.get_doc({"doctype": "Comment", "comment_type": "Info", "reference_doctype": "Project", "reference_name": project, "content": "Project ended by " + user + ". Contractors removed: " + (", ".join(names) or "none")}).insert(ignore_permissions=True)
frappe.response["message"] = {"remove": remove, "kept": kept}
`;

// A contractor logs time only on projects they are assigned to.
const TIMESHEET_GUARD = `
user = frappe.session.user
held = frappe.get_all("Has Role", filters={"parent": user, "parenttype": "User"}, pluck="role")
if "${CONTRACTOR_ROLE}" in held and "Projects Manager" not in held and "HR Manager" not in held and "HR User" not in held and "System Manager" not in held:
    theirs = frappe.get_all("ToDo", filters={"reference_type": "Task", "allocated_to": user}, pluck="reference_name")
    allowed = frappe.get_all("Task", filters={"name": ["in", theirs]}, pluck="project") if theirs else []
    for log in doc.time_logs or []:
        if not log.project or log.project not in allowed:
            frappe.throw("You can only log time on projects you are assigned to.")
`;

export const CONTRACTOR_SCRIPTS = [
  { name: "ETHX - Add contractor", script_type: "API", api_method: "ethx_add_contractor", script: ADD_API, what: "HR and the Administrator create contractors" },
  { name: "ETHX - Contractor stays contractor", script_type: "DocType Event", reference_doctype: "Employee", doctype_event: "After Save", script: STAYS_CONTRACTOR, what: "Editing a contractor keeps their login limited to the roles the Administrator gave them" },
  { name: "ETHX - End project", script_type: "API", api_method: "ethx_end_project", script: END_PROJECT_API, what: "The Administrator ends a project; its contractors' logins and details are deleted" },
  { name: "ETHX - Contractor timesheets", script_type: "DocType Event", reference_doctype: "Timesheet", doctype_event: "Before Validate", script: TIMESHEET_GUARD, what: "Contractors log time only on their own projects" },
];

// Rules from the earlier design, removed from the site by System Setup: contractors now show up like employees.
export const CONTRACTOR_RETIRED_SCRIPTS = ["ETHX - Hide contractors from staff", "ETHX - List contractors"];
