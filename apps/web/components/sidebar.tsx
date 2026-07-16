"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { NAV_SECTIONS, activeNavHref } from "@/lib/nav";
import { useTheme } from "@/components/theme-provider";
import { NotificationsPopover } from "@/components/notifications-popover";
import { useSessionUser } from "@/lib/use-session-user";

export function Sidebar() {
  const pathname = usePathname();
  const currentNavHref = activeNavHref(pathname);
  const { theme, toggle } = useTheme();
  const { user, loading, signingOut, signOut } = useSessionUser();

  return (
    <aside className="fixed bottom-0 left-0 top-0 z-40 hidden w-64 flex-col border-r border-border bg-surface-50 md:flex">
      <div className="flex h-14 shrink-0 items-center justify-between border-b border-border px-5">
        <Link href="/" className="flex items-center gap-2.5 no-underline">
          <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-accent text-xs font-black text-white">OF</span>
          <div>
            <span className="block text-sm font-semibold text-fg">OpenFieldPro</span>
            <span className="block text-[10px] text-fg-dim">Open field-service operations</span>
          </div>
        </Link>
        <NotificationsPopover />
      </div>

      <nav className="flex-1 overflow-y-auto p-3">
        {NAV_SECTIONS.map((section) => (
          <div key={section.label} className="mb-5 last:mb-0">
            <p className="mb-1.5 px-3 text-[10px] font-bold uppercase tracking-[0.16em] text-fg-dim">
              {section.label}
            </p>
            <div className="flex flex-col gap-1">
              {section.links.map(({ href, label, icon }) => {
                const active = currentNavHref === href;
                return (
                  <Link
                    key={href}
                    href={href}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex items-center gap-3 rounded-lg px-3 py-2 text-sm no-underline transition-all duration-150",
                      active
                        ? "bg-accent font-medium text-white"
                        : "text-fg-muted hover:bg-surface-300 hover:text-fg",
                    )}
                  >
                    <span aria-hidden="true" className="w-5 text-center text-base">{icon}</span>
                    <span>{label}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="shrink-0 border-t border-border p-3">
        <button
          onClick={toggle}
          className="flex w-full cursor-pointer items-center gap-3 rounded-lg border-none bg-transparent px-3 py-2 text-sm text-fg-muted transition-all duration-150 hover:bg-surface-300 hover:text-fg"
          aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
        >
          <span className="w-5 text-center text-base">{theme === "dark" ? "☀" : "☾"}</span>
          {theme === "dark" ? "Light mode" : "Dark mode"}
        </button>
      </div>

      <div className="shrink-0 border-t border-border p-3">
        {loading ? (
          <div className="px-3 py-2 text-xs text-fg-dim">Loading session…</div>
        ) : user ? (
          <div className="space-y-2">
            <div className="flex items-center gap-3 px-3 py-2">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-medium text-white">
                {user.name.charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <span className="block truncate text-sm text-fg-muted">{user.name}</span>
                <span className="block text-[10px] capitalize text-fg-dim">{user.role || "team member"}</span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => void signOut()}
              disabled={signingOut}
              className="flex w-full items-center gap-3 rounded-lg border-none bg-transparent px-3 py-2 text-sm text-fg-muted transition-colors hover:bg-surface-300 hover:text-fg disabled:cursor-not-allowed disabled:opacity-60"
            >
              <span className="w-5 text-center">↪</span>
              {signingOut ? "Signing out…" : "Sign out"}
            </button>
          </div>
        ) : (
          <Link
            href="/login"
            className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-fg-muted no-underline transition-all duration-150 hover:bg-surface-300 hover:text-fg"
          >
            <span className="w-5 text-center text-base">↪</span>
            Sign in
          </Link>
        )}
      </div>
    </aside>
  );
}
