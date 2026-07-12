"use client";

import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { useSessionUser } from "@/lib/use-session-user";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/page-header";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { formatMoney } from "@ofp/shared";

type ApiCatalogItem = Awaited<ReturnType<typeof api.catalogItems>>[number];
type CatalogItem = Omit<ApiCatalogItem, "costCents"> & {
  costCents?: number;
  costRestricted?: boolean;
};
type CatalogCategory = Awaited<ReturnType<typeof api.catalogCategories>>[number];

type ItemForm = {
  id?: string;
  categoryId: string;
  name: string;
  description: string;
  price: string;
  cost: string;
  taxable: boolean;
  active: boolean;
};

const EMPTY_FORM: ItemForm = {
  categoryId: "",
  name: "",
  description: "",
  price: "",
  cost: "",
  taxable: true,
  active: true,
};

function cents(value: string) {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) : 0;
}

export default function PriceBookPage() {
  const { user, loading: sessionLoading } = useSessionUser();
  const [categories, setCategories] = useState<CatalogCategory[]>([]);
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [showItemForm, setShowItemForm] = useState(false);
  const [showCategoryForm, setShowCategoryForm] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [form, setForm] = useState<ItemForm>(EMPTY_FORM);

  const isOffice = user?.role === "owner" || user?.role === "dispatcher";
  const isTechnician = user?.role === "technician";

  async function loadCatalog() {
    setLoading(true);
    setError(null);
    try {
      const [categoryRows, itemRows] = await Promise.all([
        api.catalogCategories(),
        api.catalogItems(),
      ]);
      setCategories(categoryRows);
      setItems(itemRows as CatalogItem[]);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadCatalog();
  }, []);

  const categoryMap = useMemo(
    () => new Map(categories.map((category) => [category.id, category.name])),
    [categories],
  );

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return items
      .filter((item) => categoryFilter === "all" || item.categoryId === categoryFilter)
      .filter((item) => {
        if (!query) return true;
        return (
          item.name.toLowerCase().includes(query) ||
          (item.description?.toLowerCase().includes(query) ?? false) ||
          (categoryMap.get(item.categoryId)?.toLowerCase().includes(query) ?? false)
        );
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [categoryFilter, categoryMap, items, search]);

  function openNewItem() {
    setForm({ ...EMPTY_FORM, categoryId: categories[0]?.id ?? "" });
    setShowItemForm(true);
    setError(null);
  }

  function openEditItem(item: CatalogItem) {
    setForm({
      id: item.id,
      categoryId: item.categoryId,
      name: item.name,
      description: item.description ?? "",
      price: (item.priceCents / 100).toFixed(2),
      cost: ((item.costCents ?? 0) / 100).toFixed(2),
      taxable: item.taxable,
      active: item.active,
    });
    setShowItemForm(true);
    setError(null);
  }

  async function saveItem() {
    if (!isOffice || !form.categoryId || !form.name.trim()) return;
    const priceCents = cents(form.price);
    const costCents = cents(form.cost);
    if (priceCents < 0 || costCents < 0) {
      setError("Price and cost must be zero or greater.");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const payload = {
        categoryId: form.categoryId,
        name: form.name.trim(),
        description: form.description.trim() || undefined,
        priceCents,
        costCents,
        taxable: form.taxable,
        active: form.active,
      };
      if (form.id) {
        const updated = await api.patchCatalogItem(form.id, payload);
        setItems((rows) => rows.map((row) => (row.id === updated.id ? updated : row)));
      } else {
        const created = await api.createCatalogItem(payload);
        setItems((rows) => [created, ...rows]);
      }
      setShowItemForm(false);
      setForm(EMPTY_FORM);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setSaving(false);
    }
  }

  async function createCategory() {
    if (!isOffice || !newCategoryName.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const created = await api.createCatalogCategory({ name: newCategoryName.trim() });
      setCategories((rows) => [...rows, created].sort((a, b) => a.name.localeCompare(b.name)));
      setNewCategoryName("");
      setShowCategoryForm(false);
      setForm((current) => ({ ...current, categoryId: created.id }));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setSaving(false);
    }
  }

  async function deleteItem(item: CatalogItem) {
    if (!isOffice || !window.confirm(`Delete ${item.name} from the organization price book?`)) return;
    setError(null);
    try {
      await api.deleteCatalogItem(item.id);
      setItems((rows) => rows.filter((row) => row.id !== item.id));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  }

  if (loading || sessionLoading) {
    return (
      <div>
        <PageHeader title="Price Book" description="Loading the organization catalog…" />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <Skeleton key={index} className="h-36 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div data-testid={isTechnician ? "technician-price-book" : "office-price-book"}>
      <PageHeader
        title="Price Book"
        description={
          isTechnician
            ? `${items.filter((item) => item.active).length} active organization services · read-only field reference`
            : `${items.length} organization service${items.length === 1 ? "" : "s"} across ${categories.length} categor${categories.length === 1 ? "y" : "ies"}`
        }
        actions={
          isOffice ? (
            <div className="flex gap-2">
              <Button variant="secondary" size="sm" onClick={() => setShowCategoryForm(true)}>
                Add category
              </Button>
              <Button size="sm" onClick={openNewItem} disabled={categories.length === 0}>
                ⊕ Add item
              </Button>
            </div>
          ) : undefined
        }
      />

      {isTechnician && (
        <Card className="mb-5 border-blue/25 bg-blue/5">
          <CardContent className="p-4">
            <p className="text-sm font-semibold text-fg">Field reference only</p>
            <p className="mt-1 text-xs text-fg-muted">
              Selling prices are visible for customer conversations. Internal cost, margin, and catalog editing remain office-only.
            </p>
          </CardContent>
        </Card>
      )}

      {error && (
        <Card className="mb-5 border-red/30 bg-red/5">
          <CardContent className="p-4 text-sm text-red">{error}</CardContent>
        </Card>
      )}

      {showCategoryForm && isOffice && (
        <Card className="mb-5 border-accent/30">
          <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-end">
            <div className="flex-1">
              <label className="mb-1 block text-xs text-fg-muted" htmlFor="new-category-name">
                Category name
              </label>
              <Input
                id="new-category-name"
                value={newCategoryName}
                onChange={(event) => setNewCategoryName(event.target.value)}
                placeholder="Appliance repair"
                autoFocus
              />
            </div>
            <div className="flex gap-2">
              <Button onClick={() => void createCategory()} disabled={saving || !newCategoryName.trim()}>
                {saving ? "Saving…" : "Create category"}
              </Button>
              <Button variant="secondary" onClick={() => setShowCategoryForm(false)}>
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {showItemForm && isOffice && (
        <Card className="mb-5 border-accent/30">
          <CardContent className="p-4">
            <h3 className="mb-4 text-sm font-semibold text-fg">
              {form.id ? "Edit catalog item" : "New catalog item"}
            </h3>
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs text-fg-muted" htmlFor="catalog-name">Name</label>
                <Input
                  id="catalog-name"
                  value={form.name}
                  onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-fg-muted" htmlFor="catalog-category">Category</label>
                <select
                  id="catalog-category"
                  value={form.categoryId}
                  onChange={(event) => setForm((current) => ({ ...current, categoryId: event.target.value }))}
                  className="h-10 w-full rounded-lg border border-border bg-surface-200 px-3 text-sm text-fg"
                  style={{ colorScheme: "dark" }}
                >
                  {categories.map((category) => (
                    <option key={category.id} value={category.id}>{category.name}</option>
                  ))}
                </select>
              </div>
              <div className="md:col-span-2">
                <label className="mb-1 block text-xs text-fg-muted" htmlFor="catalog-description">Description</label>
                <Input
                  id="catalog-description"
                  value={form.description}
                  onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-fg-muted" htmlFor="catalog-price">Selling price</label>
                <Input
                  id="catalog-price"
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.price}
                  onChange={(event) => setForm((current) => ({ ...current, price: event.target.value }))}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-fg-muted" htmlFor="catalog-cost">Internal cost</label>
                <Input
                  id="catalog-cost"
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.cost}
                  onChange={(event) => setForm((current) => ({ ...current, cost: event.target.value }))}
                />
              </div>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-4 text-sm text-fg-muted">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={form.taxable}
                  onChange={(event) => setForm((current) => ({ ...current, taxable: event.target.checked }))}
                />
                Taxable
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={form.active}
                  onChange={(event) => setForm((current) => ({ ...current, active: event.target.checked }))}
                />
                Active
              </label>
            </div>
            <div className="mt-5 flex gap-2">
              <Button
                onClick={() => void saveItem()}
                disabled={saving || !form.name.trim() || !form.categoryId}
              >
                {saving ? "Saving…" : form.id ? "Save changes" : "Create item"}
              </Button>
              <Button
                variant="secondary"
                onClick={() => {
                  setShowItemForm(false);
                  setForm(EMPTY_FORM);
                }}
              >
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="mb-4 flex flex-col gap-3 sm:flex-row">
        <Input
          type="search"
          placeholder="Search services, parts, or categories…"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          className="max-w-md"
        />
        <select
          value={categoryFilter}
          onChange={(event) => setCategoryFilter(event.target.value)}
          className="h-10 rounded-lg border border-border bg-surface-200 px-3 text-sm text-fg"
          style={{ colorScheme: "dark" }}
        >
          <option value="all">All categories</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>{category.name}</option>
          ))}
        </select>
      </div>

      {items.length === 0 ? (
        <Card>
          <EmptyState
            title="No catalog items yet"
            description={
              isOffice
                ? "Create a category, then add the first organization service or part."
                : "The office has not published any catalog items yet."
            }
          />
        </Card>
      ) : filtered.length === 0 ? (
        <Card>
          <div className="py-10 text-center">
            <p className="text-sm text-fg-muted">No catalog items match your filters.</p>
            <button
              type="button"
              onClick={() => {
                setSearch("");
                setCategoryFilter("all");
              }}
              className="mt-1 cursor-pointer border-none bg-transparent text-xs text-fg-link hover:text-fg"
            >
              Clear filters
            </button>
          </div>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((item) => {
            const margin = item.costCents === undefined ? null : item.priceCents - item.costCents;
            return (
              <Card key={item.id} className={!item.active ? "opacity-65" : ""}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-fg">{item.name}</p>
                      {item.description && (
                        <p className="mt-1 line-clamp-2 text-xs text-fg-muted">{item.description}</p>
                      )}
                    </div>
                    <span className="shrink-0 text-sm font-bold tabular-nums text-fg">
                      {formatMoney(item.priceCents)}
                    </span>
                  </div>
                  <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-border pt-3">
                    <span className="rounded-full bg-surface-300 px-2 py-0.5 text-[11px] text-fg-muted">
                      {categoryMap.get(item.categoryId) ?? "Uncategorized"}
                    </span>
                    {!item.active && (
                      <span className="rounded-full bg-yellow/10 px-2 py-0.5 text-[11px] text-yellow">Inactive</span>
                    )}
                    {item.taxable && (
                      <span className="rounded-full bg-blue/10 px-2 py-0.5 text-[11px] text-blue">Taxable</span>
                    )}
                  </div>
                  {isOffice && (
                    <div className="mt-3 rounded-lg bg-surface-200 p-3 text-xs">
                      <div className="flex justify-between text-fg-muted">
                        <span>Internal cost</span>
                        <span>{formatMoney(item.costCents ?? 0)}</span>
                      </div>
                      <div className="mt-1 flex justify-between font-semibold text-fg">
                        <span>Gross margin</span>
                        <span>{formatMoney(margin ?? 0)}</span>
                      </div>
                    </div>
                  )}
                  {isOffice && (
                    <div className="mt-3 flex gap-2">
                      <Button variant="secondary" size="sm" onClick={() => openEditItem(item)}>
                        Edit
                      </Button>
                      <Button variant="secondary" size="sm" onClick={() => void deleteItem(item)}>
                        Delete
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
