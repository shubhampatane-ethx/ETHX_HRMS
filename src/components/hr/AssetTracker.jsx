// HR › Asset Management: the tracker above the register - who holds what, where the rest is, what needs attention,
// and the latest movements. Built from the app's own Stat / Panel / BarList so it reads like the other pages.
import { useState } from "react";
import { AlertTriangle, ArrowRight, ArrowRightLeft, Building2, Laptop, MapPin, PackageCheck, Undo2, Users } from "lucide-react";
import { Empty, Panel, Stat } from "../employee/EmployeeShell";
import { BarList } from "../charts/Charts";
import { dmy } from "../../lib/employeePortal";
import { assetLabel } from "../../lib/assetTracking";

const initials = (n = "") => n.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join("");
const SHOW = 6;

function AssetChip({ a, issues }) {
  return (
    <span title={[a.asset_name, a.asset_category, a.custom_serial_number && `S/N ${a.custom_serial_number}`, a.location && `at ${a.location}`, ...(issues || [])].filter(Boolean).join(" · ")}
      className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11.5px] ${issues?.length ? "border-[color-mix(in_srgb,var(--color-amber)_45%,transparent)] bg-[color-mix(in_srgb,var(--color-amber)_8%,transparent)]" : "border-[var(--color-border)] bg-[var(--color-surface-2)]"}`}>
      {issues?.length ? <AlertTriangle size={11} className="text-[var(--color-amber)]" /> : <Laptop size={11} className="text-[var(--color-text-faint)]" />}
      <b className="font-medium text-[var(--color-text)]">{assetLabel(a)}</b>
      <span className="text-[var(--color-text-muted)]">{a.custom_asset_code ? a.asset_name : a.asset_category}</span>
      {a.location && <span className="flex items-center gap-0.5 text-[var(--color-text-faint)]"><MapPin size={10} />{a.location}</span>}
    </span>
  );
}

export function AssetTracker({ assets, track, movements, onFind, onMove }) {
  const [all, setAll] = useState(false);
  const holders = all ? track.holders : track.holders.slice(0, SHOW);
  const name = (id) => track.empById[id]?.employee_name || id;
  return (
    <>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <Stat icon={Laptop} label="Total Assets" value={assets.length} sub={`${track.byType.length} type(s)`} accent="#4f8cff" />
        <Stat icon={Users} label="With Employees" value={track.assigned} sub={`Held by ${track.holders.length} ${track.holders.length === 1 ? "person" : "people"}`} accent="var(--color-green)" />
        <Stat icon={Building2} label="In Office / Store" value={track.inOffice} sub={`${track.places.length} location(s)`} accent="var(--color-amber)" />
        <Stat icon={Undo2} label="Returned" value={track.returned} sub="Back from employees" accent="var(--color-text-muted)" />
        <Stat icon={AlertTriangle} label="Needs Attention" value={track.attention.length} sub={track.attention.length ? "See the list below" : "All clear"} accent="var(--color-red-hover)" />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Panel title="Who Has What" hint="Every asset out with an employee, and where the rest are kept" className="xl:col-span-2">
          {track.holders.length === 0 && track.places.length === 0 ? <Empty text="No assets yet." /> : (
            <div className="space-y-2">
              {holders.map((h) => (
                <div key={h.id} className="flex flex-wrap items-start gap-3 rounded-lg border border-[var(--color-border)] p-3">
                  <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[12px] font-semibold ${h.employee.status === "Left" ? "bg-[var(--color-red-wash)] text-[var(--color-red-hover)]" : "bg-[color-mix(in_srgb,var(--color-green)_16%,transparent)] text-[var(--color-green)]"}`}>{initials(h.employee.employee_name)}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <button type="button" onClick={() => onFind(h.employee.employee_name)} className="text-[13px] font-medium text-[var(--color-text)] hover:underline">{h.employee.employee_name}</button>
                      <span className="text-[11.5px] text-[var(--color-text-faint)]">{[h.employee.employee_number || h.employee.name, h.employee.department].filter(Boolean).join(" · ")}</span>
                      {h.employee.status === "Left" && <span className="rounded-full bg-[var(--color-red-wash)] px-2 py-0.5 text-[11px] font-medium text-[var(--color-red-hover)]">Left · recover assets</span>}
                      <span className="ml-auto rounded-full bg-[var(--color-surface-2)] px-2 py-0.5 text-[11px] text-[var(--color-text-muted)]">{h.assets.length} {h.assets.length === 1 ? "asset" : "assets"}</span>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1.5">{h.assets.map((a) => <AssetChip key={a.name} a={a} issues={track.issues[a.name]} />)}</div>
                  </div>
                </div>
              ))}
              {track.holders.length > SHOW && <button type="button" onClick={() => setAll(!all)} className="text-[12px] text-[var(--color-red-hover)] hover:underline">{all ? "Show fewer" : `Show all ${track.holders.length} people`}</button>}
              {track.places.map((p) => (
                <div key={p.where} className="flex flex-wrap items-start gap-3 rounded-lg border border-dashed border-[var(--color-border-strong)] p-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[color-mix(in_srgb,var(--color-amber)_16%,transparent)] text-[var(--color-amber)]"><Building2 size={16} /></span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[13px] font-medium text-[var(--color-text)]">Not with anyone · {p.where}</span>
                      <span className="ml-auto rounded-full bg-[var(--color-surface-2)] px-2 py-0.5 text-[11px] text-[var(--color-text-muted)]">{p.assets.length} {p.assets.length === 1 ? "asset" : "assets"}</span>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1.5">{p.assets.map((a) => <AssetChip key={a.name} a={a} issues={track.issues[a.name]} />)}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Panel>

        <div className="space-y-4">
          <Panel title="Where They Are" hint="Assets by location"><BarList rows={track.byLocation} max={8} /></Panel>
          <Panel title="By Type" hint="Assets by category"><BarList rows={track.byType} max={8} /></Panel>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Panel title="Needs Attention" hint="Assets with someone who left, damaged, drafts and missing or repeated codes">
          {track.attention.length === 0 ? <Empty icon={PackageCheck} text="Nothing to follow up." /> : (
            <ul className="divide-y divide-[var(--color-border)]">
              {track.attention.map((a) => (
                <li key={a.name} className="flex items-start justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <p className="text-[13px] font-medium text-[var(--color-text)]">{assetLabel(a)} <span className="font-normal text-[var(--color-text-muted)]">· {a.asset_name}</span></p>
                    <p className="text-[11.5px] text-[var(--color-text-muted)]">{a.custodian ? `With ${name(a.custodian)}` : `In ${a.location || "the office"}`}{a.custodian && a.location ? ` · ${a.location}` : ""}</p>
                    <ul className="mt-1 space-y-0.5">{track.issues[a.name].map((i) => <li key={i} className="flex items-start gap-1 text-[11.5px] text-[var(--color-red-hover)]"><AlertTriangle size={11} className="mt-0.5 shrink-0" />{i}</li>)}</ul>
                  </div>
                  {Number(a.docstatus) === 1 && <button type="button" onClick={() => onMove(a)} className="flex shrink-0 items-center gap-1 text-[12px] text-[var(--color-red-hover)] hover:underline"><ArrowRightLeft size={13} /> {a.custodian ? "Reassign / return" : "Assign"}</button>}
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Recent Movements" hint="Issued, returned and moved - the asset's history in ERPNext">
          {movements === null ? <p className="text-[13px] text-[var(--color-text-muted)]">Loading…</p> : movements.length === 0 ? <Empty text="No movements recorded yet." /> : (
            <ol className="relative space-y-3 border-l border-[var(--color-border)] pl-4">
              {movements.map((m, i) => {
                const from = m.from_employee ? name(m.from_employee) : m.source_location || "Office";
                const to = m.to_employee ? name(m.to_employee) : m.target_location || "Office";
                const tone = m.to_employee ? "var(--color-green)" : "var(--color-amber)";
                return (
                  <li key={`${m.parent}-${m.asset}-${i}`} className="relative">
                    <span className="absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full border-2 border-[var(--color-surface)]" style={{ background: tone }} />
                    <p className="text-[12.5px] text-[var(--color-text)]"><b className="font-medium">{assets.find((a) => a.name === m.asset) ? assetLabel(assets.find((a) => a.name === m.asset)) : m.asset_name || m.asset}</b> <span className="text-[var(--color-text-muted)]">{m.purpose === "Issue" ? "issued" : m.purpose === "Receipt" ? "returned" : "moved"}</span></p>
                    <p className="flex flex-wrap items-center gap-1 text-[11.5px] text-[var(--color-text-muted)]">{from} <ArrowRight size={11} /> <span className="text-[var(--color-text)]">{to}</span> · {dmy(m.transaction_date)}</p>
                  </li>
                );
              })}
            </ol>
          )}
        </Panel>
      </div>
    </>
  );
}
