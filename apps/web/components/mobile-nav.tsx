"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { activeNavHref, readStoredSession, visibleNavLinks } from "@/lib/nav";
import type { RoleName } from "@/lib/nav";
import { useTheme } from "@/components/theme-provider";

export function MobileNav() {
  const pathname = usePathname();
  const { theme, toggle } = useTheme();
  const [open, setOpen] = useState(false);
  const [user, setUser] = useState<{ name: string; role?: RoleName } | null>(null);

  useEffect(() => {
    const refreshUser = () => {
      setUser(readStoredSession());
    };

    refreshUser();
    window.addEventListener("storage", refreshUser);
    window.addEventListener("ofp_auth_changed", refreshUser);
    return () => {
      window.removeEventListener("storage", refreshUser);
      window.removeEventListener("ofp_auth_changed", refreshUser);
    };
  }, []);

  // Close drawer on route change
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // Escape key to close drawer
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  // Prevent body scroll when drawer is open
  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  return (
    <>
      {/* ── Hamburger button ── */}
      <button
        onClick={() => setOpen(true)}
        className="md:hidden fixed top-0 left-0 z-30 h-12 w-12 flex items-center justify-center text-fg-muted hover:text-fg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 rounded-lg"
        aria-label="Open navigation menu"
      >
        <svg width="20" height="16" viewBox="0 0 20 16" fill="none">
          <rect y="0" width="20" height="2" rx="1" fill="currentColor" />
          <rect y="7" width="20" height="2" rx="1" fill="currentColor" />
          <rect y="14" width="20" height="2" rx="1" fill="currentColor" />
        </svg>
      </button>

      {/* ── Backdrop ── */}
      {open && (
        <div
          className="md:hidden fixed inset-0 z-40 bg-black/60 backdrop-blur-sm transition-opacity"
          onClick={() => setOpen(false)}
        />
      )}

      {/* ── Slide-over drawer ── */}
      <aside
        className={cn(
          "md:hidden fixed left-0 top-0 bottom-0 w-64 z-50 flex flex-col bg-surface-50 border-r border-border shadow-2xl transition-transform duration-300 ease-out",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        {/* Brand header */}
        <div className="h-14 flex items-center justify-between px-5 border-b border-border shrink-0">
          <div className="flex items-center gap-2.5">
            <span className="text-lg">⊹</span>
            <span className="font-semibold text-sm text-fg">OpenFieldPro</span>
          </div>
          <button
            onClick={() => setOpen(false)}
            className="text-fg-muted hover:text-fg transition-colors p-1"
            aria-label="Close navigation menu"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path
                d="M3 3L13 13M13 3L3 13"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>

        {/* Navigation links */}
        <nav className="flex-1 flex flex-col gap-1 p-3 overflow-y-auto">
          {visibleNavLinks(user?.role).map(({ href, label, icon }) => {
            const active = href === activeNavHref(visibleNavLinks(user?.role), pathname);
            return (
              <Link
                key={href}
                href={href}
                onClick={() => setOpen(false)}
                className={cn(
                  "flex items-center gap-3 px-3 py-3 rounded-lg text-sm transition-all duration-150 no-underline",
                  active
                    ? "bg-accent text-white font-medium"
                    : "text-fg-muted hover:text-fg hover:bg-surface-300",
                )}
              >
                <span className="text-base w-5 text-center">{icon}</span>
                {label}
              </Link>
            );
          })}
        </nav>

        {/* Theme toggle */}
        <div className="p-3 border-t border-border shrink-0">
          <button
            onClick={() => { toggle(); setOpen(false); }}
            className="w-full flex items-center gap-3 px-3 py-3 rounded-lg text-sm text-fg-muted hover:text-fg hover:bg-surface-300 transition-all duration-150 cursor-pointer border-none bg-transparent"
          >
            <span className="text-base w-5 text-center">
              {theme === "dark" ? "☀" : "☾"}
            </span>
            {theme === "dark" ? "Light mode" : "Dark mode"}
          </button>
        </div>

        {/* Bottom section */}
        <div className="p-3 border-t border-border shrink-0">
          {user ? (
            <div className="flex items-center gap-3 px-3 py-3">
              <div className="w-7 h-7 rounded-full bg-accent flex items-center justify-center text-xs font-medium text-white shrink-0">
                {user.name.charAt(0).toUpperCase()}
              </div>
              <span className="text-sm text-fg-muted truncate">
                {user.name}
                {user.role ? (
                  <span className="ml-1 text-fg-dim">· {user.role}</span>
                ) : null}
              </span>
            </div>
          ) : (
            <Link
              href="/login"
              onClick={() => setOpen(false)}
              className="flex items-center gap-3 px-3 py-3 rounded-lg text-sm text-fg-muted hover:text-fg hover:bg-surface-300 transition-all duration-150 no-underline"
            >
              <span className="text-base w-5 text-center">↪</span>
              Sign in
            </Link>
          )}
        </div>
      </aside>
    </>
  );
}
