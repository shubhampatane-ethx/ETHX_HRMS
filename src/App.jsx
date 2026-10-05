import { Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { RequireAuth, RequirePermission } from "./permissions/guards";
import { primaryAppRole } from "./permissions/roles";

import Login from "./pages/Login";
import Unauthorized from "./pages/Unauthorized";

import { AdminLayout } from "./components/layout/AdminLayout";
import AdminDashboard from "./pages/admin/Dashboard";
import AdminUsers from "./pages/admin/Users";
import Organization from "./pages/admin/Organization";
import Roles from "./pages/admin/Roles";
import Settings from "./pages/admin/Settings";
import AuditLogs from "./pages/admin/AuditLogs";

import { HRLayout } from "./components/layout/HRLayout";
import HRDashboard from "./pages/hr/Dashboard";
import Employees from "./pages/hr/Employees";
import Attendance from "./pages/hr/Attendance";
import Leave from "./pages/hr/Leave";
import Payroll from "./pages/hr/Payroll";
import Recruitment from "./pages/hr/Recruitment";
import Onboarding from "./pages/hr/Onboarding";
import Performance from "./pages/hr/Performance";
import Training from "./pages/hr/Training";
import Reports from "./pages/hr/Reports";
import DoctypeView from "./pages/hr/DoctypeView";

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/unauthorized" element={<Unauthorized />} />

        <Route element={<RequireAuth />}>
          <Route path="/" element={<HomeRedirect />} />

          <Route element={<RequirePermission permission="dashboard.admin" />}>
            <Route path="/admin" element={<AdminLayout />}>
              <Route index element={<AdminDashboard />} />
              <Route path="users" element={<AdminUsers />} />
              <Route path="organization" element={<Organization />} />
              <Route path="roles" element={<Roles />} />
              <Route path="settings" element={<Settings />} />
              <Route path="audit-logs" element={<AuditLogs />} />
            </Route>
          </Route>

          <Route path="/hr" element={<HRLayout />}>
            <Route element={<RequirePermission permission="dashboard.hr" />}>
              <Route index element={<HRDashboard />} />
              <Route path="employees" element={<Employees />} />
              <Route path="attendance" element={<Attendance />} />
              <Route path="leave" element={<Leave />} />
              <Route path="payroll" element={<Payroll />} />
              <Route path="recruitment" element={<Recruitment />} />
              <Route path="onboarding" element={<Onboarding />} />
              <Route path="performance" element={<Performance />} />
              <Route path="training" element={<Training />} />
              <Route path="reports" element={<Reports />} />
              <Route path="setup/:doctype" element={<DoctypeView />} />
            </Route>
          </Route>
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AuthProvider>
  );
}

/** Sends a freshly logged-in user to the layout that matches their ERPNext role. */
function HomeRedirect() {
  const { user } = useAuth();
  const role = primaryAppRole(user?.roles);
  if (role === "admin") return <Navigate to="/admin" replace />;
  if (role === "hr") return <Navigate to="/hr" replace />;
  return <Navigate to="/unauthorized" replace />;
}
