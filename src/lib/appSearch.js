// One search for the whole app (the dashboard box and the Search page). It finds:
//  - pages: every page in the menus this person can open (taken from the real menus, so it can't drift), minus pages
//    blocked for them or in a module their company doesn't have;
//  - records: people, candidates, job openings, projects, holidays, policies, documents and help articles - each only
//    when the person can open the page it belongs to. The super admin's client scope applies as everywhere.
import { frappe } from "./api/frappeClient";
import { getHelpArticles, getHolidays, getMyDocuments, getPolicies } from "./employeePortal";
import { hasPermission } from "../permissions/roles";
import { isPageBlocked } from "../permissions/pageAccess";
import { CONTRACTOR_NAV, EMPLOYEE_NAV } from "../components/employee/EmployeeShell";
import { hrNav } from "../components/layout/HRLayout";
import { pmNav } from "../components/layout/PMLayout";
import { ADMIN_NAV } from "../components/layout/AdminLayout";

// Extra words people search with, so "punch", "laptop" or "salary" find the right page.
const KEYWORDS = {
  "/employee/attendance": "punch in out check-in correction regularise",
  "/employee/leave": "holiday vacation time off balance apply",
  "/employee/calendar": "holidays shifts team availability",
  "/employee/expenses": "claim reimbursement bill receipt",
  "/employee/payslips": "salary pay slip ctc",
  "/employee/documents": "policy policies handbook letters files",
  "/employee/assets": "laptop mobile device equipment",
  "/employee/help": "request ticket letter support contacts",
  "/employee/notifications": "announcements alerts",
  "/employee/goals": "kra appraisal feedback performance",
  "/employee/benefits": "insurance medical",
  "/employee/profile": "my details address bank",
  "/hr/employees": "people staff directory",
  "/hr/payroll": "salary payslips pay run",
  "/hr/attendance": "punch check-in present absent",
  "/hr/expenses": "claims reimbursement advances",
  "/admin/users": "accounts logins hr users",
  "/admin/modules": "clients companies modules licence",
  "/admin/roles": "permissions setup",
  "/admin/access-control": "page access restrictions",
  "/admin/audit-logs": "history changes sign-ins",
  "/admin/integrations": "api key webhook biometric device bank salary transfer file connect",
  "/hr/analytics": "mis analytics attrition headcount dashboard report builder charts",
  "/hr/reports": "headcount joiners leavers utilisation",
};

const WORKSPACES = [
  ["dashboard.employee", "My Workspace", () => EMPLOYEE_NAV],
  ["dashboard.hr", "HR", (u) => hrNav(u)],
  ["dashboard.pm", "Projects", (u) => pmNav(u)],
  ["dashboard.admin", "Admin", () => ADMIN_NAV],
  ["dashboard.contractor", "Contractor", () => CONTRACTOR_NAV],
];

/** Every page this person can open, with where it sits in the menus. */
export function pageIndex(user) {
  const seen = new Map();
  const walk = (items, trail) => {
    for (const item of items || []) {
      if (item.children) walk(item.children, [...trail, item.label]);
      else if (item.to && !item.to.includes("?") && item.label !== "Back to Admin" && !seen.has(item.to) && !isPageBlocked(user, item.to)) {
        seen.set(item.to, { to: item.to, label: item.label, trail: trail.join(" › ") });
      }
    }
  };
  for (const [perm, name, nav] of WORKSPACES) if (hasPermission(user, perm)) walk(nav(user), [name]);
  return [...seen.values()];
}

const words = (q) => q.toLowerCase().split(/\s+/).filter(Boolean);

