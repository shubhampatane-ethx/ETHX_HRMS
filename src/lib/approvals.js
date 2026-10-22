// Leave and expense approvers. Everything here reads or writes standard ERPNext data (Department approver
// tables, Leave Application, Expense Claim, Expense Claim Type) plus the "Leave & expense approvals" server rules
// installed from Admin › ERPNext Setup (src/lib/approvalSetup.js).
//
//  - "BU" (business unit) is the employee's ERPNext Department. Its leave approvers (and its parent departments')
//    come first, then the approver on the Employee record.
//  - The expense approver comes from the Expense Claim Type (custom "Expense Approver" field), then the BU's
//    expense approvers, then the Employee record.
//  - An approver who is on approved leave today is skipped - the next one in the list is used.
import { frappe } from "./api/frappeClient";
import { isoDate, listTry, stripHtml } from "./employeePortal";
import { APPROVAL_FIELDS } from "./approvalSetup";

export const LEAVE_ROLE = "Leave Approver";
export const EXPENSE_ROLE = "Expense Approver";

/** Custom fields added to Expense Claim Type so each type can name its approver. */
export const TYPE_FIELDS = APPROVAL_FIELDS.filter((f) => f.dt === "Expense Claim Type").map(({ dt: _dt, ...f }) => f);

const HRMS_APPROVERS = [
  "hrms.hr.doctype.department_approver.department_approver.get_approvers",
  "erpnext.hr.doctype.department_approver.department_approver.get_approvers", // pre-HRMS ERPNext (v13)
];

const notInstalled = (e) => e?.response?.status === 404 || /not found|not whitelisted|has no attribute|Failed to get method|No module named/i.test(String(e?.response?.data?.exception || e?.response?.data?.exc || ""));

async function userNames(emails) {
  if (!emails.length) return {};
  try {
    const rows = await frappe.getList("User", { filters: [["name", "in", emails]], fields: ["name", "full_name"], limit: 0 });
    return Object.fromEntries(rows.map((r) => [r.name, r.full_name || r.name]));
  } catch {
    return {};
  }
}

/**
 * Approvers for an employee, highest priority first: [{ email, name, source, on_leave }].
 * `list.checked` is true when availability (on_leave) was worked out on the server.
 */
export async function getApprovers(employee, doctype = "Leave Application", expenseType = "") {
  try {
    const r = await frappe.callMethod("ethx_approvers", { employee: employee.name, doctype, expense_type: expenseType || undefined });
    const list = r?.approvers || [];
    list.checked = true;
    return list;
  } catch (e) {
    if (!notInstalled(e)) {
      // the rule is installed but refused (e.g. no permission) - fall through to the standard ERPNext lookup
    }
  }
  // Standard ERPNext / HRMS lookup (no server rules installed yet)
  let rows = null;
  for (const fn of HRMS_APPROVERS) {
    try {
      rows = await frappe.callMethod(fn, { doctype: "User", txt: "", searchfield: "name", start: 0, page_len: 100, filters: { employee: employee.name, doctype } });
      break;
    } catch { /* try the next path */ }
  }
  const own = doctype === "Leave Application" ? employee.leave_approver : employee.expense_approver;
  const seen = new Set();
  let list = (rows || [])
    .map(([email, first, last]) => ({ email, name: [first, last].filter(Boolean).join(" ") || email, source: email === own ? "employee record" : "business unit" }))
    .filter((a) => a.email && a.email !== employee.user_id && !seen.has(a.email) && seen.add(a.email));
  if (own && !seen.has(own) && own !== employee.user_id) list.push({ email: own, name: own, source: "employee record" });
  // HRMS puts the Employee record's approver first; the business unit comes first here
  list = [...list.filter((a) => a.source !== "employee record"), ...list.filter((a) => a.source === "employee record")];
  if (doctype === "Expense Claim" && expenseType) {
    try {
      const t = await frappe.getDoc("Expense Claim Type", expenseType);
      if (t.expense_approver && t.expense_approver !== employee.user_id) list = [{ email: t.expense_approver, name: t.expense_approver_name || t.expense_approver, source: "expense type" }, ...list.filter((a) => a.email !== t.expense_approver)];
    } catch { /* type unreadable */ }
  }
  const names = await userNames(list.filter((a) => a.name === a.email).map((a) => a.email));
  list = list.map((a) => ({ ...a, name: names[a.email] || a.name }));
  const { off, known } = await approversOnLeave(list.map((a) => a.email), isoDate(), isoDate());
  list = list.map((a) => ({ ...a, on_leave: off.has(a.email) }));
  list.checked = known;
  return list;
}

