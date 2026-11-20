import { createContext, useContext, useEffect, useState } from "react";
import { useAuth } from "./AuthContext";
import { frappe } from "../lib/api/frappeClient";
import { getMyEmployee } from "../lib/employeePortal";
import { setClientScope, STORED_CLIENT_KEY } from "../lib/clientScope";
import { SUPER_ADMIN } from "../lib/modules";
import { applySavedTheme, hasSavedTheme, saveTheme, THEME_OPTIONS } from "../lib/theme";

const BrandingContext = createContext({ company: null, loading: true, refresh: () => {}, selectCompany: () => {} });
const SELECTED_COMPANY_KEY = STORED_CLIENT_KEY;
const LOGO_CACHE_KEY = "hrms-branding-logo";
const DARK_LOGO_CACHE_KEY = "hrms-branding-logo-dark";
const COMPANY_NAME_CACHE_KEY = "hrms-branding-name";

function readStorage(key) {
  try { return localStorage.getItem(key) || ""; } catch { return ""; }
}

export function getCachedBrandLogo() {
  return readStorage(LOGO_CACHE_KEY);
}

export function getCachedBrandDarkLogo() {
  return readStorage(DARK_LOGO_CACHE_KEY);
}

/** The name shown in the app: the admin's display name, else the Company's legal name. */
export function brandName(company) {
  return company?.custom_hrms_display_name?.trim() || company?.company_name || "";
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
    if (company?.custom_hrms_dark_logo) localStorage.setItem(DARK_LOGO_CACHE_KEY, company.custom_hrms_dark_logo);
    else localStorage.removeItem(DARK_LOGO_CACHE_KEY);
    if (brandName(company)) localStorage.setItem(COMPANY_NAME_CACHE_KEY, brandName(company));
    else localStorage.removeItem(COMPANY_NAME_CACHE_KEY);
  } catch {
    // The Company record remains the source of truth when local caching is unavailable.
  }
}

export function setSelectedBrandCompany(name) {
  try { localStorage.setItem(SELECTED_COMPANY_KEY, name); } catch { /* current-session selection is still applied */ }
}

/** Signed out: the company's public logos, name and support contact (from a public method; empty before setup). */
async function publicBranding() {
  const r = await frappe.callMethod("ethx_login_branding").catch(() => null);
  if (!r?.name) return null;
  return { name: "__public", company_name: r.name, company_logo: r.logo || "", custom_hrms_dark_logo: r.dark_logo || "", custom_hrms_support_email: r.support_email || "", custom_hrms_support_phone: r.support_phone || "" };
}

async function resolveCompany(user, selectedCompany) {
  if (!user) return publicBranding();
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
        // The company shown to the super admin is also the client every list is narrowed to.
        if (user?.email === SUPER_ADMIN) setClientScope(company?.name);
        document.title = `${brandName(company) || getCachedBrandName() || "ETHX Softcon"} | HRMS 360`;
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
    if (user?.email === SUPER_ADMIN) setClientScope(name);
  };

  return <BrandingContext.Provider value={{ ...state, refresh, selectCompany }}>{children}</BrandingContext.Provider>;
}

export function useBranding() {
  return useContext(BrandingContext);
}