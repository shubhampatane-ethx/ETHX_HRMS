import { Outlet, useLocation } from "react-router-dom";
import { PageLoading } from "../PageLoading";
import { ArrowLeft, Briefcase, CalendarCheck, FileBarChart2, LayoutDashboard, Settings2, TrendingUp, UserRound, Users, UserSearch, Wallet } from "lucide-react";
import { useMemo, Suspense } from "react";
import { Sidebar } from "./Sidebar";
import { useAuth } from "../../context/AuthContext";
import { hasPermission, isStaffEmployee } from "../../permissions/roles";
import { Topbar } from "./Topbar";
import { useClientScope } from "../../lib/clientScope";
import { HR_SETUP_SECTIONS, slugify } from "../../lib/hrSetupConfig";

// A setup page or report from the HR setup config, by its doctype (its own page if it has one).
const SETUP_ITEMS = HR_SETUP_SECTIONS.flatMap((s) => s.items);
const setupLink = (doctype, label) => {
  const item = SETUP_ITEMS.find((i) => i.doctype === doctype);
  return item && !item.disabled ? { to: item.to || `/hr/setup/${slugify(doctype)}`, label: label || item.label, adminOnly: item.adminOnly } : null;
};

// The HR menu: a handful of areas, each opening to its pages.
export const TOP_NAV = [
  { to: "/hr", label: "Dashboard", icon: LayoutDashboard },
  {
    label: "People",
    icon: Users,
    children: [
      { to: "/hr/employees", label: "Employees" },
      { to: "/hr/lifecycle", label: "Lifecycle" },
      { to: "/hr/resources", label: "Resources" },
      { to: "/hr/assets", label: "Asset Management" },
      { to: "/hr/requests", label: "Employee Requests" },
      { to: "/hr/announcements", label: "Announcements" },
      { to: "/hr/communication", label: "Birthday & Event Emails" },
      { to: "/hr/policies", label: "Policies & Documents" },
    ],
  },
  {
    label: "Time & Leave",
    icon: CalendarCheck,
    children: [
      { to: "/hr/attendance", label: "Attendance" },
      setupLink("Attendance Request"),
      { to: "/hr/timesheets", label: "Timesheets" },
      { to: "/hr/leave", label: "Leave" },
      setupLink("Compensatory Leave Request", "Compensatory Leave"),
    ].filter(Boolean),
  },
  {
    label: "Expenses & Payroll",
    icon: Wallet,
    children: [
      { to: "/hr/expenses", label: "Expense Claims" },
      setupLink("Employee Advance"),
      setupLink("Travel Request"),
      { to: "/hr/payroll", label: "Payroll" },
    ].filter(Boolean),
  },
  {
    label: "Recruitment",
    icon: UserSearch,
    children: [
      { to: "/hr/recruitment", label: "Overview", end: true },
      { to: "/hr/recruitment/requisitions", label: "Requisitions" },
      { to: "/hr/recruitment/openings", label: "Openings & Pipeline" },
      { to: "/hr/recruitment/candidates", label: "Candidates" },
      { to: "/hr/recruitment/search", label: "Talent Search" },
      { to: "/hr/recruitment/interviews", label: "Interviews" },
      { to: "/hr/recruitment/my-interviews", label: "My Interviews" },
      { to: "/hr/recruitment/offers", label: "Offers" },
      { to: "/hr/recruitment/reports", label: "Reports" },
      { to: "/hr/recruitment/setup", label: "Setup & Retention" },
    ],
  },
  {
    label: "Talent & Growth",
    icon: TrendingUp,
    children: [
      { to: "/hr/onboarding", label: "Onboarding" },
      { to: "/hr/performance", label: "Performance" },
      { to: "/hr/training", label: "Training" },
    ],
  },
];

// HR staff are employees too: their own self-service pages (the /employee routes) sit in the HR
// sidebar as one group, so they work from a single workspace instead of switching to the portal.
// The pages used most are listed directly; the rest sit under "More" to keep the menu short.
const SELF_SERVICE_MAIN = [
  { to: "/employee/attendance", label: "My Attendance" },
  { to: "/employee/leave", label: "My Leave" },
  { to: "/employee/timesheet", label: "My Timesheet" },
  { to: "/employee/approvals", label: "My Approvals" },
  { to: "/employee/team", label: "My Team" },
  { to: "/employee/payslips", label: "My Payslips" },
  { to: "/employee/expenses", label: "My Expense Claims" },
];
const SELF_SERVICE_MORE = [
  { to: "/employee/calendar", label: "Calendar & Holidays" },
  { to: "/employee/documents", label: "My Documents" },
  { to: "/employee/assets", label: "My Assets" },
  { to: "/employee/help", label: "Help & Requests" },
  { to: "/employee/benefits", label: "My Benefits" },
  { to: "/employee/goals", label: "My Goals & Feedback" },
  { to: "/employee/training", label: "My Training" },
  { to: "/employee/notifications", label: "Notifications" },
];
/** Every self-service page, flat (page titles, and workspaces that build their own group). */
export const SELF_SERVICE_PAGES = [...SELF_SERVICE_MAIN, ...SELF_SERVICE_MORE];
export const SELF_SERVICE = {
  label: "My Self-Service",
  icon: UserRound,
  children: [...SELF_SERVICE_MAIN, { label: "More", children: SELF_SERVICE_MORE }],
};

