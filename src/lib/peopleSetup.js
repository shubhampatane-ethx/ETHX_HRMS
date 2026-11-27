// Sign-in page and employee records (installed from Admin › ERPNext Setup).
//   - The sign-in page shows the company's logo, name and support contact before anyone signs in, so it reads them
//     through a public method that returns only those (never a private file).
//   - Employees set their own profile photo through a server method: they can't write their User or Employee record.
//   - Employee records get PAN, Aadhaar and Employee Group fields; PAN / Aadhaar are checked and the group's member
//     list follows the field.
//   - Punch records (Employee Checkin) can't be deleted, except by the Administrator.

const LOGIN_BRANDING_API = `
company = frappe.db.get_single_value("Global Defaults", "default_company")
if not company:
    first = frappe.get_all("Company", fields=["name"], order_by="creation asc", limit_page_length=1)
    if first:
        company = first[0].name
out = {}
if company:
    meta = frappe.get_meta("Company")
    wanted = ["company_name", "company_logo"]
    for f in ["custom_hrms_display_name", "custom_hrms_dark_logo", "custom_hrms_support_email", "custom_hrms_support_phone"]:
        if meta.has_field(f):
            wanted.append(f)
    c = frappe.db.get_value("Company", company, wanted, as_dict=True) or {}
    logo = c.get("company_logo") or ""
    dark = c.get("custom_hrms_dark_logo") or ""
    if logo.startswith("/private/"):
        logo = ""
    if dark.startswith("/private/"):
        dark = ""
    out = {"name": c.get("custom_hrms_display_name") or c.get("company_name") or company, "logo": logo, "dark_logo": dark, "support_email": c.get("custom_hrms_support_email") or "", "support_phone": c.get("custom_hrms_support_phone") or ""}
frappe.response["message"] = out
`;

const MY_PHOTO_API = `
user = frappe.session.user
row = frappe.db.get_value("File", frappe.form_dict.get("file") or "__none__", ["name", "owner", "file_url", "is_private"], as_dict=True)
if not row or row.owner != user:
    frappe.throw("You can only use a photo you uploaded yourself.")
if row.is_private:
    frappe.throw("The photo must be uploaded as a public file.")
frappe.db.set_value("File", row.name, {"attached_to_doctype": "User", "attached_to_name": user, "attached_to_field": "user_image"})
frappe.db.set_value("User", user, "user_image", row.file_url)
emp = frappe.db.get_value("Employee", {"user_id": user}, "name")
if emp:
    frappe.db.set_value("Employee", emp, "image", row.file_url)
frappe.response["message"] = {"user_image": row.file_url}
`;

// PAN: 5 letters, 4 digits, 1 letter. Aadhaar: 12 digits. Spaces and dashes are removed before checking.
const EMPLOYEE_ID_CHECK = `
pan = (doc.get("custom_pan_number") or "").strip().upper().replace(" ", "")
if pan and not (len(pan) == 10 and pan[:5].isalpha() and pan[5:9].isdigit() and pan[9].isalpha()):
    frappe.throw("PAN must be 10 characters, like ABCDE1234F.")
doc.custom_pan_number = pan
aadhaar = (doc.get("custom_aadhaar_number") or "").replace(" ", "").replace("-", "")
if aadhaar and (len(aadhaar) != 12 or not aadhaar.isdigit()):
    frappe.throw("Aadhaar must be 12 digits.")
doc.custom_aadhaar_number = aadhaar
`;

