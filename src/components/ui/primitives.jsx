import { useEffect, useState } from "react";

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

/**
 * Text input with native <datalist> autocomplete against a Frappe Link
 * doctype - fetches up to 20 records once on mount via frappe.client.get_list
 * and offers them as suggestions. The field still accepts free typing (e.g.
 * an exact ID the fetch didn't happen to include); Frappe validates the
 * link server-side on save regardless.
 */
export function LinkField({ label, linkDoctype, value, onChange, required, frappe, titleField = "name" }) {
  const [options, setOptions] = useState([]);
  const listId = `link-${linkDoctype.replace(/\s+/g, "-")}`;

  useEffect(() => {
    let cancelled = false;
    frappe
      .getList(linkDoctype, { fields: Array.from(new Set(["name", titleField])), limit: 20, orderBy: "modified desc" })
      .then((rows) => {
        if (!cancelled) setOptions(rows);
      })
      .catch(() => {
        if (!cancelled) setOptions([]);
      });
    return () => {
      cancelled = true;
    };
  }, [linkDoctype, titleField, frappe]);

  return (
    <label className="block">
      <span className="mb-1.5 block text-[12px] text-[var(--color-text-muted)]">{label}</span>
      <input
        list={listId}
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        placeholder={`Search ${linkDoctype}…`}
        className="w-full rounded-md border border-[var(--color-border-strong)] bg-[var(--color-surface-2)] px-3 py-2 text-[13px] text-[var(--color-text)] placeholder:text-[var(--color-text-faint)] outline-none focus:border-[var(--color-red)]"
      />
      <datalist id={listId}>
        {options.map((o) => (
          <option key={o.name} value={o.name}>
            {o[titleField] && o[titleField] !== o.name ? o[titleField] : undefined}
          </option>
        ))}
      </datalist>
    </label>
  );
}