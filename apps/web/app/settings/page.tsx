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
        <button
          onClick={() => setTab("team")}
          className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors cursor-pointer border-none ${
            tab === "team" ? "bg-accent text-white" : "text-fg-muted hover:text-fg"
          }`}
        >
          Team
        </button>
        <button
          onClick={() => setTab("general")}
          className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors cursor-pointer border-none ${
            tab === "general" ? "bg-accent text-white" : "text-fg-muted hover:text-fg"
          }`}
        >
          General
        </button>
        <button
          onClick={() => setTab("templates")}
          className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors cursor-pointer border-none ${
            tab === "templates" ? "bg-accent text-white" : "text-fg-muted hover:text-fg"
          }`}
        >
          Templates
        </button>
        <button
          onClick={() => setTab("automation")}
          className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors cursor-pointer border-none ${
            tab === "automation" ? "bg-accent text-white" : "text-fg-muted hover:text-fg"
          }`}
        >
          Automation
        </button>
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
                    <option value="admin">Admin</option>
                    <option value="tech">Tech</option>
                    <option value="dispatcher">Dispatcher</option>
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

function GeneralTab() {
  const [org, setOrg] = useState<{ id: string; name: string } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    api.publicOrg().then((r) => {
      if (!cancelled) setOrg(r.org);
    }).catch(() => {}).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, []);

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
    <Card>
      <CardHeader><CardTitle>Organization</CardTitle></CardHeader>
      <CardContent>
        {org ? (
          <div className="space-y-3">
            <div>
              <p className="text-xs font-semibold text-fg-muted mb-1">Name</p>
              <p className="text-sm text-fg">{org.name}</p>
            </div>
            <div>
              <p className="text-xs font-semibold text-fg-muted mb-1">ID</p>
              <p className="text-sm text-fg-muted font-mono text-xs">{org.id}</p>
            </div>
            {/* ponytail: read-only org info. Ceiling: no org settings/update API yet.
                Upgrade: add PATCH /api/org/:id endpoint and editable fields. */}
            <p className="text-xs text-fg-dim mt-4">Organization settings are read-only for now.</p>
          </div>
        ) : (
          <p className="text-sm text-fg-muted">Could not load organization info.</p>
        )}
      </CardContent>
    </Card>
  );
}

function TemplatesTab() {
  return <TemplateEditor />;
}
