// Server Action menu Profil → "Perangkat yang sedang login" (BUSINESS-FLOW §2.1):
// mengeluarkan satu perangkat atau semua perangkat lain milik akun sendiri.
//
// - Hanya sesi MILIK AKUN YANG SEDANG LOGIN yang bisa dicabut (userId dicocokkan
//   di query), tidak pernah sesi orang lain, termasuk oleh Owner.
// - Wajib memasukkan password. Ini melindungi kasus yang paling mungkin: HP atau
//   laptop tertinggal dalam keadaan login. Orang yang memegangnya tidak bisa
//   mengeluarkan perangkat pemilik tanpa tahu password. (Tidak melindungi bila
//   passwordnya sendiri yang bocor; pemulihannya lewat reset password oleh Owner.)
// - Percobaan password salah dibatasi seperti login (login_attempts, kunci
//   "sesi:<userId>" agar tidak ikut mengunci login akun itu).
// - Perangkat ini sendiri keluar lewat tombol Keluar, bukan di sini.
//
// Perangkat yang dikeluarkan kembali ke halaman login pada permintaan
// berikutnya ke server (lib/auth/dal.ts memeriksa barisnya); halaman yang sudah
// tersimpan di browsernya bisa terlihat paling lama beberapa menit, tetapi
// tidak bisa mengubah data.

"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { logAudit } from "@/lib/audit";
import { verifyAccount } from "@/lib/auth/dal";
import { verifyPassword } from "@/lib/auth/password";
import { getSession } from "@/lib/auth/session";
import { getClientIp } from "@/lib/request";
import type { ActionResult } from "@/types/action-result";
import { findUserCredentials } from "./queries";
import { checkLoginRateLimit, recordLoginAttempt } from "./rate-limit";
import { revokeOtherSessionsOf, revokeSessionOf } from "./sessions";

type Actor = Awaited<ReturnType<typeof verifyAccount>>;

const NOT_FOUND = { success: false, message: "Perangkat tidak ditemukan atau sudah keluar." } as const;

// null = password benar. Selain itu hasil yang langsung dikembalikan ke form.
async function confirmPassword(actor: Actor, formData: FormData): Promise<ActionResult | null> {
  const ip = await getClientIp();
  const key = `sesi:${actor.id}`;
  const limit = await checkLoginRateLimit(key, ip);
  if (limit.limited) {
    return {
      success: false,
      message: `Terlalu banyak percobaan. Coba lagi dalam ${limit.retryAfterMinutes} menit.`,
    };
  }

  const password = formData.get("password");
  if (typeof password !== "string" || password.length === 0 || password.length > 200) {
    return {
      success: false,
      message: "Periksa kembali isian Anda.",
      fieldErrors: { password: ["Masukkan password Anda"] },
    };
  }
  const account = await findUserCredentials(actor.id);
  if (!account || !(await verifyPassword(password, account.passwordHash))) {
    await recordLoginAttempt(key, ip, false);
    return {
      success: false,
      message: "Periksa kembali isian Anda.",
      fieldErrors: { password: ["Password salah"] },
    };
  }
  return null;
}

export async function revokeSession(sessionId: string, formData: FormData): Promise<ActionResult> {
  const actor = await verifyAccount();
  const id = z.string().min(1).max(36).safeParse(sessionId);
  if (!id.success) return NOT_FOUND;
  const { sessionId: currentId } = await getSession();
  if (id.data === currentId) {
    return { success: false, message: "Untuk keluar dari perangkat ini, pakai tombol Keluar di menu pengguna." };
  }

  const failure = await confirmPassword(actor, formData);
  if (failure) return failure;

  const label = await revokeSessionOf(actor.id, id.data, "REVOKED");
  if (!label) return NOT_FOUND;

  await logAudit({
    companyId: actor.company?.id ?? null,
    userId: actor.id,
    action: "SESSION_REVOKED",
    entityName: "users",
    entityId: actor.id,
    newValues: { device: label },
    ipAddress: await getClientIp(),
  });
  revalidatePath("/profile");
  return { success: true, data: undefined };
}

export async function revokeOtherSessions(formData: FormData): Promise<ActionResult> {
  const actor = await verifyAccount();
  const { sessionId: currentId } = await getSession();

  const failure = await confirmPassword(actor, formData);
  if (failure) return failure;

  const count = await revokeOtherSessionsOf(actor.id, currentId ?? null, "REVOKED");
  if (count === 0) return { success: false, message: "Tidak ada perangkat lain yang sedang login." };

  await logAudit({
    companyId: actor.company?.id ?? null,
    userId: actor.id,
    action: "SESSION_REVOKED",
    entityName: "users",
    entityId: actor.id,
    newValues: { device: "Semua perangkat lain", devices: count },
    ipAddress: await getClientIp(),
  });
  revalidatePath("/profile");
  return { success: true, data: undefined };
}
