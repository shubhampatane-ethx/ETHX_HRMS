// What the automatic setup (lib/autoSetup.js) has applied on this site, module by module, and a button to apply it again.
import { Check, X } from "lucide-react";
import { Async, Panel } from "./employee/EmployeeShell";
import { useAsync } from "../lib/employeePortal";
import { setupStatus } from "../lib/siteSetup";
import { AutoSetupStatus } from "./AutoSetup";

function Ok({ ok }) {
  return ok ? <Check size={14} className="mt-0.5 shrink-0 text-[var(--color-green)]" /> : <X size={14} className="mt-0.5 shrink-0 text-[var(--color-red-hover)]" />;
}

export function SiteSetupPanel() {
  const status = useAsync(setupStatus, []);
  return (
    <Panel title="System Setup" hint="Everything the app needs on this ERPNext site: missing doctypes, custom fields, change history, field settings, server rules, role permissions and login restrictions. Applied automatically when the Administrator signs in.">
      <div className="mb-5"><AutoSetupStatus onDone={status.reload} /></div>
      <Async state={status}>
        {(st) => (
          <div className="grid grid-cols-1 gap-5 text-[12.5px] text-[var(--color-text)] lg:grid-cols-3">
            {st.modules.map((m) => (
              <div key={m.id} className="space-y-1.5">
                <p className="font-medium">{m.label}</p>
                {(m.records || []).map((r) => <p key={r.name} className="flex items-start gap-2"><Ok ok={!m.missingRecords.includes(r)} /><span>{r.what}</span></p>)}
                {(m.permissions || []).map((g) => <p key={g.role} className="flex items-start gap-2"><Ok ok={!m.missingPermissions.includes(g)} /><span>{g.what}</span></p>)}
                {m.id === "doctypes" ? <p className="flex items-start gap-2"><Ok ok={!m.missingDoctypes.length} /><span>{m.missingDoctypes.length ? `${m.missingDoctypes.length} to create: ${m.missingDoctypes.map((d) => d.name).join(", ")}` : "All present"}</span></p>
                  : (m.doctypes || []).map((d) => <p key={d.name} className="flex items-start gap-2"><Ok ok={!m.missingDoctypes.includes(d)} /><span>{d.what}</span></p>)}
                {m.id === "doctypes" && st.missingAppDoctypes.length > 0 && <p className="flex items-start gap-2 text-[var(--color-amber)]"><X size={14} className="mt-0.5 shrink-0" /><span>Not on this site and can't be created by the app (they come with ERPNext / HRMS): {st.missingAppDoctypes.join(", ")}</span></p>}
                {m.fields.length > 0 && <p className="flex items-start gap-2"><Ok ok={!m.missingFields.length} /> Custom fields {m.missingFields.length ? `- ${m.missingFields.length} missing` : `- ${m.fields.length} present`}</p>}
                {m.track.length > 0 && <p className="flex items-start gap-2"><Ok ok={!m.untracked.length} /> Change history {m.untracked.length ? `- off for ${m.untracked.join(", ")}` : "- on"}</p>}
                {(m.properties || []).length > 0 && <p className="flex items-start gap-2"><Ok ok={!m.missingProps.length} /> Field settings {m.missingProps.length ? `- ${m.missingProps.length} to apply` : "- applied"}</p>}
                {m.scripts.map((s) => <p key={s.name} className="flex items-start gap-2"><Ok ok={s.installed} /><span>{s.what}</span></p>)}
                {m.id === "recruitment" && <p className="flex items-start gap-2"><Ok ok={!st.missingSources.length} /> Candidate sources</p>}
              </div>
            ))}
            {st.modules.some((m) => m.scripts.some((s) => !s.installed)) && (
              <p className="text-[11px] text-[var(--color-text-faint)] lg:col-span-3">Server rules marked ✗ are missing or out of date. Ask your administrator to enable server-side rules for this workspace and run setup again.</p>
            )}
          </div>
        )}
      </Async>
    </Panel>
  );
}
