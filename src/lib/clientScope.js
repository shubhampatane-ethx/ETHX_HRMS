// The client (company) the super admin is looking at. HRMS 360 is sold per company: when the Administrator picks a
// client in the sidebar, lists of records that belong to a company (employees, leave, projects, timesheets...) only
// show that client's, and admin pages narrow their people to that client's accounts. Everyone else is already limited
// to their own company by ERPNext's user permissions, so for them there is no client scope.
// Imports nothing from the app, so the API client can read it without a circular import.
import { useSyncExternalStore } from "react";

let client = null;
const subs = new Set();

export function setClientScope(name) {
  const next = name || null;
  if (next === client) return;
  client = next;
  subs.forEach((f) => f());
}

export const getClientScope = () => client;

// Shared with Brand Studio: the company the Administrator last chose, so the app reopens on the same client.
export const STORED_CLIENT_KEY = "hrms-branding-company";
export function storedClient() {
  try { return localStorage.getItem(STORED_CLIENT_KEY) || null; } catch { return null; }
}

/** The current client, re-rendering when the super admin switches. */
export function useClientScope() {
  return useSyncExternalStore((f) => (subs.add(f), () => subs.delete(f)), () => client);
}

// ERPNext / HRMS records that carry their company. Lists of these are narrowed to the client. A doctype that turns out
// not to have the field on a site is remembered and left unnarrowed (frappeClient.getList).
export const COMPANY_DOCTYPES = new Set([
  "Employee", "Department", "Attendance", "Attendance Request", "Leave Application", "Leave Allocation", "Leave Encashment",
  "Shift Assignment", "Expense Claim", "Employee Advance", "Salary Slip", "Salary Structure Assignment", "Payroll Entry",
  "Additional Salary", "Employee Incentive", "Retention Bonus", "Employee Benefit Claim", "Employee Separation",
  "Employee Onboarding", "Employee Promotion", "Employee Transfer", "Appraisal", "Appraisal Cycle", "Training Event",
  "Job Opening", "Job Requisition", "Job Offer", "Staffing Plan", "Project", "Task", "Timesheet", "Asset", "Cost Center",
  "Employee Grievance", "Full and Final Statement", "Gratuity",
]);

/** True when a list's filters already choose a company themselves. */
export function filtersMentionCompany(filters) {
  if (!filters) return false;
  if (!Array.isArray(filters)) return "company" in filters;
  return filters.some((f) => Array.isArray(f) && (f[0] === "company" || f[1] === "company"));
}
