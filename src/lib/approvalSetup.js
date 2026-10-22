// Leave & expense approvals, enforced on the ERPNext server (installed from Admin › ERPNext Setup):
//  - the leave approver comes from the employee's business unit (Department, walking up to parent departments),
//    then the approver on the Employee record;
//  - the expense approver comes from the Expense Claim Type, then the business unit, then the Employee record;
//  - an approver who is on approved leave today is skipped, and a daily job moves pending requests away from
//    approvers who have gone on leave;
//  - an expense claim can't be approved without a bill attached, nor rejected without a reason;
//  - multi-currency sites get the claim's currency / exchange rate filled in (ERPNext only does that in its desk UI).
//
// RestrictedPython notes: no imports; in DocType Event scripts functions can't call each other (the script's own
// names live in a separate locals dict), so shared logic is pasted in as plain code blocks instead of functions.

export const APPROVAL_FIELDS = [
  { dt: "Expense Claim Type", fieldname: "expense_approver", label: "Expense Approver", fieldtype: "Link", options: "User", insert_after: "description" },
  { dt: "Expense Claim Type", fieldname: "expense_approver_name", label: "Expense Approver Name", fieldtype: "Data", read_only: 1, fetch_from: "expense_approver.full_name", insert_after: "expense_approver" },
];

export const APPROVAL_TRACK = ["Expense Claim Type", "Department"];

const indent = (code, n) => code.trim().split("\n").map((l) => (l ? " ".repeat(n) + l : l)).join("\n");

// Needs: emp (Employee dict: user_id, department, leave_approver, expense_approver), kind, etype, day.
// Gives: cands = [{email, name, source, on_leave}], pick = first available (else first), or None.
const CANDIDATES = `
cands = []
src = {}
order = []
if kind == "Expense Claim" and etype and frappe.get_meta("Expense Claim Type").has_field("expense_approver"):
    tappr = frappe.db.get_value("Expense Claim Type", etype, "expense_approver")
    if tappr:
        order.append(tappr)
        src[tappr] = "expense type"
pfield = "leave_approvers" if kind == "Leave Application" else "expense_approvers"
dept = emp.department
walked = []
while dept and dept not in walked:
    walked.append(dept)
    drow = frappe.db.get_value("Department", dept, ["parent_department", "disabled"], as_dict=True)
    if not drow:
        break
    if not drow.disabled:
        for arow in frappe.get_all("Department Approver", filters={"parent": dept, "parenttype": "Department", "parentfield": pfield}, fields=["approver"], order_by="idx asc"):
            if arow.approver and arow.approver not in order:
                order.append(arow.approver)
                src[arow.approver] = "business unit"
    dept = drow.parent_department
own = emp.leave_approver if kind == "Leave Application" else emp.expense_approver
if own and own not in order:
    order.append(own)
    src[own] = "employee record"
pick = None
for u in order:
    if u == emp.user_id:
        continue
    urow = frappe.db.get_value("User", {"name": u, "enabled": 1}, ["name", "full_name"], as_dict=True)
    if not urow:
        continue
    uemp = frappe.db.get_value("Employee", {"user_id": u}, "name")
    away = False
    if uemp:
        away = frappe.db.count("Leave Application", {"employee": uemp, "status": "Approved", "docstatus": 1, "from_date": ["<=", day], "to_date": [">=", day]}) > 0
    cand = {"email": u, "name": urow.full_name or u, "source": src.get(u), "on_leave": away}
    cands.append(cand)
    if not away and not pick:
        pick = cand
if not pick and cands:
    pick = cands[0]
`;

const EMP_FIELDS = `["name", "user_id", "department", "leave_approver", "expense_approver", "company"]`;

const HR_CHECK = `
roles = frappe.get_all("Has Role", filters={"parent": frappe.session.user, "parenttype": "User"}, pluck="role")
is_hr = frappe.session.user == "Administrator" or "HR Manager" in roles or "HR User" in roles or "System Manager" in roles
`;

