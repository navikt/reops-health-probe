import type { ProbeResult } from "./runner";

export interface ProbeRun {
  timestamp: number; // unix ms
  result: ProbeResult;
}

export interface ActiveRun {
  id: number;
  startedAt: number; // unix ms
  probeId?: string;
}

export interface ProbeState {
  paused: boolean;
  activeRuns: ActiveRun[]; // one entry per concurrent in-flight run
  history: ProbeRun[]; // newest first, capped at MAX_HISTORY
}

const MAX_HISTORY = 1000;

// Anchor mutable state to globalThis so all module instances in the same
// Node.js process share one copy. Required because Next.js dev/RSC compiles
// instrumentation.ts and route modules separately, giving each a fresh module
// scope — without this the page would always see empty Maps.
const g = globalThis as typeof globalThis & {
  __probeStates?: Map<string, ProbeState>;
  __probeSchedules?: Map<string, number>;
  __runControllers?: Map<number, AbortController>;
  __nextRunId?: number;
};

g.__probeStates ??= new Map();
g.__probeSchedules ??= new Map();
g.__runControllers ??= new Map();
g.__nextRunId ??= 0;

const probeStates: Map<string, ProbeState> = g.__probeStates;
const probeSchedules: Map<string, number> = g.__probeSchedules;
const runControllers: Map<number, AbortController> = g.__runControllers;

function getOrCreate(name: string): ProbeState {
  if (!probeStates.has(name)) {
    probeStates.set(name, { paused: false, activeRuns: [], history: [] });
  }
  return probeStates.get(name)!;
}

export function isPaused(name: string): boolean {
  return getOrCreate(name).paused;
}

export function setPaused(name: string, paused: boolean): void {
  const state = getOrCreate(name);
  state.paused = paused;
  if (paused) {
    // Abort all in-flight runs for this probe so they stop mid-execution.
    for (const run of state.activeRuns) {
      runControllers.get(run.id)?.abort();
    }
  }
}

export function recordRun(
  name: string,
  runId: number,
  result: ProbeResult,
): void {
  const state = getOrCreate(name);
  state.activeRuns = state.activeRuns.filter((r) => r.id !== runId);
  runControllers.delete(runId);
  state.history.unshift({ timestamp: Date.now(), result });
  if (state.history.length > MAX_HISTORY) {
    state.history.length = MAX_HISTORY;
  }
}

export function setRunning(name: string): { runId: number; signal: AbortSignal } {
  const id = g.__nextRunId!++;
  const controller = new AbortController();
  runControllers.set(id, controller);
  getOrCreate(name).activeRuns.push({ id, startedAt: Date.now() });
  return { runId: id, signal: controller.signal };
}

/** Update mutable fields on an in-flight run (e.g. probeId once it's known). */
export function updateActiveRun(name: string, runId: number, patch: Partial<Pick<ActiveRun, "probeId">>): void {
  const run = getOrCreate(name).activeRuns.find((r) => r.id === runId);
  if (run) Object.assign(run, patch);
}

export function getProbeState(name: string): ProbeState {
  return getOrCreate(name);
}

export function getAllProbeNames(): string[] {
  return [...probeStates.keys()];
}

/** Called at startup to ensure probe entries exist before first run */
export function registerProbe(name: string, scheduleMs?: number): void {
  getOrCreate(name);
  if (scheduleMs != null) probeSchedules.set(name, scheduleMs);
}

export function getProbeScheduleMs(name: string): number | undefined {
  return probeSchedules.get(name);
}
