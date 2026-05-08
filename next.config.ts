import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow accessing the dev server over the LAN (e.g. from your phone on the
  // same Wi-Fi). Next 16 blocks cross-origin dev-only endpoints by default,
  // which is why /api/* requests hang when opened via the network URL.
  allowedDevOrigins: [
    "192.168.0.*",
    "192.168.1.*",
    "192.168.2.*",
    "192.168.29.*",
    "10.0.0.*",
  ],
  // `better-sqlite3` is a native Node addon. Next's bundler can't process the
  // `.node` binary, so the import has to stay external for server bundles
  // (route handlers + server components).
  serverExternalPackages: ["better-sqlite3"],
};

export default nextConfig;
