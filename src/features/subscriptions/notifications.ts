// Pemberitahuan langganan ke semua Owner aktif sebuah company, lewat WhatsApp
// (bila nomornya ada) DAN email (BUSINESS-FLOW §17):
// - hasil verifikasi pembayaran: lunas, kurang bayar, ditolak
// - pengingat masa aktif H-3 & H-1 (features/subscriptions/reminders.ts)
//
// Gagal kirim tidak membatalkan apa pun (sendWhatsApp/sendEmail tidak melempar).

import "server-only";
import { and, eq } from "drizzle-orm";
import { PRODUCT_NAME } from "@/lib/brand";
import { formatDate } from "@/lib/dates";
import { db } from "@/lib/db";
import { companies, roles, userRoles, users } from "@/lib/db/schema";
import { escapeHtml, sendEmail } from "@/lib/email";
import { env } from "@/lib/env";
import { formatRupiah } from "@/lib/format";
import { sendWhatsApp } from "@/lib/whatsapp";

export type SubscriptionNotice =
  | { kind: "paid"; until: Date; userLimit: number }
  | { kind: "underpaid"; received: number; remaining: number; price: number }
  | { kind: "rejected"; reason: string }
  | { kind: "reminder"; until: Date; daysLeft: number };

type Owner = { fullName: string; email: string; phoneNumber: string | null };

async function listOwners(companyId: string): Promise<Owner[]> {
  return db
    .select({ fullName: users.fullName, email: users.email, phoneNumber: users.phoneNumber })
    .from(users)
    .innerJoin(userRoles, eq(userRoles.userId, users.id))
    .innerJoin(roles, eq(userRoles.roleId, roles.id))
    .where(and(eq(users.companyId, companyId), eq(roles.name, "OWNER"), eq(users.isActive, true)));
}

// Mengembalikan jumlah Owner yang berhasil dihubungi (WhatsApp atau email).
export async function notifyOwners(companyId: string, notice: SubscriptionNotice) {
  const [[company], owners] = await Promise.all([
    db.select({ name: companies.name }).from(companies).where(eq(companies.id, companyId)).limit(1),
    listOwners(companyId),
  ]);
  if (!company) return 0;

  const url = new URL("/subscription", env.NEXT_PUBLIC_APP_URL).toString();
  const results = await Promise.all(
    owners.map(async (owner) => {
      const { subject, lines } = noticeContent(owner.fullName, company.name, notice);
      const [whatsApp, email] = await Promise.all([
        owner.phoneNumber ? sendWhatsApp({ to: owner.phoneNumber, text: [...lines, "", url].join("\n") }) : false,
        sendEmail({
          to: owner.email,
          subject,
          text: [...lines, "", `Buka menu Langganan: ${url}`].join("\n"),
          html: `
<div style="font-family: Arial, sans-serif; font-size: 14px; line-height: 1.6; color: #171717;">
  ${lines.map((line) => `<p>${escapeHtml(line)}</p>`).join("\n  ")}
  <p><a href="${escapeHtml(url)}" style="display: inline-block; background: #4f46e5; color: #ffffff; padding: 8px 16px; border-radius: 6px; text-decoration: none;">Buka menu Langganan</a></p>
</div>`,
        }),
      ]);
      return whatsApp || email;
    }),
  );
  return results.filter(Boolean).length;
}

function noticeContent(ownerName: string, companyName: string, notice: SubscriptionNotice) {
  const hello = `Halo ${ownerName},`;
  switch (notice.kind) {
    case "paid":
      return {
        subject: `Pembayaran langganan ${PRODUCT_NAME} diterima`,
        lines: [
          hello,
          `pembayaran langganan ${PRODUCT_NAME} untuk ${companyName} sudah kami terima.`,
          `Masa aktif sampai ${formatDate(notice.until)}, untuk maksimal ${notice.userLimit} pengguna aktif. Terima kasih sudah berlangganan.`,
        ],
      };
    case "underpaid":
      return {
        subject: `Pembayaran langganan ${PRODUCT_NAME} masih kurang`,
        lines: [
          hello,
          `pembayaran ${formatRupiah(notice.received)} untuk ${companyName} sudah kami terima.`,
          `Masih kurang ${formatRupiah(notice.remaining)} dari tagihan ${formatRupiah(notice.price)}. Silakan transfer kekurangannya dan kirim buktinya di menu Langganan.`,
        ],
      };
    case "rejected":
      return {
        subject: `Bukti pembayaran ${PRODUCT_NAME} belum bisa diterima`,
        lines: [
          hello,
          `bukti pembayaran untuk ${companyName} belum bisa kami terima.`,
          `Alasan: ${notice.reason}. Silakan periksa kembali lalu kirim ulang buktinya di menu Langganan.`,
        ],
      };
    case "reminder":
      return {
        subject: `Masa aktif ${PRODUCT_NAME} berakhir ${notice.daysLeft} hari lagi`,
        lines: [
          hello,
          `masa aktif ${PRODUCT_NAME} untuk ${companyName} berakhir ${formatDate(notice.until)} (${notice.daysLeft} hari lagi).`,
          "Agar tim tetap bisa mengajukan dan mempertanggungjawabkan uang muka, pilih paket dan lakukan pembayaran di menu Langganan.",
          "Perpanjangan dihitung dari tanggal berakhir, jadi membayar lebih awal tidak merugikan.",
        ],
      };
  }
}
