"use client";

import { useState, useEffect } from "react";
import { ProbeCard } from "./ProbeCard";
import type { ProbeStateData } from "./types";

interface ProbeInfo {
  name: string;
  scheduleMs: number | null;
  initialState: ProbeStateData;
}

interface DashboardProps {
  probes: ProbeInfo[];
}

export function Dashboard({ probes }: DashboardProps) {
  const [states, setStates] = useState<Record<string, ProbeStateData>>(
    Object.fromEntries(probes.map((p) => [p.name, p.initialState])),
  );

  useEffect(() => {
    async function poll() {
      try {
        const res = await fetch("/api/state");
        if (!res.ok) return;
        const data: Record<string, ProbeStateData> = await res.json();
        setStates(data);
      } catch {
        // keep last known values
      }
    }

    poll();
    const id = setInterval(poll, 2_000);
    return () => clearInterval(id);
  }, []);

  return (
    <>
      {probes.map((probe) => (
        <ProbeCard
          key={probe.name}
          name={probe.name}
          scheduleMs={probe.scheduleMs}
          state={states[probe.name] ?? probe.initialState}
        />
      ))}
    </>
  );
}
