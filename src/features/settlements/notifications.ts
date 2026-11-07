// Isi & penerima notifikasi untuk pertanggungjawaban. Dipanggil di dalam after()
// (next/server), sama seperti features/advances/notifications.ts.
//
// - WhatsApp (mendesak): dikembalikan untuk diperbaiki, penggantian dibayar
//   (karyawan harus menjawab), penggantian belum diterima, laporan pengembalian ditolak.
// - Lonceng (features/notifications; kabar sekali lewat): selesai diverifikasi,
//   pengembalian / potong gaji dicatat.
//
// Format teks WhatsApp: *tebal*, _miring_.

import "server-only";
import { formatDate } from "@/lib/dates";
import { REIMBURSE_ACK_DAYS } from "./constants";
import { env } from "@/lib/env";
import { formatRupiah } from "@/lib/format";
import { createNotifications } from "@/features/notifications/service";
import { sendWhatsApp } from "@/lib/whatsapp";

type SettlementSummary = {
  id: string;
  number: string; // "PJ-2026-10-0001"
  advanceNumber: string;
};

type Person = { fullName: string; phoneNumber: string | null };
type PersonWithId = Person & { id: string };

// Laporan dikembalikan untuk diperbaiki → karyawan.
export function notifyRevisionRequested(settlement: SettlementSummary, recipient: Person, note: string) {
  return send(
    [recipient],
    () =>
      `Halo ${recipient.fullName},\n\n` +
      `Pertanggungjawaban *${settlement.number}* (uang muka ${settlement.advanceNumber}) ` +
      `*dikembalikan untuk diperbaiki*.\nCatatan: ${note}\n\n` +
      `Perbaiki lalu kirim ulang:\n${link(settlement.id)}`,
  );
}

// Selesai diverifikasi → karyawan, beserta hasil saldonya.
export function notifyVerified(
  settlement: SettlementSummary & { approvedAmount: number; balance: number; returnDueAt: Date | null },
  recipient: PersonWithId,
  companyId: string,
) {
  const result =
    settlement.balance > 0
      ? `Sisa dana ${formatRupiah(settlement.balance)} wajib dikembalikan` +
        (settlement.returnDueAt ? ` paling lambat ${formatDate(settlement.returnDueAt)}.` : ".")
      : settlement.balance < 0
        ? `Kantor akan mengganti kekurangan ${formatRupiah(-settlement.balance)} kepada Anda.`
        : "Saldo uang muka sudah lunas (selesai).";
  return createNotifications([
    {
      companyId,
      userId: recipient.id,
      kind: "SETTLEMENT_VERIFIED",
      title: "Pertanggungjawaban sudah diverifikasi",
      body: `${settlement.number} · nota disetujui ${formatRupiah(settlement.approvedAmount)}. ${result}`,
      href: `/settlements/${settlement.id}`,
    },
  ]);
}

