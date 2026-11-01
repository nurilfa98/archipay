// Batas laporan error: 1 laporan per user per 30 menit, agar WhatsApp admin
// platform tidak dibanjiri (misal user me-refresh halaman lalu menekan
// tombol lagi).
//
// Disimpan di memori server (tanpa tabel). Konsekuensinya: batas hilang bila
// server restart, dan bila aplikasi berjalan di beberapa server sekaligus
// setiap server punya hitungannya sendiri. Untuk laporan error ini cukup;
// bila perlu riwayat laporan, pindahkan ke tabel database.
//
// Disimpan di globalThis agar tidak ter-reset saat `pnpm dev` memuat ulang modul.

import "server-only";

export const ERROR_REPORT_WINDOW_MS = 30 * 60 * 1000;

const store = globalThis as unknown as { errorReportSentAt?: Map<string, number> };
const sentAt = (store.errorReportSentAt ??= new Map<string, number>());

// Waktu (ms) user boleh melapor lagi, atau null bila sudah boleh sekarang.
export function errorReportBlockedUntil(userId: string, now = Date.now()): number | null {
  const last = sentAt.get(userId);
  if (last === undefined) return null;
  const until = last + ERROR_REPORT_WINDOW_MS;
  if (until <= now) {
    sentAt.delete(userId);
    return null;
  }
  return until;
}

export function markErrorReportSent(userId: string, now = Date.now()) {
  // Bersihkan catatan lama supaya Map tidak terus membesar.
  for (const [id, time] of sentAt) {
    if (time + ERROR_REPORT_WINDOW_MS <= now) sentAt.delete(id);
  }
  sentAt.set(userId, now);
}

// Pengiriman gagal: catatan dihapus agar user boleh mencoba lagi.
export function clearErrorReport(userId: string) {
  sentAt.delete(userId);
}
