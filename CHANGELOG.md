# Changelog — ETHX HRMS

All changes made on top of commit `fc4831f` ("New changes with themes").
Branch: `feat/recruitment` · 3 commits · 54 files changed.

---

## 22 Oct 2026 — Expense claims, approver rules, PM leave approvals, theme fixes

### Fixed
- **Expense claim "Value missing for Expense Claim: Exchange Rate"** (employee portal and HR › Expense Claim): ERPNext v16 makes `currency` and `exchange_rate` mandatory. Claims now send the company currency and rate; the new server rule also fills them (and fetches the real rate for foreign-currency claims).
- **"Field not permitted in query" on Expense Claims**: the list asked for `expense_approver_name`, which doesn't exist on Expense Claim. Also fixed the same class of error on Goals (Appraisal has no `status`), Training (`event_status`) and Benefits (`claim_date` is `payroll_date` in v16).
- **HR › Settings › Expense Claim** no longer opens a two-field form that ERPNext always rejects (`MandatoryError: exchange_rate, expenses`); it opens the new HR Expense Claims page.
- **Leave approver by business unit never worked**: the approver lookup called a non-existent ERPNext method, so it always fell back to the Employee record. Fixed, and the business unit's approvers now come first.
- **Themes**: the branding provider was never mounted, so the company theme and logo were never applied; the theme picker and the Brand studio (logo + shared theme) were lost in the previous commit — both restored. HR users without a Company user permission now get their personal theme. Ember now renders native dropdowns / date pickers dark; Login and dashboards use theme colours instead of hard-coded red/white.
- Regressions from the previous commit restored: HR › Leave (approve/reject with reason, apply for an employee, balances & allocations), admin navigation (Settings, ERPNext Setup, PM workspace items, page loading), Users hub tabs, timesheet review fields and "Partly Approved" as pending.
- Attendance marked by HR is now submitted (it stayed a draft); editing a submitted record cancels and amends it; cancelled records are hidden.
- Add employee: first name, gender and date of birth are required (ERPNext rejected the save without them).
- Lifecycle: future-dated promotions/transfers can't be submitted early (ERPNext refuses); company-only transfers ask for a detail row.
- Completed / cancelled project assignments keep their employee (ERPNext clears `_assign`).
- HR reports send the filters each report requires (Monthly Attendance Sheet, Birthday, Analytics, Leave Balance…); settings pages show numbers as numbers, not checkboxes.
- Missing server methods are detected correctly ("Failed to get method…"), so pages fall back instead of erroring.

### New
- **Approver rules** (Admin › ERPNext Setup › "Leave & expense approvals"):
  - Leave approver = employee's business unit (Department and its parents) in order, then the Employee record; anyone on approved leave today is skipped.
  - Expense approver = the Expense Claim Type's approver, then the business unit's expense approvers, then the Employee record; skipped when on leave.
  - Daily job (and an HR button) moves pending leave / expense requests away from approvers who are on leave.
  - An expense claim can't be approved without a bill, nor rejected without a reason; only the assigned approver or HR can decide.
- **Project Manager › Leave Approvals** tab: leave and expense claims waiting for the PM (as approver or line manager).
- **HR › Expense Claims** page: all claims with bills, approver, approve / reject with reason, change approver, claim for an employee.
- Employee claims: approver shown by name with source, "on leave → next approver" notice, "Add bill" for draft claims.
- Roles & Permissions presets for the Leave Approver and Expense Approver roles; HR preset covers Expense Claim.

**After deploying:** Admin › ERPNext Setup › Run setup, then Admin › Roles & Permissions › Apply everything; everyone signs out and back in.

---

## 14 Oct 2026 — HR modules, manager self-service, resources (`da8924b`)

### HR modules (previously read-only lists)
- **Leave** (HR › Leave)
  - Approve / reject applications (a reason is required to reject)
  - Apply for leave on an employee's behalf (the employee's leave approver is filled in automatically)
  - Balances & allocations tab: allocate leave, see allocated / used / pending / balance, CSV
- **Lifecycle** (HR › Lifecycle) — new page
  - Promotions and transfers: change designation, department, grade, branch, reports-to and revised CTC; the employee record updates on submit
  - Exits: start a separation (resignation date, last working day, checklist template), start the checklist, mark the employee as Left and disable their portal login
- **Performance** (HR › Performance)
  - Appraisal templates with KRAs (weightages must add up to 100%)
  - Appraisal cycles: add employees, create appraisals, start and complete the cycle
  - Appraisals list with submit; goals with progress tracking
- **Training** (HR › Training)
  - Programs; events with invited employees; mark completed / cancelled; feedback list
- **Reports** (HR › Reports)
  - Headcount, joiners & leavers with attrition, leave taken, attendance, timesheet utilisation, all with CSV

