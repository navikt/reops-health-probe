const RETRY_DELAY_MS = 2_000;

export interface FetchResult {
  statusCode: number;
  body: string;
  /**
   * Human-readable request+response summary for the UI tooltip.
   * Format:
   *   POST <url>
   *   Headers: { ... }
   *   Body: { ... }
   *
   *   [attempt 2/2] Response (201):
   *   { ... }
   */
  requestSummary: string;
  /** True if the fetch was completed on a retry (attempt 2). */
  retried: boolean;
}

export interface FetchRequest {
  url: string;
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  headers: Record<string, string>;
  body?: string;
  /**
   * Header names whose values should be redacted in `requestSummary`.
   * The real values are still sent in the actual HTTP request.
   */
  redactHeaders?: string[];
  /** When aborted, all in-flight fetch attempts and retry delays are cancelled. */
  signal?: AbortSignal;
}

/**
 * Executes a fetch with one automatic retry on:
 *   - Network error (fetch throws)
 *   - 5xx response
 *
 * Never throws — caller inspects `statusCode` to decide success/failure.
 * `requestSummary` always contains the full request + final response for the UI tooltip.
 */
export async function fetchWithRetry(req: FetchRequest): Promise<FetchResult> {
  const redact = new Set((req.redactHeaders ?? []).map((h) => h.toLowerCase()));

  const loggableHeaders: Record<string, string> = {};
  for (const [k, v] of Object.entries(req.headers)) {
    loggableHeaders[k] = redact.has(k.toLowerCase()) ? `${v.slice(0, 8)}…[redacted]` : v;
  }

  const reqLines = [
    `${req.method} ${req.url}`,
    `Headers: ${JSON.stringify(loggableHeaders, null, 2)}`,
  ];
  if (req.body !== undefined) {
    try {
      reqLines.push(`Body: ${JSON.stringify(JSON.parse(req.body), null, 2)}`);
    } catch {
      reqLines.push(`Body: ${req.body}`);
    }
  }
  const reqSummary = reqLines.join("\n");

  let lastError: string | null = null;

  for (let attempt = 1; attempt <= 2; attempt++) {
    if (attempt === 2) {
      await new Promise<void>((r, reject) => {
        const t = setTimeout(r, RETRY_DELAY_MS);
        req.signal?.addEventListener("abort", () => { clearTimeout(t); reject(req.signal!.reason); }, { once: true });
      });
    }

    let statusCode: number;
    let body: string;

    try {
      const res = await fetch(req.url, {
        method: req.method,
        headers: req.headers,
        body: req.body,
        signal: req.signal,
      });
      statusCode = res.status;
      body = await res.text();
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      if (attempt < 2) continue;
      // Both attempts threw — synthesize a 0 status
      const summary = buildSummary(reqSummary, attempt, 0, `Network error: ${lastError}`);
      return { statusCode: 0, body: `Network error: ${lastError}`, requestSummary: summary, retried: attempt === 2 };
    }

    // Retry on 5xx
    if (statusCode >= 500 && attempt < 2) {
      lastError = `HTTP ${statusCode}: ${body}`;
      continue;
    }

    const summary = buildSummary(reqSummary, attempt, statusCode, body);
    return { statusCode, body, requestSummary: summary, retried: attempt === 2 };
  }

  // Unreachable, but TypeScript needs it
  throw new Error("fetchWithRetry: unreachable");
}

function buildSummary(reqSummary: string, attempt: number, statusCode: number, body: string): string {
  const attemptLabel = attempt > 1 ? `[attempt ${attempt}/2] ` : "";
  // Pretty-print response body if JSON
  let prettyBody: string;
  try {
    prettyBody = JSON.stringify(JSON.parse(body), null, 2);
  } catch {
    prettyBody = body;
  }
  return `${reqSummary}\n\n${attemptLabel}Response (${statusCode}):\n${prettyBody}`;
}
