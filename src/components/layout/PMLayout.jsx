import { Suspense } from "react";
import { PageLoading } from "../PageLoading";
import { Outlet, useLocation } from "react-router-dom";
import { ArrowLeft, Briefcase, CalendarCheck, CheckCheck, Gauge, Users, ClipboardCheck, ClipboardList, Timer, UserPlus } from "lucide-react";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";
import { useClientScope } from "../../lib/clientScope";
import { useAuth } from "../../context/AuthContext";
import { hasPermission, isStaffEmployee } from "../../permissions/roles";
import { dashboardLink, SELF_SERVICE, SELF_SERVICE_PAGES } from "./HRLayout";
import { ForcedPasswordScreen } from "../employee/EmployeeShell";

const TITLES = {
  "/employee": "Dashboard",
  "/pm": "Dashboard",
  "/pm/projects": "Projects",
  "/pm/assignments": "Assignments",
  "/pm/timesheets": "Team Timesheets",
  "/pm/approvals": "Timesheet Approvals",
  "/pm/leave-approvals": "Leave & Expense Approvals",
  "/pm/resources": "Resources",
  "/pm/team": "My Team",
  "/pm/requisitions": "Hiring Requests",
  "/pm/interviews": "My Interviews",
};

/** Top bar title for PM pages and for the person's own self-service pages shown in the PM workspace. */
export function pmTitleFor(pathname) {
  if (TITLES[pathname]) return TITLES[pathname];
  const own = [...SELF_SERVICE_PAGES, { to: "/employee/profile", label: "My Profile" }, { to: "/employee/search", label: "Search" }, { to: "/employee/interviews", label: "My Interviews" }]
    .sort((a, b) => b.to.length - a.to.length).find((n) => pathname === n.to || pathname.startsWith(`${n.to}/`));
  return own?.label ?? "Project Manager";
}

/** PM sidebar: the one Dashboard, the person's own self-service (when they are an employee too), then PM work. */
export function pmNav(user) {
  // "My Team" is already a PM page, so it is not repeated in the self-service group.
  const selfService = { ...SELF_SERVICE, children: SELF_SERVICE.children.filter((c) => c.to !== "/employee/team") };
  return [
    ...(hasPermission(user, "dashboard.admin") ? [{ to: "/admin", label: "Back to Admin", icon: ArrowLeft }] : []),
    dashboardLink(user, "/pm"),
    ...(isStaffEmployee(user) ? [selfService] : []),
    { to: "/pm/projects", label: "Projects", icon: Briefcase },
    { to: "/pm/assignments", label: "Assignments", icon: ClipboardList },
    { to: "/pm/approvals", label: "Timesheet Approvals", icon: CheckCheck },
    { to: "/pm/leave-approvals", label: "Leave Approvals", icon: CalendarCheck },
    { to: "/pm/resources", label: "Resources", icon: Gauge },
    { to: "/pm/team", label: "My Team", icon: Users },
    { to: "/pm/timesheets", label: "Team Timesheets", icon: Timer },
    { to: "/pm/requisitions", label: "Hiring Requests", icon: UserPlus },
    { to: "/pm/interviews", label: "My Interviews", icon: ClipboardCheck },
  ];
}

/** Project Manager workspace: projects, who is assigned to what (role + ETA), and the team's timesheets. */
export function PMLayout() {
  const client = useClientScope(); // the super admin's client; switching reloads the page for that client
  const { pathname } = useLocation();
  const { user } = useAuth();
  if (user?.mustChangePassword) return <ForcedPasswordScreen />;
  const items = pmNav(user);

  return (
    <div className="flex h-screen overflow-hidden bg-[var(--color-bg)]">
      <Sidebar title="Project Manager" items={items} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar roleLabel="Project Manager" pageTitle={pmTitleFor(pathname)} />
        <main className="flex-1 overflow-y-auto p-6">
          <div className="mx-auto max-w-6xl space-y-5">
            <Suspense key={client || "all"} fallback={<PageLoading />}><Outlet /></Suspense>
          </div>
        </main>
      </div>
    </div>
  );
}