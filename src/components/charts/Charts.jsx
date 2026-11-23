// Small single-series charts in plain HTML, coloured from the app theme (one measure at a time, so one hue and no
// legend - the panel title names the measure). Every mark has a hover tooltip; values are also listed or tabled.
import { useState } from "react";

const fmt = (v, format) => (format ? format(v) : Number(v).toLocaleString("en-IN", { maximumFractionDigits: 2 }));

/** Horizontal bars, one per category, largest first, with the value at the end of each row. */
export function BarList({ rows, format, max: cap = 12, onPick }) {
  const shown = rows.slice(0, cap);
  const rest = rows.slice(cap);
  const other = rest.reduce((n, r) => n + r.value, 0);
  const list = rest.length ? [...shown, { key: `Other (${rest.length})`, value: other, other: true }] : shown;
  const max = Math.max(1, ...list.map((r) => r.value));
  return (
    <div className="space-y-1.5">
      {list.map((r) => (
        <button key={r.key} type="button" onClick={() => onPick?.(r)} disabled={!onPick || r.other} title={`${r.label || r.key}: ${fmt(r.value, format)}`}
          className="group flex w-full items-center gap-3 rounded-md px-1 py-0.5 text-left text-[12.5px] hover:bg-[var(--color-surface-2)] disabled:cursor-default">
          <span className="w-44 shrink-0 truncate text-[var(--color-text)] sm:w-56">{r.label || r.key}</span>
          <span className="h-2.5 flex-1 overflow-hidden rounded-r bg-[var(--color-surface-2)]">
            <span className={`block h-full rounded-r transition-opacity ${r.other ? "bg-[var(--color-text-faint)]" : "bg-[var(--color-red)] group-hover:opacity-80"}`} style={{ width: `${Math.max(1, (r.value / max) * 100)}%` }} />
          </span>
          <span className="w-20 shrink-0 text-right tabular-nums text-[var(--color-text)]">{fmt(r.value, format)}</span>
        </button>
      ))}
      {!list.length && <p className="py-4 text-center text-[13px] text-[var(--color-text-muted)]">No data for this period.</p>}
    </div>
  );
}

/** Vertical columns over time (one per month), with three recessive gridlines and a tooltip on hover. */
export function ColumnChart({ rows, format, height = 180, highlight }) {
  const [hover, setHover] = useState(null);
  const max = Math.max(1, ...rows.map((r) => r.value));
  const top = niceCeil(max);
  const ticks = [top, top / 2, 0];
  return (
    <div className="relative">
      <div className="relative ml-10" style={{ height }}>
        {ticks.map((t, i) => (
          <div key={i} className="absolute left-0 right-0 border-t border-[var(--color-border)]" style={{ top: `${(i / 2) * 100}%` }}>
            <span className="absolute -left-10 -top-2 w-8 text-right text-[10.5px] tabular-nums text-[var(--color-text-faint)]">{fmt(t, format)}</span>
          </div>
        ))}
        <div className="absolute inset-0 flex items-end gap-[2px]">
          {rows.map((r, i) => (
            <div key={r.key} className="relative flex h-full flex-1 items-end justify-center" onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
              <div className={`w-full max-w-[28px] rounded-t transition-opacity ${hover === i || r.key === highlight ? "bg-[var(--color-red)]" : "bg-[var(--color-red)] opacity-70"}`} style={{ height: `${Math.max(r.value ? 2 : 0, (r.value / top) * 100)}%` }} />
              {hover === i && (
                <div className="pointer-events-none absolute z-10 mb-1 whitespace-nowrap rounded-md border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-2 py-1 text-[11.5px] shadow-lg" style={{ bottom: `${(r.value / top) * 100}%` }}>
                  <span className="text-[var(--color-text-muted)]">{r.label || r.key}</span> <b className="text-[var(--color-text)]">{fmt(r.value, format)}</b>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
      <div className="ml-10 mt-1 flex gap-[2px]">
        {rows.map((r, i) => (
          <span key={r.key} className={`flex-1 truncate text-center text-[10.5px] ${rows.length > 14 && i % 2 ? "invisible" : ""} ${r.key === highlight ? "font-semibold text-[var(--color-text)]" : "text-[var(--color-text-faint)]"}`}>{r.label || r.key}</span>
        ))}
      </div>
    </div>
  );
}

// A round axis top: 1, 2, 2.5 or 5 times a power of ten, at or above the largest value.
function niceCeil(v) {
  const p = 10 ** Math.floor(Math.log10(v));
  const n = v / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p;
}