/** Backwards-compatible name: approvers of the employee's business unit. */
export const getBuApprovers = (employee, doctype = "Leave Application") => getApprovers(employee, doctype);

/** Approvers who are on approved leave at some point in [from, to]. `known` is false when we couldn't read their leave. */
export async function approversOnLeave(emails, from, to) {
  if (!emails.length) return { off: new Set(), known: true };
  try {
    const emps = await frappe.getList("Employee", { filters: [["user_id", "in", emails]], fields: ["name", "user_id"], limit: 0 });
    if (!emps.length) return { off: new Set(), known: false };
    const leaves = await frappe.getList("Leave Application", { filters: [["employee", "in", emps.map((e) => e.name)], ["status", "=", "Approved"], ["docstatus", "=", 1], ["from_date", "<=", to], ["to_date", ">=", from]], fields: ["employee"], limit: 0 });
    const off = new Set(leaves.map((l) => emps.find((e) => e.name === l.employee)?.user_id).filter(Boolean));
    return { off, known: true };
  } catch {
    return { off: new Set(), known: false };
  }
}

/** First approver who is available; otherwise the first in the list. */
export const pickApprover = (list, off = new Set()) => list.find((a) => !a.on_leave && !off.has(a.email)) || list[0] || null;

/** Expense approver for a claim of this type: [approver, full list]. */
export async function getExpenseApprover(employee, type) {
  const list = await getApprovers(employee, "Expense Claim", type);
  return pickApprover(list);
}

/* ---------------------- what an approver has to decide ---------------------- */

const LEAVE_FIELDS = ["name", "employee", "employee_name", "department", "leave_type", "from_date", "to_date", "total_leave_days", "half_day", "description"];

/** Leave waiting for me: the manager rule (ethx_my_team) also covers direct reports; else plain approver filter. */
async function leavesWaitingFor(email) {
  try {
    const r = await frappe.callMethod("ethx_my_team");
    return r?.leave || [];
  } catch (e) {
    if (!notInstalled(e) && e?.response?.data?.exc_type === "PermissionError") throw e;
  }
  return listTry("Leave Application", { filters: [["leave_approver", "=", email], ["status", "=", "Open"], ["docstatus", "=", 0]], fields: LEAVE_FIELDS, orderBy: "from_date asc" }, ["name", "employee_name", "leave_type", "from_date", "to_date", "total_leave_days"]);
}

export async function getWaitingForMe(email) {
  const [leaves, expenses] = await Promise.allSettled([
    leavesWaitingFor(email),
    listTry("Expense Claim", { filters: [["expense_approver", "=", email], ["approval_status", "=", "Draft"], ["docstatus", "=", 0]], fields: ["name", "employee", "employee_name", "posting_date", "total_claimed_amount", "currency"], orderBy: "posting_date asc" }, ["name", "employee_name", "posting_date", "total_claimed_amount"]),
  ]);
  let bills = {};
  let types = {};
  if (expenses.status === "fulfilled" && expenses.value.length) {
    const names = expenses.value.map((x) => x.name);
    const [files, rows] = await Promise.allSettled([
      frappe.getList("File", { filters: [["attached_to_doctype", "=", "Expense Claim"], ["attached_to_name", "in", names]], fields: ["attached_to_name", "file_name", "file_url"], limit: 0 }),
      frappe.getList("Expense Claim Detail", { filters: [["parent", "in", names]], fields: ["parent", "expense_type", "description", "expense_date"], parent: "Expense Claim", limit: 0 }),
    ]);
    if (files.status === "fulfilled") files.value.forEach((f) => { (bills[f.attached_to_name] = bills[f.attached_to_name] || []).push(f); });
    if (rows.status === "fulfilled") rows.value.forEach((r) => { (types[r.parent] = types[r.parent] || []).push(r); });
  }
  return {
    leaves: leaves.status === "fulfilled" ? leaves.value : [],
    expenses: expenses.status === "fulfilled" ? expenses.value : [],
    bills,
    lines: types,
    failed: [leaves.status === "rejected" && "leave", expenses.status === "rejected" && "expense"].filter(Boolean),
  };
}

/** Approve / reject a leave application. A rejection must carry a reason (stored as a comment on the application). */
export async function decideLeave(name, status, note = "") {
  note = note.trim();
  if (status === "Rejected" && note.length < 3) throw new Error("Please give the reason for rejecting this leave.");
  try {
    // server rule: the leave approver or the employee's manager decides, never the employee themself
    return await frappe.callMethod("ethx_team_leave_decision", { leave: name, status, note });
  } catch (e) {
    if (!notInstalled(e)) throw e;
  }
  await decideLeaveDirect(name, status, note);
}

