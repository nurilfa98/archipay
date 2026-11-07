// Server Action verifikasi nomor WhatsApp dengan kode OTP (6 angka) yang
// dikirim lewat WhatsApp. Dipakai halaman /verify-phone:
// - wajib untuk user company yang belum punya nomor terverifikasi
//   (lib/auth/dal.ts mengarahkan ke sana), dan
// - saat user mengganti nomornya sendiri dari menu Profil.
//
// Nomor di tabel users hanya berubah setelah kode cocok, jadi nomor yang
// salah ketik tidak pernah tersimpan. Hemat kuota WhatsApp & anti-spam:
// kode berlaku 5 menit, kirim ulang tiap 60 detik, maks. 3 kode per hari,
// maks. 5 kali coba per kode.
//
// Jeda & batas harian dicek ATOMIK saat menyimpan kode (upsert bersyarat),
// bukan hanya dari hasil baca sebelumnya. Tanpa itu, dua permintaan yang
// datang hampir bersamaan (tombol tertekan dua kali, jaringan HP lambat) sama-
// sama lolos cek dan OTP terkirim 2x, terutama saat pertama mendaftar karena
// barisnya belum ada.
//
// Memakai getCurrentUser(), bukan verifyAccount(), karena verifyAccount()
// justru mengarahkan user yang belum terverifikasi ke halaman ini.

"use server";

import { createHash, randomInt, timingSafeEqual } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { after } from "next/server";
import { z } from "zod";
import { logAudit } from "@/lib/audit";
import { getCurrentUser } from "@/lib/auth/dal";
import { zonedDateString } from "@/lib/dates";
import { db } from "@/lib/db";
import { phoneVerifications, users } from "@/lib/db/schema";
import { sendEmail } from "@/lib/email";
import { normalizeIndonesianPhone } from "@/lib/phone";
import { getClientIp } from "@/lib/request";
import { sendWhatsApp } from "@/lib/whatsapp";
import type { ActionResult } from "@/types/action-result";
import { maskPhone } from "./device-info";
import { phoneChangedEmail } from "./emails";

const CODE_TTL_MS = 5 * 60 * 1000;
const RESEND_COOLDOWN_MS = 60 * 1000;
const MAX_SENDS_PER_DAY = 3;
const MAX_ATTEMPTS = 5;

async function getVerifiableUser() {
  const user = await getCurrentUser();
  // Superadmin tidak terikat company & tidak menerima notifikasi.
  if (!user || user.mustChangePassword || !user.company || user.roles.includes("SUPERADMIN")) return null;
  return user;
}

function hashCode(userId: string, code: string) {
  return createHash("sha256").update(`${userId}:${code}`).digest("hex");
}

export async function requestPhoneOtp(
  phoneInput: string,
): Promise<ActionResult<{ phone: string; cooldownSeconds: number }>> {
  const user = await getVerifiableUser();
  if (!user) return { success: false, message: "Sesi Anda berakhir. Silakan masuk lagi." };

  const phone = normalizeIndonesianPhone(z.string().max(30).catch("").parse(phoneInput));
  if (!phone) {
    return {
      success: false,
      message: "Periksa kembali isian Anda.",
      fieldErrors: { phoneNumber: ["Nomor WhatsApp tidak valid, contoh: 0812-3456-7890"] },
    };
  }

  const now = new Date();
  const today = zonedDateString(now);
  const [existing] = await db.select().from(phoneVerifications).where(eq(phoneVerifications.userId, user.id)).limit(1);

  if (existing) {
    const wait = existing.lastSentAt.getTime() + RESEND_COOLDOWN_MS - now.getTime();
    if (wait > 0) {
      return { success: false, message: `Tunggu ${Math.ceil(wait / 1000)} detik sebelum meminta kode baru.` };
    }
    if (existing.sendDate === today && existing.sendCount >= MAX_SENDS_PER_DAY) {
      return {
        success: false,
        message: `Batas ${MAX_SENDS_PER_DAY} kode per hari tercapai. Coba lagi besok, atau periksa kembali nomor Anda.`,
      };
    }
  }

  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  const values = {
    phoneNumber: phone,
    codeHash: hashCode(user.id, code),
    expiresAt: new Date(now.getTime() + CODE_TTL_MS),
    attempts: 0,
    sendDate: today,
    lastSentAt: now,
  };
  // Baris baru: hitungan 1. Baris lama: hanya diganti bila jeda sudah lewat
  // dan batas harian belum tercapai (dicek database, aman dari balapan).
  // Tidak ada baris yang dikembalikan = permintaan lain baru saja mengirim.
  const cooldownCutoff = new Date(now.getTime() - RESEND_COOLDOWN_MS).toISOString();
  const saved = await db
    .insert(phoneVerifications)
    .values({ userId: user.id, ...values, sendCount: 1 })
    .onConflictDoUpdate({
      target: phoneVerifications.userId,
      set: {
        ...values,
        sendCount: sql`CASE WHEN ${phoneVerifications.sendDate} = ${today} THEN ${phoneVerifications.sendCount} + 1 ELSE 1 END`,
      },
      setWhere: sql`${phoneVerifications.lastSentAt} <= ${cooldownCutoff}::timestamptz
        AND (${phoneVerifications.sendDate} <> ${today} OR ${phoneVerifications.sendCount} < ${MAX_SENDS_PER_DAY})`,
    })
    .returning({ userId: phoneVerifications.userId });
  if (saved.length === 0) {
    return { success: false, message: "Kode baru saja dikirim. Periksa WhatsApp Anda, atau tunggu sebentar." };
  }

  const sent = await sendWhatsApp({
    to: phone,
    text:
      `Kode verifikasi ArchiPay Anda: *${code}*\n\n` +
      `Berlaku 5 menit. Jangan berikan kode ini kepada siapa pun, termasuk atasan atau admin.`,
  });
  if (!sent) {
    return {
      success: false,
      message: "Kode gagal dikirim ke WhatsApp. Pastikan nomor aktif di WhatsApp, lalu coba lagi.",
    };
  }
  return { success: true, data: { phone, cooldownSeconds: RESEND_COOLDOWN_MS / 1000 } };
}

