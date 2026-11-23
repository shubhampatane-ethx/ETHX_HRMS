// The super admin's client switch (sidebar, under the logo). Picking a company makes it the client the whole app is
// looking at: its branding, its people on the admin pages and its records in the HR and Project workspaces
// (lib/clientScope.js). Adding a company starts here too. Only the Administrator account sees it.
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Building2, Check, ChevronsUpDown, Plus, Search, Settings2 } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { useBranding } from "../../context/BrandingContext";
import { frappe } from "../../lib/api/frappeClient";
import { useClientScope } from "../../lib/clientScope";
import { useAsync } from "../../lib/employeePortal";
import { SUPER_ADMIN } from "../../lib/modules";
import { LinkField } from "../ui/primitives";
import { AddCompanyModal } from "../admin/AddCompanyModal";

export function ClientSwitcher() {
  const { user } = useAuth();
  if (user?.email !== SUPER_ADMIN) return null;
  return <Switcher />;
}

// A company's badge: its abbreviation, or the initials of its name.
const initials = (c) => (c?.abbr || String(c?.company_name || c?.name || "?").split(/\s+/).map((w) => w[0]).join("")).slice(0, 3).toUpperCase();

function Badge({ company, small = false }) {
  return (
    <span className={`flex shrink-0 items-center justify-center rounded-lg font-semibold tracking-wide text-white shadow-sm ${small ? "h-7 w-7 text-[10px]" : "h-9 w-9 text-[11px]"}`}
      style={{ background: "linear-gradient(135deg, var(--color-red) 0%, var(--color-red-deep) 100%)" }}>
      {initials(company)}
    </span>
  );
}

