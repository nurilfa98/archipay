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
    // @vladmandic/human (deteksi wajah absensi) hanya berjalan di browser,
    // tetapi komponen client ikut di-bundle untuk SSR. Di server, paket itu
    // memilih build Node (dist/human.node.js) yang membutuhkan
    // @tensorflow/tfjs-node (tidak terpasang) sehingga build gagal. Semua
    // lingkungan diarahkan ke build browser (ESM, tfjs sudah di dalamnya).
    // Di server modul ini tidak pernah dijalankan: ia dimuat lewat import()
    // saat kamera dibuka (features/attendance/components/face-capture.tsx).
    // Referensi: node_modules/next/dist/docs/01-app/03-api-reference/05-config/01-next-config-js/turbopack.md (resolveAlias)
    resolveAlias: {
      "@vladmandic/human": "./node_modules/@vladmandic/human/dist/human.esm.js",
    },
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
