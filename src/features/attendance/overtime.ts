// Lembur di hari libur (BUSINESS-FLOW §24): status izin, label, dan hitungan jam.
// Fungsi murni tanpa database, dipakai server dan client.

import type { Tone } from "@/components/tone-badge";

// REQUEST = diajukan karyawan (perlu persetujuan), ASSIGNED = ditugaskan Owner/Admin HR.
export const OVERTIME_SOURCES = ["REQUEST", "ASSIGNED"] as const;
export type OvertimeSource = (typeof OVERTIME_SOURCES)[number];

export const OVERTIME_SOURCE_LABELS: Record<OvertimeSource, string> = {
  REQUEST: "Diajukan karyawan",
  ASSIGNED: "Ditugaskan",
};

// DECLINED = penugasan ditolak karyawan ("Tidak bisa hadir").
export const OVERTIME_STATUSES = ["PENDING", "APPROVED", "REJECTED", "CANCELLED", "DECLINED"] as const;
export type OvertimeStatus = (typeof OVERTIME_STATUSES)[number];

export const OVERTIME_STATUS_LABELS: Record<OvertimeStatus, string> = {
  PENDING: "Menunggu persetujuan",
  APPROVED: "Disetujui",
  REJECTED: "Ditolak",
  CANCELLED: "Dibatalkan",
  DECLINED: "Tidak bisa hadir",
};

export const OVERTIME_STATUS_TONES: Record<OvertimeStatus, Tone> = {
  PENDING: "warning",
  APPROVED: "success",
  REJECTED: "danger",
  CANCELLED: "pending",
  DECLINED: "danger",
};

// Status yang masih berlaku (satu per karyawan per tanggal).
export const OVERTIME_ACTIVE_STATUSES = ["PENDING", "APPROVED"] as const satisfies readonly OvertimeStatus[];

// Jam lembur dibulatkan KE BAWAH per kelipatan ini.
export const OVERTIME_STEP_MINUTES = 30;

type OvertimeSpan = {
  // Absen masuk & pulang nyata. Belum absen pulang (null) = belum ada jam lembur.
  checkInAt: Date;
  checkOutAt: Date | null;
  // Jam rencana pada izin, menit setempat sejak 00.00.
  plannedStartMinute: number;
  plannedEndMinute: number;
};

// Menit lembur satu hari: lama absen nyata, dibatasi lama rencana, dibulatkan
// ke bawah per 30 menit. Absen nyata saja yang jadi dasar; rencana hanya batas atas.
export function overtimeMinutes(span: OvertimeSpan) {
  if (!span.checkOutAt) return 0;
  const actual = Math.floor((span.checkOutAt.getTime() - span.checkInAt.getTime()) / 60_000);
  const planned = span.plannedEndMinute - span.plannedStartMinute;
  const capped = Math.min(actual, planned);
  if (capped <= 0) return 0;
  return Math.floor(capped / OVERTIME_STEP_MINUTES) * OVERTIME_STEP_MINUTES;
}

// 150 → "2,5 jam"; 120 → "2 jam"; 30 → "0,5 jam".
export function formatOvertimeHours(minutes: number) {
  const hours = minutes / 60;
  return `${Number.isInteger(hours) ? hours : String(hours).replace(".", ",")} jam`;
}

// Pekan kerja perusahaan: 5 hari atau kurang = pekan 5 hari, selebihnya pekan 6 hari
// (mask hari kerja di features/attendance/schedule.ts).
export type WorkWeek = 5 | 6;

export function workWeekOf(workDaysMask: number): WorkWeek {
  let count = 0;
  for (let bit = 0; bit < 7; bit += 1) if ((workDaysMask & (1 << bit)) !== 0) count += 1;
  return count <= 5 ? 5 : 6;
}
