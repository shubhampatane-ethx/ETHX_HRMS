import { useEffect, useRef, useState } from "react";
import { CalendarDays } from "lucide-react";

export function Card({ children, className = "" }) {
  return (
    <div
      className={`rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] ${className}`}
    >
      {children}
    </div>
  );
}

export function StatCard({ label, value, trend }) {
  return (
    <Card className="p-4">
      <p className="text-[12px] text-[var(--color-text-muted)]">{label}</p>
      <div className="mt-2 flex items-baseline gap-2">
        <span className="text-2xl font-semibold text-[var(--color-text)]">{value}</span>
        {trend && (
          <span
            className={
              trend.startsWith("-")
                ? "text-[11px] text-[var(--color-text-muted)]"
                : "text-[11px] text-[var(--color-green)]"
            }
          >
            {trend}
          </span>
        )}
      </div>
    </Card>
  );
}

export function Button({ children, variant = "primary", className = "", ...props }) {
  const base = "inline-flex items-center justify-center gap-1.5 rounded-md px-3.5 py-2 text-[13px] font-medium transition-colors disabled:opacity-50 disabled:pointer-events-none";
  const variants = {
    primary: "bg-[var(--color-red)] text-white hover:bg-[var(--color-red-hover)]",
    secondary:
      "bg-[var(--color-surface-2)] text-[var(--color-text)] border border-[var(--color-border-strong)] hover:border-[var(--color-red-deep)]",
    ghost: "text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-2)]",
  };
  return (
    <button className={`${base} ${variants[variant]} ${className}`} {...props}>
      {children}
    </button>
  );
}

export function Input({ label, ...props }) {
  return (
    <label className="block">
      {label && <span className="mb-1.5 block text-[12px] text-[var(--color-text-muted)]">{label}</span>}
      <input
        className="w-full rounded-md border border-[var(--color-border-strong)] bg-[var(--color-surface-2)] px-3 py-2 text-[13px] text-[var(--color-text)] placeholder:text-[var(--color-text-faint)] outline-none focus:border-[var(--color-red)]"
        {...props}
      />
    </label>
  );
}

