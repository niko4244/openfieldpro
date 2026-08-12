"use client";

import type React from "react";
import { useEffect, useState } from "react";
import Link from "next/link";
import { api, type BusinessSettingsDTO, type OrgSettingsDTO } from "@/lib/api";
import { normalizeServiceAreas, validateBusinessHours } from "@/lib/business-settings-form";
import { estimateDocumentHtml, invoiceDocumentHtml } from "@/lib/document-data";
import { DocumentPreviewWorkbench, type DocumentPreviewItem } from "@/components/document-preview-workbench";
import { MessageTemplatesEditor } from "@/components/settings/message-templates-editor";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";

type Tab = "company" | "hours" | "areas" | "invoice" | "estimate" | "payments" | "taxes" | "messages" | "numbering" | "portal" | "team";

const TABS: { id: Tab; label: string }[] = [
  { id: "company", label: "Company" },
  { id: "hours", label: "Business Hours" },
  { id: "areas", label: "Service Areas" },
  { id: "invoice", label: "Invoices" },
  { id: "estimate", label: "Estimates" },
  { id: "payments", label: "Payments" },
  { id: "taxes", label: "Taxes & Discounts" },
  { id: "messages", label: "Messages" },
  { id: "numbering", label: "Numbering" },
  { id: "portal", label: "Portal" },
  { id: "team", label: "Team" },
];

const TAB_GROUPS: { label: string; tabs: Tab[] }[] = [
  { label: "Business", tabs: ["company", "hours", "areas", "team"] },
  { label: "Sales & payments", tabs: ["invoice", "estimate", "payments", "taxes"] },
  { label: "Customer experience", tabs: ["messages", "numbering", "portal"] },
];

interface User {
  id: string;
  name: string;
  email: string;
  role: string;
}

