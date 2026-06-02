export interface RunData {
  timestamp: number;
  ok: boolean;
  message: string | null;
  errorDetails: string | null;
  probeId: string | null;
  ingressDetails: string | null;
  bqDetails: string | null;
  bqQuery: string | null;
  durationMs: number;
  /** BQ polling retries. 0 = found on first attempt. >0 = slow (yellowish dot). */
  retries: number;
}

export interface ProbeStateData {
  paused: boolean;
  running: boolean;
  activeRuns: { startedAt: number; probeId?: string }[];
  now: number;
  history: RunData[];
  latest: RunData | null;
}


