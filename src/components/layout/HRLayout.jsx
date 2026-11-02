import { Outlet, useLocation } from "react-router-dom";
import { PageLoading } from "../PageLoading";
import {
  LayoutDashboard,
  Briefcase,
  UserRound,
  Users,
  CalendarCheck,
  CalendarDays,
  Timer,
  Wallet,
  UserSearch,
  ArrowLeft,
  ArrowRightLeft,
  Gauge,
  Receipt,
  FileText,
  Laptop,
  LifeBuoy,
} from "lucide-react";
import { useMemo, Suspense } from "react";
import { Sidebar } from "./Sidebar";
import { useAuth } from "../../context/AuthContext";
import { hasPermission, isStaffEmployee } from "../../permissions/roles";
import { Topbar } from "./Topbar";
import { HR_SETUP_SECTIONS, slugify } from "../../lib/hrSetupConfig";

export const TOP_NAV = [
  { to: "/hr", label: "Dashboard", icon: LayoutDashboard },
  { to: "/hr/employees", label: "Employees", icon: Users },
  { to: "/hr/lifecycle", label: "Lifecycle", icon: ArrowRightLeft },
  { to: "/hr/resources", label: "Resources", icon: Gauge },
  { to: "/hr/attendance", label: "Attendance", icon: CalendarCheck },
  { to: "/hr/timesheets", label: "Timesheets", icon: Timer },
  { to: "/hr/leave", label: "Leave", icon: CalendarDays },
  { to: "/hr/expenses", label: "Expense Claims", icon: Receipt },
  { to: "/hr/policies", label: "Policies & Documents", icon: FileText },
  { to: "/hr/assets", label: "Asset Management", icon: Laptop },
  { to: "/hr/requests", label: "Employee Requests", icon: LifeBuoy },
  { to: "/hr/payroll", label: "Payroll", icon: Wallet },
  {
    label: "Recruitment",
    icon: UserSearch,
    children: [
      { to: "/hr/recruitment", label: "Overview", end: true },
      { to: "/hr/recruitment/requisitions", label: "Requisitions" },
      { to: "/hr/recruitment/openings", label: "Openings & Pipeline" },
      { to: "/hr/recruitment/candidates", label: "Candidates" },
      { to: "/hr/recruitment/interviews", label: "Interviews" },
      { to: "/hr/recruitment/my-interviews", label: "My Interviews" },
      { to: "/hr/recruitment/offers", label: "Offers" },
      { to: "/hr/recruitment/reports", label: "Reports" },
      { to: "/hr/recruitment/setup", label: "Setup & Retention" },
      { to: "/hr/onboarding", label: "Onboarding" },
      { to: "/hr/performance", label: "Performance" },
      { to: "/hr/training", label: "Training" },
    ],
  },
];

// HR staff are employees too: their own self-service pages (the /employee routes) sit in the HR
// sidebar as one group, so they work from a single workspace instead of switching to the portal.
export const SELF_SERVICE = {
  label: "My Self-Service",
  icon: UserRound,
  children: [
    { to: "/employee/attendance", label: "My Attendance" },
    { to: "/employee/leave", label: "My Leave" },
    { to: "/employee/timesheet", label: "My Timesheet" },
    { to: "/employee/calendar", label: "Calendar & Holidays" },
    { to: "/employee/approvals", label: "My Approvals" },
    { to: "/employee/team", label: "My Team" },
    { to: "/employee/payslips", label: "My Payslips" },
    { to: "/employee/expenses", label: "My Expense Claims" },
    { to: "/employee/benefits", label: "My Benefits" },
    { to: "/employee/goals", label: "My Goals & Feedback" },
    { to: "/employee/training", label: "My Training" },
    { to: "/employee/documents", label: "My Documents" },
    { to: "/employee/assets", label: "My Assets" },
    { to: "/employee/help", label: "Help & Requests" },
    { to: "/employee/notifications", label: "Notifications" },
  ],
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

// Section titles that would clash with the main menu items of the same name
const SETUP_LABELS = { Settings: "HR & Payroll Settings", Leaves: "Leave Setup", Attendance: "Attendance Setup", "Expense Claim": "Expense Setup" };

/** Every master/setting/report is its own link, grouped by area, and sits directly in the sidebar. */
export function hrSetupGroups(isAdmin = false) {
  return HR_SETUP_SECTIONS.map((section) => ({
    label: SETUP_LABELS[section.title] || section.title,
    icon: section.icon,
    children: section.items
      .filter((item) => !item.disabled && (isAdmin || !item.adminOnly))
      .map((item) => ({ to: item.to || `/hr/setup/${slugify(item.doctype)}`, label: item.label })),
  }));
}

/** Longest-prefix match across both top-level links and grouped children, for the topbar title. */
export function hrTitleFor(pathname) {
  const flat = [
    ...TOP_NAV.flatMap((n) => (n.children ? n.children : [n])),
    ...SELF_SERVICE.children,
    ...HIDDEN_PAGES,
    ...hrSetupGroups(true).flatMap((g) => g.children),
  ];
  const match = [...flat]
    .sort((a, b) => b.to.length - a.to.length)
    .find((n) => pathname === n.to || pathname.startsWith(`${n.to}/`));
  return match?.label ?? "HR";
}

export function HRLayout() {
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
          <Suspense fallback={<PageLoading />}><Outlet /></Suspense>
        </main>
      </div>
    </div>
  );
}