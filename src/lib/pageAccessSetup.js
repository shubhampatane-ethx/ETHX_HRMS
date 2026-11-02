// Page access per person (installed from Admin › ERPNext Setup). The Administrator gives anyone any role and ticks the pages
// they may open; what's stored is the list of blocked pages. Everyone's own User record is editable by them, so the fields are
// at permission level 1 and only these methods read or change them.
//
// RestrictedPython notes: no imports, no str.format, no frappe.get_roles.

export const PAGE_ACCESS_FIELDS = [
  { dt: "User", fieldname: "custom_denied_pages", label: "Blocked Pages", fieldtype: "Small Text", hidden: 1, read_only: 1, no_copy: 1, permlevel: 1, insert_after: "enabled" },
  { dt: "User", fieldname: "custom_keep_employee_role", label: "Keep Employee Role", fieldtype: "Check", hidden: 1, read_only: 1, no_copy: 1, permlevel: 1, insert_after: "custom_denied_pages" },
];

const ADMIN_ONLY = `
caller = frappe.session.user
caller_roles = frappe.get_all("Has Role", filters={"parent": caller, "parenttype": "User"}, pluck="role")
if caller != "Administrator" and "System Manager" not in caller_roles:
    frappe.throw("Only the Administrator can manage page access.")
`;

const MY_ACCESS_API = `
raw = frappe.db.get_value("User", frappe.session.user, "custom_denied_pages")
frappe.response["message"] = frappe.parse_json(raw) if raw else []
`;

const LIST_API = `${ADMIN_ONLY.trim()}
out = []
for u in frappe.get_all("User", filters={"enabled": 1, "user_type": "System User", "name": ["not in", ["Administrator", "Guest"]]}, fields=["name", "full_name", "custom_denied_pages"], order_by="full_name asc"):
    held = frappe.get_all("Has Role", filters={"parent": u.name, "parenttype": "User"}, pluck="role")
    # Admins are never limited, so nobody can lock themselves out of this screen.
    if "System Manager" in held:
        continue
    out.append({"email": u.name, "name": u.full_name or u.name, "roles": held, "denied": frappe.parse_json(u.custom_denied_pages) if u.custom_denied_pages else []})
frappe.response["message"] = out
`;

const SET_API = `${ADMIN_ONLY.trim()}
args = frappe.form_dict
email = args.get("user")
if not email or not frappe.db.exists("User", email):
    frappe.throw("User not found.")
denied = []
for page in frappe.parse_json(args.get("denied") or "[]"):
    if not str(page).startswith("/"):
        frappe.throw("Unknown page.")
    denied.append(str(page))
held = frappe.get_all("Has Role", filters={"parent": email, "parenttype": "User"}, pluck="role")
if "System Manager" in held:
    frappe.throw("Administrators aren't managed here.")
assignable = ["HR Manager", "HR User", "Projects Manager", "Employee", "Contractor", "Interviewer", "Leave Approver", "Expense Approver"]
wanted = []
for role in frappe.parse_json(args.get("roles") or "[]"):
    if role not in assignable:
        frappe.throw("That role can't be given here: " + str(role))
    wanted.append(role)
u = frappe.get_doc("User", email)
keep = []
kept = []
for r in u.roles:
    if r.role in assignable and r.role not in wanted:
        continue
    keep.append(r)
    kept.append(r.role)
changed = len(keep) != len(u.roles)
u.roles = keep
for role in wanted:
    if role not in kept:
        u.append("roles", {"role": role})
        changed = True
if changed:
    u.flags.ignore_permissions = True
    u.save()
    # An employee sees only their own record. HR and Project Managers work with everyone's, so that limit follows the role.
    own = frappe.db.get_value("Employee", {"user_id": email}, "name")
    wide = "HR Manager" in wanted or "HR User" in wanted or "Projects Manager" in wanted
    if wide:
        for up in frappe.get_all("User Permission", filters={"user": email, "allow": "Employee"}, pluck="name"):
            frappe.delete_doc("User Permission", up, ignore_permissions=True)
    elif own and not frappe.db.exists("User Permission", {"user": email, "allow": "Employee", "for_value": own}):
        frappe.get_doc({"doctype": "User Permission", "user": email, "allow": "Employee", "for_value": own, "apply_to_all_doctypes": 1}).insert(ignore_permissions=True)
# ERPNext adds the Employee role whenever an Employee record is saved; a contractor keeps it only when it was given here.
frappe.db.set_value("User", email, "custom_keep_employee_role", 1 if "Employee" in wanted and "Contractor" in wanted else 0)
frappe.db.set_value("User", email, "custom_denied_pages", json.dumps(denied) if denied else None)
now_held = frappe.get_all("Has Role", filters={"parent": email, "parenttype": "User"}, pluck="role")
frappe.get_doc({"doctype": "Comment", "comment_type": "Info", "reference_doctype": "User", "reference_name": email, "content": "Access changed by " + caller + ": roles " + (", ".join(wanted) or "none") + "; " + str(len(denied)) + " page(s) blocked"}).insert(ignore_permissions=True)
frappe.response["message"] = {"user": email, "denied": denied, "roles": now_held}
`;

export const PAGE_ACCESS_SCRIPTS = [
  { name: "ETHX - My page access", script_type: "API", api_method: "ethx_my_page_access", script: MY_ACCESS_API, what: "Each person's blocked pages are applied when they sign in" },
  { name: "ETHX - Page access list", script_type: "API", api_method: "ethx_page_access_list", script: LIST_API, what: "The Administrator sees everyone's page access" },
  { name: "ETHX - Set page access", script_type: "API", api_method: "ethx_set_page_access", script: SET_API, what: "Only the Administrator changes a person's roles and page access" },
];
