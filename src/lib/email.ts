// Pengirim email lewat Resend (https://resend.com).
//
// Dipanggil langsung lewat REST API dengan fetch, tanpa library tambahan,
// karena kebutuhannya hanya satu endpoint: POST /emails.
//
// Saat development tanpa RESEND_API_KEY, email tidak dikirim melainkan
// ditampilkan di terminal `pnpm dev`, supaya fitur tetap bisa dicoba.
//
// Referensi:
// - https://resend.com/docs/api-reference/emails/send-email
// - node_modules/next/dist/docs/01-app/02-guides/environment-variables.md

import "server-only";
import { env } from "@/lib/env";

export type EmailMessage = {
  to: string;
  subject: string;
  text: string; // versi teks polos, untuk aplikasi email yang tidak menampilkan HTML
  html: string;
};

// Mengembalikan true bila email diterima oleh Resend. Gagal kirim TIDAK
// melempar error: pemanggil memutuskan sendiri apa yang ditampilkan ke user,
// karena data (misalnya user baru) biasanya sudah tersimpan.
export async function sendEmail(message: EmailMessage): Promise<boolean> {
  if (!env.RESEND_API_KEY || !env.EMAIL_FROM) {
    if (env.NODE_ENV === "production") {
      console.error("[email] RESEND_API_KEY / EMAIL_FROM belum diisi, email tidak terkirim");
      return false;
    }
    // Hanya di development: isi email (termasuk password sementara) tampil di
    // terminal. Jangan pernah melakukan ini di production.
    console.info(`[email:dev] Kepada: ${message.to}\nSubjek: ${message.subject}\n\n${message.text}`);
    return true;
  }

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: env.EMAIL_FROM,
        to: [message.to],
        subject: message.subject,
        text: message.text,
        html: message.html,
      }),
      // Jangan biarkan Server Action menggantung bila Resend lambat.
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      console.error(`[email] Resend menolak (${response.status}): ${await response.text()}`);
      return false;
    }
    return true;
  } catch (error) {
    console.error("[email] gagal menghubungi Resend:", error);
    return false;
  }
}

// Teks dari user (nama, dll) wajib di-escape sebelum dimasukkan ke HTML email,
// agar tidak bisa menyisipkan tag/link palsu.
export function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
