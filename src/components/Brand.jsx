import { getCachedBrandLogo, getCachedBrandName, useBranding } from "../context/BrandingContext";
import { AdaptiveLogo } from "./AdaptiveLogo";

const DEFAULT_LOGO = "/ethx-logo.svg";
const DEFAULT_NAME = "ETHX Softcon";

/** The company's logo and name - from the Company record, or the last one seen on this browser (sign-in page). */
export function useCompanyBrand() {
  const { company } = useBranding();
  return {
    logo: company?.company_logo || getCachedBrandLogo() || DEFAULT_LOGO,
    name: company?.company_name || getCachedBrandName() || DEFAULT_NAME,
  };
}

// Every logo gets the same frame: a fixed height and the available width. AdaptiveLogo trims the logo's empty
// margins, so square, wide and padded logos all fill the frame the same way.
const SIZES = {
  sidebar: { frame: "h-14", name: "text-[15px]" },
  page: { frame: "h-16", name: "text-[17px]" },
  compact: { frame: "h-10", name: "text-[13px]" },
};

/**
 * Logo with the company name as its own line underneath - never squeezed into one row with it.
 * `align`: "start" (sidebar) or "center" (sign-in screens). `mode` forces a light / dark rendering (previews).
 */
export function Brand({ size = "sidebar", align = "start", showName = true, logo, name, mode, className = "" }) {
  const brand = useCompanyBrand();
  const src = logo || brand.logo;
  const title = name || brand.name;
  const s = SIZES[size] || SIZES.sidebar;
  const center = align === "center";
  return (
    <div className={`flex min-w-0 flex-col ${center ? "items-center text-center" : "items-start"} ${className}`}>
      <div className={`flex w-full ${s.frame} ${center ? "justify-center" : "justify-start"}`}>
        <AdaptiveLogo src={src} alt={`${title} logo`} mode={mode} className={`h-full w-auto max-w-full object-contain ${center ? "object-center" : "object-left"}`} />
      </div>
      {showName && <p className={`mt-2.5 max-w-full break-words font-bold leading-tight tracking-tight text-[var(--color-text)] ${s.name}`}>{title}</p>}
    </div>
  );
}