// BUG-004 / BUG-009: clean identity data. Names typed in lower case get capitalised; a group department ("All
// Departments") can't be an employee's department; a new staff record needs a department and designation; and the same
// person can't be added twice (same PAN, Aadhaar or personal email, or the same name and date of birth).
const EMPLOYEE_QUALITY_CHECK = `
for f in ["first_name", "middle_name", "last_name"]:
    v = (doc.get(f) or "").strip()
    if v and v == v.lower():
        doc.set(f, " ".join([w[:1].upper() + w[1:] for w in v.split(" ") if w]))
if doc.first_name:
    doc.employee_name = " ".join([x for x in [doc.first_name, doc.get("middle_name"), doc.get("last_name")] if x])
if doc.department and (doc.is_new() or doc.has_value_changed("department")) and frappe.db.get_value("Department", doc.department, "is_group"):
    frappe.throw(doc.department + " is a group of departments. Choose the actual department the employee works in.")
contractor = doc.get("custom_is_contractor") and int(doc.get("custom_is_contractor") or 0)
if doc.date_of_joining and not contractor and (doc.is_new() or doc.has_value_changed("date_of_joining")) and frappe.utils.getdate(doc.date_of_joining).weekday() >= 5:
    frappe.throw("The date of joining can't be a Saturday or Sunday. Choose a working day.")
if doc.is_new() and not contractor:
    missing = [label for f, label in [["department", "Department"], ["designation", "Designation"]] if not doc.get(f)]
    if missing:
        frappe.throw("Fill in " + " and ".join(missing) + " for the new employee.")
if doc.is_new():
    checks = []
    if doc.get("custom_pan_number"):
        checks.append([{"custom_pan_number": doc.custom_pan_number}, "PAN " + doc.custom_pan_number])
    if doc.get("custom_aadhaar_number"):
        checks.append([{"custom_aadhaar_number": doc.custom_aadhaar_number}, "this Aadhaar number"])
    if doc.get("personal_email"):
        checks.append([{"personal_email": doc.personal_email}, "personal email " + doc.personal_email])
    if doc.employee_name and doc.get("date_of_birth"):
        checks.append([{"employee_name": doc.employee_name, "date_of_birth": doc.date_of_birth}, "the same name and date of birth"])
    meta = frappe.get_meta("Employee")
    for c in checks:
        field = list(c[0].keys())[0]
        if field.startswith("custom_") and not meta.has_field(field):
            continue
        twin = frappe.db.get_value("Employee", c[0], ["name", "employee_name"], as_dict=True)
        if twin:
            frappe.throw("An employee with " + c[1] + " already exists: " + twin.employee_name + " (" + twin.name + "). Open that record instead of adding a new one.")
`;

// Employees read their own PAN / Aadhaar through this rule only. The fields themselves are HR / Administrator-only
// (permission level 1), so the generic list API can't return them to anyone else (BUG-011).
const MY_IDENTITY_API = `
meta = frappe.get_meta("Employee")
available = meta.has_field("custom_pan_number") and meta.has_field("custom_aadhaar_number")
row = None
if available:
    row = frappe.db.get_value("Employee", {"user_id": frappe.session.user}, ["custom_pan_number", "custom_aadhaar_number"], as_dict=True)
frappe.response["message"] = {"available": bool(available and row), "pan": (row.custom_pan_number if row else "") or "", "aadhaar": (row.custom_aadhaar_number if row else "") or ""}
`;

// BUG-003: a promotion's revised CTC must be a real annual figure, and not a typo against the current CTC.
export const MIN_ANNUAL_CTC = 10000;
const PROMOTION_CTC_CHECK = `
new = float(doc.get("revised_ctc") or 0)
cur = float(doc.get("current_ctc") or 0)
if new:
    if new < ${MIN_ANNUAL_CTC}:
        frappe.throw("Revised CTC " + frappe.utils.fmt_money(new) + " is too low for an annual salary. Enter the yearly amount (at least " + frappe.utils.fmt_money(${MIN_ANNUAL_CTC}) + ").")
    if cur >= ${MIN_ANNUAL_CTC} and (new > cur * 10 or new < cur / 10):
        frappe.throw("Revised CTC " + frappe.utils.fmt_money(new) + " is more than ten times different from the current CTC " + frappe.utils.fmt_money(cur) + ". Check the amount.")
`;

// The employee is listed in the group chosen on their record, and taken off the group it replaced. Memberships added
// on the group itself (in ERPNext) are left alone.
const EMPLOYEE_GROUP_SYNC = `
group = doc.get("custom_employee_group") or ""
before = doc.get_doc_before_save()
old = (before.get("custom_employee_group") if before else "") or ""
if old and old != group and frappe.db.exists("Employee Group", old):
    g = frappe.get_doc("Employee Group", old)
    keep = []
    for r in g.employee_list:
        if r.employee != doc.name:
            keep.append(r)
    if len(keep) != len(g.employee_list):
        g.set("employee_list", keep)
        g.save(ignore_permissions=True)
if group and not frappe.db.exists("Employee Group Table", {"parent": group, "parenttype": "Employee Group", "employee": doc.name}):
    g = frappe.get_doc("Employee Group", group)
    g.append("employee_list", {"employee": doc.name, "employee_name": doc.employee_name, "user_id": doc.user_id})
    g.save(ignore_permissions=True)
`;

