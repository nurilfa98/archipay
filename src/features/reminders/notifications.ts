// Teks pengingat WhatsApp harian untuk KARYAWAN (dikirim oleh
// features/reminders/run.ts). Owner & Finance tidak lagi dikirimi WhatsApp
// pengingat; yang lewat batas masuk ringkasan email harian (features/digest).
// Format teks WhatsApp: *tebal*, _miring_.

import "server-only";
import { formatDate } from "@/lib/dates";
import { formatRupiah } from "@/lib/format";
import type { ReminderCandidate, ReminderKind } from "./run";

export function reminderText(kind: ReminderKind, candidate: ReminderCandidate, toName: string, link: string) {
  return `Halo ${toName},\n\n${reminderLine(kind, candidate)}\n\n${link}`;
}

// Beberapa pengingat untuk karyawan yang sama digabung menjadi satu pesan.
export function combinedReminderText(
  items: { kind: ReminderKind; candidate: ReminderCandidate; link: string }[],
  toName: string,
) {
  const lines = items.map((item, index) => `${index + 1}. ${reminderLine(item.kind, item.candidate)}\n${item.link}`);
  return `Halo ${toName},\n\nAda ${items.length} pengingat uang muka untuk Anda:\n\n${lines.join("\n\n")}`;
}

function reminderLine(kind: ReminderKind, candidate: ReminderCandidate) {
  const due = candidate.dueAt ? `${formatDate(candidate.dueAt)} pukul 23.59` : "-";
  if (kind === "SETTLEMENT_DUE_SOON") {
    return (
      `Batas unggah nota uang muka *${candidate.advanceNumber}* (${formatRupiah(candidate.amount)}) ` +
      `adalah *besok, ${due}*. Unggah & kirim nota Anda di ArchiPay.`
    );
  }
  if (kind === "SETTLEMENT_OVERDUE") {
    return (
      `Batas unggah nota uang muka *${candidate.advanceNumber}* (${formatRupiah(candidate.amount)}) ` +
      `*sudah terlewati* (${due}). Mohon segera unggah & kirim nota Anda.`
    );
  }
  if (kind === "RETURN_DUE_SOON") {
    return (
      `Sisa uang muka *${formatRupiah(candidate.balance)}* (${candidate.settlementNumber}) wajib dikembalikan ` +
      `paling lambat *besok, ${due}*. Bila lewat, sisa dana dipotong dari gaji sesuai pernyataan Anda.`
    );
  }
  // RETURN_OVERDUE
  return (
    `Batas pengembalian sisa uang muka *${formatRupiah(candidate.balance)}* (${candidate.settlementNumber}) ` +
    `sudah terlewati. Sesuai pernyataan Anda, sisa dana ini *akan dipotong dari gaji*.`
  );
}
