// Roles an employee can hold on a project, and who manages each project. See projectRoleSetup.js for the server side.
import { frappe } from "./api/frappeClient";
import { PROJECT_ROLE_DOCTYPE } from "./projectRoleSetup";

const FIELDS = ["name", "role_name", "manages_project", "disabled", "description"];

/** Before ERPNext Setup has run there is no role list yet: these keep the assignment form working. */
const FALLBACK = [
  { name: "Project Manager", role_name: "Project Manager", manages_project: 1, disabled: 0 },
  ...["Tech Lead", "Senior Developer", "Developer", "Designer", "QA / Tester", "Business Analyst", "DevOps", "Support", "Project Coordinator"].map((r) => ({ name: r, role_name: r, manages_project: 0, disabled: 0 })),
];

export async function loadProjectRoles() {
  try {
    const roles = await frappe.getList(PROJECT_ROLE_DOCTYPE, { fields: FIELDS, orderBy: "manages_project desc, role_name asc", limit: 0 });
    return { roles, installed: true };
  } catch {
    return { roles: FALLBACK, installed: false };
  }
}

export const saveProjectRole = (name, doc) => (name ? frappe.updateDoc(PROJECT_ROLE_DOCTYPE, name, doc) : frappe.createDoc(PROJECT_ROLE_DOCTYPE, doc));
export const deleteProjectRole = (name) => frappe.deleteDoc(PROJECT_ROLE_DOCTYPE, name);

export const managesProject = (roles, roleName) => Boolean(Number(roles.find((r) => r.role_name === roleName)?.manages_project));

/** Make `email` the manager of the project ("" clears it). Grants or removes workspace access as needed. */
export const setProjectManager = (project, email) => frappe.callMethod("ethx_set_project_manager", { project, user: email || "" });

const NOT_INSTALLED = /Failed to get method|not whitelisted|has no attribute|No module named/i;

/**
 * Throws before anything is saved if ERPNext Setup hasn't installed the manager rule yet. A project that can't exist is
 * refused by the rule itself ("Project not found"), so this changes nothing; only a missing method counts as not ready.
 */
export async function assertManagerRuleInstalled() {
  try {
    await setProjectManager("__ethx_setup_check__", "");
  } catch (e) {
    const d = e?.response?.data || {};
    if (e?.response?.status === 404 || NOT_INSTALLED.test(String(d.exception || d.exc || d._server_messages || ""))) {
      const err = new Error("Manager rule not installed");
      err.userMessage = "Project Manager roles aren't set up on the server yet, so nothing was saved. Ask the Administrator to run System Setup › Run setup, then try again.";
      throw err;
    }
  }
}

/** The person who manages a project: the chosen manager, otherwise whoever created it. */
export const managerOf = (project) => project?.custom_project_manager || project?.owner || "";
