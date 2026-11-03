// Pengingat otomatis harian lewat WhatsApp, dipanggil oleh cron
// (app/api/cron/reminders/route.ts), misalnya setiap pukul 08.00 WIB.
//
//   SETTLEMENT_DUE_SOON  besok batas unggah nota            → karyawan
//   SETTLEMENT_OVERDUE   batas unggah nota terlewati        → karyawan
//   RETURN_DUE_SOON      besok batas pengembalian sisa dana → karyawan
//   RETURN_OVERDUE       batas pengembalian terlewati       → karyawan
//                        (sisa masuk daftar Potong Gaji)
//
// Hemat kuota WhatsApp: Owner & Finance TIDAK dikirimi WhatsApp; yang lewat
// batas masuk ringkasan email harian mereka (features/digest, membaca
// reminder_logs). Pengingat untuk karyawan yang sama di satu jalannya cron
// digabung menjadi SATU pesan.
//
// "Sistem yang menagih, bukan Owner": pengingat dikirim otomatis agar Owner
// tidak perlu menagih secara manual.
//
// Setiap jenis pengingat hanya dikirim SEKALI per uang muka: barisnya
// dicatat di reminder_logs (unique advance_id + kind) SEBELUM pesan dikirim,
// sehingga cron yang berjalan dua kali tidak mengirim ganda. Bila semua
// pengiriman gagal (misal Fonnte bermasalah), catatannya dihapus lagi agar
// dicoba ulang di jadwal berikutnya.
//
// Status "lewat batas" sendiri tidak bergantung pada cron: halaman selalu
// menghitungnya dari tanggal. Cron HANYA mengirim pengingat.
//
// Multi-tenant: satu cron untuk semua company; company nonaktif dilewati.

import "server-only";
import { and, eq, inArray, lt, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { AWAITING_RECEIPT_STATUSES } from "@/features/advances/constants";
import { db } from "@/lib/db";
import { advanceLedgerEntries, advanceRequests, companies, reminderLogs, settlements, users } from "@/lib/db/schema";
import { env } from "@/lib/env";
import { sendWhatsApp } from "@/lib/whatsapp";
import { combinedReminderText, reminderText } from "./notifications";

export const REMINDER_KINDS = [
  "SETTLEMENT_DUE_SOON",
  "SETTLEMENT_OVERDUE",
  "RETURN_DUE_SOON",
  "RETURN_OVERDUE",
] as const;
export type ReminderKind = (typeof REMINDER_KINDS)[number];

export type ReminderCandidate = {
  companyId: string;
  advanceId: string;
  advanceNumber: string;
  advanceStatus: string;
  amount: number;
  recipientName: string;
  recipientPhone: string | null;
  settlementId: string | null;
  settlementNumber: string | null;
  dueAt: Date | null;
  balance: number;
};

const recipient = alias(users, "recipient");
const tz = env.APP_TIMEZONE;

// "Besok" menurut tanggal kalender zona waktu perusahaan (WIB), bukan UTC server.
const tomorrow = sql`((now() at time zone ${tz})::date + 1)`;

type Pending = { kind: ReminderKind; candidate: ReminderCandidate; link: string; logId: string };

export async function runReminders() {
  const summary: Record<ReminderKind, number> = {
    SETTLEMENT_DUE_SOON: 0,
    SETTLEMENT_OVERDUE: 0,
    RETURN_DUE_SOON: 0,
    RETURN_OVERDUE: 0,
  };

  // Kumpulkan dulu semua pengingat per nomor karyawan, lalu kirim satu pesan per orang.
  const byPhone = new Map<string, Pending[]>();
  for (const kind of REMINDER_KINDS) {
    for (const candidate of await listCandidates(kind)) {
      // Catat dulu; bila sudah ada (pernah dikirim), lewati. Karyawan tanpa
      // nomor WhatsApp tetap dicatat agar Owner melihatnya di ringkasan email.
      const [log] = await db
        .insert(reminderLogs)
        .values({ advanceId: candidate.advanceId, kind })
        .onConflictDoNothing()
        .returning({ id: reminderLogs.id });
      if (!log || !candidate.recipientPhone) continue;

      const link = new URL(
        candidate.settlementId ? `/settlements/${candidate.settlementId}` : `/advances/${candidate.advanceId}`,
        env.NEXT_PUBLIC_APP_URL,
      ).toString();
      byPhone.set(candidate.recipientPhone, [
        ...(byPhone.get(candidate.recipientPhone) ?? []),
        { kind, candidate, link, logId: log.id },
      ]);
    }
  }

  for (const [phone, items] of byPhone) {
    const name = items[0].candidate.recipientName;
    const text =
      items.length === 1
        ? reminderText(items[0].kind, items[0].candidate, name, items[0].link)
        : combinedReminderText(items, name);
    if (await sendWhatsApp({ to: phone, text })) {
      for (const item of items) summary[item.kind] += 1;
    } else {
      // Gagal terkirim → hapus catatan agar dicoba lagi di jadwal berikutnya.
      await db.delete(reminderLogs).where(inArray(reminderLogs.id, items.map((item) => item.logId)));
    }
  }
  return summary;
}

// Calon penerima per jenis pengingat. Karyawan nonaktif dan company nonaktif dilewati.
async function listCandidates(kind: ReminderKind): Promise<ReminderCandidate[]> {
  const isSettlement = kind === "SETTLEMENT_DUE_SOON" || kind === "SETTLEMENT_OVERDUE";
  const dueAt = isSettlement ? advanceRequests.settlementDueAt : settlements.returnDueAt;
  const timing =
    kind === "SETTLEMENT_DUE_SOON" || kind === "RETURN_DUE_SOON"
      ? sql`(${dueAt} at time zone ${tz})::date = ${tomorrow}`
      : lt(dueAt, sql`now()`);
  const status = isSettlement
    ? inArray(advanceRequests.status, [...AWAITING_RECEIPT_STATUSES])
    : eq(advanceRequests.status, "RETURN_PENDING");

  const rows = await db
    .select({
      companyId: advanceRequests.companyId,
      advanceId: advanceRequests.id,
      advanceNumber: advanceRequests.number,
      advanceStatus: advanceRequests.status,
      amount: advanceRequests.amount,
      recipientName: recipient.fullName,
      recipientPhone: recipient.phoneNumber,
      settlementId: settlements.id,
      settlementNumber: settlements.number,
      dueAt,
      balance: sql`coalesce((select sum(${advanceLedgerEntries.amount}) from ${advanceLedgerEntries} where ${advanceLedgerEntries.advanceId} = ${advanceRequests.id}), 0)`.mapWith(
        Number,
      ),
    })
    .from(advanceRequests)
    .innerJoin(companies, eq(advanceRequests.companyId, companies.id))
    .innerJoin(recipient, eq(advanceRequests.recipientId, recipient.id))
    .leftJoin(settlements, eq(settlements.advanceId, advanceRequests.id))
    .where(and(status, timing, eq(recipient.isActive, true), eq(companies.isActive, true)))
    .limit(500);
  return rows;
}
