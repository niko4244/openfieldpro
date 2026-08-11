"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { Sidebar } from "@/components/sidebar";
import { MobileNav } from "@/components/mobile-nav";
import { CommandPalette } from "@/components/command-palette";

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isPublicSurface =
    pathname === "/login" ||
    pathname === "/welcome" ||
    pathname.startsWith("/welcome/") ||
    pathname === "/portal" ||
    pathname.startsWith("/portal/") ||
    pathname === "/p" ||
    pathname.startsWith("/p/");

  if (isPublicSurface) return <>{children}</>;

  return (
    <>
      <Sidebar />
      <MobileNav />
      <main className="ml-0 min-h-screen p-4 pt-16 md:ml-64 md:p-8">
        <div className="mx-auto w-full max-w-[1600px]">{children}</div>
      </main>
      <CommandPalette />
    </>
  );
}
