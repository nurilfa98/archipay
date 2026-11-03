// Jam & hari kerja absensi (BUSINESS-FLOW §18.2). Fungsi murni tanpa
// database, dipakai server dan client.
//
// - Jam disimpan sebagai menit sejak 00.00 (480 = 08.00) waktu LOKASI.
// - Hari kerja disimpan sebagai bitmask: bit 0 = Senin … bit 6 = Minggu
//   (urutan hari ISO 8601). 63 = Senin–Sabtu.

export const WEEKDAYS = [
  { bit: 1 << 0, label: "Senin", short: "Sen" },
  { bit: 1 << 1, label: "Selasa", short: "Sel" },
  { bit: 1 << 2, label: "Rabu", short: "Rab" },
  { bit: 1 << 3, label: "Kamis", short: "Kam" },
  { bit: 1 << 4, label: "Jumat", short: "Jum" },
  { bit: 1 << 5, label: "Sabtu", short: "Sab" },
  { bit: 1 << 6, label: "Minggu", short: "Min" },
] as const;

export const ALL_WORK_DAYS = 127;

// 480 → "08.00" (format jam Indonesia).
export function formatMinutes(minutes: number) {
  const hours = Math.floor(minutes / 60);
  return `${String(hours).padStart(2, "0")}.${String(minutes % 60).padStart(2, "0")}`;
}

// 480 → "08:00" untuk <input type="time">.
export function minutesToTimeInput(minutes: number) {
  return formatMinutes(minutes).replace(".", ":");
}

// "08:00" / "08.00" / "8.00" → 480. null bila tidak valid.
export function parseTime(value: string): number | null {
  const match = /^(\d{1,2})[:.](\d{2})$/.exec(value.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

export function isWorkDay(mask: number, isoWeekday: number) {
  return (mask & (1 << (isoWeekday - 1))) !== 0;
}

// 63 → "Senin – Sabtu"; 21 → "Senin, Rabu, Jumat".
export function formatWorkDays(mask: number) {
  const days = WEEKDAYS.filter((day) => (mask & day.bit) !== 0);
  if (days.length === 7) return "Setiap hari";
  const indexes = days.map((day) => WEEKDAYS.indexOf(day));
  const consecutive = indexes.every((index, i) => i === 0 || index === indexes[i - 1] + 1);
  if (consecutive && days.length >= 3) return `${days[0].label} – ${days[days.length - 1].label}`;
  return days.map((day) => day.label).join(", ");
}
