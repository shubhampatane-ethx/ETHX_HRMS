// One-time recruitment setup, run by the Administrator from HR > Recruitment > Setup.
// Adds the custom fields the screens use, switches on change tracking (so every pipeline move is recorded by
// ERPNext itself) and installs server-side rules as Server Scripts so approvals can't be bypassed from the
// browser. Each step is idempotent: running it again only adds what is missing.
import { frappe } from "./api/frappeClient";

const sel = (...o) => o.join("\n");
// Must match ALL_STAGES in recruitment.js.
const STAGE_OPTIONS = ["Applied", "Screening", "Shortlisted", "Interview", "Selected", "Offer", "Hired", "Hold", "Rejected", "Withdrawn"];

// Sites set up before "Selected" existed get it added to the stage list.
export const RECRUITMENT_PROPERTIES = [
  { doc_type: "Job Applicant", field_name: "custom_ethx_stage", property: "options", property_type: "Text", value: sel(...STAGE_OPTIONS), what: "Job Applicant › stage can be Selected" },
];

export const RECRUITMENT_FIELDS = [
  // Job Applicant - pipeline, screening, consent, retention
  { dt: "Job Applicant", fieldname: "custom_ethx_section", label: "ETHX Pipeline", fieldtype: "Section Break", insert_after: "upper_range" },
  { dt: "Job Applicant", fieldname: "custom_ethx_stage", label: "Pipeline Stage", fieldtype: "Select", options: sel(...STAGE_OPTIONS), default: "Applied", in_list_view: 1, in_standard_filter: 1, insert_after: "custom_ethx_section" },
  { dt: "Job Applicant", fieldname: "custom_stage_since", label: "In Stage Since", fieldtype: "Datetime", read_only: 1, insert_after: "custom_ethx_stage" },
  { dt: "Job Applicant", fieldname: "custom_reject_reason", label: "Rejection / Withdrawal Reason", fieldtype: "Small Text", insert_after: "custom_stage_since" },
  { dt: "Job Applicant", fieldname: "custom_ethx_col1", fieldtype: "Column Break", insert_after: "custom_reject_reason" },
  { dt: "Job Applicant", fieldname: "custom_current_company", label: "Current Company", fieldtype: "Data", insert_after: "custom_ethx_col1" },
  { dt: "Job Applicant", fieldname: "custom_total_experience", label: "Total Experience (years)", fieldtype: "Float", insert_after: "custom_current_company" },
  { dt: "Job Applicant", fieldname: "custom_notice_days", label: "Notice Period (days)", fieldtype: "Int", insert_after: "custom_total_experience" },
  { dt: "Job Applicant", fieldname: "custom_location", label: "Current Location", fieldtype: "Data", insert_after: "custom_notice_days" },
  { dt: "Job Applicant", fieldname: "custom_skills", label: "Key Skills", fieldtype: "Small Text", insert_after: "custom_location" },
  // CTC is restricted: permlevel 1 so only roles granted level-1 access (HR) can read it.
  { dt: "Job Applicant", fieldname: "custom_ctc_section", label: "Compensation", fieldtype: "Section Break", insert_after: "custom_skills", permlevel: 1 },
  { dt: "Job Applicant", fieldname: "custom_current_ctc", label: "Current CTC (annual)", fieldtype: "Currency", insert_after: "custom_ctc_section", permlevel: 1 },
  { dt: "Job Applicant", fieldname: "custom_expected_ctc", label: "Expected CTC (annual)", fieldtype: "Currency", insert_after: "custom_current_ctc", permlevel: 1 },
  { dt: "Job Applicant", fieldname: "custom_privacy_section", label: "Consent & Retention", fieldtype: "Section Break", insert_after: "custom_expected_ctc" },
  { dt: "Job Applicant", fieldname: "custom_consent", label: "Consent to Process Data (DPDP Act)", fieldtype: "Check", insert_after: "custom_privacy_section" },
  { dt: "Job Applicant", fieldname: "custom_consent_on", label: "Consent Recorded On", fieldtype: "Datetime", insert_after: "custom_consent" },
  { dt: "Job Applicant", fieldname: "custom_retain_until", label: "Retain Data Until", fieldtype: "Date", insert_after: "custom_consent_on" },
  { dt: "Job Applicant", fieldname: "custom_anonymised", label: "Anonymised", fieldtype: "Check", read_only: 1, insert_after: "custom_retain_until" },
  // Candidate repository (REP-01 to REP-05): CV text for search and matching, a fingerprint of the CV file so the
  // same file isn't imported twice, and the profile fields search filters on.
  { dt: "Job Applicant", fieldname: "custom_profile_section", label: "Profile (from CV)", fieldtype: "Section Break", insert_after: "custom_anonymised" },
  { dt: "Job Applicant", fieldname: "custom_current_title", label: "Current Title", fieldtype: "Data", insert_after: "custom_profile_section" },
  { dt: "Job Applicant", fieldname: "custom_target_title", label: "Target Title", fieldtype: "Data", insert_after: "custom_current_title" },
  { dt: "Job Applicant", fieldname: "custom_relevant_experience", label: "Relevant Experience (years)", fieldtype: "Float", insert_after: "custom_target_title" },
  { dt: "Job Applicant", fieldname: "custom_preferred_locations", label: "Preferred Locations", fieldtype: "Data", insert_after: "custom_relevant_experience" },
  { dt: "Job Applicant", fieldname: "custom_work_mode", label: "Work Mode", fieldtype: "Select", options: sel("", "Onsite", "Hybrid", "Remote", "Any"), insert_after: "custom_preferred_locations" },
  { dt: "Job Applicant", fieldname: "custom_profile_col", fieldtype: "Column Break", insert_after: "custom_work_mode" },
  { dt: "Job Applicant", fieldname: "custom_cv_updated_on", label: "CV Updated On", fieldtype: "Datetime", read_only: 1, insert_after: "custom_profile_col" },
  { dt: "Job Applicant", fieldname: "custom_cv_hash", label: "CV Fingerprint", fieldtype: "Data", read_only: 1, hidden: 1, insert_after: "custom_cv_updated_on" },
  { dt: "Job Applicant", fieldname: "custom_needs_review", label: "Needs Review", fieldtype: "Check", insert_after: "custom_cv_hash", description: "The CV couldn't be read fully - check the profile against the CV" },
  { dt: "Job Applicant", fieldname: "custom_cv_text", label: "CV Text", fieldtype: "Long Text", read_only: 1, insert_after: "custom_needs_review", description: "Extracted from the CV for search and JD matching" },

  // Job Opening - skills, experience and the ordered interview rounds
  { dt: "Job Opening", fieldname: "custom_skills", label: "Key Skills", fieldtype: "Small Text", insert_after: "description" },
  { dt: "Job Opening", fieldname: "custom_experience", label: "Experience Required", fieldtype: "Data", insert_after: "custom_skills" },
  { dt: "Job Opening", fieldname: "custom_interview_rounds", label: "Interview Rounds (in order)", fieldtype: "Small Text", insert_after: "custom_experience", description: "Managed from the HRMS 360 app" },
  // Job posting: where the opening has been posted (JSON list of { board, on, by }).
  { dt: "Job Opening", fieldname: "custom_job_boards", label: "Posted On", fieldtype: "Small Text", insert_after: "custom_interview_rounds", description: "Managed from the HRMS 360 app" },
  // JD matching (MATCH-01): the JD's text and the recruiter-confirmed criteria (JSON, with a version number).
  { dt: "Job Opening", fieldname: "custom_jd_text", label: "Job Description Text", fieldtype: "Long Text", insert_after: "custom_interview_rounds", description: "Managed from the HRMS 360 app" },
  { dt: "Job Opening", fieldname: "custom_jd_criteria", label: "JD Matching Criteria", fieldtype: "Long Text", insert_after: "custom_jd_text", description: "Managed from the HRMS 360 app" },

  // Job Requisition - project and decision trail
  { dt: "Job Requisition", fieldname: "custom_project", label: "Project", fieldtype: "Link", options: "Project", insert_after: "department" },
  { dt: "Job Requisition", fieldname: "custom_approved_by", label: "Decided By", fieldtype: "Link", options: "User", read_only: 1, insert_after: "completed_on" },
  { dt: "Job Requisition", fieldname: "custom_approved_on", label: "Decided On", fieldtype: "Datetime", read_only: 1, insert_after: "custom_approved_by" },
  { dt: "Job Requisition", fieldname: "custom_decision_note", label: "Decision Note", fieldtype: "Small Text", insert_after: "custom_approved_on" },

  // Job Offer - CTC, joining, validity, maker-checker approval, outcome
  { dt: "Job Offer", fieldname: "custom_ethx_section", label: "ETHX Offer Details", fieldtype: "Section Break", insert_after: "company" },
  { dt: "Job Offer", fieldname: "custom_job_opening", label: "Job Opening", fieldtype: "Link", options: "Job Opening", insert_after: "custom_ethx_section" },
  { dt: "Job Offer", fieldname: "custom_ctc", label: "Offered CTC (annual)", fieldtype: "Currency", insert_after: "custom_job_opening", permlevel: 1 },
  { dt: "Job Offer", fieldname: "custom_joining_date", label: "Expected Joining Date", fieldtype: "Date", insert_after: "custom_ctc" },
  { dt: "Job Offer", fieldname: "custom_valid_till", label: "Offer Valid Till", fieldtype: "Date", insert_after: "custom_joining_date" },
  { dt: "Job Offer", fieldname: "custom_rounds_override", label: "Interview Rounds Override Reason", fieldtype: "Small Text", insert_after: "custom_valid_till" },
  { dt: "Job Offer", fieldname: "custom_ethx_col1", fieldtype: "Column Break", insert_after: "custom_rounds_override" },
  { dt: "Job Offer", fieldname: "custom_approval_status", label: "Approval Status", fieldtype: "Select", options: sel("Draft", "Pending Approval", "Approved", "Rejected"), default: "Draft", in_list_view: 1, insert_after: "custom_ethx_col1" },
  { dt: "Job Offer", fieldname: "custom_approved_by", label: "Approved / Rejected By", fieldtype: "Link", options: "User", read_only: 1, insert_after: "custom_approval_status" },
  { dt: "Job Offer", fieldname: "custom_approved_on", label: "Approved / Rejected On", fieldtype: "Datetime", read_only: 1, insert_after: "custom_approved_by" },
  { dt: "Job Offer", fieldname: "custom_approval_note", label: "Approval Note", fieldtype: "Small Text", insert_after: "custom_approved_on" },
  { dt: "Job Offer", fieldname: "custom_response_on", label: "Candidate Responded On", fieldtype: "Date", allow_on_submit: 1, insert_after: "custom_approval_note" },
  { dt: "Job Offer", fieldname: "custom_joining_status", label: "Joining Status", fieldtype: "Select", options: sel("", "Awaiting Joining", "Joined", "No-show", "Withdrawn"), allow_on_submit: 1, insert_after: "custom_response_on" },

  // Interview - how and where
  { dt: "Interview", fieldname: "custom_mode", label: "Mode", fieldtype: "Select", options: sel("", "Video call", "In person", "Phone"), insert_after: "to_time" },
  { dt: "Interview", fieldname: "custom_meeting_link", label: "Meeting Link / Location", fieldtype: "Data", insert_after: "custom_mode" },
];

