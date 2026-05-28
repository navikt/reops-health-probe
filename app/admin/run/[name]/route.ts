import { probes } from "@/server";
import { runProbe } from "@/src/lib/runner";
import { log } from "@/src/lib/log";

export const dynamic = "force-dynamic";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ name: string }> },
) {
  const { name } = await params;
  const probe = probes.find((p) => p.name === name);
  if (!probe) return new Response("Not Found", { status: 404 });
  log({ event: "admin.trigger", probe: name });
  runProbe(probe); // fire-and-forget
  return Response.redirect(new URL("/", process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:9091"), 303);
}
