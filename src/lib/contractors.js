// Contractors: created by HR, assigned to projects like employees. See contractorSetup.js for the server side.
import { frappe } from "./api/frappeClient";

const NOT_INSTALLED = /Failed to get method|not whitelisted|has no attribute|No module named/i;

/** Same wording everywhere when ERPNext Setup hasn't installed the contractor rules yet. */
function friendly(e) {
  const d = e?.response?.data || {};
  if (e?.response?.status === 404 || NOT_INSTALLED.test(String(d.exception || d.exc || d._server_messages || ""))) {
    const err = new Error("Contractor rules not installed");
    err.userMessage = "Contractors aren't set up on the server yet, so nothing was saved. It's set up automatically the next time the Administrator signs in; try again after that.";
    return err;
  }
  return e;
}

export async function createContractor({ fullName, email, password, company, branch, joining }) {
  try {
    return await frappe.callMethod("ethx_add_contractor", { full_name: fullName, email, password, company, branch: branch || undefined, joining });
  } catch (e) {
    throw friendly(e);
  }
}

/** Who ending this project would remove, without changing anything: { remove: [...], kept: [...] }. */
export async function previewEndProject(project) {
  try {
    return await frappe.callMethod("ethx_end_project", { project, preview: 1 });
  } catch (e) {
    throw friendly(e);
  }
}

export const endProject = (project) => frappe.callMethod("ethx_end_project", { project });
