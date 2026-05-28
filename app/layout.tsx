import type { Metadata } from "next";
import "@navikt/ds-css";
import "./globals.css";
import { ThemeProvider } from "./ThemeProvider";
import { ThemeButton } from "./ThemeButton";

export const metadata: Metadata = {
  title: "reops-health-probe",
  description: "Pipeline health monitor",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body data-color="neutral">
        <ThemeProvider>
          <div className="theme-btn-wrap">
            <ThemeButton />
          </div>
          <main className="page-wrap">
            {children}
          </main>
        </ThemeProvider>
      </body>
    </html>
  );
}
