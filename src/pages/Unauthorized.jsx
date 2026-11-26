import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { homePath, primaryAppRole } from "../permissions/roles";

export default function Unauthorized() {
  const { user, logout } = useAuth();
  const noWorkspace = user && !primaryAppRole(user.roles);
  // Anyone with a workspace goes straight to their dashboard; this notice is only for accounts with no role at all.
  if (!noWorkspace) return <Navigate to={user ? homePath(user) : "/login"} replace />;
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-[var(--color-bg)] px-4 text-center">
      <div className="h-2.5 w-2.5 rounded-[2px] bg-[var(--color-red)]" />
      <h1 className="text-[15px] font-semibold text-[var(--color-text)]">Account Not Set Up</h1>
      <p className="max-w-sm text-[13px] text-[var(--color-text-muted)]">
        {user.email} isn't set up for HRMS 360 yet - it has no HR, Project Manager or Employee role. Ask your administrator to assign the right access.
      </p>
      <div className="flex items-center gap-4">
        <button type="button" onClick={logout} className="text-[13px] text-[var(--color-text-muted)] hover:text-[var(--color-text)]">Sign Out</button>
      </div>
    </div>
  );
}
