import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // just-bash pulls in @mongodb-js/zstd which has native .node bindings
  // that webpack cannot bundle. Externalize them for server-side only.
  serverExternalPackages: ["just-bash", "@mongodb-js/zstd"],
};

export default nextConfig;
