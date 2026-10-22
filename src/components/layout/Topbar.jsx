import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronDown, LogOut, Settings, SlidersHorizontal, UserRound, Briefcase } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { hasPermission } from "../../permissions/roles";

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

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => { if (!box.current?.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const go = (to) => { setOpen(false); navigate(to); };
  const name = user?.email ?? "";

  return (
    <header className="flex h-16 shrink-0 items-center justify-between border-b border-[var(--color-border)] bg-[var(--color-bg)] px-6">
      <h1 className="text-[15px] font-semibold text-[var(--color-text)]">{pageTitle}</h1>

      <div className="flex items-center gap-3">
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