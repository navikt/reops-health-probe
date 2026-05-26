async function getAccessToken(): Promise<string> {
  const res = await fetch(
    "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token",
    { headers: { "Metadata-Flavor": "Google" } },
  );
  if (!res.ok) throw new Error(`GCP metadata token fetch failed: ${res.status}`);
  const { access_token } = await res.json();
  return access_token as string;
}

export interface BQQueryResult {
  rows: Record<string, string>[][];
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
    rows: (data.rows ?? []) as Record<string, string>[][],
    totalRows: parseInt(data.totalRows ?? "0", 10),
  };
}
