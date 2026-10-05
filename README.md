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
