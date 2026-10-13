# HRMS Frontend (React + ERPNext backend)

A role-based frontend for ERPNext/HRMS: **Admin** manages the platform (creates HR
users, org structure, roles); **HR** manages employees, attendance, leave,
payroll, and the rest of the HR domain. ERPNext stays the single source of
truth for Employee, Leave, Payroll, etc. — this app is a UI + thin API layer
on top of it, not a second database.

## Stack

- React + Vite, Tailwind CSS v4 (via `@tailwindcss/vite`, no config file needed)
- `react-router-dom` for routing/guards, `axios` for the ERPNext REST client
- `lucide-react` for icons

## Design system

Black/red enterprise theme, tokens live in `src/index.css` under `@theme`:
`--color-bg` (#0a0a0c), `--color-surface`, `--color-red` (#e8102a) as the
single accent for actions/active states, everything else stays black/grey/white.

## 1. Point it at your ERPNext site

In dev, `vite.config.js` proxies `/api` → `http://localhost:8000` (edit the
`target` to match your ERPNext site's URL). This keeps requests same-origin
so Frappe's session cookie + CSRF token work without CORS configuration.

In production, **serve this frontend from the same domain as ERPNext**
(e.g. as a custom Frappe app's public build, or behind a reverse proxy that
routes `/api/*` to ERPNext and everything else to this app's `dist/`).
Cross-site cookies with Frappe's default session auth are painful to get
right — same-origin is the path of least resistance.

## 2. Set up ERPNext roles

The frontend maps ERPNext roles → app permissions in `src/permissions/roles.js`.
Out of the box:

| Account | App role | Lands on |
|---------|----------|----------|
| `Administrator` | Admin | `/admin` |
| Every other authenticated account | HR | `/hr` |

The exact ERPNext username `Administrator` is the only Admin account. Its
configured credential is `Administrator` / `change-me-admin`. Every other
successful login is treated as HR by the application. Configure the matching
doctype permissions in ERPNext too: frontend route guards cannot grant or
revoke backend access.

## 3. Run it

```bash
npm install
npm run dev
```

Login uses `POST /api/method/login` (session-cookie auth) — enter the email/
password of an ERPNext user. Only `Administrator` can reach the Admin routes
or use the "Create HR" flow; HR users are sent to `/unauthorized` if they try
to open an Admin URL. `AdminUsers.jsx`'s "Create HR" flow calls
`POST /api/resource/User` then assigns the role, so the Admin logged in here
needs create-User permission in ERPNext (System Manager has this by default).

## 4. What's real vs. stubbed

Wired to live ERPNext data via `src/lib/api/frappeClient.js`:
- Login/logout/session, HR user list + Create HR (`User` + `Has Role` doctypes)
- Admin dashboard counts (`Employee`, `Company`)
- HR dashboard counts, Employees list (`Employee` doctype)

Stubbed as placeholders to build out next (Organization, Roles, Settings,
Audit Logs, Attendance, Leave, Payroll, Recruitment, Onboarding, Performance,
Training, Reports) — each just needs its `frappe.getList/getDoc` calls
against the matching ERPNext/HRMS doctype, following the pattern in
`pages/hr/Employees.jsx`.

## 5. Security note

Route guards (`src/permissions/guards.jsx`) and the permission map are
**UI convenience only**. Real enforcement must live in ERPNext itself — its
native doctype permissions, or a custom Frappe app (`my_hrms`) with
whitelisted methods that check `frappe.session.user`'s roles server-side
before acting. Never rely on the frontend gate alone.

## 6. Suggested next steps

- Build a custom Frappe app (`my_hrms`) for anything ERPNext/HRMS doesn't
  model natively (platform settings, audit logs, org branches if you need
  more than ERPNext's Company/Department).
- Add an Employee Portal (`/employee/*`) once you want self-service login
  for employees — `primaryAppRole()` already recognizes the `Employee` role,
  it just needs a layout + routes.
- Swap the placeholder pages for real ones as you build out each HRMS module.


# --------------------------------------------- NEW CHANGES------------------------------------------- #

# HRMS Frontend (React + ERPNext backend)

A role-based frontend for ERPNext/HRMS with four workspaces: **Admin** manages the
platform (HR users, Project Managers, companies, roles and permissions, and can open
everything HR can); **HR** manages employees, attendance, timesheets, leave and the
rest of the HR domain; **Project Managers** assign employees to projects with a role
and an ETA; **Employees** use a self-service portal. ERPNext stays the single source of
truth for Employee, Leave, Payroll, Timesheet, Project, Task, etc. — this app is a UI +
thin API layer on top of it, not a second database.

## Stack

- React + Vite, Tailwind CSS v4 (via `@tailwindcss/vite`, no config file needed)
- `react-router-dom` for routing/guards, `axios` for the ERPNext REST client
- `lucide-react` for icons

## Design system

Black/red enterprise theme, tokens live in `src/index.css` under `@theme`:
`--color-bg` (#0a0a0c), `--color-surface`, `--color-red` (#e8102a) as the
single accent for actions/active states, everything else stays black/grey/white.

## Workspaces at a glance

| Who | Lands on | What they do |
|-----|----------|--------------|
| Administrator | `/admin` | HR Users, Project Managers, All Employees, Organization (companies), Roles & Permissions. Can also open the whole HR workspace (`/hr/*`) and the Project Manager workspace (`/pm/*`) |
| HR Manager / HR User | `/hr` | Employees (full details, create logins), Attendance, Timesheets (review), Leave, Payroll, Recruitment, Onboarding, Performance, Training, Reports, Settings & masters |
| Projects Manager | `/pm` | Projects, Assignments (role + ETA + hours per day), Team Timesheets (read-only) |
| Employee | `/employee` | Dashboard, My Profile, Attendance (punch in/out), Leave, My Approvals, Calendar & Holidays, Timesheet, Expense Claims, Payslips, Policies & Documents, My Assets, Help & Requests, Notifications, Goals & Feedback, Training & Learning, Benefits & Insurance, Search |

## 1. Point it at your ERPNext site

In dev, `vite.config.js` proxies `/api`, `/app`, `/me`, `/files` and `/private` to your
ERPNext site (edit the `target` to match its URL). This keeps requests same-origin so
Frappe's session cookie + CSRF token work without CORS configuration.
`/files` and `/private` are what make policy documents, letters and bill uploads open.

In production, **serve this frontend from the same domain as ERPNext**
(e.g. as a custom Frappe app's public build, or behind a reverse proxy that
routes `/api/*` (and the paths above) to ERPNext and everything else to this app's `dist/`).
Cross-site cookies with Frappe's default session auth are painful to get
right — same-origin is the path of least resistance.

## 2. ERPNext roles → app workspaces

The frontend maps ERPNext roles → app permissions in `src/permissions/roles.js`.
After sign-in, `resolveAccount()` in `src/context/AuthContext.jsx` reads the user's real
ERPNext roles and picks the workspace (highest priority first):

| ERPNext account / role | App workspace |
|------------------------|---------------|
| `Administrator` | Admin (`/admin`) |
| `HR Manager`, `HR User` | HR (`/hr`) |
| `Projects Manager` (ERPNext's standard role) | Project Manager (`/pm`) |
| `Employee` only | Employee portal (`/employee`) |
| Anything else we can't read or recognise | HR (legacy default) |

The exact ERPNext username `Administrator` is the only Admin account. Its
configured credential is `Administrator` / `change-me-admin`. A user who holds both
`Projects Manager` and `Employee` lands on `/pm` and has a "My Employee Portal" link.
Configure the matching doctype permissions in ERPNext too: frontend route guards cannot
grant or revoke backend access. The Admin page **Roles & Permissions** does this for you
(see "After deploying" below).

## 3. Run it

```bash
npm install
npm run dev
```

Login uses `POST /api/method/login` (session-cookie auth) — enter the email/
password of an ERPNext user. Route guards send users to `/unauthorized` if they open a
workspace they have no permission for. Permissions are worked out at sign-in, so after a
role or permission change the user must sign out and back in (or hard-refresh).

## 4. What's real vs. placeholder

Wired to live ERPNext data:

- **Admin:** Dashboard, HR Users (full account details and management), Project Managers,
  All Employees, Organization (company setup), Roles & Permissions, ERPNext Setup, Audit Logs, Settings (branding)
- **HR:** Dashboard, Employees (full details, portal logins), Attendance, Leave, Timesheets (+ Compliance),
  Recruitment (full pipeline - see 14 Oct below), Onboarding, Lifecycle (promotions, transfers, exits), Performance,
  Training, Reports, Resources, Settings & masters (generic list/create/edit pages from `src/lib/hrSetupConfig.js`)
- **Project Manager:** Dashboard, Projects, Assignments, Timesheet Approvals, Team Timesheets, Resources, My Team,
  Hiring Requests, My Interviews
- **Employee portal:** every section listed above, plus My Team for line managers
- Read-only record list from ERPNext (`LiveRecords`): Payroll (Salary Slip) - payroll scope is still to be decided.

## 5. Key flows

- **Create an HR user** (Admin → HR Users → Create HR): creates the ERPNext `User`, assigns
  the HR role, and ties the user to one company with a User Permission so HR only sees that
  company's data. HR users can be enabled/disabled, moved to another company, have their role
  level changed or their password reset from the user's detail window.
- **Create a Project Manager** (Admin → Project Managers): `Projects Manager` role + company
  restriction + temporary password. They must set their own password at first sign-in.
- **Give an employee a login** (HR → Employees → key icon): creates a `User` with the
  `Employee` role and links it through the Employee's *User ID*. HR picks a temporary
  password; the employee is forced to change it at first sign-in
  (`last_password_reset_date` is empty until they do). If HR may not create User Permissions,
  the login is still created and flagged as "not restricted" — the Administrator then
  presses **Restrict** under Roles & Permissions → Employee record restrictions.
- **Punch in/out** (Employee → Attendance) saves an ERPNext *Employee Checkin*. ERPNext
  doesn't turn that into Attendance by itself, so HR's Attendance page and dashboard show
  punched-in days as "Present – Unconfirmed", and HR can confirm them (one click or all at
  once) to create real Attendance records.
- **Timesheets:** employees fill a whole month at once (project, hours and task per day,
  CSV import) and submit it. Each project's manager approves their own lines (PM › Approvals); HR can approve any
  project with a note, return the sheet for correction (reason required) and finalize it, which locks it. HR ›
  Timesheets › Compliance shows who is missing, late, returned or awaiting approval for a month.
- **Project assignments → automatic timesheets** (13 Oct, below): a Project Manager assigns an
  employee to a project with a role, start date, ETA and hours per day; the employee's monthly
  timesheet fills those days in automatically.

## 6. Security note

Route guards (`src/permissions/guards.jsx`) and the permission map are
**UI convenience only**. Real enforcement must live in ERPNext itself — its
native doctype permissions, or a custom Frappe app (`my_hrms`) with
whitelisted methods that check `frappe.session.user`'s roles server-side
before acting. Never rely on the frontend gate alone.

Things to be aware of:

- Employee logins are created by a server method (`ethx_employee_login`) that only touches plain employee
  accounts, so HR no longer needs to create/edit **User** records or **User Permissions**. Once that method is
  installed, press **Remove HR's elevated rights** under Roles & Permissions.
- Approvals, timesheet review, leave decisions by managers and candidate rules are enforced by Server Scripts
  (installed from Admin › ERPNext Setup), so they hold even through the ERPNext desk or API.
- Users with no recognised ERPNext role get no workspace at all (deny by default).
- Company scoping relies on ERPNext User Permissions (`Company`). Doctypes without a company
  field (for example *Employee Checkin*) are not filtered by it, so HR screens filter those
  by the employees HR is allowed to see.

## 7. Recent changes

### 14 Oct 2026 (later) — Timesheet approvals, security & audit, HR modules

Timesheets
- Review state lives in custom fields on Timesheet and Timesheet Detail (no more parsing notes); old sheets are migrated.
- Per-project approval by the project's manager (`custom_project_manager` on Project, PM › Approvals); HR override with
  a note; return needs a reason; finalize locks the sheet; no one reviews their own sheet; stale-version check.
- HR › Timesheets › Compliance: Missing / Not submitted / Returned / Awaiting approval / Partly approved / Approved /
  Finalized per person, expected hours from holiday list and approved leave, CSV.

Security & audit
- Deny by default: no recognised role → no workspace. Real ERPNext roles drive the menus.
- Employee salary, CTC and bank fields are restricted (permlevel 1) - HR sees them, employees and PMs don't.
- Employee logins created/reset/disabled through server methods; option to remove HR's rights to edit Users.
- Admin › Audit Logs: record changes (version history with field diffs), app actions and sign-ins, with CSV.
- Admin › ERPNext Setup: one page that installs every module's custom fields, change history, field restrictions and
  server rules.

HR modules (were read-only lists)
- **Leave:** approve / reject (with reason), apply on an employee's behalf, balances and allocations.
- **Lifecycle:** promotions and transfers (update the employee record on submit, revised CTC), exits (separation
  checklist, mark as left, disable the portal login).
- **Performance:** appraisal templates (KRA weightages = 100%), cycles (add employees, create appraisals, start,
  complete), appraisals, goals with progress.
- **Training:** programs, events with invited employees, mark completed / cancelled, feedback.
- **Reports:** headcount, joiners & leavers with attrition, leave taken, attendance, timesheet utilisation; all CSV.
- **My Team** (employee portal and PM): direct reports, who's in today, upcoming leave, approve / reject their leave
  (server rule: only your own reports or where you're the leave approver, never your own leave).
- **Resources** (HR and PM): capacity vs PM-assigned vs approved hours per person, bench and over-allocation.
- Working days: when a holiday list has no weekly offs entered, Saturday and Sunday are treated as off.

Other
- Pages load on demand (code splitting) - the first download is about 320 KB instead of 800 KB.
- Removed the unused `src/pages/admin/Projects.jsx`.

### 14 Oct 2026 — Recruitment module (requisition → hire)

The whole hiring pipeline now runs in the app on standard Frappe HRMS doctypes (Job Requisition, Job Opening,
Job Applicant, Interview Round, Interview, Interview Feedback, Job Offer, Employee Onboarding). HR › Recruitment is a
menu group: Overview, Requisitions, Openings & Pipeline, Candidates, Interviews, My Interviews, Offers, Reports,
Setup & Retention.

- **Requisitions** (`/hr/recruitment/requisitions`, and `/pm/requisitions` for Project Managers): raise with role,
  positions, budget, needed-by date and project; an HR Manager approves / holds / rejects (never their own); HR turns an
  approved requisition into an opening with HRMS's own mapper. Closing the opening marks the requisition Filled (HRMS).
- **Openings**: skills, experience, salary range (public or not), careers-page publishing (ERPNext `/jobs`), vacancies,
  and an ordered list of interview rounds per opening.
- **Pipeline board** (`/hr/recruitment/openings/:id`): Applied → Screening → Shortlisted → Interview → Offer → Hired,
  plus Hold / Rejected / Withdrawn lanes (Hold is separate from Rejected). Drag a card to move it; dropping on
  Interview / Offer / an exit opens the right form (reason required for exits, optional regret email). Cards show rating,
  next interview, rounds cleared, offer state and days in stage.
- **Candidates**: add sourced / referred candidates with CV upload, CTC, notice, experience, skills and recorded DPDP
  consent. Duplicates are checked by email and phone (digits only): another opening is allowed, the same opening is
  blocked. Profile shows details, CV preview, interviews with every interviewer's scorecard side by side, offers
  (including revisions), other applications by the same person, HR notes and a timeline built from ERPNext's version
  history (every field change, who, when).
- **Interviews**: reusable rounds with a 1–5 skill scorecard, pass mark and default panel. Schedule / reschedule /
  cancel with a clash check on the panel; `.ics` download for Outlook. Panel members automatically get HRMS's
  `Interviewer` role and read access (a share) to that one candidate. Interviewers use **My Interviews** (employee portal,
  HR and PM workspaces) to submit scorecards; HR records Cleared / Rejected after reading them.
- **Offers**: draft (HR) → send for approval → HR Manager approves (maker-checker: not the person who drafted it) →
  send (submits the Job Offer, optionally emails the PDF) → candidate accepts / declines → hire, didn't join (no-show /
  withdrawn, can reopen the opening) or revise (cancel + amended copy, needs approval again). Offers can't be sent until
  every round on the opening is Cleared, unless an override reason is given. Editing CTC, dates, role or terms of an
  approved offer sends it back for approval. Accepting the last vacancy offers to close the opening.
- **Hire / onboarding**: create the Employee straight from the accepted offer, or start an ERPNext Employee Onboarding
  first (template tasks are copied and created; required tasks block employee creation). HR › Onboarding is now a real
  page: task progress, create employee, mark complete. One employee per candidate.
- **Reports**: open positions (filled / vacancies, candidates per stage, age), candidates per stage, offer acceptance,
  median time to hire and time to fill, source effectiveness; CSV export.
- **Retention**: rejected / withdrawn / on-hold candidates get a 12-month "retain until" date; Setup & Retention lists
  who is due and anonymises them (also from the profile). Anonymising removes name, contact details, CV files, CTC and
  notes, clears the copies on sent offers, interviews and emails, and renames the record (HRMS uses the email as ID).
  Hired candidates are refused.
- **Server-side rules** (installed as ERPNext Server Scripts by Setup, so they also apply to the desk and API): requisition
  decisions by HR Managers only and never on their own request; offer maker-checker; offer send gate (approval + rounds);
  duplicate applications per opening; one employee per candidate; server-side anonymise method.
- **Custom fields** (40, `custom_` prefix, created by Setup): pipeline stage / since / reason, CTC (permission level 1 so
  only HR can read it), notice, experience, skills, consent, retention on Job Applicant; skills, experience and rounds on
  Job Opening; project and decision trail on Job Requisition; CTC, joining date, validity, approval, override and joining
  status on Job Offer; mode and meeting link on Interview. Change history is switched on for applicants, offers,
  requisitions and openings.
- **Sign-in fix (G06):** non-HR users can't read the roles table on their own User record, so Project Managers and
  employees used to fall through to the HR workspace. `resolveAccount()` now asks ERPNext
  (`frappe.core.doctype.user.user.get_roles`) when the table comes back empty, and the user object keeps the real
  ERPNext roles as `user.erpRoles` (HR Manager vs HR User, Interviewer).
- **Roles & Permissions:** recruitment doctypes added to the HR preset (CTC at permission level 1), requisitions to the
  Projects Manager preset, and a new **Interviewer** tab / preset.
- **Files:** new `lib/recruitment.js`, `lib/recruitmentSetup.js`, `pages/hr/recruitment/*` (Overview, Requisitions,
  Openings, Board, Candidates, CandidateProfile, Interviews, MyInterviews, Offers, RecruitmentReports, RecruitmentSetup,
  shared); rewritten `pages/hr/Onboarding.jsx`; removed `pages/hr/Recruitment.jsx`; changed `App.jsx`,
  `AuthContext.jsx`, `HRLayout.jsx`, `AdminLayout.jsx`, `PMLayout.jsx`, `Sidebar.jsx` (exact-match child links),
  `EmployeeShell.jsx` (My Interviews link for interviewers, status colours), `permissions/roles.js`, `pages/admin/Roles.jsx`.
- **Tested** end to end against ERPNext 15.122 / HRMS 15.64 with HR Manager, HR User, Project Manager and interviewer
  logins, including API bypass attempts against each server rule.

### 13 Oct 2026 — Project Manager role and assignment-driven timesheets

The Administrator can create Project Managers; they assign employees to projects with a role
and ETA, and the employees' timesheets fill in automatically.

- **Role:** ERPNext's standard `Projects Manager` role is mapped to a new `PROJECT_MANAGER`
  permission bucket (`dashboard.pm`, `projects.manage`, `assignments.manage`,
  `timesheets.team.view`). Workspace priority is Admin > HR > Project Manager > Employee; sign-in
  and `HomeRedirect` send Project Managers to `/pm`. The Administrator also holds `dashboard.pm`.
- **Admin → Project Managers** (`/admin/project-managers`): add a Project Manager (name, email,
  temporary password, company, optional Employee portal), change company, reset password,
  enable/disable. Company scoping reuses `setUserCompany()` (now exported from `pages/admin/Users.jsx`).
  The admin menu also has a **Project Workspace** group linking to the `/pm` pages.
- **Project Manager workspace** (`/pm`, `PMLayout`): *Dashboard* (open projects, active
  assignments, employees free today, ETAs within 7 days), *Projects* (list/create), *Assignments*
  (assign employee, edit, mark completed, cancel, workload warning when an employee is already
  booked in the period) and *Team Timesheets* (the HR Timesheets page with `readOnly`, so no
  Approve/Return).
- **Data model:** an assignment is an ERPNext **Task** assigned to the employee's user
  (`frappe.desk.form.assign_to.add`). Role and hours per day live in the task description:
  ```
  [ETHX Assignment]
  Role: Developer
  Hours per day: 8
  Notes: ...
  ```
  Start/ETA are the task's `exp_start_date`/`exp_end_date`; `expected_time` = hours per day ×
  working days. Helpers are in `src/lib/assignments.js`.
- **Automatic timesheets:** `EmpTimesheet.jsx` loads the employee's assignments for the month
  and pre-fills every working day between start date and ETA with the assigned project, hours
  per day and the role as the task (ETA in the note). It skips weekly offs, holidays and leave,
  halves half-day leave, subtracts hours already logged in another timesheet, and adds one
  line per project when several assignments overlap. A **From my assignments** button repeats
  the fill, and a summary box lists the month's assignments. Employees can edit before submitting.
- **First sign-in:** Project Managers created with a temporary password see the same "Set your own
  password" screen as employees (`ForcedPasswordScreen`, now exported from `EmployeeShell.jsx`).
- **Roles & Permissions:** new **Projects Manager** tab/preset (Project, Task, ToDo, Employee,
  Company, Department, Designation, Timesheet, Activity Type); *Check an account* understands it.
- **Files:** new `lib/assignments.js`, `components/layout/PMLayout.jsx`, `pages/pm/PMPages.jsx`,
  `pages/admin/ProjectManagers.jsx`; changed `App.jsx`, `AuthContext.jsx`, `Login.jsx`,
  `permissions/roles.js`, `AdminLayout.jsx`, `EmployeeShell.jsx`, `pages/admin/Roles.jsx`,
  `pages/admin/Users.jsx`, `pages/employee/EmpTimesheet.jsx`, `pages/hr/Timesheets.jsx`.

### 12 Oct 2026 — Administrator can see and change everything HR can

- **HR Workspace menu in Admin:** every HR page plus all HR settings and masters (including
  the admin-only **Company** master) open from the admin sidebar. `HRLayout` shows a
  **Back to Admin** link and an "Admin" label when the Administrator is inside it
  (`TOP_NAV` and `hrSetupGroups()` are exported for reuse).
- **All Employees** (`/admin/employees`): the HR Employees page across every company.
- **Full employee details:** click an employee's name to see every filled-in field grouped as
  Employment, Personal, Contact, Emergency contact, Documents & insurance, Sign-in and Other,
  plus education / work-history tables, portal-login status (enabled, last login, roles) and
  who created/last changed the record. Buttons: edit employee, create login / reset password.
- **HR user details** (Admin → HR Users, click a name): roles, status, last login/active,
  company, how many of that company's employees are active; switch HR User ↔ HR Manager,
  disable/enable, change company, set a password, delete.
- **Fix for "Not authorized":** `permissions/roles.js` now gives the Administrator
  `dashboard.hr`, `leave.create`, `onboarding.view`, `performance.view` and `training.view`
  (`dashboard.hr` is the guard on every `/hr` route), and `App.jsx` has the `/admin/employees`
  route. `DoctypeView` lets the Administrator open admin-only masters such as Company.
- **Files:** `AdminLayout.jsx`, `HRLayout.jsx`, `pages/hr/Employees.jsx`, `pages/admin/Users.jsx`,
  `pages/hr/DoctypeView.jsx`, `permissions/roles.js`, `App.jsx`.

### Earlier (5–9 Oct 2026)

- 5 Oct: initial commit; Attendance page (employee tabs, year/month filter).
- 6 Oct: HR dashboard, admin dashboard and users, redesigned login page; company-scoped HR users and
  Administrator-only company setup.
- 9 Oct: Employee portal (17 sections) and employee logins; timesheet rework with HR review flow
  and CSRF fixes (full list in `commit-msg.txt`).

## 8. After deploying

0. Enable server scripts on the site (`bench set-config -g server_script_enabled 1`, restart), then as
   `Administrator` open **Admin › ERPNext Setup › Run setup** (all modules: custom fields, change history, field
   restrictions, server rules, timesheet migration). Run it again after every upgrade of this app - it only adds or
   updates what changed. Set a **default Holiday List** on each Company (with weekly offs).
1. Sign in as `Administrator` → **Roles & Permissions** → **Apply everything for HR Manager,
   HR User, Projects Manager, Employee and Interviewer**. It only adds missing permissions and never removes
   existing ones. (Per-role tabs, a doctype editor and *Check an account* are on the same page.)
2. Under **Employee record restrictions**, press **Restrict** for any employee login that
   isn't limited to its own record and company. Under the HR / PM staff restrictions section press **Lift** (ERPNext
   gives HR and PM logins an automatic Employee restriction that hides other people's records). Press **Remove HR's
   elevated rights** once ERPNext Setup has installed the login methods.
   For My Team, set *Reports To* (and optionally *Leave Approver*) on employees.
3. Everyone affected signs out and back in.
4. Create Project Managers from **Admin → Project Managers**; make sure employees who will be
   assigned have a portal login (HR → Employees → key icon).
5. Recruitment: make sure server scripts are enabled on the site (`bench set-config -g server_script_enabled 1`, restart),
   then as `Administrator` open **HR › Recruitment › Setup & Retention › Run setup** (custom fields, change history,
   candidate sources, server rules). Run **Apply everything** under Roles & Permissions again afterwards. To email offer
   letters and regret notes, configure a default outgoing Email Account in ERPNext (e.g. the HR Microsoft 365 mailbox).
   HR staff whose login is linked to an Employee record get an automatic "Employee" User Permission from ERPNext, which
   limits them to records tied to their own employee (e.g. only their own requisitions) - remove it for HR users.
   Companies need a default Holiday List for onboarding.
6. Optional: upload company policies to the ERPNext public folder `Home/Policies`, and fill the
   HR/IT contacts in `src/lib/employeeConfig.js` / `employeePortal.js` (employee portal).

## 9. Known gaps / next steps

- Waiting for a decision: **payroll** scope (Indian statutory payroll vs. export to an outside payroll), **billing /
  project costing** from approved hours, **Microsoft 365** (Graph calendar invites and Outlook sending need the tenant's
  app registration), and a **public careers form** with a DPDP consent checkbox.
- Timesheets are monthly and need a login; weekly no-login links were not built.
- Self-appraisal and manager feedback are filled in ERPNext's HR app; the app shows the scores.
- Recruitment, not built yet: Microsoft Graph calendar invites (interviews give an `.ics` download instead) and Outlook
  sending through OAuth (uses ERPNext's outgoing Email Account); LinkedIn / Naukri posting (manual, source recorded per
  candidate); AI CV screening; a public application form with a consent checkbox on the careers page (HRMS's `/jobs`
  form doesn't capture consent - candidates applying there have "consent not recorded"); budget approval thresholds on
  requisitions. Interview feedback can only be submitted on or after the interview date (HRMS rule).