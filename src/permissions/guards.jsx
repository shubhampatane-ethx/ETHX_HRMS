import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { hasPermission } from "./roles";

export function RequireAuth() {
  const { status } = useAuth();
  const location = useLocation();

  if (status === "loading") return <FullScreenLoader />;
  if (status === "guest") return <Navigate to="/login" state={{ from: location }} replace />;
  return <Outlet />;
}

export function RequirePermission({ permission }) {
  const { user } = useAuth();
  if (!hasPermission(user, permission)) {
    return <Navigate to="/unauthorized" replace />;
  }
  return <Outlet />;
}

function FullScreenLoader() {
  return (
    <div className="flex h-screen items-center justify-center bg-[var(--color-bg)]">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-[var(--color-border-strong)] border-t-[var(--color-red)]" />
    </div>
  );
}