/** HR: decide directly (HRMS needs the status set and the application submitted, in one call). */
export async function decideLeaveDirect(name, status, note = "") {
  note = note.trim();
  if (status === "Rejected" && note.length < 3) throw new Error("Please give the reason for rejecting this leave.");
  const doc = await frappe.getDoc("Leave Application", name);
  doc.status = status;
  await frappe.submitDoc(doc);
  if (note) { try { await frappe.createDoc("Comment", { comment_type: "Comment", reference_doctype: "Leave Application", reference_name: name, content: `${status}: ${note}` }); } catch { /* comment is a bonus */ } }
}

/** Approve / reject an expense claim. A rejection must carry a reason (kept in the claim's remark and as a comment). */
export async function decideExpense(name, approved, reason = "") {
  const doc = await frappe.getDoc("Expense Claim", name);
  if (!approved) {
    if (reason.trim().length < 5) throw new Error("Please state why the claim is rejected (at least a few words).");
    doc.approval_status = "Rejected";
    doc.remark = reason.trim();
    try { await frappe.createDoc("Comment", { comment_type: "Comment", reference_doctype: "Expense Claim", reference_name: name, content: `Rejected: ${reason.trim()}` }); } catch { /* comment is a bonus */ }
  } else {
    doc.approval_status = "Approved";
    // ERPNext pays out the sanctioned amount; default it to what was claimed
    (doc.expenses || []).forEach((row) => { if (!Number(row.sanctioned_amount)) row.sanctioned_amount = row.amount; });
    await fillBookingAccounts(doc);
  }
  // one call: save the decision and submit (a separate save + submit leaves a half-decided draft if submit fails)
  await frappe.submitDoc(doc);
}

/** The Company's accounting defaults used to book expense claims. */
export async function companyExpenseDefaults(company) {
  try {
    const rows = await frappe.getList("Company", { filters: [["name", "=", company]], fields: ["name", "default_expense_claim_payable_account", "default_payable_account", "cost_center"], limit: 1 });
    return rows[0] || {};
  } catch {
    return {};
  }
}

/**
 * Approving books the claim in the accounts, so ERPNext needs a payable account, a cost center and an expense
 * account on every line. ERPNext's desk form fills these from the Company / Expense Claim Type; do the same here.
 */
async function fillBookingAccounts(doc) {
  const c = await companyExpenseDefaults(doc.company);
  if (!doc.payable_account && !Number(doc.is_paid)) doc.payable_account = c.default_expense_claim_payable_account || "";
  if (!doc.cost_center) doc.cost_center = c.cost_center || "";
  for (const row of doc.expenses || []) {
    if (!row.cost_center) row.cost_center = doc.cost_center || c.cost_center || "";
    if (!row.default_account && row.expense_type) {
      try {
        const r = await frappe.callMethod("hrms.hr.doctype.expense_claim.expense_claim.get_expense_claim_account_and_cost_center", { expense_claim_type: row.expense_type, company: doc.company });
        row.default_account = r?.account || "";
        if (!row.cost_center) row.cost_center = r?.cost_center || "";
      } catch { /* ERPNext reports a missing expense account itself */ }
    }
  }
  if (!c.name) return; // Company not readable by this user - ERPNext reports what's missing
  const missing = [];
  if (!doc.payable_account && !Number(doc.is_paid)) missing.push(`the Default Expense Claim Payable Account of company ${doc.company}`);
  if ((doc.expenses || []).some((r) => !r.cost_center)) missing.push(`the Default Cost Center of company ${doc.company}`);
  if (missing.length) throw new Error(`Accounts setup needed before claims can be approved: set ${missing.join(" and ")} (ERPNext › Company › HR & Payroll / Accounts).`);
}


/** Rejection reasons for a list of claims (from the comment, for claims rejected before the remark was kept). */
export async function getRejectionReasons(names) {
  if (!names.length) return {};
  try {
    const rows = await frappe.getList("Comment", { filters: [["reference_doctype", "=", "Expense Claim"], ["reference_name", "in", names], ["comment_type", "=", "Comment"], ["content", "like", "%Rejected:%"]], fields: ["reference_name", "content"], orderBy: "creation asc", limit: 0 });
    return Object.fromEntries(rows.map((r) => [r.reference_name, stripHtml(r.content).replace(/^.*?Rejected:\s*/i, "")]));
  } catch {
    return {};
  }
}

