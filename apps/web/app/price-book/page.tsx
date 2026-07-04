"use client";

import { useState, useMemo, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/page-header";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { formatMoney } from "@ofp/shared";
import { api } from "@/lib/api";

interface Category {
  id: string;
  name: string;
  description?: string | null;
}

interface CatalogItem {
  id: string;
  categoryId: string;
  name: string;
  description?: string | null;
  priceCents: number;
  costCents: number;
  taxable: boolean;
  active: boolean;
  createdAt: string;
}

function centsToDollars(cents: number): string {
  return (cents / 100).toFixed(2);
}

export default function PriceBookPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<CatalogItem | null>(null);
  const [showCategoryForm, setShowCategoryForm] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [form, setForm] = useState({
    name: "",
    description: "",
    priceDollars: "",
    costDollars: "",
    categoryId: "",
    taxable: true,
    active: true,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const [cats, its] = await Promise.all([
          api.catalogCategories(),
          api.catalogItems(),
        ]);
        setCategories(cats);
        setItems(its);
      } catch {
        setError("Failed to load price book");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const filtered = useMemo(() => {
    let list = [...items];
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((s) => s.name.toLowerCase().includes(q) || (s.description ?? "").toLowerCase().includes(q));
    }
    if (categoryFilter !== "all") {
      list = list.filter((s) => s.categoryId === categoryFilter);
    }
    list.sort((a, b) => a.name.localeCompare(b.name));
    return list;
  }, [items, search, categoryFilter]);

  const activeItems = filtered.filter((s) => s.active);
  const inactiveItems = filtered.filter((s) => !s.active);

  const openNew = () => {
    setEditing(null);
    setForm({
      name: "",
      description: "",
      priceDollars: "",
      costDollars: "",
      categoryId: categories[0]?.id ?? "",
      taxable: true,
      active: true,
    });
    setShowForm(true);
  };

  const openEdit = (s: CatalogItem) => {
    setEditing(s);
    setForm({
      name: s.name,
      description: s.description ?? "",
      priceDollars: centsToDollars(s.priceCents),
      costDollars: centsToDollars(s.costCents),
      categoryId: s.categoryId,
      taxable: s.taxable,
      active: s.active,
    });
    setShowForm(true);
  };

  const handleSave = async () => {
    const name = form.name.trim();
    const priceCents = Math.round(parseFloat(form.priceDollars || "0") * 100);
    const costCents = Math.round(parseFloat(form.costDollars || "0") * 100);
    if (!name || priceCents <= 0 || !form.categoryId) return;

    setSaving(true);
    setError(null);
    try {
      if (editing) {
        const updated = await api.patchCatalogItem(editing.id, {
          name,
          description: form.description.trim() || undefined,
          priceCents,
          costCents,
          taxable: form.taxable,
          active: form.active,
          categoryId: form.categoryId,
        });
        setItems((prev) => prev.map((i) => (i.id === editing.id ? updated : i)));
      } else {
        const created = await api.createCatalogItem({
          name,
          description: form.description.trim() || undefined,
          priceCents,
          costCents,
          taxable: form.taxable,
          active: form.active,
          categoryId: form.categoryId,
        });
        setItems((prev) => [created, ...prev]);
      }
      setShowForm(false);
      setEditing(null);
    } catch {
      setError("Failed to save service");
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (item: CatalogItem) => {
    try {
      const updated = await api.patchCatalogItem(item.id, { active: !item.active });
      setItems((prev) => prev.map((i) => (i.id === item.id ? updated : i)));
    } catch {
      // silently fail
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await api.deleteCatalogItem(id);
      setItems((prev) => prev.filter((i) => i.id !== id));
    } catch {
      setError("Failed to delete service");
    }
  };

  const handleAddCategory = async () => {
    if (!newCategoryName.trim()) return;
    try {
      const cat = await api.createCatalogCategory({ name: newCategoryName.trim() });
      setCategories((prev) => [...prev, cat]);
      setNewCategoryName("");
      setShowCategoryForm(false);
    } catch {
      setError("Failed to create category");
    }
  };

  const categoryNames = useMemo(() => {
    const map = new Map(categories.map((c) => [c.id, c.name]));
    return map;
  }, [categories]);

  if (loading) {
    return (
      <div>
        <PageHeader title="Price Book" description="Loading..." />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  const activeCount = items.filter((i) => i.active).length;

  return (
    <div>
      <PageHeader
        title="Price Book"
        description={`${activeCount} active service${activeCount !== 1 ? "s" : ""} · ${categories.length} categor${categories.length !== 1 ? "ies" : "y"}`}
        actions={
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => setShowCategoryForm(true)}>
              + Category
            </Button>
            <Button size="sm" onClick={openNew}>
              + Add Service
            </Button>
          </div>
        }
      />

      {error && (
        <Card className="mb-4 border-red/30 bg-red/5 p-3">
          <p className="text-sm text-red">{error}</p>
        </Card>
      )}

      {/* Search + category filter */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <Input
          type="search"
          placeholder="Search services..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-xs flex-1"
        />
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="h-10 rounded-lg border border-border bg-surface-200 px-3 py-2 text-sm text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 cursor-pointer"
          style={{ colorScheme: "dark" }}
        >
          <option value="all">All categories</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      {/* Add Category dialog */}
      {showCategoryForm && (
        <Card className="mb-4 border-accent/30">
          <CardContent className="p-4">
            <h4 className="text-sm font-semibold text-fg mb-3">New Category</h4>
            <div className="flex gap-2">
              <Input
                placeholder="Category name"
                value={newCategoryName}
                onChange={(e) => setNewCategoryName(e.target.value)}
                autoFocus
                className="max-w-xs"
              />
              <Button size="sm" onClick={handleAddCategory} disabled={!newCategoryName.trim()}>
                Add
              </Button>
              <Button size="sm" variant="secondary" onClick={() => { setShowCategoryForm(false); setNewCategoryName(""); }}>
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Add/Edit form */}
      {showForm && (
        <Card className="mb-4 border-accent/30">
          <CardContent className="p-4">
            <h4 className="text-sm font-semibold text-fg mb-3">
              {editing ? "Edit Service" : "New Service"}
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
              <Input
                placeholder="Service name"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                autoFocus
              />
              <select
                value={form.categoryId}
                onChange={(e) => setForm((f) => ({ ...f, categoryId: e.target.value }))}
                className="h-10 rounded-lg border border-border bg-surface-200 px-3 py-2 text-sm text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 cursor-pointer"
                style={{ colorScheme: "dark" }}
              >
                {categories.length === 0 && <option value="">No categories</option>}
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
              <Input
                placeholder="Price ($)"
                type="number"
                step="0.01"
                min="0"
                value={form.priceDollars}
                onChange={(e) => setForm((f) => ({ ...f, priceDollars: e.target.value }))}
              />
              <Input
                placeholder="Cost ($)"
                type="number"
                step="0.01"
                min="0"
                value={form.costDollars}
                onChange={(e) => setForm((f) => ({ ...f, costDollars: e.target.value }))}
              />
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-1.5 text-xs text-fg-muted cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.taxable}
                    onChange={(e) => setForm((f) => ({ ...f, taxable: e.target.checked }))}
                    className="rounded"
                  />
                  Taxable
                </label>
                <label className="flex items-center gap-1.5 text-xs text-fg-muted cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.active}
                    onChange={(e) => setForm((f) => ({ ...f, active: e.target.checked }))}
                    className="rounded"
                  />
                  Active
                </label>
              </div>
            </div>
            <Input
              placeholder="Description (optional)"
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              className="mb-3"
            />
            <div className="flex gap-2">
              <Button onClick={handleSave} disabled={!form.name.trim() || !form.priceDollars || !form.categoryId || saving}>
                {saving ? "Saving..." : editing ? "Save Changes" : "Add Service"}
              </Button>
              <Button variant="secondary" onClick={() => { setShowForm(false); setEditing(null); }}>
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Active services ── */}
      {activeItems.length > 0 && (
        <div className="mb-6">
          <h3 className="text-xs font-semibold text-fg-muted uppercase tracking-wider mb-2">
            Active ({activeItems.length})
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {activeItems.map((s) => (
              <ItemCard
                key={s.id}
                item={s}
                categoryName={categoryNames.get(s.categoryId) ?? "Unknown"}
                onEdit={() => openEdit(s)}
                onToggleActive={() => handleToggleActive(s)}
                onDelete={() => handleDelete(s.id)}
              />
            ))}
          </div>
        </div>
      )}

      {/* ── Inactive services ── */}
      {inactiveItems.length > 0 && (
        <div className="mb-6">
          <h3 className="text-xs font-semibold text-fg-muted uppercase tracking-wider mb-2">
            Inactive ({inactiveItems.length})
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {inactiveItems.map((s) => (
              <ItemCard
                key={s.id}
                item={s}
                categoryName={categoryNames.get(s.categoryId) ?? "Unknown"}
                onEdit={() => openEdit(s)}
                onToggleActive={() => handleToggleActive(s)}
                onDelete={() => handleDelete(s.id)}
              />
            ))}
          </div>
        </div>
      )}

      {/* ── Empty state ── */}
      {items.length === 0 && !error && (
        <Card>
          <EmptyState
            title="No services yet"
            description="Add your first service to build your price book."
          />
          <div className="flex justify-center pb-6">
            <Button size="sm" onClick={openNew}>
              + Add Service
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}

function ItemCard({
  item,
  categoryName,
  onEdit,
  onToggleActive,
  onDelete,
}: {
  item: CatalogItem;
  categoryName: string;
  onEdit: () => void;
  onToggleActive: () => void;
  onDelete: () => void;
}) {
  const margin = item.priceCents - item.costCents;
  const marginPct = item.priceCents > 0 ? Math.round((margin / item.priceCents) * 100) : 0;

  return (
    <Card className="group">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-fg truncate">{item.name}</p>
            {item.description && (
              <p className="text-xs text-fg-muted mt-0.5 line-clamp-2">{item.description}</p>
            )}
          </div>
          <span className="text-sm font-bold text-fg tabular-nums shrink-0">
            {formatMoney(item.priceCents)}
          </span>
        </div>
        <div className="flex items-center justify-between mt-3 pt-2 border-t border-border">
          <div className="flex items-center gap-2">
            <span className="text-[11px] px-2 py-0.5 rounded-full bg-surface-300 text-fg-muted">
              {categoryName}
            </span>
            {item.costCents > 0 && (
              <span className={`text-[11px] tabular-nums ${margin >= 0 ? "text-green" : "text-red"}`}>
                {marginPct}% margin
              </span>
            )}
          </div>
          <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              onClick={onToggleActive}
              className="text-xs px-2 py-1 rounded bg-surface-300 text-fg-muted hover:text-fg hover:bg-surface-400 transition-colors cursor-pointer border-none"
              title={item.active ? "Deactivate" : "Activate"}
            >
              {item.active ? "Hide" : "Show"}
            </button>
            <button
              onClick={onEdit}
              className="text-xs px-2 py-1 rounded bg-surface-300 text-fg-muted hover:text-fg hover:bg-surface-400 transition-colors cursor-pointer border-none"
            >
              Edit
            </button>
            <button
              onClick={onDelete}
              className="text-xs px-2 py-1 rounded bg-surface-300 text-red hover:bg-red/10 transition-colors cursor-pointer border-none"
            >
              Del
            </button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
