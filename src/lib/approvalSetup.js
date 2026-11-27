// Leave & expense approvals, enforced on the ERPNext server (installed from Admin › ERPNext Setup):
//  - the leave approver comes from the employee's business unit (Department, walking up to parent departments),
//    then the approver on the Employee record;
//  - the expense approver comes from the Expense Claim Type, then the business unit, then the Employee record;
//  - after those comes the reporting manager, then their manager and on up the hierarchy (Reports To), so there is
//    always someone to approve;
//  - an approver who is on approved leave today, or has left (Employee not Active / login disabled), is skipped, and a
//    daily job moves pending requests away from approvers who have gone on leave or left;
//  - HR hands a leaver's work over in one go (ethx_handover): pending approvals, approver roles, direct reports.
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
boss = emp.reports_to
climbed = []
while boss and boss not in climbed and len(climbed) < 8:
    climbed.append(boss)
    brow = frappe.db.get_value("Employee", boss, ["user_id", "reports_to"], as_dict=True)
    if not brow:
        break
    if brow.user_id and brow.user_id not in order:
        order.append(brow.user_id)
        src[brow.user_id] = "reporting manager" if len(climbed) == 1 else "higher manager"
    boss = brow.reports_to
pick = None
for u in order:
    if u == emp.user_id:
        continue
    urow = frappe.db.get_value("User", {"name": u, "enabled": 1}, ["name", "full_name"], as_dict=True)
    if not urow:
        continue
    uemp = frappe.db.get_value("Employee", {"user_id": u}, ["name", "status"], as_dict=True)
    if uemp and uemp.status != "Active":
        continue
    away = False
    if uemp:
        away = frappe.db.count("Leave Application", {"employee": uemp.name, "status": "Approved", "docstatus": 1, "from_date": ["<=", day], "to_date": [">=", day]}) > 0
    cand = {"email": u, "name": urow.full_name or u, "source": src.get(u), "on_leave": away}
    cands.append(cand)
    if not away and not pick:
        pick = cand
if not pick and cands:
    pick = cands[0]
`;

const EMP_FIELDS = `["name", "user_id", "department", "leave_approver", "expense_approver", "company", "reports_to"]`;

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
    if pick and (not doc.leave_approver or doc.leave_approver == emp.user_id or (current and current["on_leave"] and not pick["on_leave"])):
        doc.leave_approver = pick["email"]
        doc.leave_approver_name = pick["name"]
`;

/** Before Validate on Expense Claim: currency / exchange rate, and the approver from the expense type. */
const EXPENSE_PREPARE = `
if doc.docstatus == 0:
    if not doc.company and doc.employee:
        doc.company = frappe.db.get_value("Employee", doc.employee, "company")
    meta = frappe.get_meta("Expense Claim")
    if doc.company:
        # what ERPNext's desk form fills from the Company: payable account and cost centers (needed to approve)
        if meta.has_field("payable_account") and not doc.payable_account and not doc.is_paid and frappe.get_meta("Company").has_field("default_expense_claim_payable_account"):
            doc.payable_account = frappe.db.get_value("Company", doc.company, "default_expense_claim_payable_account")
        if not doc.cost_center:
            doc.cost_center = frappe.db.get_value("Company", doc.company, "cost_center")
        for erow in doc.get("expenses") or []:
            if not erow.cost_center:
                erow.cost_center = doc.cost_center
    if meta.has_field("exchange_rate") and doc.company:
        base = frappe.db.get_value("Company", doc.company, "default_currency")
        multi = frappe.db.get_single_value("HR Settings", "enable_multi_currency_expense_claim") if frappe.get_meta("HR Settings").has_field("enable_multi_currency_expense_claim") else 0
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
if frappe.session.user != "Administrator" and frappe.db.get_value("Employee", doc.employee, "user_id") == frappe.session.user:
    frappe.throw("You can't approve or reject your own expense claim - it goes to " + (doc.expense_approver or "your approver") + ".")
if doc.expense_approver and frappe.session.user != doc.expense_approver and not is_hr:
    frappe.throw("Only the claim's expense approver (" + doc.expense_approver + ") or HR can approve or reject it.")
if doc.approval_status == "Approved":
    bills = frappe.db.count("File", {"attached_to_doctype": "Expense Claim", "attached_to_name": doc.name})
    if not bills:
        frappe.throw("Attach the bill / receipt to this claim before it can be approved.")
if doc.approval_status == "Rejected" and len((doc.remark or "").strip()) < 5:
    frappe.throw("State the reason for rejecting this claim (in Remark) - the employee sees it.")
`;

