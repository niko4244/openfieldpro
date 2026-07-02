"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { TemplateEditor } from "@/components/template-editor";
import { AutomationRules } from "@/components/automation-rules";

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

function TeamTab() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

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
      setLicenseMsg("Pro activated — thank you for supporting OpenFieldPro!");
    } catch (e) {
      setLicenseMsg(`Activation failed: ${(e as Error).message}`);
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
          <CardTitle>Plan</CardTitle>
          <span
            className={`text-[11px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded ${
              org.plan === "pro" ? "bg-accent/20 text-accent" : "bg-surface-300 text-fg-muted"
            }`}
          >
            {org.plan}
          </span>
        </CardHeader>
        <CardContent>
          {org.plan !== "free" ? (
            <p className="text-sm text-fg-muted">
              {org.plan === "business"
                ? "Business is active — premium integrations are unlocked, the sponsor slot is removed, and your documents are unbranded."
                : "Pro is active — the sponsor slot is removed and your customer-facing documents are unbranded."}{" "}
              Thank you for supporting open-source OpenFieldPro!
            </p>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-fg-muted">
                OpenFieldPro is free and open source. A Pro license removes the sponsor slot
                and unbrands your invoices and emails; Business adds premium integrations
                like QuickBooks and Zapier. Activation is offline — no account needed.
              </p>
              <div className="flex gap-2">
                <input
                  value={licenseKey}
                  onChange={(e) => setLicenseKey(e.target.value)}
                  placeholder="OFP1.…"
                  className="flex-1 h-9 rounded-md border border-border bg-surface-300 px-2.5 text-sm font-mono text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
                />
                <Button onClick={redeem} disabled={redeeming || licenseKey.trim().length < 16}>
                  {redeeming ? "Activating…" : "Activate"}
                </Button>
              </div>
            </div>
          )}
          {licenseMsg && <p className="text-xs text-fg-muted pt-2">{licenseMsg}</p>}
        </CardContent>
      </Card>
    )}
    </div>
  );
}

function TemplatesTab() {
  return <TemplateEditor />;
}
