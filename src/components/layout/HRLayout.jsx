import { Outlet, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  Users,
  CalendarCheck,
  CalendarDays,
  Wallet,
  UserSearch,
  ClipboardList,
  TrendingUp,
  GraduationCap,
  FileBarChart,
} from "lucide-react";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";
import { HR_SETUP_SECTIONS, slugify } from "../../lib/hrSetupConfig";

const TOP_NAV = [
  { to: "/hr", label: "Dashboard", icon: LayoutDashboard },
  { to: "/hr/employees", label: "Employees", icon: Users },
  { to: "/hr/attendance", label: "Attendance", icon: CalendarCheck },
  { to: "/hr/leave", label: "Leave", icon: CalendarDays },
  { to: "/hr/payroll", label: "Payroll", icon: Wallet },
  { to: "/hr/recruitment", label: "Recruitment", icon: UserSearch },
  { to: "/hr/onboarding", label: "Onboarding", icon: ClipboardList },
  { to: "/hr/performance", label: "Performance", icon: TrendingUp },
  { to: "/hr/training", label: "Training", icon: GraduationCap },
  { to: "/hr/reports", label: "Reports", icon: FileBarChart },
];

/** Every master/setting/report becomes its own real sidebar link, grouped for readability. */
const SETUP_GROUPS = HR_SETUP_SECTIONS.map((section) => ({
  label: section.title,
  icon: section.icon,
  children: section.items
    .filter((item) => !item.disabled)
    .map((item) => ({ to: `/hr/setup/${slugify(item.doctype)}`, label: item.label })),
}));

const NAV = [...TOP_NAV, ...SETUP_GROUPS];

/** Longest-prefix match across both top-level links and grouped children, for the topbar title. */
function titleFor(pathname) {
  const flat = [
    ...TOP_NAV,
    ...SETUP_GROUPS.flatMap((g) => g.children),
  ];
  const match = [...flat]
    .sort((a, b) => b.to.length - a.to.length)
    .find((n) => pathname === n.to || pathname.startsWith(`${n.to}/`));
  return match?.label ?? "HR";
}

export function HRLayout() {
  const { pathname } = useLocation();
  return (
    <div className="flex h-screen overflow-hidden bg-[var(--color-bg)]">
      <Sidebar title="HR Workspace" items={NAV} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar roleLabel="HR" pageTitle={titleFor(pathname)} />
        <main className="flex-1 overflow-y-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}