// Perangkat yang sedang login (BUSINESS-FLOW §2.1): satu baris user_sessions
// per login. Dipakai Server Action login/logout/ganti password, menu Profil
// (daftar & keluarkan perangkat), dan cron pembersih.
//
// Tidak ada pembatasan satu perangkat: pengguna boleh login di HP dan laptop
// sekaligus. Yang dijaga: pengguna melihat semua perangkatnya dan bisa
// mengeluarkan yang tidak dikenal; login dari perangkat baru memicu email.
//
// Ditulis hanya saat login, logout, dan pencabutan (bukan di setiap request)
// agar ringan di database gratis.

import "server-only";
import { and, desc, eq, gt, inArray, isNull, lt, ne } from "drizzle-orm";
import { io } from "next/cache";
import { db } from "@/lib/db";
import { userSessions } from "@/lib/db/schema";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Executor = typeof db | Transaction;

// LOGOUT = keluar sendiri; REVOKED = dikeluarkan dari perangkat lain;
// PASSWORD = password diganti/di-reset; REPLACED = login ulang di browser yang
// sama; LIMIT = melewati batas perangkat aktif.
export type SessionRevokeReason = "LOGOUT" | "REVOKED" | "PASSWORD" | "REPLACED" | "LIMIT";

// Batas perangkat aktif per akun; yang paling lama otomatis dikeluarkan.
// Mencegah tabel membengkak dan membatasi akun yang dibagikan ke banyak orang.
export const MAX_ACTIVE_SESSIONS = 10;
const RETENTION_DAYS = 90;

export type OpenSessionInput = {
  userId: string;
  deviceId: string;
  deviceLabel: string;
  ipAddress: string | null;
  location: string | null;
  expiresAt: Date;
};

// Mencatat login baru. `isNewDevice` = akun ini sudah pernah login dari
// perangkat lain, tetapi belum dari browser ini → kirim email peringatan.
// Login pertama kali (belum ada riwayat) bukan "perangkat baru".
export async function openSession(input: OpenSessionInput) {
  const sessionId = crypto.randomUUID();
  const now = new Date();

  const isNewDevice = await db.transaction(async (tx) => {
    const known = await tx
      .selectDistinct({ deviceId: userSessions.deviceId })
      .from(userSessions)
      .where(eq(userSessions.userId, input.userId));
    const isNew = known.length > 0 && !known.some((row) => row.deviceId === input.deviceId);

    // Login ulang dari browser yang sama menggantikan sesi lamanya (cookie
    // lama sudah tertimpa, barisnya tidak boleh jadi "hantu" di daftar).
    await tx
      .update(userSessions)
      .set({ revokedAt: now, revokedReason: "REPLACED" })
      .where(
        and(
          eq(userSessions.userId, input.userId),
          eq(userSessions.deviceId, input.deviceId),
          isNull(userSessions.revokedAt),
        ),
      );

    await tx.insert(userSessions).values({ id: sessionId, ...input });

    const active = await tx
      .select({ id: userSessions.id })
      .from(userSessions)
      .where(and(eq(userSessions.userId, input.userId), isNull(userSessions.revokedAt), gt(userSessions.expiresAt, now)))
      .orderBy(desc(userSessions.createdAt));
    const surplus = active.slice(MAX_ACTIVE_SESSIONS).map((row) => row.id);
    if (surplus.length > 0) {
      await tx
        .update(userSessions)
        .set({ revokedAt: now, revokedReason: "LIMIT" })
        .where(inArray(userSessions.id, surplus));
    }
    return isNew;
  });

  return { sessionId, isNewDevice };
}

// Mencabut satu sesi milik `userId` (bukan sesi orang lain). Mengembalikan
// label perangkatnya, atau null bila tidak ada / sudah dicabut.
export async function revokeSessionOf(
  userId: string,
  sessionId: string,
  reason: SessionRevokeReason,
  executor: Executor = db,
) {
  const [row] = await executor
    .update(userSessions)
    .set({ revokedAt: new Date(), revokedReason: reason })
    .where(and(eq(userSessions.id, sessionId), eq(userSessions.userId, userId), isNull(userSessions.revokedAt)))
    .returning({ deviceLabel: userSessions.deviceLabel });
  return row?.deviceLabel ?? null;
}

// Sesi ini masih berlaku (ada, belum dicabut, belum kedaluwarsa)? Dipakai
// aksi yang tidak lewat DAL, mis. ganti password.
export async function isSessionActive(userId: string, sessionId: string) {
  const [row] = await db
    .select({ id: userSessions.id })
    .from(userSessions)
    .where(
      and(
        eq(userSessions.id, sessionId),
        eq(userSessions.userId, userId),
        isNull(userSessions.revokedAt),
        gt(userSessions.expiresAt, new Date()),
      ),
    )
    .limit(1);
  return !!row;
}

// Batas waktu baru untuk sesi yang cookie-nya dibuat ulang (ganti password).
export async function extendSession(sessionId: string, expiresAt: Date, executor: Executor = db) {
  await executor.update(userSessions).set({ expiresAt }).where(eq(userSessions.id, sessionId));
}

// Semua sesi aktif `userId` selain `keepSessionId` (kosongkan = semua).
export async function revokeOtherSessionsOf(
  userId: string,
  keepSessionId: string | null,
  reason: SessionRevokeReason,
  executor: Executor = db,
) {
  const rows = await executor
    .update(userSessions)
    .set({ revokedAt: new Date(), revokedReason: reason })
    .where(
      and(
        eq(userSessions.userId, userId),
        isNull(userSessions.revokedAt),
        keepSessionId ? ne(userSessions.id, keepSessionId) : undefined,
      ),
    )
    .returning({ id: userSessions.id });
  return rows.length;
}

// Perangkat aktif milik satu akun, terbaru dulu.
export async function listActiveSessions(userId: string) {
  await io();
  return db
    .select({
      id: userSessions.id,
      deviceLabel: userSessions.deviceLabel,
      ipAddress: userSessions.ipAddress,
      location: userSessions.location,
      createdAt: userSessions.createdAt,
    })
    .from(userSessions)
    .where(and(eq(userSessions.userId, userId), isNull(userSessions.revokedAt), gt(userSessions.expiresAt, new Date())))
    .orderBy(desc(userSessions.createdAt));
}

// Dipanggil cron harian: sesi yang sudah kedaluwarsa lebih dari 90 hari dihapus
// (selama itu barisnya dipakai mengenali "perangkat yang sudah dikenal").
export async function purgeOldSessions(now = new Date()) {
  const cutoff = new Date(now.getTime() - RETENTION_DAYS * 24 * 60 * 60 * 1000);
  const rows = await db.delete(userSessions).where(lt(userSessions.expiresAt, cutoff)).returning({ id: userSessions.id });
  return rows.length;
}
