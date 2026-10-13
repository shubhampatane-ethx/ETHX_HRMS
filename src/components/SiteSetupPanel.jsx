// One-click ERPNext setup for every module (custom fields, change history, field restrictions, server rules).
import { useState } from "react";
import { Check, Loader2, Wand2, X } from "lucide-react";
import { Button } from "./ui/primitives";
import { Async, Panel } from "./employee/EmployeeShell";
import { errMsg, useAsync } from "../lib/employeePortal";
import { runSetup, setupStatus } from "../lib/siteSetup";

function Ok({ ok }) {
  return ok ? <Check size={14} className="mt-0.5 shrink-0 text-[var(--color-green)]" /> : <X size={14} className="mt-0.5 shrink-0 text-[var(--color-red-hover)]" />;
}

export function SiteSetupPanel() {
  const status = useAsync(setupStatus, []);
  const [log, setLog] = useState(null);
  const [busy, setBusy] = useState(false);
  async function run() {
    setBusy(true);
    setLog([]);
    try {
      await runSetup(setLog);
    } catch (e) {
      setLog((l) => [...(l || []), { ok: false, text: errMsg(e, "Setup stopped.") }]);
    }
    setBusy(false);
    status.reload();
  }
  return (
    <Panel title="ERPNext setup" hint="Adds the fields the app uses, switches on change history, restricts sensitive fields and installs the server-side rules. Safe to run again - it only adds or updates what's missing or out of date." action={<Button onClick={run} disabled={busy}>{busy ? <Loader2 size={14} className="animate-spin" /> : <Wand2 size={14} />} Run setup</Button>}>
      <Async state={status}>
        {(st) => (
          <div className="grid grid-cols-1 gap-5 text-[12.5px] text-[var(--color-text)] lg:grid-cols-3">
            {st.modules.map((m) => (
              <div key={m.id} className="space-y-1.5">
                <p className="font-medium">{m.label}</p>
                {m.fields.length > 0 && <p className="flex items-start gap-2"><Ok ok={!m.missingFields.length} /> Custom fields {m.missingFields.length ? `- ${m.missingFields.length} missing` : `- ${m.fields.length} present`}</p>}
                {m.track.length > 0 && <p className="flex items-start gap-2"><Ok ok={!m.untracked.length} /> Change history {m.untracked.length ? `- off for ${m.untracked.join(", ")}` : "- on"}</p>}
                {(m.properties || []).length > 0 && <p className="flex items-start gap-2"><Ok ok={!m.missingProps.length} /> Field restrictions {m.missingProps.length ? `- ${m.missingProps.length} to apply` : "- applied"}</p>}
                {m.scripts.map((s) => <p key={s.name} className="flex items-start gap-2"><Ok ok={s.installed} /><span>{s.what}</span></p>)}
                {m.id === "recruitment" && <p className="flex items-start gap-2"><Ok ok={!st.missingSources.length} /> Candidate sources</p>}
              </div>
            ))}
            {st.modules.some((m) => m.scripts.some((s) => !s.installed)) && (
              <p className="text-[11px] text-[var(--color-text-faint)] lg:col-span-3">Server rules marked ✗ are missing or out of date - run setup. Server scripts must be enabled on the ERPNext site (<code>bench set-config -g server_script_enabled 1</code>, then restart). Without them the app falls back to browser-side checks, which could be bypassed through the ERPNext desk or API.</p>
            )}
            <p className="text-[11px] text-[var(--color-text-faint)] lg:col-span-3">After setup: Admin › Roles & Permissions › Apply everything, so each role gets the new permissions. Everyone signs out and back in.</p>
          </div>
        )}
      </Async>
      {log && log.length > 0 && (
        <ul className="mt-4 max-h-64 space-y-1 overflow-y-auto rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] p-3 text-[12px]">
          {log.map((l, i) => <li key={i} className={l.ok ? "text-[var(--color-text-muted)]" : "text-[var(--color-red-hover)]"}>{l.ok ? "✓" : "✗"} {l.text}</li>)}
        </ul>
      )}
    </Panel>
  );
}
