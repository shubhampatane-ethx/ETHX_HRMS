// Candidate repository logic: CV parsing into suggested profile fields (REP-02), keyword / filter search (SRCH-01..05)
// and JD-to-CV matching with evidence (MATCH-01..04). Pure functions over text, so they work on whatever the site
// stores; the screens load the data and save the results.

/* ------------------------------- dictionaries ------------------------------- */

// Skills recognised in CVs and JDs. Free-text search isn't limited to these; they only seed suggestions and JD criteria.
export const SKILLS = [
  "Oracle Fusion", "Oracle EBS", "Oracle Integration Cloud", "OIC", "BI Publisher", "OTBI", "FBDI", "HDL", "Oracle HCM", "Oracle SCM", "Oracle Financials", "PL/SQL", "SQL", "Oracle Database", "Oracle Apex",
  "General Ledger", "Accounts Payable", "Accounts Receivable", "Fixed Assets", "Cash Management", "GL", "AP", "AR", "Procure to Pay", "Order to Cash", "Record to Report",
  "SAP", "SAP FICO", "SAP MM", "SAP SD", "SAP ABAP", "SAP HANA", "S/4HANA", "Workday", "Salesforce", "ServiceNow", "Dynamics 365", "NetSuite", "Tally",
  "Java", "Spring Boot", "Python", "Django", "Flask", "JavaScript", "TypeScript", "React", "Angular", "Vue", "Node.js", "Express", "Next.js", "HTML", "CSS", "Tailwind",
  "C", "C++", "C#", ".NET", "ASP.NET", "Go", "Rust", "PHP", "Laravel", "Ruby", "Kotlin", "Swift", "Flutter", "React Native", "Android", "iOS",
  "MySQL", "PostgreSQL", "MongoDB", "Redis", "SQL Server", "Snowflake", "Databricks", "Spark", "Hadoop", "Kafka", "Airflow", "ETL", "Power BI", "Tableau", "Excel",
  "AWS", "Azure", "GCP", "Docker", "Kubernetes", "Terraform", "Jenkins", "Git", "CI/CD", "Linux", "DevOps", "Microservices", "REST API", "GraphQL",
  "Machine Learning", "Deep Learning", "NLP", "Data Science", "Pandas", "TensorFlow", "PyTorch", "Generative AI", "LLM",
  "Selenium", "Manual Testing", "Automation Testing", "JIRA", "Agile", "Scrum", "Project Management", "Business Analysis", "Stakeholder Management",
  "Recruitment", "Payroll", "HRMS", "ERPNext", "Frappe", "Accounting", "Taxation", "GST", "Audit",
];

// Search / match equivalents (SRCH-04): each group is one concept. Editable here until settings move to the server.
export const ALIASES = [
  ["OIC", "Oracle Integration Cloud"],
  ["GL", "General Ledger"],
  ["AP", "Accounts Payable"],
  ["AR", "Accounts Receivable"],
  ["BIP", "BI Publisher"],
  ["P2P", "Procure to Pay"],
  ["O2C", "Order to Cash"],
  ["R2R", "Record to Report"],
  ["JS", "JavaScript"],
  ["TS", "TypeScript"],
  ["K8s", "Kubernetes"],
  ["ML", "Machine Learning"],
  ["GenAI", "Generative AI"],
  ["Postgres", "PostgreSQL"],
  ["ReactJS", "React", "React.js"],
  ["NodeJS", "Node.js", "Node"],
  ["Oracle Fusion", "Oracle Cloud ERP", "Fusion ERP"],
];

export const CITIES = [
  "Pune", "Mumbai", "Navi Mumbai", "Thane", "Bengaluru", "Bangalore", "Hyderabad", "Chennai", "Delhi", "New Delhi", "Gurugram", "Gurgaon", "Noida", "Kolkata", "Ahmedabad",
  "Jaipur", "Indore", "Nagpur", "Nashik", "Aurangabad", "Kochi", "Coimbatore", "Chandigarh", "Lucknow", "Bhopal", "Vadodara", "Surat", "Visakhapatnam", "Bhubaneswar", "Mysuru", "Goa",
  "Dubai", "Abu Dhabi", "Riyadh", "Doha", "Singapore", "London", "New York", "Toronto", "Sydney",
];
// The same city under two names (SRCH-03).
const CITY_ALIASES = [["Bengaluru", "Bangalore"], ["Gurugram", "Gurgaon"], ["Delhi", "New Delhi"], ["Mumbai", "Bombay"], ["Mysuru", "Mysore"]];