export async function verifyPhoneOtp(
  codeInput: string,
  returnTo: "home" | "profile",
): Promise<ActionResult<{ redirectTo: string }>> {
  const user = await getVerifiableUser();
  if (!user) return { success: false, message: "Sesi Anda berakhir. Silakan masuk lagi." };

  const code = z
    .string()
    .regex(/^\d{6}$/)
    .safeParse(String(codeInput ?? "").replace(/\s/g, ""));
  if (!code.success) {
    return { success: false, message: "Periksa kembali isian Anda.", fieldErrors: { code: ["Isi 6 angka kode"] } };
  }

  const [pending] = await db.select().from(phoneVerifications).where(eq(phoneVerifications.userId, user.id)).limit(1);
  if (!pending || pending.expiresAt < new Date()) {
    return { success: false, message: "Kode sudah kedaluwarsa. Minta kode baru." };
  }
  if (pending.attempts >= MAX_ATTEMPTS) {
    return { success: false, message: "Terlalu banyak percobaan. Minta kode baru." };
  }

  const expected = Buffer.from(pending.codeHash, "hex");
  const actual = Buffer.from(hashCode(user.id, code.data), "hex");
  if (!timingSafeEqual(expected, actual)) {
    await db
      .update(phoneVerifications)
      .set({ attempts: pending.attempts + 1 })
      .where(eq(phoneVerifications.userId, user.id));
    const left = MAX_ATTEMPTS - pending.attempts - 1;
    return {
      success: false,
      message: "Periksa kembali isian Anda.",
      fieldErrors: { code: [left > 0 ? `Kode salah. Sisa ${left} kali percobaan.` : "Kode salah. Minta kode baru."] },
    };
  }

  const [before] = await db
    .select({ phoneNumber: users.phoneNumber })
    .from(users)
    .where(eq(users.id, user.id))
    .limit(1);
  const ip = await getClientIp();
  await db.transaction(async (tx) => {
    await tx
      .update(users)
      .set({ phoneNumber: pending.phoneNumber, phoneVerifiedAt: new Date() })
      .where(eq(users.id, user.id));
    await tx.delete(phoneVerifications).where(eq(phoneVerifications.userId, user.id));
    await logAudit(
      {
        companyId: user.company!.id,
        userId: user.id,
        action: "PHONE_VERIFIED",
        entityName: "users",
        entityId: user.id,
        oldValues: { phoneNumber: before?.phoneNumber ?? null },
        newValues: { phoneNumber: pending.phoneNumber },
        ipAddress: ip,
      },
      tx,
    );
  });

  // Nomor yang SUDAH terverifikasi diganti → beri tahu lewat email terdaftar,
  // agar pemilik tahu bila nomornya dipindah ke nomor lain tanpa sepengetahuannya.
  if (before?.phoneNumber && before.phoneNumber !== pending.phoneNumber) {
    after(() =>
      sendEmail(
        phoneChangedEmail({
          to: user.email,
          fullName: user.fullName,
          isOwner: user.roles.includes("OWNER"),
          newPhoneMasked: maskPhone(pending.phoneNumber),
          when: new Date(),
        }),
      ),
    );
  }

  // Tidak memakai revalidatePath + redirect(): itu me-render ulang
  // /verify-phone dulu (user sudah terverifikasi → tampil "Ganti nomor
  // WhatsApp") dan navigasi browser bisa memakai data user lama yang
  // di-cache di browser ('use cache: private', lib/auth/dal.ts). Form
  // memuat ulang halaman tujuan secara penuh (phone-verify-form.tsx).
  return { success: true, data: { redirectTo: returnTo === "profile" ? "/profile" : "/" } };
}
