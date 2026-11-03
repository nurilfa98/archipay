// GET /api/cron/reminders: menjalankan pengingat harian, dipanggil
// penjadwal (bukan oleh user):
// - pengingat uang muka lewat WhatsApp ke karyawan (features/reminders/run.ts)
// - ringkasan email harian ke Owner & Finance (features/digest/run.ts),
//   dijalankan SETELAH pengingat karena membaca reminder_logs yang baru dicatat
// - pengingat masa aktif langganan H-3/H-1 ke Owner lewat WhatsApp & email
//   (features/subscriptions/reminders.ts)
// - kabar foto acuan wajah baru yang menunggu persetujuan ke Owner lewat
//   WhatsApp, sekali per foto (features/attendance/reminders.ts)
// - hapus file nota yang lewat masa simpan (features/settlements/receipt-retention.ts)
// - hapus selfie absen yang lewat masa simpan (features/attendance/selfie-retention.ts)
// - kabar delegasi cuti/izin ke Admin HR (features/attendance/leave-reminders.ts)
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
import { notifyPendingFaces } from "@/features/attendance/reminders";
import { purgeExpiredSelfies } from "@/features/attendance/selfie-retention";
import { sendDailyDigests } from "@/features/digest/run";
import { runReminders } from "@/features/reminders/run";
import { purgeExpiredReceipts } from "@/features/settlements/receipt-retention";
import { sendSubscriptionReminders } from "@/features/subscriptions/reminders";
import { env } from "@/lib/env";

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
  const digests = await sendDailyDigests().catch((error: unknown) => {
    console.error("[cron] ringkasan email harian:", error);
    return null;
  });
  // Gagal kabar foto wajah tidak boleh menggagalkan tugas cron lainnya.
  const pendingFaces = await notifyPendingFaces().catch((error: unknown) => {
    console.error("[cron] kabar foto wajah menunggu persetujuan:", error);
    return null;
  });
  // Gagal hapus nota tidak boleh menggagalkan pengingat yang sudah terkirim.
  const receipts = await purgeExpiredReceipts().catch((error: unknown) => {
    console.error("[cron] hapus nota lewat masa simpan:", error);
    return null;
  });
  const delegatedLeaves = await notifyDelegatedLeaves().catch((error: unknown) => {
    console.error("[cron] kabar delegasi cuti/izin:", error);
    return null;
  });
  const selfies = await purgeExpiredSelfies().catch((error: unknown) => {
    console.error("[cron] hapus selfie absen lewat masa simpan:", error);
    return null;
  });
  return NextResponse.json(
    { ok: true, sent, digests, subscriptionReminders, pendingFaces, delegatedLeaves, receipts, selfies },
    { headers: { "Cache-Control": "no-store" } },
  );
}

// Perbandingan waktu-konstan agar secret tidak bisa ditebak dari lama respons.
function isAuthorized(header: string | null, secret: string) {
  const expected = Buffer.from(`Bearer ${secret}`);
  const actual = Buffer.from(header ?? "");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