/** Before Submit on Leave Application: only the assigned approver decides. HR can change the approver, not decide for them. */
const LEAVE_NOT_OWN = `
if doc.status in ("Approved", "Rejected") and frappe.session.user != "Administrator":
    if frappe.db.get_value("Employee", doc.employee, "user_id") == frappe.session.user:
        frappe.throw("You can't approve or reject your own leave - it goes to " + (doc.leave_approver_name or doc.leave_approver or "your approver") + ".")
    if not doc.leave_approver:
        frappe.throw("This leave has no approver yet. Set one first.")
    if frappe.session.user != doc.leave_approver:
        frappe.throw("Only the assigned approver (" + (doc.leave_approver_name or doc.leave_approver) + ") can approve or reject this leave.")
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
            cemp = frappe.db.get_value("Employee", {"user_id": cur}, ["name", "status"], as_dict=True)
            gone = not frappe.db.get_value("User", {"name": cur, "enabled": 1}, "name") or (cemp and cemp.status != "Active")
            if not gone and (not cemp or not frappe.db.count("Leave Application", {"employee": cemp.name, "status": "Approved", "docstatus": 1, "from_date": ["<=", today], "to_date": [">=", today]})):
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
        frappe.get_doc({"doctype": "Comment", "comment_type": "Info", "reference_doctype": kind, "reference_name": rec.name, "content": "Approver changed from " + (cur or "none") + " to " + pick["email"] + " (previous approver on leave or no longer here)"}).insert(ignore_permissions=True)
        moved.append(rec.name)
`;

const REROUTE_API = `
${HR_CHECK.trim()}
if not is_hr:
    frappe.throw("Only HR can re-route approvals.")
${REROUTE.trim()}
frappe.response["message"] = {"moved": moved}
`;

// HR hands over everything a person is responsible for to a successor (when they leave, or for a long absence):
// pending leave / expense approvals, their approver roles (Employee records, business units, expense types) and their
// direct reports. preview=1 only counts. Projects they manage are moved by the page through ethx_set_project_manager,
// which also grants / removes the workspace role.
const HANDOVER_API = `
${HR_CHECK.trim()}
if not is_hr:
    frappe.throw("Only HR can hand over someone's work.")
args = frappe.form_dict
src_emp = frappe.db.get_value("Employee", args.get("employee"), ["name", "employee_name", "user_id"], as_dict=True) if args.get("employee") else None
if not src_emp:
    frappe.throw("Employee not found.")
preview = str(args.get("preview") or "0") in ("1", "true", "True")
old = src_emp.user_id
to = (args.get("to_user") or "").strip()
to_emp = None
if not preview:
    if not to:
        frappe.throw("Choose who takes over.")
    if to == old:
        frappe.throw("Choose someone else to take over.")
    if not frappe.db.get_value("User", {"name": to, "enabled": 1}, "name"):
        frappe.throw("The person taking over has no active login.")
    to_emp = frappe.db.get_value("Employee", {"user_id": to}, ["name", "employee_name"], as_dict=True)
reports = frappe.get_all("Employee", filters={"reports_to": src_emp.name, "status": "Active"}, fields=["name", "employee_name"])
leaves = frappe.get_all("Leave Application", filters={"leave_approver": old, "docstatus": 0, "status": "Open"}, fields=["name", "employee_name"]) if old else []
claims = frappe.get_all("Expense Claim", filters={"expense_approver": old, "docstatus": 0, "approval_status": "Draft"}, fields=["name", "employee_name"]) if old else []
leave_of = frappe.get_all("Employee", filters={"leave_approver": old, "status": "Active"}, pluck="name") if old else []
expense_of = frappe.get_all("Employee", filters={"expense_approver": old, "status": "Active"}, pluck="name") if old else []
units = frappe.get_all("Department Approver", filters={"approver": old, "parenttype": "Department"}, fields=["name", "parent"]) if old else []
types = []
if old and frappe.get_meta("Expense Claim Type").has_field("expense_approver"):
    types = frappe.get_all("Expense Claim Type", filters={"expense_approver": old}, pluck="name")
projects = frappe.get_all("Project", filters={"custom_project_manager": old, "status": "Open"}, fields=["name", "project_name"]) if old else []
summary = {"reports": reports, "leaves": leaves, "claims": claims, "leave_approver_of": len(leave_of), "expense_approver_of": len(expense_of), "units": sorted(list(set([u.parent for u in units]))), "expense_types": types, "projects": projects}
if not preview:
    if reports and not to_emp:
        frappe.throw("The person taking over needs an Employee record to manage " + src_emp.employee_name + "'s team.")
    by = frappe.session.user
    for r in reports:
        frappe.db.set_value("Employee", r.name, "reports_to", to_emp.name)
    for e in leave_of:
        frappe.db.set_value("Employee", e, "leave_approver", to)
    for e in expense_of:
        frappe.db.set_value("Employee", e, "expense_approver", to)
    for u in units:
        frappe.db.set_value("Department Approver", u.name, "approver", to)
    for t in types:
        frappe.db.set_value("Expense Claim Type", t, "expense_approver", to)
    jobs = [["Leave Application", "leave_approver", leaves], ["Expense Claim", "expense_approver", claims]]
    for job in jobs:
        for rec in job[2]:
            upd = {job[1]: to}
            if job[0] == "Leave Application":
                upd["leave_approver_name"] = frappe.db.get_value("User", to, "full_name") or to
            frappe.db.set_value(job[0], rec.name, upd)
            try:
                frappe.get_doc({"doctype": "DocShare", "user": to, "share_doctype": job[0], "share_name": rec.name, "read": 1, "write": 1, "submit": 1}).insert(ignore_permissions=True)
            except Exception:
                pass
            frappe.get_doc({"doctype": "Comment", "comment_type": "Info", "reference_doctype": job[0], "reference_name": rec.name, "content": "Approver changed from " + old + " to " + to + " (handover)"}).insert(ignore_permissions=True)
    frappe.get_doc({"doctype": "Comment", "comment_type": "Info", "reference_doctype": "Employee", "reference_name": src_emp.name, "content": "Work handed over from " + (src_emp.employee_name or old or src_emp.name) + " to " + to + " by " + by}).insert(ignore_permissions=True)
frappe.response["message"] = summary
`;

