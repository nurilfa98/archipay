// Proxy (di Next.js 15 ke bawah bernama middleware.ts) berjalan SEBELUM
// halaman dirender, untuk setiap request yang cocok dengan `matcher`.
//
// Tugasnya di sini hanya "pemeriksaan optimis": ada cookie session yang
// valid atau tidak? Kalau tidak, langsung arahkan ke /login tanpa perlu
// merender halaman. Proxy SENGAJA tidak mengakses database, karena berjalan
// di setiap request termasuk prefetch, sehingga harus cepat.
//
// Proxy BUKAN pengaman utama. Pengecekan sebenarnya (user masih aktif? role
// cocok?) tetap di lib/auth/dal.ts, dan setiap Server Action wajib memanggilnya.
//
// Referensi:
// - node_modules/next/dist/docs/01-app/01-getting-started/16-proxy.md
// - node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md
//   (bagian "Matcher", "Negative matching", "Execution order")
// - node_modules/next/dist/docs/01-app/02-guides/authentication.md
//   (bagian "Optimistic checks with Proxy")

import { NextResponse, type NextRequest } from "next/server";
import { getSession } from "@/lib/auth/session";

// Halaman yang boleh dibuka tanpa login. Selain ini, semua wajib login.
// Nanti endpoint webhook (misal /api/webhooks/...) juga perlu ditambahkan di sini.
const PUBLIC_ROUTES = ["/login"];

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (PUBLIC_ROUTES.includes(pathname)) return NextResponse.next();

  // Hanya membuka enkripsi cookie, tanpa query database.
  const { userId } = await getSession();

  if (!userId) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  return NextResponse.next();
}

// Kenapa user yang sudah login TIDAK dialihkan dari /login ke beranda?
// Cookie bisa saja masih valid padahal user sudah dinonaktifkan. DAL akan
// mengirimnya ke /login; kalau proxy mengirimnya balik ke beranda, terjadi
// redirect loop tanpa akhir. Proxy tidak bisa membedakan kasus ini karena
// tidak mengecek database.

export const config = {
  // Jalankan proxy untuk semua path KECUALI file statis & gambar.
  // Tanpa ini, CSS/JS/gambar halaman login ikut diblokir.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