/** API: who approves this employee's leave / expense claim, and is each approver available today. */
const APPROVERS_API = `
args = frappe.form_dict
user = frappe.session.user
kind = args.get("doctype") or "Leave Application"
if kind not in ("Leave Application", "Expense Claim"):
    frappe.throw("Unknown request type.")
etype = args.get("expense_type")
day = args.get("on") or frappe.utils.nowdate()
emp_id = args.get("employee") or frappe.db.get_value("Employee", {"user_id": user}, "name")
if not emp_id:
    frappe.throw("No employee record is linked to your login.")
emp = frappe.db.get_value("Employee", emp_id, ${EMP_FIELDS}, as_dict=True)
if not emp:
    frappe.throw("Employee not found.")
${HR_CHECK.trim()}
if emp.user_id != user and not is_hr:
    frappe.throw("You can only look up your own approver.")
${CANDIDATES.trim()}
frappe.response["message"] = {"approvers": cands, "pick": pick}
`;

/** Before Insert on Leave Application: no approver, or an approver who is away today -> the next available one. */
const LEAVE_ASSIGN = `
if doc.docstatus == 0 and (doc.status or "Open") == "Open" and doc.employee:
    emp = frappe.db.get_value("Employee", doc.employee, ${EMP_FIELDS}, as_dict=True)
    kind = "Leave Application"
    etype = None
    day = frappe.utils.nowdate()
${indent(CANDIDATES, 4)}
    current = None
    for c in cands:
        if c["email"] == doc.leave_approver:
            current = c
    if pick and (not doc.leave_approver or (current and current["on_leave"] and not pick["on_leave"])):
        doc.leave_approver = pick["email"]
        doc.leave_approver_name = pick["name"]
`;

/** Before Validate on Expense Claim: currency / exchange rate, and the approver from the expense type. */
const EXPENSE_PREPARE = `
if doc.docstatus == 0:
    if not doc.company and doc.employee:
        doc.company = frappe.db.get_value("Employee", doc.employee, "company")
    meta = frappe.get_meta("Expense Claim")
    if meta.has_field("exchange_rate") and doc.company:
        base = frappe.db.get_value("Company", doc.company, "default_currency")
        multi = frappe.db.get_single_value("HR Settings", "enable_multi_currency_expense_claim")
        if not doc.get("currency") or not multi:
            doc.currency = base
        if doc.currency == base:
            doc.exchange_rate = 1
        elif doc.is_new() or frappe.utils.flt(doc.get("exchange_rate")) in (0, 1):
            rate = frappe.utils.flt(frappe.call("erpnext.setup.utils.get_exchange_rate", from_currency=doc.currency, to_currency=base, transaction_date=doc.posting_date or frappe.utils.nowdate()))
            if not rate:
                frappe.throw("No exchange rate from " + doc.currency + " to " + base + " is set up. Ask Accounts to add a Currency Exchange record.")
            doc.exchange_rate = rate
    if (doc.approval_status or "Draft") == "Draft" and doc.employee and doc.get("expenses"):
        emp = frappe.db.get_value("Employee", doc.employee, ${EMP_FIELDS}, as_dict=True)
        kind = "Expense Claim"
        etype = doc.expenses[0].expense_type
        day = frappe.utils.nowdate()
${indent(CANDIDATES, 8)}
        current = None
        for c in cands:
            if c["email"] == doc.expense_approver:
                current = c
        typed = pick and pick["source"] == "expense type"
        if pick and (not doc.expense_approver or (doc.is_new() and typed) or (current and current["on_leave"] and not pick["on_leave"])):
            doc.expense_approver = pick["email"]
`;

/** Before Submit on Expense Claim: only the approver (or HR) decides; approval needs a bill, rejection a reason. */
const EXPENSE_DECIDE = `
${HR_CHECK.trim()}
if doc.expense_approver and frappe.session.user != doc.expense_approver and not is_hr:
    frappe.throw("Only the claim's expense approver (" + doc.expense_approver + ") or HR can approve or reject it.")
if doc.approval_status == "Approved":
    bills = frappe.db.count("File", {"attached_to_doctype": "Expense Claim", "attached_to_name": doc.name})
    if not bills:
        frappe.throw("Attach the bill / receipt to this claim before it can be approved.")
if doc.approval_status == "Rejected" and len((doc.remark or "").strip()) < 5:
    frappe.throw("State the reason for rejecting this claim (in Remark) - the employee sees it.")
`;

