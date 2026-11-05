// Email pemberitahuan keamanan akun (BUSINESS-FLOW §2.1), selalu dikirim ke
// email yang TERDAFTAR di akun (untuk perubahan email: ke email LAMA), supaya
// pemilik sah mengetahuinya walau penyerang menguasai sesi/password.
//
// Pesan sengaja tanpa data rahasia dan tanpa tautan "klik untuk ganti
// password": pemulihan akun dilakukan lewat Owner (atau admin ArchiPay untuk
// akun Owner), yang mereset password dan mengeluarkan semua perangkat.

import "server-only";
import { escapeHtml, type EmailMessage } from "@/lib/email";
import { env } from "@/lib/env";
import { formatDateTime } from "@/lib/dates";

type Recipient = {
  to: string;
  fullName: string;
  // Akun Owner dipulihkan oleh admin ArchiPay, akun lain oleh Owner.
  isOwner: boolean;
};

const helper = (isOwner: boolean) => (isOwner ? "admin ArchiPay" : "Owner perusahaan Anda");

function layout(heading: string, rows: [string, string][], footer: string[]) {
  const table = rows
    .map(
      ([label, value]) =>
        `<tr><td style="padding: 4px 12px 4px 0; color: #737373;">${escapeHtml(label)}</td><td>${escapeHtml(value)}</td></tr>`,
    )
    .join("");
  return `
<div style="font-family: Arial, sans-serif; font-size: 14px; line-height: 1.6; color: #171717;">
  <p>${escapeHtml(heading)}</p>
  <table style="border-collapse: collapse; margin: 16px 0;">${table}</table>
  ${footer.map((line) => `<p>${escapeHtml(line)}</p>`).join("")}
</div>`;
}

// Login dari browser/perangkat yang belum pernah dipakai akun ini.
export function newDeviceEmail(input: Recipient & { device: string; location: string | null; ip: string | null; when: Date }): EmailMessage {
  const profileUrl = new URL("/profile", env.NEXT_PUBLIC_APP_URL).toString();
  const rows: [string, string][] = [
    ["Perangkat", input.device],
    ["Lokasi (perkiraan)", input.location ?? "Tidak diketahui"],
    ["Alamat IP", input.ip ?? "Tidak diketahui"],
    ["Waktu", formatDateTime(input.when)],
  ];
  const footer = [
    `Jika ini Anda, abaikan email ini. Jika bukan: hubungi ${helper(input.isOwner)} untuk mereset password Anda, lalu keluarkan perangkat yang tidak dikenal di menu Profil → Perangkat yang sedang login (${profileUrl}).`,
    "Lokasi diperkirakan dari alamat IP sehingga bisa meleset, terutama di jaringan seluler.",
  ];
  const intro = `Halo ${input.fullName}, akun ArchiPay Anda baru saja login dari perangkat yang belum dikenal.`;
  return {
    to: input.to,
    subject: "Login baru ke akun ArchiPay Anda",
    text: [intro, "", ...rows.map(([label, value]) => `${label}: ${value}`), "", ...footer].join("\n"),
    html: layout(intro, rows, footer),
  };
}

// Dikirim ke email LAMA saat email akun diubah.
export function emailChangedEmail(
  input: Recipient & { oldEmail: string; newEmailMasked: string; byName: string; when: Date },
): EmailMessage {
  const rows: [string, string][] = [
    ["Email lama", input.oldEmail],
    ["Email baru", input.newEmailMasked],
    ["Diubah oleh", input.byName],
    ["Waktu", formatDateTime(input.when)],
  ];
  const footer = [
    "Mulai sekarang login dan password sementara dikirim ke email baru.",
    `Jika Anda tidak mengetahui perubahan ini, segera hubungi ${helper(input.isOwner)}.`,
  ];
  const intro = `Halo ${input.fullName}, email akun ArchiPay Anda diubah.`;
  return {
    to: input.to,
    subject: "Email akun ArchiPay Anda diubah",
    text: [intro, "", ...rows.map(([label, value]) => `${label}: ${value}`), "", ...footer].join("\n"),
    html: layout(intro, rows, footer),
  };
}

// Nomor WhatsApp akun diganti lewat verifikasi OTP.
export function phoneChangedEmail(input: Recipient & { newPhoneMasked: string; when: Date }): EmailMessage {
  const rows: [string, string][] = [
    ["Nomor WhatsApp baru", input.newPhoneMasked],
    ["Waktu", formatDateTime(input.when)],
  ];
  const footer = [`Jika Anda tidak mengetahui perubahan ini, segera hubungi ${helper(input.isOwner)}.`];
  const intro = `Halo ${input.fullName}, nomor WhatsApp akun ArchiPay Anda diubah.`;
  return {
    to: input.to,
    subject: "Nomor WhatsApp akun ArchiPay Anda diubah",
    text: [intro, "", ...rows.map(([label, value]) => `${label}: ${value}`), "", ...footer].join("\n"),
    html: layout(intro, rows, footer),
  };
}
