import { Suspense } from "react";
import { PageLoading } from "../PageLoading";
import { Outlet, useLocation } from "react-router-dom";
import { ArrowLeft, Briefcase, CalendarCheck, CheckCheck, Gauge, Users, ClipboardCheck, ClipboardList, LayoutDashboard, Timer, UserPlus, UserRound } from "lucide-react";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";
import { useAuth } from "../../context/AuthContext";
import { hasPermission } from "../../permissions/roles";
import { ForcedPasswordScreen } from "../employee/EmployeeShell";

const TITLES = {
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

/** Project Manager workspace: projects, who is assigned to what (role + ETA), and the team's timesheets. */
export function PMLayout() {
  const { pathname } = useLocation();
  const { user } = useAuth();
  if (user?.mustChangePassword) return <ForcedPasswordScreen />;

  const items = [
    ...(hasPermission(user, "dashboard.admin") ? [{ to: "/admin", label: "Back to Admin", icon: ArrowLeft }] : []),
    { to: "/pm", label: "Dashboard", icon: LayoutDashboard },
    { to: "/pm/projects", label: "Projects", icon: Briefcase },
    { to: "/pm/assignments", label: "Assignments", icon: ClipboardList },
    { to: "/pm/approvals", label: "Timesheet Approvals", icon: CheckCheck },
    { to: "/pm/leave-approvals", label: "Leave Approvals", icon: CalendarCheck },
    { to: "/pm/resources", label: "Resources", icon: Gauge },
    { to: "/pm/team", label: "My Team", icon: Users },
    { to: "/pm/timesheets", label: "Team Timesheets", icon: Timer },
    { to: "/pm/requisitions", label: "Hiring Requests", icon: UserPlus },
    { to: "/pm/interviews", label: "My Interviews", icon: ClipboardCheck },
    ...(hasPermission(user, "dashboard.employee") ? [{ to: "/employee", label: "My Employee Portal", icon: UserRound }] : []),
  ];

  return (
    <div className="flex h-screen overflow-hidden bg-[var(--color-bg)]">
      <Sidebar title="Project Manager" items={items} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar roleLabel="Project Manager" pageTitle={TITLES[pathname] ?? "Project Manager"} />
        <main className="flex-1 overflow-y-auto p-6">
          <div className="mx-auto max-w-6xl space-y-5">
            <Suspense fallback={<PageLoading />}><Outlet /></Suspense>
          </div>
        </main>
      </div>
    </div>
  );
}