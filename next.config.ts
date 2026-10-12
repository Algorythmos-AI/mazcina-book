import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Every page is private and per-user, so nothing is prerendered or cached:
  // Cache Components and partial prefetching stay off.
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
