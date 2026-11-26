import { Suspense } from "react";
import { PageLoading } from "../PageLoading";
import { Outlet, useLocation } from "react-router-dom";
import { LayoutDashboard, Users, Building2, ListChecks, ShieldCheck, ScrollText, Briefcase, SlidersHorizontal, Mail, Boxes, Plug } from "lucide-react";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";
import { useClientScope } from "../../lib/clientScope";
import { hrSections, hrSetupGroups } from "./HRLayout";
import { coreSection } from "./navSections";
import { PRODUCT_NAME } from "../../lib/modules";

// Every HRMS 360 module as its own group (the pages open in the HR or Project workspace, with a "Back to Admin" link).
// The super admin always has every module; a client sees only the sections of the modules they have.
const EXTRA = {
  employee: [{ to: "/pm/leave-approvals", label: "Leave Approvals (PM)" }],
  recruitment: [{ to: "/pm/requisitions", label: "Hiring Requests (PM)" }],
  projects: [
    { to: "/pm", label: "PM Dashboard", end: true },
    { to: "/pm/projects", label: "Projects" },
    { to: "/pm/assignments", label: "Assignments" },
    { to: "/admin/project-roles", label: "Project Roles" },
    { to: "/pm/approvals", label: "Timesheet Approvals" },
    { to: "/pm/timesheets", label: "Team Timesheets" },
  ],
};
const MODULE_GROUPS = hrSections().map((sec) => ({
  label: sec.label,
  icon: sec.icon,
  children: sec.module === "projects" ? [...EXTRA.projects, ...sec.children.map((c) => (c.to === "/hr/timesheets" ? { ...c, label: "All Timesheets" } : c))] : [...sec.children, ...(EXTRA[sec.module] || [])],
}));

export const ADMIN_NAV = [
  { to: "/admin", label: "Dashboard", icon: LayoutDashboard },
  coreSection("Administration", [
    { to: "/admin/modules", label: "Modules & People", icon: Boxes },
    { to: "/admin/users", label: "Users", icon: Users },
    { to: "/admin/organization", label: "Organization", icon: Building2 },
    { to: "/admin/roles", label: "Roles & Permissions", icon: ShieldCheck },
    { to: "/admin/access-control", label: "Access Control", icon: ListChecks },
    { to: "/admin/communication", label: "Communication", icon: Mail },
    { to: "/admin/integrations", label: "Integrations", icon: Plug },
    { to: "/admin/settings", label: "Settings", icon: SlidersHorizontal },
    { to: "/admin/audit-logs", label: "Audit Logs", icon: ScrollText },
  ], ShieldCheck),
  coreSection(`${PRODUCT_NAME} Modules`, [
    { to: "/hr", label: "HR Dashboard", icon: Briefcase },
    ...MODULE_GROUPS,
    ...hrSetupGroups(true),
  ], Boxes),
];

const TITLES = {
  "/admin": "Dashboard",
  "/admin/users": "Users",
  "/admin/organization": "Organization",
  "/admin/roles": "Roles & Permissions",
  "/admin/access-control": "Access Control",
  "/admin/settings": "Settings",
  "/admin/communication": "Communication",
  "/admin/integrations": "Integrations",
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