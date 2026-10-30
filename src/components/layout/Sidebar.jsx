import { useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { ChevronDown } from "lucide-react";
import { Brand } from "../Brand";

/**
 * @param {{
 *   title: string,
 *   items: (
 *     | { to: string, label: string, icon?: React.ComponentType }
 *     | { label: string, icon?: React.ComponentType, children: { to: string, label: string }[] }
 *   )[]
 * }} props
 */
export function Sidebar({ title, items }) {
  const { pathname } = useLocation();

  return (
    <aside className="flex h-screen w-64 shrink-0 flex-col border-r border-[var(--color-border)] bg-[var(--color-surface)]">
      <div className="border-b border-[var(--color-border)] px-5 pb-4 pt-5">
        <Brand size="sidebar" />
      </div>

      <nav aria-label={title} className="flex-1 overflow-y-auto px-3 py-4">
        <ul className="space-y-0.5">
          {items.map((item) =>
            item.children ? (
              <GroupItem key={item.label} group={item} pathname={pathname} />
            ) : (
              <li key={item.to}>
                <NavLeaf to={item.to} label={item.label} icon={item.icon} end={item.to.split("/").length <= 2} />
              </li>
            )
          )}
        </ul>
      </nav>
    </aside>
  );
}

/** True when the current route belongs to this link or anywhere inside this group (any depth). */
function hasActive(item, pathname) {
  if (item.children) return item.children.some((c) => hasActive(c, pathname));
  return pathname === item.to || pathname.startsWith(`${item.to}/`);
}

/** Collapsible group. Children can be links or further groups, so menus can nest (e.g. Settings > Leaves > ...). */
function GroupItem({ group, pathname, nested = false }) {
  const containsActive = hasActive(group, pathname);
  const [open, setOpen] = useState(containsActive);

  return (
    <li>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className={[
          "flex w-full items-center gap-2.5 rounded-md px-3 py-2 transition-colors",
          nested ? "text-[12.5px]" : "text-[13px]",
          containsActive
            ? "text-[var(--color-text)]"
            : "text-[var(--color-text-muted)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text)]",
        ].join(" ")}
      >
        {group.icon && <group.icon size={nested ? 14 : 15} strokeWidth={1.75} />}
        <span className="flex-1 text-left">{group.label}</span>
        <ChevronDown
          size={13}
          strokeWidth={1.75}
          className={`transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && (
        <ul className="mt-0.5 space-y-0.5 border-l border-[var(--color-border)] pl-3.5">
          {group.children.map((child) =>
            child.children ? (
              <GroupItem key={child.label} group={child} pathname={pathname} nested />
            ) : (
              <li key={child.to}>
                <NavLeaf to={child.to} label={child.label} small end={Boolean(child.end)} />
              </li>
            )
          )}
        </ul>
      )}
    </li>
  );
}

function NavLeaf({ to, label, icon: Icon, end = false, small = false }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        [
          "group flex items-center gap-2.5 rounded-md px-3 py-2 transition-colors",
          small ? "text-[12.5px]" : "text-[13px]",
          isActive
            ? "bg-[var(--color-red-wash)] text-[var(--color-text)] border-l-2 border-[var(--color-red)] pl-[10px]"
            : "text-[var(--color-text-muted)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text)]",
        ].join(" ")
      }
    >
      {Icon && <Icon size={15} strokeWidth={1.75} />}
      {label}
    </NavLink>
  );
}