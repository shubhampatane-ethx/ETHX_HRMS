export function Brand({ compact = false, className = "" }) {
  return (
    <div className={`flex items-center ${compact ? "gap-2" : "gap-3"} ${className}`}>
      <img
        src="/ethx-logo.svg"
        alt="ETHX Softcon"
        className={compact ? "h-11 w-auto" : "h-16 w-auto"}
      />
      {!compact && (
        <span className="border-l border-[var(--color-border-strong)] pl-3 text-[12px] font-semibold uppercase tracking-[0.18em] text-[var(--color-text-muted)]">
          HRMS
        </span>
      )}
    </div>
  );
}
