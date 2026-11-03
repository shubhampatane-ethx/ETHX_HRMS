// Doctypes the app's screens need that may be missing on a site (installed from Admin › System Setup, automatically).
// Standard ERPNext / HRMS doctypes are never replaced: a definition here is only created when the doctype doesn't
// exist at all. Masters with a form in HR setup get a simple doctype built from that form's fields; Employee Group,
// Employee Grade and Employee Health Insurance get the fields the app reads. Doctypes with business logic (Leave
// Application, Salary Slip, Job Applicant…) can't be rebuilt this way - setup lists them as needing the HRMS app.
import { HR_SETUP_SECTIONS } from "./hrSetupConfig";

const perm = (role, write) => ({ role, read: 1, ...(write ? { write: 1, create: 1, delete: 1, report: 1, export: 1 } : {}) });
const PERMISSIONS = [perm("System Manager", true), perm("HR Manager", true), perm("HR User", true), perm("Employee")];

const custom = (name, extra) => ({ name, module: "Custom", custom: 1, track_changes: 1, permissions: PERMISSIONS, ...extra });

// Explicit definitions, for doctypes the app reads beyond their setup form.
const EXPLICIT = [
  custom("Employee Group Table", {
    istable: 1,
    permissions: [],
    fields: [
      { fieldname: "employee", label: "Employee", fieldtype: "Link", options: "Employee", in_list_view: 1, reqd: 1 },
      { fieldname: "employee_name", label: "Employee Name", fieldtype: "Data", in_list_view: 1, fetch_from: "employee.employee_name" },
      { fieldname: "user_id", label: "User ID", fieldtype: "Data", fetch_from: "employee.user_id" },
    ],
  }),
  custom("Employee Group", {
    autoname: "field:employee_group_name",
    naming_rule: "By fieldname",
    fields: [
      { fieldname: "employee_group_name", label: "Group Name", fieldtype: "Data", reqd: 1, unique: 1, in_list_view: 1 },
      { fieldname: "employee_list", label: "Employees", fieldtype: "Table", options: "Employee Group Table" },
    ],
  }),
  custom("Employee Grade", {
    autoname: "Prompt",
    fields: [{ fieldname: "default_salary_structure", label: "Default Salary Structure", fieldtype: "Data" }],
  }),
  custom("Employee Health Insurance", {
    autoname: "field:health_insurance_name",
    naming_rule: "By fieldname",
    fields: [{ fieldname: "health_insurance_name", label: "Health Insurance Name", fieldtype: "Data", reqd: 1, unique: 1, in_list_view: 1 }],
  }),
];

const TYPE = { text: "Data", date: "Date", datetime: "Datetime", select: "Select", link: "Link", textarea: "Small Text", number: "Float", email: "Data", tel: "Data" };

/** A simple doctype from an HR setup form: its fields, named by the first required text field (or by prompt). */
function fromForm(item) {
  const prompt = item.formFields.some((f) => f.name === "name");
  const fields = item.formFields.filter((f) => f.name !== "name").map((f) => ({
    fieldname: f.name,
    label: f.label,
    fieldtype: TYPE[f.type || "text"] || "Data",
    ...(f.type === "select" ? { options: f.options.join("\n") } : f.type === "link" ? { options: f.linkDoctype } : f.type === "email" ? { options: "Email" } : {}),
    ...(f.required ? { reqd: 1 } : {}),
    in_list_view: 1,
  }));
  const key = !prompt && fields.find((f) => f.reqd && f.fieldtype === "Data");
  return custom(item.doctype, key ? { autoname: `field:${key.fieldname}`, naming_rule: "By fieldname", title_field: key.fieldname, fields: fields.map((f) => (f === key ? { ...f, unique: 1 } : f)) } : { autoname: prompt ? "Prompt" : "hash", fields });
}

const explicitNames = new Set(EXPLICIT.map((d) => d.name));
const generated = HR_SETUP_SECTIONS.flatMap((s) => s.items)
  .filter((i) => i.doctype && i.formFields?.length && !explicitNames.has(i.doctype))
  .map(fromForm);

// Doctypes that link to others in this list are created after them (Employee Group after its table, Department after Company…).
function ordered(list) {
  const names = new Set(list.map((d) => d.name));
  const out = [];
  const placed = new Set();
  const needs = (d) => d.fields.filter((f) => ["Link", "Table"].includes(f.fieldtype) && names.has(f.options) && f.options !== d.name).map((f) => f.options);
  while (out.length < list.length) {
    const next = list.find((d) => !placed.has(d.name) && needs(d).every((n) => placed.has(n))) || list.find((d) => !placed.has(d.name));
    out.push(next);
    placed.add(next.name);
  }
  return out;
}

/**
 * Before creating, a Link to a doctype that doesn't exist on the site (and isn't created here first) becomes plain
 * text, so the new doctype can still be saved.
 */
async function prepare(doc, frappe) {
  const targets = [...new Set(doc.fields.filter((f) => f.fieldtype === "Link").map((f) => f.options))];
  if (!targets.length) return doc;
  const existing = await frappe.getList("DocType", { filters: [["name", "in", targets]], fields: ["name"], limit: 0 }).catch(() => targets.map((name) => ({ name })));
  const have = new Set(existing.map((d) => d.name));
  return { ...doc, fields: doc.fields.map((f) => (f.fieldtype === "Link" && !have.has(f.options) ? { ...f, fieldtype: "Data", options: undefined } : f)) };
}

export const FALLBACK_DOCTYPES = ordered([...EXPLICIT, ...generated]).map((doc) => ({
  name: doc.name,
  what: `${doc.name} (created because this site doesn't have it)`,
  doc,
  prepare,
  onlyIfMissing: true,
}));
