// Project-based roles (installed from Admin › ERPNext Setup). Any employee can hold any role on a project:
//  - "ETHX Project Role" is the list of roles the company uses (Project Manager, Tech Lead, Developer...);
//  - a role marked "Manages the project" makes its holder the manager of that one project
//    (Project.custom_project_manager, which already decides who approves the project's timesheets);
//  - being a manager of a project gives the ERPNext "Projects Manager" role (needed for the workspace), and losing the
//    last project takes it away again, unless the Administrator gave that role directly;
//  - someone who is a manager only through their projects sees and changes only those projects and their assignments.
//
// RestrictedPython notes: no frappe.get_roles - roles are read from Has Role.

export const PROJECT_ROLE_DOCTYPE = "ETHX Project Role";

const perm = (role, write) => ({ role, read: 1, ...(write ? { write: 1, create: 1, delete: 1 } : {}) });

export const PROJECT_ROLE_DOCTYPES = [
  {
    name: PROJECT_ROLE_DOCTYPE,
    what: "List of roles employees can hold on a project",
    doc: {
      name: PROJECT_ROLE_DOCTYPE,
      module: "Custom",
      custom: 1,
      autoname: "field:role_name",
      naming_rule: "By fieldname",
      title_field: "role_name",
      track_changes: 1,
      fields: [
        { fieldname: "role_name", label: "Role Name", fieldtype: "Data", reqd: 1, unique: 1, in_list_view: 1 },
        { fieldname: "manages_project", label: "Manages the Project", fieldtype: "Check", in_list_view: 1, description: "The holder becomes the manager of that project: assigns its team and approves its timesheets" },
        { fieldname: "disabled", label: "Disabled", fieldtype: "Check", in_list_view: 1 },
        { fieldname: "description", label: "Description", fieldtype: "Small Text" },
      ],
      permissions: [perm("System Manager", true), perm("HR Manager", true), perm("HR User", true), perm("Projects Manager"), perm("Employee")],
    },
    seed: [
      { role_name: "Project Manager", manages_project: 1, description: "Runs the project: assigns its team and approves its timesheets" },
      ...["Tech Lead", "Senior Developer", "Developer", "Designer", "QA / Tester", "Business Analyst", "DevOps", "Support", "Project Coordinator"].map((role_name) => ({ role_name, manages_project: 0 })),
    ],
  },
];

export const PROJECT_ROLE_FIELDS = [
  { dt: "User", fieldname: "custom_pm_by_project", label: "Project Manager Through Projects", fieldtype: "Check", hidden: 1, read_only: 1, no_copy: 1, insert_after: "enabled" },
];

export const PROJECT_ROLE_TRACK = ["Project"];

const SEE_ALL = `
held = frappe.get_all("Has Role", filters={"parent": user, "parenttype": "User"}, pluck="role")
sees_all = user == "Administrator" or "System Manager" in held or "HR Manager" in held or "HR User" in held
`;

// Python: the projects this user manages, and the two ways a task shows it is theirs. (str.format isn't allowed in the sandbox.)
const SCOPE = `
    u = frappe.db.escape(user)
    a = frappe.db.escape('%"' + user + '"%')
    b = frappe.db.escape("%Assignee: " + user + "%")
    managed = "SELECT \`name\` FROM \`tabProject\` WHERE \`custom_project_manager\` = " + u + " OR ((\`custom_project_manager\` IS NULL OR \`custom_project_manager\` = '') AND \`owner\` = " + u + ")"
`;

// Only people with the Projects Manager role are limited: plain employees keep what the Employee role gives them.
const PROJECT_QUERY = `${SEE_ALL.trim()}
if "Projects Manager" in held and not sees_all:${SCOPE.trimEnd()}
    conditions = "\`tabProject\`.\`name\` IN (" + managed + ") OR \`tabProject\`.\`name\` IN (SELECT \`project\` FROM \`tabTask\` WHERE \`_assign\` LIKE " + a + " OR \`description\` LIKE " + b + ")"
elif "Contractor" in held and not sees_all:${SCOPE.trimEnd()}
    conditions = "\`tabProject\`.\`name\` IN (SELECT \`project\` FROM \`tabTask\` WHERE \`_assign\` LIKE " + a + " OR \`description\` LIKE " + b + ")"
`;

const TASK_QUERY = `${SEE_ALL.trim()}
if "Projects Manager" in held and not sees_all:${SCOPE.trimEnd()}
    conditions = "\`tabTask\`.\`project\` IN (" + managed + ") OR \`tabTask\`.\`_assign\` LIKE " + a + " OR \`tabTask\`.\`description\` LIKE " + b
elif "Contractor" in held and not sees_all:${SCOPE.trimEnd()}
    conditions = "\`tabTask\`.\`_assign\` LIKE " + a + " OR \`tabTask\`.\`description\` LIKE " + b
`;

