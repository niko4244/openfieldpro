"use client";

// Properties (service locations) card for the customer detail page.
// Lists the customer's properties with per-property service history derived
// from the jobs the server page already fetched, plus add / edit / delete.

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import type { JobDTO, PropertyDTO } from "@ofp/shared";
import { formatMoney } from "@ofp/shared";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { JobStatusBadge } from "@/components/status-badge";

interface PropertyForm {
  address: string;
  lat: string;
  lng: string;
}

const initForm: PropertyForm = { address: "", lat: "", lng: "" };

export function CustomerProperties({
  customerId,
  jobs,
}: {
  customerId: string;
  jobs: JobDTO[];
}) {
  const [props, setProps] = useState<PropertyDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [editAddress, setEditAddress] = useState("");
  const [deleting, setDeleting] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState<PropertyForm>(initForm);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setProps(await api.customerProperties(customerId));
    } catch {
      setError("Failed to load properties");
    }
    setLoading(false);
  }, [customerId]);

  useEffect(() => {
    load();
  }, [load]);

  const handleAdd = async () => {
    setSubmitting(true);
    setError(null);
    try {
      await api.createProperty(customerId, {
        address: form.address,
        lat: form.lat || undefined,
        lng: form.lng || undefined,
      });
      setAddOpen(false);
      setForm(initForm);
      await load();
    } catch {
      setError("Failed to add property");
    }
    setSubmitting(false);
  };

  const handleSaveEdit = async (propertyId: string) => {
    setSubmitting(true);
    setError(null);
    try {
      const updated = await api.patchProperty(customerId, propertyId, { address: editAddress });
      setProps((prev) => prev.map((p) => (p.id === propertyId ? updated : p)));
      setEditing(null);
    } catch {
      setError("Failed to update property");
    }
    setSubmitting(false);
  };

  const handleDelete = async (propertyId: string) => {
    try {
      await api.deleteProperty(customerId, propertyId);
      setProps((prev) => prev.filter((p) => p.id !== propertyId));
    } catch {
      /* silent */
    }
    setDeleting(null);
  };

  const historyFor = (propertyId: string) =>
    jobs.filter((j) => j.propertyId === propertyId);
  const unlinkedCount = jobs.filter((j) => !j.propertyId).length;

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle>Properties</CardTitle>
        <Button size="sm" onClick={() => setAddOpen(true)}>Add Property</Button>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 2 }).map((_, i) => (
              <Skeleton key={i} className="h-16 rounded-lg" />
            ))}
          </div>
        ) : error ? (
          <p className="text-sm text-red py-4">{error}</p>
        ) : props.length === 0 ? (
          <p className="text-sm text-fg-muted py-6 text-center">
            No properties on file. Add a service address to start building history.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {props.map((p) => {
              const history = historyFor(p.id);
              return (
                <div key={p.id} className="py-2.5 px-3 rounded-lg bg-surface-200">
                  <div className="flex items-center justify-between">
                    {editing === p.id ? (
                      <div className="flex items-center gap-2 flex-1 min-w-0 mr-3">
                        <Input
                          value={editAddress}
                          onChange={(e) => setEditAddress(e.target.value)}
                          className="h-8"
                        />
                        <button
                          onClick={() => handleSaveEdit(p.id)}
                          disabled={submitting || !editAddress.trim()}
                          className="text-xs text-accent hover:text-accent/80 transition-colors cursor-pointer bg-transparent border-none shrink-0"
                        >
                          Save
                        </button>
                        <button
                          onClick={() => setEditing(null)}
                          className="text-xs text-fg-muted hover:text-fg transition-colors cursor-pointer bg-transparent border-none shrink-0"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <div className="flex-1 min-w-0">
                        <span className="text-sm text-fg truncate block">{p.address}</span>
                        {(p.lat || p.lng) && (
                          <span className="text-xs text-fg-dim font-mono">
                            {p.lat ?? "—"}, {p.lng ?? "—"}
                          </span>
                        )}
                      </div>
                    )}
                    {editing !== p.id && (
                      <div className="flex gap-2 shrink-0">
                        <button
                          onClick={() => {
                            setEditing(p.id);
                            setEditAddress(p.address);
                          }}
                          className="text-xs text-fg-muted hover:text-fg transition-colors cursor-pointer bg-transparent border-none"
                        >
                          Edit
                        </button>
                        {deleting === p.id ? (
                          <>
                            <button
                              onClick={() => handleDelete(p.id)}
                              className="text-xs text-red hover:text-red/80 transition-colors cursor-pointer bg-transparent border-none"
                            >
                              Confirm
                            </button>
                            <button
                              onClick={() => setDeleting(null)}
                              className="text-xs text-fg-muted hover:text-fg transition-colors cursor-pointer bg-transparent border-none"
                            >
                              Cancel
                            </button>
                          </>
                        ) : (
                          <button
                            onClick={() => setDeleting(p.id)}
                            className="text-xs text-fg-muted hover:text-red transition-colors cursor-pointer bg-transparent border-none"
                          >
                            Delete
                          </button>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Service history at this property */}
                  <div className="mt-2 pt-2 border-t border-surface-400">
                    {history.length === 0 ? (
                      <p className="text-xs text-fg-dim">No service history at this property yet.</p>
                    ) : (
                      <div className="flex flex-col gap-1">
                        <p className="text-[11px] font-semibold uppercase tracking-wider text-fg-muted">
                          Service history ({history.length})
                        </p>
                        {history.slice(0, 3).map((j) => (
                          <Link
                            key={j.id}
                            href={`/jobs/${j.id}`}
                            className="flex items-center justify-between py-1.5 px-2 rounded-md hover:bg-surface-400 transition-colors no-underline hover:no-underline"
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <JobStatusBadge status={j.status} />
                              <span className="text-xs text-fg truncate">{j.title}</span>
                            </div>
                            <span className="text-xs text-fg-muted shrink-0">
                              {formatMoney(j.total)}
                            </span>
                          </Link>
                        ))}
                        {history.length > 3 && (
                          <p className="text-xs text-fg-dim px-2">
                            +{history.length - 3} more
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
        {!loading && unlinkedCount > 0 && props.length > 0 && (
          <p className="text-xs text-fg-dim mt-3">
            {unlinkedCount} job{unlinkedCount === 1 ? "" : "s"} for this customer not linked to a
            property.
          </p>
        )}
      </CardContent>

      {/* Add Property Dialog */}
      {addOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          onClick={() => {
            if (!submitting) {
              setAddOpen(false);
              setForm(initForm);
            }
          }}
        >
          <div
            className="bg-surface-200 rounded-xl border border-border w-full max-w-lg mx-4 p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold text-fg mb-4">Add Property</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-fg-muted mb-1.5">
                  Service address *
                </label>
                <Input
                  placeholder="742 Maple St, Springfield, IL 62704"
                  value={form.address}
                  onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-fg-muted mb-1.5">
                    Latitude
                  </label>
                  <Input
                    placeholder="39.7817"
                    value={form.lat}
                    onChange={(e) => setForm((f) => ({ ...f, lat: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-fg-muted mb-1.5">
                    Longitude
                  </label>
                  <Input
                    placeholder="-89.6501"
                    value={form.lng}
                    onChange={(e) => setForm((f) => ({ ...f, lng: e.target.value }))}
                  />
                </div>
              </div>
              {error && <p className="text-sm text-red">{error}</p>}
              <div className="flex justify-end gap-2 pt-2">
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={submitting}
                  onClick={() => {
                    setAddOpen(false);
                    setForm(initForm);
                  }}
                >
                  Cancel
                </Button>
                <Button size="sm" disabled={submitting || !form.address.trim()} onClick={handleAdd}>
                  {submitting ? "Adding..." : "Add Property"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}
