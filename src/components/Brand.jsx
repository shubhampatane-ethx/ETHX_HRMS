import { useBranding } from "../context/BrandingContext";
import { AdaptiveLogo } from "./AdaptiveLogo";

export function Brand({ compact = false, className = "" }) {
  const { company } = useBranding();
  const logo = company?.company_logo || "/ethx-logo.svg";
  const companyName = company?.company_name || "ETHX Softcon";

  return (
    <div className={`flex items-center ${compact ? "gap-2" : "gap-3"} ${className}`}>
      <AdaptiveLogo
        src={logo}
        alt={`${companyName} logo`}
        className={`${compact ? "h-10 max-w-24" : "h-16 max-w-40"} w-auto object-contain`}
      />
      <span className={`min-w-0 ${compact ? "border-l border-[var(--color-border)] pl-2" : "border-l border-[var(--color-border-strong)] pl-3"}`}>
        <span className={`block max-w-36 truncate font-semibold text-[var(--color-text)] ${compact ? "text-[12px]" : "text-[13px]"}`}>{companyName}</span>
        <span className={`block font-medium uppercase tracking-[0.14em] text-[var(--color-text-muted)] ${compact ? "text-[9px]" : "text-[10px]"}`}>People platform</span>
      </span>
    </div>
  );
}
