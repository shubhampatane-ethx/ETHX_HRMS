// ERPNext setup for every module that needs more than standard ERPNext/HRMS: custom fields, change history
// (version tracking) and server-side rules as Server Scripts. Run by the Administrator from Admin › ERPNext Setup
// (or HR › Recruitment › Setup). Idempotent: running it again only adds or updates what is missing or outdated.
import { frappe } from "./api/frappeClient";
import { RECRUITMENT_FIELDS, RECRUITMENT_SCRIPTS, RECRUITMENT_TRACK, SOURCES } from "./recruitmentSetup";
import { TIMESHEET_FIELDS, TIMESHEET_SCRIPTS, TIMESHEET_TRACK } from "./timesheetSetup";
import { SECURITY_FIELDS, SECURITY_SCRIPTS, SECURITY_TRACK, SECURITY_PROPERTIES } from "./securitySetup";
import { TEAM_SCRIPTS } from "./teamSetup";
import { APPROVAL_FIELDS, APPROVAL_SCRIPTS, APPROVAL_TRACK } from "./approvalSetup";
import { ASSET_FIELDS, ASSET_SCRIPTS, ASSET_TRACK } from "./assetSetup";
import { OFFICE_FIELDS, OFFICE_SCRIPTS, OFFICE_TRACK } from "./officeSetup";
import { ATTENDANCE_SCRIPTS } from "./attendanceSetup";

export const MODULES = [
  { id: "recruitment", label: "Recruitment", fields: RECRUITMENT_FIELDS, scripts: RECRUITMENT_SCRIPTS, track: RECRUITMENT_TRACK },
  { id: "timesheets", label: "Timesheet review", fields: TIMESHEET_FIELDS, scripts: TIMESHEET_SCRIPTS, track: TIMESHEET_TRACK, migrate: "ethx_migrate_timesheet_reviews" },
  { id: "security", label: "Security & audit", fields: SECURITY_FIELDS, scripts: SECURITY_SCRIPTS, track: SECURITY_TRACK, properties: SECURITY_PROPERTIES },
  { id: "team", label: "Employee & manager self-service", fields: [], scripts: TEAM_SCRIPTS, track: [] },
  { id: "approvals", label: "Leave & expense approvals", fields: APPROVAL_FIELDS, scripts: APPROVAL_SCRIPTS, track: APPROVAL_TRACK },
  { id: "assets", label: "Asset register", fields: ASSET_FIELDS, scripts: ASSET_SCRIPTS, track: ASSET_TRACK },
  { id: "offices", label: "Office locations & holidays", fields: OFFICE_FIELDS, scripts: OFFICE_SCRIPTS, track: OFFICE_TRACK },
  { id: "attendance", label: "Attendance from punches", fields: [], scripts: ATTENDANCE_SCRIPTS, track: [] },
];

const ALL_FIELDS = MODULES.flatMap((m) => m.fields);
const ALL_SCRIPTS = MODULES.flatMap((m) => m.scripts);
const ALL_TRACK = [...new Set(MODULES.flatMap((m) => m.track))];
const ALL_PROPS = MODULES.flatMap((m) => m.properties || []);
const propKey = (p) => `${p.doc_type}:${p.field_name || ""}:${p.property}`;

export async function setupStatus() {
  const [fields, setters, props, scripts, sources] = await Promise.all([
    frappe.getList("Custom Field", { filters: [["dt", "in", [...new Set(ALL_FIELDS.map((f) => f.dt))]], ["fieldname", "in", ALL_FIELDS.map((f) => f.fieldname)]], fields: ["dt", "fieldname"], limit: 0 }).catch(() => null),
    frappe.getList("Property Setter", { filters: [["doc_type", "in", ALL_TRACK], ["property", "=", "track_changes"]], fields: ["doc_type", "value"], limit: 0 }).catch(() => null),
    ALL_PROPS.length ? frappe.getList("Property Setter", { filters: [["doc_type", "in", [...new Set(ALL_PROPS.map((p) => p.doc_type))]], ["property", "in", [...new Set(ALL_PROPS.map((p) => p.property))]]], fields: ["doc_type", "field_name", "property", "value"], limit: 0 }).catch(() => null) : Promise.resolve([]),
    frappe.getList("Server Script", { filters: [["name", "in", ALL_SCRIPTS.map((s) => s.name)]], fields: ["name", "disabled", "script"], limit: 0 }).catch(() => null),
    frappe.getList("Job Applicant Source", { fields: ["name"], limit: 0 }).catch(() => null),
  ]);
  const have = new Set((fields || []).map((f) => `${f.dt}:${f.fieldname}`));
  const haveProps = new Map((props || []).map((p) => [propKey(p), String(p.value)]));
  const scriptOk = (s) => Boolean((scripts || []).find((x) => x.name === s.name && !Number(x.disabled) && String(x.script || "").trim() === s.script.trim()));
  return {
    canRead: fields !== null,
    scriptsReadable: scripts !== null,
    modules: MODULES.map((m) => ({
      ...m,
      missingFields: m.fields.filter((f) => !have.has(`${f.dt}:${f.fieldname}`)),
      untracked: setters === null ? m.track : m.track.filter((d) => !(setters || []).some((s) => s.doc_type === d && String(s.value) === "1")),
      missingProps: (m.properties || []).filter((p) => haveProps.get(propKey(p)) !== String(p.value)),
      scripts: m.scripts.map((s) => ({ ...s, installed: scriptOk(s) })),
    })),
    missingSources: sources === null ? SOURCES : SOURCES.filter((s) => !(sources || []).some((x) => x.name === s)),
  };
}

