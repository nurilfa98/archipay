import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  experimental: {
    // Foto nota diunggah lewat Server Action. Batas bawaan 1 MB; foto sudah
    // dikompres di HP, tapi PDF nota bisa lebih besar. File dibatasi 4 MB di
    // features/settlements/schemas.ts, sisanya untuk data form multipart.
    // Referensi: node_modules/next/dist/docs/01-app/03-api-reference/05-config/01-next-config-js/serverActions.md
    serverActions: { bodySizeLimit: "5mb" },
  },
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
