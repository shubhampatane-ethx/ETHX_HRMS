import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { frappe } from "../lib/api/frappeClient";
import { ADMIN_USERNAME, effectiveRolesForUser, rolesToPermissions } from "../permissions/roles";

const AuthContext = createContext(null);

/**
 * Administrator -> Admin workspace. A user holding an HR role -> HR workspace.
 * A user with the Projects Manager role -> Project Manager workspace. A user whose only relevant role is "Employee" -> Employee portal; if they have never
 * set their own password (HR gave them a temporary one) they must change it first.
 * Anything we can't read or recognise keeps the previous behaviour (HR).
 */
async function resolveAccount(email) {
  if (email === ADMIN_USERNAME) return { roles: effectiveRolesForUser(email), mustChangePassword: false };
  try {
    const doc = await frappe.getDoc("User", email);
    const erpRoles = (doc.roles || []).map((r) => r.role);
    if (erpRoles.some((r) => r === "HR Manager" || r === "HR User")) return { roles: ["HR User"], mustChangePassword: false };
    const isPm = erpRoles.includes("Projects Manager");
    if (isPm || erpRoles.includes("Employee")) {
      // Admin gave them a temporary password: they must set their own first
      let flagged = false;
      try { flagged = localStorage.getItem(`pwchanged:${email}`) === "1"; } catch { /* ignore */ }
      const roles = [...(isPm ? ["Projects Manager"] : []), ...(erpRoles.includes("Employee") ? ["Employee"] : [])];
      return { roles, mustChangePassword: !doc.last_password_reset_date && !flagged };
    }
  } catch {
    /* fall through to the legacy default */
  }
  return { roles: effectiveRolesForUser(email), mustChangePassword: false };
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
        setUser(null);
        setStatus("guest");
        return null;
      }
      // Session survived a page refresh but the in-memory CSRF token didn't - fetch it now
      // (non-blocking) so the first save doesn't have to wait for it.
      frappe.refreshCsrfToken();
      const { roles, mustChangePassword } = await resolveAccount(email);
      const nextUser = { email, roles, permissions: rolesToPermissions(roles), mustChangePassword };
      setUser(nextUser);
      setStatus("authenticated");
      return nextUser;
    } catch {
      setUser(null);
      setStatus("guest");
      return null;
    }
  }, []);

  useEffect(() => {
    loadSession();
    const onUnauthorized = () => {
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
      setUser(null);
      setStatus("guest");
    }
  }, []);

  const markPasswordChanged = useCallback(() => setUser((u) => (u ? { ...u, mustChangePassword: false } : u)), []);

  return (
    <AuthContext.Provider value={{ user, status, login, logout, refresh: loadSession, markPasswordChanged }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}