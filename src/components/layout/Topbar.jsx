import { LogOut } from "lucide-react";
import { useAuth } from "../../context/AuthContext";

export function Topbar({ roleLabel, pageTitle }) {
  const { user, logout } = useAuth();

  return (
    <header className="flex h-16 items-center justify-between border-b border-[var(--color-border)] bg-[var(--color-bg)] px-6">
      <h1 className="text-[15px] font-semibold text-[var(--color-text)]">{pageTitle}</h1>

      <div className="flex items-center gap-4">
        <span className="rounded-full border border-[var(--color-red-deep)] bg-[var(--color-red-wash)] px-2.5 py-1 text-[11px] font-medium text-[var(--color-red-hover)]">
          {roleLabel}
        </span>
        <div className="flex items-center gap-2 text-[13px] text-[var(--color-text-muted)]">
          <span className="h-7 w-7 rounded-full bg-[var(--color-surface-2)] flex items-center justify-center text-[11px] font-semibold text-[var(--color-text)]">
            {user?.email?.[0]?.toUpperCase() ?? "?"}
          </span>
          {user?.email}
        </div>
        <button
          onClick={logout}
          className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[13px] text-[var(--color-text-muted)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text)] transition-colors"
        >
          <LogOut size={14} strokeWidth={1.75} />
          Sign out
        </button>
      </div>
    </header>
  );
}
