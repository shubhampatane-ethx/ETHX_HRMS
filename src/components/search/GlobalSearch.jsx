// The search box that searches the whole app (lib/appSearch.js). Pages show as you type; records (people, candidates,
// openings, projects, holidays, policies, documents, help) follow a moment later. Arrow keys move, Enter opens, Escape
// closes; Enter with nothing picked opens the full Search page.
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, Briefcase, CalendarDays, CornerDownLeft, FileText, LayoutGrid, LifeBuoy, Loader2, Search, UserRound, UserSearch, Users } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { searchPages, searchRecords } from "../../lib/appSearch";

export const GROUP_ICONS = { pages: LayoutGrid, people: Users, candidates: UserSearch, openings: Briefcase, projects: Briefcase, holidays: CalendarDays, policies: FileText, documents: FileText, help: LifeBuoy };
export const SEARCH_PAGE = "/employee/search";

export function GlobalSearch({ employee, placeholder = "Search pages, people, policies…", className = "" }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [records, setRecords] = useState({ q: "", groups: [] });
  const [active, setActive] = useState(0);
  const box = useRef(null);
  const term = q.trim();

  const pages = useMemo(() => (term ? searchPages(user, term).slice(0, 6) : []), [user, term]);
  const loading = term.length >= 2 && records.q !== term;

  // Records a moment after typing stops, so each keystroke doesn't hit the server.
  useEffect(() => {
    if (term.length < 2) return undefined;
    let off = false;
    const t = setTimeout(() => {
      searchRecords(user, employee, term).then((groups) => { if (!off) setRecords({ q: term, groups }); }).catch(() => { if (!off) setRecords({ q: term, groups: [] }); });
    }, 250);
    return () => { off = true; clearTimeout(t); };
  }, [user, employee, term]);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => { if (box.current && !box.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const groups = [
    ...(pages.length ? [{ id: "pages", title: "Pages", items: pages.map((p) => ({ key: p.to, label: p.label, sub: p.trail, to: p.to })) }] : []),
    ...(records.q === term ? records.groups.map((g) => ({ ...g, items: g.items.slice(0, 4) })) : []),
  ];
  // Each result's position across all groups, for the arrow keys.
  const offsets = groups.map((_, gi) => groups.slice(0, gi).reduce((n, g) => n + g.items.length, 0));
  const flat = groups.flatMap((g) => g.items);

  const go = (item) => {
    setOpen(false);
    setQ("");
    if (item?.href) window.open(item.href, "_blank", "noopener");
    else if (item?.to) navigate(item.to);
  };
  const seeAll = () => { setOpen(false); navigate(`${SEARCH_PAGE}?q=${encodeURIComponent(term)}`); };

  const onKey = (e) => {
    if (e.key === "Escape") { setOpen(false); e.currentTarget.blur(); return; }
    if (!flat.length && e.key !== "Enter") return;
    if (e.key === "ArrowDown") { e.preventDefault(); setOpen(true); setActive((i) => (i + 1) % flat.length); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((i) => (i - 1 + flat.length) % flat.length); }
    else if (e.key === "Enter") { e.preventDefault(); if (open && flat[active]) go(flat[active]); else if (term) seeAll(); }
  };

  return (
    <div ref={box} className={`relative ${className}`}>
      <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-text-faint)]" />
      <input value={q} onChange={(e) => { setQ(e.target.value); setActive(0); setOpen(true); }} onFocus={() => term && setOpen(true)} onKeyDown={onKey}
        placeholder={placeholder} aria-label="Search the app" role="combobox" aria-expanded={open && Boolean(term)} autoComplete="off"
        className="w-full rounded-lg border border-[var(--color-border-strong)] bg-[var(--color-surface-2)] py-2.5 pl-9 pr-9 text-[13px] text-[var(--color-text)] placeholder:text-[var(--color-text-faint)] outline-none focus:border-[var(--color-red)]" />
      {loading && <Loader2 size={14} className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-[var(--color-text-faint)]" />}

      {open && term && (
        <div className="absolute left-0 right-0 top-full z-40 mt-1.5 overflow-hidden rounded-xl border border-[var(--color-border-strong)] bg-[var(--color-surface)] text-left shadow-2xl shadow-black/30 sm:min-w-[380px]">
          <div className="max-h-[60vh] overflow-y-auto p-1.5" role="listbox">
            {groups.map((g, gi) => {
              const Icon = GROUP_ICONS[g.id] || UserRound;
              return (
                <div key={g.id} className="pb-1">
                  <p className="px-2 pb-1 pt-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--color-text-faint)]">{g.title}</p>
                  {g.items.map((it, ii) => {
                    const i = offsets[gi] + ii;
                    return (
                      <button key={`${g.id}-${it.key}`} type="button" role="option" aria-selected={i === active} onMouseEnter={() => setActive(i)} onClick={() => go(it)}
                        className={`flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left ${i === active ? "bg-[var(--color-red-wash)]" : ""}`}>
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[var(--color-surface-2)] text-[var(--color-text-muted)]"><Icon size={14} /></span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[12.5px] font-medium text-[var(--color-text)]">{it.label}</span>
                          {it.sub && <span className="block truncate text-[11px] text-[var(--color-text-muted)]">{it.sub}</span>}
                        </span>
                        {i === active && <CornerDownLeft size={13} className="shrink-0 text-[var(--color-text-faint)]" />}
                      </button>
                    );
                  })}
                </div>
              );
            })}
            {!groups.length && <p className="px-3 py-4 text-center text-[12.5px] text-[var(--color-text-muted)]">{loading ? "Searching…" : `Nothing found for “${term}”.`}</p>}
          </div>
          <button type="button" onClick={seeAll} className="flex w-full items-center justify-between border-t border-[var(--color-border)] px-3.5 py-2.5 text-[12px] font-medium text-[var(--color-red-hover)] hover:bg-[var(--color-surface-2)]">
            See all results for “{term}” <ArrowRight size={13} />
          </button>
        </div>
      )}
    </div>
  );
}
