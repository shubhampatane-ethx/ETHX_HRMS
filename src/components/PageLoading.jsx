import { Loader2 } from "lucide-react";

/** Shown while a page's code is loading (pages are split into separate chunks). */
export function PageLoading({ full = false }) {
  return (
    <div className={`flex items-center justify-center gap-2 text-[13px] text-[var(--color-text-muted)] ${full ? "min-h-screen bg-[var(--color-bg)]" : "h-40"}`}>
      <Loader2 size={15} className="animate-spin" /> Loading…
    </div>
  );
}
