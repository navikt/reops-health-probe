"use client";

import { useState, useEffect } from "react";
import type { ProbeStateData } from "./types";

export function RunningPill({ initialCount }: { initialCount: number }) {
  const [count, setCount] = useState(initialCount);

  useEffect(() => {
    async function poll() {
      try {
        const res = await fetch("/api/state");
        if (!res.ok) return;
        const data: Record<string, ProbeStateData> = await res.json();
        const n = Object.values(data).reduce(
          (sum, p) => sum + (p.activeRuns?.length ?? 0),
          0,
        );
        setCount(n);
      } catch {
        // keep last known value
      }
    }

    poll();
    const id = setInterval(poll, 2_000);
    return () => clearInterval(id);
  }, []);

  if (count === 0) return null;

  return <span className="running-pill">{count} running</span>;
}
