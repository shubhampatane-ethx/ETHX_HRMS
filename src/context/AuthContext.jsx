import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { frappe } from "../lib/api/frappeClient";
import { setClientScope, storedClient } from "../lib/clientScope";
import { SUPER_ADMIN } from "../lib/modules";
import { ADMIN_USERNAME, appRolesFor, effectiveRolesForUser, rolesToPermissions } from "../permissions/roles";

const AuthContext = createContext(null);

/**
 * Administrator, or any user with ERPNext's System Manager role -> Admin workspace. A user holding an HR role -> HR workspace.
 * A user with the Projects Manager role -> Project Manager workspace. A user whose only relevant role is "Employee" -> Employee portal; if they have never
 * set their own password (HR gave them a temporary one) they must change it first.
 * Anything we can't read or recognise gets no workspace ("Not authorized").
 */
async function resolveAccount(email) {
  if (email === ADMIN_USERNAME) return { roles: effectiveRolesForUser(email), mustChangePassword: false, erpRoles: ["Administrator", "System Manager"] };
  try {
    const doc = await frappe.getDoc("User", email);
    let erpRoles = (doc.roles || []).map((r) => r.role);
    // The roles table is a protected (level 1) field, so non-HR users usually get it back empty when reading their
    // own User record - which used to drop Project Managers and employees into the HR workspace. Ask ERPNext directly.
    if (!erpRoles.length) {
      try {
        const res = await frappe.client.get("/method/frappe.core.doctype.user.user.get_roles", { params: { uid: email } });
        erpRoles = (res.data?.message || []).filter((r) => !["All", "Guest", "Desk User"].includes(r));
      } catch {
        /* keep the empty list - falls through to the legacy default below */
      }
    }
    // erpRoles keeps the real ERPNext roles (HR Manager vs HR User, Interviewer...) for finer checks such as approvals.
    // A System Manager is a platform admin (Admin workspace, which also opens the HR and PM workspaces) - not HR.
    // HR users created from Admin › Users only get HR Manager / HR User, so they stay in the HR workspace.
    if (erpRoles.includes("System Manager")) return { roles: ["System Manager"], mustChangePassword: false, erpRoles };
    const roles = appRolesFor(erpRoles);
    if (roles.includes("HR User")) return { roles, mustChangePassword: false, erpRoles };
    if (roles.length) {
      // Admin gave them a temporary password: they must set their own first
      let flagged = false;
      try { flagged = localStorage.getItem(`pwchanged:${email}`) === "1"; } catch { /* ignore */ }
      return { roles, mustChangePassword: !doc.last_password_reset_date && !flagged, erpRoles };
    }
  } catch {
    /* fall through to the legacy default */
  }
  // Deny by default: an account with no recognised role (or whose roles can't be read) gets no workspace and
  // lands on "Not authorized" - it used to fall through to the HR workspace.
  return { roles: [], mustChangePassword: false, erpRoles: [] };
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null); // { email, roles, permissions }
  const [status, setStatus] = useState("loading"); // loading | authenticated | guest

  // Resolves with the signed-in user ({ email, roles, permissions }) or null for guests.
  const loadSession = useCallback(async () => {
    setStatus("loading");
    try {
      const email = await frappe.getLoggedUser();
      if (!email || email === "Guest") {
        setClientScope(null);
      setUser(null);
        setStatus("guest");
        return null;
      }
      // Session survived a page refresh but the in-memory CSRF token didn't - fetch it now
      // (non-blocking) so the first save doesn't have to wait for it.
      frappe.refreshCsrfToken();
      const { roles, mustChangePassword, erpRoles = [] } = await resolveAccount(email);
      let userImage = "";
      let fullName = "";
      try {
        const doc = await frappe.getDoc("User", email);
        userImage = doc.user_image || "";
        fullName = doc.full_name || [doc.first_name, doc.last_name].filter(Boolean).join(" ");
      } catch {
        // A missing profile image or name must not prevent an otherwise valid login.
      }
      // Pages the Administrator has blocked for this person. Before setup has run there are none.
      // and the product modules the person's company doesn't have (Admin › Modules & People). Before setup has run, everything is on.
      const [deniedPages, modules] = await Promise.all([
        frappe.callMethod("ethx_my_page_access").catch(() => []),
        frappe.callMethod("ethx_modules").catch(() => null),
      ]);
      const disabledModules = Array.isArray(modules?.disabled) ? modules.disabled : [];
      const nextUser = { email, fullName, roles, erpRoles, permissions: rolesToPermissions(roles), mustChangePassword, userImage, deniedPages: Array.isArray(deniedPages) ? deniedPages : [], disabledModules };
      // The super admin works on one client at a time (lib/clientScope.js); everyone else is scoped by ERPNext.
      setClientScope(email === SUPER_ADMIN ? storedClient() : null);
      setUser(nextUser);
      setStatus("authenticated");
      return nextUser;
    } catch {
      setClientScope(null);
      setUser(null);
      setStatus("guest");
      return null;
    }
  }, []);

  useEffect(() => {
    loadSession();
    const onUnauthorized = () => {
      setClientScope(null);
      setUser(null);
      setStatus("guest");
    };
    window.addEventListener("frappe:unauthorized", onUnauthorized);
    return () => window.removeEventListener("frappe:unauthorized", onUnauthorized);
  }, [loadSession]);

  const login = useCallback(
    async (usr, pwd) => {
      await frappe.login(usr, pwd);
      return loadSession();
    },
    [loadSession]
  );

  const logout = useCallback(async () => {
    try {
      await frappe.logout();
    } catch {
      /* even if the server call fails, sign the user out of this app */
    } finally {
      setClientScope(null);
      setUser(null);
      setStatus("guest");
    }
  }, []);

  const markPasswordChanged = useCallback(() => setUser((u) => (u ? { ...u, mustChangePassword: false } : u)), []);
  const setProfileImage = useCallback((userImage) => setUser((u) => (u ? { ...u, userImage } : u)), []);

  return (
    <AuthContext.Provider value={{ user, status, login, logout, refresh: loadSession, markPasswordChanged, setProfileImage }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}