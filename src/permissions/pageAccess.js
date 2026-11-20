// Which pages the Administrator has blocked for a person. This limits the app: what a role can reach in ERPNext itself
// is still decided by that role's permissions. Admins are never limited.
import { hasPermission } from "./roles";
import { isModuleOff, SUPER_ADMIN } from "../lib/modules";

// Pages that other pages sit underneath: blocking one must not block everything below it.
const EXACT_ONLY = new Set(["/employee", "/hr", "/pm", "/contractor", "/hr/recruitment"]);
// Where people land after signing in; these can't be blocked.
// Support and client management, for the Administrator account alone.
const SUPER_ADMIN_PAGES = ["/admin/companies", "/admin/modules"];
export const ALWAYS_ALLOWED = new Set(["/employee", "/hr", "/pm", "/contractor"]);

export function isPageBlocked(user, pathname) {
  // Only the super admin (the Administrator account) manages companies and their modules - not other admins.
  if (SUPER_ADMIN_PAGES.some((p) => pathname === p || pathname.startsWith(`${p}/`)) && user?.email !== SUPER_ADMIN) return true;
  // Modules the person's company doesn't have are hidden, admins included. The Administrator always has every module.
  if (isModuleOff(user, pathname)) return true;
  if (!user?.deniedPages?.length || hasPermission(user, "dashboard.admin")) return false;
  return user.deniedPages.some((page) => !ALWAYS_ALLOWED.has(page) && (pathname === page || (!EXACT_ONLY.has(page) && pathname.startsWith(`${page}/`))));
}

/** A sidebar menu without the person's blocked pages; groups left empty disappear. */
export function visibleNav(user, items) {
  return items
    .map((item) => (item.children ? { ...item, children: visibleNav(user, item.children) } : item))
    .filter((item) => (item.children ? item.children.length > 0 : !isPageBlocked(user, item.to)));
}
