import type { ProbeData } from "../probe/injector.ts";

export interface ProbeState {
  probe: ProbeData;
  failedSince: number;
  lastAlertTs?: string;
  lastAlertTime?: number;
  acknowledged: boolean;
  escalated: boolean;
}

/**
 * In-memory store for tracking probe state
 * In a production environment, this could be backed by Redis or a database
 */
export class StateStore {
  private currentProbe: ProbeState | null = null;

  /**
   * Set the current failing probe
   */
  setFailingProbe(probe: ProbeData): void {
    if (!this.currentProbe) {
      this.currentProbe = {
        probe,
        failedSince: Date.now(),
        acknowledged: false,
        escalated: false,
      };
    } else {
      // Update probe but keep state
      this.currentProbe.probe = probe;
    }
  }

  /**
   * Get the current failing probe
   */
  getCurrentProbe(): ProbeState | null {
    return this.currentProbe;
  }

  /**
   * Update alert timestamp
   */
  setAlertTimestamp(ts: string): void {
    if (this.currentProbe) {
      this.currentProbe.lastAlertTs = ts;
      this.currentProbe.lastAlertTime = Date.now();
    }
  }

  /**
   * Mark probe as acknowledged
   */
  acknowledgeProbe(): void {
    if (this.currentProbe) {
      this.currentProbe.acknowledged = true;
    }
  }

  /**
   * Mark probe as escalated
   */
  escalateProbe(): void {
    if (this.currentProbe) {
      this.currentProbe.escalated = true;
    }
  }

  /**
   * Clear the current probe (when recovered)
   */
  clearProbe(): void {
    this.currentProbe = null;
  }

  /**
   * Check if we should send an alert
   * Returns true if:
   * - No alert has been sent yet, OR
   * - Last alert was sent more than repeatInterval ms ago
   */
  shouldSendAlert(repeatIntervalMs: number): boolean {
    if (!this.currentProbe) {
      return false;
    }

    if (!this.currentProbe.lastAlertTime) {
      return true; // First alert
    }

    const timeSinceLastAlert = Date.now() - this.currentProbe.lastAlertTime;
    return timeSinceLastAlert >= repeatIntervalMs;
  }

  /**
   * Check if we should escalate the alert
   * Returns true if:
   * - Probe is not acknowledged, AND
   * - Probe has been failing for more than escalationDelay ms, AND
   * - Has not been escalated yet
   */
  shouldEscalate(escalationDelayMs: number): boolean {
    if (!this.currentProbe) {
      return false;
    }

    if (this.currentProbe.acknowledged || this.currentProbe.escalated) {
      return false;
    }

    const timeSinceFailed = Date.now() - this.currentProbe.failedSince;
    return timeSinceFailed >= escalationDelayMs;
  }
}
