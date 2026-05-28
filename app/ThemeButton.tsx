"use client";

import { useTheme } from "next-themes";
import { ThemeIcon } from "@navikt/aksel-icons";
import { Button, Tooltip } from "@navikt/ds-react";

export function ThemeButton() {
  const { resolvedTheme, setTheme } = useTheme();

  return (
    <Tooltip content={resolvedTheme === "dark" ? "Switch to light theme" : "Switch to dark theme"}>
      <Button
        variant="tertiary-neutral"
        icon={<ThemeIcon aria-hidden />}
        onClick={() => setTheme(resolvedTheme === "light" ? "dark" : "light")}
        suppressHydrationWarning
        aria-label={resolvedTheme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
      />
    </Tooltip>
  );
}