const DOMAINS = ["Finance", "Banking", "Insurance", "Healthcare", "Pharma", "Retail", "E-commerce", "Manufacturing", "Telecom", "Logistics", "Education", "Government", "Energy", "Real Estate", "Media", "Automotive", "Hospitality", "IT Services", "SaaS", "HR"];

/* --------------------------------- matching --------------------------------- */

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
// Case-insensitive, whole-term match that keeps symbols meaningful: "C++" doesn't match "C", ".NET" needs the dot.
const termRe = (t) => new RegExp(`(?<![A-Za-z0-9+#])${esc(t.trim())}(?![A-Za-z0-9+#])`, "i");

/** Every spelling of a term: itself plus its configured aliases. */
export function variants(term) {
  const t = term.trim();
  const group = ALIASES.find((g) => g.some((x) => x.toLowerCase() === t.toLowerCase()));
  return group ? [...new Set([t, ...group])] : [t];
}
const cityVariants = (c) => CITY_ALIASES.find((g) => g.some((x) => x.toLowerCase() === c.toLowerCase())) || [c];

/** First place a term (or an alias) occurs in the text, with a short excerpt around it. */
export function findTerm(text, term) {
  if (!text) return null;
  for (const v of variants(term)) {
    const m = termRe(v).exec(text);
    if (m) {
      const from = Math.max(0, m.index - 60);
      const to = Math.min(text.length, m.index + m[0].length + 60);
      return { term, as: m[0], excerpt: `${from ? "…" : ""}${text.slice(from, to).replace(/\s+/g, " ")}${to < text.length ? "…" : ""}`, at: m.index, len: m[0].length };
    }
  }
  return null;
}

/** Split typed keywords: commas separate terms; without commas, quoted phrases stay whole and other words split. */
export function parseKeywords(input) {
  const s = String(input || "").trim();
  if (!s) return [];
  if (s.includes(",")) return s.split(",").map((t) => t.trim().replace(/^"|"$/g, "").trim()).filter(Boolean);
  const out = [];
  const re = /"([^"]+)"|(\S+)/g;
  let m;
  while ((m = re.exec(s))) out.push((m[1] || m[2]).trim());
  return out.filter(Boolean);
}

export const splitList = (s) => String(s || "").split(/[,;\n|]/).map((x) => x.trim()).filter(Boolean);

/* --------------------------------- CV parsing --------------------------------- */

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;
const TITLE_WORDS = /\b(consultant|engineer|developer|manager|analyst|lead|architect|specialist|administrator|designer|tester|qa|executive|associate|officer|head|director|scientist|accountant|recruiter|programmer|intern)\b/i;
const NOT_NAME = /resume|curriculum|vitae|\bcv\b|profile|summary|objective|contact|email|phone|mobile|address|@|\d/i;

const titleCase = (s) => s.toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase());

function years(text) {
  // "Total Experience: 7.5 years", "8+ years of experience", "5 years 6 months"
  const found = [];
  for (const m of text.matchAll(/(\d{1,2}(?:\.\d{1,2})?)\s*\+?\s*(?:years?|yrs?)(?:\s*(?:and\s*)?(\d{1,2})\s*(?:months?|mos?))?/gi)) {
    const around = text.slice(Math.max(0, m.index - 60), m.index + m[0].length + 40).toLowerCase();
    if (!/experience|exp\b|career|professional|industry|working/.test(around)) continue;
    const y = Number(m[1]) + (m[2] ? Number(m[2]) / 12 : 0);
    if (y > 0 && y < 50) found.push(y);
  }
  return found.length ? Math.round(Math.max(...found) * 10) / 10 : null;
}

/**
 * Suggested profile fields from CV text (REP-02). Each comes with a confidence: "high" when it was found with a clear
 * pattern, "low" when guessed (shown highlighted for the recruiter to check).
 */
