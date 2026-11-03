import { useRef, useState } from "react";
import { Building2, Check, ImagePlus, Loader2, Palette, RefreshCw, Trash2 } from "lucide-react";
import { useBranding, cacheBranding, getSelectedBrandCompany } from "../../context/BrandingContext";
import { Button, Card } from "../../components/ui/primitives";
import { errMsg, useAsync } from "../../lib/employeePortal";
import { frappe } from "../../lib/api/frappeClient";
import { getSavedTheme, isLightTheme, saveTheme, THEME_OPTIONS } from "../../lib/theme";
import { Brand } from "../../components/Brand";
import { confirmDialog } from "../../components/ui/dialogs";

async function loadCompanies() {
  return frappe.getList("Company", { fields: ["name", "company_name"], limit: 0, orderBy: "company_name asc" });
}

/** Adds a field to Company the first time it is needed (and keeps a Select's options current). */
async function ensureCompanyField(fieldname, props) {
  const existing = await frappe.getList("Custom Field", {
    filters: [["dt", "=", "Company"], ["fieldname", "=", fieldname]],
    fields: ["name"],
    limit: 1,
  });
  if (existing.length) {
    if (!props.options) return;
    const field = await frappe.getDoc("Custom Field", existing[0].name);
    if (field.options !== props.options) await frappe.updateDoc("Custom Field", field.name, { options: props.options });
    return;
  }
  await frappe.createDoc("Custom Field", { dt: "Company", fieldname, insert_after: "company_logo", ...props });
}

const ensureSharedThemeField = () => ensureCompanyField("custom_hrms_theme", {
  label: "HRMS Theme",
  fieldtype: "Select",
  options: THEME_OPTIONS.map((theme) => theme.id).join("\n"),
  default: THEME_OPTIONS[0].id,
});

const themeNames = (light) => THEME_OPTIONS.filter((theme) => isLightTheme(theme.id) === light).map((theme) => theme.name).join(" and ");

