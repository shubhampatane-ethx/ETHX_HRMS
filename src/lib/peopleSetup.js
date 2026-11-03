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

export const EMPLOYEE_RECORD_SCRIPTS = [
  { name: "ETHX - My photo", script_type: "API", api_method: "ethx_set_my_photo", script: MY_PHOTO_API, what: "Employees change their own profile photo" },
  { name: "ETHX - Employee ID numbers", script_type: "DocType Event", reference_doctype: "Employee", doctype_event: "Before Save", script: EMPLOYEE_ID_CHECK, what: "PAN and Aadhaar numbers are checked before an employee is saved" },
  { name: "ETHX - Employee group members", script_type: "DocType Event", reference_doctype: "Employee", doctype_event: "After Save", script: EMPLOYEE_GROUP_SYNC, what: "The Employee Group chosen on an employee lists them as a member" },
  { name: "ETHX - Punches can't be deleted", script_type: "DocType Event", reference_doctype: "Employee Checkin", doctype_event: "Before Delete", script: CHECKIN_NO_DELETE, what: "Punch records can't be deleted (only by the Administrator)" },
];
