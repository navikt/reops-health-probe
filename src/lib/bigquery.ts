let cachedToken: { value: string; expiresAt: number } | null = null;

async function getAccessTokenFromServiceAccountKey(keyJson: string): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt) {
    return cachedToken.value;
  }

  const key = JSON.parse(keyJson);

  // Build JWT for OAuth2 token exchange
  const now = Math.floor(Date.now() / 1000);
  const header = btoa(JSON.stringify({ alg: "RS256", typ: "JWT" })).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
  const payload = btoa(JSON.stringify({
    iss: key.client_email,
    scope: "https://www.googleapis.com/auth/bigquery",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  })).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");

  const signingInput = `${header}.${payload}`;

  // Import the RSA private key
  const pemBody = key.private_key
    .replace("-----BEGIN PRIVATE KEY-----", "")
    .replace("-----END PRIVATE KEY-----", "")
    .replace(/\s+/g, "");
  const derBuffer = Uint8Array.from(atob(pemBody), (c) => c.charCodeAt(0));
  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8",
    derBuffer,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );

  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    cryptoKey,
    new TextEncoder().encode(signingInput),
  );
  const sig = btoa(String.fromCharCode(...new Uint8Array(signature))).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");

  const jwt = `${signingInput}.${sig}`;

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`,
  });
  if (!tokenRes.ok) throw new Error(`SA key token exchange failed: ${tokenRes.status} ${await tokenRes.text()}`);
  const { access_token } = await tokenRes.json();
  // Cache for 55 minutes (tokens last 1hr, refresh 5min early)
  cachedToken = { value: access_token as string, expiresAt: Date.now() + 55 * 60 * 1000 };
  return cachedToken.value;
}

async function getAccessToken(): Promise<string> {
  const keyJson = Deno.env.get("GOOGLE_APPLICATION_CREDENTIALS_JSON");
  if (keyJson) {
    return getAccessTokenFromServiceAccountKey(keyJson);
  }

  // Fall back to GCP metadata server (Workload Identity / local GCP environment)
  const res = await fetch(
    "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token",
    { headers: { "Metadata-Flavor": "Google" } },
  );
  if (!res.ok) throw new Error(`GCP metadata token fetch failed: ${res.status}`);
  const { access_token } = await res.json();
  return access_token as string;
}

export interface BQQueryResult {
  // BQ REST response: rows[n].f[m].v
  rows: { f: { v: string }[] }[];
  totalRows: number;
}

export async function bqQuery(
  projectId: string,
  query: string,
  params: { name: string; type: string; value: string }[] = [],
): Promise<BQQueryResult> {
  const token = await getAccessToken();
  const url = `https://bigquery.googleapis.com/bigquery/v2/projects/${projectId}/queries`;

  const body = {
    query,
    useLegacySql: false,
    timeoutMs: 30_000,
    queryParameters: params.map((p) => ({
      name: p.name,
      parameterType: { type: p.type },
      parameterValue: { value: p.value },
    })),
  };

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    throw new Error(`BigQuery query failed: ${res.status} ${await res.text()}`);
  }

  const data = await res.json();
  return {
    rows: (data.rows ?? []) as { f: { v: string }[] }[],
    totalRows: parseInt(data.totalRows ?? "0", 10),
  };
}