// The light-theme logo is the Company's own logo field; the dark-theme one is an added field.
const LOGO_SLOTS = [
  { field: "company_logo", mode: "light", title: "Light Theme Logo", themes: themeNames(true), other: "dark", background: "#ffffff", caption: "#6b6b75" },
  { field: "custom_hrms_dark_logo", mode: "dark", title: "Dark Theme Logo", themes: themeNames(false), other: "light", background: "#0f0f12", caption: "#9a9aa3" },
];

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
  const fileRefs = useRef({});

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

  async function saveLogo(slot, url) {
    if (slot.field !== "company_logo") await ensureCompanyField(slot.field, { label: "HRMS Dark Theme Logo", fieldtype: "Attach Image" });
    const saved = await frappe.updateDoc("Company", companyName, { [slot.field]: url });
    cacheBranding(saved || { ...currentCompany, [slot.field]: url });
    companyQuery.reload();
    refreshBranding();
  }

  async function uploadLogo(slot, file) {
    const clearInput = () => { if (fileRefs.current[slot.field]) fileRefs.current[slot.field].value = ""; };
    if (!file || !companyName) return;
    if (!file.type.startsWith("image/")) { clearInput(); return setError("Choose an image file for the logo."); }
    if (file.size > 3 * 1024 * 1024) { clearInput(); return setError("Logo files must be 3 MB or smaller."); }
    if (!(await confirmDialog({ title: `Upload ${slot.title}`, message: `Use "${file.name}" as the ${slot.mode}-theme logo of ${currentCompany?.company_name || companyName}? It is shown on ${slot.themes}.` }))) { clearInput(); return; }
    setBusy(slot.field);
    setError("");
    setMessage("");
    try {
      const uploaded = await frappe.uploadFile(file, { doctype: "Company", docname: companyName, isPrivate: false });
      if (!uploaded?.file_url) throw new Error("The upload did not return a public file URL.");
      await saveLogo(slot, uploaded.file_url);
      setMessage(`${slot.title} updated for ${currentCompany?.company_name || companyName}.`);
    } catch (e) {
      setError(errMsg(e, "Could not upload the logo. Check Company write and File upload permissions."));
    } finally {
      setBusy("");
      clearInput();
    }
  }

  async function removeLogo(slot) {
    if (!companyName || !currentCompany?.[slot.field]) return;
    const fallback = currentCompany?.[LOGO_SLOTS.find((s) => s.mode === slot.other).field] ? `the ${slot.other}-theme logo is adjusted to fit` : "the default logo is shown";
    if (!(await confirmDialog({ title: `Remove ${slot.title}`, message: `Remove the ${slot.mode}-theme logo of ${currentCompany?.company_name || companyName}? On ${slot.themes}, ${fallback} instead.`, danger: true, confirmLabel: "Remove" }))) return;
    setBusy(slot.field);
    setError("");
    setMessage("");
    try {
      await saveLogo(slot, "");
      setMessage(`${slot.title} removed for ${currentCompany.company_name || companyName}.`);
    } catch (e) {
      setError(errMsg(e, "Could not remove the logo."));
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
            <span className="mb-1.5 block text-[11px] font-medium uppercase tracking-wide text-[var(--color-text-muted)]">Company Workspace</span>
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
          <div><h2 className="text-[14px] font-semibold text-[var(--color-text)]">Company Logos</h2><p className="mt-0.5 text-[12px] text-[var(--color-text-muted)]">Upload one logo for light themes and one for dark themes. With only one uploaded, it is adjusted to fit the other themes.</p></div>
          {LOGO_SLOTS.map((slot) => {
            const uploaded = currentCompany?.[slot.field] || "";
            const loading = companyQuery.loading && !currentCompany;
            return (
              <Card key={slot.field} className="overflow-hidden">
                {/* The logo as it appears in navigation on these themes - its own upload, or the other one adjusted. */}
                <div className="flex min-h-24 items-center p-4" style={{ background: slot.background }}>
                  {loading ? <Loader2 size={18} className="mx-auto animate-spin" style={{ color: slot.caption }} /> : <Brand size="compact" showName={false} logo={currentCompany?.company_logo || ""} darkLogo={currentCompany?.custom_hrms_dark_logo || ""} mode={slot.mode} />}
                </div>
                <div className="space-y-3 p-4">
                  <div>
                    <p className="text-[13px] font-semibold text-[var(--color-text)]">{slot.title}</p>
                    <p className="mt-0.5 text-[11px] text-[var(--color-text-muted)]">Shown on {slot.themes}.{!loading && !uploaded && " Not uploaded yet: the preview shows what is used instead."}</p>
                  </div>
                  <input ref={(node) => { fileRefs.current[slot.field] = node; }} type="file" accept="image/*" className="hidden" onChange={(event) => uploadLogo(slot, event.target.files?.[0])} />
                  <Button type="button" className="w-full" disabled={!companyName || Boolean(busy)} onClick={() => fileRefs.current[slot.field]?.click()}>{busy === slot.field ? <Loader2 size={14} className="animate-spin" /> : <ImagePlus size={14} />}{busy === slot.field ? "Uploading Logo…" : uploaded ? `Replace ${slot.title}` : `Upload ${slot.title}`}</Button>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] text-[var(--color-text-faint)]">PNG, JPG, WebP or SVG · max 3 MB</span>
                    {uploaded && <button type="button" disabled={Boolean(busy)} onClick={() => removeLogo(slot)} className="flex shrink-0 items-center gap-1 text-[11px] text-[var(--color-text-muted)] hover:text-[var(--color-red-hover)] disabled:opacity-50"><Trash2 size={12} /> Remove</button>}
                  </div>
                </div>
              </Card>
            );
          })}
          {/* The company name is separate text from the Company record - never part of the logo image. */}
          <Card className="px-4 py-3">
            <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-[var(--color-text-muted)]">Company Name</p>
            <p className="break-words text-[15px] font-bold text-[var(--color-text)]">{currentCompany?.company_name || currentCompany?.name || "Your company"}</p>
          </Card>
        </section>
      </div>

      <Card className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
        <span className="flex items-center gap-2 text-[12px] text-[var(--color-text-muted)]"><Check size={14} className="text-[var(--color-green)]" /> Company logos and theme are stored with the selected company.</span>
        <Button type="button" variant="ghost" disabled={Boolean(busy)} onClick={() => { companiesQuery.reload(); companyQuery.reload(); refreshBranding(); }}><RefreshCw size={13} /> Refresh</Button>
      </Card>
    </div>
  );
}
