// Pengirim pesan WhatsApp lewat Fonnte (https://fonnte.com).
//
// Polanya sama dengan lib/email.ts: satu fungsi, dipanggil lewat REST API
// dengan fetch, dan tanpa FONNTE_TOKEN saat development pesan hanya
// ditampilkan di terminal `pnpm dev`.
//
// Catatan Fonnte:
// - Fonnte memakai WhatsApp biasa (bukan WhatsApp Business API resmi). Pakai
//   nomor khusus untuk aplikasi, jangan nomor pribadi, karena nomor yang
//   dianggap spam bisa diblokir WhatsApp.
// - Header Authorization berisi token LANGSUNG, tanpa awalan "Bearer".
// - Pesan diterima Fonnte lalu masuk antrean; "berhasil" di sini berarti
//   Fonnte menerima pesannya, belum tentu sudah sampai di HP penerima.
//
// Referensi: https://docs.fonnte.com/api-send-message/

import "server-only";
import { env } from "@/lib/env";

export type WhatsAppMessage = {
  to: string; // nomor format 62..., lihat lib/phone.ts
  text: string;
};

// Mengembalikan true bila pesan diterima Fonnte. Gagal kirim TIDAK melempar
// error: notifikasi bersifat pelengkap, data utamanya sudah tersimpan.
export async function sendWhatsApp(message: WhatsAppMessage): Promise<boolean> {
  if (!env.FONNTE_TOKEN) {
    if (env.NODE_ENV === "production") {
      console.error("[whatsapp] FONNTE_TOKEN belum diisi, pesan tidak terkirim");
      return false;
    }
    console.info(`[whatsapp:dev] Kepada: ${message.to}\n\n${message.text}`);
    return true;
  }

  try {
    // Fonnte menerima form data (bukan JSON body).
    const body = new FormData();
    body.set("target", message.to);
    body.set("message", message.text);
    body.set("countryCode", "62");

    const response = await fetch("https://api.fonnte.com/send", {
      method: "POST",
      headers: { Authorization: env.FONNTE_TOKEN },
      body,
      signal: AbortSignal.timeout(10_000),
    });

    // Fonnte membalas HTTP 200 juga saat gagal; penandanya ada di field
    // `status` (kadang ditulis `Status`) dan alasannya di `reason`.
    const result = (await response.json().catch(() => null)) as {
      status?: boolean;
      Status?: boolean;
      reason?: string;
    } | null;
    const ok = response.ok && (result?.status ?? result?.Status) === true;
    if (!ok) {
      console.error(`[whatsapp] Fonnte menolak (${response.status}): ${result?.reason ?? "tanpa alasan"}`);
    }
    return ok;
  } catch (error) {
    console.error("[whatsapp] gagal menghubungi Fonnte:", error);
    return false;
  }
}
