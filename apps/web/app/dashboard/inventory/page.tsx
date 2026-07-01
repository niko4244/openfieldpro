"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { formatMoney, type InventoryItemDTO } from "@ofp/shared";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/empty-state";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type StockFilter = "all" | "low" | "out";

const EMPTY_PART = {
  name: "",
  categoryName: "Parts",
  description: "",
  price: "",
  cost: "",
  quantityOnHand: "0",
  reorderPoint: "0",
};

function dollarsToCents(value: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return 0;
  return Math.round(parsed * 100);
}

function stockBadge(item: InventoryItemDTO) {
  if (item.stockStatus === "out") {
    return <Badge variant="canceled">Out</Badge>;
  }
  if (item.stockStatus === "low") {
    return <Badge variant="sent">Low</Badge>;
  }
  return <Badge variant="completed">OK</Badge>;
}

export default function InventoryPage() {
  const [items, setItems] = useState<InventoryItemDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [stock, setStock] = useState<StockFilter>("all");
  const [addOpen, setAddOpen] = useState(false);
  const [partForm, setPartForm] = useState(EMPTY_PART);
  const [savingPart, setSavingPart] = useState(false);
  const [adjustItem, setAdjustItem] = useState<InventoryItemDTO | null>(null);
  const [adjustForm, setAdjustForm] = useState({ delta: "", reason: "manual", note: "" });
  const [savingAdjustment, setSavingAdjustment] = useState(false);

  const reload = useCallback(async () => {
    try {
      setLoading(true);
      const list = await api.inventory({
        search: search.trim() || undefined,
        stock: stock === "all" ? undefined : stock,
        active: "true",
      });
      setItems(list);
      setError(null);
    } catch (e) {
      setError((e as Error).message || "Could not load inventory");
    } finally {
      setLoading(false);
    }
  }, [search, stock]);

  useEffect(() => {
    const timer = setTimeout(() => void reload(), 180);
    return () => clearTimeout(timer);
  }, [reload]);

  const stats = useMemo(() => {
    const totalUnits = items.reduce((sum, item) => sum + item.quantityOnHand, 0);
    const lowStock = items.filter((item) => item.stockStatus !== "ok").length;
    const valueCents = items.reduce(
      (sum, item) => sum + item.quantityOnHand * item.costCents,
      0,
    );
    return { skus: items.length, totalUnits, lowStock, valueCents };
  }, [items]);

  const createPart = useCallback(async () => {
    if (!partForm.name.trim()) return;
    setSavingPart(true);
    try {
      await api.createInventoryPart({
        name: partForm.name.trim(),
        categoryName: partForm.categoryName.trim() || "Parts",
        description: partForm.description.trim() || undefined,
        priceCents: dollarsToCents(partForm.price),
        costCents: dollarsToCents(partForm.cost),
        quantityOnHand: Number(partForm.quantityOnHand) || 0,
        reorderPoint: Math.max(0, Number(partForm.reorderPoint) || 0),
        active: true,
        taxable: true,
      });
      setPartForm(EMPTY_PART);
      setAddOpen(false);
      await reload();
    } catch (e) {
      setError((e as Error).message || "Could not create part");
    } finally {
      setSavingPart(false);
    }
  }, [partForm, reload]);

  const submitAdjustment = useCallback(async () => {
    if (!adjustItem) return;
    const delta = Number(adjustForm.delta);
    if (!Number.isInteger(delta) || delta === 0) return;
    setSavingAdjustment(true);
    try {
      await api.adjustInventory(adjustItem.id, {
        delta,
        reason: adjustForm.reason,
        note: adjustForm.note.trim() || undefined,
      });
      setAdjustItem(null);
      setAdjustForm({ delta: "", reason: "manual", note: "" });
      await reload();
    } catch (e) {
      setError((e as Error).message || "Could not adjust stock");
    } finally {
      setSavingAdjustment(false);
    }
  }, [adjustForm, adjustItem, reload]);

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-fg">Inventory</h1>
          <p className="text-sm text-fg-muted">Parts, stock levels, reorder points, and adjustment history.</p>
        </div>
        <Button onClick={() => setAddOpen(true)}>+ Add Part</Button>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="SKUs" value={String(stats.skus)} />
        <Metric label="Units" value={String(stats.totalUnits)} />
        <Metric label="Needs Attention" value={String(stats.lowStock)} />
        <Metric label="Cost Value" value={formatMoney(stats.valueCents)} />
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search parts"
          className="sm:max-w-sm"
        />
        <div className="flex rounded-lg border border-border bg-surface-200 p-1">
          {(["all", "low", "out"] as const).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setStock(value)}
              className={`h-8 rounded-md px-3 text-xs font-medium transition-colors ${
                stock === value
                  ? "bg-accent text-white"
                  : "text-fg-muted hover:bg-surface-300 hover:text-fg"
              }`}
            >
              {value === "all" ? "All" : value === "low" ? "Low" : "Out"}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <Card className="border-red/30 bg-red/5">
          <CardContent className="p-4 text-sm text-red">{error}</CardContent>
        </Card>
      )}

      {loading ? (
        <div className="space-y-3">
          <Skeleton className="h-14 rounded-xl" />
          <Skeleton className="h-14 rounded-xl" />
          <Skeleton className="h-14 rounded-xl" />
        </div>
      ) : items.length === 0 ? (
        <Card>
          <CardContent className="p-8">
            <EmptyState title="No parts found" description="Add the first part to start tracking stock." />
          </CardContent>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Part</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>On Hand</TableHead>
                <TableHead>Reorder</TableHead>
                <TableHead>Cost</TableHead>
                <TableHead>Price</TableHead>
                <TableHead className="w-32">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item) => (
                <TableRow key={item.id}>
                  <TableCell>
                    <div className="font-medium text-fg">{item.name}</div>
                    {item.description && (
                      <div className="max-w-xs truncate text-xs text-fg-dim">{item.description}</div>
                    )}
                  </TableCell>
                  <TableCell className="text-sm text-fg-muted">{item.categoryName ?? "Parts"}</TableCell>
                  <TableCell>{stockBadge(item)}</TableCell>
                  <TableCell className="font-mono text-sm text-fg">{item.quantityOnHand}</TableCell>
                  <TableCell className="font-mono text-sm text-fg-muted">{item.reorderPoint}</TableCell>
                  <TableCell>{formatMoney(item.costCents)}</TableCell>
                  <TableCell>{formatMoney(item.priceCents)}</TableCell>
                  <TableCell>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => {
                        setAdjustItem(item);
                        setAdjustForm({ delta: "", reason: "manual", note: "" });
                      }}
                    >
                      Adjust
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogHeader>
          <DialogTitle>Add Part</DialogTitle>
          <DialogDescription>Create a catalog item and starting stock level.</DialogDescription>
        </DialogHeader>
        <DialogContent className="grid gap-3 sm:grid-cols-2">
          <label className="sm:col-span-2">
            <span className="text-xs text-fg-muted">Name</span>
            <Input
              value={partForm.name}
              onChange={(e) => setPartForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="Capacitor 45/5 MFD"
              className="mt-1"
            />
          </label>
          <label>
            <span className="text-xs text-fg-muted">Category</span>
            <Input
              value={partForm.categoryName}
              onChange={(e) => setPartForm((f) => ({ ...f, categoryName: e.target.value }))}
              className="mt-1"
            />
          </label>
          <label>
            <span className="text-xs text-fg-muted">Starting Qty</span>
            <Input
              type="number"
              value={partForm.quantityOnHand}
              onChange={(e) => setPartForm((f) => ({ ...f, quantityOnHand: e.target.value }))}
              className="mt-1"
            />
          </label>
          <label>
            <span className="text-xs text-fg-muted">Cost</span>
            <Input
              type="number"
              step="0.01"
              value={partForm.cost}
              onChange={(e) => setPartForm((f) => ({ ...f, cost: e.target.value }))}
              placeholder="18.50"
              className="mt-1"
            />
          </label>
          <label>
            <span className="text-xs text-fg-muted">Price</span>
            <Input
              type="number"
              step="0.01"
              value={partForm.price}
              onChange={(e) => setPartForm((f) => ({ ...f, price: e.target.value }))}
              placeholder="79.00"
              className="mt-1"
            />
          </label>
          <label>
            <span className="text-xs text-fg-muted">Reorder Point</span>
            <Input
              type="number"
              value={partForm.reorderPoint}
              onChange={(e) => setPartForm((f) => ({ ...f, reorderPoint: e.target.value }))}
              className="mt-1"
            />
          </label>
          <label className="sm:col-span-2">
            <span className="text-xs text-fg-muted">Description</span>
            <Input
              value={partForm.description}
              onChange={(e) => setPartForm((f) => ({ ...f, description: e.target.value }))}
              className="mt-1"
            />
          </label>
        </DialogContent>
        <DialogFooter>
          <Button variant="secondary" onClick={() => setAddOpen(false)} disabled={savingPart}>
            Cancel
          </Button>
          <Button onClick={createPart} disabled={savingPart || !partForm.name.trim()}>
            {savingPart ? "Saving..." : "Create"}
          </Button>
        </DialogFooter>
      </Dialog>

      <Dialog open={adjustItem !== null} onOpenChange={(open) => !open && setAdjustItem(null)}>
        <DialogHeader>
          <DialogTitle>Adjust Stock</DialogTitle>
          <DialogDescription>{adjustItem?.name ?? "Part"}</DialogDescription>
        </DialogHeader>
        <DialogContent className="grid gap-3">
          <div className="rounded-lg border border-border bg-surface-300 p-3 text-sm">
            <div className="flex justify-between">
              <span className="text-fg-muted">Current on hand</span>
              <span className="font-mono text-fg">{adjustItem?.quantityOnHand ?? 0}</span>
            </div>
          </div>
          <label>
            <span className="text-xs text-fg-muted">Delta</span>
            <Input
              type="number"
              value={adjustForm.delta}
              onChange={(e) => setAdjustForm((f) => ({ ...f, delta: e.target.value }))}
              placeholder="-1 or 12"
              className="mt-1"
            />
          </label>
          <label>
            <span className="text-xs text-fg-muted">Reason</span>
            <select
              value={adjustForm.reason}
              onChange={(e) => setAdjustForm((f) => ({ ...f, reason: e.target.value }))}
              className="mt-1 h-10 w-full rounded-lg border border-border bg-surface-200 px-3 text-sm text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
              style={{ colorScheme: "dark" }}
            >
              <option value="manual">Manual</option>
              <option value="received">Received</option>
              <option value="used">Used on Job</option>
              <option value="count">Cycle Count</option>
              <option value="return">Return</option>
              <option value="damaged">Damaged</option>
            </select>
          </label>
          <label>
            <span className="text-xs text-fg-muted">Note</span>
            <Input
              value={adjustForm.note}
              onChange={(e) => setAdjustForm((f) => ({ ...f, note: e.target.value }))}
              className="mt-1"
            />
          </label>
        </DialogContent>
        <DialogFooter>
          <Button variant="secondary" onClick={() => setAdjustItem(null)} disabled={savingAdjustment}>
            Cancel
          </Button>
          <Button
            onClick={submitAdjustment}
            disabled={savingAdjustment || Number(adjustForm.delta) === 0 || !Number.isInteger(Number(adjustForm.delta))}
          >
            {savingAdjustment ? "Saving..." : "Save Adjustment"}
          </Button>
        </DialogFooter>
      </Dialog>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-xs uppercase tracking-wider text-fg-dim">{label}</div>
        <div className="mt-1 text-2xl font-semibold tabular-nums text-fg">{value}</div>
      </CardContent>
    </Card>
  );
}
