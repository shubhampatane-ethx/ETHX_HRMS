// QA fixes (HRMS360 test report, Nov 2026): data validation and extra restricted fields.
// BUG-003 promotion CTC check, BUG-004 employee identity checks, BUG-009 no group departments on employees,
// BUG-011 passport details visible to HR only (PAN / Aadhaar / bank are restricted in securitySetup.js).

const PROMOTION_CTC_CHECK = `
rev = doc.revised_ctc or 0
cur = doc.current_ctc or 0
if rev and rev < 10000:
    frappe.throw("Revised CTC of " + str(rev) + " looks wrong. Enter the full annual CTC in rupees (at least 10,000).")
if rev and cur and rev < cur:
    frappe.msgprint("Revised CTC is lower than the current CTC - please double-check it.", indicator="orange", alert=True)
`;

const EMPLOYEE_DATA_CHECKS = `
for f in ["first_name", "middle_name", "last_name"]:
    v = (doc.get(f) or "").strip()
    if v and v == v.lower():
        doc.set(f, " ".join([p[:1].upper() + p[1:] for p in v.split(" ") if p]))
if doc.ctc and doc.ctc < 10000:
    frappe.throw("CTC of " + str(doc.ctc) + " looks wrong. Enter the full annual CTC in rupees (at least 10,000).")
if doc.date_of_birth and doc.date_of_joining and frappe.utils.date_diff(doc.date_of_joining, doc.date_of_birth) < 18 * 365:
    frappe.throw("The date of birth makes this employee younger than 18 on the joining date - please check it.")
full = " ".join([(doc.get(f) or "").strip() for f in ["first_name", "middle_name", "last_name"] if (doc.get(f) or "").strip()])
if full:
    others = frappe.get_all("Employee", filters={"employee_name": full, "status": "Active", "name": ["!=", doc.name or "new"]}, fields=["name", "date_of_birth", "personal_email", "cell_number"])
    if others:
        ids = ", ".join([o.name for o in others])
        strong = [o for o in others if (doc.date_of_birth and str(o.date_of_birth) == str(doc.date_of_birth)) or (doc.personal_email and o.personal_email == doc.personal_email) or (doc.cell_number and o.cell_number == doc.cell_number)]
        if doc.is_new() and strong:
            frappe.throw("This looks like a duplicate of " + ids + " (same name and same date of birth, email or mobile). Open that record instead.")
        frappe.msgprint("Another active employee has the same name: " + ids + ". Make sure this is not a duplicate.", indicator="orange", alert=True)
if doc.department and frappe.db.get_value("Department", doc.department, "is_group"):
    frappe.throw(doc.department + " is a group, not a department. Pick the employee's actual department.")
`;

export const QA_SCRIPTS = [
  { name: "ETHX - Promotion CTC check", script_type: "DocType Event", reference_doctype: "Employee Promotion", doctype_event: "Before Validate", script: PROMOTION_CTC_CHECK, what: "Promotions can't record an impossible CTC (below 10,000), and a pay cut shows a warning" },
  { name: "ETHX - Employee data checks", script_type: "DocType Event", reference_doctype: "Employee", doctype_event: "Before Validate", script: EMPLOYEE_DATA_CHECKS, what: "Employee names are capitalised; under-18s, impossible CTCs, group departments and duplicate employees are refused" },
];

const PASSPORT = ["passport_number", "date_of_issue", "valid_upto", "place_of_issue"];
export const QA_PROPERTIES = PASSPORT.map((f) => ({ doc_type: "Employee", field_name: f, property: "permlevel", property_type: "Int", value: 1, what: `Employee › ${f.replace(/_/g, " ")} restricted to HR` }));
