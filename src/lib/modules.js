// HRMS 360 product modules. The app is sold in four parts; the Administrator switches each one on or off for a
// client (Admin › Modules & People). Pages of a switched-off module disappear from every menu and can't be opened
// (permissions/pageAccess.js). Pages that belong to no module are the base everyone gets: dashboards, the employee
// list, profiles, notifications, setup masters and the Administrator's own pages.

export const PRODUCT_NAME = "HRMS 360";

// The super admin. Only this account manages modules, and it always has every module whatever its company has.
export const SUPER_ADMIN = "Administrator";

export const MODULES = [
  {
    id: "employee",
    label: "Employee Lifecycle",
    hint: "Promotions, transfers and exits, attendance, leave, expenses, advances and travel, payroll, assets, policies, employee requests and announcements - and the matching self-service pages.",
    pages: [
      "/hr/lifecycle", "/hr/attendance", "/hr/leave", "/hr/expenses", "/hr/payroll", "/hr/assets", "/hr/policies", "/hr/requests", "/hr/announcements",
      "/hr/setup/attendance-request", "/hr/setup/compensatory-leave-request", "/hr/setup/expense-claim", "/hr/setup/employee-advance", "/hr/setup/travel-request",
      "/hr/setup/employee-checkin", "/hr/setup/monthly-attendance-sheet", "/hr/setup/employee-leave-balance", "/hr/setup/employee-leave-balance-summary", "/hr/setup/employee-exits",
      "/hr/setup/employees-working-on-a-holiday", "/hr/setup/payroll-settings",
      "/employee/attendance", "/employee/leave", "/employee/approvals", "/employee/calendar", "/employee/expenses", "/employee/payslips", "/employee/documents",
      "/employee/assets", "/employee/help", "/employee/benefits", "/employee/team", "/pm/leave-approvals",
    ],
  },
  {
    id: "recruitment",
    label: "Recruitment Cycle",
    hint: "Requisitions, openings and job posting, candidates and CV search, interviews, offers and onboarding of new joiners.",
    pages: ["/hr/recruitment", "/hr/onboarding", "/hr/setup/recruitment-analytics", "/pm/requisitions", "/pm/interviews", "/employee/interviews"],
  },
  {
    id: "projects",
    label: "Project Lifecycle",
    hint: "Projects and the Project Manager workspace, assignments, timesheets and approvals, resources, contractors and project roles.",
    pages: ["/pm", "/contractor", "/hr/timesheets", "/hr/resources", "/employee/timesheet", "/admin/project-managers", "/admin/project-roles"],
  },
  {
    id: "learning",
    label: "Learning & Development",
    hint: "Training programs and events, appraisals, goals and feedback.",
    pages: ["/hr/training", "/hr/performance", "/employee/training", "/employee/goals"],
  },
];

// Workspace homes stay reachable even when their module is off, so nobody lands on a dead end after signing in.
const HOMES = new Set(["/employee", "/hr", "/pm", "/contractor", "/admin"]);

/** The module a page belongs to (longest matching prefix), or null for the always-included base. */
export function moduleOf(pathname) {
  if (HOMES.has(pathname)) return null;
  let best = null;
  let bestLen = -1;
  for (const m of MODULES) {
    for (const p of m.pages) {
      if ((pathname === p || pathname.startsWith(`${p}/`)) && p.length > bestLen) { best = m.id; bestLen = p.length; }
    }
  }
  return best;
}

export const isModuleOff = (user, pathname) => {
  const id = moduleOf(pathname);
  return Boolean(id && user?.email !== SUPER_ADMIN && user?.disabledModules?.includes(id));
};

/* --------------------------------- setup --------------------------------- */

// One record per company (each company is a client). The record's name is the company; switched-off modules are a
// comma-separated list of ids, so a company without a record has every module on. Only the Administrator role (held by
// the Administrator account alone) can read or change these records - other admins and System Managers can't.
export const MODULE_SETTINGS = "HRMS 360 Company Modules";

export const MODULE_DOCTYPES = [{
  name: MODULE_SETTINGS,
  what: "HRMS 360 company modules (which product modules each company has)",
  onlyIfMissing: true,
  doc: {
    name: MODULE_SETTINGS, module: "Custom", custom: 1, track_changes: 1,
    autoname: "field:company", naming_rule: "By fieldname",
    permissions: [{ role: "Administrator", read: 1, write: 1, create: 1, delete: 1 }],
    fields: [
      { fieldname: "company", label: "Company", fieldtype: "Link", options: "Company", reqd: 1, unique: 1, in_list_view: 1 },
      { fieldname: "disabled_modules", label: "Switched-Off Modules", fieldtype: "Small Text", in_list_view: 1, description: "Managed from Admin › Modules & People" },
    ],
  },
}];

// Everyone signed in reads which modules are off for their own company: the company their account is tied to (as HR
// users are), else the company on their employee record, else the site's default company. The Administrator always gets everything.
const MODULES_API = `
off = []
company = None
user = frappe.session.user
if user != "${SUPER_ADMIN}" and frappe.db.exists("DocType", "${MODULE_SETTINGS}"):
    company = frappe.db.get_value("User Permission", {"user": user, "allow": "Company"}, "for_value")
    if not company:
        company = frappe.db.get_value("Employee", {"user_id": user}, "company")
    if not company:
        company = frappe.db.get_single_value("Global Defaults", "default_company")
    if company:
        raw = frappe.db.get_value("${MODULE_SETTINGS}", company, "disabled_modules")
        if raw:
            off = [x.strip() for x in raw.split(",") if x.strip()]
frappe.response["message"] = {"disabled": off, "company": company}
`;

export const MODULE_SCRIPTS = [
  { name: "ETHX - Product modules", script_type: "API", api_method: "ethx_modules", script: MODULES_API, what: "Every user's app shows only the product modules their company has" },
];
