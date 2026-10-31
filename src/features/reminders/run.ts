// Pengingat otomatis harian lewat WhatsApp, dipanggil oleh cron
// (app/api/cron/reminders/route.ts), misalnya setiap pukul 08.00 WIB.
//
//   SETTLEMENT_DUE_SOON  besok batas unggah nota            → karyawan
//   SETTLEMENT_OVERDUE   batas unggah nota terlewati        → karyawan + OWNER
//   RETURN_DUE_SOON      besok batas pengembalian sisa dana → karyawan
//   RETURN_OVERDUE       batas pengembalian terlewati       → karyawan + OWNER
//                        (sisa masuk daftar Potong Gaji)
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
// Multi-tenant: satu cron untuk semua company. Pengingat ke Owner dikirim ke
// Owner company pemilik uang muka itu saja; company nonaktif dilewati.

import "server-only";
import { and, eq, inArray, lt, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { AWAITING_RECEIPT_STATUSES } from "@/features/advances/constants";
import { getOwnerContacts, type Contact } from "@/features/advances/queries";
import { db } from "@/lib/db";
import { advanceLedgerEntries, advanceRequests, companies, reminderLogs, settlements, users } from "@/lib/db/schema";
import { env } from "@/lib/env";
import { sendWhatsApp } from "@/lib/whatsapp";
import { reminderText, type ReminderAudience } from "./notifications";

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

const AUDIENCE: Record<ReminderKind, ReminderAudience[]> = {
  SETTLEMENT_DUE_SOON: ["employee"],
  SETTLEMENT_OVERDUE: ["employee", "owner"],
  RETURN_DUE_SOON: ["employee"],
  RETURN_OVERDUE: ["employee", "owner"],
};

export async function runReminders() {
  // Owner per company, dibaca sekali per company per jalannya cron.
  const ownersByCompany = new Map<string, Contact[]>();
  const ownersOf = async (companyId: string) => {
    const cached = ownersByCompany.get(companyId);
    if (cached) return cached;
    const owners = await getOwnerContacts(companyId, []);
    ownersByCompany.set(companyId, owners);
    return owners;
  };
  const summary: Record<ReminderKind, number> = {
    SETTLEMENT_DUE_SOON: 0,
    SETTLEMENT_OVERDUE: 0,
    RETURN_DUE_SOON: 0,
    RETURN_OVERDUE: 0,
  };

  for (const kind of REMINDER_KINDS) {
    for (const candidate of await listCandidates(kind)) {
      // Catat dulu; bila sudah ada (pernah dikirim), lewati.
      const [log] = await db
        .insert(reminderLogs)
        .values({ advanceId: candidate.advanceId, kind })
        .onConflictDoNothing()
        .returning({ id: reminderLogs.id });
      if (!log) continue;

      const link = new URL(
        candidate.settlementId ? `/settlements/${candidate.settlementId}` : `/advances/${candidate.advanceId}`,
        env.NEXT_PUBLIC_APP_URL,
      ).toString();
      const owners = AUDIENCE[kind].includes("owner") ? await ownersOf(candidate.companyId) : [];
      const messages = AUDIENCE[kind].flatMap((audience) =>
        audience === "employee"
          ? candidate.recipientPhone
            ? [{ to: candidate.recipientPhone, text: reminderText(kind, audience, candidate, candidate.recipientName, link) }]
            : []
          : owners
              .filter((owner) => owner.phoneNumber)
              .map((owner) => ({ to: owner.phoneNumber!, text: reminderText(kind, audience, candidate, owner.fullName, link) })),
      );

      const results = await Promise.allSettled(messages.map((message) => sendWhatsApp(message)));
      const sent = results.some((result) => result.status === "fulfilled" && result.value);
      if (sent) summary[kind] += 1;
      // Semua gagal terkirim → hapus catatan agar dicoba lagi di jadwal berikutnya.
      // (Tanpa nomor WhatsApp sama sekali: tidak dicoba ulang.)
      else if (messages.length > 0) await db.delete(reminderLogs).where(eq(reminderLogs.id, log.id));
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
