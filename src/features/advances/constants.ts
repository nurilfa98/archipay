// Nilai status disimpan sebagai konstanta agar bisa dipakai bersama oleh
// skema validasi, query database, dan UI (badge, filter) tanpa typo string.

export const ADVANCE_STATUS = [
  "DISBURSED", // uang sudah di tangan karyawan, menunggu struk
  "SUBMITTED", // struk sudah di-upload, menunggu verifikasi
  "COMPLETED", // selesai
  "OVERDUE", // melewati due_date, siap potong gaji
] as const;

export type AdvanceStatus = (typeof ADVANCE_STATUS)[number];

export const DISBURSEMENT_TYPE = ["CASH", "TRANSFER"] as const;

export type DisbursementType = (typeof DISBURSEMENT_TYPE)[number];
