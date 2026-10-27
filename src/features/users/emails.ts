// Isi email kredensial login (akun baru & reset password).
//
// Email berisi password sementara. Risikonya diperkecil dengan:
// - password hanya berlaku sampai login pertama (wajib diganti)
// - password tidak pernah ditampilkan ke OWNER, hanya dikirim ke email ini

import "server-only";
import { escapeHtml, type EmailMessage } from "@/lib/email";
import { env } from "@/lib/env";

type CredentialsEmailInput = {
  fullName: string;
  email: string;
  temporaryPassword: string;
  kind: "created" | "reset";
};

export function credentialsEmail(input: CredentialsEmailInput): EmailMessage {
  const loginUrl = new URL("/login", env.NEXT_PUBLIC_APP_URL).toString();
  const intro =
    input.kind === "created"
      ? "Akun ArchiPay Anda sudah dibuat."
      : "Password akun ArchiPay Anda telah di-reset oleh admin.";
  const subject = input.kind === "created" ? "Akun ArchiPay Anda" : "Password ArchiPay Anda di-reset";

  const text = [
    `Halo ${input.fullName},`,
    "",
    intro,
    "",
    `Alamat: ${loginUrl}`,
    `Email: ${input.email}`,
    `Password sementara: ${input.temporaryPassword}`,
    "",
    "Setelah masuk, Anda akan diminta membuat password baru.",
    "Jangan bagikan password ini kepada siapa pun, termasuk atasan atau admin.",
  ].join("\n");

  const html = `
<div style="font-family: Arial, sans-serif; font-size: 14px; line-height: 1.6; color: #171717;">
  <p>Halo ${escapeHtml(input.fullName)},</p>
  <p>${intro}</p>
  <table style="border-collapse: collapse; margin: 16px 0;">
    <tr><td style="padding: 4px 12px 4px 0; color: #737373;">Email</td><td>${escapeHtml(input.email)}</td></tr>
    <tr><td style="padding: 4px 12px 4px 0; color: #737373;">Password sementara</td>
      <td><code style="font-size: 16px; background: #f5f5f5; padding: 2px 6px; border-radius: 4px;">${escapeHtml(input.temporaryPassword)}</code></td></tr>
  </table>
  <p><a href="${escapeHtml(loginUrl)}" style="display: inline-block; background: #4f46e5; color: #ffffff; padding: 8px 16px; border-radius: 6px; text-decoration: none;">Masuk ke ArchiPay</a></p>
  <p>Setelah masuk, Anda akan diminta membuat password baru.<br />
  Jangan bagikan password ini kepada siapa pun, termasuk atasan atau admin.</p>
</div>`;

  return { to: input.email, subject, text, html };
}
