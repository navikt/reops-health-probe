"use client";

import { ThemeProvider as NextThemeProvider } from "next-themes";
import { Theme } from "@navikt/ds-react";

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemeProvider
      attribute="class"
      storageKey="reops-theme"
      enableSystem
      themes={["light", "dark"]}
      disableTransitionOnChange
    >
      <Theme hasBackground>{children}</Theme>
    </NextThemeProvider>
  );
}
