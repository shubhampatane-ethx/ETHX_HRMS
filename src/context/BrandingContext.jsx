import { createContext, useContext, useEffect, useState } from "react";
import { useAuth } from "./AuthContext";
import { frappe } from "../lib/api/frappeClient";
import { getMyEmployee } from "../lib/employeePortal";
import { applySavedTheme, hasSavedTheme, saveTheme, THEME_OPTIONS } from "../lib/theme";

const BrandingContext = createContext({ company: null, loading: true, refresh: () => {}, selectCompany: () => {} });
const SELECTED_COMPANY_KEY = "hrms-branding-company";
const LOGO_CACHE_KEY = "hrms-branding-logo";
const COMPANY_NAME_CACHE_KEY = "hrms-branding-name";

function readStorage(key) {
  try { return localStorage.getItem(key) || ""; } catch { return ""; }
}

export function getCachedBrandLogo() {
  return readStorage(LOGO_CACHE_KEY);
}

export function getCachedBrandName() {
  return readStorage(COMPANY_NAME_CACHE_KEY);
}

export function getSelectedBrandCompany() {
  return readStorage(SELECTED_COMPANY_KEY);
}

export function cacheBranding(company) {
  try {
    if (company?.company_logo) localStorage.setItem(LOGO_CACHE_KEY, company.company_logo);
    else localStorage.removeItem(LOGO_CACHE_KEY);
    if (company?.company_name) localStorage.setItem(COMPANY_NAME_CACHE_KEY, company.company_name);
    else localStorage.removeItem(COMPANY_NAME_CACHE_KEY);
  } catch {
    // The Company record remains the source of truth when local caching is unavailable.
  }
}

export function setSelectedBrandCompany(name) {
  try { localStorage.setItem(SELECTED_COMPANY_KEY, name); } catch { /* current-session selection is still applied */ }
}

async function resolveCompany(user, selectedCompany) {
  if (!user) return null;
  const roles = user.roles || [];
  const isAdmin = roles.includes("System Manager");
  let companyName = isAdmin ? selectedCompany || readStorage(SELECTED_COMPANY_KEY) : "";

  if (!companyName && (roles.includes("Employee") || roles.includes("Contractor"))) {
    const employee = await getMyEmployee(user.email).catch(() => null);
    companyName = employee?.company || "";
  }

  if (!companyName) {
    const permissions = await frappe.getList("User Permission", {
      filters: [["user", "=", user.email], ["allow", "=", "Company"]],
      fields: ["for_value", "is_default"],
      limit: 0,
    }).catch(() => []);
    companyName = permissions.find((permission) => Number(permission.is_default) === 1)?.for_value || permissions[0]?.for_value || "";
  }

  if (!companyName && isAdmin) {
    const companies = await frappe.getList("Company", { fields: ["name"], limit: 1, orderBy: "name asc" }).catch(() => []);
    companyName = companies[0]?.name || "";
  }
  if (!companyName) return null;
  return frappe.getDoc("Company", companyName);
}

export function BrandingProvider({ children }) {
  const { user } = useAuth();
  const [selectedCompany, setSelectedCompany] = useState(() => readStorage(SELECTED_COMPANY_KEY));
  const [revision, setRevision] = useState(0);
  const [state, setState] = useState({ company: null, loading: true });

  useEffect(() => {
    let cancelled = false;
    resolveCompany(user, selectedCompany)
      .then((company) => {
        if (cancelled) return;
        setState({ company, loading: false });
        document.title = `${company?.company_name || getCachedBrandName() || "ETHX Softcon"} | HRMS`;
        if (company?.name) cacheBranding(company);
        // A personal theme always wins - even when no company could be resolved for this account (e.g. HR users
        // without a Company user permission, who used to be stuck on the default theme).
        const sharedTheme = THEME_OPTIONS.some((theme) => theme.id === company?.custom_hrms_theme) ? company.custom_hrms_theme : null;
        if (hasSavedTheme(user?.email)) applySavedTheme(user.email);
        else if (sharedTheme) saveTheme(sharedTheme, company.name);
        else applySavedTheme(company?.name);
      })
      .catch(() => {
        if (cancelled) return;
        setState({ company: null, loading: false });
        applySavedTheme(hasSavedTheme(user?.email) ? user.email : undefined);
      });
    return () => { cancelled = true; };
  }, [user, selectedCompany, revision]);

  const refresh = () => setRevision((value) => value + 1);
  const selectCompany = (name) => {
    setSelectedBrandCompany(name);
    setSelectedCompany(name);
  };

  return <BrandingContext.Provider value={{ ...state, refresh, selectCompany }}>{children}</BrandingContext.Provider>;
}

export function useBranding() {
  return useContext(BrandingContext);
}