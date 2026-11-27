// Employee portal: shared UI pieces, employee context and the portal layout in one file.
import { PageLoading } from "../PageLoading";
import { createContext, useContext, useEffect, useRef, useState, Suspense } from "react";
import { Link, Outlet, useLocation } from "react-router-dom";
import { AlertCircle, ArrowRight, Bell, Briefcase, CalendarCheck, ClipboardCheck, FileText, GraduationCap, Inbox, LayoutDashboard, LifeBuoy, Loader2, Search, Target, Timer, Wallet, X } from "lucide-react";
import { errMsg, friendlyError, getMyEmployee, isoDate, useAsync } from "../../lib/employeePortal";
import { frappe } from "../../lib/api/frappeClient";
import { Brand } from "../Brand";
import { Button } from "../ui/primitives";
import { useAuth } from "../../context/AuthContext";
import { Sidebar } from "../layout/Sidebar";
import { Topbar } from "../layout/Topbar";
import { hrNav, hrTitleFor } from "../layout/HRLayout";
import { hasPermission, isStaffEmployee } from "../../permissions/roles";
import { pmNav, pmTitleFor } from "../layout/PMLayout";
import { coreSection, flattenNav, moduleSection, staffView } from "../layout/navSections";

/* ===== ui.jsx ===== */
export const inputCls =
  "w-full rounded-md border border-[var(--color-border-strong)] bg-[var(--color-surface-2)] px-3 py-2 text-[13px] text-[var(--color-text)] placeholder:text-[var(--color-text-faint)] outline-none focus:border-[var(--color-red)]";

export function Field({ label, hint, children }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[12px] text-[var(--color-text-muted)]">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[11px] text-[var(--color-text-faint)]">{hint}</span>}
    </label>
  );
}

export function PageHeader({ icon: Icon, avatar, title, subtitle, actions }) {
  return (
    <section className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-5 py-4">
      <div className="flex items-center gap-3">
        {avatar}
        {!avatar && Icon && (
          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--color-red-wash)] text-[var(--color-red-hover)]">
            <Icon size={18} strokeWidth={1.9} />
          </span>
        )}
        <div>
          <h2 className="text-[15px] font-semibold text-[var(--color-text)]">{title}</h2>
          {subtitle && <p className="mt-0.5 text-[12px] text-[var(--color-text-muted)]">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </section>
  );
}