### Managers and resourcing
- **My Team** (Employee portal › My Team and PM › My Team)
  - Direct reports, who's in today, leave coming up in the next 14 days
  - Approve / reject their leave. A server rule allows this only for your own reports (or where you're the leave approver), never for your own leave
- **Resources** (HR › Resources and PM › Resources)
  - Per person: capacity vs hours assigned by PMs vs approved timesheet hours
  - Bench and over-allocated filters, CSV
- Working days: if a holiday list has no weekly offs entered, Saturday and Sunday are treated as off (Compliance and Resources)

### Admin and clean-up
- Admin › ERPNext Setup: new "Manager self-service" module (installs the My Team server rules)
- Roles & Permissions: the HR preset now covers Leave, Promotion, Transfer, Separation, Appraisal, KRA, Goal, Training, Attendance and Holiday List
- Roles & Permissions: new "Lift" action that removes ERPNext's automatic Employee restriction from HR / PM logins
- Fixed the 403 error on the admin dashboard (Has Role queries)
- Pages load on demand (code splitting): the first download is ~320 KB instead of ~800 KB
- Removed the unused `src/pages/admin/Projects.jsx`


refactor(hr-nav): remove HR Reports tab, move Onboarding/Performance/Training under Recruitment

- Remove the top-level "Reports" item from the HR sidebar, plus its
  /hr/reports route and lazy import in App.jsx
- Remove the Reports quick-access card from the HR dashboard
- Move Onboarding, Performance and Training into the Recruitment menu,
  keeping their existing /hr/* URLs
- Drop the lucide icon imports these changes left unused
- Recruitment > Reports (/hr/recruitment/reports) is unchanged



### Bugs fixed during testing
- Training "Mark completed" was rejected by ERPNext (attendee rows lost their names)
- Exit resignation date wasn't saved (the employee is now updated before the separation is created)
- Leave applied on behalf of an employee didn't carry their leave approver
- Capacity counted weekends as working days when the holiday list had no weekly offs

---

## 14 Oct 2026 — Timesheet approvals, security & audit (`e451aa7`)

### Timesheets
- Review status stored in real fields: Draft, Pending Review, Partly Approved, Approved, Finalized, Returned
- Each project's manager approves their own lines (PM › Approvals)
- HR can approve any project (with a note), return a sheet for correction (reason required), finalize (locks it) and reopen
- No one can review their own timesheet; stale-update check if two people review at once
- HR › Timesheets › Compliance: Missing / Not submitted / Returned / Awaiting approval / Partly approved / Approved / Finalized per person, expected hours from holiday list and approved leave, CSV
- Old comment-based approvals migrated to the new fields

### Security & audit
- Deny by default: a user with no recognised ERPNext role gets no workspace
- Employee salary, CTC and bank fields restricted (permlevel 1): HR sees them, employees and PMs don't
- Employee logins created, reset and disabled through server methods (HR no longer needs rights to edit Users)
- "Remove HR's elevated rights" option under Roles & Permissions
- Admin › Audit Logs: record changes with field diffs, app actions, sign-ins, CSV
- Admin › ERPNext Setup: one page that installs every module's custom fields, change history, field restrictions and server rules

---

## 14 Oct 2026 — Recruitment module

- **Requisitions:** managers / PMs raise hiring requests; only an HR Manager approves (server rule, never their own request); approved request → job opening
- **Openings:** skills, experience, salary range, careers-page publish, vacancies, ordered interview rounds
- **Pipeline:** Kanban board per opening (Applied → Screening → Shortlisted → Interview → Offer → Hired, plus Hold / Rejected / Withdrawn); exits need a reason
- **Candidates:** CV upload, CTC (restricted field), notice period, skills, source / referral, consent; duplicate check by email and phone
- **Candidate profile:** details, CV preview, scorecards side by side, offers, other applications, notes, timeline
- **Interviews:** rounds with a 1–5 skill scorecard; schedule / reschedule / cancel with panel clash check; .ics download; My Interviews for panel members
- **Offers:** maker-checker approval, send gate, revise offer, candidate response
- **Hire:** create the employee and start onboarding from the candidate (one employee per candidate, enforced on the server)
- **Onboarding:** real tracker with template activities
- **Reports:** funnel, time-to-hire, sources
- **Retention:** 12-month retention and anonymisation of old candidates
- Fixed sign-in role resolution (PMs were being sent to the HR workspace)

---

## Deploy steps (in order)

1. On the ERPNext server: `bench set-config -g server_script_enabled 1`, then restart
2. Sign in as Administrator → **Admin › ERPNext Setup › Run setup**
3. **Admin › Roles & Permissions** → **Apply everything**, then **Lift** (HR/PM staff restrictions), then **Remove HR's elevated rights**
4. Give each Company a **default Holiday List** (with weekly offs)
5. Set **Reports To** (and optionally **Leave Approver**) on employees so My Team has people in it
6. Everyone signs out and back in

---

## Test checklist

- [ ] Recruitment: requisition → approve → opening → candidate → interview + feedback → offer → approve → send → hire → onboarding
- [ ] Timesheets: employee submits → PM approves own project → HR approves / returns / finalizes → Compliance tab
- [ ] Security: employee can't see salary/bank fields; user with no role lands on "no workspace"; Audit Logs show changes
- [ ] Leave: allocate → apply on behalf → approve / reject → balances update
- [ ] My Team: manager approves a report's leave; can't approve someone outside the team
- [ ] Lifecycle: promotion and transfer update the employee; exit → mark as left
- [ ] Performance: template → cycle → add employees → create appraisals → start; add a goal and update progress
- [ ] Training: program → event with invitees → mark completed
- [ ] Reports: all 5 tabs load and download CSV
- [ ] Resources: assigned hours vs capacity, over-allocation shown

---

## Pending

- Payroll scope (Indian statutory payroll vs export to an outside payroll)
- Billing / project costing from approved hours
- Microsoft 365 credentials (Graph calendar invites and Outlook sending)
- Public careers form with a consent checkbox

Not built by choice: weekly no-login timesheet links (timesheets stay monthly and login-based).