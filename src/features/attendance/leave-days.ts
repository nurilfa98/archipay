// Hitungan tanggal untuk cuti/izin (BUSINESS-FLOW §19.3). Fungsi murni.
// Tanggal berupa teks "YYYY-MM-DD" (sama dengan kolom date PostgreSQL) dan
// dihitung sebagai tanggal kalender, tanpa jam/zona waktu.

import { isWorkDay } from "./schedule";

function toDate(value: string) {
  return new Date(`${value}T00:00:00Z`);
}

export function addDays(value: string, days: number) {
  const date = toDate(value);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

// Semua tanggal dari start sampai end (inklusif).
export function datesBetween(start: string, end: string): string[] {
  const dates: string[] = [];
  for (let current = start; current <= end && dates.length < 400; current = addDays(current, 1)) dates.push(current);
  return dates;
}

export function isoWeekdayOf(value: string) {
  const day = toDate(value).getUTCDay(); // 0 = Minggu
  return day === 0 ? 7 : day;
}

// Hari kerja dalam rentang: sesuai hari kerja company & bukan hari libur.
export function workDatesBetween(start: string, end: string, workDays: number, holidays: Set<string>) {
  return datesBetween(start, end).filter((date) => isWorkDay(workDays, isoWeekdayOf(date)) && !holidays.has(date));
}