// Timesheets also save tasks (hours, status "Working"), so only real changes to an assignment are checked.
const ASSIGNMENT_GUARD = `
if doc.project and "[ETHX Assignment]" in (doc.description or ""):
    changed = doc.is_new() or doc.has_value_changed("description") or doc.has_value_changed("project") or doc.has_value_changed("exp_end_date") or doc.has_value_changed("exp_start_date")
    if not changed and doc.status in ("Completed", "Cancelled") and doc.has_value_changed("status"):
        changed = True
    if changed:
        user = frappe.session.user
${SEE_ALL.trim().split("\n").map((l) => `        ${l}`).join("\n")}
        if not sees_all:
            row = frappe.db.get_value("Project", doc.project, ["custom_project_manager", "owner"], as_dict=True)
            if not row or (row.custom_project_manager or row.owner) != user:
                frappe.throw("Only the manager of this project, HR or the Administrator can change its team.")
`;

const SET_MANAGER_API = `
user = frappe.session.user
${SEE_ALL.trim()}
args = frappe.form_dict
project = args.get("project")
new = (args.get("user") or "").strip()
if not project:
    frappe.throw("Project not found.")
row = frappe.db.get_value("Project", project, ["custom_project_manager", "owner"], as_dict=True)
if not row:
    frappe.throw("Project not found.")
if not sees_all and (row.custom_project_manager or row.owner) != user:
    frappe.throw("Only the manager of this project, HR or the Administrator can change who manages it.")
old = row.custom_project_manager
if new and not frappe.db.get_value("User", {"name": new, "enabled": 1}, "name"):
    frappe.throw("That login doesn't exist or is disabled.")
frappe.db.set_value("Project", project, "custom_project_manager", new or None)
granted = False
if new and new != old:
    new_roles = frappe.get_all("Has Role", filters={"parent": new, "parenttype": "User"}, pluck="role")
    if "Projects Manager" not in new_roles:
        u = frappe.get_doc("User", new)
        u.append("roles", {"role": "Projects Manager"})
        u.flags.ignore_permissions = True
        u.save()
        frappe.db.set_value("User", new, "custom_pm_by_project", 1)
        granted = True
        # ERPNext limits employee logins to their own Employee record; a manager has to see who they can assign.
        for up in frappe.get_all("User Permission", filters={"user": new, "allow": "Employee"}, pluck="name"):
            frappe.delete_doc("User Permission", up, ignore_permissions=True)
revoked = False
if old and old != new and frappe.db.get_value("User", old, "custom_pm_by_project"):
    if not frappe.db.count("Project", {"custom_project_manager": old}):
        u = frappe.get_doc("User", old)
        u.roles = [r for r in u.roles if r.role != "Projects Manager"]
        u.flags.ignore_permissions = True
        u.save()
        frappe.db.set_value("User", old, "custom_pm_by_project", 0)
        revoked = True
        emp = frappe.db.get_value("Employee", {"user_id": old}, "name")
        if emp:
            frappe.get_doc({"doctype": "User Permission", "user": old, "allow": "Employee", "for_value": emp, "apply_to_all_doctypes": 1}).insert(ignore_permissions=True)
frappe.get_doc({"doctype": "Comment", "comment_type": "Info", "reference_doctype": "Project", "reference_name": project, "content": "Project manager changed from " + (old or "none") + " to " + (new or "none") + " by " + user}).insert(ignore_permissions=True)
frappe.response["message"] = {"manager": new, "granted": granted, "revoked": revoked}
`;

export const PROJECT_ROLE_SCRIPTS = [
  { name: "ETHX - Set project manager", script_type: "API", api_method: "ethx_set_project_manager", script: SET_MANAGER_API, what: "Any employee can be made manager of a project, with access to that project only" },
  { name: "ETHX - Projects: own only", script_type: "Permission Query", reference_doctype: "Project", script: PROJECT_QUERY, what: "Project managers see only their own projects" },
  { name: "ETHX - Tasks: own projects only", script_type: "Permission Query", reference_doctype: "Task", script: TASK_QUERY, what: "Project managers see tasks of their own projects and their own tasks" },
  { name: "ETHX - Assignment guard", script_type: "DocType Event", reference_doctype: "Task", doctype_event: "Before Validate", script: ASSIGNMENT_GUARD, what: "Only a project's manager, HR or the Administrator change its team" },
];
