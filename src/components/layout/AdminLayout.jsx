import { Outlet, useLocation } from "react-router-dom";
import { LayoutDashboard, Users, Building2, SlidersHorizontal, ShieldCheck, ScrollText } from "lucide-react";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";

const NAV = [
  { to: "/admin", label: "Dashboard", icon: LayoutDashboard },
  { to: "/admin/users", label: "HR Users", icon: Users },
  { to: "/admin/organization", label: "Organization", icon: Building2 },
  { to: "/admin/roles", label: "Roles & Permissions", icon: ShieldCheck },
  { to: "/admin/settings", label: "Settings", icon: SlidersHorizontal },
  { to: "/admin/audit-logs", label: "Audit Logs", icon: ScrollText },
];

const TITLES = {
  "/admin": "Dashboard",
  "/admin/users": "HR Users",
  "/admin/organization": "Organization",
  "/admin/roles": "Roles & Permissions",
  "/admin/settings": "Settings",
  "/admin/audit-logs": "Audit Logs",
};

export function AdminLayout() {
  const { pathname } = useLocation();
  return (
    <div className="flex h-screen overflow-hidden bg-[var(--color-bg)]">
      <Sidebar title="Platform Admin" items={NAV} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar roleLabel="Admin" pageTitle={TITLES[pathname] ?? "Admin"} />
        <main className="flex-1 overflow-y-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}