// Pengembalian / penggantian / potong gaji dicatat → karyawan.
export function notifyBalanceRecorded(
  settlement: SettlementSummary,
  recipient: PersonWithId,
  entry: {
    type: "RETURN" | "REIMBURSEMENT" | "PAYROLL_DEDUCTION";
    amount: number;
    remaining: number;
    payrollPeriod?: string | null;
  },
  companyId: string,
) {
  // Pengembalian dan potong gaji: kabar biasa → lonceng. Penggantian dibayar kantor:
  // karyawan harus menjawab dalam beberapa hari, jadi tetap lewat WhatsApp.
  if (entry.type !== "REIMBURSEMENT") {
    const deduction = entry.type === "PAYROLL_DEDUCTION";
    return createNotifications([
      {
        companyId,
        userId: recipient.id,
        kind: "BALANCE_RECORDED",
        title: deduction ? "Sisa uang muka dipotong dari gaji" : "Pengembalian sisa dana diterima",
        body:
          `${settlement.number} · ${formatRupiah(entry.amount)}` +
          (deduction && entry.payrollPeriod ? ` (periode ${entry.payrollPeriod})` : "") +
          (entry.remaining === 0
            ? ". Uang muka ini selesai (saldo lunas)."
            : `. Sisa yang masih harus dikembalikan ${formatRupiah(entry.remaining)}.`),
        href: `/settlements/${settlement.id}`,
      },
    ]);
  }
  const what =
    entry.type === "REIMBURSEMENT"
      ? `Penggantian kekurangan sebesar *${formatRupiah(entry.amount)}* sudah dibayarkan kepada Anda`
      : entry.type === "PAYROLL_DEDUCTION"
        ? `Sisa uang muka *${formatRupiah(entry.amount)}* dipotong dari gaji periode ${entry.payrollPeriod}`
        : `Pengembalian sisa dana *${formatRupiah(entry.amount)}* sudah diterima`;
  const rest =
    entry.remaining === 0
      ? "Uang muka ini *selesai* (saldo lunas)."
      : entry.type === "REIMBURSEMENT"
        ? `Sisa penggantian yang belum dibayar: ${formatRupiah(entry.remaining)}.`
        : `Sisa yang masih harus dikembalikan: *${formatRupiah(entry.remaining)}*.`;
  // Penggantian yang dibayar Owner/Finance: karyawan diminta mengonfirmasi (§8.1.2).
  const ask =
    entry.type === "REIMBURSEMENT"
      ? `\nMohon konfirmasi di aplikasi apakah uangnya *sudah Anda terima*. Tanpa jawaban dalam ${REIMBURSE_ACK_DAYS} hari, dianggap sudah diterima.\n`
      : "";
  return send(
    [recipient],
    () =>
      `Halo ${recipient.fullName},\n\n` +
      `${what} (pertanggungjawaban *${settlement.number}*, uang muka ${settlement.advanceNumber}).\n` +
      `${rest}\n${ask}\n${link(settlement.id)}`,
  );
}

// Karyawan menyatakan BELUM menerima penggantian → Owner & pencatatnya (urgent).
export function notifyReimbursementDisputed(
  settlement: SettlementSummary,
  people: Person[],
  claim: { employeeName: string; amount: number; note: string | null },
) {
  return send(
    people,
    (person) =>
      `Halo ${person.fullName},\n\n` +
      `${claim.employeeName} menyatakan *belum menerima* penggantian *${formatRupiah(claim.amount)}* ` +
      `untuk *${settlement.number}* (uang muka ${settlement.advanceNumber}).` +
      (claim.note ? `\nCatatan: ${claim.note}` : "") +
      `\n\nPencatatan dibatalkan dan kekurangan kembali tercatat belum dibayar. Periksa lalu bayar ulang:\n${link(settlement.id)}`,
  );
}

// Laporan pengembalian ditolak → karyawan (urgent: ia harus bertindak lagi).
export function notifyReturnClaimRejected(
  settlement: SettlementSummary,
  recipient: Person,
  claim: { amount: number; reason: string },
) {
  return send(
    [recipient],
    () =>
      `Halo ${recipient.fullName},\n\n` +
      `Laporan pengembalian *${formatRupiah(claim.amount)}* untuk *${settlement.number}* ` +
      `(uang muka ${settlement.advanceNumber}) *belum bisa dikonfirmasi*.\nAlasan: ${claim.reason}\n\n` +
      `Sisa dana masih tercatat belum dikembalikan. Periksa lalu lapor ulang bila perlu:\n${link(settlement.id)}`,
  );
}

function link(settlementId: string) {
  return new URL(`/settlements/${settlementId}`, env.NEXT_PUBLIC_APP_URL).toString();
}

// User tanpa nomor WhatsApp dilewati; satu pesan gagal tidak membatalkan yang lain.
async function send<T extends Person>(people: T[], text: (person: T) => string) {
  await Promise.allSettled(
    people
      .filter((person) => person.phoneNumber)
      .map((person) => sendWhatsApp({ to: person.phoneNumber!, text: text(person) })),
  );
}