// Record every change to these documents in ERPNext's version history (the audit trail for stage moves,
// approvals and offer edits).
export const RECRUITMENT_TRACK = ["Job Applicant", "Job Offer", "Job Requisition", "Job Opening"];

export const SOURCES = ["Careers Page", "LinkedIn", "Naukri", "Employee Referral", "Agency", "Walk In", "Campaign"];

/* ------------------------------ server scripts ------------------------------ */
// RestrictedPython sandbox: no imports and no frappe.get_roles - roles are read from Has Role. frappe.db, json,
// frappe.utils and frappe.get_all are available. Comprehensions can't see the script's local variables (only their
// own loop variable), so filters that need another variable are written as plain loops.

const REQUISITION_DECISION = `
old = doc.get_doc_before_save()
prev = old.status if old else None
if doc.status != prev and doc.status in ("Open & Approved", "Rejected", "On Hold"):
    roles = frappe.get_all("Has Role", filters={"parent": frappe.session.user, "parenttype": "User"}, pluck="role")
    if frappe.session.user != "Administrator" and not ("HR Manager" in roles or "System Manager" in roles):
        frappe.throw("Only an HR Manager can approve, hold or reject a job requisition.")
    requester = frappe.db.get_value("Employee", doc.requested_by, "user_id") if doc.requested_by else None
    if requester and requester == frappe.session.user and frappe.session.user != "Administrator":
        frappe.throw("You can't decide on your own requisition. Ask another HR Manager.")
    doc.custom_approved_by = frappe.session.user
    doc.custom_approved_on = frappe.utils.now()
`;

