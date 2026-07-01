import type { ReactNode } from "react";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { PublicAwareShell } from "@/components/public-aware-shell";

export const metadata = {
  title: "OpenFieldPro",
  description: "Open-source field service management",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){var t=localStorage.getItem("ofp_theme");if(t==="light")document.documentElement.setAttribute("data-theme","light")})()`,
          }}
        />
      </head>
      <body>
        <ThemeProvider>
          <PublicAwareShell>{children}</PublicAwareShell>
        </ThemeProvider>
      </body>
    </html>
  );
}
