// Employee Advances and Travel Requests: HR reviews them from HR › Expense Claim › Employee Advance / Travel Request
// and approves or rejects each one. Stock ERPNext has no approve / reject on either, so the decision and HR's remark
// are kept in two custom fields. Approving also submits the document when its doctype is submittable (an approved
// advance then becomes Unpaid, ready to be paid out). Installed by System Setup (siteSetup.js).

export const ADVANCE_TRAVEL_DOCTYPES = ["Employee Advance", "Travel Request"];

export const ADVANCE_TRAVEL_FIELDS = ADVANCE_TRAVEL_DOCTYPES.flatMap((dt) => [
  { dt, fieldname: "custom_decision", label: "Decision", fieldtype: "Select", options: "\nApproved\nRejected", read_only: 1, insert_after: "employee_name" },
  { dt, fieldname: "custom_decision_note", label: "Decision Note", fieldtype: "Small Text", read_only: 1, insert_after: "custom_decision" },
]);

// Restricted sandbox: no imports, no str.format, no frappe.get_roles.
const DECISION_API = `
user = frappe.session.user
dt = frappe.form_dict.get("doctype")
name = frappe.form_dict.get("request")
status = frappe.form_dict.get("status")
note = (frappe.form_dict.get("note") or "").strip()
if dt not in ("Employee Advance", "Travel Request"):
    frappe.throw("This request type can't be decided here.")
if status not in ("Approved", "Rejected"):
    frappe.throw("Choose Approved or Rejected.")
if status == "Rejected" and not note:
    frappe.throw("Give the reason for rejecting.")
roles = frappe.get_all("Has Role", filters={"parent": user, "parenttype": "User"}, pluck="role")
if not (user == "Administrator" or "HR Manager" in roles or "HR User" in roles or "System Manager" in roles):
    frappe.throw("Only HR can approve or reject this request.")
doc = frappe.get_doc(dt, name)
if doc.docstatus != 0 or doc.get("custom_decision"):
    frappe.throw("This request has already been decided.")
owner = frappe.db.get_value("Employee", doc.employee, "user_id")
if owner == user:
    frappe.throw("You can't decide on your own request.")
if status == "Approved":
    doc.custom_decision = "Approved"
    doc.custom_decision_note = note
    doc.flags.ignore_permissions = True
    if frappe.db.get_value("DocType", dt, "is_submittable"):
        doc.submit()
    else:
        doc.save()
else:
    frappe.db.set_value(dt, name, {"custom_decision": "Rejected", "custom_decision_note": note})
label = "advance" if dt == "Employee Advance" else "travel request"
frappe.get_doc({"doctype": "Comment", "comment_type": "Info", "reference_doctype": dt, "reference_name": name, "content": dt + " " + status.lower() + " by " + user + (": " + note if note else "")}).insert(ignore_permissions=True)
if owner:
    frappe.get_doc({"doctype": "Notification Log", "for_user": owner, "type": "Alert", "subject": "Your " + label + " " + name + " was " + status.lower() + (": " + note if note else "."), "document_type": dt, "document_name": name}).insert(ignore_permissions=True)
frappe.response["message"] = {"status": status}
`;

export const ADVANCE_TRAVEL_SCRIPTS = [
  { name: "ETHX - Advance and travel decision", script_type: "API", api_method: "ethx_hr_request_decision", script: DECISION_API, what: "HR approves or rejects employee advances and travel requests, with a remark the employee sees" },
];
