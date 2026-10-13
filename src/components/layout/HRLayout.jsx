import { Outlet, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  Users,
  CalendarCheck,
  CalendarDays,
  Timer,
  Wallet,
  UserSearch,
  ClipboardList,
  TrendingUp,
  GraduationCap,
  FileBarChart,
  Settings as SettingsIcon,
  ArrowLeft,
} from "lucide-react";
import { useMemo } from "react";
import { Sidebar } from "./Sidebar";
import { useAuth } from "../../context/AuthContext";
import { hasPermission } from "../../permissions/roles";
import { Topbar } from "./Topbar";
import { HR_SETUP_SECTIONS, slugify } from "../../lib/hrSetupConfig";

export const TOP_NAV = [
  { to: "/hr", label: "Dashboard", icon: LayoutDashboard },
  { to: "/hr/employees", label: "Employees", icon: Users },
  { to: "/hr/attendance", label: "Attendance", icon: CalendarCheck },
  { to: "/hr/timesheets", label: "Timesheets", icon: Timer },
  { to: "/hr/leave", label: "Leave", icon: CalendarDays },
  { to: "/hr/payroll", label: "Payroll", icon: Wallet },
  { to: "/hr/recruitment", label: "Recruitment", icon: UserSearch },
  { to: "/hr/onboarding", label: "Onboarding", icon: ClipboardList },
  { to: "/hr/performance", label: "Performance", icon: TrendingUp },
  { to: "/hr/training", label: "Training", icon: GraduationCap },
  { to: "/hr/reports", label: "Reports", icon: FileBarChart },
];

/** Every master/setting/report is still its own real link, but they all live under one "Settings" menu. */
export function hrSetupGroups(isAdmin = false) {
  return HR_SETUP_SECTIONS.map((section) => ({
    // the config already has a group called "Settings"; rename it so it doesn't read "Settings > Settings"
    label: section.title === "Settings" ? "HR & Payroll Settings" : section.title,
    icon: section.icon,
    children: section.items
      .filter((item) => !item.disabled && (isAdmin || !item.adminOnly))
      .map((item) => ({ to: `/hr/setup/${slugify(item.doctype)}`, label: item.label })),
  }));
}

/** Longest-prefix match across both top-level links and grouped children, for the topbar title. */
function titleFor(pathname) {
  const flat = [
    ...TOP_NAV,
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
    ...TOP_NAV,
    { label: "Settings", icon: SettingsIcon, children: hrSetupGroups(isAdmin) },
  ], [isAdmin]);
  return (
    <div className="flex h-screen overflow-hidden bg-[var(--color-bg)]">
      <Sidebar title={isAdmin ? "HR Workspace (Admin)" : "HR Workspace"} items={nav} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar roleLabel={isAdmin ? "Admin" : "HR"} pageTitle={titleFor(pathname)} />
        <main className="flex-1 overflow-y-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}