// BUG-010: a leave's day count leaves out weekly offs and holidays (unless the leave type counts them). ERPNext does this
// only from the employee's Holiday List; employees without one, or whose list lacks the weekly offs, were charged for
// Saturdays and Sundays. This also uses the office's weekly offs (Branch › Weekly Offs) and the company's holiday list.
// It only ever lowers the count ERPNext worked out.
const LEAVE_DAYS = `
if doc.docstatus == 0 and doc.from_date and doc.to_date and doc.employee and doc.leave_type and not frappe.db.get_value("Leave Type", doc.leave_type, "include_holiday"):
    emp = frappe.db.get_value("Employee", doc.employee, ["holiday_list", "branch", "company"], as_dict=True) or {}
    hl = emp.get("holiday_list")
    offs = []
    if emp.get("branch") and frappe.get_meta("Branch").has_field("custom_weekly_offs"):
        brow = frappe.db.get_value("Branch", emp.get("branch"), ["custom_weekly_offs", "custom_holiday_list"], as_dict=True) or {}
        offs = [w.strip().lower() for w in (brow.get("custom_weekly_offs") or "").split(",") if w.strip()]
        hl = hl or brow.get("custom_holiday_list")
    if not hl and emp.get("company"):
        hl = frappe.db.get_value("Company", emp.get("company"), "default_holiday_list")
    names = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]
    day = frappe.utils.getdate(doc.from_date)
    end = frappe.utils.getdate(doc.to_date)
    days = 0
    while day <= end:
        off = names[day.weekday()] in offs or (hl and frappe.db.exists("Holiday", {"parent": hl, "holiday_date": day}))
        if not off:
            days = days + 1
        day = frappe.utils.add_days(day, 1)
    if days == 0:
        frappe.throw("Every day from " + frappe.utils.formatdate(doc.from_date) + " to " + frappe.utils.formatdate(doc.to_date) + " is a weekly off or holiday. No leave is needed.")
    if doc.half_day:
        days = days - 0.5
    if days < float(doc.total_leave_days or 0):
        doc.total_leave_days = days
`;

export const APPROVAL_SCRIPTS = [
  { name: "ETHX - Leave days skip offs", script_type: "DocType Event", reference_doctype: "Leave Application", doctype_event: "Before Save", script: LEAVE_DAYS, what: "Leave day counts leave out weekly offs and holidays (office weekly offs and holiday lists)" },
  { name: "ETHX - Handover", script_type: "API", api_method: "ethx_handover", script: HANDOVER_API, what: "HR hands a leaver's approvals, approver roles and direct reports over to a successor" },
  { name: "ETHX - Approvers", script_type: "API", api_method: "ethx_approvers", script: APPROVERS_API, what: "Approver lookup: business-unit leave approvers, expense-type approvers, availability" },
  { name: "ETHX - Leave approver assign", script_type: "DocType Event", reference_doctype: "Leave Application", doctype_event: "Before Insert", script: LEAVE_ASSIGN, what: "New leave goes to an available business-unit approver" },
  { name: "ETHX - Leave not own", script_type: "DocType Event", reference_doctype: "Leave Application", doctype_event: "Before Submit", script: LEAVE_NOT_OWN, what: "Only the assigned approver approves or rejects leave, and never their own" },
  { name: "ETHX - Expense claim prepare", script_type: "DocType Event", reference_doctype: "Expense Claim", doctype_event: "Before Validate", script: EXPENSE_PREPARE, what: "Expense claims get currency, exchange rate and the expense type's approver" },
  { name: "ETHX - Expense claim decision", script_type: "DocType Event", reference_doctype: "Expense Claim", doctype_event: "Before Submit", script: EXPENSE_DECIDE, what: "Only the approver decides; approval needs a bill, rejection needs a reason" },
  { name: "ETHX - Reroute approvals", script_type: "API", api_method: "ethx_reroute_approvals", script: REROUTE_API, what: "HR moves pending requests away from approvers on leave" },
  { name: "ETHX - Reroute approvals daily", script_type: "Scheduler Event", event_frequency: "Daily", script: REROUTE, what: "Every day, pending requests move away from approvers on leave" },
];