import { Navigate, Outlet, useLocation } from "react-router-dom";
import { PageLoading } from "../components/PageLoading";
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

/** While the session loads: the workspace layout in placeholder blocks, not a blank screen (BUG-007). */
function FullScreenLoader() {
  return <PageLoading full />;
}