function Switcher() {
  const client = useClientScope();
  const { selectCompany } = useBranding();
  // Reloaded when the client changes, so a company just added (and switched to) is in the list.
  const companies = useAsync(() => frappe.getList("Company", { fields: ["name", "company_name", "abbr", "country"], orderBy: "name asc", limit: 0 }), [client]);
  const list = useMemo(() => companies.data || [], [companies.data]);
  const current = list.find((c) => c.name === client) || (client ? { name: client } : null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [adding, setAdding] = useState(false);
  const navigate = useNavigate();
  const box = useRef(null);

  // The menu closes on a click outside it or Escape.
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => { if (box.current && !box.current.contains(e.target)) { setOpen(false); setQuery(""); } };
    const onKey = (e) => { if (e.key === "Escape") { setOpen(false); setQuery(""); } };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open]);

  const q = query.trim().toLowerCase();
  const shown = list.filter((c) => !q || `${c.name} ${c.company_name || ""} ${c.abbr || ""} ${c.country || ""}`.toLowerCase().includes(q));
  const close = () => { setOpen(false); setQuery(""); };
  const pick = (name) => { close(); if (name !== client) selectCompany(name); };

  return (
    <div ref={box} className="relative mt-4">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-haspopup="listbox" aria-expanded={open} title="Switch or add a client"
        className={`group flex w-full items-center gap-3 rounded-xl border p-2.5 text-left transition-colors ${open ? "border-[var(--color-red-deep)] bg-[var(--color-red-wash)]" : "border-[var(--color-border)] bg-[var(--color-surface-2)] hover:border-[var(--color-border-strong)]"}`}>
        {current ? <Badge company={current} /> : <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-dashed border-[var(--color-border-strong)] text-[var(--color-text-muted)]"><Building2 size={15} /></span>}
        <span className="min-w-0 flex-1">
          <span className="block text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--color-text-faint)]">Viewing Client</span>
          <span className="block truncate text-[13px] font-semibold text-[var(--color-text)]">{current ? current.company_name || current.name : companies.loading ? "Loading…" : "Choose a client"}</span>
        </span>
        <ChevronsUpDown size={14} className="shrink-0 text-[var(--color-text-muted)] transition-colors group-hover:text-[var(--color-text)]" />
      </button>

      {open && (
        <div className="absolute left-0 right-0 top-full z-40 mt-1.5 overflow-hidden rounded-xl border border-[var(--color-border-strong)] bg-[var(--color-surface)] shadow-2xl shadow-black/40">
          {list.length > 5 && (
            <label className="relative block border-b border-[var(--color-border)]">
              <Search size={13} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-text-faint)]" />
              <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search clients…" aria-label="Search clients"
                className="w-full bg-transparent py-2.5 pl-8 pr-3 text-[12.5px] text-[var(--color-text)] outline-none placeholder:text-[var(--color-text-faint)]" />
            </label>
          )}
          <div role="listbox" aria-label="Clients" className="max-h-64 overflow-y-auto p-1.5">
            <p className="px-2 pb-1 pt-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--color-text-faint)]">{list.length} {list.length === 1 ? "Client" : "Clients"}</p>
            {shown.map((c) => {
              const active = c.name === client;
              return (
                <button key={c.name} type="button" role="option" aria-selected={active} onClick={() => pick(c.name)}
                  className={`flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors ${active ? "bg-[var(--color-red-wash)]" : "hover:bg-[var(--color-surface-2)]"}`}>
                  <Badge company={c} small />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[12.5px] font-medium text-[var(--color-text)]">{c.company_name || c.name}</span>
                    {c.country && <span className="block truncate text-[11px] text-[var(--color-text-muted)]">{c.country}</span>}
                  </span>
                  {active && <Check size={14} className="shrink-0 text-[var(--color-red-hover)]" />}
                </button>
              );
            })}
            {!shown.length && <p className="px-2 py-3 text-center text-[12px] text-[var(--color-text-muted)]">{companies.loading ? "Loading…" : "No client matches."}</p>}
          </div>
          <div className="border-t border-[var(--color-border)] p-1.5">
            <button type="button" onClick={() => { close(); setAdding(true); }}
              className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-[12.5px] font-medium text-[var(--color-red-hover)] hover:bg-[var(--color-red-wash)]">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg border border-dashed border-[var(--color-red-deep)]"><Plus size={14} /></span>Add Company
            </button>
            <button type="button" onClick={() => { close(); navigate("/admin/modules"); }}
              className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-[12.5px] text-[var(--color-text-muted)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text)]">
              <span className="flex h-7 w-7 items-center justify-center"><Settings2 size={14} /></span>Modules &amp; People
            </button>
          </div>
        </div>
      )}
      {/* A new client is switched to and opened on Modules & People, where its modules and people are set. */}
      {adding && <AddCompanyModal onClose={() => setAdding(false)} onAdded={(name) => { setAdding(false); selectCompany(name); navigate("/admin/modules"); }} />}
    </div>
  );
}

/** For pages that can't be split per client (ERPNext keeps them site-wide): says so to the super admin. */
export function SharedAcrossClients({ what = "This page" }) {
  const { user } = useAuth();
  if (user?.email !== SUPER_ADMIN) return null;
  return (
    <span title={`${what} is the same for every client on this site - the client you're viewing doesn't change it.`}
      className="inline-flex items-center gap-1.5 rounded-full border border-[var(--color-border-strong)] px-2.5 py-1 text-[11px] font-medium text-[var(--color-text-muted)]">
      <Building2 size={12} /> Shared by All Clients
    </span>
  );
}

/**
 * The Company field of forms that create accounts (HR users, Project Managers). While the super admin is viewing a
 * client, new accounts belong to that client - shown, not chosen again - so the company is picked in one place only.
 */
export function CompanyField({ value, onChange, required }) {
  const client = useClientScope();
  if (!client) return <LinkField label="Company" linkDoctype="Company" value={value} onChange={onChange} required={required} frappe={frappe} />;
  return (
    <label className="block">
      <span className="mb-1.5 block text-[12px] text-[var(--color-text-muted)]">Company</span>
      <input readOnly value={client} title="The client you're viewing - switch it in the sidebar"
        className="w-full cursor-default rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-[13px] text-[var(--color-text)] outline-none" />
    </label>
  );
}
