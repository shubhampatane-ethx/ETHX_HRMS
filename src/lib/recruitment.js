// Recruitment: pipeline stages, ERPNext HRMS calls and small helpers shared by every recruitment screen.
//
// Everything is stored in standard HRMS doctypes (Job Requisition, Job Opening, Job Applicant, Interview Round,
// Interview, Interview Feedback, Job Offer, Employee Onboarding). The few things HRMS has no field for (pipeline
// stage, CTC, offer approval, joining outcome, consent, retention) live in custom fields that the Administrator
// installs once from HR > Recruitment > Setup (see recruitmentSetup.js).
import { frappe } from "./api/frappeClient";
import { candidateSender } from "./comms";
import { addDays, ensureOfferTemplateFolder, isoDate, listTry, nowStamp, OFFER_TEMPLATE_FOLDER, pad, stripHtml } from "./employeePortal";

/* --------------------------------- stages --------------------------------- */

// Pipeline columns, left to right. `status` is the standard Job Applicant status kept in step with the stage,
// so ERPNext's own reports and the HRMS desk stay meaningful.
export const STAGES = [
  { id: "Applied", status: "Open", hint: "New application or sourced profile" },
  { id: "Screening", status: "Open", hint: "CV review / phone screen" },
  { id: "Shortlisted", status: "Replied", hint: "Ready for interviews" },
  { id: "Interview", status: "Replied", hint: "Interview rounds in progress" },
  { id: "Selected", status: "Replied", hint: "Cleared the interviews - offer to follow" },
  { id: "Offer", status: "Replied", hint: "Offer drafted, in approval or sent" },
  { id: "Hired", status: "Accepted", hint: "Joined - employee created" },
];
// Exit lanes. Hold is kept separate from Rejected (gap G10 / section 06).
export const EXITS = [
  { id: "Hold", label: "On Hold", status: "Hold", hint: "Keep for later - not rejected" },
  { id: "Rejected", status: "Rejected", hint: "Not selected" },
  { id: "Withdrawn", status: "Rejected", hint: "Candidate pulled out, declined or didn't join" },
];
export const ALL_STAGES = [...STAGES, ...EXITS];
export const STAGE_IDS = ALL_STAGES.map((s) => s.id);
/** What a stage is called on screen (the stored value stays the same). */
export const stageLabel = (id) => ALL_STAGES.find((s) => s.id === id)?.label || id;
const STATUS_TO_STAGE = { Open: "Applied", Replied: "Shortlisted", Accepted: "Offer", Rejected: "Rejected", Hold: "Hold" };

/** The applicant's stage, falling back to one derived from the standard status for records created elsewhere. */
export const stageOf = (a) => (STAGE_IDS.includes(a?.custom_ethx_stage) ? a.custom_ethx_stage : STATUS_TO_STAGE[a?.status] || "Applied");
export const statusForStage = (stage) => ALL_STAGES.find((s) => s.id === stage)?.status || "Open";
export const isClosedStage = (stage) => ["Hired", "Rejected", "Withdrawn"].includes(stage);

export const STAGE_TONE = {
  Applied: "#8b93a7",
  Screening: "#4f8cff",
  Shortlisted: "#7c5cff",
  Interview: "var(--color-amber)",
  Selected: "#2bb673",
  Offer: "#e0a400",
  Hired: "var(--color-green)",
  Hold: "#8b93a7",
  Rejected: "var(--color-red-hover)",
  Withdrawn: "var(--color-red-hover)",
};

export const RETENTION_MONTHS = 12;
export const REQ_STATUSES = ["Pending", "Open & Approved", "On Hold", "Rejected", "Filled", "Cancelled"];
export const OFFER_APPROVAL = ["Draft", "Pending Approval", "Approved", "Rejected"];
export const JOINING = ["Awaiting Joining", "Joined", "No-show", "Withdrawn"];
export const APPROVER_ROLES = ["HR Manager", "System Manager"];
/** HR Manager (or the Administrator) - the only people who may approve requisitions and offers. Mirrors the server rule. */
export const canApprove = (user) => user?.email === "Administrator" || (user?.erpRoles || []).some((r) => APPROVER_ROLES.includes(r));

/* -------------------------------- helpers -------------------------------- */

export function addMonths(iso, n) {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  const dt = new Date(y, m - 1 + n, d);
  return isoDate(dt);
}

/** HRMS Rating fields store 0..1 (fraction of 5 stars). */
export const toStars = (v) => (v == null || v === "" ? null : Math.round(Number(v) * 5 * 10) / 10);
export const fromStars = (n) => Math.max(0, Math.min(5, Number(n) || 0)) / 5;

/** "9:05:00" / "09:05:00.000" / "09:05" -> "09:05" (ERPNext drops the leading zero on Time values). */
export function fmtTime(t) {
  const m = /^(\d{1,2}):(\d{2})/.exec(String(t || "").trim());
  return m ? `${pad(Number(m[1]))}:${m[2]}` : "";
}
export const normPhone = (p) => String(p || "").replace(/\D/g, "").slice(-10);

