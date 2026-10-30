// Contractors (installed from Admin › ERPNext Setup): people who exist only for a project.
//  - A contractor is an Employee record marked custom_is_contractor (timesheets must link to one) with a login that holds
//    only the "Contractor" role. The record is hidden from every staff list, so headcount, leave and attendance ignore it.
//  - They see only the projects they are assigned to, and log time only on those.
//  - When the Administrator ends a project, contractors with no other live project are removed: their login and personal
//    details are deleted; their timesheets stay, with just their name. Removal happens only through that explicit
//    action: ERPNext can mark a project Completed by itself when all its tasks finish, and that must never delete people.
//
// RestrictedPython notes: no imports, no str.format, no frappe.get_roles; comprehensions can't see local variables.

export const CONTRACTOR_ROLE = "Contractor";

export const CONTRACTOR_RECORDS = [
  { doctype: "Role", name: CONTRACTOR_ROLE, what: "Contractor role", doc: { role_name: CONTRACTOR_ROLE, desk_access: 1 } },
];

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
args = frappe.form_dict
project = args.get("project")
email = (args.get("email") or "").strip().lower()
full_name = (args.get("full_name") or "").strip()
password = args.get("password") or ""
if not project:
    frappe.throw("Choose a project.")
row = frappe.db.get_value("Project", project, ["custom_project_manager", "owner", "company", "status"], as_dict=True)
if not row:
    frappe.throw("Project not found.")
if not sees_all and (row.custom_project_manager or row.owner) != user:
    frappe.throw("Only the manager of this project, HR or the Administrator can add contractors to it.")
if row.status in ("Completed", "Cancelled"):
    frappe.throw("This project has ended.")
if "@" not in email or "." not in email or " " in email:
    frappe.throw("Enter a valid email address.")
existing = frappe.db.get_value("Employee", {"user_id": email}, ["name", "employee_name", "custom_is_contractor"], as_dict=True)
if existing:
    if not existing.custom_is_contractor:
        frappe.throw("That email belongs to an employee. Assign them to the project under Assignments instead.")
    frappe.response["message"] = {"employee": existing.name, "name": existing.employee_name, "email": email, "created": False}
else:
    if frappe.db.exists("User", email):
        frappe.throw("That email already has a login. Use a different email for this contractor.")
    if not full_name:
        frappe.throw("Enter the contractor's name.")
    if len(password) < 8:
        frappe.throw("The temporary password must be at least 8 characters.")
    if not row.company:
        frappe.throw("This project has no company.")
    parts = full_name.split(" ")
    gender = "Prefer not to say"
    if not frappe.db.exists("Gender", gender):
        genders = frappe.get_all("Gender", pluck="name", limit=1)
        gender = genders[0] if genders else None
    # ERPNext requires gender and date of birth on Employee. Contractors keep only project information, so these are placeholders.
    emp = frappe.get_doc({"doctype": "Employee", "first_name": parts[0], "last_name": " ".join(parts[1:]) or None, "gender": gender, "date_of_birth": "1990-01-01", "date_of_joining": frappe.utils.nowdate(), "company": row.company, "status": "Active", "custom_is_contractor": 1})
    emp.insert(ignore_permissions=True)
    u = frappe.get_doc({"doctype": "User", "email": email, "first_name": parts[0], "last_name": " ".join(parts[1:]) or None, "user_type": "System User", "send_welcome_email": 0, "new_password": password, "roles": [{"role": "${CONTRACTOR_ROLE}"}]})
    u.flags.ignore_permissions = True
    u.insert()
    # Set directly: saving the Employee would make ERPNext add the Employee role to the login.
    frappe.db.set_value("Employee", emp.name, "user_id", email)
    frappe.db.set_value("User", email, "last_password_reset_date", None)
    for allow, value in (("Employee", emp.name), ("Company", row.company)):
        frappe.get_doc({"doctype": "User Permission", "user": email, "allow": allow, "for_value": value, "apply_to_all_doctypes": 1}).insert(ignore_permissions=True)
    frappe.response["message"] = {"employee": emp.name, "name": emp.employee_name, "email": email, "created": True}
`;

const LIST_API = `${HELD.trim()}
if not sees_all and "Projects Manager" not in held:
    frappe.throw("Not permitted.")
allowed = None
if not sees_all:
    allowed = []
    managed = frappe.get_all("Project", filters={"custom_project_manager": user}, pluck="name")
    for p in frappe.get_all("Project", filters={"owner": user, "custom_project_manager": ["is", "not set"]}, pluck="name"):
        managed.append(p)
    tasks = frappe.get_all("Task", filters={"project": ["in", managed]}, pluck="name") if managed else []
    if tasks:
        allowed = frappe.get_all("ToDo", filters={"reference_type": "Task", "reference_name": ["in", tasks]}, pluck="allocated_to")
out = []
for e in frappe.get_all("Employee", filters={"custom_is_contractor": 1, "custom_contractor_removed": 0}, fields=["name", "employee_name", "user_id", "company"], order_by="employee_name asc"):
    if allowed is None or e.user_id in allowed:
        out.append(e)
frappe.response["message"] = out
`;

const END_PROJECT_API = `${HELD.trim()}
if not is_admin:
    frappe.throw("Only the Administrator can end a project.")
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

// Permission Query on Employee: contractors never appear in staff lists, for anyone. They can still read their own record.
const HIDE_FROM_STAFF = `
held = frappe.get_all("Has Role", filters={"parent": user, "parenttype": "User"}, pluck="role")
if "${CONTRACTOR_ROLE}" not in held and frappe.get_meta("Employee").has_field("custom_is_contractor"):
    conditions = "IFNULL(\`tabEmployee\`.\`custom_is_contractor\`, 0) = 0"
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
  { name: "ETHX - Add contractor", script_type: "API", api_method: "ethx_add_contractor", script: ADD_API, what: "Project managers, HR and the Administrator add contractors to a project" },
  { name: "ETHX - List contractors", script_type: "API", api_method: "ethx_contractors", script: LIST_API, what: "Lists contractors for the people who manage them" },
  { name: "ETHX - End project", script_type: "API", api_method: "ethx_end_project", script: END_PROJECT_API, what: "The Administrator ends a project; its contractors' logins and details are deleted" },
  { name: "ETHX - Hide contractors from staff", script_type: "Permission Query", reference_doctype: "Employee", script: HIDE_FROM_STAFF, what: "Contractors stay out of every staff list" },
  { name: "ETHX - Contractor timesheets", script_type: "DocType Event", reference_doctype: "Timesheet", doctype_event: "Before Validate", script: TIMESHEET_GUARD, what: "Contractors log time only on their own projects" },
];
