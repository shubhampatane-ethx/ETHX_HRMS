// Which pages the Administrator has blocked for a person. This limits the app: what a role can reach in ERPNext itself
// is still decided by that role's permissions. Admins are never limited.
import { hasPermission } from "./roles";

// Pages that other pages sit underneath: blocking one must not block everything below it.
const EXACT_ONLY = new Set(["/employee", "/hr", "/pm", "/contractor", "/hr/recruitment"]);
// Where people land after signing in; these can't be blocked.
export const ALWAYS_ALLOWED = new Set(["/employee", "/hr", "/pm", "/contractor"]);

export function isPageBlocked(user, pathname) {
  if (!user?.deniedPages?.length || hasPermission(user, "dashboard.admin")) return false;
  return user.deniedPages.some((page) => !ALWAYS_ALLOWED.has(page) && (pathname === page || (!EXACT_ONLY.has(page) && pathname.startsWith(`${page}/`))));
}

/** A sidebar menu without the person's blocked pages; groups left empty disappear. */
export function visibleNav(user, items) {
  return items
    .map((item) => (item.children ? { ...item, children: visibleNav(user, item.children) } : item))
    .filter((item) => (item.children ? item.children.length > 0 : !isPageBlocked(user, item.to)));
}