/** HR / admin: move a pending leave application to another approver. */
export async function reassignLeave(name, email, displayName) {
  await frappe.updateDoc("Leave Application", name, { leave_approver: email, ...(displayName ? { leave_approver_name: displayName } : {}) });
}

/** HR: move every pending leave / expense request away from approvers on leave today (server rule). */
export async function rerouteUnavailable() {
  const r = await frappe.callMethod("ethx_reroute_approvals");
  return r?.moved || [];
}

/* --------------------------- configuration (admin) --------------------------- */

/** Give a user the ERPNext role their approver duty needs. */
export async function ensureRole(email, role) {
  const doc = await frappe.getDoc("User", email);
  const roles = (doc.roles || []).map((r) => r.role);
  if (roles.includes(role)) return;
  await frappe.updateDoc("User", email, { roles: [...roles, role].map((r) => ({ role: r })) });
}

export async function missingTypeFields() {
  const have = await frappe.getList("Custom Field", { filters: [["dt", "=", "Expense Claim Type"], ["fieldname", "in", TYPE_FIELDS.map((f) => f.fieldname)]], fields: ["fieldname"], limit: 0 });
  return TYPE_FIELDS.filter((f) => !have.some((h) => h.fieldname === f.fieldname));
}

export async function createTypeFields() {
  for (const f of await missingTypeFields()) await frappe.createDoc("Custom Field", { dt: "Expense Claim Type", ...f });
}

/* ------------------------------ creating claims ------------------------------ */

/** Company currency (for the claim's currency / exchange rate on multi-currency ERPNext). */
export async function companyCurrency(company) {
  try {
    const rows = await frappe.getList("Company", { filters: [["name", "=", company]], fields: ["default_currency"], limit: 1 });
    if (rows[0]?.default_currency) return rows[0].default_currency;
  } catch { /* employees may not read Company */ }
  try {
    const boot = await frappe.client.get("/method/frappe.client.get_value", { params: { doctype: "Global Defaults", fieldname: "default_currency", filters: "Global Defaults" } });
    return boot.data?.message?.default_currency || "";
  } catch {
    return "";
  }
}

/**
 * Create an expense claim with its bills. The bills are mandatory: if none can be uploaded the claim is removed again.
 * lines: [{ expense_date, expense_type, description, amount }]
 */
export async function createExpenseClaim({ employee, lines, approver, files, remark }) {
  if (!files?.length) throw new Error("Attach at least one bill or receipt - it is required for every claim.");
  const currency = await companyCurrency(employee.company);
  const doc = await frappe.createDoc("Expense Claim", {
    employee: employee.name,
    company: employee.company,
    posting_date: isoDate(),
    ...(currency ? { currency, exchange_rate: 1 } : { exchange_rate: 1 }),
    ...(approver ? { expense_approver: approver } : {}),
    ...(remark ? { remark } : {}),
    expenses: lines.map((l) => ({ ...l, amount: Number(l.amount), sanctioned_amount: Number(l.amount) })),
  });
  let uploaded = 0;
  for (const file of files) {
    try { await frappe.uploadFile(file, { doctype: "Expense Claim", docname: doc.name, isPrivate: true }); uploaded += 1; } catch { /* counted below */ }
  }
  if (!uploaded) {
    try {
      await frappe.deleteDoc("Expense Claim", doc.name);
    } catch {
      throw new Error(`The bill couldn't be uploaded. Claim ${doc.name} was saved without it - use "Add bill" on it under My claims. It can't be approved until a bill is attached.`);
    }
    throw new Error("The bill couldn't be uploaded, so the claim was not created. Please try again.");
  }
  return { doc, failed: files.length - uploaded };
}

/** Attach more bills to an existing (draft) claim. */
export async function addBills(claim, files) {
  let failed = 0;
  for (const file of files) {
    try { await frappe.uploadFile(file, { doctype: "Expense Claim", docname: claim, isPrivate: true }); } catch { failed += 1; }
  }
  if (failed === files.length) throw new Error("The bill couldn't be uploaded. Please try again.");
  return failed;
}

/** Number of bills attached to each claim: { claimName: count }. */
export async function billCounts(names) {
  if (!names.length) return {};
  try {
    const files = await frappe.getList("File", { filters: [["attached_to_doctype", "=", "Expense Claim"], ["attached_to_name", "in", names]], fields: ["attached_to_name"], limit: 0 });
    const out = {};
    files.forEach((f) => { out[f.attached_to_name] = (out[f.attached_to_name] || 0) + 1; });
    return out;
  } catch {
    return null;
  }
}
