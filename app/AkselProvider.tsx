"use client";
import { Provider } from "@navikt/ds-react";

export function AkselProvider({ children }: { children: React.ReactNode }) {
  return <Provider>{children}</Provider>;
}
