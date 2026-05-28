import { setPaused } from "@/src/lib/state";
import { log } from "@/src/lib/log";

export const dynamic = "force-dynamic";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ name: string }> },
) {
  const { name } = await params;
  setPaused(name, true);
  log({ event: "admin.paused", probe: name });
  return Response.redirect(new URL("/", req.url), 303);
}
