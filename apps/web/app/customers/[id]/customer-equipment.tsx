"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import {
  customerWorkspaceCapabilities,
  type CustomerWorkspaceRole,
} from "@/lib/customer-role";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

interface EquipmentDTO {
  id: string;
  orgId: string;
  customerId: string;
  type: string;
  make?: string | null;
  model?: string | null;
  serialNumber?: string | null;
  installDate?: string | null;
  warrantyExpiry?: string | null;
  notes?: string | null;
  createdAt: string;
}

interface EquipmentForm {
  type: string;
  make: string;
  model: string;
  serialNumber: string;
  installDate: string;
  warrantyExpiry: string;
  notes: string;
}

const EQUIPMENT_TYPES = [
  "appliance",
  "furnace",
  "ac_unit",
  "water_heater",
  "heat_pump",
  "boiler",
  "other",
];

const TYPE_LABELS: Record<string, string> = {
  appliance: "Appliance",
  furnace: "Furnace",
  ac_unit: "AC Unit",
  water_heater: "Water Heater",
  heat_pump: "Heat Pump",
  boiler: "Boiler",
  other: "Other",
};

const INITIAL_FORM: EquipmentForm = {
  type: "appliance",
  make: "",
  model: "",
  serialNumber: "",
  installDate: "",
  warrantyExpiry: "",
  notes: "",
};

function dateInputToIso(value: string) {
  if (!value) return undefined;
  return new Date(`${value}T00:00:00.000Z`).toISOString();
}

