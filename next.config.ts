import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  experimental: {
    // Tree-shake Aksel DS — prevents pulling the whole package (Phase 2 prep)
    optimizePackageImports: ["@navikt/ds-react", "@navikt/aksel-icons"],
  },
  // Disable Next.js telemetry in CI / prod
  // (also set NEXT_TELEMETRY_DISABLED=1 in Dockerfile)
};

export default nextConfig;
