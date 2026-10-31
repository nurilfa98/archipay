// GET /api/cron/reminders: menjalankan pengingat harian, dipanggil
// penjadwal (bukan oleh user):
// - pengingat uang muka lewat WhatsApp (features/reminders/run.ts)
// - pengingat masa aktif langganan H-3/H-1 ke Owner lewat WhatsApp & email
//   (features/subscriptions/reminders.ts)
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
import { runReminders } from "@/features/reminders/run";
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
  return NextResponse.json({ ok: true, sent, subscriptionReminders }, { headers: { "Cache-Control": "no-store" } });
}

// Perbandingan waktu-konstan agar secret tidak bisa ditebak dari lama respons.
function isAuthorized(header: string | null, secret: string) {
  const expected = Buffer.from(`Bearer ${secret}`);
  const actual = Buffer.from(header ?? "");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
