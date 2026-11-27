// The "⋯" menu for a table row's less common actions. items: [{ label, icon, onClick, danger?, hint? } | false].
import { useEffect, useRef, useState } from "react";
import { MoreHorizontal } from "lucide-react";

/** Positioned against the viewport so a table's scroll area can't clip it. */
export function RowMenu({ items }) {
  const list = items.filter(Boolean);
  const btn = useRef(null);
  const [pos, setPos] = useState(null);
  useEffect(() => {
    if (!pos) return undefined;
    const close = (e) => { if (!e.target.closest?.("[data-row-menu]")) setPos(null); };
    const esc = (e) => e.key === "Escape" && setPos(null);
    const hide = () => setPos(null);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    window.addEventListener("scroll", hide, true);
    window.addEventListener("resize", hide);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", esc); window.removeEventListener("scroll", hide, true); window.removeEventListener("resize", hide); };
  }, [pos]);
  function toggle() {
    if (pos) return setPos(null);
    const r = btn.current.getBoundingClientRect();
    const height = list.length * 34 + 12;
    setPos({ right: window.innerWidth - r.right, ...(r.bottom + height > window.innerHeight ? { bottom: window.innerHeight - r.top + 4 } : { top: r.bottom + 4 }) });
  }
  return (
    <span data-row-menu>
      <button ref={btn} type="button" aria-label="More actions" aria-haspopup="menu" aria-expanded={Boolean(pos)} onClick={toggle} className={`flex h-7 w-7 items-center justify-center rounded-md border transition-colors ${pos ? "border-[var(--color-border-strong)] bg-[var(--color-surface-2)] text-[var(--color-text)]" : "border-[var(--color-border)] text-[var(--color-text-muted)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text)]"}`}><MoreHorizontal size={15} /></button>
      {pos && (
        <div role="menu" style={{ position: "fixed", ...pos }} className="z-50 min-w-[200px] rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-1 shadow-lg">
          {list.map((it) => (
            <button key={it.label} role="menuitem" type="button" title={it.hint} onClick={() => { setPos(null); it.onClick(); }} className={`flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-[12.5px] transition-colors hover:bg-[var(--color-surface-2)] ${it.danger ? "text-[var(--color-red-hover)]" : "text-[var(--color-text)]"}`}>
              <it.icon size={13} className={it.danger ? "" : "text-[var(--color-text-muted)]"} /> {it.label}
            </button>
          ))}
        </div>
      )}
    </span>
  );
}