/** Download a calendar invite (.ics) the interviewer can add to Outlook. */
export function downloadIcs({ uid, title, description, date, from, to, location }) {
  const stamp = (d, t) => `${d.replace(/-/g, "")}T${String(t || "00:00").slice(0, 5).replace(":", "")}00`;
  const esc = (s) => String(s || "").replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");
  const now = new Date();
  const dtstamp = `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}T${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}00Z`;
  const ics = [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//HRMS 360//Recruitment//EN", "BEGIN:VEVENT",
    `UID:${uid}@hrms-360`, `DTSTAMP:${dtstamp}`,
    `DTSTART;TZID=Asia/Kolkata:${stamp(date, from)}`, `DTEND;TZID=Asia/Kolkata:${stamp(date, to)}`,
    `SUMMARY:${esc(title)}`, `DESCRIPTION:${esc(description)}`, location ? `LOCATION:${esc(location)}` : null,
    "END:VEVENT", "END:VCALENDAR",
  ].filter(Boolean).join("\r\n");
  const url = URL.createObjectURL(new Blob([ics], { type: "text/calendar" }));
  const a = Object.assign(document.createElement("a"), { href: url, download: `${uid}.ics` });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** CSV download that neutralises spreadsheet formulas. */
export function downloadCsv(filename, header, rows) {
  const cell = (v) => {
    let s = v == null ? "" : String(v);
    if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const text = [header, ...rows].map((r) => r.map(cell).join(",")).join("\n");
  const url = URL.createObjectURL(new Blob([text], { type: "text/csv" }));
  const a = Object.assign(document.createElement("a"), { href: url, download: filename });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/* ------------------------------ requisitions ------------------------------ */

const REQ_FIELDS = ["name", "designation", "department", "no_of_positions", "expected_compensation", "company", "status", "requested_by", "requested_by_name", "posting_date", "expected_by", "completed_on", "reason_for_requesting", "custom_project", "custom_approved_by", "custom_approved_on", "custom_decision_note", "owner", "creation"];
const REQ_BASIC = ["name", "designation", "department", "no_of_positions", "expected_compensation", "company", "status", "requested_by", "requested_by_name", "posting_date", "expected_by", "owner", "creation"];

export function listRequisitions(filters = []) {
  return listTry("Job Requisition", { filters, fields: REQ_FIELDS, orderBy: "creation desc" }, REQ_BASIC);
}

/** Make a Job Opening from an approved requisition using HRMS's own mapper, then save it. */
export async function openingFromRequisition(req, extra = {}) {
  const mapped = await frappe.callMethod("hrms.hr.doctype.job_requisition.job_requisition.make_job_opening", { source_name: req.name });
  const doc = { ...mapped, ...extra };
  delete doc.name;
  delete doc.__islocal;
  delete doc.__unsaved;
  if (!doc.company) doc.company = req.company;
  if (!doc.job_title) doc.job_title = req.designation;
  return frappe.createDoc("Job Opening", doc);
}

/* -------------------------------- openings -------------------------------- */

const OPEN_FIELDS = ["name", "job_title", "designation", "department", "company", "status", "vacancies", "planned_vacancies", "posted_on", "closes_on", "closed_on", "publish", "route", "location", "employment_type", "currency", "lower_range", "upper_range", "salary_per", "publish_salary_range", "job_requisition", "custom_skills", "custom_experience", "custom_interview_rounds", "creation"];
const OPEN_BASIC = ["name", "job_title", "designation", "department", "company", "status", "vacancies", "planned_vacancies", "posted_on", "closes_on", "publish", "route", "job_requisition", "creation"];

export function listOpenings(filters = []) {
  return listTry("Job Opening", { filters, fields: OPEN_FIELDS, orderBy: "creation desc" }, OPEN_BASIC);
}
export const vacanciesOf = (o) => Number(o?.vacancies || o?.planned_vacancies || 0);

/** Interview rounds configured for an opening, in order. Stored as a JSON list of Interview Round names. */
export function roundsOf(opening) {
  try {
    const v = JSON.parse(opening?.custom_interview_rounds || "[]");
    return Array.isArray(v) ? v.filter(Boolean) : [];
  } catch {
    return String(opening?.custom_interview_rounds || "").split(/\n|,/).map((s) => s.trim()).filter(Boolean);
  }
}

/* ------------------------------- applicants ------------------------------- */

const APP_PIPELINE = ["name", "applicant_name", "email_id", "phone_number", "job_title", "designation", "status", "source", "source_name", "applicant_rating", "resume_attachment", "resume_link", "country", "currency", "lower_range", "upper_range", "creation", "modified",
  "custom_ethx_stage", "custom_stage_since", "custom_current_ctc", "custom_expected_ctc", "custom_notice_days", "custom_total_experience", "custom_skills", "custom_current_company", "custom_location", "custom_consent", "custom_consent_on", "custom_reject_reason", "custom_retain_until", "custom_anonymised"];
// Candidate repository fields (added later): read with the rest when the site has them.
export const PROFILE_FIELDS = ["custom_current_title", "custom_target_title", "custom_relevant_experience", "custom_preferred_locations", "custom_work_mode", "custom_cv_updated_on", "custom_cv_hash", "custom_needs_review"];
const APP_BASIC = ["name", "applicant_name", "email_id", "phone_number", "job_title", "designation", "status", "source", "applicant_rating", "resume_attachment", "resume_link", "creation", "modified"];

/** Applicants with as many fields as the site has: everything, else without the repository fields, else the basics. */
export async function listApplicants(filters = [], extra = []) {
  try {
    return await frappe.getList("Job Applicant", { filters, fields: [...APP_PIPELINE, ...PROFILE_FIELDS, ...extra], orderBy: "creation desc", limit: 0 });
  } catch (e) {
    if (e?.response?.data?.exc_type === "PermissionError") throw e;
  }
  return listTry("Job Applicant", { filters, fields: APP_PIPELINE, orderBy: "creation desc" }, APP_BASIC);
}

/** Other applications from the same person (same email or same phone), for duplicate checks and the profile. */
export async function findSamePerson({ email, phone, exclude }) {
  const jobs = [];
  if (email) jobs.push(listApplicants([["email_id", "=", email.trim()]]));
  const digits = normPhone(phone);
  // Phones are stored as typed ("+91 98765 43210", "98765-43210"), so compare digits only - on the last 4 digits
  // as a cheap server-side pre-filter, then exactly here.
  if (digits.length >= 8) jobs.push(listApplicants([["phone_number", "like", `%${digits.slice(-4)}`]]).then((rows) => rows.filter((r) => normPhone(r.phone_number) === digits)));
  const lists = await Promise.all(jobs);
  const seen = new Map();
  lists.flat().forEach((a) => { if (a.name !== exclude) seen.set(a.name, a); });
  return [...seen.values()];
}

/** Add an internal note to a record's timeline (ERPNext Comment). */
export function addComment(doctype, name, text) {
  return frappe.createDoc("Comment", { comment_type: "Comment", reference_doctype: doctype, reference_name: name, content: text });
}

/**
 * Move an applicant to another stage. Keeps the standard status in step, stamps when the stage started and,
 * for exits, starts the 12-month retention clock. The change itself is recorded by ERPNext's version history
 * (track changes is switched on during setup); the optional note goes to the timeline as a comment.
 */
export async function moveStage(applicant, stage, { note, reason } = {}) {
  const now = nowStamp();
  const patch = { custom_ethx_stage: stage, status: statusForStage(stage), custom_stage_since: now };
  if (["Rejected", "Withdrawn"].includes(stage)) {
    patch.custom_reject_reason = reason || note || "";
    patch.custom_retain_until = addMonths(isoDate(), RETENTION_MONTHS);
  } else if (!["Hold"].includes(stage)) {
    patch.custom_retain_until = null;
  }
  if (stage === "Hold") patch.custom_retain_until = addMonths(isoDate(), RETENTION_MONTHS);
  const saved = await frappe.updateDoc("Job Applicant", applicant.name, patch);
  const from = stageOf(applicant);
  const text = `Stage: ${from} → ${stage}${reason ? ` · Reason: ${reason}` : ""}${note && note !== reason ? ` · ${note}` : ""}`;
  try { await addComment("Job Applicant", applicant.name, text); } catch { /* the version history still has the change */ }
  return saved;
}

/** Timeline for a record: comments + field changes from version history, newest first. */
export async function timelineOf(doctype, name) {
  const [comments, versions] = await Promise.allSettled([
    frappe.getList("Comment", { filters: [["reference_doctype", "=", doctype], ["reference_name", "=", name], ["comment_type", "in", ["Comment", "Info", "Edit", "Created", "Submitted", "Cancelled", "Attachment"]]], fields: ["name", "comment_type", "content", "owner", "comment_email", "creation"], orderBy: "creation desc", limit: 200 }),
    frappe.getList("Version", { filters: [["ref_doctype", "=", doctype], ["docname", "=", name]], fields: ["name", "data", "owner", "creation"], orderBy: "creation desc", limit: 200 }),
  ]);
  const rows = [];
  if (comments.status === "fulfilled") {
    comments.value.forEach((c) => rows.push({ at: c.creation, by: c.comment_email || c.owner, kind: c.comment_type === "Comment" ? "note" : "event", text: stripHtml(c.content || c.comment_type) }));
  }
  if (versions.status === "fulfilled") {
    versions.value.forEach((v) => {
      try {
        const d = JSON.parse(v.data || "{}");
        const changed = (d.changed || []).filter(([f]) => !["modified", "custom_stage_since"].includes(f));
        if (changed.length) rows.push({ at: v.creation, by: v.owner, kind: "change", text: changed.map(([f, a, b]) => `${f.replace(/^custom_(ethx_)?/, "").replace(/_/g, " ")}: ${stripHtml(String(a ?? "—"))} → ${stripHtml(String(b ?? "—"))}`).join(" · ") });
      } catch { /* ignore malformed */ }
    });
  }
  return rows.sort((a, b) => String(b.at).localeCompare(String(a.at)));
}

/* ------------------------------- interviews ------------------------------- */

const INT_FIELDS = ["name", "job_applicant", "job_opening", "interview_round", "designation", "status", "scheduled_on", "from_time", "to_time", "average_rating", "expected_average_rating", "interview_summary", "resume_link", "docstatus", "custom_mode", "custom_meeting_link", "creation"];
const INT_BASIC = ["name", "job_applicant", "job_opening", "interview_round", "designation", "status", "scheduled_on", "from_time", "to_time", "average_rating", "interview_summary", "docstatus"];

export function listInterviews(filters = []) {
  return listTry("Interview", { filters: [["docstatus", "<", 2], ...filters], fields: INT_FIELDS, orderBy: "scheduled_on desc" }, INT_BASIC);
}

/** Interviewers on a set of interviews -> { interviewName: [user, ...] } */
export async function interviewersOf(names) {
  if (!names.length) return {};
  const rows = await frappe.getList("Interview Detail", { filters: [["parent", "in", names]], fields: ["parent", "interviewer"], limit: 0, parent: "Interview" });
  const map = {};
  rows.forEach((r) => { (map[r.parent] ||= []).push(r.interviewer); });
  return map;
}

/** Submitted feedback for interviews -> { interviewName: [feedback with skills] } */
export async function feedbackFor(interviewNames) {
  if (!interviewNames.length) return {};
  const fb = await frappe.getList("Interview Feedback", { filters: [["interview", "in", interviewNames], ["docstatus", "=", 1]], fields: ["name", "interview", "interviewer", "result", "average_rating", "feedback", "modified"], limit: 0 });
  let skills = [];
  if (fb.length) {
    try {
      skills = await frappe.getList("Skill Assessment", { filters: [["parent", "in", fb.map((f) => f.name)]], fields: ["parent", "skill", "rating", "idx"], limit: 0, parent: "Interview Feedback", orderBy: "idx asc" });
    } catch { /* ratings per skill not readable */ }
  }
  const map = {};
  fb.forEach((f) => { (map[f.interview] ||= []).push({ ...f, skills: skills.filter((s) => s.parent === f.name) }); });
  return map;
}

/** Interview rounds (master), with skills and default interviewers. */
export async function listRounds() {
  const rounds = await listTry("Interview Round", { fields: ["name", "round_name", "designation", "interview_type", "expected_average_rating"], orderBy: "round_name asc" }, ["name", "round_name", "designation"]);
  if (!rounds.length) return rounds;
  const names = rounds.map((r) => r.name);
  const [skills, people] = await Promise.allSettled([
    frappe.getList("Expected Skill Set", { filters: [["parent", "in", names]], fields: ["parent", "skill", "idx"], limit: 0, parent: "Interview Round", orderBy: "idx asc" }),
    frappe.getList("Interviewer", { filters: [["parent", "in", names]], fields: ["parent", "user"], limit: 0, parent: "Interview Round" }),
  ]);
  const sk = skills.status === "fulfilled" ? skills.value : [];
  const pp = people.status === "fulfilled" ? people.value : [];
  return rounds.map((r) => ({ ...r, skills: sk.filter((s) => s.parent === r.name).map((s) => s.skill), interviewers: pp.filter((p) => p.parent === r.name).map((p) => p.user) }));
}

export async function ensureSkills(skills) {
  const wanted = [...new Set(skills.map((s) => s.trim()).filter(Boolean))];
  if (!wanted.length) return [];
  const have = await frappe.getList("Skill", { filters: [["name", "in", wanted]], fields: ["name"], limit: 0 });
  const set = new Set(have.map((h) => h.name.toLowerCase()));
  for (const s of wanted) if (!set.has(s.toLowerCase())) await frappe.createDoc("Skill", { skill_name: s });
  return wanted;
}

export async function saveRound(round, data) {
  const skills = await ensureSkills(data.skills);
  const doc = {
    round_name: data.round_name.trim(),
    designation: data.designation || null,
    interview_type: data.interview_type || null,
    expected_average_rating: data.expected ? fromStars(data.expected) : null,
    expected_skill_set: skills.map((skill) => ({ skill })),
    interviewers: data.interviewers.map((user) => ({ user })),
  };
  return round ? frappe.updateDoc("Interview Round", round.name, doc) : frappe.createDoc("Interview Round", doc);
}

/** Users who can be picked as interviewers: enabled system users. */
export function listUsers() {
  return listTry("User", { filters: [["enabled", "=", 1], ["user_type", "=", "System User"], ["name", "not in", ["Administrator", "Guest"]]], fields: ["name", "full_name"], orderBy: "full_name asc" }, ["name", "full_name"]);
}

/**
 * Make sure an interviewer can open the interview and submit feedback: give them HRMS's standard
 * "Interviewer" role if missing, and share the candidate's record (read only) with them so they can see the CV
 * without being able to browse every applicant.
 */
export async function prepareInterviewers(users, applicantName) {
  const problems = [];
  for (const u of users) {
    try {
      // Server method (ERPNext Setup) adds only the Interviewer role; older sites fall back to editing the User.
      await frappe.callMethod("ethx_add_interviewer", { user: u }).catch(async (e) => {
        if (!(e?.response?.status === 404 || /not found|not whitelisted|has no attribute|Failed to get method|No module named/i.test(String(e?.response?.data?.exception || "")))) throw e;
        const doc = await frappe.getDoc("User", u);
        if (!(doc.roles || []).some((r) => r.role === "Interviewer")) {
          await frappe.updateDoc("User", u, { roles: [...doc.roles.map((r) => ({ role: r.role })), { role: "Interviewer" }] });
        }
      });
    } catch {
      problems.push(`${u}: couldn't check or add the Interviewer role (ask the Administrator)`);
    }
    if (applicantName) {
      try {
        await frappe.callMethod("frappe.share.add", { doctype: "Job Applicant", name: applicantName, user: u, read: 1, write: 0, share: 0, notify: 0 });
      } catch {
        problems.push(`${u}: couldn't share the candidate's profile`);
      }
    }
  }
  return problems;
}

/** Overlapping interviews for the same interviewers on the same day (draft or submitted). */
export async function interviewClashes({ date, from, to, interviewers, exclude }) {
  if (!date || !from || !to || !interviewers.length) return [];
  const sameDay = await listInterviews([["scheduled_on", "=", date]]);
  const others = sameDay.filter((i) => i.name !== exclude && fmtTime(i.from_time) < to && fmtTime(i.to_time) > from);
  if (!others.length) return [];
  const who = await interviewersOf(others.map((o) => o.name));
  return others.flatMap((o) => (who[o.name] || []).filter((u) => interviewers.includes(u)).map((u) => ({ user: u, interview: o })));
}

export async function scheduleInterview({ applicant, round, date, from, to, interviewers, mode, link, existing }) {
  const doc = {
    job_applicant: applicant.name,
    interview_round: round,
    scheduled_on: date,
    from_time: `${from}:00`,
    to_time: `${to}:00`,
    status: "Pending",
    resume_link: applicant.resume_attachment || applicant.resume_link || undefined,
    interview_details: interviewers.map((interviewer) => ({ interviewer })),
    custom_mode: mode || undefined,
    custom_meeting_link: link || undefined,
  };
  const saved = existing ? await frappe.updateDoc("Interview", existing.name, doc) : await frappe.createDoc("Interview", doc);
  if (!existing && !["Interview", "Offer", "Hired"].includes(stageOf(applicant))) {
    try { await moveStage(applicant, "Interview", { note: `${round} scheduled for ${date}` }); } catch { /* keep the interview */ }
  }
  return saved;
}

/** Record the panel's decision and submit the interview (HRMS only allows submitting Cleared / Rejected). */
export async function decideInterview(interview, result, summary) {
  await frappe.updateDoc("Interview", interview.name, { status: result, interview_summary: summary || undefined });
  const doc = await frappe.getDoc("Interview", interview.name);
  return frappe.submitDoc(doc);
}

/** Interviews where the signed-in user is on the panel. */
export async function myInterviews(user) {
  const denied = (e) => e?.response?.data?.exc_type === "PermissionError" || e?.response?.status === 403;
  let rows;
  try {
    rows = await frappe.getList("Interview Detail", { filters: [["interviewer", "=", user]], fields: ["parent"], limit: 0, parent: "Interview" });
  } catch {
    // Some sites don't allow reading the child table directly - filter on the parent instead.
    try {
      rows = (await frappe.getList("Interview", { filters: [["Interview Detail", "interviewer", "=", user]], fields: ["name"], limit: 0 })).map((l) => ({ parent: l.name }));
    } catch (e) {
      // No Interviewer role yet = not on any panel. HR adds the role when they put someone on a panel.
      if (denied(e)) return [];
      throw e;
    }
  }
  const names = [...new Set(rows.map((r) => r.parent))];
  if (!names.length) return [];
  const list = await listInterviews([["name", "in", names]]);
  const mine = await frappe.getList("Interview Feedback", { filters: [["interview", "in", names], ["interviewer", "=", user], ["docstatus", "<", 2]], fields: ["name", "interview", "docstatus", "result"], limit: 0 }).catch(() => []);
  const fb = Object.fromEntries(mine.map((m) => [m.interview, m]));
  return list.map((i) => ({ ...i, myFeedback: fb[i.name] || null }));
}

// HRMS's own interview methods aren't there when the interview doctypes were created by System Setup instead.
const hrmsMethodMissing = (e) => e?.response?.status === 404 || /not found|not whitelisted|has no attribute|Failed to get method|No module named/i.test(String(e?.response?.data?.exception || ""));

export async function submitFeedback({ interview, interviewer, skills, result, feedback }) {
  const ratings = skills.map((s) => ({ skill: s.skill, rating: fromStars(s.stars) }));
  try {
    return await frappe.callMethod("hrms.hr.doctype.interview.interview.create_interview_feedback", {
      data: JSON.stringify({ skill_set: ratings, result, feedback }),
      interview_name: interview.name,
      interviewer,
      job_applicant: interview.job_applicant,
    });
  } catch (e) {
    if (!hrmsMethodMissing(e)) throw e;
  }
  const average = ratings.length ? ratings.reduce((n, r) => n + Number(r.rating || 0), 0) / ratings.length : 0;
  const doc = await frappe.createDoc("Interview Feedback", { interview: interview.name, interview_round: interview.interview_round, job_applicant: interview.job_applicant, interviewer, result, feedback, average_rating: average, skill_assessment: ratings });
  return frappe.submitDoc(doc);
}

export async function expectedSkills(round) {
  try {
    const rows = await frappe.callMethod("hrms.hr.doctype.interview.interview.get_expected_skill_set", { interview_round: round });
    return (rows || []).map((r) => r.skill);
  } catch (e) {
    if (!hrmsMethodMissing(e)) throw e;
  }
  const rows = await frappe.getList("Expected Skill Set", { filters: [["parent", "=", round]], fields: ["skill", "idx"], limit: 0, parent: "Interview Round", orderBy: "idx asc" });
  return rows.map((r) => r.skill);
}

/* --------------------------------- offers --------------------------------- */

const OFFER_FIELDS = ["name", "job_applicant", "applicant_name", "applicant_email", "status", "offer_date", "designation", "company", "docstatus", "amended_from", "owner", "creation", "modified", "terms", "job_offer_term_template",
  "custom_ctc", "custom_joining_date", "custom_valid_till", "custom_approval_status", "custom_approved_by", "custom_approved_on", "custom_approval_note", "custom_rounds_override", "custom_joining_status", "custom_response_on", "custom_job_opening"];
const OFFER_BASIC = ["name", "job_applicant", "applicant_name", "status", "offer_date", "designation", "company", "docstatus", "amended_from", "owner", "creation"];

export function listOffers(filters = []) {
  return listTry("Job Offer", { filters, fields: OFFER_FIELDS, orderBy: "creation desc" }, OFFER_BASIC);
}

/** A single label for where an offer stands. */
export function offerStage(o) {
  if (o.docstatus === 2) return "Cancelled";
  if (o.docstatus === 0) return o.custom_approval_status || "Draft";
  if (o.status === "Accepted") return o.custom_joining_status && o.custom_joining_status !== "Awaiting Joining" ? o.custom_joining_status : "Accepted";
  if (o.status === "Rejected") return "Declined";
  if (o.custom_valid_till && o.custom_valid_till < isoDate()) return "Expired";
  return "Sent";
}

/** Rounds still not cleared for an applicant against their opening's configured rounds. */
export async function roundsStatus(applicant, opening) {
  const required = roundsOf(opening);
  const ints = await listInterviews([["job_applicant", "=", applicant.name]]);
  const cleared = new Set(ints.filter((i) => i.docstatus === 1 && i.status === "Cleared").map((i) => i.interview_round));
  const rejected = ints.filter((i) => i.docstatus === 1 && i.status === "Rejected").map((i) => i.interview_round);
  return { required, missing: required.filter((r) => !cleared.has(r)), rejected, interviews: ints };
}

export async function saveOffer(existing, data) {
  const doc = {
    job_applicant: data.applicant,
    offer_date: data.offer_date,
    designation: data.designation,
    company: data.company,
    status: "Awaiting Response",
    custom_ctc: data.ctc === "" ? null : Number(data.ctc),
    custom_joining_date: data.joining || null,
    custom_valid_till: data.valid_till || null,
    custom_job_opening: data.opening || null,
    custom_rounds_override: data.override || null,
    job_offer_term_template: data.template || null,
    terms: data.terms || null,
  };
  if (!existing) doc.custom_approval_status = "Draft";
  if (data.amended_from) doc.amended_from = data.amended_from;
  return existing ? frappe.updateDoc("Job Offer", existing.name, doc) : frappe.createDoc("Job Offer", doc);
}

export const setOfferApproval = (offer, status, note) => frappe.updateDoc("Job Offer", offer.name, { custom_approval_status: status, custom_approval_note: note || null });

export async function sendOffer(offer) {
  const doc = await frappe.getDoc("Job Offer", offer.name);
  return frappe.submitDoc(doc);
}

/** Revise a sent offer: cancel it and create an editable amended copy (HRMS allows one live offer per applicant). */
export async function reviseOffer(offer) {
  const doc = await frappe.getDoc("Job Offer", offer.name);
  if (doc.docstatus === 1) await frappe.cancelDoc("Job Offer", offer.name);
  const copy = { ...doc };
  ["name", "docstatus", "creation", "modified", "modified_by", "owner", "idx", "custom_approved_by", "custom_approved_on", "custom_approval_note", "custom_joining_status", "custom_response_on"].forEach((k) => delete copy[k]);
  copy.offer_terms = (doc.offer_terms || []).map(({ offer_term, value }) => ({ offer_term, value }));
  copy.amended_from = offer.name;
  copy.custom_approval_status = "Draft";
  copy.status = "Awaiting Response";
  return frappe.createDoc("Job Offer", copy);
}

export const recordResponse = (offer, status, date) => frappe.updateDoc("Job Offer", offer.name, { status, custom_response_on: date || isoDate(), ...(status === "Accepted" ? { custom_joining_status: "Awaiting Joining" } : {}) });
export const recordJoining = (offer, joining) => frappe.updateDoc("Job Offer", offer.name, { custom_joining_status: joining });

/**
 * Email a candidate (offer letter as a PDF of the Job Offer print format, or a plain message). Goes out from the
 * candidate mail account (Gmail) set up in Admin › Communication, else ERPNext's default outgoing account.
 */
export async function emailDocument({ doctype, name, to, subject, message, printFormat, files = [] }) {
  const sender = await candidateSender();
  return frappe.callMethod("frappe.core.doctype.communication.email.make", {
    doctype,
    name,
    recipients: to,
    subject,
    content: message,
    send_email: 1,
    ...(sender ? { sender } : {}),
    print_format: printFormat || "Standard",
    // Uploaded files (e.g. the offer letter HR attached) go by their File record names.
    attachments: [...(printFormat === false ? [] : [{ print_format_attachment: 1, doctype, name, print_format: printFormat || "Standard", print_letterhead: 1 }]), ...files],
  });
}

export function regretEmail(applicant, opening) {
  const first = String(applicant.applicant_name || "").split(" ")[0] || "there";
  const role = opening?.job_title || applicant.designation || "the role";
  return {
    subject: `Your application for ${role}`,
    message: `<p>Dear ${first},</p><p>Thank you for your interest in ${role} and for the time you gave us during the selection process.</p><p>After careful consideration we have decided not to move forward with your application at this time. We will keep your details on file for ${RETENTION_MONTHS} months, after which they are anonymised, and may contact you if a suitable opening comes up.</p><p>We wish you every success.</p><p>Regards,<br/>HR Team</p>`,
  };
}

/** Accepted offers per opening, used to close the opening once its vacancies are filled. */
export async function acceptedForOpening(opening) {
  const apps = await listApplicants([["job_title", "=", opening.name]]);
  if (!apps.length) return 0;
  const offers = await listOffers([["job_applicant", "in", apps.map((a) => a.name)], ["docstatus", "=", 1], ["status", "=", "Accepted"]]);
  return offers.filter((o) => !["No-show", "Withdrawn"].includes(o.custom_joining_status)).length;
}

/* ------------------------------ offer letters ------------------------------ */

/** Files attached to a record (offer letters on a Job Offer, templates in the template folder). */
export const attachedFiles = (doctype, name) => frappe.getList("File", { filters: [["attached_to_doctype", "=", doctype], ["attached_to_name", "=", name], ["is_folder", "=", 0]], fields: ["name", "file_name", "file_url", "creation"], orderBy: "creation asc", limit: 0 });
export const offerTemplates = () => frappe.getList("File", { filters: [["folder", "=", OFFER_TEMPLATE_FOLDER], ["is_folder", "=", 0]], fields: ["name", "file_name", "file_url", "creation", "owner"], orderBy: "creation desc", limit: 0 });
export async function uploadOfferTemplate(file) {
  await ensureOfferTemplateFolder();
  return frappe.uploadFile(file, { isPrivate: true, folder: OFFER_TEMPLATE_FOLDER });
}

/* ---------------------------- onboarding / hire ---------------------------- */

export async function employeeForApplicant(applicantName) {
  const rows = await frappe.getList("Employee", { filters: [["job_applicant", "=", applicantName]], fields: ["name", "employee_name", "status", "user_id"], limit: 1 });
  return rows[0] || null;
}

export async function onboardingForApplicant(applicantName) {
  const rows = await listTry("Employee Onboarding", { filters: [["job_applicant", "=", applicantName], ["docstatus", "<", 2]], fields: ["name", "boarding_status", "docstatus", "employee", "date_of_joining", "project", "holiday_list", "employee_onboarding_template"], limit: 1 }, ["name", "boarding_status", "docstatus", "employee"]);
  return rows[0] || null;
}

/** The template's activities, copied onto the onboarding (the HRMS desk does this in the browser, not on save). */
async function templateActivities(template) {
  if (!template) return undefined;
  const t = await frappe.getDoc("Employee Onboarding Template", template);
  return (t.activities || []).map(({ activity_name, user, role, required_for_employee_creation, description, duration, begin_on, task_weight }) => ({ activity_name, user, role, required_for_employee_creation, description, duration, begin_on, task_weight }));
}

export async function startOnboarding({ offer, applicant, joining, template, department, holidayList, draft }) {
  const activities = await templateActivities(template);
  // A draft left behind by an earlier failed attempt (e.g. missing holiday list) is completed instead of duplicated.
  if (draft) {
    await frappe.updateDoc("Employee Onboarding", draft.name, { date_of_joining: joining, boarding_begins_on: joining, holiday_list: holidayList || undefined, department: department || undefined, employee_onboarding_template: template || undefined, ...(activities ? { activities } : {}) });
    return frappe.submitDoc(await frappe.getDoc("Employee Onboarding", draft.name));
  }
  const doc = await frappe.createDoc("Employee Onboarding", {
    job_applicant: applicant.name,
    job_offer: offer.name,
    employee_name: applicant.applicant_name,
    date_of_joining: joining,
    // HRMS starts the onboarding project on the joining date and rejects tasks that start earlier.
    boarding_begins_on: joining,
    company: offer.company,
    designation: offer.designation,
    department: department || undefined,
    holiday_list: holidayList || undefined,
    employee_onboarding_template: template || undefined,
    activities,
  });
  return frappe.submitDoc(await frappe.getDoc("Employee Onboarding", doc.name));
}

/**
 * Create the Employee for a hired candidate. Refuses if one already exists for this applicant (the setup also
 * installs a server-side check). Uses HRMS's own mapping from the onboarding record or the job offer.
 */
export async function createEmployee({ offer, applicant, onboarding, joining, gender, dob, department, extra = {} }) {
  const existing = await employeeForApplicant(applicant.name);
  if (existing) throw Object.assign(new Error("exists"), { friendly: `An employee (${existing.employee_name}, ${existing.name}) already exists for this candidate.` });
  const mapped = onboarding
    ? await frappe.callMethod("hrms.hr.doctype.employee_onboarding.employee_onboarding.make_employee", { source_name: onboarding.name })
    : await frappe.callMethod("hrms.hr.doctype.job_offer.job_offer.make_employee", { source_name: offer.name });
  const [first, ...rest] = String(applicant.applicant_name || "").trim().split(/\s+/);
  const doc = {
    ...mapped,
    first_name: mapped.first_name && mapped.first_name !== applicant.applicant_name ? mapped.first_name : first,
    last_name: mapped.last_name || rest.join(" ") || undefined,
    employee_name: undefined,
    job_applicant: applicant.name,
    company: offer.company,
    designation: offer.designation,
    department: department || mapped.department || undefined,
    date_of_joining: joining,
    gender,
    date_of_birth: dob,
    status: "Active",
    personal_email: applicant.email_id,
    cell_number: applicant.phone_number || undefined,
    ...extra,
  };
  ["name", "__islocal", "__unsaved", "docstatus", "doctype"].forEach((k) => delete doc[k]);
  const emp = await frappe.createDoc("Employee", doc);
  if (onboarding) { try { await frappe.updateDoc("Employee Onboarding", onboarding.name, { employee: emp.name }); } catch { /* read-only on some sites */ } }
  return emp;
}

/* -------------------------------- retention -------------------------------- */

/** Candidates whose retention period has run out and who haven't been anonymised yet. */
export async function dueForAnonymisation() {
  const today = isoDate();
  const cutoff = addMonths(today, -RETENTION_MONTHS);
  const apps = await listApplicants([["custom_anonymised", "!=", 1], ["status", "in", ["Rejected", "Hold"]]]);
  return apps.filter((a) => (a.custom_retain_until ? a.custom_retain_until < today : String(a.modified).slice(0, 10) < cutoff));
}

/**
 * Remove a candidate's personal data but keep the anonymous record for reporting (stage, source, opening, dates).
 * The record is renamed because HRMS uses the email address as its ID.
 */
export async function anonymise(applicant) {
  // Preferred: the server-side method installed by Recruitment › Setup (also cleans submitted offers, interviews and emails).
  try {
    return await frappe.callMethod("ethx_anonymise_applicant", { applicant: applicant.name });
  } catch (e) {
    const notInstalled = e?.response?.status === 404 || /not found|not whitelisted|has no attribute|Failed to get method|No module named/i.test(String(e?.response?.data?.exception || ""));
    if (!notInstalled) throw e;
  }
  // Fallback when the server method isn't installed: clear what the REST API can edit.
  const token = Math.random().toString(36).slice(2, 10);
  const email = `anonymised-${token}@redacted.invalid`;
  const files = await frappe.getList("File", { filters: [["attached_to_doctype", "=", "Job Applicant"], ["attached_to_name", "=", applicant.name]], fields: ["name"], limit: 0 }).catch(() => []);
  for (const f of files) { try { await frappe.deleteDoc("File", f.name); } catch { /* keep going */ } }
  await frappe.updateDoc("Job Applicant", applicant.name, {
    applicant_name: "Anonymised candidate", email_id: email, phone_number: null, cover_letter: null, resume_attachment: null, resume_link: null,
    custom_current_ctc: null, custom_expected_ctc: null, custom_current_company: null, custom_location: null, custom_skills: null, custom_reject_reason: null,
    custom_anonymised: 1, lower_range: null, upper_range: null,
  });
  const ints = await listInterviews([["job_applicant", "=", applicant.name]]).catch(() => []);
  for (const i of ints) { if (i.resume_link) { try { await frappe.updateDoc("Interview", i.name, { resume_link: null }); } catch { /* submitted - field not editable */ } } }
  try {
    await frappe.client.post("/method/frappe.client.rename_doc", { doctype: "Job Applicant", old_name: applicant.name, new_name: email });
  } catch { /* data is already removed; the ID keeps the old email */ }
  return email;
}

export const isoPlus = (days) => addDays(isoDate(), days);