const CHECKIN_NO_DELETE = `
if frappe.session.user != "Administrator":
    frappe.throw("Punch records can't be deleted. Correct the day on the Attendance page instead.")
`;

export const SIGNIN_FIELDS = [
  { dt: "Company", fieldname: "custom_hrms_display_name", label: "HRMS Display Name", fieldtype: "Data", insert_after: "company_logo" },
  { dt: "Company", fieldname: "custom_hrms_dark_logo", label: "HRMS Dark Theme Logo", fieldtype: "Attach Image", insert_after: "custom_hrms_display_name" },
  { dt: "Company", fieldname: "custom_hrms_support_email", label: "HRMS Support Email", fieldtype: "Data", options: "Email", insert_after: "custom_hrms_dark_logo" },
  { dt: "Company", fieldname: "custom_hrms_support_phone", label: "HRMS Support Phone", fieldtype: "Data", insert_after: "custom_hrms_support_email" },
];

export const SIGNIN_SCRIPTS = [
  { name: "ETHX - Sign-in branding", script_type: "API", api_method: "ethx_login_branding", allow_guest: true, script: LOGIN_BRANDING_API, what: "The sign-in page shows the company logo, name and support contact" },
];

export const EMPLOYEE_RECORD_FIELDS = [
  { dt: "Employee", fieldname: "custom_pan_number", label: "PAN Number", fieldtype: "Data", insert_after: "cell_number" },
  { dt: "Employee", fieldname: "custom_aadhaar_number", label: "Aadhaar Number", fieldtype: "Data", insert_after: "custom_pan_number" },
  { dt: "Employee", fieldname: "custom_employee_group", label: "Employee Group", fieldtype: "Link", options: "Employee Group", insert_after: "grade" },
];

/** PAN and Aadhaar: permission level 1, so only roles granted that level (below) can read or change them. */
export const EMPLOYEE_RECORD_PROPERTIES = ["custom_pan_number", "custom_aadhaar_number"].map((field_name) => ({
  doc_type: "Employee", field_name, property: "permlevel", property_type: "Int", value: 1, what: `Employee › ${field_name === "custom_pan_number" ? "PAN" : "Aadhaar"} visible to HR and the Administrator only`,
}));
export const EMPLOYEE_LEVEL_PERMS = ["System Manager", "HR Manager", "HR User"].map((role) => ({ doctype: "Employee", role, permlevel: 1, perms: ["read", "write"], what: `${role} reads and edits PAN / Aadhaar` }));

export const EMPLOYEE_RECORD_SCRIPTS = [
  { name: "ETHX - My identity numbers", script_type: "API", api_method: "ethx_my_identity", script: MY_IDENTITY_API, what: "Employees see their own PAN and Aadhaar (and nobody else's)" },
  { name: "ETHX - Employee data quality", script_type: "DocType Event", reference_doctype: "Employee", doctype_event: "Before Save", script: EMPLOYEE_QUALITY_CHECK, what: "Names are capitalised, group departments refused, joining dates can't be weekends, new staff need a department and designation, and duplicates are blocked" },
  { name: "ETHX - Promotion CTC check", script_type: "DocType Event", reference_doctype: "Employee Promotion", doctype_event: "Before Validate", script: PROMOTION_CTC_CHECK, what: "A promotion's revised CTC must be a real annual amount, within ten times the current CTC" },
  { name: "ETHX - My photo", script_type: "API", api_method: "ethx_set_my_photo", script: MY_PHOTO_API, what: "Employees change their own profile photo" },
  { name: "ETHX - Employee ID numbers", script_type: "DocType Event", reference_doctype: "Employee", doctype_event: "Before Save", script: EMPLOYEE_ID_CHECK, what: "PAN and Aadhaar numbers are checked before an employee is saved" },
  { name: "ETHX - Employee group members", script_type: "DocType Event", reference_doctype: "Employee", doctype_event: "After Save", script: EMPLOYEE_GROUP_SYNC, what: "The Employee Group chosen on an employee lists them as a member" },
  { name: "ETHX - Punches can't be deleted", script_type: "DocType Event", reference_doctype: "Employee Checkin", doctype_event: "Before Delete", script: CHECKIN_NO_DELETE, what: "Punch records can't be deleted (only by the Administrator)" },
];
