// Server Action tombol "Hubungi admin platform" di halaman error
// (components/status-page/error-view.tsx).
//
// - Hanya user yang login. Status dicek dari cookie session saja (tanpa
//   database), karena halaman error bisa muncul justru saat database bermasalah.
// - Pesan WhatsApp dikirim ke nomor admin di Pengaturan platform
//   (platform_settings.admin_phone), berisi identitas pelapor, halaman, kode
//   error (digest, sama dengan yang tercatat di log server), dan pesannya.
// - Dibatasi 1 laporan per user per 30 menit (rate-limit.ts).
//
// Data dari browser (halaman, pesan, digest) tidak dipercaya: divalidasi dan
// dipotong panjangnya sebelum masuk pesan WhatsApp.

"use server";

import { headers } from "next/headers";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/dal";
import { ROLE_LABELS } from "@/lib/auth/roles";
import { getSession } from "@/lib/auth/session";
import { PRODUCT_NAME } from "@/lib/brand";
import { formatDateTime } from "@/lib/dates";
import { env } from "@/lib/env";
import { getPlatformSettings } from "@/lib/platform-settings";
import { sendWhatsApp } from "@/lib/whatsapp";
import type { ActionResult } from "@/types/action-result";
import { clearErrorReport, errorReportBlockedUntil, markErrorReportSent } from "./rate-limit";

export type ErrorReportStatus = { canReport: boolean; alreadyReported: boolean };

// Dipanggil saat halaman error tampil: tombol hanya muncul untuk user login,
// dan diganti keterangan "sudah dilaporkan" bila masih dalam 30 menit.
export async function getErrorReportStatus(): Promise<ErrorReportStatus> {
  const { userId } = await getSession();
  if (!userId) return { canReport: false, alreadyReported: false };
  return { canReport: true, alreadyReported: errorReportBlockedUntil(userId) !== null };
}

const reportSchema = z.object({
  path: z.string().trim().startsWith("/").max(500),
  digest: z.string().trim().max(100).optional(),
  message: z.string().trim().max(2000).optional(),
});

export type ErrorReportInput = z.input<typeof reportSchema>;

export async function reportError(input: ErrorReportInput): Promise<ActionResult> {
  const { userId } = await getSession();
  if (!userId) return { success: false, message: "Silakan login terlebih dahulu." };

  const parsed = reportSchema.safeParse(input);
  if (!parsed.success) return { success: false, message: "Data laporan tidak valid." };

  if (errorReportBlockedUntil(userId) !== null) {
    return {
      success: false,
      message: "Laporan Anda sudah diterima admin platform. Anda bisa melapor lagi setelah 30 menit.",
    };
  }
  // Dicatat SEBELUM mengirim agar dua klik yang hampir bersamaan tidak
  // mengirim dua pesan; dibatalkan bila pengiriman gagal.
  markErrorReportSent(userId);

  try {
    const [user, settings] = await Promise.all([getCurrentUser(), getPlatformSettings()]);
    if (!user) throw new Error("Session tidak valid");
    if (!settings.adminPhone) {
      clearErrorReport(userId);
      return { success: false, message: "Kontak admin platform belum diatur. Hubungi admin lewat jalur lain." };
    }

    const userAgent = (await headers()).get("user-agent")?.slice(0, 200) ?? "-";
    const { path, digest, message } = parsed.data;
    const text = [
      `*Laporan error ${PRODUCT_NAME}*`,
      "",
      `Pelapor: ${user.fullName} (${user.email})`,
      `Role: ${user.roles.map((role) => ROLE_LABELS[role]).join(", ") || "-"}`,
      `Perusahaan: ${user.company?.name ?? "-"}`,
      `Waktu: ${formatDateTime(new Date())}`,
      `Halaman: ${new URL(path, env.NEXT_PUBLIC_APP_URL).toString()}`,
      `Kode error: ${digest || "-"}`,
      `Pesan: ${message ? message.slice(0, 500) : "-"}`,
      `Perangkat: ${userAgent}`,
      "",
      "Cari kode error di log server untuk detail lengkapnya.",
    ].join("\n");

    const sent = await sendWhatsApp({ to: settings.adminPhone, text });
    if (!sent) throw new Error("WhatsApp gagal dikirim");
    return { success: true, data: undefined };
  } catch (error) {
    console.error("[error-report] laporan gagal dikirim:", error);
    // Boleh dicoba lagi karena pesannya memang belum terkirim.
    clearErrorReport(userId);
    return { success: false, message: "Laporan gagal dikirim. Coba lagi beberapa saat lagi." };
  }
}