export function Panel({ title, hint, action, children, className = "" }) {
  return (
    <section className={`rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 ${className}`}>
      {(title || action) && (
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h3 className="text-[13px] font-semibold text-[var(--color-text)]">{title}</h3>
            {hint && <p className="mt-0.5 text-[12px] text-[var(--color-text-muted)]">{hint}</p>}
          </div>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function Skeleton({ className = "" }) {
  return <div className={`animate-pulse rounded bg-[var(--color-surface-2)] ${className}`} />;
}

export function Stat({ to, icon: Icon, label, value, sub, accent = "var(--color-red-hover)" }) {
  const body = (
    <>
      <div className="pointer-events-none absolute -right-6 -top-6 h-24 w-24 rounded-full opacity-[0.12] blur-2xl" style={{ background: accent }} />
      <div className="flex items-center justify-between">
        <span className="text-[12px] font-medium text-[var(--color-text-muted)]">{label}</span>
        <span className="flex h-9 w-9 items-center justify-center rounded-lg" style={{ background: `color-mix(in srgb, ${accent} 16%, transparent)`, color: accent }}>
          <Icon size={17} strokeWidth={1.9} />
        </span>
      </div>
      <div className="mt-3 text-2xl font-semibold tracking-tight text-[var(--color-text)]">{value ?? <Skeleton className="h-7 w-16" />}</div>
      <div className="mt-1 flex items-center justify-between text-[12px] text-[var(--color-text-muted)]">
        <span className="truncate">{sub}</span>
        {to && <ArrowRight size={14} className="shrink-0 opacity-0 transition-opacity group-hover:opacity-100" />}
      </div>
    </>
  );
  const cls = "group relative overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 transition-colors";
  return to ? <Link to={to} className={`${cls} hover:border-[var(--color-border-strong)]`}>{body}</Link> : <div className={cls}>{body}</div>;
}

const GOOD = ["Approved", "Present", "Paid", "Completed", "Submitted", "Closed", "Resolved", "Active", "Billed", "Reimbursed", "Done", "Accepted", "Joined", "Cleared", "Hired", "Filled", "Finalized"];
const WARN = ["Open", "Pending", "Draft", "Unpaid", "Half Day", "On Leave", "Work From Home", "In Progress", "In Process", "Working", "Replied", "On Hold", "Pending Review", "Pending Approval", "Sent", "Awaiting Joining", "Partly Approved", "Short Hours"];
const BAD = ["Rejected", "Absent", "Cancelled", "Overdue", "Expired", "Declined", "No-show", "Withdrawn", "Missed Punch Out"];

export function StatusPill({ status }) {
  const tone = GOOD.includes(status) ? "var(--color-green)" : WARN.includes(status) ? "var(--color-amber)" : BAD.includes(status) ? "var(--color-red-hover)" : "var(--color-text-muted)";
  return (
    <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium" style={{ background: `color-mix(in srgb, ${tone} 16%, transparent)`, color: tone }}>
      {status || "—"}
    </span>
  );
}

export function Loading() {
  return (
    <div className="flex h-28 items-center justify-center gap-2 text-[13px] text-[var(--color-text-muted)]">
      <Loader2 size={15} className="animate-spin" /> Loading…
    </div>
  );
}

export function Empty({ icon: Icon = Inbox, text = "Nothing here yet." }) {
  return (
    <div className="flex h-24 flex-col items-center justify-center gap-2 text-center text-[13px] text-[var(--color-text-muted)]">
      <Icon size={18} className="text-[var(--color-text-faint)]" />
      {text}
    </div>
  );
}

export function ErrorState({ error }) {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-[var(--color-border-strong)] bg-[var(--color-surface-2)] px-4 py-3 text-[13px] text-[var(--color-text-muted)]">
      <AlertCircle size={15} className="mt-0.5 shrink-0 text-[var(--color-amber)]" />
      {friendlyError(error)}
    </div>
  );
}

/** Renders loading / error / data for a useAsync() result. */
export function Async({ state, children }) {
  if (state.loading && !state.data) return <Loading />;
  if (state.error) return <ErrorState error={state.error} />;
  return children(state.data);
}

export function Notice({ tone = "error", children }) {
  const cls = tone === "error" ? "border-[var(--color-red-deep)] bg-[var(--color-red-wash)] text-[var(--color-red-hover)]" : "border-[var(--color-border-strong)] bg-[var(--color-surface-2)] text-[var(--color-text-muted)]";
  return <p className={`rounded-md border px-3 py-2 text-[12px] ${cls}`}>{children}</p>;
}

export function Modal({ title, onClose, children, wide = false }) {
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`max-h-[90vh] w-full overflow-y-auto rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 ${wide === "xl" ? "max-w-5xl" : wide ? "max-w-2xl" : "max-w-md"}`}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-[14px] font-semibold text-[var(--color-text)]">{title}</h2>
          <button type="button" onClick={onClose} className="text-[var(--color-text-muted)] hover:text-[var(--color-text)]"><X size={16} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Tabs({ tabs, value, onChange }) {
  return (
    <div role="tablist" className="flex gap-1 overflow-x-auto border-b border-[var(--color-border)]">
      {tabs.map((t) => (
        <button key={t.id} role="tab" aria-selected={value === t.id} type="button" onClick={() => onChange(t.id)}
          className={`-mb-px flex shrink-0 items-center gap-2 border-b-2 px-3.5 py-2 text-[13px] font-medium transition-colors ${value === t.id ? "border-[var(--color-red)] text-[var(--color-text)]" : "border-transparent text-[var(--color-text-muted)] hover:text-[var(--color-text)]"}`}>
          {t.label}
          {t.count != null && <span className="rounded-full bg-[var(--color-surface-2)] px-1.5 py-0.5 text-[10px] text-[var(--color-text-muted)]">{t.count}</span>}
        </button>
      ))}
    </div>
  );
}

export const chipCls = (active) =>
  `shrink-0 rounded-md border px-2.5 py-1 text-[12px] transition-colors ${active ? "border-[var(--color-red)] bg-[var(--color-red-wash)] text-[var(--color-text)]" : "border-[var(--color-border)] text-[var(--color-text-muted)] hover:text-[var(--color-text)]"}`;

/** The app's standard table: framed, with a shaded header row. columns: [{ key, label, render?, className? }] */
export function Grid({ columns, rows, empty = "Nothing here yet.", rowKey = (r, i) => r.name ?? i }) {
  if (!rows?.length) return <Empty text={empty} />;
  return (
    <div className="overflow-x-auto rounded-lg border border-[var(--color-border)]">
      <table className="w-full text-left text-[12.5px]">
        <thead>
          <tr className="border-b border-[var(--color-border)] bg-[var(--color-surface-2)] text-[10.5px] uppercase tracking-wide text-[var(--color-text-faint)]">
            {columns.map((c) => <th key={c.key} className={`whitespace-nowrap px-3.5 py-2.5 font-semibold ${c.className || ""}`}>{c.label}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={rowKey(r, i)} className="border-b border-[var(--color-border)] transition-colors last:border-0 hover:bg-[color-mix(in_srgb,var(--color-surface-2)_60%,transparent)]">
              {columns.map((c) => <td key={c.key} className={`px-3.5 py-2.5 align-middle text-[var(--color-text)] ${c.className || ""}`}>{c.render ? c.render(r) : r[c.key] ?? "—"}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Small square button for a row action, with its name as a tooltip. tone: "danger" | "good". */
export const iconBtnCls = (tone) =>
  `inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] transition-colors hover:border-[var(--color-border-strong)] hover:bg-[var(--color-surface-2)] ${tone === "danger" ? "text-[var(--color-text-muted)] hover:!text-[var(--color-red-hover)]" : tone === "good" ? "text-[var(--color-green)]" : "text-[var(--color-text-muted)] hover:text-[var(--color-text)]"}`;

export function KeyValue({ items }) {
  return (
    <dl className="grid grid-cols-1 gap-x-8 gap-y-3 sm:grid-cols-2">
      {items.map(([k, v]) => (
        <div key={k}>
          <dt className="text-[11px] uppercase tracking-wide text-[var(--color-text-faint)]">{k}</dt>
          <dd className="mt-0.5 text-[13px] text-[var(--color-text)]">{v || "—"}</dd>
        </div>
      ))}
    </dl>
  );
}

/* ===== EmployeeContext.jsx ===== */
const EmployeeContext = createContext(null);

/** Loads the Employee record linked to the signed-in user once for the whole portal. */
export function EmployeeProvider({ children }) {
  const { user } = useAuth();
  // The record is shared and cached (getMyEmployee); reload() fetches it fresh, e.g. after the person edits it.
  const fresh = useRef(false);
  const q = useAsync(() => { const f = fresh.current; fresh.current = false; return getMyEmployee(user.email, { fresh: f }); }, [user.email]);
  const reload = () => { fresh.current = true; q.reload(); };
  return (
    <EmployeeContext.Provider value={{ employee: q.data, loading: q.loading, error: q.error, reload }}>
      {children}
    </EmployeeContext.Provider>
  );
}

/** The signed-in person's employee record when inside the employee pages, else null (top bar search). */
export function useMaybeEmployee() {
  return useContext(EmployeeContext)?.employee || null;
}

export function useEmployee() {
  const ctx = useContext(EmployeeContext);
  if (!ctx) throw new Error("useEmployee must be used within EmployeeProvider");
  return ctx;
}

/* ===== password change ===== */
/** Change-password form. `forced` = shown right after HR's temporary password was used. */
export function ChangePasswordForm({ forced = false, onCancel }) {
  const { user, markPasswordChanged } = useAuth();
  const [f, setF] = useState({ current: "", next: "", confirm: "" });
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const set = (k) => (e) => setF((v) => ({ ...v, [k]: e.target.value }));

  async function submit(e) {
    e.preventDefault();
    setErr("");
    if (f.next.length < 8) return setErr("Use at least 8 characters.");
    if (f.next !== f.confirm) return setErr("The new passwords don't match.");
    if (f.next === f.current) return setErr("Choose a password that is different from the current one.");
    setBusy(true);
    try {
      await frappe.changePassword(f.current, f.next);
      // Make sure the app stops asking for a change: ERPNext normally records it itself.
      const recorded = async () => { try { return Boolean((await frappe.getDoc("User", user.email)).last_password_reset_date); } catch { return false; } };
      if (!(await recorded())) {
        try { await frappe.updateDoc("User", user.email, { last_password_reset_date: isoDate() }); } catch { /* not allowed */ }
        if (!(await recorded())) { try { localStorage.setItem(`pwchanged:${user.email}`, "1"); } catch { /* ignore */ } }
      }
      markPasswordChanged();
      window.location.assign(user.roles?.includes("Projects Manager") ? "/pm" : "/employee"); // fresh session + token after the password change
    } catch (x) {
      setErr(errMsg(x, "Couldn't change the password. Check your current password and try again."));
      setBusy(false);
    }
  }

  const type = show ? "text" : "password";
  return (
    <form onSubmit={submit} className="space-y-3">
      <Field label={forced ? "Temporary Password (From HR)" : "Current Password"}><input type={type} required autoComplete="current-password" className={inputCls} value={f.current} onChange={set("current")} /></Field>
      <Field label="New Password" hint="At least 8 characters. Use a mix of letters, numbers and symbols."><input type={type} required autoComplete="new-password" className={inputCls} value={f.next} onChange={set("next")} /></Field>
      <Field label="Confirm New Password"><input type={type} required autoComplete="new-password" className={inputCls} value={f.confirm} onChange={set("confirm")} /></Field>
      <label className="flex items-center gap-2 text-[12px] text-[var(--color-text-muted)]"><input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} /> Show passwords</label>
      {err && <Notice>{err}</Notice>}
      <div className="flex justify-end gap-2 pt-1">
        {onCancel && <Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button>}
        <Button type="submit" disabled={busy}>{busy ? "Saving…" : forced ? "Set Password & Continue" : "Change Password"}</Button>
      </div>
    </form>
  );
}

export function ForcedPasswordScreen() {
  const { logout } = useAuth();
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[var(--color-bg)] px-4 py-10">
      <Brand size="page" align="center" className="mb-8" />
      <div className="w-full max-w-md rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6">
        <h1 className="text-[18px] font-semibold text-[var(--color-text)]">Set Your Own Password</h1>
        <p className="mb-5 mt-1.5 text-[13px] text-[var(--color-text-muted)]">You signed in with a temporary password from HR. Choose a new one to continue.</p>
        <ChangePasswordForm forced />
      </div>
      <button type="button" onClick={logout} className="mt-5 text-[12px] text-[var(--color-text-muted)] hover:text-[var(--color-text)]">Sign Out</button>
    </div>
  );
}

/* ===== EmployeeLayout.jsx ===== */
// One section per HRMS 360 module (lib/modules.js), so an employee sees only what their company has.
export const EMPLOYEE_NAV = [
  { to: "/employee", label: "Dashboard", icon: LayoutDashboard },
  moduleSection("employee", [
    {
      label: "Time & Attendance",
      icon: CalendarCheck,
      children: [
        { to: "/employee/attendance", label: "Attendance" },
        { to: "/employee/leave", label: "Leave" },
        { to: "/employee/calendar", label: "Calendar & Holidays" },
      ],
    },
    {
      label: "Approvals & Team",
      icon: ClipboardCheck,
      children: [
        { to: "/employee/approvals", label: "My Approvals" },
        { to: "/employee/team", label: "My Team" },
      ],
    },
    {
      label: "Pay & Expenses",
      icon: Wallet,
      children: [
        { to: "/employee/payslips", label: "Payslips" },
        { to: "/employee/expenses", label: "Expense Claims" },
        { to: "/employee/benefits", label: "Benefits & Insurance" },
      ],
    },
    {
      label: "Documents & Assets",
      icon: FileText,
      children: [
        { to: "/employee/documents", label: "Policies & Documents" },
        { to: "/employee/assets", label: "My Assets" },
      ],
    },
    { to: "/employee/help", label: "Help & Requests", icon: LifeBuoy },
  ]),
  moduleSection("projects", [{ to: "/employee/timesheet", label: "Timesheet", icon: Timer }]),
  moduleSection("recruitment", []),
  moduleSection("learning", [
    { to: "/employee/goals", label: "Goals & Feedback", icon: Target },
    { to: "/employee/training", label: "Training & Learning", icon: GraduationCap },
  ]),
  coreSection("General", [
    { to: "/employee/notifications", label: "Notifications", icon: Bell },
    { to: "/employee/search", label: "Search", icon: Search },
  ], LayoutDashboard),
];

// Shown only to people on interview panels (ERPNext "Interviewer" role), in the Recruitment Cycle section.
const INTERVIEWS_NAV = { to: "/employee/interviews", label: "My Interviews", icon: ClipboardCheck };

// Reached from the account menu ("Profile & password"), so it is not repeated in the sidebar; kept here for the page title.
const PROFILE_NAV = { to: "/employee/profile", label: "My Profile" };

/** HR staff and Project Managers on their own pages: only their employee menu, with the Dashboard opening My Dashboard. */
function staffSelfNav(user) {
  return navFor(user).map((n) => (n.to === "/employee" ? { ...n, to: "/employee?view=self", end: true } : n));
}

function navFor(user) {
  if (!(user?.erpRoles || []).includes("Interviewer")) return EMPLOYEE_NAV;
  return EMPLOYEE_NAV.map((n) => (n.module === "recruitment" ? { ...n, children: [...n.children, INTERVIEWS_NAV] } : n));
}

const flat = flattenNav([...EMPLOYEE_NAV, INTERVIEWS_NAV, PROFILE_NAV]);
function titleFor(pathname) {
  const match = [...flat].sort((a, b) => b.to.length - a.to.length).find((n) => pathname === n.to || pathname.startsWith(`${n.to}/`));
  return match?.label ?? "Employee Portal";
}

function Gate() {
  const { employee, loading, error } = useEmployee();
  if (loading && !employee) return <Loading />;
  if (error) return <ErrorState error={error} />;
  if (!employee) {
    return (
      <div className="mx-auto mt-16 max-w-md rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 text-center">
        <h2 className="text-[15px] font-semibold text-[var(--color-text)]">Your Account Isn't Linked to an Employee Profile</h2>
        <p className="mt-2 text-[13px] text-[var(--color-text-muted)]">Ask HR to link your sign-in email to your employee profile, then refresh this page.</p>
      </div>
    );
  }
  return <Suspense fallback={<PageLoading />}><Outlet /></Suspense>;
}

export const CONTRACTOR_NAV = [
  { to: "/contractor", label: "My Projects", icon: Briefcase },
  { to: "/contractor/timesheet", label: "Timesheet", icon: Timer },
];

/** Contractors: only their projects and their own timesheet. */
export function ContractorLayout() {
  const { pathname } = useLocation();
  const { user } = useAuth();
  if (user?.mustChangePassword) return <ForcedPasswordScreen />;
  return (
    <EmployeeProvider>
      <div className="flex h-screen overflow-hidden bg-[var(--color-bg)]">
        <Sidebar title="Contractor" items={CONTRACTOR_NAV} />
        <div className="flex min-w-0 flex-1 flex-col">
          <Topbar roleLabel="Contractor" pageTitle={pathname.endsWith("/timesheet") ? "Timesheet" : "My Projects"} />
          <main className="flex-1 overflow-y-auto p-6">
            <div className="mx-auto max-w-6xl space-y-5">
              <Gate />
            </div>
          </main>
        </div>
      </div>
    </EmployeeProvider>
  );
}

export function EmployeeLayout() {
  const { pathname, search } = useLocation();
  const { user } = useAuth();
  if (user?.mustChangePassword) return <ForcedPasswordScreen />;
  // HR staff and Project Managers who are employees see one side at a time: their own pages (employee menu) or their
  // HR / Projects work (workspace menu), following the dashboard tab and the page they are on.
  const hr = hasPermission(user, "dashboard.hr");
  const pm = !hr && hasPermission(user, "dashboard.pm");
  const staff = isStaffEmployee(user);
  const self = staff && staffView(pathname, search) === "self";
  const asHr = hr && !self;
  const asPm = pm && !self;
  const nav = self ? staffSelfNav(user)
    : asHr ? hrNav(user, staff ? "work" : undefined) : asPm ? pmNav(user, staff ? "work" : undefined) : navFor(user);
  return (
    <EmployeeProvider>
      <div className="flex h-screen overflow-hidden bg-[var(--color-bg)]">
        <Sidebar title={asHr ? "HR Workspace" : asPm ? "Project Manager" : self ? "My Self-Service" : "Employee Portal"} items={nav} />
        <div className="flex min-w-0 flex-1 flex-col">
          <Topbar search roleLabel={asHr ? (hasPermission(user, "dashboard.admin") ? "Admin" : "HR") : asPm ? "Project Manager" : "Employee"} pageTitle={asHr ? hrTitleFor(pathname) : asPm ? pmTitleFor(pathname) : titleFor(pathname)} />
          <main className="flex-1 overflow-y-auto p-6">
            <div className="mx-auto max-w-6xl space-y-5">
              <Gate />
            </div>
          </main>
        </div>
      </div>
    </EmployeeProvider>
  );
}