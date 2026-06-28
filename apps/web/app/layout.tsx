import type { ReactNode } from "react";
import "./globals.css";

export const metadata = {
  title: "OpenFieldPro",
  description: "Open-source field service management",
};

const navItems = [
  { href: "/", label: "Dashboard" },
  { href: "/customers", label: "Customers" },
  { href: "/schedule", label: "Schedule" },
  { href: "/invoices", label: "Invoices" },
];

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="app-shell">
          <header className="topbar">
            <a className="brand" href="/" aria-label="OpenFieldPro dashboard">
              <span className="brand-mark">O</span>
              <span>
                <strong>OpenFieldPro</strong>
                <small>Field service OS</small>
              </span>
            </a>
            <nav className="nav-links" aria-label="Primary navigation">
              {navItems.map((item) => (
                <a key={item.href} href={item.href}>
                  {item.label}
                </a>
              ))}
            </nav>
            <a className="button ghost compact" href="/login">
              Sign in
            </a>
          </header>
          <main className="main-content">{children}</main>
        </div>
      </body>
    </html>
  );
}
