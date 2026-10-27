// Session = "tanda" bahwa user sudah login, disimpan di cookie browser.
//
// iron-session mengenkripsi isi session dengan SESSION_SECRET (disebut "seal").
// Browser hanya menyimpan teks acak; isinya tidak bisa dibaca maupun diubah
// tanpa secret. Karena seluruh data ada di cookie (tidak di database), ini
// disebut "stateless session".
//
// Referensi:
// - node_modules/next/dist/docs/01-app/02-guides/authentication.md
//   (bagian "Session Management" → "Stateless Sessions" & opsi cookie)
// - node_modules/next/dist/docs/01-app/02-guides/authentication-with-cache-components.md
//   (contoh iron-session untuk project dengan cacheComponents: true)
// - https://github.com/vvo/iron-session

import "server-only";
import { getIronSession, type SessionOptions } from "iron-session";
import { io } from "next/cache";
import { cookies } from "next/headers";
import { env } from "@/lib/env";

// Simpan data seminimal mungkin. Nama, email, dan role diambil dari database
// di lib/auth/dal.ts supaya perubahan role/status langsung berlaku.
//
// sessionVersion = salinan users.session_version saat login. Cookie
// iron-session tidak bisa "ditarik" dari browser, jadi untuk mengeluarkan
// semua perangkat (setelah ganti/reset password), angka di database dinaikkan.
// Cookie yang angkanya tidak sama lagi dianggap tidak berlaku.
export type SessionData = {
  userId: string;
  sessionVersion: number;
  // Batas waktu absolut (epoch ms). Diperiksa di getSession, bukan hanya
  // mengandalkan masa berlaku cookie, karena session cookie tidak punya Max-Age.
  expiresAt: number;
  // true = dibuat dengan "Ingat saya" (cookie bertahan 14 hari).
  rememberMe: boolean;
};

const DAY_MS = 24 * 60 * 60 * 1000;
// "Ingat saya": cookie bertahan 14 hari. Tanpa itu: session cookie (hilang saat
// browser ditutup) dengan batas absolut 12 jam.
const REMEMBER_ME_MS = 14 * DAY_MS;
const SHORT_SESSION_MS = 12 * 60 * 60 * 1000;

// Masa berlaku segel & cookie untuk sesi "Ingat saya". Harus >= REMEMBER_ME_MS.
const SESSION_TTL_SECONDS = 14 * 24 * 60 * 60;

const sessionOptions: SessionOptions = {
  cookieName: "archipay_session",
  password: env.SESSION_SECRET,
  ttl: SESSION_TTL_SECONDS,
  cookieOptions: {
    httpOnly: true, // JavaScript di browser tidak bisa membaca cookie (mencegah pencurian via XSS)
    secure: env.NODE_ENV === "production", // hanya dikirim lewat HTTPS di production
    sameSite: "lax", // tidak dikirim dari form situs lain (mengurangi risiko CSRF)
    path: "/",
  },
  // Cookie rusak/dipalsukan otomatis dianggap "belum login". Dicatat agar
  // percobaan manipulasi cookie tetap terlihat di log.
  onUnsealError: (reason) => {
    if (reason !== "expired") console.warn(`[session] cookie ditolak: ${reason}`);
  },
};

// Bisa dipanggil dari Server Component, Server Action, atau Route Handler.
// userId undefined kalau belum login atau sesi sudah lewat batas waktunya.
export async function getSession() {
  const cookieStore = await cookies();

  // Kenapa ada `await io()`?
  // iron-session memanggil Date.now() untuk mengecek apakah cookie sudah
  // kedaluwarsa. Dengan cacheComponents: true, Next.js melarang nilai waktu
  // dibaca saat PRERENDER, karena hasilnya akan "membeku" di HTML statis.
  // Saat dev dan saat prefetch, Next.js melakukan prerender di mana cookies()
  // sudah berisi nilai, sehingga error "encountered the unstable value
  // Date.now()" muncul.
  //
  // io() memberi tahu Next.js bahwa setelah baris ini ada operasi yang
  // bergantung waktu: saat prerender ia berhenti di sini (yang tampil
  // fallback <Suspense>), sedangkan saat request sungguhan (render biasa,
  // Server Action, Proxy) ia langsung lanjut tanpa jeda.
  //
  // Referensi:
  // - node_modules/next/dist/docs/01-app/03-api-reference/04-functions/io.md
  // - node_modules/next/dist/docs/01-app/01-getting-started/08-caching.md
  //   (bagian "Random values and timestamps")
  await io();

  const session = await getIronSession<SessionData>(cookieStore, sessionOptions);
  // Sesi yang sudah lewat batas absolutnya, atau dibuat sebelum batas ini ada
  // (tidak punya expiresAt), dianggap belum login. Akibatnya setelah deploy
  // ini semua user perlu login sekali lagi.
  const expired = !session.expiresAt || Date.now() > session.expiresAt;
  return {
    userId: expired ? undefined : session.userId,
    sessionVersion: expired ? undefined : session.sessionVersion,
    rememberMe: !expired && session.rememberMe === true,
  };
}

// createSession & destroySession menulis cookie. Next.js hanya mengizinkan
// menulis cookie di Server Action atau Route Handler, bukan saat render page.
//
// rememberMe = true: cookie bertahan 14 hari (Max-Age).
// rememberMe = false: session cookie. iron-session menganggap "maxAge: undefined"
// sebagai ttl 0 (segel tanpa batas), jadi batas waktunya dijaga oleh expiresAt.
export async function createSession(userId: string, sessionVersion: number, rememberMe: boolean) {
  await io();
  const options: SessionOptions = rememberMe
    ? sessionOptions
    : { ...sessionOptions, cookieOptions: { ...sessionOptions.cookieOptions, maxAge: undefined } };
  const session = await getIronSession<SessionData>(await cookies(), options);
  session.userId = userId;
  session.sessionVersion = sessionVersion;
  session.rememberMe = rememberMe;
  session.expiresAt = Date.now() + (rememberMe ? REMEMBER_ME_MS : SHORT_SESSION_MS);
  await session.save();
}

export async function destroySession() {
  await io();
  const session = await getIronSession<SessionData>(await cookies(), sessionOptions);
  session.destroy();
}
