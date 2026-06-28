"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

const navItems = [
  { href: "/", label: "Today", icon: "◎" },
  { href: "/customers", label: "Customers", icon: "◌" },
  { href: "/jobs", label: "Jobs", icon: "□" },
  { href: "/schedule", label: "Schedule", icon: "◫" },
  { href: "/dispatch", label: "Dispatch", icon: "⇄" },
  { href: "/estimates", label: "Quotes", icon: "◇" },
  { href: "/invoices", label: "Invoices", icon: "$" },
  { href: "/billing/progress", label: "Progress", icon: "%" },
  { href: "/settings/invoice", label: "Settings", icon: "⚙" },
];

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isPublic = pathname?.startsWith("/public");

  if (isPublic) {
    return (
      <div style={{ minHeight: "100vh", background: "#f6f8fb" }}>
        <header
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            borderBottom: "1px solid #dbe3ee",
            background: "rgba(255,255,255,0.92)",
            padding: "16px clamp(16px, 4vw, 40px)",
          }}
        >
          <div className="brand" aria-label="OpenFieldPro">
            <span className="brand-mark">O</span>
            <span>
              <strong>OpenFieldPro</strong>
              <small>Customer portal</small>
            </span>
          </div>
        </header>
        <main style={{ width: "min(980px, calc(100% - 32px))", margin: "0 auto", padding: "clamp(24px, 5vw, 58px) 0 60px" }}>
          {children}
        </main>
      </div>
    );
  }

  return (
    <div className="app-frame">
      <aside className="sidebar" aria-label="Primary navigation">
        <a className="brand sidebar-brand" href="/" aria-label="OpenFieldPro dashboard">
          <span className="brand-mark">O</span>
          <span>
            <strong>OpenFieldPro</strong>
            <small>Field service OS</small>
          </span>
        </a>
        <nav className="side-nav">
          {navItems.map((item) => (
            <a key={item.href} href={item.href}>
              <span className="nav-icon">{item.icon}</span>
              {item.label}
            </a>
          ))}
        </nav>
        <div className="sidebar-footer">
          <a className="button primary compact" href="/jobs/new">New job</a>
          <a className="button ghost compact" href="/login">Sign in</a>
        </div>
      </aside>

      <header className="topbar mobile-topbar">
        <a className="brand" href="/" aria-label="OpenFieldPro dashboard">
          <span className="brand-mark">O</span>
          <span>
            <strong>OpenFieldPro</strong>
            <small>Field service OS</small>
          </span>
        </a>
        <a className="button primary compact" href="/jobs/new">New job</a>
      </header>

      <main className="main-content">{children}</main>

      <nav className="bottom-nav" aria-label="Mobile navigation">
        {navItems.slice(0, 6).map((item) => (
          <a key={item.href} href={item.href}>
            <span>{item.icon}</span>
            {item.label}
          </a>
        ))}
      </nav>
    </div>
  );
}
