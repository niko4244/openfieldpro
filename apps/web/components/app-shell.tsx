"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { Sidebar } from "@/components/sidebar";
import { MobileNav } from "@/components/mobile-nav";
import { CommandPalette } from "@/components/command-palette";
import { isPublicRoute } from "@/lib/route-access";
import { SessionProvider } from "@/lib/use-session-user";

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  if (isPublicRoute(pathname)) return <>{children}</>;

  return (
    <SessionProvider>
      <Sidebar />
      <MobileNav />
      <main className="ml-0 min-h-screen p-4 pt-16 md:ml-64 md:p-8">
        <div className="mx-auto w-full max-w-[1600px]">{children}</div>
      </main>
      <CommandPalette />
    </SessionProvider>
  );
}
