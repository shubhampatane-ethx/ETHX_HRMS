import { useState } from "react";
import { Check, LogOut, Palette } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { useBranding } from "../../context/BrandingContext";
import { getSavedTheme, hasSavedTheme, saveTheme, THEME_OPTIONS } from "../../lib/theme";

function ThemeTile({ option, selected, onChoose }) {
  const [background, accent, foreground] = option.swatches;
  return (
    <button
      type="button"
      role="menuitemradio"
      aria-checked={selected}
      onClick={onChoose}
      className={`rounded-lg border p-1.5 text-left transition-all hover:-translate-y-px hover:shadow-sm ${selected ? "border-[var(--color-red)] bg-[var(--color-red-wash)] ring-1 ring-[var(--color-red-wash)]" : "border-[var(--color-border)] bg-[var(--color-surface)] hover:border-[var(--color-border-strong)]"}`}
    >
      <span className="flex h-9 overflow-hidden rounded" style={{ backgroundColor: background }}>
        <span className="w-3 shrink-0 p-1" style={{ backgroundColor: `color-mix(in srgb, ${foreground} 9%, ${background})` }}>
          <span className="block h-full rounded-[2px]" style={{ backgroundColor: `color-mix(in srgb, ${foreground} 24%, ${background})` }} />
        </span>
        <span className="flex flex-1 flex-col justify-between p-1.5">
          <span className="block h-1 w-1/2 rounded-full" style={{ backgroundColor: `color-mix(in srgb, ${foreground} 45%, ${background})` }} />
          <span className="flex gap-1"><span className="h-2 flex-1 rounded-[2px]" style={{ backgroundColor: accent }} /><span className="h-2 flex-1 rounded-[2px]" style={{ backgroundColor: `color-mix(in srgb, ${accent} 72%, ${background})` }} /><span className="h-2 flex-1 rounded-[2px]" style={{ backgroundColor: `color-mix(in srgb, ${foreground} 18%, ${background})` }} /></span>
        </span>
      </span>
      <span className="mt-1.5 flex items-center justify-between gap-1 px-0.5">
        <span className="truncate text-[11px] font-medium text-[var(--color-text)]">{option.name}</span>
        {selected && <Check size={12} className="shrink-0 text-[var(--color-red-hover)]" />}
      </span>
    </button>
  );
}

export function Topbar({ roleLabel, pageTitle }) {
  const { user, logout } = useAuth();
  const { company } = useBranding();
  const [themeOverride, setThemeOverride] = useState(null);
  const [themeOpen, setThemeOpen] = useState(false);
  const personalTheme = hasSavedTheme(user?.email);
  const companyTheme = THEME_OPTIONS.find((option) => option.id === company?.custom_hrms_theme)?.id;
  const storedTheme = personalTheme ? getSavedTheme(user?.email) : companyTheme || getSavedTheme(company?.name);
  const theme = themeOverride?.email === user?.email ? themeOverride.value : storedTheme;

  function chooseTheme(value) {
    setThemeOverride({ email: user?.email, value: saveTheme(value, user?.email) });
    setThemeOpen(false);
  }

  return (
    <header className="flex h-16 shrink-0 items-center justify-between border-b border-[var(--color-border)] bg-[var(--color-bg)] px-6">
      <h1 className="text-[15px] font-semibold text-[var(--color-text)]">{pageTitle}</h1>

      <div className="flex items-center gap-4">
        <div className="relative">
          <button
            type="button"
            title="Change theme"
            aria-label="Change theme"
            aria-haspopup="menu"
            aria-expanded={themeOpen}
            onClick={() => setThemeOpen((open) => !open)}
            className="group flex h-9 items-center gap-2 rounded-full border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-2.5 text-[var(--color-text)] shadow-sm transition-all hover:-translate-y-px hover:border-[var(--color-red)] hover:shadow-md"
          >
            <span className="relative flex h-6 w-6 items-center justify-center rounded-full bg-[var(--color-red-wash)] text-[var(--color-red-hover)]"><Palette size={14} strokeWidth={1.9} /><span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full border border-[var(--color-surface)]" style={{ backgroundColor: THEME_OPTIONS.find((option) => option.id === theme)?.swatches[1] }} /></span>
            <span className="text-[11px] font-medium">Theme</span>
          </button>
          {themeOpen && (
            <div role="menu" aria-label="Choose theme" className="absolute right-0 top-full z-50 mt-2 w-72 rounded-xl border border-[var(--color-border-strong)] bg-[var(--color-surface)] p-2.5 shadow-xl">
              <div className="mb-2 flex items-center justify-between px-0.5">
                <p className="text-[11px] font-semibold text-[var(--color-text)]">Your theme</p>
                <span className="text-[10px] text-[var(--color-text-faint)]">Saved for your account</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {THEME_OPTIONS.map((option) => <ThemeTile key={option.id} option={option} selected={theme === option.id} onChoose={() => chooseTheme(option.id)} />)}
              </div>
            </div>
          )}
        </div>
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