"use client";

import { useEffect, useState } from "react";
import { planLabel, featuresForPlan, THEMES } from "@ofp/shared";
import { api, friendlyError } from "@/lib/api";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { TemplateEditor } from "@/components/template-editor";
import { AutomationRules } from "@/components/automation-rules";
import { useTheme } from "@/components/theme-provider";

type Tab = "team" | "general" | "templates" | "automation";

interface User {
  id: string;
  name: string;
  email: string;
  role: string;
}

export default function SettingsPage() {
  const [tab, setTab] = useState<Tab>("team");

  return (
    <div>
      <PageHeader title="Settings" description="Manage your team, organization, notification templates, and automation rules" />

      {/* Tab bar */}
      <div className="flex gap-1 mb-6 bg-surface-200 rounded-lg p-1 w-fit">
        {(
          [
            ["team", "Team"],
            ["general", "General"],
            ["templates", "Templates"],
            ["automation", "Automation"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors cursor-pointer border-none ${
              tab === key ? "bg-accent text-white" : "text-fg-muted hover:text-fg"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "team" && <TeamTab />}
      {tab === "general" && <GeneralTab />}
      {tab === "templates" && <TemplatesTab />}
      {tab === "automation" && <AutomationTab />}
    </div>
  );
}

function AutomationTab() {
  return <AutomationRules />;
}

const initMember = { name: "", email: "", role: "technician", password: "" };

function TeamTab() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [member, setMember] = useState(initMember);
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  const handleAdd = async () => {
    setAdding(true);
    setAddError(null);
    try {
      const created = await api.createUser(member);
      setUsers((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
      setAddOpen(false);
      setMember(initMember);
    } catch (e) {
      setAddError(
        (e as Error).message.includes("409")
          ? "That email is already in use."
          : "Couldn't add member. Password needs at least 8 characters.",
      );
    }
    setAdding(false);
  };

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const u = await api.users();
        if (!cancelled) setUsers(u);
      } catch {
        if (!cancelled) setError("Failed to load users");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  const handleRoleChange = async (id: string, role: string) => {
    setSavingId(id);
    try {
      await api.patchUser(id, { role });
      setUsers((prev) => prev.map((u) => (u.id === id ? { ...u, role } : u)));
    } catch { /* silent */ }
    setSavingId(null);
  };

  const handleDelete = async (id: string) => {
    try {
      await api.deleteUser(id);
      setUsers((prev) => prev.filter((u) => u.id !== id));
    } catch { /* silent */ }
    setConfirmDelete(null);
  };

  if (loading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-14 rounded-xl" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <Card className="border-red/30 bg-red/5">
        <CardContent className="p-4">
          <p className="text-sm text-red">{error}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <div className="flex justify-end mb-3">
        <Button size="sm" onClick={() => setAddOpen(true)}>Add member</Button>
      </div>

      {addOpen && (
        <Card className="mb-4">
          <CardHeader>
            <CardTitle>Add team member</CardTitle>
            <p className="text-xs text-fg-muted pt-1">
              Technicians sign in to the tech view (jobs, schedule, tech mode) — they can&apos;t
              see invoices, reports, or settings. Share the password with them directly.
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <input
                placeholder="Full name"
                value={member.name}
                onChange={(e) => setMember((m) => ({ ...m, name: e.target.value }))}
                className="h-9 rounded-md border border-border bg-surface-300 px-2.5 text-sm text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
              />
              <input
                placeholder="email@company.com"
                autoComplete="off"
                value={member.email}
                onChange={(e) => setMember((m) => ({ ...m, email: e.target.value }))}
                className="h-9 rounded-md border border-border bg-surface-300 px-2.5 text-sm text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
              />
              <select
                value={member.role}
                onChange={(e) => setMember((m) => ({ ...m, role: e.target.value }))}
                style={{ colorScheme: "dark" }}
                className="h-9 rounded-md border border-border bg-surface-300 px-2 text-sm text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 cursor-pointer"
              >
                <option value="technician">Technician — tech view only</option>
                <option value="dispatcher">Dispatcher — operations, no settings</option>
                <option value="owner">Owner — full access</option>
              </select>
              <input
                placeholder="Initial password (8+ chars)"
                type="password"
                autoComplete="new-password"
                value={member.password}
                onChange={(e) => setMember((m) => ({ ...m, password: e.target.value }))}
                className="h-9 rounded-md border border-border bg-surface-300 px-2.5 text-sm text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
              />
            </div>
            {addError && <p className="text-xs text-red">{addError}</p>}
            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="sm" disabled={adding} onClick={() => { setAddOpen(false); setMember(initMember); }}>
                Cancel
              </Button>
              <Button
                size="sm"
                disabled={adding || !member.name.trim() || !member.email.includes("@") || member.password.length < 8}
                onClick={handleAdd}
              >
                {adding ? "Adding…" : "Add member"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Role</TableHead>
              <TableHead className="w-20">Actions</TableHead>
            </TableRow>
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
                    style={{ colorScheme: "dark" }}
                    className="h-8 rounded-md border border-border bg-surface-300 px-2 text-xs text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 cursor-pointer disabled:opacity-50"
                  >
                    <option value="owner">Owner</option>
                    <option value="dispatcher">Dispatcher</option>
                    <option value="technician">Technician</option>
                  </select>
                </TableCell>
                <TableCell>
                  {confirmDelete === u.id ? (
                    <div className="flex gap-1">
                      <button
                        onClick={() => handleDelete(u.id)}
                        className="text-xs text-red hover:text-red/80 transition-colors cursor-pointer bg-transparent border-none"
                      >
                        Confirm
                      </button>
                      <button
                        onClick={() => setConfirmDelete(null)}
                        className="text-xs text-fg-muted hover:text-fg transition-colors cursor-pointer bg-transparent border-none"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setConfirmDelete(u.id)}
                      className="text-xs text-fg-muted hover:text-red transition-colors cursor-pointer bg-transparent border-none"
                    >
                      Delete
                    </button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      {users.length === 0 && (
        <Card>
          <CardContent className="p-8 text-center">
            <p className="text-sm text-fg-muted">No users found.</p>
          </CardContent>
        </Card>
      )}
    </>
  );
}

const COMMON_TIMEZONES = [
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Phoenix",
  "America/Los_Angeles",
  "America/Anchorage",
  "Pacific/Honolulu",
];

function GeneralTab() {
  const [org, setOrg] = useState<import("@/lib/api").OrgDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [timezone, setTimezone] = useState("America/New_York");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [licenseKey, setLicenseKey] = useState("");
  const [redeeming, setRedeeming] = useState(false);
  const [licenseMsg, setLicenseMsg] = useState<string | null>(null);

  const redeem = async () => {
    setRedeeming(true);
    setLicenseMsg(null);
    try {
      const updated = await api.redeemLicense(licenseKey.trim());
      setOrg(updated);
      setLicenseKey("");
      setLicenseMsg(`${planLabel(updated.plan)} activated — thank you for supporting OpenFieldPro!`);
    } catch (e) {
      setLicenseMsg(`Activation failed: ${friendlyError(e)}`);
    }
    setRedeeming(false);
  };

  useEffect(() => {
    let cancelled = false;
    api.org().then((o) => {
      if (cancelled) return;
      setOrg(o);
      setName(o.name);
      setTimezone(o.timezone);
    }).catch(() => {}).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, []);

  const dirty = org !== null && (name !== org.name || timezone !== org.timezone);

  const save = async () => {
    setSaving(true);
    setMsg(null);
    try {
      const updated = await api.patchOrg({ name, timezone });
      setOrg(updated);
      setMsg("Saved.");
    } catch (e) {
      setMsg(`Save failed: ${(e as Error).message}`);
    }
    setSaving(false);
  };

  if (loading) {
    return (
      <Card>
        <CardHeader><CardTitle>Organization</CardTitle></CardHeader>
        <CardContent>
          <Skeleton className="h-5 w-48" />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="max-w-xl space-y-6">
    <Card>
      <CardHeader>
        <CardTitle>Organization</CardTitle>
        <p className="text-xs text-fg-muted pt-1">
          The business name appears on invoices, estimates, and every customer email.
        </p>
      </CardHeader>
      <CardContent>
        {org ? (
          <div className="space-y-4">
            <label className="block">
              <span className="text-xs font-semibold text-fg-muted">Business name</span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="mt-1 w-full h-9 rounded-md border border-border bg-surface-300 px-2.5 text-sm text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
              />
            </label>
            <label className="block">
              <span className="text-xs font-semibold text-fg-muted">Timezone</span>
              <select
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
                style={{ colorScheme: "dark" }}
                className="mt-1 w-full h-9 rounded-md border border-border bg-surface-300 px-2 text-sm text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 cursor-pointer"
              >
                {[...new Set([org.timezone, ...COMMON_TIMEZONES])].map((tz) => (
                  <option key={tz} value={tz}>{tz}</option>
                ))}
              </select>
            </label>
            <div>
              <p className="text-xs font-semibold text-fg-muted mb-1">Organization ID</p>
              <p className="text-fg-muted font-mono text-xs">{org.id}</p>
            </div>
            <div className="flex items-center gap-3 pt-1">
              <Button onClick={save} disabled={saving || !dirty || !name.trim()}>
                {saving ? "Saving…" : "Save changes"}
              </Button>
              {msg && <span className="text-xs text-fg-muted">{msg}</span>}
            </div>
          </div>
        ) : (
          <p className="text-sm text-fg-muted">Could not load organization info.</p>
        )}
      </CardContent>
    </Card>

    {org && (
      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle>Plan &amp; License</CardTitle>
          <span
            className={`text-[11px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded ${
              org.plan !== "free" ? "bg-accent/20 text-accent" : "bg-surface-300 text-fg-muted"
            }`}
          >
            {planLabel(org.plan)}
          </span>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {org.plan !== "free" ? (
              <div className="space-y-1">
                <p className="text-sm text-fg-muted">
                  {org.plan === "business"
                    ? "Business is active — premium integrations are unlocked, the sponsor slot is removed, and your documents are unbranded."
                    : org.plan === "founder"
                      ? "Founder is active — lifetime Pro access. Every Pro feature is unlocked, forever. Thank you for backing OpenFieldPro early!"
                      : "Pro is active — the sponsor slot is removed and your customer-facing documents are unbranded."}{" "}
                  Thank you for supporting open-source OpenFieldPro!
                </p>
                {org.license && (
                  <p className="text-xs text-fg-muted">
                    {org.license.lifetime
                      ? "License: Lifetime — never expires."
                      : `License expires ${new Date(org.license.expiresAt!).toLocaleDateString()}.`}
                    {org.license.customerName ? ` Licensed to ${org.license.customerName}.` : ""}
                  </p>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                {org.license?.invalidReason && (
                  <p className="text-xs text-yellow">
                    Your license key is no longer valid ({org.license.invalidReason}) — this
                    install is back on the Free plan. Nothing was deleted; all features below
                    are still fully usable. Renew and paste a new key to restore Pro.
                  </p>
                )}
                <p className="text-sm text-fg-muted">
                  OpenFieldPro is free and open source — the Free plan is the complete product
                  with unlimited users, technicians, jobs, and customers, forever. A Pro or
                  Founder license removes the sponsor slot and unbrands your invoices and
                  emails; Business adds premium integrations like QuickBooks and Zapier.
                </p>
              </div>
            )}
            <div className="flex gap-2">
              <input
                value={licenseKey}
                onChange={(e) => setLicenseKey(e.target.value)}
                placeholder="OFP1.…"
                aria-label="License key"
                className="flex-1 h-9 rounded-md border border-border bg-surface-300 px-2.5 text-sm font-mono text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
              />
              <Button onClick={redeem} disabled={redeeming || licenseKey.trim().length < 16}>
                {redeeming ? "Activating…" : org.plan !== "free" ? "Replace key" : "Activate"}
              </Button>
            </div>
            <p className="text-[11px] text-fg-dim">
              Keys are verified locally on your server (Ed25519 signature) — OpenFieldPro
              never phones home, and no license server is involved. See{" "}
              <a
                href="https://github.com/niko4244/openfieldpro/blob/main/docs/MONETIZATION.md"
                target="_blank"
                rel="noreferrer"
                className="text-accent hover:underline"
              >
                how licensing works
              </a>
              .
            </p>
          </div>
          {licenseMsg && <p className="text-xs text-fg-muted pt-2">{licenseMsg}</p>}
        </CardContent>
      </Card>
    )}

    {org && <AppearanceCard plan={org.plan} />}
    </div>
  );
}

// Theme-pack picker (accent-color reskin, separate from the sidebar's
// light/dark mode toggle). Free always keeps default/dark; everything else
// needs Pro/Founder/Business. If the org's plan no longer covers the
// currently-applied pack (e.g. an annual key lapsed), silently reset to
// default — a display setting, not user data, so no confirmation needed.
function AppearanceCard({ plan }: { plan: import("@ofp/shared").Plan }) {
  const { themePack, setThemePack } = useTheme();
  const unlocked = featuresForPlan(plan).customThemes;

  useEffect(() => {
    if (!unlocked && themePack !== "default") setThemePack("default");
  }, [unlocked, themePack, setThemePack]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Appearance</CardTitle>
        <p className="text-xs text-fg-muted pt-1">
          Accent color pack. Pairs with the light/dark mode toggle in the sidebar.
        </p>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {THEMES.map((t) => {
            const locked = t.tierRequired !== "free" && !unlocked;
            const active = themePack === t.id;
            return (
              <button
                key={t.id}
                type="button"
                disabled={locked}
                onClick={() => setThemePack(t.id)}
                title={t.description}
                className={`text-left rounded-md border px-3 py-2 text-xs transition-colors ${
                  active ? "border-accent bg-accent/10" : "border-border bg-surface-300"
                } ${locked ? "opacity-50 cursor-not-allowed" : "hover:border-accent/60 cursor-pointer"}`}
              >
                <span className="flex items-center justify-between gap-1">
                  <span className="font-semibold text-fg">{t.name}</span>
                  {locked && (
                    <span className="text-[10px] uppercase tracking-wide text-fg-dim">Pro</span>
                  )}
                </span>
              </button>
            );
          })}
        </div>
        {!unlocked && (
          <p className="text-[11px] text-fg-dim pt-3">
            Premium theme packs unlock with a Pro, Founder, or Business license.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function TemplatesTab() {
  return <TemplateEditor />;
}
