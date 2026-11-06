// GET /api/cron/reminders: menjalankan pengingat harian, dipanggil
// penjadwal (bukan oleh user):
// - pengingat uang muka lewat WhatsApp ke karyawan (features/reminders/run.ts)
// - ringkasan email harian ke Owner & Finance (features/digest/run.ts),
//   dijalankan SETELAH pengingat karena membaca reminder_logs yang baru dicatat
// - pengingat masa aktif langganan H-3/H-1 ke Owner lewat WhatsApp & email
//   (features/subscriptions/reminders.ts)
// - kabar foto acuan wajah baru yang menunggu persetujuan ke Owner lewat
//   WhatsApp, sekali per foto (features/attendance/reminders.ts)
// - penggantian yang belum dijawab karyawan > 3 hari dianggap diterima (features/settlements/reimbursement-ack.ts)
// - hapus file nota & bukti pengembalian yang lewat masa simpan (features/settlements/receipt-retention.ts)
// - kabar delegasi cuti/izin ke Admin HR (features/attendance/leave-reminders.ts)
// - hapus foto acuan wajah yang ditolak (features/attendance/face-retention.ts)
// - hapus catatan error (error_logs) yang lewat masa simpan (features/error-logs/queries.ts)
// - hapus riwayat perangkat login yang sudah kedaluwarsa > 90 hari (features/auth/sessions.ts)
//
// Keamanan: wajib header `Authorization: Bearer <CRON_SECRET>`. Vercel Cron
// mengirim header ini otomatis bila env CRON_SECRET diisi (jadwal di
// vercel.json). Di hosting lain, pakai penjadwal apa pun (cron server,
// cron-job.org, dll) yang memanggil URL ini dengan header tersebut.
//
// Route ini dikecualikan dari cek login di proxy.ts (tidak ada cookie).
//
// Referensi:
// - https://vercel.com/docs/cron-jobs/manage-cron-jobs#securing-cron-jobs
// - node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/route.md

import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { notifyDelegatedLeaves } from "@/features/attendance/leave-reminders";
import { purgeRejectedFaces } from "@/features/attendance/face-retention";
import { notifyPendingFaces } from "@/features/attendance/reminders";
import { sendDailyDigests } from "@/features/digest/run";
import { purgeOldSessions } from "@/features/auth/sessions";
import { runReminders } from "@/features/reminders/run";
import { autoConfirmReimbursements } from "@/features/settlements/reimbursement-ack";
import { purgeOldErrorLogs } from "@/features/error-logs/queries";
import { purgeExpiredProofs, purgeExpiredReceipts } from "@/features/settlements/receipt-retention";
import { sendSubscriptionReminders } from "@/features/subscriptions/reminders";
import { env } from "@/lib/env";
import { logError } from "@/lib/error-log";

export async function GET(request: Request) {
  if (!env.CRON_SECRET) {
    return NextResponse.json({ error: "CRON_SECRET belum diatur" }, { status: 503 });
  }
  if (!isAuthorized(request.headers.get("authorization"), env.CRON_SECRET)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sent = await runReminders();
  const subscriptionReminders = await sendSubscriptionReminders();
  // Gagal ringkasan email tidak boleh menggagalkan tugas cron lainnya.
  const digests = await sendDailyDigests().catch(async (error: unknown) => {
    await logError(error, { source: "CRON", action: "ringkasan email harian" });
    return null;
  });
  // Gagal kabar foto wajah tidak boleh menggagalkan tugas cron lainnya.
  const pendingFaces = await notifyPendingFaces().catch(async (error: unknown) => {
    await logError(error, { source: "CRON", action: "kabar foto wajah menunggu persetujuan" });
    return null;
  });
  // Gagal hapus nota tidak boleh menggagalkan pengingat yang sudah terkirim.
  const receipts = await purgeExpiredReceipts().catch(async (error: unknown) => {
    await logError(error, { source: "CRON", action: "hapus nota lewat masa simpan" });
    return null;
  });
  const reimbursements = await autoConfirmReimbursements().catch(async (error: unknown) => {
    await logError(error, { source: "CRON", action: "konfirmasi otomatis penggantian" });
    return null;
  });
  const proofs = await purgeExpiredProofs().catch(async (error: unknown) => {
    await logError(error, { source: "CRON", action: "hapus bukti pengembalian lewat masa simpan" });
    return null;
  });
  const delegatedLeaves = await notifyDelegatedLeaves().catch(async (error: unknown) => {
    await logError(error, { source: "CRON", action: "kabar delegasi cuti/izin" });
    return null;
  });
  const rejectedFaces = await purgeRejectedFaces().catch(async (error: unknown) => {
    await logError(error, { source: "CRON", action: "hapus foto wajah ditolak" });
    return null;
  });
  const errorLogs = await purgeOldErrorLogs().catch(async (error: unknown) => {
    await logError(error, { source: "CRON", action: "hapus catatan error lama" });
    return null;
  });
  const sessions = await purgeOldSessions().catch(async (error: unknown) => {
    await logError(error, { source: "CRON", action: "hapus riwayat perangkat login" });
    return null;
  });
  return NextResponse.json(
    { ok: true, sent, digests, subscriptionReminders, pendingFaces, delegatedLeaves, receipts, proofs, reimbursements, rejectedFaces, errorLogs, sessions },
    { headers: { "Cache-Control": "no-store" } },
  );
}

// Perbandingan waktu-konstan agar secret tidak bisa ditebak dari lama respons.
function isAuthorized(header: string | null, secret: string) {
  const expected = Buffer.from(`Bearer ${secret}`);
  const actual = Buffer.from(header ?? "");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