const OFFER_APPROVAL = `
old = doc.get_doc_before_save()
prev = (old.custom_approval_status if old else None) or "Draft"
new = doc.custom_approval_status or "Draft"
if new != prev and new in ("Approved", "Rejected"):
    roles = frappe.get_all("Has Role", filters={"parent": frappe.session.user, "parenttype": "User"}, pluck="role")
    if frappe.session.user != "Administrator" and not ("HR Manager" in roles or "System Manager" in roles):
        frappe.throw("Only an HR Manager can approve or reject an offer.")
    if doc.owner == frappe.session.user and frappe.session.user != "Administrator":
        others = 0
        for r in frappe.get_all("Has Role", filters={"role": ["in", ["HR Manager", "System Manager"]], "parenttype": "User"}, fields=["parent"]):
            if r.parent not in (frappe.session.user, "Administrator", "Guest") and frappe.db.get_value("User", r.parent, "enabled"):
                others = others + 1
        if others:
            frappe.throw("Maker-checker: the person who prepared this offer can't approve it. Ask another HR Manager.")
    doc.custom_approved_by = frappe.session.user
    doc.custom_approved_on = frappe.utils.now()
elif new != prev and new in ("Draft", "Pending Approval"):
    doc.custom_approved_by = None
    doc.custom_approved_on = None
# "Before Save" also runs when the offer is submitted (sent); only draft edits can invalidate an approval.
# Values are compared by meaning, not text: the browser sends 1800000 where the database holds 1800000.0.
if old and doc.docstatus == 0 and prev == "Approved" and new == "Approved":
    changed = frappe.utils.flt(doc.custom_ctc) != frappe.utils.flt(old.custom_ctc)
    for f in ("custom_joining_date", "custom_valid_till", "offer_date"):
        a = doc.get(f)
        b = old.get(f)
        if (str(frappe.utils.getdate(a)) if a else "") != (str(frappe.utils.getdate(b)) if b else ""):
            changed = True
    for f in ("designation", "company", "terms"):
        if frappe.utils.cstr(doc.get(f)).strip() != frappe.utils.cstr(old.get(f)).strip():
            changed = True
    if changed:
        doc.custom_approval_status = "Pending Approval"
        doc.custom_approved_by = None
        doc.custom_approved_on = None
if doc.custom_valid_till and doc.offer_date and str(doc.custom_valid_till) < str(doc.offer_date):
    frappe.throw("The offer can't expire before the offer date.")
`;

