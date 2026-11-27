// HR analytics and MIS (HR › Analytics). Two parts:
//  - runReport: the report builder - one dataset, grouped by one dimension (or by month), one measure (a count or a
//    sum), over a period. Totals are grouped on the server where ERPNext allows it (one row per value, so a year of
//    attendance is a few hundred rows, not tens of thousands), else fetched and grouped here.
//  - loadMis: the monthly MIS - headcount, joiners, leavers, attrition, attendance, leave, expenses and hiring - with a
//    12-month trend. Every list follows the super admin's client scope like the rest of the app.
import { frappe } from "./api/frappeClient";

const PEOPLE_DIMS = { department: "Department", designation: "Designation", branch: "Branch / Office", company: "Company", employment_type: "Employment Type", gender: "Gender", grade: "Grade" };

/** What can be reported on. `page` decides who sees it (the page must be open to them - modules, page access). */
export const DATASETS = {
  employees: {
    label: "Employees", page: "/hr/employees", doctype: "Employee", date: "date_of_joining", dateLabel: "Joining Date", allTime: true,
    filters: [["status", "=", "Active"]], dims: PEOPLE_DIMS, measures: { count: { label: "Employees" } },
    hint: "Active employees. The period filters by joining date.",
  },
  leavers: {
    label: "Leavers", page: "/hr/lifecycle", doctype: "Employee", date: "relieving_date", dateLabel: "Relieving Date",
    filters: [["relieving_date", "is", "set"]], dims: { ...PEOPLE_DIMS, reason_for_leaving: "Reason for Leaving" }, measures: { count: { label: "Leavers" } },
    hint: "Employees with a relieving date in the period.",
  },
  attendance: {
    label: "Attendance", page: "/hr/attendance", doctype: "Attendance", date: "attendance_date", dateLabel: "Date",
    filters: [["docstatus", "=", 1]], dims: { status: "Status", department: "Department", company: "Company", employee_name: "Employee" },
    measures: { count: { label: "Days" }, hours: { label: "Hours Worked", sum: "working_hours" } },
    hint: "Marked attendance days.",
  },
  leave: {
    label: "Leave", page: "/hr/leave", doctype: "Leave Application", date: "from_date", dateLabel: "From Date",
    filters: [["status", "=", "Approved"], ["docstatus", "=", 1]], dims: { leave_type: "Leave Type", department: "Department", company: "Company", employee_name: "Employee" },
    measures: { count: { label: "Applications" }, days: { label: "Leave Days", sum: "total_leave_days" } },
    hint: "Approved leave, by the day it starts.",
  },
  expenses: {
    label: "Expense Claims", page: "/hr/expenses", doctype: "Expense Claim", date: "posting_date", dateLabel: "Posting Date",
    filters: [["docstatus", "<", 2]], dims: { approval_status: "Approval Status", status: "Status", department: "Department", company: "Company", employee_name: "Employee" },
    measures: { count: { label: "Claims" }, claimed: { label: "Amount Claimed", sum: "total_claimed_amount", money: true }, sanctioned: { label: "Amount Sanctioned", sum: "total_sanctioned_amount", money: true } },
    hint: "Expense claims raised (not cancelled).",
  },
  candidates: {
    label: "Candidates", page: "/hr/recruitment/candidates", doctype: "Job Applicant", date: "creation", dateLabel: "Applied On",
    filters: [], dims: { status: "Status", job_title: "Job Opening", source: "Source" }, measures: { count: { label: "Candidates" } },
    hint: "Candidates added in the period.",
  },
  openings: {
    label: "Job Openings", page: "/hr/recruitment/openings", doctype: "Job Opening", date: "creation", dateLabel: "Created On", allTime: true,
    filters: [], dims: { status: "Status", department: "Department", designation: "Designation", company: "Company" },
    measures: { count: { label: "Openings" }, vacancies: { label: "Planned Vacancies", sum: "planned_vacancies" } },
    hint: "Job openings and their planned vacancies.",
  },
};

export const MONTH_DIM = "__month";
export const PERIODS = [["12m", "Last 12 Months"], ["ytd", "This Year"], ["last", "Last Year"], ["all", "All Time"], ["custom", "Custom"]];

const pad = (n) => String(n).padStart(2, "0");
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const monthLabel = (ym) => { const [y, m] = ym.split("-").map(Number); return `${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][m - 1]} ${String(y).slice(2)}`; };

