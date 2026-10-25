// Nilai status disimpan sebagai konstanta agar bisa dipakai bersama oleh
// skema validasi, query database, dan UI (badge, filter) tanpa typo string.
//
// Alur status PROSES uang muka (disimpan di kolom advance_requests.status):
//
//   [pull: karyawan mengajukan untuk diri sendiri]  ┐
//   [push: FINANCE mengusulkan untuk karyawan]      ┴→ PENDING_APPROVAL
//
//   PENDING_APPROVAL ─(OWNER setuju)→ APPROVED ─(dana diserahkan)─┐
//          └─(OWNER tolak)→ REJECTED                              │
//   [push: OWNER] ──────────────(langsung cair)───────────────────┴→ DISBURSED
//
//   DISBURSED ─(karyawan konfirmasi terima + setuju potong gaji)→ ACKNOWLEDGED
//
//   PENDING_APPROVAL / APPROVED / DISBURSED ─(dibatalkan, alasan wajib)→ CANCELLED
//
// Pertanggungjawaban (features/settlements):
//
//   ACKNOWLEDGED (karyawan mengisi nota, bisa disimpan sebagai draf)
//     ─(kirim)→ SUBMITTED ─(dikembalikan untuk diperbaiki)→ REVISION_REQUESTED ─(kirim ulang)┐
//                  ▲                                                                        │
//                  └────────────────────────────────────────────────────────────────────────┘
//   SUBMITTED ─(diverifikasi, saldo dari ledger)→ CLOSED            (saldo 0)
//                                               → RETURN_PENDING    (saldo > 0: sisa dikembalikan)
//                                               → REIMBURSE_PENDING (saldo < 0: kantor mengganti)
//
// RETURN_PENDING & REIMBURSE_PENDING diselesaikan di irisan pengembalian.
// "Lewat batas" (nota / pengembalian) tidak disimpan sebagai status, tetapi
// dihitung dari tanggal batas, sehingga selalu benar tanpa cron.

export const ADVANCE_STATUS = [
  "PENDING_APPROVAL", // pengajuan karyawan / usulan FINANCE, menunggu OWNER
  "APPROVED", // disetujui OWNER, uang belum diserahkan
  "REJECTED", // usulan ditolak OWNER
  "DISBURSED", // uang sudah diserahkan, menunggu konfirmasi karyawan
  "ACKNOWLEDGED", // karyawan mengonfirmasi terima, berikutnya unggah nota
  "SUBMITTED", // nota dikirim, menunggu verifikasi OWNER/FINANCE
  "REVISION_REQUESTED", // nota dikembalikan ke karyawan untuk diperbaiki
  "RETURN_PENDING", // terverifikasi, karyawan wajib mengembalikan sisa dana
  "REIMBURSE_PENDING", // terverifikasi, kantor wajib mengganti kekurangan
  "CLOSED", // selesai, saldo 0
  "CANCELLED", // dibatalkan sebelum dikonfirmasi karyawan
] as const;

export type AdvanceStatus = (typeof ADVANCE_STATUS)[number];

export const ADVANCE_STATUS_LABELS: Record<AdvanceStatus, string> = {
  PENDING_APPROVAL: "Menunggu persetujuan",
  APPROVED: "Disetujui, belum dicairkan",
  REJECTED: "Ditolak",
  DISBURSED: "Menunggu konfirmasi",
  ACKNOWLEDGED: "Diterima karyawan",
  SUBMITTED: "Nota menunggu verifikasi",
  REVISION_REQUESTED: "Nota perlu diperbaiki",
  RETURN_PENDING: "Sisa belum dikembalikan",
  REIMBURSE_PENDING: "Menunggu penggantian",
  CLOSED: "Selesai",
  CANCELLED: "Dibatalkan",
};

// Dana sudah di tangan karyawan tetapi nota belum (lengkap) dikirim.
// Hanya pada status ini "batas unggah nota terlewati" berarti.
export const AWAITING_RECEIPT_STATUSES = [
  "DISBURSED",
  "ACKNOWLEDGED",
  "REVISION_REQUESTED",
] as const satisfies readonly AdvanceStatus[];

export function isAwaitingReceipts(status: AdvanceStatus) {
  return (AWAITING_RECEIPT_STATUSES as readonly AdvanceStatus[]).includes(status);
}

export const DISBURSEMENT_METHODS = ["CASH", "TRANSFER"] as const;

export type DisbursementMethod = (typeof DISBURSEMENT_METHODS)[number];

export const DISBURSEMENT_METHOD_LABELS: Record<DisbursementMethod, string> = {
  CASH: "Tunai",
  TRANSFER: "Transfer",
};

// Batas nominal per uang muka. Batas atas mencegah salah ketik (kelebihan nol).
export const MIN_ADVANCE_AMOUNT = 1_000;
export const MAX_ADVANCE_AMOUNT = 1_000_000_000;

// Awalan nomor transaksi uang muka: "UM-2026-10-0001".
// Nomornya dibuat lib/document-number.ts saat uang muka disimpan.
export const ADVANCE_NUMBER_PREFIX = "UM";
