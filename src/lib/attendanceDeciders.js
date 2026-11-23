// Who may decide a person's attendance - the same rule the server enforces (attendanceSetup.js, "Attendance by
// manager"): nobody decides their own days, and HR staff's days are decided by their manager - their Leave Approver
// or Reports To - or by an admin, not by fellow HR. Used to make rows read-only on HR › Attendance and HR › Attendance Requests.
import { frappe } from "./api/frappeClient";
import { SUPER_ADMIN } from "./modules";

const HR_ROLES = ["HR Manager", "HR User"];

/**
 * `employees`: rows with name, employee_name, user_id, reports_to and leave_approver. Resolves to decide(employeeId, me, approver?)
 * -> { ok: true } or { ok: false, reason }. `approver` is an extra user allowed (an attendance request's approver).
 * `admin`: the signed-in person is an admin (System Manager), who may decide any HR member's days except their own.
 */
export async function attendanceDecider(employees, { admin = false } = {}) {
  const ids = employees.map((e) => e.user_id).filter(Boolean);
  const roles = ids.length
    ? await frappe.getList("Has Role", { parent: "User", filters: [["parenttype", "=", "User"], ["parent", "in", ids], ["role", "in", HR_ROLES]], fields: ["parent"], limit: 0 }).catch(() => [])
    : [];
  const staff = new Set(roles.map((r) => r.parent));
  const byId = new Map(employees.map((e) => [e.name, e]));

  return (employeeId, me, approver, isAdmin = admin) => {
    const emp = byId.get(employeeId);
    if (me === SUPER_ADMIN || !emp?.user_id) return { ok: true };
    if (emp.user_id === me) return { ok: false, reason: "Your own attendance is decided by your manager." };
    if (isAdmin || !staff.has(emp.user_id)) return { ok: true };
    const boss = emp.reports_to ? byId.get(emp.reports_to) : null;
    const managers = [emp.leave_approver, boss?.user_id].filter(Boolean);
    if (!managers.length || managers.includes(me) || (approver && approver === me)) return { ok: true };
    const nameOf = (u) => employees.find((e) => e.user_id === u)?.employee_name || u;
    return { ok: false, reason: `HR staff - decided by their manager, ${[...new Set(managers)].map(nameOf).join(" or ")}, or an admin.` };
  };
}
