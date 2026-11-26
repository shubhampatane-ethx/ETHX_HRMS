// Sidebar sections. Every menu is laid out by HRMS 360 product module (lib/modules.js), so what a client has bought is
// plain to see: each module is its own headed section, and a switched-off module's section disappears entirely.
import { BriefcaseBusiness, Building2, GraduationCap, UserSearch, Users } from "lucide-react";
import { MODULES } from "../../lib/modules";

export const MODULE_ICONS = { employee: Users, recruitment: UserSearch, projects: BriefcaseBusiness, learning: GraduationCap };

/** A headed sidebar section for one product module. Its pages are filtered like any other; empty sections vanish. */
export function moduleSection(id, children) {
  const m = MODULES.find((x) => x.id === id);
  return { section: true, module: id, label: m?.label || id, icon: MODULE_ICONS[id], children: children.filter(Boolean) };
}

/** A headed section for pages every client gets (no module). */
export function coreSection(label, children, icon = Building2) {
  return { section: true, label, icon, children: children.filter(Boolean) };
}

/** Every link in a menu tree, at any depth (sections and groups flattened). */
export function flattenNav(items) {
  return (items || []).flatMap((i) => (i.children ? flattenNav(i.children) : i.to ? [i] : []));
}

/* ---------------------- staff: "My" view vs workspace view ---------------------- */

// HR staff and Project Managers are employees too. Their sidebar shows one side at a time: their own self-service
// ("self") on their own pages and My Dashboard, or their HR / Projects work ("work") on work pages and the HR or
// Projects Dashboard. The dashboard tab they picked last is remembered for shared pages (search, notifications, profile).
export const VIEW_KEY = "ethx.dashboard.view";
const SHARED_PAGES = ["/employee/search", "/employee/notifications", "/employee/profile"];

export function savedView() {
  try { return localStorage.getItem(VIEW_KEY); } catch { return null; }
}

/** "self" or "work" for a staff member on this page. */
export function staffView(pathname, search = "") {
  if (pathname !== "/employee" && !pathname.startsWith("/employee/")) return "work";
  const saved = savedView();
  if (pathname === "/employee") return (new URLSearchParams(search).get("view") || saved || "self") === "self" ? "self" : "work";
  if (SHARED_PAGES.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return saved && saved !== "self" ? "work" : "self";
  return "self";
}

/** The sidebar link that flips a staff member between their own pages and their workspace. */
export function switchLink(to, label) {
  return { to, label, switch: true };
}