/** Pages matching the search, best first: name starts with it, then name contains it, then menu path / keywords. */
export function searchPages(user, q) {
  const ws = words(q);
  if (!ws.length) return [];
  return pageIndex(user)
    .map((p) => {
      const label = p.label.toLowerCase();
      const hay = `${label} ${p.trail.toLowerCase()} ${KEYWORDS[p.to] || ""}`;
      if (!ws.every((w) => hay.includes(w))) return null;
      const score = label.startsWith(ws[0]) ? 3 : ws.every((w) => label.includes(w)) ? 2 : 1;
      return { ...p, score };
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score || a.label.localeCompare(b.label));
}

const like = (q) => `%${q}%`;
const safe = (p) => p.catch(() => []);

/**
 * Records matching the search, grouped. `employee` is the person's own employee record when they have one (needed for
 * holidays and their documents). Each group is only searched when its page is open to them.
 */
export async function searchRecords(user, employee, q) {
  const term = q.trim();
  if (term.length < 2) return [];
  const can = (to) => !isPageBlocked(user, to);
  const hr = hasPermission(user, "dashboard.hr") || hasPermission(user, "dashboard.admin");
  const pm = hasPermission(user, "dashboard.pm");
  const has = (s) => String(s || "").toLowerCase().includes(term.toLowerCase());

  const jobs = [
    hr && can("/hr/employees") && safe(frappe.getList("Employee", { filters: [["employee_name", "like", like(term)]], fields: ["name", "employee_name", "designation", "department", "status"], orderBy: "employee_name asc", limit: 8 }))
      .then((rows) => ({ id: "people", title: "People", items: rows.map((r) => ({ key: r.name, label: r.employee_name || r.name, sub: [r.designation, r.department, r.status !== "Active" && r.status].filter(Boolean).join(" · "), to: `/hr/employees?open=${encodeURIComponent(r.name)}` })) })),
    hr && can("/hr/recruitment/candidates") && safe(frappe.getList("Job Applicant", { filters: [["applicant_name", "like", like(term)]], fields: ["name", "applicant_name", "job_title", "status"], orderBy: "modified desc", limit: 6 }))
      .then((rows) => ({ id: "candidates", title: "Candidates", items: rows.map((r) => ({ key: r.name, label: r.applicant_name || r.name, sub: [r.job_title, r.status].filter(Boolean).join(" · "), to: `/hr/recruitment/candidates/${encodeURIComponent(r.name)}` })) })),
    hr && can("/hr/recruitment/openings") && safe(frappe.getList("Job Opening", { filters: [["job_title", "like", like(term)]], fields: ["name", "job_title", "status", "designation"], orderBy: "modified desc", limit: 6 }))
      .then((rows) => ({ id: "openings", title: "Job Openings", items: rows.map((r) => ({ key: r.name, label: r.job_title || r.name, sub: [r.designation, r.status].filter(Boolean).join(" · "), to: `/hr/recruitment/openings/${encodeURIComponent(r.name)}` })) })),
    (hr || pm) && can("/pm/projects") && safe(frappe.getList("Project", { filters: [["project_name", "like", like(term)]], fields: ["name", "project_name", "status"], orderBy: "modified desc", limit: 6 }))
      .then((rows) => ({ id: "projects", title: "Projects", items: rows.map((r) => ({ key: r.name, label: r.project_name || r.name, sub: r.status || "", to: `/pm/projects/${encodeURIComponent(r.name)}` })) })),
    employee && can("/employee/calendar") && getHolidays(employee).then((h) => ({ id: "holidays", title: "Holidays", items: h.holidays.filter((x) => !x.weeklyOff && has(x.description)).slice(0, 6).map((x) => ({ key: x.date, label: x.description, sub: x.date.split("-").reverse().join("/"), to: "/employee/calendar" })) })).catch(() => null),
    can("/employee/documents") && hasPermission(user, "dashboard.employee") && safe(getPolicies()).then((rows) => ({ id: "policies", title: "Policies", items: rows.filter((f) => has(f.file_name)).slice(0, 6).map((f) => ({ key: f.name, label: f.file_name, sub: "Policy", href: f.file_url })) })),
    employee && can("/employee/documents") && safe(getMyDocuments(employee.name)).then((rows) => ({ id: "documents", title: "My Documents", items: rows.filter((f) => has(f.file_name)).slice(0, 6).map((f) => ({ key: f.name, label: f.file_name, sub: "Document", href: f.file_url })) })),
    can("/employee/help") && hasPermission(user, "dashboard.employee") && safe(getHelpArticles(term)).then((rows) => ({ id: "help", title: "Help Articles", items: rows.map((a) => ({ key: a.name, label: a.title, sub: a.category || "Help", to: "/employee/help" })) })),
  ].filter(Boolean);

  const groups = await Promise.all(jobs);
  return groups.filter((g) => g && g.items.length);
}
