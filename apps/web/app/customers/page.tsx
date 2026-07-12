"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { ActivityDTO, CustomerDTO } from "@ofp/shared";
import { api } from "@/lib/api";
import { customerWorkspaceCapabilities } from "@/lib/customer-role";
import { useSessionUser } from "@/lib/use-session-user";
import { formatRelativeTime } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { Pagination } from "@/components/pagination";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const PAGE_SIZE = 50;

export default function CustomersPage() {
  const { user, loading: sessionLoading } = useSessionUser();
  const role = user?.role ?? null;
  const capabilities = customerWorkspaceCapabilities(role);
  const isTechnician = role === "technician";

  const [customers, setCustomers] = useState<CustomerDTO[]>([]);
  const [activities, setActivities] = useState<ActivityDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [skip, setSkip] = useState(0);

  const [showCreate, setShowCreate] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createEmail, setCreateEmail] = useState("");
  const [createPhone, setCreatePhone] = useState("");
  const [createNotes, setCreateNotes] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  useEffect(() => setSkip(0), [search]);

  useEffect(() => {
    if (sessionLoading) return;
    if (!user) {
      setError("Sign in before viewing customer records.");
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);
    Promise.all([
      api.customers(),
      api.activities().catch(() => [] as ActivityDTO[]),
    ])
      .then(([customerRows, activityRows]) => {
        if (cancelled) return;
        setCustomers(customerRows);
        setActivities(activityRows);
      })
      .catch((caught) => {
        if (!cancelled) {
          setError(caught instanceof Error ? caught.message : String(caught));
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [sessionLoading, user?.id]);

  const lastActivityMap = useMemo(() => {
    const map = new Map<string, ActivityDTO>();
    for (const activity of activities) {
      if (!activity.customerId) continue;
      const existing = map.get(activity.customerId);
      if (!existing || new Date(activity.createdAt) > new Date(existing.createdAt)) {
        map.set(activity.customerId, activity);
      }
    }
    return map;
  }, [activities]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return [...customers]
      .filter((customer) =>
        !query ||
        customer.name.toLowerCase().includes(query) ||
        customer.email?.toLowerCase().includes(query) ||
        customer.phone?.toLowerCase().includes(query),
      )
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [customers, search]);

  const paginated = useMemo(
    () => filtered.slice(skip, skip + PAGE_SIZE),
    [filtered, skip],
  );

  function resetCreateForm() {
    setCreateName("");
    setCreateEmail("");
    setCreatePhone("");
    setCreateNotes("");
    setCreateError(null);
  }

  async function createCustomer(event: React.FormEvent) {
    event.preventDefault();
    if (!capabilities.createCustomer || !createName.trim()) return;
    setCreating(true);
    setCreateError(null);
    try {
      const created = await api.createCustomer({
        name: createName.trim(),
        email: createEmail.trim() || undefined,
        phone: createPhone.trim() || undefined,
        notes: createNotes.trim() || undefined,
      });
      setCustomers((rows) => [created, ...rows]);
      setShowCreate(false);
      resetCreateForm();
    } catch (caught) {
      setCreateError(caught instanceof Error ? caught.message : "Unable to create customer");
    } finally {
      setCreating(false);
    }
  }

  if (sessionLoading || loading) {
    return (
      <div>
        <div className="mb-8 flex items-end justify-between">
          <div>
            <Skeleton className="mb-2 h-8 w-40" />
            <Skeleton className="h-4 w-64" />
          </div>
          <Skeleton className="h-10 w-32 rounded-lg" />
        </div>
        <Skeleton className="mb-4 h-10 w-80 rounded-lg" />
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <Skeleton key={index} className="h-40 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div data-testid="customer-workspace">
      <PageHeader
        title={isTechnician ? "Route customers" : "Customers"}
        description={
          isTechnician
            ? `${customers.length} customer${customers.length === 1 ? "" : "s"} connected to assigned work`
            : `${customers.length} organization customer${customers.length === 1 ? "" : "s"}`
        }
        actions={
          capabilities.createCustomer ? (
            <Button size="sm" onClick={() => setShowCreate(true)}>
              + New Customer
            </Button>
          ) : undefined
        }
      />

      {isTechnician && (
        <Card className="mb-5 border-blue/20 bg-blue/5">
          <CardContent className="p-4">
            <p className="text-sm font-semibold text-fg">Assigned-customer view</p>
            <p className="mt-1 text-xs text-fg-muted">
              Customer creation and contact-record editing stay with the office. Equipment evidence may be added from an assigned customer record.
            </p>
          </CardContent>
        </Card>
      )}

      {error && (
        <Card className="mb-5 border-red/30 bg-red/5">
          <CardContent className="p-4 text-sm text-red">{error}</CardContent>
        </Card>
      )}

      {customers.length > 0 && (
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <Input
            type="search"
            placeholder="Search by name, email, or phone…"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="max-w-md"
          />
          <div className="flex gap-5 text-xs text-fg-muted">
            <span><strong className="text-fg">{filtered.length}</strong> visible</span>
            <span><strong className="text-fg">{lastActivityMap.size}</strong> with activity</span>
          </div>
        </div>
      )}

      {customers.length === 0 && !error ? (
        <Card>
          <CardContent className="py-8">
            <EmptyState
              title={isTechnician ? "No assigned customers" : "No customers yet"}
              description={
                isTechnician
                  ? "Customers appear after a work order is assigned to you."
                  : "Create the first customer record to begin scheduling work."
              }
            />
            {capabilities.createCustomer && (
              <div className="mt-4 flex justify-center">
                <Button size="sm" onClick={() => setShowCreate(true)}>+ New Customer</Button>
              </div>
            )}
          </CardContent>
        </Card>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center">
            <p className="text-sm text-fg-muted">No customers match “{search}”.</p>
            <button
              type="button"
              onClick={() => setSearch("")}
              className="mt-2 border-none bg-transparent text-xs text-fg-link hover:text-fg"
            >
              Clear search
            </button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {paginated.map((customer) => {
            const lastActivity = lastActivityMap.get(customer.id);
            return (
              <Link
                key={customer.id}
                href={`/customers/${customer.id}`}
                className="block no-underline hover:no-underline"
              >
                <Card className="h-full p-4 transition-colors hover:bg-surface-400">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-fg">{customer.name}</p>
                      <p className="mt-1 text-xs text-fg-muted">
                        {[customer.email, customer.phone].filter(Boolean).join(" · ") || "No contact details"}
                      </p>
                    </div>
                    <span className="shrink-0 text-sm text-fg-dim">→</span>
                  </div>
                  <div className="mt-4 border-t border-border pt-3">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-fg-dim">Last activity</p>
                    <p className="mt-1 line-clamp-2 text-xs text-fg">
                      {lastActivity?.summary ?? "No activity recorded"}
                    </p>
                    <p className="mt-1 text-[10px] text-fg-dim">
                      {lastActivity ? formatRelativeTime(lastActivity.createdAt) : `Added ${new Date(customer.createdAt).toLocaleDateString()}`}
                    </p>
                  </div>
                </Card>
              </Link>
            );
          })}
        </div>
      )}

      <Pagination
        skip={skip}
        take={PAGE_SIZE}
        total={filtered.length}
        onSkipChange={setSkip}
      />

      {capabilities.createCustomer && (
        <Dialog
          open={showCreate}
          onOpenChange={(open) => {
            setShowCreate(open);
            if (!open) resetCreateForm();
          }}
        >
          <DialogHeader><DialogTitle>New Customer</DialogTitle></DialogHeader>
          <DialogContent>
            <form onSubmit={createCustomer} className="flex flex-col gap-4">
              <label className="flex flex-col gap-1.5 text-xs font-medium text-fg-muted">
                Name *
                <Input value={createName} onChange={(event) => setCreateName(event.target.value)} required autoFocus />
              </label>
              <label className="flex flex-col gap-1.5 text-xs font-medium text-fg-muted">
                Email
                <Input type="email" value={createEmail} onChange={(event) => setCreateEmail(event.target.value)} />
              </label>
              <label className="flex flex-col gap-1.5 text-xs font-medium text-fg-muted">
                Phone
                <Input value={createPhone} onChange={(event) => setCreatePhone(event.target.value)} />
              </label>
              <label className="flex flex-col gap-1.5 text-xs font-medium text-fg-muted">
                Notes
                <textarea
                  rows={3}
                  value={createNotes}
                  onChange={(event) => setCreateNotes(event.target.value)}
                  className="rounded-lg border border-border bg-surface-300 px-3 py-2 text-sm text-fg"
                />
              </label>
              {createError && <p className="text-xs text-red">{createError}</p>}
              <DialogFooter>
                <Button type="button" variant="ghost" size="sm" onClick={() => setShowCreate(false)} disabled={creating}>Cancel</Button>
                <Button type="submit" size="sm" disabled={!createName.trim() || creating}>{creating ? "Creating…" : "Create"}</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
