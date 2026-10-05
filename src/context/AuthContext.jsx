import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { frappe } from "../lib/api/frappeClient";
import { effectiveRolesForUser, rolesToPermissions } from "../permissions/roles";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null); // { email, roles, permissions }
  const [status, setStatus] = useState("loading"); // loading | authenticated | guest

  const loadSession = useCallback(async () => {
    setStatus("loading");
    try {
      const email = await frappe.getLoggedUser();
      if (!email || email === "Guest") {
        setUser(null);
        setStatus("guest");
        return;
      }
      const roles = effectiveRolesForUser(email);
      setUser({ email, roles, permissions: rolesToPermissions(roles) });
      setStatus("authenticated");
    } catch {
      setUser(null);
      setStatus("guest");
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
      await loadSession();
    },
    [loadSession]
  );

  const logout = useCallback(async () => {
    await frappe.logout();
    setUser(null);
    setStatus("guest");
  }, []);

  return (
    <AuthContext.Provider value={{ user, status, login, logout, refresh: loadSession }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
