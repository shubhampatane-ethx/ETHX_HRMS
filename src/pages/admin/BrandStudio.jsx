import { useRef, useState } from "react";
import { Building2, Check, ImagePlus, Loader2, Palette, RefreshCw, Trash2 } from "lucide-react";
import { useBranding, cacheBranding, getSelectedBrandCompany } from "../../context/BrandingContext";
import { Button, Card } from "../../components/ui/primitives";
import { errMsg, useAsync } from "../../lib/employeePortal";
import { frappe } from "../../lib/api/frappeClient";
import { getSavedTheme, saveTheme, THEME_OPTIONS } from "../../lib/theme";
import { AdaptiveLogo } from "../../components/AdaptiveLogo";
import { confirmDialog } from "../../components/ui/dialogs";

async function loadCompanies() {
  return frappe.getList("Company", { fields: ["name", "company_name"], limit: 0, orderBy: "company_name asc" });
}

async function ensureSharedThemeField() {
  const existing = await frappe.getList("Custom Field", {
    filters: [["dt", "=", "Company"], ["fieldname", "=", "custom_hrms_theme"]],
    fields: ["name"],
    limit: 1,
  });
  const options = THEME_OPTIONS.map((theme) => theme.id).join("\n");
  if (existing.length) {
    const field = await frappe.getDoc("Custom Field", existing[0].name);
    if (field.options !== options) await frappe.updateDoc("Custom Field", field.name, { options });
    return;
  }
  await frappe.createDoc("Custom Field", {
    dt: "Company",
    fieldname: "custom_hrms_theme",
    label: "HRMS Theme",
    fieldtype: "Select",
    options,
    insert_after: "company_logo",
    default: THEME_OPTIONS[0].id,
  });
}

function ThemePreview({ theme, selected, onClick, disabled }) {
  const [base, accent, foreground] = theme.swatches;
  return (
    <button type="button" aria-pressed={selected} disabled={disabled} onClick={onClick} className={`group overflow-hidden rounded-lg border text-left transition-all disabled:cursor-wait disabled:opacity-60 ${selected ? "border-[var(--color-red)] ring-2 ring-[var(--color-red-wash)]" : "border-[var(--color-border)] hover:-translate-y-0.5 hover:border-[var(--color-border-strong)]"}`}>
      <span className="block p-2" style={{ backgroundColor: base }}>
        <span className="flex h-16 gap-2 overflow-hidden rounded border" style={{ borderColor: `${foreground}24`, backgroundColor: `${foreground}08` }}>
          <span className="w-8 shrink-0 p-1.5" style={{ backgroundColor: `${foreground}0a` }}>
            <span className="mb-1 block h-1 w-full rounded" style={{ backgroundColor: `${foreground}30` }} />
            <span className="mb-1 block h-1 w-4/5 rounded" style={{ backgroundColor: `${foreground}18` }} />
            <span className="block h-1 w-3/5 rounded" style={{ backgroundColor: `${foreground}18` }} />
          </span>
          <span className="flex flex-1 flex-col justify-between p-2">
            <span className="block h-2 w-2/5 rounded" style={{ backgroundColor: `${foreground}60` }} />
            <span className="flex items-end gap-1"><span className="h-4 w-1/3 rounded-sm" style={{ backgroundColor: `${accent}b0` }} /><span className="h-6 w-1/3 rounded-sm" style={{ backgroundColor: accent }} /><span className="h-3 w-1/3 rounded-sm" style={{ backgroundColor: `${accent}90` }} /></span>
          </span>
        </span>
      </span>
      <span className="flex items-start justify-between gap-2 p-3">
        <span><span className="block text-[13px] font-semibold text-[var(--color-text)]">{theme.name}</span><span className="mt-0.5 block text-[11px] leading-4 text-[var(--color-text-muted)]">{theme.detail}</span></span>
        {selected && <Check size={15} className="mt-0.5 shrink-0 text-[var(--color-red-hover)]" />}
      </span>
    </button>
  );
}