export default function SettingsPage() {
  const [tab, setTab] = useState<Tab>("company");

  useEffect(() => {
    const section = new URLSearchParams(window.location.search).get("section") as Tab | null;
    if (TABS.some((item) => item.id === section)) setTab(section!);
  }, []);
  const [dirty, setDirty] = useState(false);

  const selectTab = (next: Tab) => {
    if (next === "team" && dirty && !window.confirm("Discard unsaved business settings?")) return;
    setTab(next);
    const url = new URL(window.location.href);
    url.searchParams.set("section", next);
    window.history.replaceState({}, "", url);
  };

  return (
    <div>
      <PageHeader
        title="Settings"
        description="Configure the business rules that drive invoices, estimates, payments, documents, the customer portal, and team access."
      />

      <div className="grid gap-6 xl:grid-cols-[220px_minmax(0,1fr)]">
        <aside className="rounded-xl border border-border bg-surface-200 p-2">
          <nav aria-label="Business settings" className="grid gap-4 sm:grid-cols-3 xl:grid-cols-1">
            {TAB_GROUPS.map((group) => (
              <div key={group.label}>
                <p className="px-2 py-1 text-xs font-bold uppercase tracking-wide text-fg-dim">{group.label}</p>
                <div className="grid gap-1">
                  {group.tabs.map((id) => {
                    const item = TABS.find((candidate) => candidate.id === id)!;
                    return (
                      <button
                        key={id}
                        type="button"
                        aria-current={tab === id ? "page" : undefined}
                        onClick={() => selectTab(id)}
                        className={`min-h-10 rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 ${
                          tab === id ? "bg-accent text-surface-100" : "text-fg-muted hover:bg-surface-300 hover:text-fg"
                        }`}
                      >
                        {item.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
            <div>
              <p className="px-2 py-1 text-xs font-bold uppercase tracking-wide text-fg-dim">Connections</p>
              <Link className="block min-h-10 rounded-lg px-3 py-2 text-sm font-medium text-fg-muted hover:bg-surface-300 hover:text-fg" href="/integrations">
                Integrations
              </Link>
            </div>
          </nav>
        </aside>

        {tab === "team" ? <TeamTab /> : <BusinessSettingsTab tab={tab} onDirtyChange={setDirty} />}
      </div>
    </div>
  );
}

function BusinessSettingsTab({ tab, onDirtyChange }: { tab: Exclude<Tab, "team">; onDirtyChange: (dirty: boolean) => void }) {
  const [org, setOrg] = useState<OrgSettingsDTO | null>(null);
  const [form, setForm] = useState<OrgSettingsDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [logoBusy, setLogoBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<ReturnType<typeof validateBusinessHours>>({});

  useEffect(() => {
    let cancelled = false;
    api.org()
      .then((row) => {
        if (cancelled) return;
        setOrg(row);
        setForm(row);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load organization settings");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  const dirty = Boolean(org && form && JSON.stringify(org) !== JSON.stringify(form));

  useEffect(() => {
    onDirtyChange(dirty);
    const warn = (event: BeforeUnloadEvent) => {
      if (!dirty) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => {
      window.removeEventListener("beforeunload", warn);
      onDirtyChange(false);
    };
  }, [dirty, onDirtyChange]);

  const updateOrg = <K extends keyof OrgSettingsDTO>(key: K, value: OrgSettingsDTO[K]) => {
    setForm((prev) => prev ? { ...prev, [key]: value } : prev);
  };

  const updateSettings = (next: BusinessSettingsDTO) => {
    setForm((prev) => prev ? { ...prev, businessSettings: next } : prev);
  };

  const uploadLogo = async (file: File) => {
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
      setError("Choose a PNG, JPEG, or WebP logo image.");
      return false;
    }
    if (file.size > 2 * 1024 * 1024) {
      setError("Choose a logo smaller than 2 MB.");
      return false;
    }
    setLogoBusy(true);
    setError(null);
    setMessage(null);
    try {
      const row = await api.uploadOrgLogo(file);
      setOrg((current) => current ? { ...current, logoUrl: row.logoUrl } : row);
      setForm((current) => current ? { ...current, logoUrl: row.logoUrl } : row);
      setMessage("Company logo uploaded and added to customer documents.");
      return true;
    } catch {
      setError("The logo could not be uploaded. Check the image and try again.");
      return false;
    } finally {
      setLogoBusy(false);
    }
  };

  const removeLogo = async () => {
    setLogoBusy(true);
    setError(null);
    setMessage(null);
    try {
      const row = await api.deleteOrgLogo();
      setOrg((current) => current ? { ...current, logoUrl: null } : row);
      setForm((current) => current ? { ...current, logoUrl: null } : row);
      setMessage("Company logo removed. Customer documents will use the branded initials.");
    } catch {
      setError("The logo could not be removed. Please try again.");
    } finally {
      setLogoBusy(false);
    }
  };

  const save = async () => {
    if (!form) return;
    const nextFieldErrors = validateBusinessHours(form.businessSettings.businessHours);
    setFieldErrors(nextFieldErrors);
    if (Object.keys(nextFieldErrors).length > 0) {
      setError("Fix the highlighted business hours before saving.");
      return;
    }
    setSaving(true);
    setMessage(null);
    setError(null);
    try {
      const row = await api.patchOrg({
        name: form.name,
        timezone: form.timezone,
        logoUrl: form.logoUrl || null,
        brandColor: form.brandColor || "#22C55E",
        documentFooter: form.documentFooter || null,
        publicEmail: form.publicEmail || null,
        publicPhone: form.publicPhone || null,
        publicAddress: form.publicAddress || null,
        removeOpenFieldProAttribution: form.removeOpenFieldProAttribution,
        businessSettings: form.businessSettings,
      });
      setOrg(row);
      setForm(row);
      setMessage("Business settings saved.");
    } catch (err) {
      setError("Could not save settings. Your changes are still here; check the fields and try again.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardHeader><CardTitle>Loading settings</CardTitle></CardHeader>
        <CardContent><Skeleton className="h-6 w-64" /></CardContent>
      </Card>
    );
  }

  if (!org || !form) {
    return (
      <Card className="border-red/30 bg-red/5">
        <CardContent className="p-4"><p className="text-sm text-red">{error ?? "Could not load organization settings."}</p></CardContent>
      </Card>
    );
  }

  const settings = form.businessSettings;

  return (
    <div className="grid grid-cols-1 gap-6 2xl:grid-cols-[minmax(0,1fr)_480px]">
      <Card>
        <CardHeader>
          <CardTitle>{TABS.find((item) => item.id === tab)?.label}</CardTitle>
        </CardHeader>
        <CardContent>
          {tab === "company" && <CompanySection form={form} updateOrg={updateOrg} updateSettings={updateSettings} logoBusy={logoBusy} onUploadLogo={uploadLogo} onRemoveLogo={removeLogo} />}
          {tab === "hours" && <BusinessHoursSection settings={settings} updateSettings={updateSettings} errors={fieldErrors} />}
          {tab === "areas" && <ServiceAreasSection settings={settings} updateSettings={updateSettings} />}
          {tab === "invoice" && <InvoiceSection settings={settings} updateSettings={updateSettings} />}
          {tab === "estimate" && <EstimateSection settings={settings} updateSettings={updateSettings} />}
          {tab === "payments" && <PaymentsSection settings={settings} updateSettings={updateSettings} />}
          {tab === "taxes" && <TaxesSection settings={settings} updateSettings={updateSettings} />}
          {tab === "messages" && <MessageTemplatesEditor settings={settings} updateSettings={updateSettings} companyName={org.name} />}
          {tab === "numbering" && <NumberingSection settings={settings} updateSettings={updateSettings} />}
          {tab === "portal" && <PortalSection settings={settings} updateSettings={updateSettings} />}

          {(message || error) && <p aria-live="polite" role={error ? "alert" : "status"} className={`mt-4 text-sm ${error ? "text-red" : "text-green"}`}>{error ?? message}</p>}

          <div className="mt-6 flex gap-2">
            <Button onClick={save} disabled={saving || !dirty}>{saving ? "Saving…" : "Save settings"}</Button>
            <Button variant="secondary" onClick={() => { setForm(org); setError(null); setMessage(null); setFieldErrors({}); }} disabled={saving || !dirty}>Reset</Button>
          </div>
        </CardContent>
      </Card>

      <SettingsPreview form={form} tab={tab} />
    </div>
  );
}

function CompanySection({ form, updateOrg, updateSettings, logoBusy, onUploadLogo, onRemoveLogo }: {
  form: OrgSettingsDTO;
  updateOrg: <K extends keyof OrgSettingsDTO>(key: K, value: OrgSettingsDTO[K]) => void;
  updateSettings: (settings: BusinessSettingsDTO) => void;
  logoBusy: boolean;
  onUploadLogo: (file: File) => Promise<boolean>;
  onRemoveLogo: () => Promise<void>;
}) {
  const settings = form.businessSettings;
  const [localLogo, setLocalLogo] = useState<string | null>(null);

  useEffect(() => () => {
    if (localLogo) URL.revokeObjectURL(localLogo);
  }, [localLogo]);

  const chooseLogo = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    const previewUrl = URL.createObjectURL(file);
    setLocalLogo(previewUrl);
    const uploaded = await onUploadLogo(file);
    if (uploaded) setLocalLogo(null);
  };

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <div className="flex flex-wrap items-center gap-4 rounded-xl border border-border bg-surface-200 p-4 md:col-span-2">
        {localLogo || form.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={localLogo ?? form.logoUrl ?? ""} alt={`${form.name} logo preview`} className="h-20 w-20 rounded-xl border border-border bg-white object-contain p-2" />
        ) : (
          <div className="grid h-20 w-20 place-items-center rounded-xl text-xl font-black text-white" style={{ backgroundColor: form.brandColor }}>{form.name.slice(0, 2).toUpperCase()}</div>
        )}
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-fg">Company logo</p>
          <p className="mt-1 text-xs text-fg-muted">PNG, JPEG, or WebP up to 2 MB. It appears on invoices and estimates automatically.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <label className="inline-flex min-h-9 cursor-pointer items-center rounded-lg bg-accent px-3 text-sm font-semibold text-white hover:opacity-90">
              {logoBusy ? "Uploading…" : form.logoUrl ? "Replace logo" : "Upload logo"}
              <input className="sr-only" type="file" accept="image/png,image/jpeg,image/webp" onChange={chooseLogo} disabled={logoBusy} />
            </label>
            {form.logoUrl ? <Button type="button" size="sm" variant="secondary" onClick={onRemoveLogo} disabled={logoBusy}>Remove logo</Button> : null}
          </div>
        </div>
      </div>
      <TextField label="Company name" name="organization" autoComplete="organization" value={form.name} onChange={(value) => updateOrg("name", value)} />
      <TextField label="Timezone" name="timezone" value={form.timezone} onChange={(value) => {
        updateOrg("timezone", value);
        updateSettings({ ...settings, businessHours: { ...settings.businessHours, timezone: value } });
      }} />
      <label className="grid gap-1.5 text-sm text-fg-muted">
        Brand color
        <div className="flex gap-2">
          <Input name="brandColor" value={form.brandColor} onChange={(event) => updateOrg("brandColor", event.target.value)} />
          <input
            aria-label="Brand color picker"
            type="color"
            value={form.brandColor}
            onChange={(event) => updateOrg("brandColor", event.target.value)}
            className="h-10 w-14 rounded-lg border border-border bg-surface-200 p-1"
          />
        </div>
      </label>
      <div>
        <TextField label="Hosted logo URL (optional)" name="logoUrl" type="url" autoComplete="url" value={form.logoUrl ?? ""} onChange={(value) => updateOrg("logoUrl", value || null)} placeholder="https://example.com/logo.png" />
        <p className="mt-1 text-xs text-fg-dim">You can paste an existing hosted image instead of uploading a file.</p>
      </div>
      <TextField label="Public email" name="email" type="email" autoComplete="email" value={form.publicEmail ?? ""} onChange={(value) => updateOrg("publicEmail", value || null)} />
      <TextField label="Public phone" name="tel" type="tel" autoComplete="tel" value={form.publicPhone ?? ""} onChange={(value) => updateOrg("publicPhone", value || null)} />
      <div className="md:col-span-2">
        <TextField label="Public address" name="street-address" autoComplete="street-address" value={form.publicAddress ?? ""} onChange={(value) => updateOrg("publicAddress", value || null)} />
      </div>
      <label className="flex items-center gap-2 text-sm text-fg-muted md:col-span-2">
        <input
          type="checkbox"
          checked={form.removeOpenFieldProAttribution}
          onChange={(event) => updateOrg("removeOpenFieldProAttribution", event.target.checked)}
        />
        Remove OpenFieldPro attribution on customer-facing documents
      </label>
    </div>
  );
}

const WORK_DAYS = [
  ["sun", "Sun"], ["mon", "Mon"], ["tue", "Tue"], ["wed", "Wed"],
  ["thu", "Thu"], ["fri", "Fri"], ["sat", "Sat"],
] as const;

function BusinessHoursSection({ settings, updateSettings, errors }: SettingsProps & { errors: ReturnType<typeof validateBusinessHours> }) {
  const hours = settings.businessHours;
  const updateHours = (next: Partial<typeof hours>) => updateSettings({ ...settings, businessHours: { ...hours, ...next } });

  return (
    <div className="grid gap-6">
      <fieldset>
        <legend className="text-sm font-medium text-fg">Work days</legend>
        <p className="mt-1 text-sm text-fg-muted">Choose the days customers can normally schedule service.</p>
        <div className="mt-3 grid grid-cols-4 gap-2 sm:grid-cols-7">
          {WORK_DAYS.map(([value, label]) => (
            <label key={value} className={`grid min-h-11 cursor-pointer place-items-center rounded-lg border px-2 text-sm font-medium ${hours.workDays.includes(value) ? "border-accent bg-accent-muted text-accent" : "border-border bg-surface-200 text-fg-muted"}`}>
              <input
                className="sr-only"
                type="checkbox"
                checked={hours.workDays.includes(value)}
                onChange={(event) => updateHours({ workDays: event.target.checked ? [...hours.workDays, value] : hours.workDays.filter((day) => day !== value) })}
              />
              {label}
            </label>
          ))}
        </div>
        {errors.workDays && <p className="mt-2 text-sm text-red">{errors.workDays}</p>}
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="grid gap-1.5 text-sm text-fg-muted">
          Opening time
          <Input name="openingTime" type="time" value={hours.startTime} onChange={(event) => updateHours({ startTime: event.target.value })} />
        </label>
        <label className="grid gap-1.5 text-sm text-fg-muted">
          Closing time
          <Input aria-invalid={Boolean(errors.endTime)} aria-describedby={errors.endTime ? "closing-time-error" : undefined} name="closingTime" type="time" value={hours.endTime} onChange={(event) => updateHours({ endTime: event.target.value })} />
          {errors.endTime && <span id="closing-time-error" className="text-sm text-red">{errors.endTime}</span>}
        </label>
      </div>
      <p className="rounded-lg border border-border bg-surface-200 p-3 text-sm text-fg-muted">Times use <strong className="text-fg">{hours.timezone}</strong>, synchronized with the Company timezone.</p>
    </div>
  );
}

function ServiceAreasSection({ settings, updateSettings }: SettingsProps) {
  const [draft, setDraft] = useState("");
  const addAreas = () => {
    const next = normalizeServiceAreas([...settings.serviceAreas, ...draft.split(",")]);
    updateSettings({ ...settings, serviceAreas: next });
    setDraft("");
  };

  return (
    <div>
      <p className="text-sm text-fg-muted">Add ZIP codes, cities, counties, or named territories. Separate several entries with commas.</p>
      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        <Input
          aria-label="Service area"
          name="serviceArea"
          placeholder="50309 or Des Moines"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); addAreas(); } }}
        />
        <Button type="button" variant="secondary" disabled={!draft.trim() || settings.serviceAreas.length >= 50} onClick={addAreas}>Add area</Button>
      </div>
      {settings.serviceAreas.length === 0 ? (
        <div className="mt-5 rounded-xl border border-dashed border-border p-6 text-center text-sm text-fg-muted">No service areas added. Add the places your team serves.</div>
      ) : (
        <ul className="mt-5 flex flex-wrap gap-2" aria-label="Configured service areas">
          {settings.serviceAreas.map((area) => (
            <li key={area} className="flex items-center gap-2 rounded-lg border border-border bg-surface-200 px-3 py-2 text-sm text-fg">
              <span className="break-words">{area}</span>
              <button
                type="button"
                aria-label={`Remove ${area}`}
                className="rounded text-fg-dim hover:text-red focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
                onClick={() => updateSettings({ ...settings, serviceAreas: settings.serviceAreas.filter((item) => item !== area) })}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-3 text-xs text-fg-dim">{settings.serviceAreas.length} of 50 areas</p>
    </div>
  );
}

function InvoiceSection({ settings, updateSettings }: SettingsProps) {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <p className="rounded-lg border border-border bg-surface-200 px-3 py-2 text-xs text-fg-muted md:col-span-2">Your company logo and name are always included. Change the logo under Company settings.</p>
      <SelectField label="Due term" value={settings.invoice.dueTerm} onChange={(value) => updateSettings({ ...settings, invoice: { ...settings.invoice, dueTerm: value as BusinessSettingsDTO["invoice"]["dueTerm"] } })}>
        <option value="on_receipt">Due on receipt</option>
        <option value="work_start">Due at start of work</option>
        <option value="work_completion">Due on completion</option>
        <option value="net_days">Net days</option>
      </SelectField>
      <NumberField label="Net days" value={settings.invoice.netDays} onChange={(value) => updateSettings({ ...settings, invoice: { ...settings.invoice, netDays: value } })} />
      <SelectField label="Customer view format" value={settings.invoice.format} onChange={(value) => updateSettings({ ...settings, invoice: { ...settings.invoice, format: value as BusinessSettingsDTO["invoice"]["format"] } })}>
        <option value="email">Email optimized</option>
        <option value="envelope">Envelope / print optimized</option>
      </SelectField>
      <TextField label="Reminder days" value={settings.invoice.reminderDays.join(", ")} onChange={(value) => updateSettings({ ...settings, invoice: { ...settings.invoice, reminderDays: splitCsv(value).map((item) => Number(item)).filter(Number.isFinite) } })} />
      <TextArea label="Default invoice message" value={settings.invoice.defaultMessage} onChange={(value) => updateSettings({ ...settings, invoice: { ...settings.invoice, defaultMessage: value } })} />
      <TextArea label="Payment instructions" value={settings.invoice.paymentInstructions} onChange={(value) => updateSettings({ ...settings, invoice: { ...settings.invoice, paymentInstructions: value } })} />
      <VisibilityGroup
        title="Customer invoice view"
        values={settings.invoice.visibility}
        labels={{
          showBusinessInfo: "Business contact details",
          showCustomerInfo: "Customer info",
          showJobInfo: "Job info",
          showLineItems: "Line items",
          showLineItemPrices: "Line-item prices",
          showPayments: "Payments",
          showBalance: "Balance",
        }}
        onChange={(visibility) => updateSettings({ ...settings, invoice: { ...settings.invoice, visibility } })}
      />
    </div>
  );
}

function EstimateSection({ settings, updateSettings }: SettingsProps) {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <p className="rounded-lg border border-border bg-surface-200 px-3 py-2 text-xs text-fg-muted md:col-span-2">Your company logo and name are always included. Change the logo under Company settings.</p>
      <NumberField label="Default expiration days" value={settings.estimate.expirationDays} onChange={(value) => updateSettings({ ...settings, estimate: { ...settings.estimate, expirationDays: value } })} />
      <SelectField label="Approval mode" value={settings.estimate.approvalMode} onChange={(value) => updateSettings({ ...settings, estimate: { ...settings.estimate, approvalMode: value as BusinessSettingsDTO["estimate"]["approvalMode"] } })}>
        <option value="single_option">Single option approval</option>
        <option value="multiple_options">Multiple option approval</option>
      </SelectField>
      <SelectField label="Deposit mode" value={settings.estimate.depositMode} onChange={(value) => updateSettings({ ...settings, estimate: { ...settings.estimate, depositMode: value as BusinessSettingsDTO["estimate"]["depositMode"] } })}>
        <option value="none">No deposit</option>
        <option value="fixed">Fixed amount</option>
        <option value="percent">Percent</option>
      </SelectField>
      <NumberField label="Deposit value" value={settings.estimate.depositValue} onChange={(value) => updateSettings({ ...settings, estimate: { ...settings.estimate, depositValue: value } })} />
      <TextField label="Option labels" value={settings.estimate.optionLabels.join(", ")} onChange={(value) => {
        const labels = splitCsv(value);
        updateSettings({ ...settings, estimate: { ...settings.estimate, optionLabels: [labels[0] || "Good", labels[1] || "Better", labels[2] || "Best"] } });
      }} />
      <label className="flex items-center gap-2 text-sm text-fg-muted">
        <input
          type="checkbox"
          checked={settings.estimate.signatureRequired}
          onChange={(event) => updateSettings({ ...settings, estimate: { ...settings.estimate, signatureRequired: event.target.checked } })}
        />
        Require customer signature
      </label>
      <TextArea label="Default estimate message" value={settings.estimate.defaultMessage} onChange={(value) => updateSettings({ ...settings, estimate: { ...settings.estimate, defaultMessage: value } })} />
      <VisibilityGroup
        title="Customer estimate view"
        values={settings.estimate.visibility}
        labels={{
          showBusinessInfo: "Business contact details",
          showCustomerInfo: "Customer info",
          showJobInfo: "Job info",
          showLineItems: "Line items",
          showLineItemPrices: "Line-item prices",
          showOptionSummary: "Good / Better / Best summary",
        }}
        onChange={(visibility) => updateSettings({ ...settings, estimate: { ...settings.estimate, visibility } })}
      />
    </div>
  );
}

function PaymentsSection({ settings, updateSettings }: SettingsProps) {
  const set = (key: keyof BusinessSettingsDTO["payments"], value: boolean) =>
    updateSettings({ ...settings, payments: { ...settings.payments, [key]: value } });
  const payments = settings.payments;
  const methodRows = [
    { id: "online" as const, label: "Pay online", enabled: payments.onlinePaymentsEnabled },
    { id: "cash" as const, label: "Cash", enabled: payments.allowManualCash },
    { id: "check" as const, label: "Check", enabled: payments.allowManualCheck },
    { id: "card" as const, label: "Card", enabled: payments.allowManualCard },
  ];
  const enabledMethods = methodRows.filter((row) => row.enabled).map((row) => row.label);
  const noneEnabled = enabledMethods.length === 0;

  return (
    <div className="grid gap-6">
      <CheckboxGrid
        values={settings.payments}
        labels={{
          onlinePaymentsEnabled: "Online payments enabled",
          allowManualCash: "Cash payments",
          allowManualCheck: "Check payments",
          allowManualCard: "Manual card payments",
          allowPartialPayments: "Partial payments",
          tipsEnabled: "Tips",
        }}
        onChange={set}
      />

      <div
        role="status"
        aria-live="polite"
        className={`rounded-xl border p-4 ${noneEnabled ? "border-red/30 bg-red/5" : "border-border bg-surface-200"}`}
      >
        <p className="text-sm font-semibold text-fg">Customer-facing methods</p>
        <p className="mt-1 text-sm text-fg-muted">
          {noneEnabled
            ? "No payment methods are enabled for customers. Enable online payments or at least one manual method so invoices can be settled."
            : `Customers can pay by ${enabledMethods.join(", ")}.`}
        </p>
        <ul className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
          {methodRows.map((row) => (
            <li key={row.id} className="flex items-center justify-between rounded-lg border border-border bg-surface-300 px-3 py-2 text-sm">
              <span className="text-fg">{row.label}</span>
              <span className={`text-xs font-medium ${row.enabled ? "text-green" : "text-fg-dim"}`}>
                {row.enabled ? "shown" : "hidden"}
              </span>
            </li>
          ))}
        </ul>
      </div>

      {!payments.allowPartialPayments && (
        <div role="alert" className="rounded-xl border border-yellow/40 bg-yellow/10 p-4">
          <p className="text-sm font-semibold text-fg">Partial payments are disabled</p>
          <p className="mt-1 text-sm text-fg-muted">
            Customers must pay the full balance at once. If you collect deposits or accept progress payments, enable partial payments.
          </p>
        </div>
      )}
    </div>
  );
}

function TaxesSection({ settings, updateSettings }: SettingsProps) {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <label className="flex items-center gap-2 text-sm text-fg-muted">
        <input checked={settings.taxes.taxEnabled} onChange={(event) => updateSettings({ ...settings, taxes: { ...settings.taxes, taxEnabled: event.target.checked } })} type="checkbox" />
        Enable taxes
      </label>
      <label className="flex items-center gap-2 text-sm text-fg-muted">
        <input checked={settings.taxes.discountsEnabled} onChange={(event) => updateSettings({ ...settings, taxes: { ...settings.taxes, discountsEnabled: event.target.checked } })} type="checkbox" />
        Enable discounts
      </label>
      <TextField label="Tax label" value={settings.taxes.taxLabel} onChange={(value) => updateSettings({ ...settings, taxes: { ...settings.taxes, taxLabel: value } })} />
      <NumberField label="Default tax basis points" value={settings.taxes.defaultTaxRateBps} onChange={(value) => updateSettings({ ...settings, taxes: { ...settings.taxes, defaultTaxRateBps: value } })} />
      <TextField label="Default discount label" value={settings.taxes.defaultDiscountLabel} onChange={(value) => updateSettings({ ...settings, taxes: { ...settings.taxes, defaultDiscountLabel: value } })} />
    </div>
  );
}

function NumberingSection({ settings, updateSettings }: SettingsProps) {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <TextField label="Invoice prefix" value={settings.numbering.invoicePrefix} onChange={(value) => updateSettings({ ...settings, numbering: { ...settings.numbering, invoicePrefix: value } })} />
      <NumberField label="Next invoice number" value={settings.numbering.invoiceNextNumber} onChange={(value) => updateSettings({ ...settings, numbering: { ...settings.numbering, invoiceNextNumber: value } })} />
      <TextField label="Estimate prefix" value={settings.numbering.estimatePrefix} onChange={(value) => updateSettings({ ...settings, numbering: { ...settings.numbering, estimatePrefix: value } })} />
      <NumberField label="Next estimate number" value={settings.numbering.estimateNextNumber} onChange={(value) => updateSettings({ ...settings, numbering: { ...settings.numbering, estimateNextNumber: value } })} />
    </div>
  );
}

function PortalSection({ settings, updateSettings }: SettingsProps) {
  const set = (key: keyof BusinessSettingsDTO["portal"], value: boolean) =>
    updateSettings({ ...settings, portal: { ...settings.portal, [key]: value } });
  return (
    <CheckboxGrid
      values={settings.portal}
      labels={{
        enabled: "Customer portal enabled",
        showSponsorSlot: "Show sponsor slot when allowed",
        allowEstimateApproval: "Allow estimate approval",
        allowInvoicePayment: "Allow invoice payment",
        allowServiceHistory: "Show service history",
      }}
      onChange={set}
    />
  );
}

const ROLE_SUMMARY: { role: string; label: string; description: string }[] = [
  { role: "owner", label: "Owner", description: "Full access: settings, team, finances, and every workflow." },
  { role: "dispatcher", label: "Dispatcher", description: "Runs the schedule, dispatch board, jobs, and customer records." },
  { role: "technician", label: "Technician", description: "Sees and closes out the jobs assigned to them." },
];

/** Pulls { error, hint } out of an ApiError body for inline display. */
function teamErrorMessage(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  const colon = message.indexOf(": ");
  const body = colon >= 0 ? message.slice(colon + 2) : message;
  try {
    const parsed = JSON.parse(body) as { error?: string; hint?: string };
    return parsed.error ? (parsed.hint ? `${parsed.error} ${parsed.hint}` : parsed.error) : message;
  } catch {
    return body || message;
  }
}

function TeamTab() {
  const [users, setUsers] = useState<User[]>([]);
  const [me, setMe] = useState<{ id: string; role: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([api.users(), api.me()])
      .then(([rows, self]) => {
        if (cancelled) return;
        setUsers(rows);
        setMe(self);
      })
      .catch(() => { if (!cancelled) setError("Failed to load the team."); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const isOwner = me?.role === "owner";
  const activeOwners = users.filter((u) => u.role === "owner");
  const isLastOwner = (u: User) => u.role === "owner" && activeOwners.length === 1;

  const roleDisabledReason = (u: User) => {
    if (u.id === me?.id) return "You cannot change your own role. Ask another owner.";
    if (isLastOwner(u)) return "The final owner cannot be demoted. Promote another team member first.";
    return undefined;
  };
  const deleteDisabledReason = (u: User) => {
    if (u.id === me?.id) return "You cannot remove your own account. Another owner must do it.";
    if (isLastOwner(u)) return "The final owner cannot be removed. Promote another team member first.";
    return undefined;
  };

  const handleRoleChange = async (id: string, role: string) => {
    setSavingId(id);
    setNotice(null);
    setError(null);
    try {
      await api.patchUser(id, { role });
      setUsers((prev) => prev.map((u) => (u.id === id ? { ...u, role } : u)));
    } catch (err) {
      setError(teamErrorMessage(err));
    } finally {
      setSavingId(null);
    }
  };

  const handleDelete = async (id: string) => {
    setConfirmDelete(null);
    setNotice(null);
    setError(null);
    try {
      await api.deleteUser(id);
      setUsers((prev) => prev.filter((u) => u.id !== id));
    } catch (err) {
      setError(teamErrorMessage(err));
    }
  };

  if (loading) return <div className="space-y-3">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-14 rounded-xl" />)}</div>;
  if (error && users.length === 0) return <Card className="border-red/30 bg-red/5"><CardContent className="p-4"><p className="text-sm text-red">{error}</p></CardContent></Card>;

  return (
    <div className="grid gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Roles & permissions</CardTitle>
          <p className="text-sm text-fg-muted">Only owners can change roles or remove team members. The final owner can never be demoted or removed, and you cannot change your own role.</p>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-3 md:grid-cols-3">
          {ROLE_SUMMARY.map((role) => (
            <div key={role.role} className="rounded-lg border border-border bg-surface-200 p-3">
              <p className="text-sm font-semibold text-fg">{role.label}</p>
              <p className="mt-1 text-xs text-fg-muted">{role.description}</p>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card className="overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow><TableHead>Name</TableHead><TableHead>Email</TableHead><TableHead>Role</TableHead><TableHead className="w-24">Actions</TableHead></TableRow>
          </TableHeader>
          <TableBody>
            {users.map((u) => {
              const roleReason = roleDisabledReason(u);
              const deleteReason = deleteDisabledReason(u);
              const isSelf = u.id === me?.id;
              return (
                <TableRow key={u.id}>
                  <TableCell className="font-medium text-fg">
                    {u.name}
                    {isSelf ? <span className="ml-2 rounded-full bg-accent/15 px-2 py-0.5 text-xs font-medium text-accent">You</span> : null}
                  </TableCell>
                  <TableCell className="text-fg-muted">{u.email}</TableCell>
                  <TableCell>
                    <select
                      value={u.role}
                      onChange={(e) => handleRoleChange(u.id, e.target.value)}
                      disabled={savingId === u.id || Boolean(roleReason)}
                      title={roleReason}
                      aria-label={`Role for ${u.name}`}
                      className="h-8 rounded-md border border-border bg-surface-300 px-2 text-xs text-fg disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <option value="owner">Owner</option>
                      <option value="dispatcher">Dispatcher</option>
                      <option value="technician">Technician</option>
                    </select>
                    {roleReason ? <p className="mt-1 max-w-56 text-xs text-fg-dim">{roleReason}</p> : null}
                  </TableCell>
                  <TableCell>
                    {confirmDelete === u.id ? (
                      <div className="flex gap-2">
                        <button onClick={() => handleDelete(u.id)} className="border-none bg-transparent text-xs text-red">Confirm</button>
                        <button onClick={() => setConfirmDelete(null)} className="border-none bg-transparent text-xs text-fg-muted">Cancel</button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setConfirmDelete(u.id)}
                        disabled={Boolean(deleteReason)}
                        title={deleteReason}
                        className="border-none bg-transparent text-xs text-fg-muted hover:text-red disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Delete
                      </button>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Card>

      {(notice || error) && (
        <p aria-live="polite" role={error ? "alert" : "status"} className={`text-sm ${error ? "text-red" : "text-green"}`}>{error ?? notice}</p>
      )}
    </div>
  );
}

interface SettingsProps {
  settings: BusinessSettingsDTO;
  updateSettings: (settings: BusinessSettingsDTO) => void;
}

function SettingsPreview({ form, tab }: { form: OrgSettingsDTO; tab: Exclude<Tab, "team"> }) {
  if (tab === "invoice" || tab === "estimate") {
    const invoiceHtml = invoiceDocumentHtml({
      invoice: {
        number: `${form.businessSettings.numbering.invoicePrefix}-${form.businessSettings.numbering.invoiceNextNumber}`,
        status: "sent",
        total: 42_700,
        dueAt: new Date(Date.now() + form.businessSettings.invoice.netDays * 86_400_000).toISOString(),
        createdAt: new Date().toISOString(),
        payments: [{ amount: 10_000 }],
      },
      customer: { name: "Taylor Morgan", email: "taylor@example.test", phone: "(515) 555-0142" },
      job: { title: "Refrigerator cooling repair", description: "Replaced the failed evaporator fan and confirmed normal cabinet temperature." },
      lineItems: [
        { description: "Diagnostic visit", quantity: 1, unitPrice: 12_900 },
        { description: "Evaporator fan motor", quantity: 1, unitPrice: 21_900 },
        { description: "Installation labor", quantity: 1, unitPrice: 7_900 },
      ],
      org: form,
    });
    const optionLabels = form.businessSettings.estimate.optionLabels;
    const estimateOptions = [
      { id: "good", label: optionLabels[0] || "Good", lineItems: [{ description: "Repair failed fan motor", quantity: 1, unitPrice: 34_800 }] },
      { id: "better", label: optionLabels[1] || "Better", lineItems: [{ description: "Fan motor repair plus maintenance", quantity: 1, unitPrice: 42_700 }] },
      { id: "best", label: optionLabels[2] || "Best", lineItems: [{ description: "Premium repair with extended coverage", quantity: 1, unitPrice: 58_900 }] },
    ];
    const estimateBase = {
      id: "settings-preview-estimate",
      number: `${form.businessSettings.numbering.estimatePrefix}-${form.businessSettings.numbering.estimateNextNumber}`,
      total: estimateOptions[0].lineItems[0].unitPrice,
      accepted: false,
      status: "sent",
      expiresAt: new Date(Date.now() + form.businessSettings.estimate.expirationDays * 86_400_000).toISOString(),
      createdAt: new Date().toISOString(),
      options: estimateOptions,
    };
    const estimateVariants = estimateOptions.map((option) => ({
      id: option.id,
      label: option.label,
      html: estimateDocumentHtml({
        estimate: { ...estimateBase, selectedOptionId: option.id },
        customer: { name: "Taylor Morgan", email: "taylor@example.test", phone: "(515) 555-0142" },
        job: { title: "Refrigerator cooling repair", description: "Choose the repair scope that fits the customer’s needs." },
        lineItems: estimateOptions[0].lineItems,
        org: form,
      }),
    }));
    const documents: DocumentPreviewItem[] = [
      { id: "invoice", label: "Invoice", html: invoiceHtml },
      { id: "estimate", label: "Estimate", html: estimateVariants[0].html, variants: estimateVariants },
    ];
    return <DocumentPreviewWorkbench documents={documents} initialDocumentId={tab} compact fileName={`${tab}-preview.html`} />;
  }

  const workDays = WORK_DAYS.filter(([value]) => form.businessSettings.businessHours.workDays.includes(value)).map(([, label]) => label).join(", ");
  return (
    <Card>
      <CardHeader><CardTitle>{tab === "hours" || tab === "areas" ? "Operations summary" : "Customer-facing preview"}</CardTitle></CardHeader>
      <CardContent>
        <div className="rounded-2xl border border-border bg-surface-200 p-5">
          <div className="flex items-center gap-3 border-b border-border pb-4">
            <div className="h-10 w-10 rounded-xl" style={{ background: form.brandColor }} />
            <div>
              <p className="text-sm font-bold text-fg">{form.name}</p>
              <p className="text-xs text-fg-muted">{form.publicPhone || "No phone"} · {form.publicEmail || "No email"}</p>
            </div>
          </div>
          {tab === "hours" ? (
            <div className="mt-4 grid gap-2 text-sm text-fg-muted">
              <p><strong className="text-fg">Work days:</strong> {workDays || "None selected"}</p>
              <p><strong className="text-fg">Hours:</strong> {form.businessSettings.businessHours.startTime}–{form.businessSettings.businessHours.endTime}</p>
              <p><strong className="text-fg">Timezone:</strong> {form.businessSettings.businessHours.timezone}</p>
            </div>
          ) : tab === "areas" ? (
            <div className="mt-4 text-sm text-fg-muted">
              <p><strong className="text-fg">{form.businessSettings.serviceAreas.length}</strong> configured service areas</p>
              <p className="mt-2 break-words">{form.businessSettings.serviceAreas.join(", ") || "No service areas added yet."}</p>
            </div>
          ) : tab === "payments" ? (
            <div className="mt-4 grid gap-2 text-sm text-fg-muted">
              <p><strong className="text-fg">Online payments:</strong> {form.businessSettings.payments.onlinePaymentsEnabled ? "enabled" : "disabled"}</p>
              <p><strong className="text-fg">Manual methods:</strong> {[
                form.businessSettings.payments.allowManualCash ? "Cash" : null,
                form.businessSettings.payments.allowManualCheck ? "Check" : null,
                form.businessSettings.payments.allowManualCard ? "Card" : null,
              ].filter(Boolean).join(", ") || "none enabled"}</p>
              <p><strong className="text-fg">Partial payments:</strong> {form.businessSettings.payments.allowPartialPayments ? "allowed" : "blocked — full balance required"}</p>
              <p><strong className="text-fg">Tips:</strong> {form.businessSettings.payments.tipsEnabled ? "enabled" : "disabled"}</p>
            </div>
          ) : (
            <div className="mt-4 grid gap-2 text-xs text-fg-muted">
              <p>Invoice terms: {form.businessSettings.invoice.dueTerm === "net_days" ? `Net ${form.businessSettings.invoice.netDays}` : form.businessSettings.invoice.dueTerm.replaceAll("_", " ")}</p>
              <p>Invoice number: {form.businessSettings.numbering.invoicePrefix}-{form.businessSettings.numbering.invoiceNextNumber}</p>
              <p>Estimate: expires in {form.businessSettings.estimate.expirationDays} days · {form.businessSettings.estimate.approvalMode.replaceAll("_", " ")}</p>
              <p>Payments: {form.businessSettings.payments.onlinePaymentsEnabled ? "online enabled" : "manual only"} · partial {form.businessSettings.payments.allowPartialPayments ? "allowed" : "blocked"}</p>
              <p>Tax: {form.businessSettings.taxes.taxEnabled ? `${form.businessSettings.taxes.taxLabel} ${form.businessSettings.taxes.defaultTaxRateBps / 100}%` : "disabled"}</p>
              <p>Portal: {form.businessSettings.portal.enabled ? "enabled" : "disabled"} · sponsor slot {form.businessSettings.portal.showSponsorSlot ? "allowed" : "hidden"}</p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function TextField({ label, value, onChange, placeholder, ...inputProps }: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
} & Pick<React.InputHTMLAttributes<HTMLInputElement>, "name" | "type" | "autoComplete">) {
  return (
    <label className="grid gap-1.5 text-sm text-fg-muted">
      {label}
      <Input {...inputProps} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} />
    </label>
  );
}

function NumberField({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return (
    <label className="grid gap-1.5 text-sm text-fg-muted">
      {label}
      <Input type="number" value={value} onChange={(event) => onChange(Number(event.target.value))} />
    </label>
  );
}

function TextArea({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="grid gap-1.5 text-sm text-fg-muted md:col-span-2">
      {label}
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        rows={4}
        className="rounded-lg border border-border bg-surface-200 px-3 py-2 text-sm text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
      />
    </label>
  );
}

function SelectField({ label, value, onChange, children }: { label: string; value: string; onChange: (value: string) => void; children: React.ReactNode }) {
  return (
    <label className="grid gap-1.5 text-sm text-fg-muted">
      {label}
      <select value={value} onChange={(event) => onChange(event.target.value)} className="h-10 rounded-lg border border-border bg-surface-200 px-3 text-sm text-fg">
        {children}
      </select>
    </label>
  );
}

function CheckboxGrid<T extends object>({ values, labels, onChange }: { values: T; labels: { [K in keyof T]: string }; onChange: (key: keyof T, value: boolean) => void }) {
  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
      {(Object.keys(labels) as (keyof T)[]).map((key) => (
        <label key={String(key)} className="flex items-center gap-2 rounded-lg border border-border bg-surface-200 p-3 text-sm text-fg-muted">
          <input type="checkbox" checked={Boolean(values[key])} onChange={(event) => onChange(key, event.target.checked)} />
          {labels[key]}
        </label>
      ))}
    </div>
  );
}

function VisibilityGroup<T extends object>({ title, values, labels, onChange }: { title: string; values: T; labels: { [K in keyof T]: string }; onChange: (values: T) => void }) {
  return (
    <div className="md:col-span-2">
      <p className="mb-2 text-xs font-bold uppercase tracking-wide text-fg-dim">{title}</p>
      <CheckboxGrid values={values} labels={labels} onChange={(key, value) => onChange({ ...values, [key]: value })} />
    </div>
  );
}

function splitCsv(value: string) {
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}
