// Helper untuk membaca informasi request di Server Action / Server Component.
//
// Referensi: node_modules/next/dist/docs/01-app/03-api-reference/04-functions/headers.md

import "server-only";
import { headers } from "next/headers";

// Alamat IP pengunjung. Saat aplikasi berada di belakang reverse proxy/CDN
// (Vercel, Nginx, Cloudflare), IP asli dikirim lewat header x-forwarded-for
// dengan format "ip-client, ip-proxy-1, ip-proxy-2".
//
// Perhatian: header ini bisa dipalsukan bila server diakses LANGSUNG tanpa
// reverse proxy. Di production, pastikan proxy Anda menimpa header ini.
export async function getClientIp() {
  const h = await headers();
  const forwarded = h.get("x-forwarded-for")?.split(",")[0]?.trim();
  const ip = forwarded || h.get("x-real-ip");

  return ip ? ip.slice(0, 45) : null;
}
