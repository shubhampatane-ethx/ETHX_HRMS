import { lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { PageLoading } from "./components/PageLoading";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { BrandingProvider } from "./context/BrandingContext";
import { DialogHost } from "./components/ui/dialogs";
import { PunchReminder } from "./components/employee/PunchReminder";
import { AutoSetup } from "./components/AutoSetup";
import { RequireAuth, RequirePermission } from "./permissions/guards";
import { homePath, isStaffEmployee } from "./permissions/roles";

import Login from "./pages/Login";
import Unauthorized from "./pages/Unauthorized";

import { AdminLayout } from "./components/layout/AdminLayout";
import { PMLayout } from "./components/layout/PMLayout";
const PMAssignments = lazy(() => import("./pages/pm/PMPages").then((m) => ({ default: m.PMAssignments })));
const PMDashboard = lazy(() => import("./pages/pm/PMPages").then((m) => ({ default: m.PMDashboard })));
const PMProjects = lazy(() => import("./pages/pm/PMPages").then((m) => ({ default: m.PMProjects })));
const ProjectManagers = lazy(() => import("./pages/admin/ProjectManagers"));
const ProjectRoles = lazy(() => import("./pages/admin/ProjectRoles"));
const AccessControl = lazy(() => import("./pages/admin/PageAccess"));
const PMApprovals = lazy(() => import("./pages/pm/PMApprovals"));
const PMLeaveApprovals = lazy(() => import("./pages/pm/PMLeaveApprovals"));
const MyTeam = lazy(() => import("./pages/shared/MyTeam"));
const Resources = lazy(() => import("./pages/shared/Resources"));
const Lifecycle = lazy(() => import("./pages/hr/Lifecycle"));
const AdminDashboard = lazy(() => import("./pages/admin/Dashboard"));
const AdminUsers = lazy(() => import("./pages/admin/UsersHub"));
const Organization = lazy(() => import("./pages/admin/Organization"));
const Roles = lazy(() => import("./pages/admin/Roles"));
const Settings = lazy(() => import("./pages/admin/Settings"));
const Communication = lazy(() => import("./pages/admin/Communication"));
const Integrations = lazy(() => import("./pages/admin/Integrations"));
const Analytics = lazy(() => import("./pages/hr/Analytics"));
const HrReports = lazy(() => import("./pages/hr/Reports"));
const Companies = lazy(() => import("./pages/admin/Companies"));
const AuditLogs = lazy(() => import("./pages/admin/AuditLogs"));

import { ContractorLayout, EmployeeLayout } from "./components/employee/EmployeeShell";
const ContractorProjects = lazy(() => import("./pages/contractor/ContractorProjects"));

const EmpDashboard = lazy(() => import("./pages/employee/EmployeePages").then((m) => ({ default: m.EmpDashboard })));
const EmpProfile = lazy(() => import("./pages/employee/EmployeePages").then((m) => ({ default: m.EmpProfile })));
const EmpAttendance = lazy(() => import("./pages/employee/EmployeePages").then((m) => ({ default: m.EmpAttendance })));
const EmpLeave = lazy(() => import("./pages/employee/EmployeePages").then((m) => ({ default: m.EmpLeave })));
const EmpApprovals = lazy(() => import("./pages/employee/EmployeePages").then((m) => ({ default: m.EmpApprovals })));
const EmpCalendar = lazy(() => import("./pages/employee/EmployeePages").then((m) => ({ default: m.EmpCalendar })));
const EmpTimesheet = lazy(() => import("./pages/employee/EmployeePages").then((m) => ({ default: m.EmpTimesheet })));
const EmpExpenses = lazy(() => import("./pages/employee/EmployeePages").then((m) => ({ default: m.EmpExpenses })));
const EmpPayslips = lazy(() => import("./pages/employee/EmployeePages").then((m) => ({ default: m.EmpPayslips })));
const EmpDocuments = lazy(() => import("./pages/employee/EmployeePages").then((m) => ({ default: m.EmpDocuments })));
const EmpAssets = lazy(() => import("./pages/employee/EmployeePages").then((m) => ({ default: m.EmpAssets })));
const EmpHelp = lazy(() => import("./pages/employee/EmployeePages").then((m) => ({ default: m.EmpHelp })));
const EmpNotifications = lazy(() => import("./pages/employee/EmployeePages").then((m) => ({ default: m.EmpNotifications })));
const EmpGoals = lazy(() => import("./pages/employee/EmployeePages").then((m) => ({ default: m.EmpGoals })));
const EmpTraining = lazy(() => import("./pages/employee/EmployeePages").then((m) => ({ default: m.EmpTraining })));
const EmpBenefits = lazy(() => import("./pages/employee/EmployeePages").then((m) => ({ default: m.EmpBenefits })));
const EmpSearch = lazy(() => import("./pages/employee/EmployeePages").then((m) => ({ default: m.EmpSearch })));

import { HRLayout } from "./components/layout/HRLayout";
const HRDashboard = lazy(() => import("./pages/hr/Dashboard"));
const Employees = lazy(() => import("./pages/hr/Employees"));
const Attendance = lazy(() => import("./pages/hr/Attendance"));
const Leave = lazy(() => import("./pages/hr/Leave"));
const ExpenseClaims = lazy(() => import("./pages/hr/ExpenseClaims"));
const AttendanceRequests = lazy(() => import("./pages/hr/AttendanceRequests"));
const EmployeeAdvances = lazy(() => import("./pages/hr/AdvanceTravel").then((m) => ({ default: m.EmployeeAdvances })));
const TravelRequests = lazy(() => import("./pages/hr/AdvanceTravel").then((m) => ({ default: m.TravelRequests })));
const Payroll = lazy(() => import("./pages/hr/Payroll"));
const Timesheets = lazy(() => import("./pages/hr/Timesheets"));
const RecruitmentOverview = lazy(() => import("./pages/hr/recruitment/Overview"));
const Requisitions = lazy(() => import("./pages/hr/recruitment/Requisitions"));
const Openings = lazy(() => import("./pages/hr/recruitment/Openings"));
const Board = lazy(() => import("./pages/hr/recruitment/Board"));
const Candidates = lazy(() => import("./pages/hr/recruitment/Candidates"));
const TalentSearch = lazy(() => import("./pages/hr/recruitment/TalentSearch"));
const CandidateProfile = lazy(() => import("./pages/hr/recruitment/CandidateProfile"));
const Interviews = lazy(() => import("./pages/hr/recruitment/Interviews"));
const Offers = lazy(() => import("./pages/hr/recruitment/Offers"));
const RecruitmentReports = lazy(() => import("./pages/hr/recruitment/RecruitmentReports"));
const RecruitmentSetup = lazy(() => import("./pages/hr/recruitment/RecruitmentSetup"));
const MyInterviews = lazy(() => import("./pages/hr/recruitment/MyInterviews"));
const Onboarding = lazy(() => import("./pages/hr/Onboarding"));
const Performance = lazy(() => import("./pages/hr/Performance"));
const Training = lazy(() => import("./pages/hr/Training"));
const DoctypeView = lazy(() => import("./pages/hr/DoctypeView"));
const Policies = lazy(() => import("./pages/hr/Policies"));
const Assets = lazy(() => import("./pages/hr/Assets"));
const Offices = lazy(() => import("./pages/hr/Offices"));
const EmployeeGroups = lazy(() => import("./pages/hr/EmployeeGroups"));
const LeaveTypes = lazy(() => import("./pages/hr/LeaveTypes"));
const EmployeeRequests = lazy(() => import("./pages/hr/EmployeeRequests"));
const Announcements = lazy(() => import("./pages/hr/Announcements"));

export default function App() {
  return (
    <AuthProvider>
      <BrandingProvider>
      <DialogHost />
      <PunchReminder />
      <AutoSetup />
      <Suspense fallback={<PageLoading full />}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/unauthorized" element={<Unauthorized />} />

        <Route element={<RequireAuth />}>
          <Route path="/" element={<HomeRedirect />} />

          <Route element={<RequirePermission permission="dashboard.admin" />}>
            <Route path="/admin" element={<AdminLayout />}>
              <Route index element={<AdminDashboard />} />
              <Route path="users" element={<AdminUsers />} />
              <Route path="employees" element={<Employees />} />
              <Route path="project-managers" element={<ProjectManagers />} />
              <Route path="project-roles" element={<ProjectRoles />} />
              <Route path="access-control" element={<AccessControl />} />
              <Route path="organization" element={<Organization />} />
              <Route path="roles" element={<Roles />} />
              <Route path="settings" element={<Settings />} />
              <Route path="communication" element={<Communication />} />
              <Route path="integrations" element={<Integrations />} />
              <Route path="modules" element={<Companies />} />
              <Route path="companies" element={<Navigate to="/admin/modules" replace />} />
              <Route path="audit-logs" element={<AuditLogs />} />
              <Route path="setup" element={<Navigate to="/admin/roles" replace />} />
            </Route>
          </Route>

          <Route element={<RequirePermission permission="dashboard.pm" />}>
            <Route path="/pm" element={<PMLayout />}>
              <Route index element={<StaffHome><PMDashboard /></StaffHome>} />
              <Route path="projects" element={<PMProjects />} />
              <Route path="assignments" element={<PMAssignments />} />
              <Route path="timesheets" element={<Timesheets readOnly />} />
              <Route path="approvals" element={<PMApprovals />} />
              <Route path="leave-approvals" element={<PMLeaveApprovals />} />
              <Route path="team" element={<MyTeam />} />
              <Route path="resources" element={<Resources />} />
              <Route path="requisitions" element={<Requisitions mine />} />
              <Route path="interviews" element={<MyInterviews />} />
            </Route>
          </Route>

          <Route element={<RequirePermission permission="dashboard.contractor" />}>
            <Route path="/contractor" element={<ContractorLayout />}>
              <Route index element={<ContractorProjects />} />
              <Route path="timesheet" element={<EmpTimesheet />} />
            </Route>
          </Route>

          <Route element={<RequirePermission permission="dashboard.employee" />}>
            <Route path="/employee" element={<EmployeeLayout />}>
              <Route index element={<EmpDashboard />} />
              <Route path="profile" element={<EmpProfile />} />
              <Route path="attendance" element={<EmpAttendance />} />
              <Route path="leave" element={<EmpLeave />} />
              <Route path="approvals" element={<EmpApprovals />} />
              <Route path="calendar" element={<EmpCalendar />} />
              <Route path="timesheet" element={<EmpTimesheet />} />
              <Route path="expenses" element={<EmpExpenses />} />
              <Route path="payslips" element={<EmpPayslips />} />
              <Route path="documents" element={<EmpDocuments />} />
              <Route path="assets" element={<EmpAssets />} />
              <Route path="help" element={<EmpHelp />} />
              <Route path="notifications" element={<EmpNotifications />} />
              <Route path="goals" element={<EmpGoals />} />
              <Route path="training" element={<EmpTraining />} />
              <Route path="benefits" element={<EmpBenefits />} />
              <Route path="search" element={<EmpSearch />} />
              <Route path="interviews" element={<MyInterviews />} />
              <Route path="team" element={<MyTeam />} />
            </Route>
          </Route>

          <Route path="/hr" element={<HRLayout />}>
            <Route element={<RequirePermission permission="dashboard.hr" />}>
              <Route index element={<StaffHome><HRDashboard /></StaffHome>} />
              <Route path="employees" element={<Employees />} />
              <Route path="lifecycle" element={<Lifecycle />} />
              <Route path="resources" element={<div className="space-y-5"><Resources /></div>} />
              <Route path="attendance" element={<Attendance />} />
              <Route path="timesheets" element={<Timesheets />} />
              <Route path="leave" element={<Leave />} />
              <Route path="expenses" element={<ExpenseClaims />} />
              <Route path="policies" element={<Policies />} />
              <Route path="assets" element={<Assets />} />
              <Route path="requests" element={<EmployeeRequests />} />
              <Route path="announcements" element={<Announcements />} />
              <Route path="offices" element={<Offices />} />
              <Route path="employee-groups" element={<EmployeeGroups />} />
              <Route path="leave-types" element={<LeaveTypes />} />
              <Route path="setup/expense-claim" element={<ExpenseClaims />} />
              <Route path="setup/attendance-request" element={<AttendanceRequests />} />
              <Route path="setup/employee-advance" element={<EmployeeAdvances />} />
              <Route path="setup/travel-request" element={<TravelRequests />} />
              <Route path="payroll" element={<Payroll />} />
              <Route path="recruitment" element={<RecruitmentOverview />} />
              <Route path="recruitment/requisitions" element={<Requisitions />} />
              <Route path="recruitment/openings" element={<Openings />} />
              <Route path="recruitment/openings/:opening" element={<Board />} />
              <Route path="recruitment/candidates" element={<Candidates />} />
              <Route path="recruitment/search" element={<TalentSearch />} />
              <Route path="recruitment/candidates/:id" element={<CandidateProfile />} />
              <Route path="recruitment/interviews" element={<Interviews />} />
              <Route path="recruitment/my-interviews" element={<MyInterviews />} />
              <Route path="recruitment/offers" element={<Offers />} />
              <Route path="recruitment/reports" element={<RecruitmentReports />} />
              <Route path="recruitment/setup" element={<RecruitmentSetup />} />
              <Route path="onboarding" element={<Onboarding />} />
              <Route path="performance" element={<Performance />} />
              <Route path="analytics" element={<Analytics />} />
              <Route path="reports" element={<HrReports />} />
              <Route path="training" element={<Training />} />
              <Route path="setup/:doctype" element={<DoctypeView />} />
            </Route>
          </Route>
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      </Suspense>
      </BrandingProvider>
    </AuthProvider>
  );
}

/** Sends a freshly logged-in user to the layout that matches their ERPNext role. */
function HomeRedirect() {
  const { user } = useAuth();
  const home = homePath(user);
  return <Navigate to={home === "/" ? "/unauthorized" : home} replace />;
}

/** HR / PM staff who are also employees have one dashboard: the combined one at /employee. */
function StaffHome({ children }) {
  const { user } = useAuth();
  return isStaffEmployee(user) ? <Navigate to="/employee" replace /> : children;
}