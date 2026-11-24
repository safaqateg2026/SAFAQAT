import type { NextConfig } from "next";

const pagesExport: NextConfig = {
  output: "export",
  trailingSlash: true,
  experimental: { cpus: 1, useTypeScriptCli: false },
};

const nextConfig: NextConfig = process.env.SAFAQAT_PAGES_EXPORT === "1" ? pagesExport : {
  allowedDevOrigins: ['192.168.1.5'],
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
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
