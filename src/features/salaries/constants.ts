// Konstanta Penggajian (add-on, BUSINESS-FLOW §20) yang dipakai server & browser.

import type { Tone } from "@/components/tone-badge";

// Cara menghitung tarif per hari (§20.2).
export const DAILY_RATE_METHODS = ["WORKING_DAYS", "FIXED_DIVISOR", "FIXED_AMOUNT"] as const;
export type DailyRateMethod = (typeof DAILY_RATE_METHODS)[number];

export const DAILY_RATE_METHOD_LABELS: Record<DailyRateMethod, string> = {
  WORKING_DAYS: "Dibagi hari kerja bulan itu",
  FIXED_DIVISOR: "Dibagi angka tetap",
  FIXED_AMOUNT: "Nominal tetap per hari per karyawan",
};

export const DAILY_RATE_METHOD_DESCRIPTIONS: Record<DailyRateMethod, string> = {
  WORKING_DAYS: "Dasar ÷ jumlah hari kerja bulan itu (jadwal kerja & hari libur di pengaturan absensi).",
  FIXED_DIVISOR: "Dasar ÷ pembagi yang sama setiap bulan (mis. 26).",
  FIXED_AMOUNT: "Diisi di data gaji masing-masing karyawan.",
};

// Dasar tarif per hari.
export const DEDUCTION_BASES = ["BASE", "BASE_ALLOWANCES"] as const;
export type DeductionBase = (typeof DEDUCTION_BASES)[number];

export const DEDUCTION_BASE_LABELS: Record<DeductionBase, string> = {
  BASE: "Gaji pokok saja",
  BASE_ALLOWANCES: "Gaji pokok + tunjangan tetap bulanan",
};

// Komponen data gaji: tunjangan (tetap bulanan / per hari hadir) atau potongan tetap.
export const COMPONENT_TYPES = ["ALLOWANCE", "DEDUCTION"] as const;
export type ComponentType = (typeof COMPONENT_TYPES)[number];
export const MAX_COMPONENTS = 20;

// Status penggajian bulanan.
export const RUN_STATUSES = ["DRAFT", "FINALIZED"] as const;
export type RunStatus = (typeof RUN_STATUSES)[number];

export const RUN_STATUS_LABELS: Record<RunStatus, string> = {
  DRAFT: "Draf",
  FINALIZED: "Selesai",
};

export const RUN_STATUS_TONES: Record<RunStatus, Tone> = {
  DRAFT: "active",
  FINALIZED: "success",
};

// Jenis & asal baris slip (schema.ts → payslip_lines).
export type LineType = "EARNING" | "DEDUCTION";
export const LINE_SOURCES = [
  "BASE",
  "ALLOWANCE",
  "ALLOWANCE_PER_DAY",
  "FIXED_DEDUCTION",
  "PRORATE",
  "ABSENCE",
  "ADVANCE",
  "PENALTY",
  "MANUAL",
] as const;
export type LineSource = (typeof LINE_SOURCES)[number];

// Baris yang nominalnya boleh diubah Owner di draf. Gaji pokok/tunjangan/
// potongan tetap diubah lewat data gaji; denda hanya bisa dihapus (ditunda).
export const EDITABLE_SOURCES: readonly LineSource[] = ["PRORATE", "ABSENCE", "ADVANCE", "MANUAL"];
// Baris yang boleh dihapus dari draf.
export const REMOVABLE_SOURCES: readonly LineSource[] = [
  "ALLOWANCE",
  "ALLOWANCE_PER_DAY",
  "FIXED_DEDUCTION",
  "PRORATE",
  "ABSENCE",
  "ADVANCE",
  "PENALTY",
  "MANUAL",
];

// Batas potongan upah (PP 36/2021): peringatan bila potongan > 50% pendapatan.
export const MAX_DEDUCTION_PERCENT = 50;
