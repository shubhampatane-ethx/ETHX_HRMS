// Leave and expense approvers. Everything here reads or writes standard ERPNext data (Department approver
// tables, Leave Application, Expense Claim, Expense Claim Type) - there is no separate backend.
//
//  - "BU" (business unit) is the employee's ERPNext Department. ERPNext's own get_approvers() resolves the
//    approvers from the Department (and its parent departments).
//  - If an approver is on approved leave for the requested dates, the next approver in the list is used.
//  - The expense approver comes from the Expense Claim Type (a custom "Expense Approver" field we add once).
import { frappe } from "./api/frappeClient";
import { listTry, stripHtml } from "./employeePortal";

export const LEAVE_ROLE = "Leave Approver";
export const EXPENSE_ROLE = "Expense Approver";

/** Custom fields added to Expense Claim Type so each type can name its approver. */
export const TYPE_FIELDS = [
  { fieldname: "expense_approver", label: "Expense Approver", fieldtype: "Link", options: "User", insert_after: "description" },
  { fieldname: "expense_approver_name", label: "Expense Approver Name", fieldtype: "Data", read_only: 1, fetch_from: "expense_approver.full_name", insert_after: "expense_approver" },
];

const APPROVER_FN = [
  "hrms.hr.doctype.leave_application.leave_application.get_approvers",
  "erpnext.hr.doctype.leave_application.leave_application.get_approvers",
];

/** The approvers of an employee's business unit (Department tree), highest priority first. */
export async function getBuApprovers(employee, doctype = "Leave Application") {
  for (const fn of APPROVER_FN) {
    try {
      const rows = await frappe.callMethod(fn, { doctype: "User", txt: "", searchfield: "name", start: 0, page_len: 100, filters: { employee: employee.name, doctype } });
      const seen = new Set();
      return (rows || [])
        .map(([email, first, last]) => ({ email, name: [first, last].filter(Boolean).join(" ") || email }))
        .filter((a) => a.email && a.email !== employee.user_id && !seen.has(a.email) && seen.add(a.email));
    } catch { /* try the next path / fall back */ }
  }
  // none configured for the business unit -> the approver set on the Employee record itself
  const own = doctype === "Leave Application" ? employee.leave_approver : employee.expense_approver;
  return own ? [{ email: own, name: own }] : [];
}

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
export const pickApprover = (list, off) => list.find((a) => !off.has(a.email)) || list[0] || null;

/** Expense approver: the expense type's approver, else the employee's own, else the business unit's. */
export async function getExpenseApprover(employee, type) {
  if (type) {
    try {
      const t = await frappe.getDoc("Expense Claim Type", type);
      if (t.expense_approver) return { email: t.expense_approver, name: t.expense_approver_name || t.expense_approver, source: "expense type" };
    } catch { /* type unreadable */ }
  }
  if (employee.expense_approver) return { email: employee.expense_approver, name: employee.expense_approver, source: "employee" };
  const bu = await getBuApprovers(employee, "Expense Claim");
  return bu[0] ? { ...bu[0], source: "business unit" } : null;
}

/* ---------------------- what an approver has to decide ---------------------- */

export async function getWaitingForMe(email) {
  const [leaves, expenses] = await Promise.allSettled([
    listTry("Leave Application", { filters: [["leave_approver", "=", email], ["status", "=", "Open"], ["docstatus", "=", 0]], fields: ["name", "employee", "employee_name", "department", "leave_type", "from_date", "to_date", "total_leave_days", "half_day", "description"], orderBy: "from_date asc" }, ["name", "employee_name", "leave_type", "from_date", "to_date", "total_leave_days"]),
    listTry("Expense Claim", { filters: [["expense_approver", "=", email], ["approval_status", "=", "Draft"], ["docstatus", "=", 0]], fields: ["name", "employee", "employee_name", "posting_date", "total_claimed_amount"], orderBy: "posting_date asc" }, ["name", "employee_name", "posting_date", "total_claimed_amount"]),
  ]);
  let bills = {};
  if (expenses.status === "fulfilled" && expenses.value.length) {
    try {
      const files = await frappe.getList("File", { filters: [["attached_to_doctype", "=", "Expense Claim"], ["attached_to_name", "in", expenses.value.map((x) => x.name)]], fields: ["attached_to_name", "file_name", "file_url"], limit: 0 });
      files.forEach((f) => { (bills[f.attached_to_name] = bills[f.attached_to_name] || []).push(f); });
    } catch { bills = {}; }
  }
  return {
    leaves: leaves.status === "fulfilled" ? leaves.value : [],
    expenses: expenses.status === "fulfilled" ? expenses.value : [],
    bills,
    failed: [leaves.status === "rejected" && "leave", expenses.status === "rejected" && "expense"].filter(Boolean),
  };
}

/** Approve / reject a leave application: ERPNext wants the status set and the document submitted. */
export async function decideLeave(name, status) {
  await frappe.updateDoc("Leave Application", name, { status });
  await frappe.submitDoc(await frappe.getDoc("Leave Application", name));
}

/** Approve / reject an expense claim. A rejection must carry a reason (kept in the claim's remark and as a comment). */
export async function decideExpense(name, approved, reason = "") {
  if (!approved) {
    if (reason.trim().length < 5) throw new Error("Please state why the claim is rejected (at least a few words).");
    try {
      await frappe.updateDoc("Expense Claim", name, { approval_status: "Rejected", remark: reason.trim() });
    } catch (e) {
      if (e?.response?.data?.exc_type === "PermissionError") throw e;
      await frappe.updateDoc("Expense Claim", name, { approval_status: "Rejected" }); // site without a remark field
    }
    try { await frappe.createDoc("Comment", { comment_type: "Comment", reference_doctype: "Expense Claim", reference_name: name, content: `Rejected: ${reason.trim()}` }); } catch { /* comment is a bonus */ }
  } else {
    await frappe.updateDoc("Expense Claim", name, { approval_status: "Approved" });
  }
  await frappe.submitDoc(await frappe.getDoc("Expense Claim", name));
}

/** Rejection reasons for a list of claims (from the comment, for sites where the remark isn't available). */
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
export const reassignLeave = (name, email) => frappe.updateDoc("Leave Application", name, { leave_approver: email });

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