// Pages reached outside the sidebar, listed only so the top bar shows the right title.
const HIDDEN_PAGES = [
  { to: "/employee", label: "Dashboard" },
  { to: "/employee/profile", label: "My Profile" },
  { to: "/employee/search", label: "Search" },
  { to: "/employee/interviews", label: "My Interviews" },
];

/** The one Dashboard link: staff who are also employees get the combined dashboard (/employee). */
export function dashboardLink(user, workspaceHome) {
  return { to: isStaffEmployee(user) ? "/employee" : workspaceHome, label: "Dashboard", icon: LayoutDashboard };
}

/** HR sidebar: Dashboard first, then the person's own self-service (when they have an employee login), then HR work. */
export function hrNav(user) {
  const isAdmin = hasPermission(user, "dashboard.admin");
  const rest = TOP_NAV.slice(1);
  return [
    ...(isAdmin ? [{ to: "/admin", label: "Back to Admin", icon: ArrowLeft }] : []),
    dashboardLink(user, "/hr"),
    ...(isStaffEmployee(user) ? [SELF_SERVICE] : []),
    // HR staff made manager of a project (project-based role).
    ...(!isAdmin && hasPermission(user, "dashboard.pm") ? [{ label: "My Projects", icon: Briefcase, children: [{ to: "/pm/projects", label: "Projects" }, { to: "/pm/assignments", label: "Assignments" }, { to: "/pm/approvals", label: "Timesheet Approvals" }, { to: "/pm/timesheets", label: "Team Timesheets" }] }] : []),
    ...rest,
    ...hrSetupGroups(isAdmin),
  ];
}

/**
 * The last two menu areas: Reports (every report page) and Setup (masters and settings, in one list). Work pages
 * that live in the setup config (attendance requests, advances, travel) sit under their areas in TOP_NAV instead.
 */
export function hrSetupGroups(isAdmin = false) {
  const reports = HR_SETUP_SECTIONS.filter((s) => /Reports/.test(s.title)).flatMap((s) => s.items).filter((i) => !i.disabled).map((i) => setupLink(i.doctype));
  const setup = [
    setupLink("Company"),
    setupLink("Branch", "Office Locations"),
    setupLink("Department", "Departments"),
    setupLink("Designation", "Designations"),
    setupLink("Employee Group", "Employee Groups"),
    setupLink("Employee Grade", "Employee Grades"),
    setupLink("Employee Checkin", "Employee Checkins"),
    setupLink("HR Settings"),
    setupLink("Payroll Settings"),
    setupLink("Daily Work Summary Group", "Daily Work Summary Groups"),
  ].filter((i) => i && (isAdmin || !i.adminOnly));
  const clean = (list) => list.filter(Boolean).map(({ to, label }) => ({ to, label }));
  return [
    // Analytics & MIS and the HR Reports page first, then ERPNext's report pages.
    { label: "Reports", icon: FileBarChart2, children: [{ to: "/hr/analytics", label: "Analytics & MIS" }, { to: "/hr/reports", label: "HR Reports" }, ...clean(reports)] },
    { label: "Setup", icon: Settings2, children: clean(setup) },
  ];
}

/** Longest-prefix match across both top-level links and grouped children, for the topbar title. */
export function hrTitleFor(pathname) {
  const flat = [
    ...TOP_NAV.flatMap((n) => (n.children ? n.children : [n])),
    ...SELF_SERVICE_PAGES,
    ...HIDDEN_PAGES,
    ...hrSetupGroups(true).flatMap((g) => g.children),
    // Setup pages reachable from elsewhere (e.g. the expense claim setup page) still get their title.
    ...SETUP_ITEMS.filter((i) => i.doctype).map((i) => ({ to: i.to || `/hr/setup/${slugify(i.doctype)}`, label: i.label })),
  ];
  const match = [...flat]
    .sort((a, b) => b.to.length - a.to.length)
    .find((n) => pathname === n.to || pathname.startsWith(`${n.to}/`));
  return match?.label ?? "HR";
}

export function HRLayout() {
  const client = useClientScope(); // the super admin's client; switching reloads the page for that client
  const { pathname } = useLocation();
  const { user } = useAuth();
  const isAdmin = hasPermission(user, "dashboard.admin");
  // Administrator can open every HR page too, with a way back to the admin workspace
  const nav = useMemo(() => hrNav(user), [user]);
  return (
    <div className="flex h-screen overflow-hidden bg-[var(--color-bg)]">
      <Sidebar title={isAdmin ? "HR Workspace (Admin)" : "HR Workspace"} items={nav} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar roleLabel={isAdmin ? "Admin" : "HR"} pageTitle={hrTitleFor(pathname)} />
        <main className="flex-1 overflow-y-auto p-6">
          <Suspense key={client || "all"} fallback={<PageLoading />}><Outlet /></Suspense>
        </main>
      </div>
    </div>
  );
}