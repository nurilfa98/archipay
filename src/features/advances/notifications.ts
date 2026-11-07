// Isi & penerima notifikasi untuk uang muka.
//
// - WhatsApp (mendesak): pengajuan baru ke penyetuju, dana dicairkan, dilaporkan
//   tidak sesuai.
// - Lonceng (features/notifications; kabar sekali lewat): ditolak, dibatalkan.
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
import { createNotifications } from "@/features/notifications/service";
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
type PersonWithId = Person & { id: string };

// Pengajuan karyawan / usulan FINANCE baru → penyetuju (OWNER selain
// penerima & pengusul, lihat eligibleApprovers di service.ts).
export function notifyApprovalRequested(
  advance: AdvanceSummary,
  people: { recipientName: string; creatorName: string; isOwnRequest: boolean },
  approvers: Person[],
) {
  const who = people.isOwnRequest
    ? `${people.recipientName} mengajukan uang muka`
    : `${people.creatorName} mengusulkan uang muka untuk ${people.recipientName}`;
  return send(
    approvers,
    (approver) =>
      `Halo ${approver.fullName},\n\n` +
      `${who} *${advance.number}* sebesar *${formatRupiah(advance.amount)}* ` +
      `(${DISBURSEMENT_METHOD_LABELS[advance.disbursementMethod]}) untuk keperluan: ${advance.purpose}\n\n` +
      `Mohon setujui atau tolak di ArchiPay:\n${link(advance.id)}`,
  );
}

// Pengajuan/usulan ditolak → pengusulnya (karyawan yang mengajukan untuk diri
// sendiri, atau FINANCE yang mengusulkan). Pada usulan FINANCE, calon penerima
// belum pernah diberi tahu, jadi tidak ikut dikirimi.
export function notifyRejected(
  advance: AdvanceSummary & { recipientName: string },
  creator: PersonWithId,
  isOwnRequest: boolean,
  deciderName: string,
  reason: string,
  companyId: string,
) {
  return createNotifications([
    {
      companyId,
      userId: creator.id,
      kind: "ADVANCE_REJECTED",
      title: isOwnRequest
        ? "Pengajuan uang muka ditolak"
        : `Usulan uang muka untuk ${advance.recipientName} ditolak`,
      body: `${advance.number} · ${formatRupiah(advance.amount)} · ditolak ${deciderName}. Alasan: ${reason}`,
      href: `/advances/${advance.id}`,
    },
  ]);
}

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
export function notifyCancelled(advance: AdvanceSummary, recipient: PersonWithId, reason: string, companyId: string) {
  return createNotifications([
    {
      companyId,
      userId: recipient.id,
      kind: "ADVANCE_CANCELLED",
      title: "Uang muka dibatalkan",
      body: `${advance.number} · ${formatRupiah(advance.amount)}. Alasan: ${reason}`,
      href: `/advances/${advance.id}`,
    },
  ]);
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
