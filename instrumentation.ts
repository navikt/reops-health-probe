/**
 * Next.js instrumentation hook — runs once when the server process starts,
 * before any requests are handled.
 *
 * https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 */
export async function register() {
  // Only run in the Node.js runtime (not edge), and only on the server.
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startServer } = await import("./server");
    startServer();
  }
}