export function CustomerEquipment({
  customerId,
  role,
}: {
  customerId: string;
  role: CustomerWorkspaceRole;
}) {
  const capabilities = customerWorkspaceCapabilities(role);
  const [equipment, setEquipment] = useState<EquipmentDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState<EquipmentForm>(INITIAL_FORM);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setEquipment(await api.equipment({ customerId }));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to load equipment");
    } finally {
      setLoading(false);
    }
  }, [customerId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function addEquipment() {
    if (!capabilities.addEquipment) return;
    setSubmitting(true);
    setError(null);
    try {
      await api.createEquipment({
        customerId,
        type: form.type,
        make: form.make.trim() || undefined,
        model: form.model.trim() || undefined,
        serialNumber: form.serialNumber.trim() || undefined,
        installDate: dateInputToIso(form.installDate),
        warrantyExpiry: dateInputToIso(form.warrantyExpiry),
        notes: form.notes.trim() || undefined,
      });
      setAddOpen(false);
      setForm(INITIAL_FORM);
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to add equipment");
    } finally {
      setSubmitting(false);
    }
  }

  async function deleteEquipment(id: string) {
    if (!capabilities.deleteEquipment) return;
    setError(null);
    try {
      await api.deleteEquipment(id);
      setEquipment((rows) => rows.filter((item) => item.id !== id));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to delete equipment");
    } finally {
      setDeleting(null);
    }
  }

  return (
    <Card data-testid="customer-equipment">
      <CardHeader className="flex-row items-center justify-between gap-3">
        <div>
          <CardTitle>Equipment</CardTitle>
          {role === "technician" && (
            <p className="mt-1 text-xs text-fg-muted">Record model, serial, warranty, and field notes for assigned work.</p>
          )}
        </div>
        {capabilities.addEquipment && (
          <Button size="sm" onClick={() => setAddOpen(true)}>Add Equipment</Button>
        )}
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 2 }).map((_, index) => (
              <Skeleton key={index} className="h-20 rounded-lg" />
            ))}
          </div>
        ) : error && equipment.length === 0 ? (
          <p role="alert" className="py-4 text-sm text-red">{error}</p>
        ) : equipment.length === 0 ? (
          <p className="py-6 text-center text-sm text-fg-muted">No equipment tracked for this customer.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {equipment.map((item) => (
              <div key={item.id} className="rounded-lg bg-surface-200 px-3 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded bg-surface-300 px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-fg-muted">
                        {TYPE_LABELS[item.type] ?? item.type}
                      </span>
                      <span className="truncate text-sm font-medium text-fg">
                        {[item.make, item.model].filter(Boolean).join(" ") || "Make and model not recorded"}
                      </span>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-fg-dim">
                      {item.serialNumber && <span className="font-mono">SN: {item.serialNumber}</span>}
                      {item.installDate && <span>Installed: {new Date(item.installDate).toLocaleDateString()}</span>}
                      {item.warrantyExpiry && <span>Warranty: {new Date(item.warrantyExpiry).toLocaleDateString()}</span>}
                    </div>
                    {item.notes && <p className="mt-2 text-xs text-fg-muted">{item.notes}</p>}
                  </div>

                  {capabilities.deleteEquipment && (
                    deleting === item.id ? (
                      <div className="flex shrink-0 gap-2">
                        <button type="button" onClick={() => void deleteEquipment(item.id)} className="border-none bg-transparent text-xs text-red">Confirm</button>
                        <button type="button" onClick={() => setDeleting(null)} className="border-none bg-transparent text-xs text-fg-muted">Cancel</button>
                      </div>
                    ) : (
                      <button type="button" onClick={() => setDeleting(item.id)} className="shrink-0 border-none bg-transparent text-xs text-fg-muted hover:text-red">Delete</button>
                    )
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {error && equipment.length > 0 && (
          <p role="alert" className="mt-3 text-xs text-red">{error}</p>
        )}
      </CardContent>

      {addOpen && capabilities.addEquipment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <button
            type="button"
            aria-label="Close equipment form"
            className="absolute inset-0 cursor-default"
            onClick={() => {
              if (!submitting) {
                setAddOpen(false);
                setForm(INITIAL_FORM);
              }
            }}
          />
          <div className="relative z-10 w-full max-w-lg rounded-xl border border-border bg-surface-200 p-6">
            <h3 className="mb-4 text-lg font-semibold text-fg">Add Equipment</h3>
            <div className="space-y-4">
              <label className="block text-xs font-semibold text-fg-muted">
                Type *
                <select
                  value={form.type}
                  onChange={(event) => setForm((current) => ({ ...current, type: event.target.value }))}
                  className="mt-1.5 h-10 w-full rounded-lg border border-border bg-surface-300 px-3 text-sm text-fg"
                >
                  {EQUIPMENT_TYPES.map((type) => <option key={type} value={type}>{TYPE_LABELS[type] ?? type}</option>)}
                </select>
              </label>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="text-xs font-semibold text-fg-muted">Make<Input className="mt-1.5" value={form.make} onChange={(event) => setForm((current) => ({ ...current, make: event.target.value }))} /></label>
                <label className="text-xs font-semibold text-fg-muted">Model<Input className="mt-1.5" value={form.model} onChange={(event) => setForm((current) => ({ ...current, model: event.target.value }))} /></label>
              </div>
              <label className="block text-xs font-semibold text-fg-muted">Serial Number<Input className="mt-1.5" value={form.serialNumber} onChange={(event) => setForm((current) => ({ ...current, serialNumber: event.target.value }))} /></label>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="text-xs font-semibold text-fg-muted">Install Date<Input className="mt-1.5" type="date" value={form.installDate} onChange={(event) => setForm((current) => ({ ...current, installDate: event.target.value }))} /></label>
                <label className="text-xs font-semibold text-fg-muted">Warranty Expiry<Input className="mt-1.5" type="date" value={form.warrantyExpiry} onChange={(event) => setForm((current) => ({ ...current, warrantyExpiry: event.target.value }))} /></label>
              </div>
              <label className="block text-xs font-semibold text-fg-muted">
                Notes
                <textarea
                  rows={3}
                  value={form.notes}
                  onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))}
                  className="mt-1.5 w-full rounded-lg border border-border bg-surface-300 px-3 py-2 text-sm text-fg"
                />
              </label>
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="ghost" onClick={() => { setAddOpen(false); setForm(INITIAL_FORM); }} disabled={submitting}>Cancel</Button>
                <Button onClick={() => void addEquipment()} disabled={submitting}>{submitting ? "Saving…" : "Save"}</Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}
