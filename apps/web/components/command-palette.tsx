"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { api } from "@/lib/api";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { useSessionUser } from "@/lib/use-session-user";

export function CommandPalette() {
  const { user } = useSessionUser();
  const canSearchInvoices = user?.role !== "technician";
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Awaited<ReturnType<typeof api.search>> | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [highlightIdx, setHighlightIdx] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen((o) => !o);
        setQuery("");
        setResults(null);
        setHighlightIdx(-1);
        setError(null);
      }
      if (e.key === "Escape" && open) setOpen(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open]);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 50);
  }, [open]);

  useEffect(() => {
    if (!query.trim()) {
      setResults(null);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await api.search(query);
        setResults(res);
        setHighlightIdx(-1);
      } catch {
        setError("Search failed. Try again.");
        setResults(null);
      }
      setLoading(false);
    }, 300);
    return () => clearTimeout(debounceRef.current);
  }, [query]);

  const flatItems = useCallback(() => {
    if (!results) return [];
    const items: { label: string; href: string; group: string }[] = [];
    for (const job of results.jobs) items.push({ label: job.title, href: `/jobs/${job.id}`, group: "Jobs" });
    for (const cust of results.customers) items.push({ label: cust.name, href: `/customers/${cust.id}`, group: "Customers" });
    if (canSearchInvoices) {
      for (const inv of results.invoices) {
        items.push({ label: `${inv.number} (${inv.status})`, href: `/invoices/${inv.id}`, group: "Invoices" });
      }
    }
    return items;
  }, [results, canSearchInvoices]);

  const navigate = (href: string) => {
    setOpen(false);
    window.location.href = href;
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    const items = flatItems();
    if (items.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightIdx((i) => (i < items.length - 1 ? i + 1 : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightIdx((i) => (i > 0 ? i - 1 : items.length - 1));
    } else if (e.key === "Enter" && highlightIdx >= 0) {
      e.preventDefault();
      navigate(items[highlightIdx].href);
    }
  };

  if (!open) return null;

  const items = flatItems();
  const totalCount = results
    ? results.jobs.length + results.customers.length + (canSearchInvoices ? results.invoices.length : 0)
    : 0;

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm" onClick={() => setOpen(false)} />
      <div className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]">
        <Card className="w-full max-w-lg mx-4 overflow-hidden">
          <div className="p-3 border-b border-border">
            <Input
              ref={inputRef}
              type="search"
              placeholder={canSearchInvoices ? "Search jobs, customers, invoices..." : "Search assigned jobs and customers..."}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              className="border-none bg-transparent px-0 focus-visible:ring-0"
            />
          </div>

          <div className="max-h-[400px] overflow-y-auto">
            {loading && (
              <div className="p-6 text-center">
                <div className="w-5 h-5 border-2 border-accent border-t-transparent rounded-full animate-spin mx-auto" />
              </div>
            )}
            {error && <p className="p-6 text-sm text-red text-center">{error}</p>}
            {!loading && !error && query.trim() && totalCount === 0 && (
              <p className="p-6 text-sm text-fg-muted text-center">No results for &ldquo;{query}&rdquo;</p>
            )}
            {!loading && !error && results && totalCount > 0 && (
              <div>
                {results.jobs.length > 0 && (
                  <div>
                    <p className="px-4 py-2 text-[11px] font-semibold text-fg-dim uppercase tracking-wider bg-surface-300/50">Jobs</p>
                    {results.jobs.map((j) => {
                      const idx = items.findIndex((i) => i.href === `/jobs/${j.id}`);
                      return (
                        <button
                          key={j.id}
                          onClick={() => navigate(`/jobs/${j.id}`)}
                          className={`w-full text-left px-4 py-2.5 flex items-center gap-3 transition-colors cursor-pointer border-none ${
                            highlightIdx === idx ? "bg-accent/10 text-fg" : "text-fg-muted hover:bg-surface-300"
                          }`}
                        >
                          <span className="text-xs text-fg-dim w-12 shrink-0">{j.status}</span>
                          <span className="text-sm truncate">{j.title}</span>
                        </button>
                      );
                    })}
                  </div>
                )}

                {results.customers.length > 0 && (
                  <div>
                    <p className="px-4 py-2 text-[11px] font-semibold text-fg-dim uppercase tracking-wider bg-surface-300/50">Customers</p>
                    {results.customers.map((c) => {
                      const idx = items.findIndex((i) => i.href === `/customers/${c.id}`);
                      return (
                        <button
                          key={c.id}
                          onClick={() => navigate(`/customers/${c.id}`)}
                          className={`w-full text-left px-4 py-2.5 flex items-center gap-3 transition-colors cursor-pointer border-none ${
                            highlightIdx === idx ? "bg-accent/10 text-fg" : "text-fg-muted hover:bg-surface-300"
                          }`}
                        >
                          <span className="text-sm truncate">{c.name}</span>
                        </button>
                      );
                    })}
                  </div>
                )}

                {canSearchInvoices && results.invoices.length > 0 && (
                  <div>
                    <p className="px-4 py-2 text-[11px] font-semibold text-fg-dim uppercase tracking-wider bg-surface-300/50">Invoices</p>
                    {results.invoices.map((inv) => {
                      const idx = items.findIndex((i) => i.href === `/invoices/${inv.id}`);
                      return (
                        <button
                          key={inv.id}
                          onClick={() => navigate(`/invoices/${inv.id}`)}
                          className={`w-full text-left px-4 py-2.5 flex items-center gap-3 transition-colors cursor-pointer border-none ${
                            highlightIdx === idx ? "bg-accent/10 text-fg" : "text-fg-muted hover:bg-surface-300"
                          }`}
                        >
                          <span className="text-xs text-fg-dim w-12 shrink-0">{inv.status}</span>
                          <span className="text-sm truncate">{inv.number}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {!loading && !error && !query.trim() && (
              <p className="p-6 text-sm text-fg-dim text-center">
                {canSearchInvoices
                  ? "Start typing to search across jobs, customers, and invoices"
                  : "Start typing to search assigned jobs and customers"}
              </p>
            )}
          </div>
        </Card>
      </div>
    </>
  );
}
