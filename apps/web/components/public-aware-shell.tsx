"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { Sidebar } from "@/components/sidebar";
import { MobileNav } from "@/components/mobile-nav";
import { CommandPalette } from "@/components/command-palette";

// Ponytail: a public/unauthenticated route shouldn't carry the dashboard
// chrome (sidebar, mobile nav, command palette). One client component that
// switches on `usePathname()` keeps the diff to a single file instead of
// restructuring Next.js layouts into a (public)/(dashboard) route-group
// split.  Ceiling: if a second unauthenticated route joins (e.g. customer
// portal at /portal/*), turn this into a set `["/approvals", "/portal"]`
// or move to a route group.  Upgrade: split into route groups.

const PUBLIC_PREFIX = "/approvals";

export function PublicAwareShell({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? "";
  const isPublic = pathname === PUBLIC_PREFIX || pathname.startsWith(`${PUBLIC_PREFIX}/`);

  if (isPublic) {
    // No sidebar / mobile nav / command palette — the estimate-approval
    // page should look like a standalone document the customer can sign.
    // The page itself handles its own header/footer.
    return <main className="min-h-screen">{children}</main>;
  }

  return (
    <>
      <Sidebar />
      <MobileNav />
      <main className="ml-0 md:ml-56 min-h-screen p-4 pt-16 md:p-8">{children}</main>
      <CommandPalette />
    </>
  );
}
