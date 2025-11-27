import { logger } from "../utils/logger.ts";
import type { ProbeData } from "../probe/injector.ts";

interface BigQueryQueryRequest {
  query: string;
  useLegacySql: boolean;
}

interface BigQueryQueryResponse {
  rows?: Array<Record<string, unknown>>;
  totalRows?: string;
}

export class BigQueryVerifier {
  private accessToken: string | null = null;
  private tokenExpiry: number = 0;

  constructor(
    private projectId: string,
    private datasetId: string,
    private tableId: string,
    private probeField: string,
  ) {}

  /**
   * Get access token using Workload Identity (NAIS)
   */
  private async getAccessToken(): Promise<string> {
    // Check if we have a valid cached token
    if (this.accessToken && Date.now() < this.tokenExpiry) {
      return this.accessToken;
    }

    logger.debug("Fetching new GCP access token");

    try {
      // On NAIS with Workload Identity, use the metadata server
      const metadataUrl =
        "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token";

      const response = await fetch(metadataUrl, {
        headers: {
          "Metadata-Flavor": "Google",
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to get access token: ${response.statusText}`);
      }

      const data = await response.json();
      const token = data.access_token as string;
      this.accessToken = token;
      // Set expiry to 5 minutes before actual expiry
      this.tokenExpiry = Date.now() + (data.expires_in - 300) * 1000;

      return token;
    } catch (error) {
      logger.error("Error getting access token", error);
      throw error;
    }
  }

  /**
   * Query BigQuery to check if probe exists
   */
  async verifyProbe(probe: ProbeData): Promise<boolean> {
    const query = `
      SELECT COUNT(*) as count
      FROM \`${this.projectId}.${this.datasetId}.${this.tableId}\`
      WHERE ${this.probeField} = '${probe.id}'
      AND timestamp >= TIMESTAMP_MILLIS(${probe.timestamp})
    `;

    logger.info("Querying BigQuery for probe", { probeId: probe.id });

    try {
      const token = await this.getAccessToken();
      const url =
        `https://bigquery.googleapis.com/bigquery/v2/projects/${this.projectId}/queries`;

      const requestBody: BigQueryQueryRequest = {
        query,
        useLegacySql: false,
      };

      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `BigQuery query failed: ${response.status} ${response.statusText} - ${errorText}`,
        );
      }

      const data: BigQueryQueryResponse = await response.json();
      const count = data.rows?.[0]?.count as number | undefined;

      const found = (count ?? 0) > 0;
      logger.info("BigQuery verification result", { probeId: probe.id, found, count });

      return found;
    } catch (error) {
      logger.error("Error verifying probe in BigQuery", error);
      throw error;
    }
  }
}
