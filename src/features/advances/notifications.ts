// Isi & penerima notifikasi WhatsApp untuk uang muka.
//
// Dipanggil dari Server Action di dalam after() (next/server): pesan dikirim
// SETELAH respons dikirim ke browser, sehingga tombol tidak ikut menunggu
// Fonnte. Gagal kirim hanya dicatat di log server (lihat lib/whatsapp.ts).
//
// Format teks WhatsApp: *tebal*, _miring_.
//
// Referensi: node_modules/next/dist/docs/01-app/03-api-reference/04-functions/after.md

import "server-only";
import { formatDate } from "@/lib/dates";
import { env } from "@/lib/env";
import { formatRupiah } from "@/lib/format";
import { sendWhatsApp } from "@/lib/whatsapp";
import { DISBURSEMENT_METHOD_LABELS, type DisbursementMethod } from "./constants";

type AdvanceSummary = {
  id: string;
  number: string; // "UM-2026-10-0001"
  amount: number;
  purpose: string;
  disbursementMethod: DisbursementMethod;
};

type Person = { fullName: string; phoneNumber: string | null };

// Dana dicairkan → karyawan diminta konfirmasi.
export function notifyDisbursed(advance: AdvanceSummary & { settlementDueAt: Date }, recipient: Person) {
  return send(
    [recipient],
    () =>
      `Halo ${recipient.fullName},\n\n` +
      `Anda menerima uang muka *${advance.number}* sebesar *${formatRupiah(advance.amount)}* ` +
      `(${DISBURSEMENT_METHOD_LABELS[advance.disbursementMethod]}) untuk keperluan: ${advance.purpose}\n\n` +
      `Mohon konfirmasi penerimaan dana di ArchiPay:\n${link(advance.id)}\n\n` +
      `Batas unggah nota: *${formatDate(advance.settlementDueAt)}* pukul 23.59.`,
  );
}

// Pencairan dibatalkan → karyawan diberi tahu (hanya bila sebelumnya sudah
// mendapat notifikasi pencairan).
export function notifyCancelled(advance: AdvanceSummary, recipient: Person, reason: string) {
  return send(
    [recipient],
    () =>
      `Halo ${recipient.fullName},\n\n` +
      `Uang muka *${advance.number}* sebesar ${formatRupiah(advance.amount)} *dibatalkan*.\n` +
      `Alasan: ${reason}\n\n${link(advance.id)}`,
  );
}

// Karyawan melaporkan dana tidak sesuai → OWNER & pencair dana.
export function notifyDisputed(
  advance: AdvanceSummary,
  recipientName: string,
  reason: string,
  contacts: Person[],
) {
  return send(
    contacts,
    (contact) =>
      `Halo ${contact.fullName},\n\n` +
      `${recipientName} melaporkan uang muka *${advance.number}* ` +
      `(${formatRupiah(advance.amount)}) *tidak sesuai*.\n` +
      `Alasan: ${reason}\n\n` +
      `Mohon dicek, lalu batalkan & catat ulang bila memang keliru:\n${link(advance.id)}`,
  );
}

// Karyawan mengonfirmasi terima → OWNER & pencair dana.
export function notifyAcknowledged(advance: AdvanceSummary, recipientName: string, contacts: Person[]) {
  return send(
    contacts,
    (contact) =>
      `Halo ${contact.fullName},\n\n` +
      `${recipientName} sudah mengonfirmasi menerima uang muka *${advance.number}* ` +
      `sebesar ${formatRupiah(advance.amount)} dan menyetujui ketentuan potong gaji.\n\n${link(advance.id)}`,
  );
}

function link(advanceId: string) {
  return new URL(`/advances/${advanceId}`, env.NEXT_PUBLIC_APP_URL).toString();
}

// User tanpa nomor WhatsApp dilewati. Semua pesan dikirim bersamaan;
// satu yang gagal tidak membatalkan yang lain.
async function send<T extends Person>(people: T[], text: (person: T) => string) {
  await Promise.allSettled(
    people
      .filter((person) => person.phoneNumber)
      .map((person) => sendWhatsApp({ to: person.phoneNumber!, text: text(person) })),
  );
}
