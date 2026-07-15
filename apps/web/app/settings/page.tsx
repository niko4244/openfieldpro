"use client";

import type React from "react";
import { useEffect, useState } from "react";
import { api, type BusinessSettingsDTO, type OrgSettingsDTO } from "@/lib/api";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";

type Tab = "company" | "invoice" | "estimate" | "payments" | "taxes" | "messages" | "numbering" | "portal" | "team";

const TABS: { id: Tab; label: string }[] = [
  { id: "company", label: "Company" },
  { id: "invoice", label: "Invoices" },
  { id: "estimate", label: "Estimates" },
  { id: "payments", label: "Payments" },
  { id: "taxes", label: "Taxes & Discounts" },
  { id: "messages", label: "Messages" },
  { id: "numbering", label: "Numbering" },
  { id: "portal", label: "Portal" },
  { id: "team", label: "Team" },
];

interface User {
  id: string;
  name: string;
  email: string;
  role: string;
}

export default function SettingsPage() {
  const [tab, setTab] = useState<Tab>("company");

  return (
    <div>
      <PageHeader
        title="Settings"
        description="Configure the business rules that drive invoices, estimates, payments, documents, the customer portal, and team access."
      />

      <div className="mb-6 flex flex-wrap gap-1 rounded-xl bg-surface-200 p-1">
        {TABS.map((item) => (
          <button
            key={item.id}
            onClick={() => setTab(item.id)}
            className={`rounded-lg border-none px-3 py-2 text-xs font-bold transition-colors ${
              tab === item.id ? "bg-accent text-white" : "bg-transparent text-fg-muted hover:text-fg"
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {tab === "team" ? <TeamTab /> : <BusinessSettingsTab tab={tab} />}
    </div>
  );
}

function BusinessSettingsTab({ tab }: { tab: Exclude<Tab, "team"> }) {
  const [org, setOrg] = useState<OrgSettingsDTO | null>(null);
  const [form, setForm] = useState<OrgSettingsDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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

  const updateOrg = <K extends keyof OrgSettingsDTO>(key: K, value: OrgSettingsDTO[K]) => {
    setForm((prev) => prev ? { ...prev, [key]: value } : prev);
  };

  const updateSettings = (next: BusinessSettingsDTO) => {
    setForm((prev) => prev ? { ...prev, businessSettings: next } : prev);
  };

  const save = async () => {
    if (!form) return;
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
      setError(err instanceof Error ? err.message : "Could not save settings");
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
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1fr_360px]">
      <Card>
        <CardHeader>
          <CardTitle>{TABS.find((item) => item.id === tab)?.label}</CardTitle>
        </CardHeader>
        <CardContent>
          {tab === "company" && <CompanySection form={form} updateOrg={updateOrg} updateSettings={updateSettings} />}
          {tab === "invoice" && <InvoiceSection settings={settings} updateSettings={updateSettings} />}
          {tab === "estimate" && <EstimateSection settings={settings} updateSettings={updateSettings} />}
          {tab === "payments" && <PaymentsSection settings={settings} updateSettings={updateSettings} />}
          {tab === "taxes" && <TaxesSection settings={settings} updateSettings={updateSettings} />}
          {tab === "messages" && <MessagesSection settings={settings} updateSettings={updateSettings} />}
          {tab === "numbering" && <NumberingSection settings={settings} updateSettings={updateSettings} />}
          {tab === "portal" && <PortalSection settings={settings} updateSettings={updateSettings} />}

          {(message || error) && <p className={`mt-4 text-sm ${error ? "text-red" : "text-green"}`}>{error ?? message}</p>}

          <div className="mt-6 flex gap-2">
            <Button onClick={save} disabled={saving}>{saving ? "Saving..." : "Save settings"}</Button>
            <Button variant="secondary" onClick={() => setForm(org)} disabled={saving}>Reset</Button>
          </div>
        </CardContent>
      </Card>

      <SettingsPreview form={form} />
    </div>
  );
}

function CompanySection({
  form,
  updateOrg,
  updateSettings,
}: {
  form: OrgSettingsDTO;
  updateOrg: <K extends keyof OrgSettingsDTO>(key: K, value: OrgSettingsDTO[K]) => void;
  updateSettings: (settings: BusinessSettingsDTO) => void;
}) {
  const settings = form.businessSettings;
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <TextField label="Company name" value={form.name} onChange={(value) => updateOrg("name", value)} />
      <TextField label="Timezone" value={form.timezone} onChange={(value) => updateOrg("timezone", value)} />
      <label className="grid gap-1.5 text-sm text-fg-muted">
        Brand color
        <div className="flex gap-2">
          <Input value={form.brandColor} onChange={(event) => updateOrg("brandColor", event.target.value)} />
          <input
            aria-label="Brand color picker"
            type="color"
            value={form.brandColor}
            onChange={(event) => updateOrg("brandColor", event.target.value)}
            className="h-10 w-14 rounded-lg border border-border bg-surface-200 p-1"
          />
        </div>
      </label>
      <TextField label="Logo URL" value={form.logoUrl ?? ""} onChange={(value) => updateOrg("logoUrl", value || null)} placeholder="https://..." />
      <TextField label="Public email" value={form.publicEmail ?? ""} onChange={(value) => updateOrg("publicEmail", value || null)} />
      <TextField label="Public phone" value={form.publicPhone ?? ""} onChange={(value) => updateOrg("publicPhone", value || null)} />
      <div className="md:col-span-2">
        <TextField label="Public address" value={form.publicAddress ?? ""} onChange={(value) => updateOrg("publicAddress", value || null)} />
      </div>
      <TextField label="Business day starts" value={settings.businessHours.startTime} onChange={(value) => updateSettings({ ...settings, businessHours: { ...settings.businessHours, startTime: value } })} />
      <TextField label="Business day ends" value={settings.businessHours.endTime} onChange={(value) => updateSettings({ ...settings, businessHours: { ...settings.businessHours, endTime: value } })} />
      <div className="md:col-span-2">
        <TextField
          label="Service areas"
          value={settings.serviceAreas.join(", ")}
          onChange={(value) => updateSettings({ ...settings, serviceAreas: splitCsv(value) })}
          placeholder="Denver, Lakewood, Aurora"
        />
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

function InvoiceSection({ settings, updateSettings }: SettingsProps) {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
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
          showBusinessInfo: "Business info",
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
          showBusinessInfo: "Business info",
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
  return (
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

function MessagesSection({ settings, updateSettings }: SettingsProps) {
  return (
    <div className="grid gap-4">
      <TextField label="Invoice email subject" value={settings.messages.invoiceEmailSubject} onChange={(value) => updateSettings({ ...settings, messages: { ...settings.messages, invoiceEmailSubject: value } })} />
      <TextArea label="Invoice email body" value={settings.messages.invoiceEmailBody} onChange={(value) => updateSettings({ ...settings, messages: { ...settings.messages, invoiceEmailBody: value } })} />
      <TextField label="Estimate email subject" value={settings.messages.estimateEmailSubject} onChange={(value) => updateSettings({ ...settings, messages: { ...settings.messages, estimateEmailSubject: value } })} />
      <TextArea label="Estimate email body" value={settings.messages.estimateEmailBody} onChange={(value) => updateSettings({ ...settings, messages: { ...settings.messages, estimateEmailBody: value } })} />
      <TextArea label="Review request message" value={settings.messages.reviewRequestBody} onChange={(value) => updateSettings({ ...settings, messages: { ...settings.messages, reviewRequestBody: value } })} />
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

function TeamTab() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api.users()
      .then((rows) => { if (!cancelled) setUsers(rows); })
      .catch(() => { if (!cancelled) setError("Failed to load users"); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const handleRoleChange = async (id: string, role: string) => {
    setSavingId(id);
    try {
      await api.patchUser(id, { role });
      setUsers((prev) => prev.map((u) => (u.id === id ? { ...u, role } : u)));
    } finally {
      setSavingId(null);
    }
  };

  const handleDelete = async (id: string) => {
    await api.deleteUser(id);
    setUsers((prev) => prev.filter((u) => u.id !== id));
    setConfirmDelete(null);
  };

  if (loading) return <div className="space-y-3">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-14 rounded-xl" />)}</div>;
  if (error) return <Card className="border-red/30 bg-red/5"><CardContent className="p-4"><p className="text-sm text-red">{error}</p></CardContent></Card>;

  return (
    <Card className="overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow><TableHead>Name</TableHead><TableHead>Email</TableHead><TableHead>Role</TableHead><TableHead className="w-24">Actions</TableHead></TableRow>
        </TableHeader>
        <TableBody>
          {users.map((u) => (
            <TableRow key={u.id}>
              <TableCell className="font-medium text-fg">{u.name}</TableCell>
              <TableCell className="text-fg-muted">{u.email}</TableCell>
              <TableCell>
                <select
                  value={u.role}
                  onChange={(e) => handleRoleChange(u.id, e.target.value)}
                  disabled={savingId === u.id}
                  className="h-8 rounded-md border border-border bg-surface-300 px-2 text-xs text-fg"
                >
                  <option value="owner">Owner</option>
                  <option value="dispatcher">Dispatcher</option>
                  <option value="technician">Technician</option>
                </select>
              </TableCell>
              <TableCell>
                {confirmDelete === u.id ? (
                  <div className="flex gap-2">
                    <button onClick={() => handleDelete(u.id)} className="border-none bg-transparent text-xs text-red">Confirm</button>
                    <button onClick={() => setConfirmDelete(null)} className="border-none bg-transparent text-xs text-fg-muted">Cancel</button>
                  </div>
                ) : (
                  <button onClick={() => setConfirmDelete(u.id)} className="border-none bg-transparent text-xs text-fg-muted hover:text-red">Delete</button>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  );
}

interface SettingsProps {
  settings: BusinessSettingsDTO;
  updateSettings: (settings: BusinessSettingsDTO) => void;
}

function SettingsPreview({ form }: { form: OrgSettingsDTO }) {
  return (
    <Card>
      <CardHeader><CardTitle>Customer-facing preview</CardTitle></CardHeader>
      <CardContent>
        <div className="rounded-2xl border border-border bg-surface-200 p-5">
          <div className="flex items-center gap-3 border-b border-border pb-4">
            <div className="h-10 w-10 rounded-xl" style={{ background: form.brandColor }} />
            <div>
              <p className="text-sm font-bold text-fg">{form.name}</p>
              <p className="text-xs text-fg-muted">{form.publicPhone || "No phone"} · {form.publicEmail || "No email"}</p>
            </div>
          </div>
          <div className="mt-4 grid gap-2 text-xs text-fg-muted">
            <p>Invoice terms: {form.businessSettings.invoice.dueTerm === "net_days" ? `Net ${form.businessSettings.invoice.netDays}` : form.businessSettings.invoice.dueTerm.replaceAll("_", " ")}</p>
            <p>Invoice number: {form.businessSettings.numbering.invoicePrefix}-{form.businessSettings.numbering.invoiceNextNumber}</p>
            <p>Estimate: expires in {form.businessSettings.estimate.expirationDays} days · {form.businessSettings.estimate.approvalMode.replaceAll("_", " ")}</p>
            <p>Payments: {form.businessSettings.payments.onlinePaymentsEnabled ? "online enabled" : "manual only"} · partial {form.businessSettings.payments.allowPartialPayments ? "allowed" : "blocked"}</p>
            <p>Tax: {form.businessSettings.taxes.taxEnabled ? `${form.businessSettings.taxes.taxLabel} ${form.businessSettings.taxes.defaultTaxRateBps / 100}%` : "disabled"}</p>
            <p>Portal: {form.businessSettings.portal.enabled ? "enabled" : "disabled"} · sponsor slot {form.businessSettings.portal.showSponsorSlot ? "allowed" : "hidden"}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function TextField({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string }) {
  return (
    <label className="grid gap-1.5 text-sm text-fg-muted">
      {label}
      <Input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} />
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