export function parseCv(text, fileName = "") {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  const head = lines.slice(0, 40);
  const out = { name: "", email: "", phone: "", experience: null, title: "", company: "", location: "", notice: null, skills: [], confidence: {} };

  out.email = (EMAIL.exec(text)?.[0] || "").toLowerCase();
  out.confidence.email = out.email ? "high" : "low";

  const phone = [...text.matchAll(/(\+?\d[\d\s().-]{8,16}\d)/g)].map((m) => m[1]).find((p) => { const d = p.replace(/\D/g, ""); return d.length >= 10 && d.length <= 13; });
  out.phone = phone ? phone.replace(/\s+/g, " ").trim() : "";
  out.confidence.phone = out.phone ? "high" : "low";

  const labelled = /^(?:name|candidate name)\s*[:-]\s*(.+)$/im.exec(text)?.[1];
  const firstLine = head.find((l) => !NOT_NAME.test(l) && /^[A-Za-z][A-Za-z .'-]{2,40}$/.test(l) && l.split(/\s+/).length >= 2 && l.split(/\s+/).length <= 4 && !TITLE_WORDS.test(l));
  if (labelled) { out.name = titleCase(labelled.replace(/\s+[A-Za-z]+\s*:.*$/, "").trim()); out.confidence.name = "high"; } else if (firstLine) { out.name = /^[A-Z\s.'-]+$/.test(firstLine) ? titleCase(firstLine) : firstLine; out.confidence.name = "high"; } else {
    const local = out.email.split("@")[0]?.replace(/[._\d]+/g, " ").trim();
    const fromFile = fileName.replace(/\.[^.]+$/, "").replace(/[_\-.]+/g, " ").replace(/\b(resume|cv|updated|final|new|latest)\b/gi, "").trim();
    out.name = titleCase(local && local.includes(" ") ? local : fromFile || local || "");
    out.confidence.name = "low";
  }

  out.experience = years(text);
  out.confidence.experience = out.experience == null ? "low" : "high";

  const labTitle = /^(?:current\s*)?(?:designation|title|role|position)\s*[:-]\s*(.+)$/im.exec(text)?.[1];
  const guessTitle = head.slice(0, 12).find((l) => TITLE_WORDS.test(l) && l.length <= 70 && !EMAIL.test(l));
  out.title = (labTitle || guessTitle || "").replace(/\s*[|,].*$/, "").trim();
  out.confidence.title = labTitle ? "high" : "low";

  out.company = (/(?:currently\s+(?:working|employed)\s+(?:with|at|in)|current\s+(?:company|employer|organi[sz]ation)\s*[:-])\s*([A-Z][\w&.,' -]{2,60})/i.exec(text)?.[1] || "").replace(/\s+(as|since|from)\b.*$/i, "").trim();
  out.confidence.company = out.company ? "high" : "low";

  const labLoc = /^(?:current\s*)?(?:location|city|address)\s*[:-]\s*(.+)$/im.exec(text)?.[1] || "";
  const city = CITIES.find((c) => termRe(c).test(labLoc)) || CITIES.find((c) => head.some((l) => termRe(c).test(l)));
  out.location = city || "";
  out.confidence.location = labLoc && city ? "high" : "low";

  const notice = /notice\s*period[^\d\n]{0,25}(\d{1,3})\s*(days?|months?|weeks?)/i.exec(text) || (/notice\s*period[^\n]{0,25}immediate/i.test(text) ? [null, "0", "days"] : null);
  out.notice = notice ? Number(notice[1]) * (/month/i.test(notice[2]) ? 30 : /week/i.test(notice[2]) ? 7 : 1) : null;

  out.skills = SKILLS.filter((s) => termRe(s).test(text)).filter((s, i, all) => !ALIASES.some((g) => g.includes(s) && g.some((o) => o !== s && all.indexOf(o) >= 0 && all.indexOf(o) < i)));
  out.confidence.skills = out.skills.length ? "high" : "low";
  return out;
}

/* ---------------------------------- search ---------------------------------- */

const yearsLabel = (y) => (y == null || y === "" ? "—" : `${Math.floor(Number(y))}y${Math.round((Number(y) % 1) * 12) ? ` ${Math.round((Number(y) % 1) * 12)}m` : ""}`);
export { yearsLabel };

/**
 * Apply search filters to candidates (each with .cv_text). Filters combine with AND; locations OR within the list;
 * keywords "all" / "any". Returns [{ a, hits: [{ term, excerpt }], titleRank }].
 */
export function searchCandidates(list, f) {
  const kws = parseKeywords(f.keywords);
  const titleTerms = String(f.title || "").trim();
  const cities = (f.cities || []).flatMap(cityVariants);
  const inRange = (v, lo, hi) => {
    if (lo === "" && hi === "") return true;
    if (v == null || v === "" || Number.isNaN(Number(v))) return Boolean(f.includeUnknown);
    return (lo === "" || Number(v) >= Number(lo)) && (hi === "" || Number(v) <= Number(hi));
  };
  const out = [];
  for (const a of list) {
    const blob = [a.applicant_name, a.custom_current_title, a.custom_target_title, a.designation, a.custom_skills, a.custom_current_company, a.custom_location, a.custom_preferred_locations, a.cv_text].filter(Boolean).join("\n");
    let titleRank = 0;
    if (titleTerms) {
      const titles = [a.custom_current_title, a.custom_target_title, a.designation].filter(Boolean).join(" | ");
      if (titles.toLowerCase().includes(titleTerms.toLowerCase())) titleRank = 3;
      else if (findTerm(titles, titleTerms)) titleRank = 2;
      else if (a.cv_text && findTerm(a.cv_text, titleTerms)) titleRank = 1;
      else {
        // Broad: every word of the title somewhere in titles / CV.
        const words = titleTerms.split(/\s+/).filter((w) => w.length > 1);
        if (words.length && words.every((w) => findTerm(blob, w))) titleRank = 0.5; else continue;
      }
    }
    if (!inRange(a.custom_total_experience, f.totalMin ?? "", f.totalMax ?? "")) continue;
    if (!inRange(a.custom_relevant_experience, f.relMin ?? "", f.relMax ?? "")) continue;
    if (cities.length) {
      const where = f.cityScope === "preferred" ? a.custom_preferred_locations : f.cityScope === "current" ? a.custom_location : [a.custom_location, a.custom_preferred_locations].join(", ");
      const remoteOk = f.allowRemote && /remote|any/i.test(a.custom_work_mode || "");
      if (!remoteOk && !cities.some((c) => termRe(c).test(where || ""))) continue;
    }
    if (f.workMode && (a.custom_work_mode || "") !== f.workMode && a.custom_work_mode !== "Any") continue;
    if (f.noticeMax !== "" && f.noticeMax != null && !(a.custom_notice_days != null && Number(a.custom_notice_days) <= Number(f.noticeMax))) continue;
    if (f.source && a.source !== f.source) continue;
    if (f.stage && f.stage !== "all" && a._stage !== f.stage) continue;
    if (f.updatedSince && String(a.custom_cv_updated_on || a.modified || "").slice(0, 10) < f.updatedSince) continue;
    const hits = [];
    let ok = true;
    for (const k of kws) {
      const h = findTerm(blob, k);
      if (h) hits.push(h);
      else if (f.mode !== "any") { ok = false; break; }
    }
    if (!ok || (kws.length && f.mode === "any" && !hits.length)) continue;
    out.push({ a, hits, titleRank });
  }
  return out;
}

/* ------------------------------------ JD ------------------------------------ */

const SECTION_MAND = /(mandatory|must[\s-]*have|required|requirements|key\s*skills|essential|primary\s*skills|technical\s*skills|qualifications)/i;
const SECTION_PREF = /(preferred|good[\s-]*to[\s-]*have|nice[\s-]*to[\s-]*have|desirable|desired|added\s*advantage|bonus|plus|secondary\s*skills)/i;

/** Suggested JD criteria from its text (MATCH-01); the recruiter reviews and edits them before scoring. */
export function parseJd(text) {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  const title = (/^(?:job\s*title|position|role|designation)\s*[:-]\s*(.+)$/im.exec(text)?.[1] || lines[0] || "").slice(0, 120).trim();
  // Which section each line belongs to: the last heading seen.
  let section = "none";
  const mand = new Set();
  const pref = new Set();
  const all = new Set();
  for (const l of lines) {
    if (l.length < 60 && SECTION_PREF.test(l)) section = "pref";
    else if (l.length < 60 && SECTION_MAND.test(l)) section = "mand";
    for (const s of SKILLS) {
      if (!termRe(s).test(l)) continue;
      all.add(s);
      const inlinePref = SECTION_PREF.test(l) && l.length >= 60;
      if (section === "pref" || inlinePref) pref.add(s); else if (section === "mand") mand.add(s);
    }
  }
  // No headings: everything found is treated as mandatory for the recruiter to sort out.
  if (!mand.size && !pref.size) all.forEach((s) => mand.add(s));
  pref.forEach((s) => mand.delete(s));
  const exp = /(\d{1,2})\s*(?:\+|plus)?\s*(?:(?:-|to|–)\s*(\d{1,2}))?\s*(?:years?|yrs?)/i.exec(text.split("\n").find((l) => /experience|exp\b/i.test(l) && /\d/.test(l)) || "");
  const locations = CITIES.filter((c) => termRe(c).test(text)).filter((c, i, arr) => !CITY_ALIASES.some((g) => g.includes(c) && g.some((o) => o !== c && arr.indexOf(o) >= 0 && arr.indexOf(o) < i)));
  const workMode = /\bremote\b/i.test(text) ? "Remote" : /\bhybrid\b/i.test(text) ? "Hybrid" : /\b(onsite|on-site|work from office)\b/i.test(text) ? "Onsite" : "";
  const domain = DOMAINS.filter((d) => termRe(d).test(text));
  return { title, mandatory: [...mand], preferred: [...pref], minYears: exp ? Number(exp[1]) : "", maxYears: exp?.[2] ? Number(exp[2]) : "", locations, workMode, domain };
}

export const WEIGHTS = { mandatory: 50, experience: 20, preferred: 15, domain: 10, location: 5 };

/**
 * Score a candidate against confirmed JD criteria (MATCH-02/03). Evidence comes from the profile fields and CV text;
 * anything not found counts as zero and is listed. Returns { score | null, review, categories, matched, missing,
 * unknown, mandatoryMet }.
 */
export function matchCandidate(a, jd) {
  const evidenceText = [a.custom_skills, a.custom_current_title, a.custom_target_title, a.designation, a.custom_current_company, a.cv_text].filter(Boolean).join("\n");
  const hasEvidence = Boolean(a.cv_text && a.cv_text.length > 200) || Boolean(a.custom_skills);
  const categories = [];
  const matched = [];
  const missing = [];
  const unknown = [];
  const items = (list, kind) => {
    const found = [];
    for (const term of new Set(list.map((t) => t.trim()).filter(Boolean))) {
      const h = findTerm(evidenceText, term);
      if (h) { found.push(term); matched.push({ ...h, kind }); } else if (kind === "Mandatory") missing.push(term); else unknown.push(`${kind}: ${term}`);
    }
    return found.length;
  };
  if (jd.mandatory?.length) categories.push({ key: "mandatory", label: "Mandatory Skills", weight: WEIGHTS.mandatory, fraction: items(jd.mandatory, "Mandatory") / new Set(jd.mandatory).size });
  if (jd.minYears !== "" && jd.minYears != null && Number(jd.minYears) > 0) {
    const rel = a.custom_relevant_experience;
    const known = rel != null && rel !== "";
    if (!known) unknown.push(`Relevant experience not recorded${a.custom_total_experience ? ` (total ${yearsLabel(a.custom_total_experience)})` : ""}`);
    categories.push({ key: "experience", label: "Relevant Experience", weight: WEIGHTS.experience, fraction: known ? Math.min(1, Number(rel) / Number(jd.minYears)) : 0, note: known ? `${yearsLabel(rel)} of ${jd.minYears}y` : "unknown" });
  }
  if (jd.preferred?.length) categories.push({ key: "preferred", label: "Preferred Skills", weight: WEIGHTS.preferred, fraction: items(jd.preferred, "Preferred") / new Set(jd.preferred).size });
  if (jd.domain?.length) categories.push({ key: "domain", label: "Role / Domain", weight: WEIGHTS.domain, fraction: items(jd.domain, "Domain") / new Set(jd.domain).size });
  if (jd.locations?.length || jd.workMode) {
    const where = [a.custom_location, a.custom_preferred_locations].filter(Boolean).join(", ");
    const cityOk = !jd.locations?.length || jd.locations.flatMap(cityVariants).some((c) => termRe(c).test(where));
    const remote = jd.workMode === "Remote" && /remote|any/i.test(a.custom_work_mode || "");
    const modeOk = !jd.workMode || !a.custom_work_mode || a.custom_work_mode === "Any" || a.custom_work_mode === jd.workMode;
    if (!where && !a.custom_work_mode) unknown.push("Location / work mode not recorded");
    categories.push({ key: "location", label: "Location / Work Mode", weight: WEIGHTS.location, fraction: remote || (cityOk && modeOk && (where || !jd.locations?.length)) ? 1 : 0 });
  }
  const total = categories.reduce((n, c) => n + c.weight, 0);
  if (!total || !hasEvidence) return { score: null, review: !total ? "The JD has no criteria to score against." : "No readable CV or skills to score - review the profile.", categories, matched, missing, unknown, mandatoryMet: false };
  const score = Math.round((100 * categories.reduce((n, c) => n + c.weight * c.fraction, 0)) / total);
  return { score, review: "", categories, matched, missing, unknown, mandatoryMet: !missing.length };
}
