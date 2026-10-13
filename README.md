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
  All Employees, Organization (company setup), Roles & Permissions
- **HR:** Dashboard, Employees (full details, portal logins), Attendance, Timesheets,
  Recruitment, Settings & masters (generic list/create/edit pages from `src/lib/hrSetupConfig.js`)
- **Project Manager:** Dashboard, Projects, Assignments, Team Timesheets
- **Employee portal:** every section listed above
- Read-only record lists from ERPNext (`LiveRecords`): Leave, Payroll (Salary Slip),
  Onboarding, Performance, Training, Reports

Still placeholders: Admin **Settings** and **Audit Logs**.

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
  CSV import); HR reviews (approve / return for correction) and downloads a month as CSV.
  See `commit-msg.txt` for the 9 Oct rework.
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

- Letting HR create/edit **User** records also lets them set any user's password, including
  administrators'. Letting HR create **User Permissions** lets them widen their own company
  access. Grant these only to HR staff you trust, or replace them with a server-side method
  that can only create Employee logins.
- Company scoping relies on ERPNext User Permissions (`Company`). Doctypes without a company
  field (for example *Employee Checkin*) are not filtered by it, so HR screens filter those
  by the employees HR is allowed to see.

## 7. Recent changes

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

1. Sign in as `Administrator` → **Roles & Permissions** → **Apply everything for HR Manager,
   HR User, Projects Manager and Employee**. It only adds missing permissions and never removes
   existing ones. (Per-role tabs, a doctype editor and *Check an account* are on the same page.)
2. Under **Employee record restrictions**, press **Restrict** for any employee login that
   isn't limited to its own record and company.
3. Everyone affected signs out and back in.
4. Create Project Managers from **Admin → Project Managers**; make sure employees who will be
   assigned have a portal login (HR → Employees → key icon).
5. Optional: upload company policies to the ERPNext public folder `Home/Policies`, and fill the
   HR/IT contacts in `src/lib/employeeConfig.js` / `employeePortal.js` (employee portal).

## 9. Known gaps / next steps

- Admin **Settings** and **Audit Logs** are still placeholders.
- `src/pages/admin/Projects.jsx` (assign employees to a project through the Project's *users*
  table) exists but is not routed; Project Manager assignments use Tasks instead (see above).
- Replace "HR may create Users / User Permissions" with a custom Frappe app (`my_hrms`) method that
  can only create Employee logins, and add audit logging there.
- Swap the read-only `LiveRecords` pages (Leave, Payroll, Onboarding, Performance, Training,
  Reports) for full pages as you build out each HRMS module.