const why = (e) => String(e?.response?.data?.exception || e?.response?.data?._server_messages || e?.message || "").replace(/\berpnext\b/gi, "HRMS").slice(0, 220);

export async function runSetup(onStep = () => {}) {
  const log = [];
  const step = (text, ok = true) => { log.push({ text, ok }); onStep([...log]); };
  const status = await setupStatus();
  let scriptsBlocked = false;

  for (const m of status.modules) {
    for (const f of m.missingFields) {
      try {
        await frappe.createDoc("Custom Field", f);
        step(`${m.label}: field added - ${f.dt} › ${f.label || f.fieldname}`);
      } catch (e) {
        step(`${m.label}: couldn't add ${f.dt} › ${f.fieldname}: ${why(e)}`, false);
      }
    }
    for (const dt of m.untracked) {
      try {
        await frappe.callMethod("frappe.client.insert", { doc: { doctype: "Property Setter", doctype_or_field: "DocType", doc_type: dt, property: "track_changes", property_type: "Check", value: "1" } });
        step(`${m.label}: change history switched on for ${dt}`);
      } catch (e) {
        step(`${m.label}: couldn't switch on change history for ${dt}: ${why(e)}`, false);
      }
    }
    for (const p of m.missingProps) {
      try {
        const existing = await frappe.getList("Property Setter", { filters: [["doc_type", "=", p.doc_type], ["field_name", "=", p.field_name || ""], ["property", "=", p.property]], fields: ["name"], limit: 1 });
        if (existing.length) await frappe.updateDoc("Property Setter", existing[0].name, { value: String(p.value) });
        else await frappe.callMethod("frappe.client.insert", { doc: { doctype: "Property Setter", doctype_or_field: p.field_name ? "DocField" : "DocType", doc_type: p.doc_type, field_name: p.field_name, property: p.property, property_type: p.property_type || "Int", value: String(p.value) } });
        step(`${m.label}: ${p.what}`);
      } catch (e) {
        step(`${m.label}: couldn't set ${p.doc_type}.${p.field_name} ${p.property}: ${why(e)}`, false);
      }
    }
    for (const s of m.scripts.filter((x) => !x.installed)) {
      if (scriptsBlocked) break;
      try {
        const exists = await frappe.getList("Server Script", { filters: [["name", "=", s.name]], fields: ["name"], limit: 1 });
        const body = s.script_type === "API"
          ? { script_type: "API", api_method: s.api_method, allow_guest: 0, script: s.script.trim(), disabled: 0 }
          : s.script_type === "Scheduler Event"
            ? { script_type: "Scheduler Event", event_frequency: s.event_frequency || "Daily", script: s.script.trim(), disabled: 0 }
            : s.script_type === "Permission Query"
              ? { script_type: "Permission Query", reference_doctype: s.reference_doctype, script: s.script.trim(), disabled: 0 }
              : { script_type: "DocType Event", reference_doctype: s.reference_doctype, doctype_event: s.doctype_event, script: s.script.trim(), disabled: 0 };
        if (exists.length) await frappe.updateDoc("Server Script", s.name, body);
        else await frappe.createDoc("Server Script", { name: s.name, __newname: s.name, ...body });
        step(`${m.label}: server rule installed - ${s.what}`);
      } catch (e) {
        const msg = why(e);
        if (/server script/i.test(msg) && /disabled|enable/i.test(msg)) {
          scriptsBlocked = true;
          step("Server-side rules are disabled. Ask your administrator to enable them, restart the service, and run setup again.", false);
        } else step(`${m.label}: couldn't install "${s.name}": ${msg}`, false);
      }
    }
    if (m.migrate && !scriptsBlocked) {
      try {
        const r = await frappe.callMethod(m.migrate);
        if (r && (r.timesheets || r.projects)) step(`${m.label}: migrated ${r.timesheets} timesheet(s) to the new review fields; ${r.projects} project(s) given their creator as project manager`);
      } catch (e) {
        step(`${m.label}: migration didn't run: ${why(e)}`, false);
      }
    }
  }
  for (const s of status.missingSources) {
    try {
      await frappe.createDoc("Job Applicant Source", { source_name: s });
      step(`Recruitment: candidate source added - ${s}`);
    } catch { /* already exists under another case, or no permission */ }
  }
  if (!log.length) step("Everything was already set up.");
  return log;
}

/** Are a module's custom fields installed? Screens use this to fall back or show a setup hint. */
export async function fieldsReady(doctype, fieldname) {
  try {
    await frappe.getList(doctype, { fields: ["name", fieldname], limit: 1 });
    return true;
  } catch {
    return false;
  }
}
