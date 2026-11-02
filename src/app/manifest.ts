// Web App Manifest → disajikan di /manifest.webmanifest.
// Dengan file ini, browser HP bisa memasang ArchiPay ke layar utama
// ("Install app" / "Tambahkan ke layar utama"). Saat dibuka dari ikon,
// ArchiPay tampil layar penuh tanpa address bar (display: "standalone").
//
// Ikon:
// - icon-*.png     : sudut membulat transparan, untuk launcher yang tidak memotong ikon.
// - maskable-*.png : latar penuh dengan logo di zona aman 80%, sehingga Android
//                    bebas memotongnya menjadi lingkaran/squircle.
// Sumber gambar: src/app/icon.svg.
//
// Catatan: Chrome mengambil manifest TANPA cookie, jadi path ini dikecualikan
// dari proxy (src/proxy.ts). Kalau tidak, manifest ikut dialihkan ke /login.
//
// Referensi:
// - node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/01-metadata/manifest.md
// - node_modules/next/dist/docs/01-app/02-guides/progressive-web-apps.md

import type { MetadataRoute } from "next";
import { PRODUCT_NAME, PRODUCT_TAGLINE } from "@/lib/brand";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: `${PRODUCT_NAME} – ${PRODUCT_TAGLINE}`,
    short_name: PRODUCT_NAME,
    description: "Project Financial Control & Petty Cash Management System",
    lang: "id",
    start_url: "/",
    scope: "/",
    display: "standalone",
    // slate-50, sama dengan latar aplikasi mode terang (warna splash screen Android).
    background_color: "#f8fafc",
    theme_color: "#f8fafc",
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/maskable-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/icons/maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