/** [from, to] ISO dates for a period, or [null, null] for all time. */
export function periodRange(period, custom = {}) {
  const now = new Date();
  if (period === "ytd") return [`${now.getFullYear()}-01-01`, iso(now)];
  if (period === "last") return [`${now.getFullYear() - 1}-01-01`, `${now.getFullYear() - 1}-12-31`];
  if (period === "all") return [null, null];
  if (period === "custom") return [custom.from || null, custom.to || null];
  const from = new Date(now.getFullYear(), now.getMonth() - 11, 1);
  return [iso(from), iso(now)];
}

function dateFilters(ds, from, to) {
  const isTime = ds.date === "creation";
  return [
    ...(from ? [[ds.date, ">=", isTime ? `${from} 00:00:00` : from]] : []),
    ...(to ? [[ds.date, "<=", isTime ? `${to} 23:59:59` : to]] : []),
  ];
}

/**
 * Runs a report: { dataset, dim, measure, from, to } -> [{ key, value }], months in order, otherwise largest first.
 */
export async function runReport({ dataset, dim, measure = "count", from, to }) {
  const ds = DATASETS[dataset];
  const m = ds.measures[measure] || ds.measures.count;
  const byMonth = dim === MONTH_DIM;
  const field = byMonth ? ds.date : dim;
  const filters = [...ds.filters, ...dateFilters(ds, from, to)];
  const totals = new Map();
  const add = (raw, v) => {
    let key = raw == null || raw === "" ? "Not Set" : String(raw);
    if (byMonth) key = key.slice(0, 7);
    totals.set(key, (totals.get(key) || 0) + (Number(v) || 0));
  };

  try {
    // One row per value from the server. A month is grouped by its days here, then added up.
    const rows = await frappe.getList(ds.doctype, {
      filters, limit: 0, groupBy: field,
      fields: [`${field} as k`, m.sum ? `sum(${m.sum}) as v` : "count(name) as v"],
    });
    if (!rows.every((r) => "v" in r)) throw new Error("not grouped");
    rows.forEach((r) => add(r.k, r.v));
  } catch {
    totals.clear();
    const rows = await frappe.getList(ds.doctype, { filters, limit: 0, fields: [field, ...(m.sum ? [m.sum] : [])] });
    rows.forEach((r) => add(r[field], m.sum ? r[m.sum] : 1));
  }

  const out = [...totals.entries()].map(([key, value]) => ({ key, value: Math.round(value * 100) / 100 }));
  if (byMonth) return out.filter((r) => r.key !== "Not Set").sort((a, b) => a.key.localeCompare(b.key)).map((r) => ({ ...r, label: monthLabel(r.key) }));
  return out.sort((a, b) => b.value - a.value);
}

/* --------------------------------- MIS --------------------------------- */

const monthEnd = (ym) => { const [y, m] = ym.split("-").map(Number); return `${ym}-${pad(new Date(y, m, 0).getDate())}`; };
const shift = (ym, n) => { const [y, m] = ym.split("-").map(Number); const d = new Date(y, m - 1 + n, 1); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`; };
export const thisMonth = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`; };

const safe = (p) => p.catch(() => null);
const total = async (doctype, filters, fields) => {
  const rows = await frappe.getList(doctype, { filters, limit: 0, fields });
  return rows;
};

/**
 * The MIS for a month ("2026-11"): KPIs, a 12-month trend and breakdowns. Missing data (a module not used, no
 * permission) comes back as null and shows as "—".
 */