const OFFER_SEND_GATE = `
if (doc.custom_approval_status or "Draft") != "Approved":
    frappe.throw("This offer must be approved by an HR Manager before it is sent.")
opening = doc.custom_job_opening or frappe.db.get_value("Job Applicant", doc.job_applicant, "job_title")
required = []
if opening:
    raw = frappe.db.get_value("Job Opening", opening, "custom_interview_rounds")
    if raw:
        try:
            required = json.loads(raw)
        except Exception:
            required = [r.strip() for r in raw.replace(",", "\\n").split("\\n") if r.strip()]
# HRMS v16 keeps the round in interview_type (Interview Round was merged into Interview Type).
round_field = "interview_type" if frappe.get_meta("Interview").has_field("interview_type") else "interview_round"
cleared = frappe.get_all("Interview", filters={"job_applicant": doc.job_applicant, "docstatus": 1, "status": "Cleared"}, pluck=round_field)
missing = []
for r in required:
    if r not in cleared:
        missing.append(r)
if missing and not (doc.custom_rounds_override or "").strip():
    frappe.throw("Interview rounds not cleared yet: " + ", ".join(missing) + ". Clear them or give an override reason on the offer.")
`;

const APPLICANT_DUPLICATE = `
if doc.job_title:
    same = frappe.db.get_value("Job Applicant", {"job_title": doc.job_title, "email_id": doc.email_id}, "name")
    if not same and doc.phone_number:
        digits = "".join([c for c in doc.phone_number if c.isdigit()])[-10:]
        if len(digits) >= 8:
            for other in frappe.get_all("Job Applicant", filters={"job_title": doc.job_title, "phone_number": ["is", "set"]}, fields=["name", "phone_number"]):
                if "".join([c for c in (other.phone_number or "") if c.isdigit()])[-10:] == digits:
                    same = other.name
                    break
    if same:
        frappe.throw("This candidate has already applied for this opening (" + same + ").")
if not doc.custom_ethx_stage:
    doc.custom_ethx_stage = "Applied"
if not doc.custom_stage_since:
    doc.custom_stage_since = frappe.utils.now()
`;

const EMPLOYEE_DUPLICATE = `
if doc.get("job_applicant"):
    other = frappe.db.get_value("Employee", {"job_applicant": doc.job_applicant}, "name")
    if other:
        frappe.throw("An employee (" + other + ") has already been created from this candidate.")
`;

