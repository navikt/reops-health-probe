import type { ProbeResult } from "./runner.ts";

export interface ProbeRun {
  timestamp: number; // unix ms
  result: ProbeResult;
}

export interface ProbeState {
  paused: boolean;
  history: ProbeRun[]; // newest first, capped at MAX_HISTORY
}

const MAX_HISTORY = 20;

const probeStates = new Map<string, ProbeState>();

function getOrCreate(name: string): ProbeState {
  if (!probeStates.has(name)) {
    probeStates.set(name, { paused: false, history: [] });
  }
  return probeStates.get(name)!;
}

export function isPaused(name: string): boolean {
  return getOrCreate(name).paused;
}

export function setPaused(name: string, paused: boolean): void {
  getOrCreate(name).paused = paused;
}

export function recordRun(name: string, result: ProbeResult): void {
  const state = getOrCreate(name);
  state.history.unshift({ timestamp: Date.now(), result });
  if (state.history.length > MAX_HISTORY) {
    state.history.length = MAX_HISTORY;
  }
}

export function getProbeState(name: string): ProbeState {
  return getOrCreate(name);
}

export function getAllProbeNames(): string[] {
  return [...probeStates.keys()];
}

/** Called at startup to ensure probe entries exist before first run */
export function registerProbe(name: string): void {
  getOrCreate(name);
}
