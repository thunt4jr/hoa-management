import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  output: "standalone",
  poweredByHeader: false,
  allowedDevOrigins: ["localhost", "*.localhost"],
  turbopack: { root: process.env.HOA_TEST_PROJECT_ROOT || process.cwd() },
};

export default nextConfig;