// API method: /api/method/ethx_anonymise_applicant. Server-side so it can also clear the copies of the name and
// email on submitted documents (offers, interviews) and sent emails, which the REST API can't edit.
const ANONYMISE = `
name = frappe.form_dict.get("applicant")
roles = frappe.get_all("Has Role", filters={"parent": frappe.session.user, "parenttype": "User"}, pluck="role")
if frappe.session.user != "Administrator" and not ("HR Manager" in roles or "HR User" in roles):
    frappe.throw("Only HR can anonymise candidates.")
app = frappe.db.get_value("Job Applicant", name, ["name", "email_id", "custom_ethx_stage"], as_dict=True)
if not app:
    frappe.throw("Candidate not found.")
if app.custom_ethx_stage == "Hired" or frappe.db.exists("Employee", {"job_applicant": name}):
    frappe.throw("This candidate was hired - their data now belongs to the employee record and isn't anonymised here.")
new = "anonymised-" + frappe.utils.generate_hash(length=8) + "@redacted.invalid"
for f in frappe.get_all("File", filters={"attached_to_doctype": "Job Applicant", "attached_to_name": name}, pluck="name"):
    frappe.delete_doc("File", f, ignore_permissions=True)
blank = {"applicant_name": "Anonymised candidate", "email_id": new, "phone_number": None, "cover_letter": None, "resume_attachment": None, "resume_link": None,
    "custom_current_ctc": 0, "custom_expected_ctc": 0, "custom_current_company": None, "custom_location": None, "custom_skills": None,
    "custom_reject_reason": None, "lower_range": 0, "upper_range": 0, "custom_anonymised": 1}
frappe.db.set_value("Job Applicant", name, blank)
for o in frappe.get_all("Job Offer", filters={"job_applicant": name}, pluck="name"):
    frappe.db.set_value("Job Offer", o, {"applicant_name": "Anonymised candidate", "applicant_email": new})
for i in frappe.get_all("Interview", filters={"job_applicant": name}, pluck="name"):
    frappe.db.set_value("Interview", i, {"resume_link": None})
for c in frappe.get_all("Communication", filters={"reference_doctype": "Job Applicant", "reference_name": name}, pluck="name"):
    frappe.db.set_value("Communication", c, {"recipients": new, "content": "[removed - candidate anonymised]", "subject": "[removed]"})
for c in frappe.get_all("Communication", filters={"reference_doctype": "Job Offer", "recipients": ["like", "%" + app.email_id + "%"]}, pluck="name"):
    frappe.db.set_value("Communication", c, {"recipients": new, "content": "[removed - candidate anonymised]"})
frappe.rename_doc("Job Applicant", name, new, force=True)
frappe.response["message"] = new
`;

export const RECRUITMENT_SCRIPTS = [
  { name: "ETHX - Requisition decision", reference_doctype: "Job Requisition", doctype_event: "Before Save", script: REQUISITION_DECISION, what: "Only HR Managers can approve / reject requisitions, never their own" },
  { name: "ETHX - Offer approval", reference_doctype: "Job Offer", doctype_event: "Before Save", script: OFFER_APPROVAL, what: "Offer maker-checker; editing an approved offer sends it back for approval" },
  { name: "ETHX - Offer send gate", reference_doctype: "Job Offer", doctype_event: "Before Submit", script: OFFER_SEND_GATE, what: "Offers can't be sent unapproved or before all interview rounds are cleared (unless overridden with a reason)" },
  { name: "ETHX - Applicant duplicates", reference_doctype: "Job Applicant", doctype_event: "Before Insert", script: APPLICANT_DUPLICATE, what: "Blocks the same person applying twice to one opening (email or phone)" },
  { name: "ETHX - One employee per candidate", reference_doctype: "Employee", doctype_event: "Before Insert", script: EMPLOYEE_DUPLICATE, what: "Prevents converting the same candidate into two employees" },
  { name: "ETHX - Anonymise applicant", script_type: "API", api_method: "ethx_anonymise_applicant", script: ANONYMISE, what: "Anonymises a candidate completely (including sent offers, interviews and emails)" },
];

export async function recruitmentReady() {
  try {
    const rows = await frappe.getList("Job Applicant", { fields: ["name", "custom_ethx_stage"], limit: 1 });
    return Array.isArray(rows);
  } catch {
    return false;
  }
}
