// Koneksi database. Hanya file di dalam DAL (lib/auth/dal.ts, features/*/queries.ts,
// features/*/actions.ts) yang boleh meng-import `db`.
//
// Referensi:
// - https://orm.drizzle.team/docs/get-started-postgresql (driver postgres.js)
// - node_modules/next/dist/docs/01-app/02-guides/data-security.md

import "server-only";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "@/lib/env";
import * as schema from "./schema";

// Saat `pnpm dev`, Next.js memuat ulang modul setiap ada file yang berubah.
// Kalau koneksi dibuat langsung di sini, setiap reload membuka koneksi baru
// sampai PostgreSQL menolak ("too many connections"). Menyimpan client di
// globalThis membuat koneksi lama dipakai ulang. Di production modul hanya
// dimuat sekali, jadi trik ini tidak diperlukan.
const globalForDb = globalThis as unknown as { pgClient?: ReturnType<typeof postgres> };

// postgres() belum langsung terhubung; koneksi baru dibuka saat query pertama.
const client = globalForDb.pgClient ?? postgres(env.DATABASE_URL);

if (env.NODE_ENV !== "production") globalForDb.pgClient = client;

export const db = drizzle({ client, schema });

// Error "unique violation" dari PostgreSQL (kode 23505), misalnya email sudah
// dipakai user lain. Drizzle membungkus error asli postgres.js di `cause`.
// Daftar kode: https://www.postgresql.org/docs/current/errcodes-appendix.html
export function isUniqueViolation(error: unknown) {
  const code = (e: unknown) => (e as { code?: unknown } | null)?.code;
  return code(error) === "23505" || code((error as { cause?: unknown } | null)?.cause) === "23505";
}
