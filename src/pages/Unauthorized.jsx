import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { primaryAppRole } from "../permissions/roles";

export default function Unauthorized() {
  const { user, logout } = useAuth();
  const noWorkspace = user && !primaryAppRole(user.roles);
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-[var(--color-bg)] px-4 text-center">
      <div className="h-2.5 w-2.5 rounded-[2px] bg-[var(--color-red)]" />
      <h1 className="text-[15px] font-semibold text-[var(--color-text)]">Not authorized</h1>
      <p className="max-w-sm text-[13px] text-[var(--color-text-muted)]">
        {noWorkspace
          ? `${user.email} isn't set up for ETHX HRMS yet - it has no HR, Project Manager or Employee role. Ask your administrator to assign the right access.`
          : "Your account doesn't have access to this section. Contact your admin if you think this is wrong."}
      </p>
      <div className="flex items-center gap-4">
        {!noWorkspace && <Link to="/" className="text-[13px] text-[var(--color-red-hover)] hover:underline">Back to dashboard</Link>}
        {user && <button type="button" onClick={logout} className="text-[13px] text-[var(--color-text-muted)] hover:text-[var(--color-text)]">Sign out</button>}
      </div>
    </div>
  );
}
