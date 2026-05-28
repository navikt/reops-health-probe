import { renderMetrics } from "@/src/lib/metrics";

export const dynamic = "force-dynamic";

export function GET() {
  return new Response(renderMetrics(), {
    headers: { "Content-Type": "text/plain; version=0.0.4" },
  });
}
