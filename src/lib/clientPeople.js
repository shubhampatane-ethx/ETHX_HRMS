// Which sign-in accounts belong to a client: the company on their employee record, or the company their account is
// tied to (an ERPNext "Company" user permission, as HR users have). Admin pages that list people - access control,
// Project Managers, audit logs - use it to show only the client the super admin is viewing (lib/clientScope.js).
import { frappe } from "./api/frappeClient";
import { getClientScope } from "./clientScope";
import { SUPER_ADMIN } from "./modules";

/** Set of user ids that belong to the company. */
export async function usersOfCompany(company) {
  const [employees, permissions] = await Promise.all([
    frappe.getList("Employee", { filters: [["company", "=", company], ["user_id", "is", "set"]], fields: ["user_id"], limit: 0 }),
    frappe.getList("User Permission", { filters: [["allow", "=", "Company"], ["for_value", "=", company]], fields: ["user"], limit: 0 }).catch(() => []),
  ]);
  return new Set([...employees.map((e) => e.user_id), ...permissions.map((p) => p.user)].filter((u) => u && u !== SUPER_ADMIN));
}

/** The viewed client's accounts, or null when there's no client scope (everyone else, or no client chosen). */
export async function clientUsers() {
  const client = getClientScope();
  return client ? usersOfCompany(client) : null;
}
