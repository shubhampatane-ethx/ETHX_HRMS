// Loading states shaped like the page that's coming (BUG-007): a sidebar, top bar, header and cards in soft placeholder
// blocks, so a slow load never looks like a blank or crashed screen.
const Block = ({ className = "" }) => <div className={`animate-pulse rounded-lg bg-[var(--color-surface-2)] ${className}`} />;

function ContentSkeleton() {
  return (
    <div className="space-y-5" aria-hidden="true">
      <div className="flex items-center gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-5 py-4">
        <Block className="h-10 w-10" />
        <div className="flex-1 space-y-2"><Block className="h-3.5 w-48" /><Block className="h-3 w-80 max-w-full" /></div>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => <div key={i} className="space-y-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5"><Block className="h-3 w-24" /><Block className="h-7 w-16" /><Block className="h-3 w-32" /></div>)}
      </div>
      <div className="space-y-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
        <Block className="h-3.5 w-40" />
        {[0, 1, 2, 3, 4].map((i) => <Block key={i} className="h-9 w-full" />)}
      </div>
    </div>
  );
}

/** While a page's code or data loads. `full`: the whole window (before the workspace frame exists). */
export function PageLoading({ full = false }) {
  if (!full) return <div role="status" aria-label="Loading"><ContentSkeleton /></div>;
  return (
    <div role="status" aria-label="Loading" className="flex min-h-screen bg-[var(--color-bg)]">
      <div className="hidden w-64 shrink-0 space-y-3 border-r border-[var(--color-border)] bg-[var(--color-surface)] p-5 md:block" aria-hidden="true">
        <Block className="h-10 w-36" />
        <div className="space-y-2 pt-4">{[0, 1, 2, 3, 4, 5, 6].map((i) => <Block key={i} className="h-8 w-full" />)}</div>
      </div>
      <div className="flex-1">
        <div className="flex h-[68px] items-center justify-between border-b border-[var(--color-border)] bg-[var(--color-surface)] px-6" aria-hidden="true"><Block className="h-4 w-32" /><Block className="h-9 w-72 max-w-[40%]" /></div>
        <div className="p-6"><ContentSkeleton /></div>
      </div>
    </div>
  );
}