export function Table({ columns, rows, emptyLabel = "No records yet." }) {
  if (!rows?.length) {
    return (
      <div className="flex h-32 items-center justify-center text-[13px] text-[var(--color-text-muted)]">
        {emptyLabel}
      </div>
    );
  }
  return (
    <table className="w-full text-left text-[13px]">
      <thead>
        <tr className="border-b border-[var(--color-border)]">
          {columns.map((c) => (
            <th key={c.key} className="px-4 py-2.5 font-medium text-[var(--color-text-muted)]">
              {c.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, i) => (
          <tr key={i} className="border-b border-[var(--color-border)] last:border-0 hover:bg-[var(--color-surface-2)]">
            {columns.map((c) => (
              <td key={c.key} className="px-4 py-2.5 text-[var(--color-text)]">
                {c.render ? c.render(row) : row[c.key]}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Human-readable title field per Frappe doctype (falls back to the record ID). */
const TITLE_FIELDS = {
  Employee: "employee_name",
  User: "full_name",
  Customer: "customer_name",
  Supplier: "supplier_name",
};

/**
 * Searchable dropdown for a Frappe Link field. Options are shown as
 * "Name  ID" (e.g. "Vishal Walunj  HR-EMP-00001") and can be searched by
 * either; the form value is always the record ID that Frappe expects. After
 * picking, the box shows the name. Free typing of an exact ID still works,
 * and Frappe validates the link server-side on save.
 */
export function LinkField({ label, linkDoctype, value, onChange, required, frappe, titleField }) {
  const title = titleField || TITLE_FIELDS[linkDoctype] || "name";
  const [options, setOptions] = useState([]);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const fetchWith = (fields) => frappe.getList(linkDoctype, { fields, limit: 500, orderBy: "modified desc" });
    fetchWith(Array.from(new Set(["name", title])))
      .catch(() => fetchWith(["name"])) // title field not available/permitted -> IDs only
      .then((rows) => { if (!cancelled) setOptions(rows.map((r) => ({ id: r.name, title: r[title] && r[title] !== r.name ? r[title] : "" }))); })
      .catch(() => { if (!cancelled) setOptions([]); });
    return () => { cancelled = true; };
  }, [linkDoctype, title, frappe]);

  const selected = options.find((o) => o.id === value);
  const shown = open ? query : selected ? selected.title || selected.id : value ?? "";

  const q = query.trim().toLowerCase();
  const filtered = (open && q ? options.filter((o) => o.id.toLowerCase().includes(q) || o.title.toLowerCase().includes(q)) : options).slice(0, 50);

  function pick(o) {
    onChange(o.id);
    setOpen(false);
  }

  function commitTyped() {
    const text = query.trim();
    const exact = options.find((o) => o.id.toLowerCase() === text.toLowerCase() || (o.title && o.title.toLowerCase() === text.toLowerCase()));
    if (exact) onChange(exact.id);
    else if (text !== (selected?.title || selected?.id || value || "")) onChange(text);
    setOpen(false);
  }

  function onKeyDown(e) {
    if (e.key === "ArrowDown") { e.preventDefault(); setOpen(true); setActive((a) => Math.min(a + 1, filtered.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    else if (e.key === "Enter" && open) { e.preventDefault(); if (filtered[active]) pick(filtered[active]); else commitTyped(); }
    else if (e.key === "Escape") setOpen(false);
  }

  return (
    <label className="relative block">
      <span className="mb-1.5 block text-[12px] text-[var(--color-text-muted)]">{label}</span>
      <input
        value={shown}
        onChange={(e) => { setQuery(e.target.value); setActive(0); setOpen(true); }}
        onFocus={() => { setQuery(""); setActive(0); setOpen(true); }}
        onBlur={() => { if (open) commitTyped(); }}
        onKeyDown={onKeyDown}
        required={required && !value}
        autoComplete="off"
        placeholder={`Search ${linkDoctype}…`}
        className="w-full rounded-md border border-[var(--color-border-strong)] bg-[var(--color-surface-2)] px-3 py-2 text-[13px] text-[var(--color-text)] placeholder:text-[var(--color-text-faint)] outline-none focus:border-[var(--color-red)]"
      />
      {open && (
        <ul className="absolute z-30 mt-1 max-h-64 w-full overflow-y-auto rounded-md border border-[var(--color-border-strong)] bg-[var(--color-surface-2)] py-1 shadow-xl">
          {filtered.length === 0 && <li className="px-3 py-2 text-[12px] text-[var(--color-text-muted)]">No matches - press Enter to use what you typed</li>}
          {filtered.map((o, i) => (
            <li
              key={o.id}
              onMouseDown={(e) => { e.preventDefault(); pick(o); }}
              onMouseEnter={() => setActive(i)}
              className={`flex cursor-pointer items-center justify-between gap-3 px-3 py-1.5 text-[13px] ${i === active ? "bg-[var(--color-red-wash)]" : ""} ${o.id === value ? "text-[var(--color-red-hover)]" : "text-[var(--color-text)]"}`}
            >
              <span className="truncate">{o.title || o.id}</span>
              {o.title && <span className="shrink-0 text-[11px] text-[var(--color-text-muted)]">{o.id}</span>}
            </li>
          ))}
        </ul>
      )}
    </label>
  );
}


/** "2026-09-29" -> "29/09/2026" */
function isoToDmy(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || "");
  return m ? `${m[3]}/${m[2]}/${m[1]}` : "";
}

/** "29/09/2026" -> "2026-09-29", or "" when not a real calendar date */
function dmyToIso(text) {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(text);
  if (!m) return "";
  const [d, mo, y] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return "";
  return `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/**
 * Date input that is always dd/mm/yyyy (the native date input follows the
 * browser's locale, which can't be changed from the page). Typing auto-adds
 * the slashes; the calendar button opens the native picker. The value passed
 * to onChange is the ISO yyyy-mm-dd string that Frappe expects.
 */
export function DateField({ label, value, onChange, required }) {
  const [text, setText] = useState(null); // null = not editing, show the saved value
  const pickerRef = useRef(null);
  const shown = text ?? isoToDmy(value);

  function handleType(e) {
    const digits = e.target.value.replace(/\D/g, "").slice(0, 8);
    const masked = [digits.slice(0, 2), digits.slice(2, 4), digits.slice(4, 8)].filter(Boolean).join("/");
    setText(masked);
    if (!masked) onChange("");
    else if (masked.length === 10) onChange(dmyToIso(masked));
  }

  return (
    <label className="relative block">
      {label && <span className="mb-1.5 block text-[12px] text-[var(--color-text-muted)]">{label}</span>}
      <input
        value={shown}
        onChange={handleType}
        onBlur={() => setText(null)}
        required={required && !value}
        inputMode="numeric"
        autoComplete="off"
        placeholder="dd/mm/yyyy"
        maxLength={10}
        className="w-full rounded-md border border-[var(--color-border-strong)] bg-[var(--color-surface-2)] px-3 py-2 pr-9 text-[13px] text-[var(--color-text)] placeholder:text-[var(--color-text-faint)] outline-none focus:border-[var(--color-red)]"
      />
      <button
        type="button"
        title="Pick a date"
        onClick={(e) => { e.preventDefault(); pickerRef.current?.showPicker?.(); }}
        className="absolute bottom-0 right-0 flex h-[38px] w-9 items-center justify-center text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
      >
        <CalendarDays size={15} />
      </button>
      <input
        ref={pickerRef}
        type="date"
        tabIndex={-1}
        aria-hidden="true"
        value={value || ""}
        onChange={(e) => { setText(null); onChange(e.target.value); }}
        className="pointer-events-none absolute bottom-0 right-0 h-0 w-0 opacity-0"
      />
    </label>
  );
}