import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Enables the standalone server bundle used by the production Dockerfile.
  output: "standalone",
};

export default nextConfig;
