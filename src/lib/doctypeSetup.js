// Doctypes the app's screens need that may be missing on a site (installed from Admin › System Setup, automatically).
// Standard ERPNext / HRMS doctypes are never replaced: a definition here is only created when the doctype doesn't
// exist at all. Masters with a form in HR setup get a simple doctype built from that form's fields; Employee Group,
// Employee Grade and Employee Health Insurance get the fields the app reads. Doctypes with business logic (Leave
// Application, Salary Slip, Job Applicant…) can't be rebuilt this way - setup lists them as needing the HRMS app.
import { HR_SETUP_SECTIONS } from "./hrSetupConfig";

const perm = (role, write) => ({ role, read: 1, ...(write ? { write: 1, create: 1, delete: 1, report: 1, export: 1 } : {}) });
const PERMISSIONS = [perm("System Manager", true), perm("HR Manager", true), perm("HR User", true), perm("Employee")];

const RECRUIT_HR = [perm("System Manager", true), perm("HR Manager", true), perm("HR User", true)];
const RECRUIT_HR_SUBMIT = RECRUIT_HR.map((p) => ({ ...p, submit: 1, cancel: 1, amend: 1 }));

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
  // Interviews (HR › Recruitment). Some sites have HRMS without these, and saving a round then fails with "No module
  // named frappe.core.doctype.interview_round". Same names and fields as HRMS, so the app works either way.
  custom("Skill", {
    autoname: "field:skill_name",
    naming_rule: "By fieldname",
    fields: [
      { fieldname: "skill_name", label: "Skill", fieldtype: "Data", reqd: 1, unique: 1, in_list_view: 1 },
      { fieldname: "description", label: "Description", fieldtype: "Small Text" },
    ],
    permissions: [...RECRUIT_HR, { role: "Interviewer", read: 1 }],
  }),
  custom("Interview Type", {
    autoname: "Prompt",
    fields: [{ fieldname: "description", label: "Description", fieldtype: "Small Text", in_list_view: 1 }],
    permissions: [...RECRUIT_HR, { role: "Interviewer", read: 1 }],
  }),
  custom("Expected Skill Set", {
    istable: 1,
    permissions: [],
    fields: [
      { fieldname: "skill", label: "Skill", fieldtype: "Link", options: "Skill", reqd: 1, in_list_view: 1 },
      { fieldname: "description", label: "Description", fieldtype: "Small Text", in_list_view: 1 },
    ],
  }),
  custom("Interviewer", {
    istable: 1,
    permissions: [],
    fields: [{ fieldname: "user", label: "User", fieldtype: "Link", options: "User", in_list_view: 1 }],
  }),
  custom("Interview Round", {
    autoname: "field:round_name",
    naming_rule: "By fieldname",
    fields: [
      { fieldname: "round_name", label: "Round Name", fieldtype: "Data", reqd: 1, unique: 1, in_list_view: 1 },
      { fieldname: "interview_type", label: "Interview Type", fieldtype: "Link", options: "Interview Type" },
      { fieldname: "designation", label: "Designation", fieldtype: "Link", options: "Designation", in_list_view: 1 },
      { fieldname: "expected_average_rating", label: "Expected Average Rating", fieldtype: "Rating" },
      { fieldname: "expected_skill_set", label: "Expected Skill Set", fieldtype: "Table", options: "Expected Skill Set" },
      { fieldname: "interviewers", label: "Interviewers", fieldtype: "Table", options: "Interviewer" },
    ],
    permissions: [...RECRUIT_HR, { role: "Interviewer", read: 1 }],
  }),
  custom("Interview Detail", {
    istable: 1,
    permissions: [],
    fields: [{ fieldname: "interviewer", label: "Interviewer", fieldtype: "Link", options: "User", in_list_view: 1 }],
  }),
  custom("Interview", {
    is_submittable: 1,
    autoname: "format:HR-INT-{YYYY}-{####}",
    naming_rule: "Expression",
    fields: [
      { fieldname: "interview_round", label: "Interview Round", fieldtype: "Link", options: "Interview Round", reqd: 1, in_list_view: 1 },
      { fieldname: "job_applicant", label: "Job Applicant", fieldtype: "Link", options: "Job Applicant", reqd: 1, in_list_view: 1 },
      { fieldname: "job_opening", label: "Job Opening", fieldtype: "Link", options: "Job Opening", fetch_from: "job_applicant.job_title" },
      { fieldname: "designation", label: "Designation", fieldtype: "Link", options: "Designation", fetch_from: "interview_round.designation" },
      { fieldname: "status", label: "Status", fieldtype: "Select", options: "Pending\nUnder Review\nCleared\nRejected", default: "Pending", in_list_view: 1, allow_on_submit: 1 },
      { fieldname: "scheduled_on", label: "Scheduled On", fieldtype: "Date", reqd: 1, in_list_view: 1 },
      { fieldname: "from_time", label: "From Time", fieldtype: "Time", reqd: 1 },
      { fieldname: "to_time", label: "To Time", fieldtype: "Time", reqd: 1 },
      { fieldname: "expected_average_rating", label: "Expected Average Rating", fieldtype: "Rating", fetch_from: "interview_round.expected_average_rating" },
      { fieldname: "average_rating", label: "Average Rating", fieldtype: "Rating", read_only: 1, allow_on_submit: 1 },
      { fieldname: "interview_summary", label: "Interview Summary", fieldtype: "Text" },
      { fieldname: "resume_link", label: "Resume Link", fieldtype: "Data", allow_on_submit: 1 },
      { fieldname: "interview_details", label: "Interviewers", fieldtype: "Table", options: "Interview Detail" },
    ],
    permissions: [...RECRUIT_HR_SUBMIT, { role: "Interviewer", read: 1 }],
  }),
  custom("Skill Assessment", {
    istable: 1,
    permissions: [],
    fields: [
      { fieldname: "skill", label: "Skill", fieldtype: "Link", options: "Skill", in_list_view: 1 },
      { fieldname: "rating", label: "Rating", fieldtype: "Rating", in_list_view: 1 },
    ],
  }),
  custom("Interview Feedback", {
    is_submittable: 1,
    autoname: "format:HR-INT-FEEDBACK-{#####}",
    naming_rule: "Expression",
    fields: [
      { fieldname: "interview", label: "Interview", fieldtype: "Link", options: "Interview", reqd: 1, in_list_view: 1 },
      { fieldname: "interview_round", label: "Interview Round", fieldtype: "Link", options: "Interview Round", fetch_from: "interview.interview_round" },
      { fieldname: "job_applicant", label: "Job Applicant", fieldtype: "Link", options: "Job Applicant", fetch_from: "interview.job_applicant" },
      { fieldname: "interviewer", label: "Interviewer", fieldtype: "Link", options: "User", reqd: 1, in_list_view: 1 },
      { fieldname: "result", label: "Result", fieldtype: "Select", options: "\nCleared\nRejected", in_list_view: 1 },
      { fieldname: "average_rating", label: "Average Rating", fieldtype: "Rating" },
      { fieldname: "feedback", label: "Feedback", fieldtype: "Text" },
      { fieldname: "skill_assessment", label: "Skill Assessment", fieldtype: "Table", options: "Skill Assessment" },
    ],
    permissions: [...RECRUIT_HR_SUBMIT, { role: "Interviewer", read: 1, write: 1, create: 1, submit: 1 }],
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
export async function prepare(doc, frappe) {
  // Permission rows for roles the site doesn't have (e.g. Interviewer without HRMS) would stop the doctype saving.
  const roles = [...new Set((doc.permissions || []).map((p) => p.role))];
  if (roles.length) {
    const known = await frappe.getList("Role", { filters: [["name", "in", roles]], fields: ["name"], limit: 0 }).catch(() => roles.map((name) => ({ name })));
    const ok = new Set(known.map((r) => r.name));
    doc = { ...doc, permissions: doc.permissions.filter((p) => ok.has(p.role)) };
  }
  const targets = [...new Set(doc.fields.filter((f) => f.fieldtype === "Link").map((f) => f.options))];
  if (!targets.length) return doc;
  const existing = await frappe.getList("DocType", { filters: [["name", "in", targets]], fields: ["name"], limit: 0 }).catch(() => targets.map((name) => ({ name })));
  const have = new Set(existing.map((d) => d.name));
  // A plain-text field can't fetch from a link that was dropped, so its fetch goes too.
  const dropped = new Set(doc.fields.filter((f) => f.fieldtype === "Link" && !have.has(f.options)).map((f) => f.fieldname));
  return { ...doc, fields: doc.fields.map((f) => {
    const g = f.fieldtype === "Link" && !have.has(f.options) ? { ...f, fieldtype: "Data", options: undefined } : f;
    return g.fetch_from && dropped.has(g.fetch_from.split(".")[0]) ? { ...g, fetch_from: undefined } : g;
  }) };
}

export const FALLBACK_DOCTYPES = ordered([...EXPLICIT, ...generated]).map((doc) => ({
  name: doc.name,
  what: `${doc.name} (created because this site doesn't have it)`,
  doc,
  prepare,
  onlyIfMissing: true,
  // HRMS v16 merged Interview Round into Interview Type: when the site's own Interview exists, it isn't needed.
  ...(doc.name === "Interview Round" ? { skipIfPresent: "Interview" } : {}),
}));
