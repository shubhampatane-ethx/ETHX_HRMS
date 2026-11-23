import { useRef, useState } from "react";
import { Building2, Check, Headset, ImagePlus, Loader2, Palette, RefreshCw, Save, Trash2 } from "lucide-react";
import { useBranding, brandName, cacheBranding, getSelectedBrandCompany } from "../../context/BrandingContext";
import { Button, Card } from "../../components/ui/primitives";
import { errMsg, useAsync } from "../../lib/employeePortal";
import { frappe } from "../../lib/api/frappeClient";
import { useClientScope } from "../../lib/clientScope";
import { getSavedTheme, isLightTheme, saveTheme, THEME_OPTIONS } from "../../lib/theme";
import { Brand } from "../../components/Brand";
import { confirmDialog } from "../../components/ui/dialogs";

async function loadCompanies() {
  // The display name field may not exist yet (it is added on first save), so fall back to the plain list.
  return frappe.getList("Company", { fields: ["name", "company_name", "custom_hrms_display_name"], limit: 0, orderBy: "company_name asc" })
    .catch(() => frappe.getList("Company", { fields: ["name", "company_name"], limit: 0, orderBy: "company_name asc" }));
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
  const [nameDraft, setNameDraft] = useState(null); // { companyName, value } while editing
  const [supportDraft, setSupportDraft] = useState(null); // { companyName, email, phone } while editing

  const companies = companiesQuery.data || [];
  const validSelectedCompany = !companies.length || companies.some((item) => item.name === selectedCompany) ? selectedCompany : "";
  // The super admin edits the client chosen in the sidebar - the one place a company is picked.
  const client = useClientScope();
  const companyName = client || validSelectedCompany || activeCompany?.name || companies[0]?.name || "";
  const companyQuery = useAsync(() => companyName ? frappe.getDoc("Company", companyName) : Promise.resolve(null), [companyName]);
  const currentCompany = companyQuery.data?.name === companyName ? companyQuery.data : activeCompany?.name === companyName ? activeCompany : null;
  const savedTheme = currentCompany?.custom_hrms_theme || getSavedTheme(companyName);
  const selectedTheme = themeDraft?.companyName === companyName ? themeDraft.id : savedTheme;
  const shownName = brandName(currentCompany) || companyName;
  const legalName = currentCompany?.company_name || currentCompany?.name || "";
  const nameValue = nameDraft?.companyName === companyName ? nameDraft.value : shownName;
  const nameChanged = nameValue.trim() !== shownName;
  const savedSupport = { email: currentCompany?.custom_hrms_support_email || "", phone: currentCompany?.custom_hrms_support_phone || "" };
  const support = supportDraft?.companyName === companyName ? supportDraft : { companyName, ...savedSupport };
  const supportChanged = support.email.trim() !== savedSupport.email || support.phone.trim() !== savedSupport.phone;

  function changeCompany(name) {
    setSelectedCompany(name);
    selectCompany(name);
    setThemeDraft(null);
    setNameDraft(null);
    setError("");
    setMessage("");
  }

  async function chooseTheme(theme) {
    if (!companyName) return;
    if (!(await confirmDialog(`Make ${theme.name} the shared theme for ${shownName}? Everyone in this company sees it.`))) return;
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
      setMessage(`${theme.name} is now the shared theme for ${shownName}.`);
    } catch (e) {
      setError(`Theme preview is active on this browser, but the shared theme could not be saved. ${errMsg(e, "Check company permissions.")}`);
    } finally {
      setBusy("");
    }
  }

  async function saveDisplayName() {
    const value = nameValue.trim();
    if (!companyName || !nameChanged) return;
    // Saving the legal name (or nothing) clears the display name, so the app follows the Company record again.
    const display = value === legalName ? "" : value;
    const message = display
      ? `Show "${display}" as the company name across the app? The legal name "${legalName}" stays the same on the Company record and documents.`
      : `Show the legal name "${legalName}" as the company name across the app again?`;
    if (!(await confirmDialog({ title: "Change Company Name", message, confirmLabel: "Save Name" }))) return;
    setBusy("name");
    setError("");
    setMessage("");
    try {
      await ensureCompanyField("custom_hrms_display_name", { label: "HRMS Display Name", fieldtype: "Data" });
      const saved = await frappe.updateDoc("Company", companyName, { custom_hrms_display_name: display });
      cacheBranding(saved || { ...currentCompany, custom_hrms_display_name: display });
      setNameDraft(null);
      companyQuery.reload();
      companiesQuery.reload();
      refreshBranding();
      setMessage(`Company name is now shown as "${display || legalName}".`);
    } catch (e) {
      setError(errMsg(e, "Could not save the company name. Check Company write and Customize Form permissions."));
    } finally {
      setBusy("");
    }
  }

  async function saveSupport() {
    const email = support.email.trim();
    const phone = support.phone.trim();
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return setError("Enter a valid support email address.");
    if (phone && !/^[+\d][\d\s()-]{5,}$/.test(phone)) return setError("Enter a valid support phone number.");
    if (!(await confirmDialog({ title: "Save Support Contact", message: `Show ${[email, phone].filter(Boolean).join(" and ") || "no support contact"} on the sign-in page under Contact IT Support?`, confirmLabel: "Save" }))) return;
    setBusy("support");
    setError("");
    setMessage("");
    try {
      await ensureCompanyField("custom_hrms_support_email", { label: "HRMS Support Email", fieldtype: "Data", options: "Email" });
      await ensureCompanyField("custom_hrms_support_phone", { label: "HRMS Support Phone", fieldtype: "Data" });
      await frappe.updateDoc("Company", companyName, { custom_hrms_support_email: email, custom_hrms_support_phone: phone });
      setSupportDraft(null);
      companyQuery.reload();
      setMessage("Support contact saved. It shows on the sign-in page under Contact IT Support.");
    } catch (e) {
      setError(errMsg(e, "Could not save the support contact."));
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
    if (!(await confirmDialog({ title: `Upload ${slot.title}`, message: `Use "${file.name}" as the ${slot.mode}-theme logo of ${shownName}? It is shown on ${slot.themes}.` }))) { clearInput(); return; }
    setBusy(slot.field);
    setError("");
    setMessage("");
    try {
      const uploaded = await frappe.uploadFile(file, { doctype: "Company", docname: companyName, isPrivate: false });
      if (!uploaded?.file_url) throw new Error("The upload did not return a public file URL.");
      await saveLogo(slot, uploaded.file_url);
      setMessage(`${slot.title} updated for ${shownName}.`);
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
    if (!(await confirmDialog({ title: `Remove ${slot.title}`, message: `Remove the ${slot.mode}-theme logo of ${shownName}? On ${slot.themes}, ${fallback} instead.`, danger: true, confirmLabel: "Remove" }))) return;
    setBusy(slot.field);
    setError("");
    setMessage("");
    try {
      await saveLogo(slot, "");
      setMessage(`${slot.title} removed for ${shownName}.`);
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
            <p className="mt-1.5 text-[13px] leading-5 text-[var(--color-text-muted)]">{client ? "This client's logo, name and colours. Changes are shared with everyone in the company." : "Give every company its own logo and color system. Changes are shared with that company’s users."}</p>
          </div>
          {client ? (
            <div className="min-w-60">
              <span className="mb-1.5 block text-[11px] font-medium uppercase tracking-wide text-[var(--color-text-muted)]">Branding For</span>
              <span className="flex items-center gap-2 rounded-md border border-[var(--color-border)] px-3 py-2 text-[13px] text-[var(--color-text)]" title="The client you're viewing - switch it in the sidebar"><Building2 size={14} className="text-[var(--color-red-hover)]" />{shownName}</span>
            </div>
          ) : companies.length > 1 && (
            <label className="min-w-60">
              <span className="mb-1.5 block text-[11px] font-medium uppercase tracking-wide text-[var(--color-text-muted)]">Company Workspace</span>
              <span className="relative block">
                <Building2 size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-text-faint)]" />
                <select value={companyName} onChange={(event) => changeCompany(event.target.value)} disabled={companiesQuery.loading} className="w-full appearance-none rounded-md border border-[var(--color-border-strong)] bg-[var(--color-surface-2)] py-2 pl-9 pr-3 text-[13px] text-[var(--color-text)] outline-none focus:border-[var(--color-red)]">
                  {companies.map((item) => <option key={item.name} value={item.name}>{brandName(item) || item.name}</option>)}
                </select>
              </span>
            </label>
          )}
        </div>
      </section>

      {(error || companiesQuery.error || companyQuery.error) && <p role="alert" className="rounded-md border border-[var(--color-red-deep)] bg-[var(--color-red-wash)] px-4 py-3 text-[12px] text-[var(--color-red-hover)]">{error || errMsg(companiesQuery.error || companyQuery.error, "Unable to load company branding.")}</p>}
      {message && <p role="status" className="rounded-md border border-[var(--color-green)]/30 bg-[color-mix(in_srgb,var(--color-green)_10%,transparent)] px-4 py-3 text-[12px] text-[var(--color-green)]">{message}</p>}

      <div className="space-y-6">
        <section className="space-y-3">
          <div className="flex items-end justify-between gap-3">
            <div><h2 className="text-[14px] font-semibold text-[var(--color-text)]">Theme System</h2><p className="mt-0.5 text-[12px] text-[var(--color-text-muted)]">Choose a complete color palette for this company.</p></div>
            {busy === "theme" && <span className="flex items-center gap-1.5 text-[11px] text-[var(--color-text-muted)]"><Loader2 size={13} className="animate-spin" />Saving</span>}
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {THEME_OPTIONS.map((theme) => <ThemePreview key={theme.id} theme={theme} selected={selectedTheme === theme.id} disabled={!companyName || Boolean(busy)} onClick={() => chooseTheme(theme)} />)}
          </div>
        </section>

        <section className="space-y-3">
          <div><h2 className="text-[14px] font-semibold text-[var(--color-text)]">Company Logos</h2><p className="mt-0.5 text-[12px] text-[var(--color-text-muted)]">Upload one logo for light themes and one for dark themes. With only one uploaded, it is adjusted to fit the other themes.</p></div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
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
          </div>
        </section>

        <section className="space-y-3">
          <div><h2 className="text-[14px] font-semibold text-[var(--color-text)]">Name & Sign-In Help</h2><p className="mt-0.5 text-[12px] text-[var(--color-text-muted)]">What people see next to the logo and on the sign-in page.</p></div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Card className="order-2 space-y-3 p-4">
            <div>
              <p className="flex items-center gap-1.5 text-[13px] font-semibold text-[var(--color-text)]"><Headset size={14} /> Sign-In Help</p>
              <p className="mt-0.5 text-[11px] text-[var(--color-text-muted)]">Shown on the sign-in page under Contact IT Support, for people who can't sign in.</p>
            </div>
            <input type="email" value={support.email} disabled={!currentCompany || Boolean(busy)} onChange={(e) => setSupportDraft({ ...support, email: e.target.value })} placeholder="Support email, e.g. it@company.com" aria-label="Support email" className="w-full rounded-md border border-[var(--color-border-strong)] bg-[var(--color-surface-2)] px-3 py-2 text-[13px] text-[var(--color-text)] outline-none focus:border-[var(--color-red)] disabled:opacity-60" />
            <input type="tel" value={support.phone} disabled={!currentCompany || Boolean(busy)} onChange={(e) => setSupportDraft({ ...support, phone: e.target.value })} placeholder="Support phone (optional)" aria-label="Support phone" className="w-full rounded-md border border-[var(--color-border-strong)] bg-[var(--color-surface-2)] px-3 py-2 text-[13px] text-[var(--color-text)] outline-none focus:border-[var(--color-red)] disabled:opacity-60" />
            <div className="flex justify-end gap-2">
              {supportChanged && <Button type="button" variant="ghost" disabled={Boolean(busy)} onClick={() => setSupportDraft(null)}>Cancel</Button>}
              <Button type="button" disabled={!supportChanged || Boolean(busy)} onClick={saveSupport}>{busy === "support" ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}Save Contact</Button>
            </div>
          </Card>
          {/* The company name is separate text from the Company record - never part of the logo image. */}
          <Card className="order-1 space-y-3 p-4">
            <div>
              <p className="text-[13px] font-semibold text-[var(--color-text)]">Company Name</p>
              <p className="mt-0.5 text-[11px] text-[var(--color-text-muted)]">Shown under the logo, on the sign-in page and in the browser tab.{legalName && ` Legal name: ${legalName} (not changed).`}</p>
            </div>
            <input
              value={nameValue}
              maxLength={80}
              disabled={!currentCompany || Boolean(busy)}
              onChange={(event) => setNameDraft({ companyName, value: event.target.value })}
              onKeyDown={(event) => { if (event.key === "Enter") saveDisplayName(); }}
              placeholder={legalName || "Company name"}
              aria-label="Company name shown in the app"
              className="w-full rounded-md border border-[var(--color-border-strong)] bg-[var(--color-surface-2)] px-3 py-2 text-[14px] font-semibold text-[var(--color-text)] outline-none focus:border-[var(--color-red)] disabled:opacity-60"
            />
            <div className="flex items-center justify-between gap-2">
              {shownName !== legalName && legalName ? <button type="button" disabled={Boolean(busy)} onClick={() => setNameDraft({ companyName, value: legalName })} className="text-[11px] text-[var(--color-text-muted)] hover:text-[var(--color-text)] disabled:opacity-50">Use Legal Name</button> : <span />}
              <div className="flex gap-2">
                {nameChanged && <Button type="button" variant="ghost" disabled={Boolean(busy)} onClick={() => setNameDraft(null)}>Cancel</Button>}
                <Button type="button" disabled={!nameChanged || Boolean(busy)} onClick={saveDisplayName}>{busy === "name" ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}Save Name</Button>
              </div>
            </div>
          </Card>
          </div>
        </section>
      </div>

      <Card className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
        <span className="flex items-center gap-2 text-[12px] text-[var(--color-text-muted)]"><Check size={14} className="text-[var(--color-green)]" /> Company logos and theme are stored with the selected company.</span>
        <Button type="button" variant="ghost" disabled={Boolean(busy)} onClick={() => { companiesQuery.reload(); companyQuery.reload(); refreshBranding(); }}><RefreshCw size={13} /> Refresh</Button>
      </Card>
    </div>
  );
}
