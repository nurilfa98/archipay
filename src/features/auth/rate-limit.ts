// Rate limiting login: membatasi jumlah percobaan login GAGAL dalam satu
// rentang waktu, untuk menghambat penebakan password (brute force).
//
// Ada dua batas sekaligus:
// - per email : melindungi satu akun dari ditebak berulang kali
// - per IP    : menghambat satu penyerang yang mencoba banyak email berbeda
//
// Data disimpan di PostgreSQL (tabel login_attempts), bukan di memori, supaya
// tetap berlaku walau server restart atau aplikasi berjalan di beberapa server.
// Untuk trafik sangat besar, alternatif umum adalah Redis (misal @upstash/ratelimit).
//
// Referensi:
// - node_modules/next/dist/docs/01-app/02-guides/data-security.md (bagian "Rate limiting")
// - https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html

import "server-only";
import { and, count, eq, gte, min, type SQL } from "drizzle-orm";
import { db } from "@/lib/db";
import { loginAttempts } from "@/lib/db/schema";

const WINDOW_MS = 15 * 60 * 1000; // 15 menit
const MAX_FAILURES_PER_EMAIL = 5;
const MAX_FAILURES_PER_IP = 20;

type RateLimitResult = { limited: false } | { limited: true; retryAfterMinutes: number };

export async function checkLoginRateLimit(email: string, ip: string | null): Promise<RateLimitResult> {
  const since = new Date(Date.now() - WINDOW_MS);

  // Hitung kegagalan dalam 15 menit terakhir + waktu kegagalan paling awal.
  // Waktu paling awal dipakai untuk menghitung kapan user boleh mencoba lagi.
  const countFailures = (filter: SQL) =>
    db
      .select({ total: count(), oldest: min(loginAttempts.createdAt) })
      .from(loginAttempts)
      .where(and(filter, eq(loginAttempts.success, false), gte(loginAttempts.createdAt, since)))
      .then(([row]) => row);

  const checks = [{ result: await countFailures(eq(loginAttempts.email, email)), max: MAX_FAILURES_PER_EMAIL }];

  // IP bisa null (misalnya saat development tanpa reverse proxy).
  if (ip) {
    checks.push({ result: await countFailures(eq(loginAttempts.ipAddress, ip)), max: MAX_FAILURES_PER_IP });
  }

  for (const { result, max } of checks) {
    if (result.total >= max && result.oldest) {
      const unlockAt = result.oldest.getTime() + WINDOW_MS;
      return { limited: true, retryAfterMinutes: Math.max(1, Math.ceil((unlockAt - Date.now()) / 60_000)) };
    }
  }

  return { limited: false };
}

export async function recordLoginAttempt(email: string, ip: string | null, success: boolean) {
  await db.insert(loginAttempts).values({ email, ipAddress: ip, success });
}
