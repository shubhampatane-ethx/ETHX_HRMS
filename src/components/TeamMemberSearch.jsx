import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Search, X } from "lucide-react";
import { inputCls } from "./employee/EmployeeShell";

const NO_ROLE = "No Role Yet";

/**
 * Who someone can be grouped under: the roles they've held on projects, otherwise their designation.
 * `people`: Employee rows; `assignments`: parsed assignments ({ role, assignees }).
 */
function buildGroups(people, assignments) {
  const held = {};
  for (const a of assignments) {
    for (const email of a.assignees || []) {
      if (a.role) (held[email] ||= new Set()).add(a.role);
    }
  }
  const groups = new Map();
  for (const p of people) {
    const roles = [...(held[p.user_id] || [])];
    const member = { key: p.name, email: p.user_id, name: p.employee_name || p.name, designation: p.designation || "", roles };
    for (const group of roles.length ? roles : [p.designation || NO_ROLE]) {
      if (!groups.has(group)) groups.set(group, []);
      groups.get(group).push(member);
    }
  }
  return [...groups.entries()]
    .sort(([a], [b]) => (a === NO_ROLE) - (b === NO_ROLE) || a.localeCompare(b))
    .map(([role, members]) => ({ role, members: members.sort((x, y) => x.name.localeCompare(y.name)) }));
}

/**
 * Searching a role shows only the people in that role; searching a name shows that person under each role they hold.
 * A job title only counts for people the search hasn't found another way, under its own heading: otherwise searching
 * "developer" would list a Software Developer who is on a project as a tester under "QA / Tester".
 * Every word typed has to match, so "senior dev" finds "Senior Developer".
 */
export function searchTeam(groups, query) {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return groups;
  const has = (text) => words.every((w) => text.toLowerCase().includes(w));
  const found = groups
    .map((g) => ({ role: g.role, members: has(g.role) ? g.members : g.members.filter((m) => has(`${m.name} ${m.email || ""}`)) }))
    .filter((g) => g.members.length);
  const seen = new Set(found.flatMap((g) => g.members.map((m) => m.key)));
  const byTitle = new Map();
  for (const m of groups.flatMap((g) => g.members)) {
    if (seen.has(m.key) || !m.designation || !has(m.designation)) continue;
    seen.add(m.key);
    if (!byTitle.has(m.designation)) byTitle.set(m.designation, []);
    byTitle.get(m.designation).push(m);
  }
  return [...found, ...[...byTitle.entries()].map(([role, members]) => ({ role, members }))];
}

/** Pick a team member by typing a name or a role; results are grouped by role. */
export function TeamMemberSearch({ people, assignments, value, onChange }) {
  const groups = useMemo(() => buildGroups(people, assignments), [people, assignments]);
  const selected = value ? people.find((p) => p.user_id === value) : null;
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const box = useRef(null);
  const results = useMemo(() => searchTeam(groups, query), [groups, query]);
  const options = results.flatMap((g) => g.members.filter((m) => m.email).map((m) => ({ ...m, group: g.role })));

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => { if (!box.current?.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  function choose(member) {
    onChange(member.email);
    setQuery("");
    setOpen(false);
  }

  function onKey(e) {
    if (e.key === "ArrowDown") { e.preventDefault(); setOpen(true); setActive((i) => Math.min(i + 1, options.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((i) => Math.max(i - 1, 0)); }
    else if (e.key === "Enter") {
      // Enter picks a person; it must not submit the assignment form.
      e.preventDefault();
      if (open && options[active]) choose(options[active]);
    } else if (e.key === "Escape" && open) { e.stopPropagation(); setOpen(false); }
  }

  let index = -1;
  return (
    <div ref={box} className="relative">
      <Search size={14} className="pointer-events-none absolute left-2.5 top-[11px] text-[var(--color-text-faint)]" />
      <input
        role="combobox"
        aria-label="Team Member"
        aria-expanded={open}
        aria-controls="team-member-results"
        aria-autocomplete="list"
        autoComplete="off"
        className={`${inputCls} pl-8 ${selected ? "pr-8" : ""}`}
        placeholder="Search by name or role…"
        value={open || !selected ? query : selected.employee_name}
        onFocus={() => { setOpen(true); setActive(0); }}
        onClick={() => setOpen(true)}
        onChange={(e) => { setQuery(e.target.value); setOpen(true); setActive(0); if (value) onChange(""); }}
        onKeyDown={onKey}
      />
      {selected && !open && (
        <button type="button" aria-label="Clear team member" onClick={() => { onChange(""); setQuery(""); }} className="absolute right-2 top-[11px] text-[var(--color-text-muted)] hover:text-[var(--color-text)]"><X size={14} /></button>
      )}
      {open && (
        <div id="team-member-results" role="listbox" aria-label="Team members" className="absolute z-30 mt-1 max-h-64 w-full overflow-y-auto rounded-md border border-[var(--color-border-strong)] bg-[var(--color-surface)] py-1 shadow-xl">
          {results.length === 0 && <p className="px-3 py-3 text-[12.5px] text-[var(--color-text-muted)]">No one matches "{query}".</p>}
          {results.map((g) => (
            <div key={g.role} role="group" aria-label={g.role}>
              <p className="sticky top-0 bg-[var(--color-surface-2)] px-3 py-1 text-[11px] font-semibold text-[var(--color-text-muted)]">{g.role} ({g.members.length})</p>
              {g.members.map((m) => {
                if (!m.email) {
                  return <p key={m.key} className="px-3 py-1.5 text-[12.5px] text-[var(--color-text-faint)]">{m.name} <span className="text-[11px]">(no login)</span></p>;
                }
                index += 1;
                const i = index;
                return (
                  <button
                    key={m.key}
                    type="button"
                    role="option"
                    aria-selected={m.email === value}
                    onMouseEnter={() => setActive(i)}
                    onClick={() => choose(m)}
                    className={`flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-[12.5px] text-[var(--color-text)] ${i === active ? "bg-[var(--color-red-wash)]" : ""}`}
                  >
                    <span className="min-w-0 truncate">{m.name}{m.designation && <span className="ml-1.5 text-[11px] text-[var(--color-text-faint)]">{m.designation}</span>}</span>
                    {m.email === value && <Check size={13} className="shrink-0 text-[var(--color-red-hover)]" />}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
