/**
 * Application-level permission model, kept separate from ERPNext's own
 * role/permission system. We map Frappe/ERPNext roles (assigned on the
 * User doctype, e.g. via Admin's "Create HR" flow) to the permission
 * strings our UI checks.
 *
 * IMPORTANT: this is UI-layer convenience only, not security. The real
 * enforcement lives server-side - either ERPNext's native doctype
 * permissions, or whitelisted methods in a custom Frappe app that check
 * frappe.session.user's roles before acting. Never trust the frontend
 * gate alone for anything sensitive.
 */

export const PERMISSIONS = {
  APP_ADMIN: [
    "dashboard.admin",
    "users.view",
    "users.create",
    "users.edit",
    "users.disable",
    "roles.manage",
    "org.manage",
    "settings.manage",
    "audit.view",
    // Admin can see everything HR can too
    "employees.view",
    "employees.create",
    "employees.edit",
    "attendance.view",
    "attendance.manage",
    "leave.view",
    "leave.approve",
    "payroll.view",
    "payroll.manage",
    "recruitment.view",
    "reports.view",
  ],
  HR_USER: [
    "dashboard.hr",
    "employees.view",
    "employees.create",
    "employees.edit",
    "attendance.view",
    "attendance.manage",
    "leave.view",
    "leave.create",
    "leave.approve",
    "payroll.view",
    "payroll.manage",
    "recruitment.view",
    "onboarding.view",
    "performance.view",
    "training.view",
    "reports.view",
  ],
  EMPLOYEE: [
    "dashboard.employee",
    "profile.own.view",
    "profile.own.edit",
    "attendance.own.view",
    "leave.own.view",
    "leave.own.apply",
    "payroll.own.view",
  ],
};

export const ADMIN_USERNAME = "Administrator";

/**
 * Product access is deliberately simple: the ERPNext Administrator account
 * uses the Admin workspace; every other authenticated account uses HR.
 * ERPNext must still enforce the matching server-side doctype permissions.
 */
export function effectiveRolesForUser(username) {
  return username === ADMIN_USERNAME ? ["System Manager"] : ["HR User"];
}

/**
 * Map ERPNext role names to the buckets above. Adjust these to match the
 * exact role names you create in ERPNext (Setup > Role or via your custom
 * my_hrms app's fixtures).
 */
const ROLE_MAP = {
  "System Manager": "APP_ADMIN",
  "HR Manager": "HR_USER",
  "HR User": "HR_USER",
  Employee: "EMPLOYEE",
};

export function rolesToPermissions(erpRoles = []) {
  const perms = new Set();
  for (const role of erpRoles) {
    const bucket = ROLE_MAP[role];
    if (bucket) PERMISSIONS[bucket].forEach((p) => perms.add(p));
  }
  return Array.from(perms);
}

/** Highest-priority app role for routing/layout purposes (Admin > HR > Employee). */
export function primaryAppRole(erpRoles = []) {
  if (erpRoles.includes("System Manager")) return "admin";
  if (erpRoles.some((r) => ["HR Manager", "HR User"].includes(r))) return "hr";
  if (erpRoles.includes("Employee")) return "employee";
  return null;
}

export function hasPermission(user, permission) {
  return Boolean(user?.permissions?.includes(permission));
}
