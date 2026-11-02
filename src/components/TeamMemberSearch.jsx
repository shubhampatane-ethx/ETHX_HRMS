import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Search, X } from "lucide-react";
import { inputCls } from "./employee/EmployeeShell";

// Role names that mean the same thing. Searching any of them finds people holding any of them.
const SAME_ROLE = [
  ["developer", "software developer", "software engineer", "programmer", "sde", "dev"],
  ["project manager", "projects manager", "pm"],
  ["qa", "tester", "quality analyst", "test engineer"],
  ["business analyst", "ba"],
  ["hr", "human resources"],
  ["designer", "ui designer", "ux designer"],
  ["devops", "dev ops"],
  ["tech lead", "technical lead"],
];

const contains = (text, phrase) => new RegExp(`(^|[^a-z0-9])${phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}($|[^a-z0-9])`).test(text);

/** A role plus every other name for it: "Software Developer" -> "software developer developer programmer ...". */
function withSameRoles(role) {
  const text = String(role || "").toLowerCase();
  return [text, ...SAME_ROLE.filter((names) => names.some((n) => contains(text, n))).flat()].join(" ");
}

/**
 * Every word typed has to match: the start of a word in a role or name ("dev" finds "Developer", "pm" finds "Project
 * Manager"), or anywhere in a name or email from three letters on (short words would match inside other names).
 */
export function matchesSearch(query, { name = "", email = "", roles = [] }) {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return false;
  const person = `${name} ${email}`.toLowerCase();
  const haystack = `${person} ${roles.map(withSameRoles).join(" ")}`;
  return words.every((w) => contains(` ${haystack.replace(/[^a-z0-9]+/g, " ")} `, w) || haystack.split(/[^a-z0-9]+/).some((t) => t.startsWith(w)) || (w.length >= 3 && person.includes(w)));
}

/** Everyone with the roles they've held on projects and their job title, which the search treats alike. */
function buildMembers(people, assignments) {
  const held = {};
  for (const a of assignments) {
    for (const email of a.assignees || []) {
      if (a.role) (held[email] ||= new Set()).add(a.role);
    }
  }
  return people
    .map((p) => {
      const projectRoles = [...(held[p.user_id] || [])];
      return { key: p.name, email: p.user_id, name: p.employee_name || p.name, designation: p.designation || "", roles: [...projectRoles, ...(p.designation ? [p.designation] : [])], projectRoles };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Pick a team member by typing a name or a role. Nothing is listed until something is typed. */
export function TeamMemberSearch({ people, assignments, value, onChange }) {
  const members = useMemo(() => buildMembers(people, assignments), [people, assignments]);
  const selected = value ? people.find((p) => p.user_id === value) : null;
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const box = useRef(null);
  const results = useMemo(() => members.filter((m) => matchesSearch(query, m)), [members, query]);
  const options = results.filter((m) => m.email);
  const typed = query.trim().length > 0;

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

  const showing = open && typed;
  return (
    <div ref={box} className="relative">
      <Search size={14} className="pointer-events-none absolute left-2.5 top-[11px] text-[var(--color-text-faint)]" />
      <input
        role="combobox"
        aria-label="Team Member"
        aria-expanded={showing}
        aria-controls="team-member-results"
        aria-autocomplete="list"
        autoComplete="off"
        className={`${inputCls} pl-8 ${selected ? "pr-8" : ""}`}
        placeholder="Search by name or role…"
        value={selected && !query ? selected.employee_name : query}
        onChange={(e) => {
          // Typing over a chosen person starts a new search.
          const text = e.target.value;
          if (value) onChange("");
          setQuery(selected ? text.replace(selected.employee_name, "") : text);
          setOpen(true);
          setActive(0);
        }}
        onKeyDown={onKey}
      />
      {selected && !query && (
        <button type="button" aria-label="Clear team member" onClick={() => { onChange(""); setQuery(""); }} className="absolute right-2 top-[11px] text-[var(--color-text-muted)] hover:text-[var(--color-text)]"><X size={14} /></button>
      )}
      {showing && (
        <div id="team-member-results" role="listbox" aria-label="Team members" className="absolute z-30 mt-1 max-h-64 w-full overflow-y-auto rounded-md border border-[var(--color-border-strong)] bg-[var(--color-surface)] py-1 shadow-xl">
          {results.length === 0 && <p className="px-3 py-3 text-[12.5px] text-[var(--color-text-muted)]">No one matches "{query.trim()}".</p>}
          {results.map((m) => {
            // Show the role that was searched for, otherwise their current role: "developer" shouldn't label someone "QA / Tester".
            const detail = m.roles.find((r) => matchesSearch(query, { roles: [r] })) || m.projectRoles[0] || m.designation;
            if (!m.email) {
              return <p key={m.key} className="px-3 py-1.5 text-[12.5px] text-[var(--color-text-faint)]">{m.name} <span className="text-[11px]">(no login)</span></p>;
            }
            const i = options.indexOf(m);
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
                <span className="min-w-0 truncate">{m.name}{detail && <span className="ml-1.5 text-[11px] text-[var(--color-text-faint)]">{detail}</span>}</span>
                {m.email === value && <Check size={13} className="shrink-0 text-[var(--color-red-hover)]" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
