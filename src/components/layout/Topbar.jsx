import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Check, ChevronDown, LogOut, Palette, Settings, SlidersHorizontal, UserRound, Briefcase } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { useBranding } from "../../context/BrandingContext";
import { hasPermission } from "../../permissions/roles";
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

/** Personal theme picker. Overrides the company's shared theme for this account on this browser. */
function ThemeMenu() {
  const { user } = useAuth();
  const { company } = useBranding();
  const [override, setOverride] = useState(null);
  const [open, setOpen] = useState(false);
  const box = useRef(null);
  const personal = hasSavedTheme(user?.email);
  const companyTheme = THEME_OPTIONS.find((o) => o.id === company?.custom_hrms_theme)?.id;
  const stored = personal ? getSavedTheme(user?.email) : companyTheme || getSavedTheme(company?.name);
  const theme = override?.email === user?.email ? override.value : stored;
  useOutside(open, box, () => setOpen(false));

  function choose(value) {
    setOverride({ email: user?.email, value: saveTheme(value, user?.email) });
    setOpen(false);
  }

  return (
    <div ref={box} className="relative">
      <button type="button" title="Change theme" aria-label="Change theme" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}
        className="flex h-9 items-center gap-2 rounded-full border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-2.5 text-[var(--color-text)] transition-colors hover:border-[var(--color-red)]">
        <span className="relative flex h-6 w-6 items-center justify-center rounded-full bg-[var(--color-red-wash)] text-[var(--color-red-hover)]"><Palette size={14} strokeWidth={1.9} /><span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full border border-[var(--color-surface)]" style={{ backgroundColor: THEME_OPTIONS.find((o) => o.id === theme)?.swatches[1] }} /></span>
        <span className="hidden text-[11px] font-medium sm:inline">Theme</span>
      </button>
      {open && (
        <div role="menu" aria-label="Choose theme" className="absolute right-0 top-full z-50 mt-2 w-72 rounded-xl border border-[var(--color-border-strong)] bg-[var(--color-surface)] p-2.5 shadow-xl">
          <div className="mb-2 flex items-center justify-between px-0.5">
            <p className="text-[11px] font-semibold text-[var(--color-text)]">Your theme</p>
            <span className="text-[10px] text-[var(--color-text-faint)]">Saved for your account</span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {THEME_OPTIONS.map((o) => <ThemeTile key={o.id} option={o} selected={theme === o.id} onChoose={() => choose(o.id)} />)}
          </div>
        </div>
      )}
    </div>
  );
}

/** Close a popup on outside click or Escape. */
function useOutside(open, box, close) {
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => { if (!box.current?.contains(e.target)) close(); };
    const onKey = (e) => { if (e.key === "Escape") close(); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, box, close]);
}

/** Menu entries in the account button, depending on who is signed in and where. */
function accountMenu(user, roleLabel) {
  const items = [];
  if (roleLabel === "Admin") {
    items.push({ to: "/admin/settings", label: "Settings", icon: Settings });
    if (hasPermission(user, "dashboard.hr")) items.push({ to: "/hr/setup/hr-settings", label: "HR Settings", icon: SlidersHorizontal });
  } else if (roleLabel === "HR") {
    items.push({ to: "/hr/setup/hr-settings", label: "HR Settings", icon: Settings });
  } else if (roleLabel === "Employee") {
    items.push({ to: "/employee/profile", label: "Profile & password", icon: UserRound });
  } else if (roleLabel === "Project Manager" && hasPermission(user, "dashboard.employee")) {
    items.push({ to: "/employee/profile", label: "My profile & password", icon: UserRound });
    items.push({ to: "/employee", label: "My Employee Portal", icon: Briefcase });
  }
  return items;
}

export function Topbar({ roleLabel, pageTitle }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const box = useRef(null);
  const items = accountMenu(user, roleLabel);

  useOutside(open, box, () => setOpen(false));

  const go = (to) => { setOpen(false); navigate(to); };
  const name = user?.email ?? "";

  return (
    <header className="flex h-16 shrink-0 items-center justify-between border-b border-[var(--color-border)] bg-[var(--color-bg)] px-6">
      <h1 className="text-[15px] font-semibold text-[var(--color-text)]">{pageTitle}</h1>

      <div className="flex items-center gap-3">
        <ThemeMenu />
        <div ref={box} className="relative">
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-haspopup="menu"
            aria-expanded={open}
            className="flex items-center gap-2.5 rounded-full border border-[var(--color-red-deep)] bg-[var(--color-red-wash)] py-1 pl-1 pr-3 text-[13px] transition-colors hover:border-[var(--color-red)]"
          >
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[var(--color-surface-2)] text-[11px] font-semibold text-[var(--color-text)]">{name[0]?.toUpperCase() ?? "?"}</span>
            <span className="max-w-[16rem] truncate text-[var(--color-text)]">{name}</span>
            <span className="text-[11px] font-medium text-[var(--color-red-hover)]">{roleLabel}</span>
            <ChevronDown size={14} className={`text-[var(--color-text-muted)] transition-transform ${open ? "rotate-180" : ""}`} />
          </button>

          {open && (
            <div role="menu" className="absolute right-0 top-full z-50 mt-2 w-64 overflow-hidden rounded-lg border border-[var(--color-border-strong)] bg-[var(--color-surface)] shadow-xl">
              <div className="border-b border-[var(--color-border)] px-4 py-3">
                <p className="truncate text-[13px] font-medium text-[var(--color-text)]">{name}</p>
                <p className="mt-0.5 text-[11px] text-[var(--color-red-hover)]">{roleLabel}</p>
              </div>
              <div className="py-1">
                {items.map(({ to, label, icon: Icon }) => (
                  <button key={to} type="button" role="menuitem" onClick={() => go(to)} className="flex w-full items-center gap-2.5 px-4 py-2 text-left text-[13px] text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text)]">
                    <Icon size={15} strokeWidth={1.75} />
                    {label}
                  </button>
                ))}
                <button type="button" role="menuitem" onClick={logout} className="flex w-full items-center gap-2.5 px-4 py-2 text-left text-[13px] text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-surface-2)] hover:text-[var(--color-red-hover)]">
                  <LogOut size={15} strokeWidth={1.75} />
                  Sign out
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}