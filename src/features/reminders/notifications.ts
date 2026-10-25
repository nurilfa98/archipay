// Teks pengingat WhatsApp harian (dikirim oleh features/reminders/run.ts).
// Format teks WhatsApp: *tebal*, _miring_.

import "server-only";
import { formatDate } from "@/lib/dates";
import { formatRupiah } from "@/lib/format";
import type { ReminderCandidate, ReminderKind } from "./run";

export type ReminderAudience = "employee" | "owner";

export function reminderText(
  kind: ReminderKind,
  audience: ReminderAudience,
  candidate: ReminderCandidate,
  toName: string,
  link: string,
) {
  const due = candidate.dueAt ? `${formatDate(candidate.dueAt)} pukul 23.59` : "-";
  const hello = `Halo ${toName},\n\n`;

  if (kind === "SETTLEMENT_DUE_SOON") {
    return (
      hello +
      `Pengingat: batas unggah nota uang muka *${candidate.advanceNumber}* ` +
      `(${formatRupiah(candidate.amount)}) adalah *besok, ${due}*.\n\n` +
      `Unggah & kirim nota Anda di ArchiPay:\n${link}`
    );
  }
  if (kind === "SETTLEMENT_OVERDUE") {
    return audience === "employee"
      ? hello +
          `Batas unggah nota uang muka *${candidate.advanceNumber}* (${formatRupiah(candidate.amount)}) ` +
          `*sudah terlewati* (${due}). Mohon segera unggah & kirim nota Anda:\n${link}`
      : hello +
          `${candidate.recipientName} belum mengirim nota uang muka *${candidate.advanceNumber}* ` +
          `(${formatRupiah(candidate.amount)}). Batasnya, ${due}, sudah terlewati.\n\n${link}`;
  }
  if (kind === "RETURN_DUE_SOON") {
    return (
      hello +
      `Pengingat: sisa uang muka *${formatRupiah(candidate.balance)}* (${candidate.settlementNumber}) ` +
      `wajib dikembalikan paling lambat *besok, ${due}*. Bila lewat, sisa dana dipotong dari gaji ` +
      `sesuai pernyataan Anda.\n\n${link}`
    );
  }
  // RETURN_OVERDUE
  return audience === "employee"
    ? hello +
        `Batas pengembalian sisa uang muka *${formatRupiah(candidate.balance)}* (${candidate.settlementNumber}) ` +
        `sudah terlewati. Sesuai pernyataan Anda, sisa dana ini *akan dipotong dari gaji*.\n\n${link}`
    : hello +
        `Sisa uang muka ${candidate.recipientName} sebesar *${formatRupiah(candidate.balance)}* ` +
        `(${candidate.settlementNumber}) lewat batas pengembalian dan masuk *daftar potong gaji*.\n\n${link}`;
}
