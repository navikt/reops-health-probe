export interface RunData {
  timestamp: number;
  ok: boolean;
  message: string | null;
  errorDetails: string | null;
  probeId: string | null;
  ingressDetails: string | null;
  bqDetails: string | null;
  durationMs: number;
}

export interface ProbeStateData {
  paused: boolean;
  running: boolean;
  activeRuns: { startedAt: number }[];
  now: number;
  history: RunData[];
  latest: RunData | null;
}

export interface TipData {
  status: string;
  startedAt: number;
  durationMs: number | null;
  probeId: string;
  msg: string;
  errorDetails: string;
  ingressDetails: string;
  bqDetails: string;
}