/** Company branding: logo and shared theme per ERPNext Company (restored - it was dropped from Settings). */
export default function BrandStudio() {
  const { company: activeCompany, refresh: refreshBranding, selectCompany } = useBranding();
  const companiesQuery = useAsync(loadCompanies, []);
  const [selectedCompany, setSelectedCompany] = useState(getSelectedBrandCompany);
  const [themeDraft, setThemeDraft] = useState(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const fileRef = useRef(null);

  const companies = companiesQuery.data || [];
  const validSelectedCompany = !companies.length || companies.some((item) => item.name === selectedCompany) ? selectedCompany : "";
  const companyName = validSelectedCompany || activeCompany?.name || companies[0]?.name || "";
  const companyQuery = useAsync(() => companyName ? frappe.getDoc("Company", companyName) : Promise.resolve(null), [companyName]);
  const currentCompany = companyQuery.data?.name === companyName ? companyQuery.data : activeCompany?.name === companyName ? activeCompany : null;
  const savedTheme = currentCompany?.custom_hrms_theme || getSavedTheme(companyName);
  const selectedTheme = themeDraft?.companyName === companyName ? themeDraft.id : savedTheme;

  function changeCompany(name) {
    setSelectedCompany(name);
    selectCompany(name);
    setThemeDraft(null);
    setError("");
    setMessage("");
  }

  async function chooseTheme(theme) {
    if (!companyName) return;
    if (!(await confirmDialog(`Make ${theme.name} the shared theme for ${currentCompany?.company_name || companyName}? Everyone in this company sees it.`))) return;
    setThemeDraft({ companyName, id: theme.id });
    saveTheme(theme.id, companyName);
    setBusy("theme");
    setError("");
    setMessage("");
    try {
      await ensureSharedThemeField();
      await frappe.updateDoc("Company", companyName, { custom_hrms_theme: theme.id });
      setThemeDraft(null);
      companyQuery.reload();
      refreshBranding();
      setMessage(`${theme.name} is now the shared theme for ${currentCompany?.company_name || companyName}.`);
    } catch (e) {
      setError(`Theme preview is active on this browser, but the shared theme could not be saved. ${errMsg(e, "Check company permissions.")}`);
    } finally {
      setBusy("");
    }
  }

  async function uploadLogo(file) {
    if (!file || !companyName) return;
    if (!file.type.startsWith("image/")) return setError("Choose an image file for the company logo.");
    if (file.size > 3 * 1024 * 1024) return setError("Logo files must be 3 MB or smaller.");
    if (!(await confirmDialog({ title: "Upload company logo", message: `Use "${file.name}" as the logo for ${currentCompany?.company_name || companyName}?` }))) { if (fileRef.current) fileRef.current.value = ""; return; }
    setBusy("logo");
    setError("");
    setMessage("");
    try {
      const uploaded = await frappe.uploadFile(file, { doctype: "Company", docname: companyName, isPrivate: false });
      if (!uploaded?.file_url) throw new Error("The upload did not return a public file URL.");
      const saved = await frappe.updateDoc("Company", companyName, { company_logo: uploaded.file_url });
      cacheBranding(saved || { ...currentCompany, company_logo: uploaded.file_url });
      companyQuery.reload();
      refreshBranding();
      setMessage(`Logo updated for ${currentCompany?.company_name || companyName}.`);
    } catch (e) {
      setError(errMsg(e, "Could not upload the company logo. Check Company write and File upload permissions."));
    } finally {
      setBusy("");
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function removeLogo() {
    if (!companyName || !currentCompany?.company_logo) return;
    if (!(await confirmDialog({ message: `Remove the logo of ${currentCompany?.company_name || companyName}? The default logo is shown instead.`, danger: true, confirmLabel: "Remove" }))) return;
    setBusy("logo");
    setError("");
    setMessage("");
    try {
      const saved = await frappe.updateDoc("Company", companyName, { company_logo: "" });
      cacheBranding(saved || { ...currentCompany, company_logo: "" });
      companyQuery.reload();
      refreshBranding();
      setMessage(`Company logo removed for ${currentCompany.company_name || companyName}.`);
    } catch (e) {
      setError(errMsg(e, "Could not remove the company logo."));
    } finally {
      setBusy("");
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <section className="relative overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-5 py-5 sm:px-7 sm:py-6">
        <div className="pointer-events-none absolute inset-y-0 right-0 hidden w-1/2 opacity-60 sm:block" style={{ background: "linear-gradient(115deg, transparent, color-mix(in srgb, var(--color-red) 10%, transparent))" }} />
        <div className="relative flex flex-wrap items-end justify-between gap-5">
          <div className="max-w-xl">
            <p className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--color-red-hover)]"><Palette size={14} /> Tenant identity</p>
            <h1 className="text-xl font-semibold text-[var(--color-text)]">Brand Studio</h1>
            <p className="mt-1.5 text-[13px] leading-5 text-[var(--color-text-muted)]">Give every company its own logo and color system. Changes are shared with that company’s users.</p>
          </div>
          <label className="min-w-60">
            <span className="mb-1.5 block text-[11px] font-medium uppercase tracking-wide text-[var(--color-text-muted)]">Company workspace</span>
            <span className="relative block">
              <Building2 size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-text-faint)]" />
              <select value={companyName} onChange={(event) => changeCompany(event.target.value)} disabled={companiesQuery.loading || !companies.length} className="w-full appearance-none rounded-md border border-[var(--color-border-strong)] bg-[var(--color-surface-2)] py-2 pl-9 pr-3 text-[13px] text-[var(--color-text)] outline-none focus:border-[var(--color-red)]">
                {!companyName && <option value="">No company available</option>}
                {companies.map((item) => <option key={item.name} value={item.name}>{item.company_name || item.name}</option>)}
              </select>
            </span>
          </label>
        </div>
      </section>

      {(error || companiesQuery.error || companyQuery.error) && <p role="alert" className="rounded-md border border-[var(--color-red-deep)] bg-[var(--color-red-wash)] px-4 py-3 text-[12px] text-[var(--color-red-hover)]">{error || errMsg(companiesQuery.error || companyQuery.error, "Unable to load company branding.")}</p>}
      {message && <p role="status" className="rounded-md border border-[var(--color-green)]/30 bg-[color-mix(in_srgb,var(--color-green)_10%,transparent)] px-4 py-3 text-[12px] text-[var(--color-green)]">{message}</p>}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1.45fr)_minmax(280px,0.75fr)]">
        <section className="space-y-3">
          <div className="flex items-end justify-between gap-3">
            <div><h2 className="text-[14px] font-semibold text-[var(--color-text)]">Theme System</h2><p className="mt-0.5 text-[12px] text-[var(--color-text-muted)]">Choose a complete color palette for this company.</p></div>
            {busy === "theme" && <span className="flex items-center gap-1.5 text-[11px] text-[var(--color-text-muted)]"><Loader2 size={13} className="animate-spin" />Saving</span>}
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {THEME_OPTIONS.map((theme) => <ThemePreview key={theme.id} theme={theme} selected={selectedTheme === theme.id} disabled={!companyName || Boolean(busy)} onClick={() => chooseTheme(theme)} />)}
          </div>
        </section>

        <section className="space-y-3">
          <div><h2 className="text-[14px] font-semibold text-[var(--color-text)]">Company Logo</h2><p className="mt-0.5 text-[12px] text-[var(--color-text-muted)]">A clear, horizontal image works best in navigation.</p></div>
          <Card className="overflow-hidden">
            <div className="flex min-h-40 items-center justify-center bg-[var(--color-surface-2)] p-6">
              {companyQuery.loading && !currentCompany ? <Loader2 size={18} className="animate-spin text-[var(--color-text-muted)]" /> : (
                <div className="flex max-w-full items-center gap-4">
                  <AdaptiveLogo src={currentCompany?.company_logo || "/ethx-logo.svg"} alt="Company logo preview" className="max-h-16 max-w-44 object-contain" />
                  <span className="min-w-0 border-l border-[var(--color-border-strong)] pl-4"><span className="block truncate text-[14px] font-semibold text-[var(--color-text)]">{currentCompany?.company_name || currentCompany?.name || "Your company"}</span><span className="mt-0.5 block text-[10px] font-medium uppercase tracking-[0.14em] text-[var(--color-text-muted)]">People platform</span></span>
                </div>
              )}
            </div>
            <div className="space-y-3 p-4">
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(event) => uploadLogo(event.target.files?.[0])} />
              <Button type="button" className="w-full" disabled={!companyName || Boolean(busy)} onClick={() => fileRef.current?.click()}>{busy === "logo" ? <Loader2 size={14} className="animate-spin" /> : <ImagePlus size={14} />}{busy === "logo" ? "Uploading logo…" : "Upload company logo"}</Button>
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] text-[var(--color-text-faint)]">PNG, JPG, WebP or SVG · max 3 MB</span>
                {currentCompany?.company_logo && <button type="button" disabled={Boolean(busy)} onClick={removeLogo} className="flex shrink-0 items-center gap-1 text-[11px] text-[var(--color-text-muted)] hover:text-[var(--color-red-hover)] disabled:opacity-50"><Trash2 size={12} /> Remove</button>}
              </div>
            </div>
          </Card>
        </section>
      </div>

      <Card className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
        <span className="flex items-center gap-2 text-[12px] text-[var(--color-text-muted)]"><Check size={14} className="text-[var(--color-green)]" /> Company logo and theme are stored with the selected company.</span>
        <Button type="button" variant="ghost" disabled={Boolean(busy)} onClick={() => { companiesQuery.reload(); companyQuery.reload(); refreshBranding(); }}><RefreshCw size={13} /> Refresh</Button>
      </Card>
    </div>
  );
}
