import { Suspense } from "react";
import { PageLoading } from "../PageLoading";
import { Outlet, useLocation } from "react-router-dom";
import { LayoutDashboard, Users, UserCog, Building2, SlidersHorizontal, ShieldCheck, ScrollText, Briefcase, ClipboardList, Wrench } from "lucide-react";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";
import { TOP_NAV, hrSetupGroups } from "./HRLayout";

// Everything HR can do, reachable from here (opens in the HR workspace with a "Back to Admin" link)
const HR_WORKSPACE = {
  label: "HR Workspace",
  icon: Briefcase,
  children: [
    ...TOP_NAV.map(({ to, label, children }) => (children ? { label, children } : { to, label: label === "Dashboard" ? "HR Dashboard" : label })),
    ...hrSetupGroups(true),
  ],
};

const PM_WORKSPACE = {
  label: "Project Workspace",
  icon: ClipboardList,
  children: [
    { to: "/pm", label: "PM Dashboard" },
    { to: "/pm/projects", label: "Projects" },
    { to: "/pm/assignments", label: "Assignments" },
    { to: "/pm/approvals", label: "Timesheet Approvals" },
    { to: "/pm/resources", label: "Resources" },
    { to: "/pm/timesheets", label: "Team Timesheets" },
    { to: "/pm/requisitions", label: "Hiring Requests" },
  ],
};

const NAV = [
  { to: "/admin", label: "Dashboard", icon: LayoutDashboard },
  { to: "/admin/users", label: "HR Users", icon: UserCog },
  { to: "/admin/employees", label: "All Employees", icon: Users },
  { to: "/admin/project-managers", label: "Project Managers", icon: ClipboardList },
  { to: "/admin/organization", label: "Organization", icon: Building2 },
  { to: "/admin/roles", label: "Roles & Permissions", icon: ShieldCheck },
  { to: "/admin/settings", label: "Settings", icon: SlidersHorizontal },
  { to: "/admin/audit-logs", label: "Audit Logs", icon: ScrollText },
  { to: "/admin/setup", label: "ERPNext Setup", icon: Wrench },
  HR_WORKSPACE,
  PM_WORKSPACE,
];

const TITLES = {
  "/admin": "Dashboard",
  "/admin/users": "HR Users",
  "/admin/employees": "All Employees",
  "/admin/project-managers": "Project Managers",
  "/admin/organization": "Organization",
  "/admin/roles": "Roles & Permissions",
  "/admin/settings": "Settings",
  "/admin/audit-logs": "Audit Logs",
  "/admin/setup": "ERPNext Setup",
};

export function AdminLayout() {
  const { pathname } = useLocation();
  return (
    <div className="flex h-screen overflow-hidden bg-[var(--color-bg)]">
      <Sidebar title="Platform Admin" items={NAV} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar roleLabel="Admin" pageTitle={TITLES[pathname] ?? "Admin"} />
        <main className="flex-1 overflow-y-auto p-6">
          <Suspense fallback={<PageLoading />}><Outlet /></Suspense>
        </main>
      </div>
    </div>
  );
}