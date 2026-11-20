import { Suspense } from "react";
import { PageLoading } from "../PageLoading";
import { Outlet, useLocation } from "react-router-dom";
import { LayoutDashboard, Users, Building2, ListChecks, ShieldCheck, ScrollText, Briefcase, ClipboardList, SlidersHorizontal, Mail, Boxes } from "lucide-react";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";
import { useClientScope } from "../../lib/clientScope";
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
    { to: "/admin/project-roles", label: "Project Roles" },
    { to: "/pm/approvals", label: "Timesheet Approvals" },
    { to: "/pm/leave-approvals", label: "Leave Approvals" },
    { to: "/pm/resources", label: "Resources" },
    { to: "/pm/timesheets", label: "Team Timesheets" },
    { to: "/pm/requisitions", label: "Hiring Requests" },
  ],
};

export const ADMIN_NAV = [
  { to: "/admin", label: "Dashboard", icon: LayoutDashboard },
  { to: "/admin/modules", label: "Modules & People", icon: Boxes },
  { to: "/admin/users", label: "Users", icon: Users },
  { to: "/admin/organization", label: "Organization", icon: Building2 },
  { to: "/admin/roles", label: "Roles & Permissions", icon: ShieldCheck },
  { to: "/admin/access-control", label: "Access Control", icon: ListChecks },
  { to: "/admin/communication", label: "Communication", icon: Mail },
  { to: "/admin/settings", label: "Settings", icon: SlidersHorizontal },
  { to: "/admin/audit-logs", label: "Audit Logs", icon: ScrollText },
  HR_WORKSPACE,
  PM_WORKSPACE,
];

const TITLES = {
  "/admin": "Dashboard",
  "/admin/users": "Users",
  "/admin/organization": "Organization",
  "/admin/roles": "Roles & Permissions",
  "/admin/access-control": "Access Control",
  "/admin/settings": "Settings",
  "/admin/communication": "Communication",
  "/admin/modules": "Modules & People",
  "/admin/audit-logs": "Audit Logs",
  "/admin/employees": "All Employees",
  "/admin/project-managers": "Project Managers",
  "/admin/project-roles": "Project Roles",
};

export function AdminLayout() {
  const client = useClientScope(); // the super admin's client; switching reloads the page for that client
  const { pathname } = useLocation();
  return (
    <div className="flex h-screen overflow-hidden bg-[var(--color-bg)]">
      <Sidebar title="Platform Admin" items={ADMIN_NAV} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar roleLabel="Admin" pageTitle={TITLES[pathname] ?? "Admin"} />
        <main className="flex-1 overflow-y-auto p-6">
          <Suspense key={client || "all"} fallback={<PageLoading />}><Outlet /></Suspense>
        </main>
      </div>
    </div>
  );
}