import { logger } from "../utils/logger.ts";

export interface ProbeData {
  id: string;
  timestamp: number;
}

export interface UmamiPayload {
  website: string;
  url: string;
  hostname: string;
  language: string;
  referrer: string;
  screen: string;
  title: string;
  name: string;
  data: {
    probe_id: string;
  };
}

export class ProbeInjector {
  constructor(
    private baseUrl: string,
    private apiKey: string,
    private websiteId: string,
    private eventName: string,
  ) {}

  /**
   * Inject a health probe into Umami
   */
  async injectProbe(): Promise<ProbeData> {
    const probeId = crypto.randomUUID();
    const timestamp = Date.now();

    const payload: UmamiPayload = {
      website: this.websiteId,
      url: "/health-probe",
      hostname: "health-probe",
      language: "en-US",
      referrer: "",
      screen: "1920x1080",
      title: "Health Probe",
      name: this.eventName,
      data: {
        probe_id: probeId,
      },
    };

    logger.info("Injecting health probe", { probeId, timestamp });

    try {
      const response = await fetch(`${this.baseUrl}/api/send`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `Failed to inject probe: ${response.status} ${response.statusText} - ${errorText}`,
        );
      }

      logger.info("Probe injected successfully", { probeId });

      return {
        id: probeId,
        timestamp,
      };
    } catch (error) {
      logger.error("Error injecting probe", error);
      throw error;
    }
  }
}