// Moves pending leave applications / expense claims from approvers on leave today to the next available approver.
const REROUTE = `
today = frappe.utils.nowdate()
moved = []
jobs = [["Leave Application", "leave_approver", {"docstatus": 0, "status": "Open"}], ["Expense Claim", "expense_approver", {"docstatus": 0, "approval_status": "Draft"}]]
for job in jobs:
    kind = job[0]
    afield = job[1]
    for rec in frappe.get_all(kind, filters=job[2], fields=["name", "employee", afield]):
        cur = rec.get(afield)
        if cur:
            cemp = frappe.db.get_value("Employee", {"user_id": cur}, "name")
            if not cemp or not frappe.db.count("Leave Application", {"employee": cemp, "status": "Approved", "docstatus": 1, "from_date": ["<=", today], "to_date": [">=", today]}):
                continue
        emp = frappe.db.get_value("Employee", rec.employee, ${EMP_FIELDS}, as_dict=True)
        if not emp:
            continue
        etype = None
        if kind == "Expense Claim":
            etype = frappe.db.get_value("Expense Claim Detail", {"parent": rec.name, "parenttype": "Expense Claim"}, "expense_type")
        day = today
${indent(CANDIDATES, 8)}
        if not pick or pick["on_leave"] or pick["email"] == cur:
            continue
        upd = {afield: pick["email"]}
        if kind == "Leave Application":
            upd["leave_approver_name"] = pick["name"]
        frappe.db.set_value(kind, rec.name, upd)
        try:
            frappe.get_doc({"doctype": "DocShare", "user": pick["email"], "share_doctype": kind, "share_name": rec.name, "read": 1, "write": 1, "submit": 1}).insert(ignore_permissions=True)
        except Exception:
            pass
        frappe.get_doc({"doctype": "Comment", "comment_type": "Info", "reference_doctype": kind, "reference_name": rec.name, "content": "Approver changed from " + (cur or "none") + " to " + pick["email"] + " (previous approver unavailable)"}).insert(ignore_permissions=True)
        moved.append(rec.name)
`;

const REROUTE_API = `
${HR_CHECK.trim()}
if not is_hr:
    frappe.throw("Only HR can re-route approvals.")
${REROUTE.trim()}
frappe.response["message"] = {"moved": moved}
`;

export const APPROVAL_SCRIPTS = [
  { name: "ETHX - Approvers", script_type: "API", api_method: "ethx_approvers", script: APPROVERS_API, what: "Approver lookup: business-unit leave approvers, expense-type approvers, availability" },
  { name: "ETHX - Leave approver assign", script_type: "DocType Event", reference_doctype: "Leave Application", doctype_event: "Before Insert", script: LEAVE_ASSIGN, what: "New leave goes to an available business-unit approver" },
  { name: "ETHX - Expense claim prepare", script_type: "DocType Event", reference_doctype: "Expense Claim", doctype_event: "Before Validate", script: EXPENSE_PREPARE, what: "Expense claims get currency, exchange rate and the expense type's approver" },
  { name: "ETHX - Expense claim decision", script_type: "DocType Event", reference_doctype: "Expense Claim", doctype_event: "Before Submit", script: EXPENSE_DECIDE, what: "Only the approver decides; approval needs a bill, rejection needs a reason" },
  { name: "ETHX - Reroute approvals", script_type: "API", api_method: "ethx_reroute_approvals", script: REROUTE_API, what: "HR moves pending requests away from approvers on leave" },
  { name: "ETHX - Reroute approvals daily", script_type: "Scheduler Event", event_frequency: "Daily", script: REROUTE, what: "Every day, pending requests move away from approvers on leave" },
];
