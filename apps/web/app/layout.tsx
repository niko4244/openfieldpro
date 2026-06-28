import type { ReactNode } from "react";
import "./globals.css";

export const metadata = {
  title: "OpenFieldPro",
  description: "Open-source field service management",
};

const navItems = [
  { href: "/", label: "Today", icon: "◎" },
  { href: "/customers", label: "Customers", icon: "◌" },
  { href: "/jobs", label: "Jobs", icon: "□" },
  { href: "/schedule", label: "Schedule", icon: "◫" },
  { href: "/estimates", label: "Quotes", icon: "◇" },
  { href: "/invoices", label: "Invoices", icon: "$" },
];

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
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
            {navItems.map((item) => (
              <a key={item.href} href={item.href}>
                <span>{item.icon}</span>
                {item.label}
              </a>
            ))}
          </nav>
        </div>
      </body>
    </html>
  );
}
