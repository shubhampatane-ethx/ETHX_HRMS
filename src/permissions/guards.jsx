import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { hasPermission, homePath } from "./roles";
import { isPageBlocked } from "./pageAccess";

export function RequireAuth() {
  const { status, user } = useAuth();
  const location = useLocation();

  if (status === "loading") return <FullScreenLoader />;
  if (status === "guest") return <Navigate to="/login" state={{ from: location }} replace />;
  if (isPageBlocked(user, location.pathname)) return <BackHome />;
  return <Outlet />;
}

/**
 * A page this person can't open: straight back to their own dashboard, never a "Not authorized" screen. Only an
 * account with no workspace at all (no HR, Project Manager or Employee role) has nowhere to go and gets that notice.
 */
function BackHome() {
  const { user } = useAuth();
  const { pathname } = useLocation();
  const home = homePath(user);
  if (home === "/") return <Navigate to="/unauthorized" replace />;
  // Already on the dashboard (it can't be blocked, but never loop): show it.
  if (pathname === home) return <Outlet />;
  return <Navigate to={home} replace />;
}

export function RequirePermission({ permission }) {
  const { user } = useAuth();
  if (!hasPermission(user, permission)) return <BackHome />;
  return <Outlet />;
}

function FullScreenLoader() {
  return (
    <div className="flex h-screen items-center justify-center bg-[var(--color-bg)]">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-[var(--color-border-strong)] border-t-[var(--color-red)]" />
    </div>
  );
}
