// Only what the automatic setup couldn't apply on this ERPNext site (nothing at all when everything is in place).
// The full checklist isn't shown: setup runs by itself when the Administrator signs in, and Apply Again re-runs it.
import { useState } from "react";
import { AlertTriangle } from "lucide-react";
import { useAsync } from "../lib/employeePortal";
import { setupStatus } from "../lib/siteSetup";

function issuesOf(st) {
  const out = [];
  for (const m of st.modules) {
    const items = [
      ...(m.missingDoctypes || []).map((d) => d.what || d.name),
      ...(m.missingRecords || []).map((r) => r.what),
      ...(m.missingPermissions || []).map((g) => g.what),
      ...(m.missingFields?.length ? [`${m.missingFields.length} custom field(s)`] : []),
      ...(m.untracked?.length ? [`change history for ${m.untracked.join(", ")}`] : []),
      ...(m.missingProps?.length ? [`${m.missingProps.length} field setting(s)`] : []),
      ...(m.scripts || []).filter((s) => !s.installed).map((s) => s.what),
    ];
    if (items.length) out.push({ module: m.label, items });
  }
  if (st.missingAppDoctypes?.length) out.push({ module: "Needs the HRMS app", items: [`Not on this site and can't be created by the app: ${st.missingAppDoctypes.join(", ")}`] });
  return out;
}

export function SetupIssues({ refreshKey }) {
  const status = useAsync(setupStatus, [refreshKey]);
  const [open, setOpen] = useState(false);
  if (status.loading || status.error || !status.data) return null;
  const issues = issuesOf(status.data);
  if (!issues.length) return null;
  const count = issues.reduce((n, i) => n + i.items.length, 0);
  return (
    <div className="rounded-lg border border-[var(--color-border-strong)] bg-[var(--color-surface-2)] px-4 py-3 text-[12.5px] text-[var(--color-text-muted)]">
      <p className="flex flex-wrap items-center gap-2">
        <AlertTriangle size={14} className="text-[var(--color-amber)]" />
        <span>{count} setup item(s) aren't applied on this site yet. Use <b className="text-[var(--color-text)]">Apply Again</b>; if they stay, server-side rules may need enabling for this site.</span>
        <button type="button" onClick={() => setOpen((v) => !v)} className="text-[var(--color-red-hover)] hover:underline">{open ? "Hide" : "Show what"}</button>
      </p>
      {open && (
        <ul className="mt-2 space-y-1.5">
          {issues.map((i) => <li key={i.module}><b className="font-medium text-[var(--color-text)]">{i.module}:</b> {i.items.join("; ")}</li>)}
        </ul>
      )}
    </div>
  );
}
