// Employee portal: helpers, settings, async hook and ERPNext API calls in one file.
import { useEffect, useRef, useState } from "react";
import { frappe } from "./api/frappeClient";
import { getReviewsSafe, listTimesheets, reviewOf } from "./timesheets";

/* ===== employeeUtils.js ===== */
export const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const MONTHS_LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
export const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export const pad = (n) => String(n).padStart(2, "0");
export const isoDate = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const nowStamp = (d = new Date()) => `${isoDate(d)} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;

/** "2026-09-29" or "2026-09-29 09:30:00" -> "29/09/2026" */
export function dmy(v) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v || "");
  return m ? `${m[3]}/${m[2]}/${m[1]}` : "";
}
export function hm(v) {
  const m = /[ T](\d{2}):(\d{2})/.exec(v || "");
  return m ? `${m[1]}:${m[2]}` : "";
}
export const dmyHm = (v) => (v ? `${dmy(v)} ${hm(v)}`.trim() : "");

export function addDays(iso, n) {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return isoDate(new Date(y, m - 1, d + n));
}
export function daysUntil(iso) {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  const t = new Date();
  return Math.round((new Date(y, m - 1, d) - new Date(t.getFullYear(), t.getMonth(), t.getDate())) / 86400000);
}
/** Inclusive number of calendar days between two ISO dates. */
export function daysBetween(from, to) {
  if (!from || !to) return 0;
  return daysUntil(to) - daysUntil(from) + 1;
}

export function stripHtml(html = "") {
  return String(html)
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

export function hoursLabel(h) {
  const n = Number(h) || 0;
  const hh = Math.floor(n);
  return `${hh}h ${pad(Math.round((n - hh) * 60))}m`;
}

export function money(n, currency = "INR") {
  try {
    return new Intl.NumberFormat("en-IN", { style: "currency", currency, maximumFractionDigits: 2 }).format(Number(n) || 0);
  } catch {
    return String(n ?? 0);
  }
}

export function errMsg(e, fallback = "Something went wrong. Please try again.") {
  const forDisplay = (message) => String(message).replace(/\berpnext\b/gi, "HRMS");
  if (e?.userMessage) return e.userMessage; // written for people by this app
  try {
    const raw = e?.response?.data?._server_messages;
    if (raw) {
      const first = JSON.parse(JSON.parse(raw)[0]);
      if (first?.message) return forDisplay(stripHtml(first.message));
    }
  } catch {
    /* ignore */
  }
  const exc = e?.response?.data?.exception;
  if (exc) return forDisplay(stripHtml(String(exc).split(": ").slice(1).join(": ") || exc));
  return forDisplay(fallback);
}

/** Friendly text for a failed read - most failures here are ERPNext permissions or a feature not enabled on the site. */
export function friendlyError(e) {
  const status = e?.response?.status;
  const type = e?.response?.data?.exc_type;
  if (type === "PermissionError" || status === 403) return "Your account doesn't have access to this yet. Ask your administrator to enable it for your role.";
  if (status === 404 || type === "DoesNotExistError") return "This feature isn't set up yet. Contact your administrator.";
  if (!e?.response) return "Can't reach the server. Check your connection and try again.";
  return errMsg(e, "Couldn't load this section.");
}

/* ===== employeeConfig.js ===== */
/**
 * Employee portal settings you can edit without touching the pages.
 */

// Upload company policies / handbook to this folder in ERPNext (File Manager, public files).
export const POLICY_FOLDER = "Home/Policies";
export const ASSET_FOLDER = "Home/Assets";
/** Create a folder under Home in ERPNext's File Manager if it isn't there yet (uploads into a missing folder fail). */
async function ensureHomeFolder(path) {
  const name = path.slice(path.lastIndexOf("/") + 1);
  const exists = () => frappe.getList("File", { filters: [["file_name", "=", name], ["folder", "=", "Home"], ["is_folder", "=", 1]], fields: ["name"], limit: 1 });
  if ((await exists()).length) return;
  try {
    await frappe.createDoc("File", { file_name: name, folder: "Home", is_folder: 1 });
  } catch (e) {
    if (!(await exists()).length) throw e; // someone else may have just created it
  }
}
export const ensureAssetFolder = () => ensureHomeFolder(ASSET_FOLDER);
export const ensurePolicyFolder = () => ensureHomeFolder(POLICY_FOLDER);
export const OFFER_TEMPLATE_FOLDER = "Home/Offer Letter Templates";
export const ensureOfferTemplateFolder = () => ensureHomeFolder(OFFER_TEMPLATE_FOLDER);
export const getAssetLists = () =>
  frappe.getList("File", { filters: [["is_private", "=", 1], ["folder", "=", ASSET_FOLDER], ["is_folder", "=", 0]], fields: ["name", "file_name", "file_url", "creation"], orderBy: "creation desc", limit: 0 });

// Reminder window for passport / contract expiry (days)
export const EXPIRY_WARN_DAYS = 90;

export const REQUEST_CATEGORIES = ["HR Support", "IT Support", "Payroll", "Document request", "Other"];

// Leave reasons offered when applying (employee and HR). "Other" needs the details typed in. Stored on the leave
// application's description as "Reason: details".
export const LEAVE_REASONS = ["Personal Work", "Not Feeling Well / Medical", "Family Function / Event", "Family Emergency", "Travel / Vacation", "Child Care", "Exam / Study", "Other"];
export const OTHER_REASON = "Other";
export function joinLeaveReason(reason, details) {
  const d = String(details || "").trim();
  if (!reason) return d;
  return reason === OTHER_REASON ? d : d ? `${reason}: ${d}` : reason;
}
/** Back from a stored description to { reason, details } for editing. */
export function splitLeaveReason(text) {
  const t = String(text || "").trim();
  const hit = LEAVE_REASONS.find((r) => r !== OTHER_REASON && (t === r || t.startsWith(`${r}: `)));
  if (hit) return { reason: hit, details: t.slice(hit.length).replace(/^:\s*/, "") };
  return t ? { reason: OTHER_REASON, details: t } : { reason: "", details: "" };
}

export const LETTER_TYPES = [
  { key: "Salary certificate", hint: "For banks, loans or visa applications" },
  { key: "Employment certificate", hint: "Confirms you are currently employed" },
  { key: "Experience certificate", hint: "For past or current service" },
  { key: "Address proof letter", hint: "Company letter for address verification" },
];

// Fill these in so the right person is one click away. Empty values show "not added yet".
export const CONTACTS = [
  { area: "Payroll & salary", name: "", email: "", phone: "" },
  { area: "Leave & HR policies", name: "", email: "", phone: "" },
  { area: "IT / technical support", name: "", email: "", phone: "" },
  { area: "Insurance & benefit claims", name: "", email: "", phone: "" },
  { area: "Emergency", name: "", email: "", phone: "" },
];

/* ===== useAsync.js ===== */
/**
 * Run an async loader when deps change. Returns { data, error, loading, reload }.
 * When deps change (e.g. another month or year) the previous data is cleared and loading is
 * set, so pages never show last month's data under this month's label. reload() keeps the
 * current data on screen while it refreshes.
 */
export function useAsync(fn, deps = []) {
  const [state, setState] = useState({ data: null, error: null, loading: true });
  const [tick, setTick] = useState(0);
  const fnRef = useRef(fn);
  fnRef.current = fn;
  const lastTick = useRef(tick);

  useEffect(() => {
    let off = false;
    if (lastTick.current === tick) setState({ data: null, error: null, loading: true });
    lastTick.current = tick;
    fnRef
      .current()
      .then((data) => !off && setState({ data, error: null, loading: false }))
      .catch((error) => !off && setState({ data: null, error, loading: false }));
    return () => {
      off = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);

  return {
    ...state,
    reload: () => {
      setState((s) => ({ ...s, loading: true }));
      setTick((t) => t + 1);
    },
  };
}

/* ===== employeeApi.js ===== */
/** getList that retries with a safer field set when a site doesn't have some optional field. */
export async function listTry(doctype, opts, basicFields) {
  try {
    return await frappe.getList(doctype, { limit: 0, ...opts });
  } catch (e) {
    if (basicFields && e?.response?.data?.exc_type !== "PermissionError") {
      return frappe.getList(doctype, { limit: 0, ...opts, fields: basicFields });
    }
    throw e;
  }
}

const EMP_FULL = ["name", "employee_name", "first_name", "last_name", "company", "department", "designation", "branch", "reports_to", "date_of_joining", "holiday_list", "default_shift", "employment_type", "status", "gender", "date_of_birth", "blood_group", "marital_status", "personal_email", "company_email", "cell_number", "current_address", "permanent_address", "person_to_be_contacted", "emergency_phone_number", "relation", "image", "passport_number", "valid_upto", "date_of_issue", "contract_end_date", "health_insurance_provider", "health_insurance_no", "grade", "user_id", "leave_approver", "expense_approver"];
const EMP_BASIC = ["name", "employee_name", "company", "department", "designation", "reports_to", "date_of_joining", "status", "user_id"];

/** The Employee record linked to the signed-in ERPNext user (Employee.user_id). */
export async function getMyEmployee(email) {
  const rows = await listTry("Employee", { filters: [["user_id", "=", email]], fields: EMP_FULL, limit: 1 }, EMP_BASIC);
  const emp = rows[0] || null;
  // PAN / Aadhaar exist only once ERPNext Setup has run, so they are read separately.
  if (emp) {
    const ids = await frappe.getList("Employee", { filters: [["name", "=", emp.name]], fields: ["custom_pan_number", "custom_aadhaar_number"], limit: 1 }).catch(() => null);
    if (ids?.[0]) Object.assign(emp, ids[0], { idFields: true });
  }
  if (emp?.reports_to) {
    try {
      const m = await frappe.getList("Employee", { filters: [["name", "=", emp.reports_to]], fields: ["employee_name"], limit: 1 });
      emp.reports_to_name = m[0]?.employee_name || "";
    } catch {
      emp.reports_to_name = "";
    }
  }
  return emp;
}

/* ------------------------------ attendance ------------------------------ */

export async function getTodayAttendance(emp) {
  const today = isoDate();
  const [att, logs] = await Promise.allSettled([
    listTry("Attendance", { filters: [["employee", "=", emp], ["attendance_date", "=", today], ["docstatus", "<", 2]], fields: ["name", "status", "in_time", "out_time", "working_hours"], limit: 1 }, ["name", "status", "working_hours"]),
    frappe.getList("Employee Checkin", { filters: [["employee", "=", emp], ["time", ">=", `${today} 00:00:00`], ["time", "<=", `${today} 23:59:59`]], fields: ["name", "log_type", "time"], limit: 0, orderBy: "time asc" }),
  ]);
  return {
    attendance: att.status === "fulfilled" ? att.value[0] || null : null,
    logs: logs.status === "fulfilled" ? logs.value : [],
    logsError: logs.status === "rejected" ? logs.reason : null,
  };
}

export function getAttendanceHistory(emp, from, to) {
  return listTry(
    "Attendance",
    { filters: [["employee", "=", emp], ["attendance_date", ">=", from], ["attendance_date", "<=", to], ["docstatus", "<", 2]], fields: ["name", "attendance_date", "status", "in_time", "out_time", "working_hours", "late_entry", "early_exit"], orderBy: "attendance_date desc" },
    ["name", "attendance_date", "status", "working_hours"]
  );
}

export function getAttendanceRequests(emp) {
  // Approver and decision fields exist once ERPNext Setup (Attendance) has run.
  return listTry("Attendance Request", { filters: [["employee", "=", emp]], fields: ["name", "from_date", "to_date", "reason", "explanation", "docstatus", "creation", "custom_approver", "custom_decision", "custom_decision_note"], orderBy: "creation desc", limit: 30 }, ["name", "from_date", "to_date", "reason", "explanation", "docstatus", "creation"]);
}

/* -------------------------------- leave -------------------------------- */

export async function getLeaveBalance(emp, date = isoDate()) {
  const paths = ["hrms.hr.doctype.leave_application.leave_application.get_leave_details", "erpnext.hr.doctype.leave_application.leave_application.get_leave_details"];
  let last;
  for (const p of paths) {
    try {
      const res = await frappe.callMethod(p, { employee: emp, date });
      return Object.entries(res?.leave_allocation || {}).map(([leave_type, v]) => ({
        leave_type,
        total: Number(v.total_leaves) || 0,
        taken: Number(v.leaves_taken) || 0,
        pending: Number(v.leaves_pending_approval) || 0,
        remaining: Number(v.remaining_leaves) || 0,
      }));
    } catch (e) {
      last = e;
    }
  }
  throw last;
}

export const getLeaveTypes = () => frappe.getList("Leave Type", { fields: ["name"], limit: 0 });

export function getLeaveApplications(emp, limit = 0) {
  return frappe.getList("Leave Application", { filters: [["employee", "=", emp], ["docstatus", "<", 2]], fields: ["name", "leave_type", "from_date", "to_date", "total_leave_days", "half_day", "status", "docstatus", "description", "posting_date", "creation", "leave_approver", "leave_approver_name"], orderBy: "from_date desc", limit });
}

/* ------------------------------ approvals ------------------------------ */

/** Pending / Approved / Rejected / Cancelled for an attendance request. */
export const attReqStatus = (r) => (r.custom_decision === "Rejected" ? "Rejected" : r.docstatus === 0 ? "Pending" : r.docstatus === 1 ? "Approved" : "Cancelled");

/** Leave, attendance, timesheet and expense requests in one normalised list. */
export async function getApprovals(emp) {
  const jobs = [
    ["Leave", "/employee/leave", frappe.getList("Leave Application", { filters: [["employee", "=", emp], ["docstatus", "<", 2]], fields: ["name", "leave_type", "from_date", "to_date", "total_leave_days", "status", "creation", "leave_approver", "leave_approver_name"], orderBy: "creation desc", limit: 50 }),
      (r) => ({ approver: r.leave_approver_name || r.leave_approver || "", title: r.leave_type, detail: `${r.total_leave_days || ""} day(s)`, from: r.from_date, to: r.to_date, status: r.status, pending: r.status === "Open" })],
    ["Attendance", "/employee/attendance", getAttendanceRequests(emp),
      (r) => ({ approver: r.custom_approver || "", reason: r.custom_decision === "Rejected" ? stripHtml(r.custom_decision_note || "") : "", title: `Attendance request (${r.reason || "correction"})`, detail: stripHtml(r.explanation || ""), from: r.from_date, to: r.to_date, status: attReqStatus(r), pending: attReqStatus(r) === "Pending" })],
    ["Timesheet", "/employee/timesheet", getTimesheets(emp, 50),
      // Drafts are with the employee, not awaiting anyone; only submitted & unreviewed ones are pending.
      (r) => ({ title: "Timesheet", detail: `${Number(r.total_hours || 0).toFixed(2)} h${r.review.note ? ` · HR: ${r.review.note}` : ""}`, from: r.start_date, to: r.end_date, status: r.review.label, pending: ["pending", "partial"].includes(r.review.key) })],
    ["Expense", "/employee/expenses", frappe.getList("Expense Claim", { filters: [["employee", "=", emp], ["docstatus", "<", 2]], fields: ["name", "posting_date", "total_claimed_amount", "status", "approval_status", "docstatus", "creation", "expense_approver", "remark"], orderBy: "creation desc", limit: 50 }),
      (r) => ({ approver: r.expense_approver || "", reason: r.approval_status === "Rejected" ? stripHtml(r.remark || "") : "", title: "Expense claim", detail: String(r.total_claimed_amount ?? ""), from: r.posting_date, to: r.posting_date, status: r.status, pending: r.docstatus === 0 || r.approval_status === "Draft" })],
  ];
  const results = await Promise.allSettled(jobs.map((j) => j[2])); // j = [type, link, request, mapper]
  const items = [];
  const failed = [];
  results.forEach((res, i) => {
    const [type, link, , map] = jobs[i];
    if (res.status === "fulfilled") res.value.forEach((r) => items.push({ type, link, id: r.name, created: r.creation, ...map(r) }));
    else failed.push(type);
  });
  items.sort((a, b) => String(b.created).localeCompare(String(a.created)));
  return { items, failed };
}

/* ----------------------- announcements & notifications ----------------------- */

export const getAnnouncements = (limit = 10) =>
  frappe.getList("Note", { filters: [["public", "=", 1]], fields: ["name", "title", "content", "creation"], orderBy: "creation desc", limit });

export const getNotifications = (user, limit = 50) =>
  frappe.getList("Notification Log", { filters: [["for_user", "=", user]], fields: ["name", "subject", "type", "read", "creation", "document_type", "document_name"], orderBy: "creation desc", limit });

/* ----------------------- calendar, shifts, team ----------------------- */

export async function getHolidays(employee) {
  let listName = employee.holiday_list;
  // No list of their own: their office's list, then the company's.
  if (!listName && employee.branch) {
    try {
      const b = await frappe.getList("Branch", { filters: [["name", "=", employee.branch]], fields: ["custom_holiday_list"], limit: 1 });
      listName = b[0]?.custom_holiday_list;
    } catch {
      /* office list not available yet */
    }
  }
  if (!listName) {
    try {
      const c = await frappe.getList("Company", { filters: [["name", "=", employee.company]], fields: ["default_holiday_list"], limit: 1 });
      listName = c[0]?.default_holiday_list;
    } catch {
      /* ignore */
    }
  }
  if (!listName) return { name: null, holidays: [] };
  const doc = await frappe.getDoc("Holiday List", listName);
  const holidays = (doc.holidays || []).map((h) => ({ date: h.holiday_date, description: h.description, weeklyOff: Boolean(h.weekly_off) }));
  return { name: listName, holidays };
}

export function getShiftAssignments(emp) {
  return frappe.getList("Shift Assignment", { filters: [["employee", "=", emp], ["docstatus", "=", 1]], fields: ["name", "shift_type", "start_date", "end_date", "status"], orderBy: "start_date desc", limit: 20 });
}

export function getEvents() {
  return frappe.getList("Event", { filters: [["event_type", "=", "Public"], ["starts_on", ">=", `${isoDate()} 00:00:00`]], fields: ["name", "subject", "starts_on", "ends_on", "all_day", "description"], orderBy: "starts_on asc", limit: 20 });
}

export function getMyLeavesBetween(emp, start, end) {
  return frappe.getList("Leave Application", { filters: [["employee", "=", emp], ["from_date", "<=", end], ["to_date", ">=", start], ["docstatus", "<", 2], ["status", "in", ["Open", "Approved"]]], fields: ["name", "from_date", "to_date", "status", "leave_type"], limit: 0 });
}

/** Approved leave of colleagues in the same department. Only names + dates - never the reason. */
export async function getTeamAvailability(employee, days = 14) {
  if (!employee.department) return { onLeave: [], teamSize: null };
  const start = isoDate();
  const end = addDays(start, days);
  const [leaves, team] = await Promise.allSettled([
    frappe.getList("Leave Application", { filters: [["department", "=", employee.department], ["employee", "!=", employee.name], ["status", "=", "Approved"], ["docstatus", "=", 1], ["from_date", "<=", end], ["to_date", ">=", start]], fields: ["employee", "employee_name", "from_date", "to_date", "half_day"], orderBy: "from_date asc", limit: 0 }),
    frappe.getList("Employee", { filters: [["department", "=", employee.department], ["status", "=", "Active"]], fields: ["name"], limit: 0 }),
  ]);
  if (leaves.status === "rejected") throw leaves.reason;
  return { onLeave: leaves.value, teamSize: team.status === "fulfilled" ? team.value.length : null };
}

/* --------------------------------- work --------------------------------- */

// _assign holds a JSON list like ["a@x.com"]; match the quoted address so a@x.com doesn't also match ba@x.com
export const getAssignedTasks = (user) =>
  frappe.getList("Task", { filters: [["_assign", "like", `%"${user}"%`], ["status", "not in", ["Completed", "Cancelled"]]], fields: ["name", "subject", "project", "status", "priority", "exp_end_date"], orderBy: "modified desc", limit: 50 });

/** The employee's timesheets (newest first) with HR's review state on each row (r.review). */
export async function getTimesheets(emp, limit = 0) {
  const rows = await listTimesheets({ filters: [["employee", "=", emp], ["docstatus", "<", 2]], fields: ["name", "start_date", "end_date", "total_hours", "status", "docstatus", "amended_from", "creation"], orderBy: "start_date desc", limit });
  const { reviews, reviewsError } = await getReviewsSafe(rows.map((r) => r.name));
  const out = rows.map((r) => ({ ...r, review: reviewOf(r, reviews) }));
  out.reviewsError = reviewsError;
  return out;
}

export const getPayslips = (emp) =>
  frappe.getList("Salary Slip", { filters: [["employee", "=", emp], ["docstatus", "=", 1]], fields: ["name", "start_date", "end_date", "posting_date", "gross_pay", "total_deduction", "net_pay", "currency", "status"], orderBy: "end_date desc", limit: 0 });

export const getExpenseClaims = (emp) =>
  frappe.getList("Expense Claim", { filters: [["employee", "=", emp], ["docstatus", "<", 2]], fields: ["name", "posting_date", "total_claimed_amount", "total_sanctioned_amount", "total_amount_reimbursed", "status", "approval_status", "docstatus", "expense_approver", "remark", "creation"], orderBy: "posting_date desc, creation desc", limit: 0 });

/* ------------------------- documents, assets, help ------------------------- */

export const getPolicies = () =>
  frappe.getList("File", { filters: [["is_private", "=", 0], ["folder", "=", POLICY_FOLDER], ["is_folder", "=", 0]], fields: ["name", "file_name", "file_url", "creation"], orderBy: "creation desc", limit: 0 });

export const getMyDocuments = (emp) =>
  frappe.getList("File", { filters: [["attached_to_doctype", "=", "Employee"], ["attached_to_name", "=", emp]], fields: ["name", "file_name", "file_url", "creation", "is_private", "owner"], orderBy: "creation desc", limit: 0 });

/** Names of File records this user has acknowledged. */
export async function getAcknowledged(user) {
  const rows = await frappe.getList("Comment", { filters: [["comment_type", "=", "Info"], ["reference_doctype", "=", "File"], ["owner", "=", user], ["content", "like", "Acknowledged%"]], fields: ["reference_name"], limit: 0 });
  return new Set(rows.map((r) => r.reference_name));
}

export const acknowledgePolicy = (fileName) =>
  frappe.createDoc("Comment", { comment_type: "Info", reference_doctype: "File", reference_name: fileName, content: "Acknowledged policy" });

// Register fields (asset code, serial…) exist once Admin › ERPNext Setup has run; fall back to the basics until then.
export const getMyAssets = (emp) =>
  listTry("Asset", { filters: [["custodian", "=", emp], ["docstatus", "=", 1]], fields: ["name", "asset_name", "asset_category", "status", "location", "purchase_date", "custom_asset_code", "custom_serial_number", "custom_assigned_on", "custom_condition", "custom_other_assets"], orderBy: "purchase_date desc" },
    ["name", "asset_name", "asset_category", "status", "location", "purchase_date"]);

/** The server method, or the direct way until setup has installed it. */
const viaServer = (method, params, direct) => frappe.callMethod(method, params).catch((e) => {
  const d = e?.response?.data || {};
  if (e?.response?.status === 404 || DOCS_NOT_READY.test(String(d.exception || d.exc || d._server_messages || ""))) return direct();
  throw e;
});

/** HR/IT/document/asset requests are raised as ERPNext Issues so they reach the support queue. */
export const createRequest = ({ category, subject, description, user }) => viaServer("ethx_my_request", { action: "create", category, subject, description }, () =>
  frappe.createDoc("Issue", { subject: `[${category}] ${subject}`, description: description || subject, raised_by: user, priority: "Medium" }));

/** "[HR Support] Laptop slow" -> { category: "HR Support", title: "Laptop slow" } */
export function splitRequest(subject = "") {
  const m = /^\[([^\]]+)\]\s*(.*)$/.exec(subject);
  return m ? { category: m[1], title: m[2] } : { category: "", title: subject };
}

/** Only requests nobody has picked up yet can be changed or withdrawn by the person who raised them. */
export const updateRequest = (name, { category, subject, description }) => viaServer("ethx_my_request", { action: "edit", name, category, subject, description }, () => frappe.updateDoc("Issue", name, { subject: `[${category}] ${subject}`, description }));
export const withdrawRequest = (name) => viaServer("ethx_my_request", { action: "withdraw", name }, () => frappe.updateDoc("Issue", name, { status: "Closed" }));

/** Birthdays in the next 30 days: [{ name, date, days_away }]. Empty until ERPNext Setup has run. */
export const getUpcomingBirthdays = () => frappe.callMethod("ethx_upcoming_birthdays").catch(() => []);

const DOCS_NOT_READY = /Failed to get method|not whitelisted|has no attribute|No module named/i;
const docsError = (e) => {
  const d = e?.response?.data || {};
  if (e?.response?.status === 404 || DOCS_NOT_READY.test(String(d.exception || d.exc || d._server_messages || ""))) {
    const err = new Error("Document rules not installed");
    err.userMessage = "Document upload isn't set up on the server yet. It's set up automatically the next time the Administrator signs in.";
    return err;
  }
  return e;
};

const SHRINK_OVER = 1.5 * 1024 * 1024;
const SHRINK_SIDE = 2000;

/** Phone photos of documents are often several MB: big images are scaled down to a sharp JPEG before upload. */
async function shrinkImage(file) {
  if (!file.type.startsWith("image/") || file.size <= SHRINK_OVER) return file;
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((resolve, reject) => { const i = new Image(); i.onload = () => resolve(i); i.onerror = reject; i.src = url; });
    const k = Math.min(1, SHRINK_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.naturalWidth * k);
    canvas.height = Math.round(img.naturalHeight * k);
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
    return blob && blob.size < file.size ? new File([blob], file.name.replace(/\.[^.]+$/, "") + ".jpg", { type: "image/jpeg" }) : file;
  } catch {
    const err = new Error("This photo can't be opened");
    err.userMessage = "This photo can't be opened here (for example an iPhone HEIC photo). Save it as JPG or PDF and try again.";
    throw err;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Upload privately, then attach to the signed-in employee's own record. The type goes in the file name. */
export async function uploadMyDocument(file, type) {
  const small = await shrinkImage(file);
  const named = new File([small], `${type} - ${small.name}`, { type: small.type });
  const saved = await frappe.uploadFile(named, { isPrivate: true });
  try {
    await frappe.callMethod("ethx_attach_my_document", { file: saved.name });
  } catch (e) {
    await frappe.deleteDoc("File", saved.name).catch(() => {});
    throw docsError(e);
  }
  return saved;
}

export const removeMyDocument = (name) => frappe.callMethod("ethx_remove_my_document", { file: name }).catch((e) => { throw docsError(e); });

export const getRequests = async (user, prefix) => {
  const rows = await viaServer("ethx_my_requests", {}, () => frappe.getList("Issue", { filters: [["raised_by", "=", user]], fields: ["name", "subject", "description", "status", "priority", "creation"], orderBy: "creation desc", limit: 200 }));
  return prefix ? rows.filter((r) => r.subject.startsWith(`[${prefix}`)) : rows;
};

/* ------------------------------ growth & benefits ------------------------------ */

export const getGoals = (emp) =>
  listTry("Goal", { filters: [["employee", "=", emp], ["docstatus", "<", 2]], fields: ["name", "goal_name", "progress", "status", "start_date", "end_date", "appraisal_cycle"], orderBy: "end_date asc" }, ["name", "goal_name", "progress", "status"]);

export const getFeedback = (emp) =>
  listTry("Employee Performance Feedback", { filters: [["employee", "=", emp], ["docstatus", "=", 1]], fields: ["name", "reviewer_name", "appraisal_cycle", "feedback", "total_score", "added_on", "creation"], orderBy: "creation desc", limit: 20 }, ["name", "reviewer_name", "feedback", "creation"]);

export const getAppraisals = (emp) =>
  listTry("Appraisal", { filters: [["employee", "=", emp], ["docstatus", "<", 2]], fields: ["name", "appraisal_cycle", "start_date", "end_date", "final_score", "docstatus"], orderBy: "creation desc", limit: 10 }, ["name", "appraisal_cycle", "start_date", "end_date", "final_score", "docstatus"]).then((rows) => rows.map((r) => ({ ...r, status: r.status || (r.docstatus === 1 ? "Completed" : r.docstatus === 2 ? "Cancelled" : "In Progress") })));

export async function getMyTraining(emp) {
  const rows = await frappe.getList("Training Event Employee", { filters: [["employee", "=", emp]], fields: ["parent", "status", "attendance", "is_mandatory"], parent: "Training Event", limit: 0 }).catch(() =>
    frappe.getList("Training Event Employee", { filters: [["employee", "=", emp]], fields: ["parent", "status", "attendance"], parent: "Training Event", limit: 0 })
  );
  if (!rows.length) return [];
  const events = await frappe.getList("Training Event", { filters: [["name", "in", rows.map((r) => r.parent)]], fields: ["name", "event_name", "start_time", "end_time", "event_status", "location", "type", "docstatus"], limit: 0 }).catch(() => frappe.getList("Training Event", { filters: [["name", "in", rows.map((r) => r.parent)]], fields: ["name", "event_name", "start_time", "end_time"], limit: 0 }));
  // A rescheduled event replaces the cancelled original; cancelled events show as Cancelled.
  const amended = new Set(events.filter((e) => e.docstatus === 2).map((e) => e.name));
  const replacedBy = await (amended.size ? frappe.getList("Training Event", { filters: [["amended_from", "in", [...amended]]], fields: ["amended_from"], limit: 0 }).catch(() => []) : []);
  const gone = new Set(replacedBy.map((e) => e.amended_from));
  return rows.filter((r) => !gone.has(r.parent)).map((r) => {
    const ev = events.find((e) => e.name === r.parent);
    return { ...r, event: ev ? { ...ev, status: ev.docstatus === 2 ? "Cancelled" : ev.event_status } : { name: r.parent, event_name: r.parent } };
  });
}

// HRMS v15 calls the date claim_date, v16 payroll_date
export const getBenefitClaims = (emp) =>
  frappe.getList("Employee Benefit Claim", { filters: [["employee", "=", emp], ["docstatus", "<", 2]], fields: ["name", "claim_date", "earning_component", "claimed_amount", "docstatus"], orderBy: "creation desc", limit: 20 })
    .catch((e) => {
      if (e?.response?.data?.exc_type === "PermissionError") throw e;
      return frappe.getList("Employee Benefit Claim", { filters: [["employee", "=", emp], ["docstatus", "<", 2]], fields: ["name", "payroll_date", "earning_component", "claimed_amount", "docstatus"], orderBy: "creation desc", limit: 20 })
        .then((rows) => rows.map((r) => ({ ...r, claim_date: r.payroll_date })));
    });

/** Insurance, benefits and claims. Until setup has run, only the claims the person's role can read. */
export const getMyBenefits = (emp) => viaServer("ethx_my_benefits", {}, async () => ({ insurance: null, benefits: [], claims: await getBenefitClaims(emp) }));

export const getHelpArticles = (q) =>
  frappe.getList("Help Article", { filters: [["title", "like", `%${q}%`], ["published", "=", 1]], fields: ["name", "title", "category", "route"], limit: 10 });


/* ===== punch in/out -> attendance ===== */

/** Raw Employee Checkin logs between two ISO dates (all employees you can see when emp is null). */
export function getCheckinsBetween(emp, from, to) {
  const filters = [["time", ">=", `${from} 00:00:00`], ["time", "<=", `${to} 23:59:59`], ...(emp ? [["employee", "=", emp]] : [])];
  return listTry("Employee Checkin", { filters, fields: ["name", "employee", "employee_name", "log_type", "time"], orderBy: "time asc" }, ["name", "employee", "log_type", "time"]);
}

/** Group raw logs into one row per employee per day: first in, last out and hours worked. */
export function summariseCheckins(logs) {
  const days = new Map();
  for (const l of [...logs].sort((a, b) => String(a.time).localeCompare(String(b.time)))) {
    const date = String(l.time).slice(0, 10);
    const key = `${l.employee}|${date}`;
    const d = days.get(key) || { employee: l.employee, employee_name: l.employee_name, attendance_date: date, in_time: null, out_time: null, hours: 0, openIn: null };
    const t = new Date(String(l.time).replace(" ", "T")).getTime();
    if (l.log_type === "IN") {
      d.in_time = d.in_time || l.time;
      if (d.openIn == null) d.openIn = t;
    } else if (l.log_type === "OUT") {
      d.out_time = l.time;
      if (d.openIn != null) { d.hours += (t - d.openIn) / 3600000; d.openIn = null; }
    }
    days.set(key, d);
  }
  return [...days.values()].filter((d) => d.in_time).map(({ openIn, hours, ...d }) => ({ ...d, working_hours: Number(hours.toFixed(2)), stillIn: openIn != null }));
}

/**
 * Timesheet entries keep what the employee typed as "Project: ..." / "Task: ..." / "Notes: ..."
 * lines in the description. Any other text (e.g. entries made in ERPNext desk) is returned as notes.
 */
export function parseWorkNote(description = "", link = {}) {
  const text = String(description || "").replace(/<br\s*\/?>/gi, "\n").replace(/<\/(p|div)>/gi, "\n").replace(/<[^>]*>/g, " ");
  let project = "";
  let task = "";
  const notes = [];
  text.split(/\r?\n/).forEach((raw) => {
    const line = raw.trim();
    if (!line) return;
    const m = /^(Project|Task|Notes):\s*(.*)$/i.exec(line);
    const key = m?.[1].toLowerCase();
    if (key === "project" && !project) project = m[2].trim();
    else if (key === "task" && !task) task = m[2].trim();
    else if (key === "notes") notes.push(m[2].trim());
    else notes.push(line);
  });
  return { project: project || link.project || "", task: task || link.task || "", notes: notes.filter(Boolean).join(" ") };
} 