export async function loadMis(ym) {
  const from = `${ym}-01`;
  const to = monthEnd(ym);
  const [emps, attendance, leave, expenses, openings, candidates] = await Promise.all([
    frappe.getList("Employee", { fields: ["name", "status", "date_of_joining", "relieving_date", "department", "gender"], limit: 0 }),
    // Same records as the Attendance page (saved or submitted, not cancelled), counted here (BUG-006: the grouped server
    // query only saw submitted records and came back empty when attendance was marked but not submitted).
    safe(frappe.getList("Attendance", { filters: [["docstatus", "<", 2], ["attendance_date", "between", [from, to]]], fields: ["status"], limit: 0 })),
    safe(total("Leave Application", [["status", "=", "Approved"], ["docstatus", "=", 1], ["from_date", "between", [from, to]]], ["total_leave_days"])),
    safe(total("Expense Claim", [["docstatus", "<", 2], ["posting_date", "between", [from, to]]], ["total_claimed_amount"])),
    safe(total("Job Opening", [["status", "=", "Open"]], ["planned_vacancies"])),
    safe(total("Job Applicant", [["creation", "between", [`${from} 00:00:00`, `${to} 23:59:59`]]], ["name"])),
  ]);

  // Headcount on a day: joined by then and not yet relieved. "Left" records without a relieving date never count.
  const onRoll = (day) => emps.filter((e) => e.date_of_joining && e.date_of_joining <= day && (e.relieving_date ? e.relieving_date > day : e.status !== "Left")).length;
  const joined = (a, b) => emps.filter((e) => e.date_of_joining && e.date_of_joining >= a && e.date_of_joining <= b).length;
  const left = (a, b) => emps.filter((e) => e.relieving_date && e.relieving_date >= a && e.relieving_date <= b).length;
  const attrition = (leavers, start, end) => { const avg = (start + end) / 2; return avg ? Math.round((leavers / avg) * 1000) / 10 : 0; };

  const trend = Array.from({ length: 12 }, (_, i) => {
    const m = shift(ym, i - 11);
    const s = `${m}-01`;
    const e = monthEnd(m);
    const startCount = onRoll(monthEnd(shift(m, -1))); // headcount at the end of the previous month
    const endCount = onRoll(e);
    const leavers = left(s, e);
    return { key: m, label: monthLabel(m), headcount: endCount, joiners: joined(s, e), leavers, attrition: attrition(leavers, startCount, endCount) };
  });
  const cur = trend[11];
  const prev = trend[10];

  // Rolling 12 months: leavers over the year against the average month-end headcount.
  const yearLeavers = trend.reduce((n, t) => n + t.leavers, 0);
  const avgHead = trend.reduce((n, t) => n + t.headcount, 0) / 12;
  const rolling = avgHead ? Math.round((yearLeavers / avgHead) * 1000) / 10 : 0;

  let att = null;
  if (attendance) {
    const by = {};
    attendance.forEach((r) => { const k = r.status || "Not Set"; by[k] = (by[k] || 0) + 1; });
    const marked = attendance.length;
    // Rate = days worked / working days marked. A missed punch-out still means they came in; days on leave aren't
    // working days, so they're left out of both sides.
    const present = (by.Present || 0) + (by["Work From Home"] || 0) + (by["Missed Punch Out"] || 0) + (by["Half Day"] || 0) * 0.5;
    const workingDays = marked - (by["On Leave"] || 0);
    att = { marked, by, rate: workingDays > 0 ? Math.round((present / workingDays) * 1000) / 10 : null, absent: by.Absent || 0 };
  }

  const active = emps.filter((e) => e.status === "Active");
  const group = (key) => {
    const m = new Map();
    active.forEach((e) => m.set(e[key] || "Not Set", (m.get(e[key] || "Not Set") || 0) + 1));
    return [...m.entries()].map(([k, value]) => ({ key: k, value })).sort((a, b) => b.value - a.value);
  };

  return {
    month: ym,
    headcount: cur.headcount,
    headcountChange: cur.headcount - prev.headcount,
    joiners: cur.joiners,
    leavers: cur.leavers,
    attrition: cur.attrition,
    rolling,
    attendance: att,
    leaveDays: leave ? Math.round(leave.reduce((n, r) => n + (Number(r.total_leave_days) || 0), 0) * 10) / 10 : null,
    leaveApplications: leave ? leave.length : null,
    expenseAmount: expenses ? expenses.reduce((n, r) => n + (Number(r.total_claimed_amount) || 0), 0) : null,
    expenseClaims: expenses ? expenses.length : null,
    openPositions: openings ? openings.reduce((n, r) => n + (Number(r.planned_vacancies) || 1), 0) : null,
    openings: openings ? openings.length : null,
    candidates: candidates ? candidates.length : null,
    trend,
    byDepartment: group("department"),
    byGender: group("gender"),
  };
}

/* ------------------------------ saved reports ------------------------------ */

// Reports HR saves from the builder, shared by the HR team. Config is stored as JSON text.
export const SAVED_REPORTS = "HRMS 360 Saved Report";

export const ANALYTICS_DOCTYPES = [{
  name: SAVED_REPORTS,
  what: "Saved analytics reports (HR › Analytics)",
  onlyIfMissing: true,
  doc: {
    name: SAVED_REPORTS, module: "Custom", custom: 1, track_changes: 1, autoname: "hash",
    permissions: ["System Manager", "HR Manager", "HR User"].map((role) => ({ role, read: 1, write: 1, create: 1, delete: 1 })),
    fields: [
      { fieldname: "title", label: "Title", fieldtype: "Data", reqd: 1, in_list_view: 1 },
      { fieldname: "config", label: "Report", fieldtype: "Long Text", description: "Managed from HR › Analytics" },
    ],
  },
}];
