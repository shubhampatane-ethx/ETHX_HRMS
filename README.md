# ETHX HRMS

A role-based HR workspace for ETHX Softcon, built in React on top of ERPNext / Frappe HRMS. ERPNext is the single
source of truth (employees, attendance, leave, payroll, recruitment, assets…); this app is the screens people use plus
the server rules that ERPNext doesn't have out of the box. There is no second database.

## Contents

1. [Workspaces](#workspaces)
2. [Getting started](#getting-started)
3. [One-time ERPNext setup (automatic)](#one-time-erpnext-setup-automatic)
4. [What the setup applies](#what-the-setup-applies)
5. [Modules](#modules)
6. [Project structure](#project-structure)
7. [Security](#security)
8. [Deploying](#deploying)
9. [Troubleshooting](#troubleshooting)

## Workspaces

The ERPNext roles on a person's User record decide where they land. The Administrator can give anyone any role or
page from **Admin › Access Control**.

| ERPNext role | Workspace | Home |
|---|---|---|
| `Administrator` / `System Manager` | Admin (can also open HR and Project Manager) | `/admin` |
| `HR Manager`, `HR User` | HR, with their own self-service pages | `/hr` |
| `Projects Manager` | Project Manager | `/pm` |
| `Employee` | Employee portal | `/employee` |
| `Contractor` | Contractor (own projects and timesheet) | `/contractor` |

Staff who are also employees get one combined dashboard. The role mapping lives in `src/permissions/roles.js`; it
only decides what the screens show - ERPNext permissions and the server rules enforce access.

## Getting started

Requirements: Node 20+, an ERPNext site with the Frappe HRMS app, and its Administrator login.

```bash
npm install
npm run dev
```

The dev server runs on http://localhost:5180 and proxies `/api`, `/files`, `/private`, `/app` and `/me` to the
ERPNext site set in `vite.config.js` (change `target` there for another site). Same-origin requests keep ERPNext's
session cookie and CSRF token working without CORS.

Other scripts: `npm run build` (production build in `dist/`), `npm run lint` (oxlint), `npm run preview`.

## One-time ERPNext setup (automatic)

Nothing has to be clicked. **Sign in once as the Administrator** and the app applies everything it needs on the
ERPNext site by itself; a small card in the corner shows the progress and then disappears.

- It runs **once**. It runs again only when a new version of the app brings new rules or permissions, or a day after a
  run that had problems (failed steps are listed on **Admin › System Setup**).
- Every step only adds or fixes what is missing. Nothing that's already right is changed, and nothing is removed apart
  from the restrictions listed below.
- **Admin › System Setup** shows the state of every part and has **Apply Again** to run it on demand.
- After the first run, everyone should sign out and back in once so new permissions take effect.

One thing must be enabled on the server beforehand, because the app's rules are ERPNext Server Scripts:

```bash
bench --site <your-site> set-config server_script_enabled 1
bench restart
```

Birthday emails and password-reset emails also need an outgoing email account in ERPNext (**Email Account**, with
"Default Outgoing" ticked).

The code is in `src/lib/autoSetup.js` (what runs and when) and `src/components/AutoSetup.jsx` (the sign-in trigger).

## What the setup applies

### Missing doctypes are created

Before anything else, setup checks every doctype the app's forms use. If one doesn't exist on the site it is created
as a custom doctype (`src/lib/doctypeSetup.js`):

- **Employee Group** (with its member table), **Employee Grade** and **Employee Health Insurance** get the fields the
  app reads.
- Every other master with a form under HR setup (Branch, Department, Designation, Attendance Request, Employee Checkin,
  Employee Advance, Travel Request…) is built from that form's fields. A link to a doctype that doesn't exist becomes a
  plain text field.
- The app's own doctype, **ETHX Project Role**, is created and filled with the usual project roles.

Standard ERPNext / HRMS doctypes that already exist are never replaced. Doctypes with business logic (Leave
Application, Salary Slip, Job Applicant…) can't be rebuilt this way: if one is missing, System Setup lists it as
needing the ERPNext / HRMS app.

### Custom fields, change history and field settings

Fields the screens use, added to standard doctypes (`src/lib/*Setup.js`, collected in `src/lib/siteSetup.js`):

| Area | Examples |
|---|---|
| Recruitment | pipeline stage (Applied → Hired, plus Selected, On Hold, Rejected, Withdrawn), CTC, consent and retention |
| Employees | PAN, Aadhaar, Employee Group, contractor flags, page access |
| Company | display name, dark-theme logo, theme, sign-in support email / phone |
| Attendance requests | approver and decision |
| Timesheets, assets, offices | review fields, asset register fields, office holiday lists |

Change history is switched on for the main HR doctypes, and a few field settings are applied (for example, Issue status
can be *In Progress*, sensitive fields are restricted).

### Server rules

Server Scripts that enforce the rules in ERPNext itself, so they can't be bypassed from the browser. Among them:

- leave, expense and attendance requests are decided only by their assigned approver, never by the requester;
- employees read and change only their own records (profile details, photo, documents, requests, benefits);
- offers need maker-checker approval; one employee per candidate; candidate data retention;
- punch records can't be deleted (Administrator only);
- daily jobs: attendance from punches, punch-in / punch-out reminders, birthday notifications and wishes, holiday lists
  for the new year, approvals rerouted away from approvers on leave;
- a public method that gives the sign-in page the company logo, name and support contact.

### Role permissions

Every role gets the doctype permissions its screens need (`src/lib/rolePresets.js`): HR Manager, HR User, Projects
Manager, Employee, Contractor, Interviewer, Leave Approver and Expense Approver. Only missing permissions are added.

### Login restrictions

- Employee logins are limited to their own Employee record and company.
- HR and Project Manager logins are **not** limited to their own record (ERPNext adds that automatically when a login
  is linked to an employee, which would hide other people's data from them).
- Once employee logins are created through the server method, HR loses the right to create or edit Users and User
  Permissions (it could otherwise reset an administrator's password).

**Admin › Roles & Permissions** shows all of this for checking and fine-tuning.

## Modules

| Area | What's there |
|---|---|
| Employees | records with contact and ID details, logins, documents, lifecycle (promotions, transfers, exits with checklists and documents), contractors |
| Attendance | punch in / out, reminders, attendance from punches, correction requests with approvers, HR marking and calendar views |
| Leave & expenses | apply, edit and withdraw; business-unit approvers with fallback when an approver is on leave; bills required to approve claims |
| Timesheets | weekly grid, pre-filled from project assignments, submit and review, auto-submit after the week ends |
| Projects | projects, project roles, assignments, resources (capacity, bench, over-allocation), team timesheets and approvals |
| Recruitment | requisitions, openings and pipeline board, candidates, interviews and scorecards, offers with approval, onboarding, reports |
| Training & performance | training events and programs (edit, reschedule, cancel), feedback, goals and appraisals |
| Self-service | profile, payslips, benefits, documents, assets, help and letter requests, notifications, calendar with holidays and birthdays |
| HR | dashboard with everything needing attention, employee requests, policies, asset register, offices, payroll, reports |
| Admin | users, Access Control (any role or page for anyone), roles & permissions, organisation, Brand Studio (logos, name, theme, sign-in help), audit logs, System Setup |

## Project structure

```
src/
  App.jsx                 routes and workspace guards
  context/                signed-in user (AuthContext), company branding
  components/             layout, dialogs, shared UI, AutoSetup
  pages/
    admin/ hr/ pm/ employee/ contractor/ shared/
  lib/
    api/frappeClient.js   ERPNext REST client (session cookie + CSRF)
    siteSetup.js          setup modules: doctypes, fields, rules, settings
    *Setup.js             each module's fields and Server Scripts
    doctypeSetup.js       doctypes created when missing
    rolePresets.js        permissions per role, login restrictions
    autoSetup.js          applies all of the above once
  permissions/roles.js    ERPNext roles → app permissions
```

## Security

- The app uses ERPNext's session login; it never stores passwords. Don't commit credentials or put them in this file.
- Screen guards are convenience only. Real access control is ERPNext's permissions plus the server rules above.
- Employee-facing changes to their own data go through server methods that check the signed-in user.
- Serve the app from the same domain as ERPNext in production (see below) so cookies stay first-party.

## Deploying

```bash
npm run build
```

Serve `dist/` from the same domain as ERPNext: either behind a reverse proxy that sends `/api`, `/files`,
`/private`, `/app` and `/me` to ERPNext and everything else to `dist/` (with a fallback to `index.html` for client
routes), or as the public build of a custom Frappe app. Then sign in once as the Administrator so the setup runs.

## Troubleshooting

| Symptom | Fix |
|---|---|
| Setup card says "Needs Attention" | Open Admin › System Setup to see the failed steps; most often Server Scripts are disabled (see above). It retries automatically the next day, or use Apply Again. |
| "… isn't set up on the server yet" messages | The setup hasn't run on this site yet: sign in as the Administrator once. |
| Someone still gets "not permitted" | Ask them to sign out and back in. Admin › Roles & Permissions › Check an Account shows what their roles are missing. |
| No logo on the sign-in page | Upload the logos in Admin › Brand Studio; the sign-in page uses the default company (ERPNext Global Defaults). |
| Reset or birthday emails don't arrive | Set up a default outgoing Email Account in ERPNext. |

Change history: `git log` and `CHANGELOG.md`.
