// Contractors: people who exist only for a project. See contractorSetup.js for the server side.
import { frappe } from "./api/frappeClient";
import { createAssignment } from "./assignments";

const NOT_INSTALLED = /Failed to get method|not whitelisted|has no attribute|No module named/i;

/** Same wording everywhere when ERPNext Setup hasn't installed the contractor rules yet. */
function friendly(e) {
  const d = e?.response?.data || {};
  if (e?.response?.status === 404 || NOT_INSTALLED.test(String(d.exception || d.exc || d._server_messages || ""))) {
    const err = new Error("Contractor rules not installed");
    err.userMessage = "Contractors aren't set up on the server yet, so nothing was saved. Ask the Administrator to run System Setup › Run setup, then try again.";
    return err;
  }
  return e;
}

/** Contractors the signed-in person may see. Empty until setup has run. */
export const listContractors = () => frappe.callMethod("ethx_contractors").catch(() => []);

/** Create the contractor (or reuse them, by email, when they join another project) and give them their role on the project. */
export async function addContractor({ project, projectLabel, fullName, email, password, role, start, eta, hoursPerDay, notes }) {
  let added;
  try {
    added = await frappe.callMethod("ethx_add_contractor", { project, email, full_name: fullName, password });
  } catch (e) {
    throw friendly(e);
  }
  await createAssignment({ project, projectLabel, email: added.email, role, start, eta, hoursPerDay, notes });
  return added;
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
