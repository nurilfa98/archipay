// Konstanta pertanggungjawaban (laporan penggunaan uang muka + nota).
//
// Status laporan TIDAK disimpan sendiri, melainkan dibaca dari status uang
// mukanya (advance_requests.status), agar tidak ada dua status yang bisa
// berbeda. Peta di bawah hanya untuk tampilan di menu Pertanggungjawaban:
//
//   status uang muka     → status laporan
//   ACKNOWLEDGED         → DRAFT               "Draf"
//   SUBMITTED            → SUBMITTED           "Menunggu verifikasi"
//   REVISION_REQUESTED   → REVISION_REQUESTED  "Perlu diperbaiki"
//   RETURN_PENDING       → RETURN_PENDING      "Sisa belum dikembalikan"
//   REIMBURSE_PENDING    → REIMBURSE_PENDING   "Menunggu penggantian"
//   CLOSED               → CLOSED              "Selesai"

import type { AdvanceStatus } from "@/features/advances/constants";

export const SETTLEMENT_STATUS = [
  "DRAFT",
  "SUBMITTED",
  "REVISION_REQUESTED",
  "RETURN_PENDING",
  "REIMBURSE_PENDING",
  "CLOSED",
] as const;

export type SettlementStatus = (typeof SETTLEMENT_STATUS)[number];

export const SETTLEMENT_STATUS_LABELS: Record<SettlementStatus, string> = {
  DRAFT: "Draf",
  SUBMITTED: "Menunggu verifikasi",
  REVISION_REQUESTED: "Perlu diperbaiki",
  RETURN_PENDING: "Sisa belum dikembalikan",
  REIMBURSE_PENDING: "Menunggu penggantian",
  CLOSED: "Selesai",
};

const ADVANCE_TO_SETTLEMENT: Partial<Record<AdvanceStatus, SettlementStatus>> = {
  ACKNOWLEDGED: "DRAFT",
  SUBMITTED: "SUBMITTED",
  REVISION_REQUESTED: "REVISION_REQUESTED",
  RETURN_PENDING: "RETURN_PENDING",
  REIMBURSE_PENDING: "REIMBURSE_PENDING",
  CLOSED: "CLOSED",
};

export function toSettlementStatus(status: AdvanceStatus): SettlementStatus {
  return ADVANCE_TO_SETTLEMENT[status] ?? "DRAFT";
}

export function toAdvanceStatus(status: SettlementStatus): AdvanceStatus {
  return status === "DRAFT" ? "ACKNOWLEDGED" : status;
}

// Nota hanya bisa ditambah/dihapus selama laporan berstatus draf / perlu diperbaiki.
export const EDITABLE_ADVANCE_STATUSES = ["ACKNOWLEDGED", "REVISION_REQUESTED"] as const satisfies readonly AdvanceStatus[];

// Awalan nomor laporan: "PJ-2026-10-0001" (lib/document-number.ts).
export const SETTLEMENT_NUMBER_PREFIX = "PJ";

export const ITEM_VERIFICATION_STATUS = ["PENDING", "APPROVED", "REJECTED"] as const;
export type ItemVerificationStatus = (typeof ITEM_VERIFICATION_STATUS)[number];

// Jenis baris ledger (advance_ledger_entries.type). Tanda +/− ada di nominal.
export const LEDGER_ENTRY_TYPES = [
  "DISBURSEMENT", // + dana diterima karyawan
  "EXPENSE_APPROVED", // − nota disetujui saat verifikasi
  "RETURN", // − sisa dana dikembalikan karyawan
  "PAYROLL_DEDUCTION", // − sisa dana dipotong dari gaji
  "REIMBURSEMENT", // + kantor mengganti kekurangan
  "REIMBURSEMENT_REVERSAL", // − penggantian dibatalkan: karyawan menyatakan belum menerima
] as const;
export type LedgerEntryType = (typeof LEDGER_ENTRY_TYPES)[number];

export const LEDGER_ENTRY_LABELS: Record<LedgerEntryType, string> = {
  DISBURSEMENT: "Dana diterima",
  EXPENSE_APPROVED: "Nota disetujui",
  RETURN: "Sisa dana dikembalikan",
  PAYROLL_DEDUCTION: "Potong gaji",
  REIMBURSEMENT: "Penggantian dibayar",
  REIMBURSEMENT_REVERSAL: "Penggantian dibatalkan",
};

// Cara pengembalian / penggantian. PAYROLL hanya untuk potong gaji.
export const SETTLE_METHODS = ["CASH", "TRANSFER"] as const;
export type SettleMethod = (typeof SETTLE_METHODS)[number];
export const LEDGER_METHOD_LABELS: Record<string, string> = {
  CASH: "Tunai",
  TRANSFER: "Transfer",
  PAYROLL: "Potong gaji",
};

// Laporan pengembalian dari karyawan (BUSINESS-FLOW §8.1.1).
export const RETURN_CLAIM_STATUS = ["PENDING", "CONFIRMED", "REJECTED"] as const;
export type ReturnClaimStatus = (typeof RETURN_CLAIM_STATUS)[number];

export const RETURN_CLAIM_STATUS_LABELS: Record<ReturnClaimStatus, string> = {
  PENDING: "Menunggu konfirmasi",
  CONFIRMED: "Dikonfirmasi",
  REJECTED: "Ditolak",
};

// Konfirmasi karyawan atas penggantian yang dibayar (BUSINESS-FLOW §8.1.2).
export const ACK_STATUS = ["PENDING", "CONFIRMED", "DISPUTED", "AUTO"] as const;
export type AckStatus = (typeof ACK_STATUS)[number];
// Tanpa jawaban sekian hari, penggantian dianggap sudah diterima.
export const REIMBURSE_ACK_DAYS = 3;

// Tanggal diterima / dikembalikan boleh mundur paling jauh sekian hari dari
// saat dicatat (tidak boleh ke depan, tidak boleh sebelum dana dicairkan).
export const BACKDATE_MAX_DAYS = 30;
// Laporan yang belum diputuskan lebih dari sekian hari masuk ringkasan email.
export const CLAIM_ESCALATE_DAYS = 2;

// Batas file nota. Foto dikompres di HP lebih dulu (biasanya < 500 KB);
// batas ini terutama untuk PDF nota digital.
export const MAX_RECEIPT_BYTES = 4 * 1024 * 1024;
export const MAX_ITEMS_PER_SETTLEMENT = 50;
