import { Outlet, useLocation } from "react-router-dom";
import { PageLoading } from "../PageLoading";
import {
  LayoutDashboard,
  Briefcase,
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
} from "lucide-react";
import { useMemo, Suspense } from "react";
import { Sidebar } from "./Sidebar";
import { useAuth } from "../../context/AuthContext";
import { hasPermission } from "../../permissions/roles";
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

// Section titles that would clash with the main menu items of the same name
const SETUP_LABELS = { Settings: "HR & Payroll Settings", Leaves: "Leave Setup", Attendance: "Attendance Setup", "Expense Claim": "Expense Setup" };

/** Every master/setting/report is its own link, grouped by area, and sits directly in the sidebar. */
export function hrSetupGroups(isAdmin = false) {
  return HR_SETUP_SECTIONS.map((section) => ({
    label: SETUP_LABELS[section.title] || section.title,
    icon: section.icon,
    children: section.items
      .filter((item) => !item.disabled && (isAdmin || !item.adminOnly))
      .map((item) => ({ to: `/hr/setup/${slugify(item.doctype)}`, label: item.label })),
  }));
}

/** Longest-prefix match across both top-level links and grouped children, for the topbar title. */
function titleFor(pathname) {
  const flat = [
    ...TOP_NAV.flatMap((n) => (n.children ? n.children : [n])),
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
  const nav = useMemo(() => [
    ...(isAdmin ? [{ to: "/admin", label: "Back to Admin", icon: ArrowLeft }] : []),
    ...(hasPermission(user, "dashboard.employee") ? [{ to: "/employee", label: "My Employee Portal", icon: Briefcase }] : []),
    ...TOP_NAV,
    ...hrSetupGroups(isAdmin),
  ], [isAdmin, user]);
  return (
    <div className="flex h-screen overflow-hidden bg-[var(--color-bg)]">
      <Sidebar title={isAdmin ? "HR Workspace (Admin)" : "HR Workspace"} items={nav} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar roleLabel={isAdmin ? "Admin" : "HR"} pageTitle={titleFor(pathname)} />
        <main className="flex-1 overflow-y-auto p-6">
          <Suspense fallback={<PageLoading />}><Outlet /></Suspense>
        </main>
      </div>
    </div>
  );
}