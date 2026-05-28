const RETRY_DELAY_MS = 2_000;
const MAX_ATTEMPTS = 2;

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
  /** True if the fetch succeeded on a retry (attempt > 1). */
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
 * Executes a fetch with up to `MAX_ATTEMPTS` attempts, retrying on:
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
    loggableHeaders[k] = redact.has(k.toLowerCase())
      ? `${v.slice(0, 8)}…[redacted]`
      : v;
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

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    if (attempt > 1) {
      await new Promise<void>((r, reject) => {
        const t = setTimeout(r, RETRY_DELAY_MS);
        req.signal?.addEventListener(
          "abort",
          () => {
            clearTimeout(t);
            reject(req.signal!.reason);
          },
          { once: true },
        );
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
      if (attempt < MAX_ATTEMPTS) continue;
      const summary = buildSummary(
        reqSummary,
        attempt,
        MAX_ATTEMPTS,
        0,
        `Network error: ${lastError}`,
      );
      return {
        statusCode: 0,
        body: `Network error: ${lastError}`,
        requestSummary: summary,
        retried: attempt > 1,
      };
    }

    // Retry on 5xx
    if (statusCode >= 500 && attempt < MAX_ATTEMPTS) {
      lastError = `HTTP ${statusCode}: ${body}`;
      continue;
    }

    const summary = buildSummary(
      reqSummary,
      attempt,
      MAX_ATTEMPTS,
      statusCode,
      body,
    );
    return { statusCode, body, requestSummary: summary, retried: attempt > 1 };
  }

  // Unreachable, but TypeScript needs it
  throw new Error("fetchWithRetry: unreachable");
}

function buildSummary(
  reqSummary: string,
  attempt: number,
  maxAttempts: number,
  statusCode: number,
  body: string,
): string {
  const attemptLabel =
    attempt > 1 ? `[attempt ${attempt}/${maxAttempts}] ` : "";
  let prettyBody: string;
  try {
    prettyBody = JSON.stringify(JSON.parse(body), null, 2);
  } catch {
    prettyBody = body;
  }
  return `${reqSummary}\n\n${attemptLabel}Response (${statusCode}):\n${prettyBody}`;
}
