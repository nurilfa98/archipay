// Tanggal & jam menurut zona waktu PERUSAHAAN (APP_TIMEZONE), bukan zona
// waktu server. Server production biasanya berjalan dalam UTC, sehingga
// tanpa ini "hari ini" di server bisa masih "kemarin" di Jakarta.
//
// File ini khusus server (membaca env). Client Component menerima tanggal
// yang sudah diformat dari Server Component.
//
// Referensi:
// - https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/DateTimeFormat
// - https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/DateTimeFormat/formatToParts

import "server-only";
import { env } from "@/lib/env";

const timeZone = env.APP_TIMEZONE;

const dateFormat = new Intl.DateTimeFormat("id-ID", {
  timeZone,
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
});

const shortDateFormat = new Intl.DateTimeFormat("id-ID", {
  timeZone,
  day: "numeric",
  month: "short",
  year: "numeric",
});

const dateTimeFormat = new Intl.DateTimeFormat("id-ID", {
  timeZone,
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZoneName: "short", // "WIB", "WITA", "WIT"
});

// "Selasa, 27 Oktober 2026"
export function formatDate(date: Date) {
  return dateFormat.format(date);
}

// "27 Okt 2026" (untuk kolom tabel)
export function formatShortDate(date: Date) {
  return shortDateFormat.format(date);
}

// "24 Okt 2026, 15.30 WIB"
export function formatDateTime(date: Date) {
  return dateTimeFormat.format(date);
}

// Tanggal kalender menurut zona waktu perusahaan, "2026-10-24". Format ini
// sama dengan <input type="date"> dan kolom PostgreSQL bertipe date, sehingga
// bisa dibandingkan langsung sebagai teks.
export function zonedDateString(date: Date) {
  const { year, month, day } = zonedParts(date);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

// "2026-10-24" (tanggal tanpa jam, misal tanggal nota) → "24 Okt 2026".
// Diformat dalam UTC karena teksnya sudah berupa tanggal kalender; memakai
// zona waktu lain bisa menggeser tanggalnya sehari.
export function formatDateOnly(value: string) {
  return dateOnlyFormat.format(new Date(`${value}T00:00:00Z`));
}

const dateOnlyFormat = new Intl.DateTimeFormat("id-ID", {
  timeZone: "UTC",
  day: "numeric",
  month: "short",
  year: "numeric",
});

// Tahun & bulan menurut zona waktu perusahaan, misalnya untuk periode
// nomor transaksi (lib/document-number.ts).
export function zonedYearMonth(date: Date) {
  const { year, month } = zonedParts(date);
  return { year, month };
}

// Batas waktu dalam HARI KALENDER: akhir hari (23.59.59 waktu perusahaan)
// pada tanggal `from` + `days`.
// Contoh (WIB): dicairkan Senin 24 Okt pukul 15.00, days = 3
//            → batasnya Kamis 27 Okt pukul 23.59.59 WIB.
export function endOfDayAfter(from: Date, days: number) {
  const local = zonedParts(from);
  // Tengah malam awal hari berikutnya, dihitung "seolah-olah UTC"...
  const midnightAsUtc = Date.UTC(local.year, local.month - 1, local.day + days + 1);
  // ...lalu digeser sebesar selisih zona waktu perusahaan terhadap UTC.
  const midnight = midnightAsUtc - offsetMs(new Date(midnightAsUtc));
  return new Date(midnight - 1);
}

const partsFormat = new Intl.DateTimeFormat("en-US", {
  timeZone,
  year: "numeric",
  month: "numeric",
  day: "numeric",
  hour: "numeric",
  minute: "numeric",
  second: "numeric",
  hourCycle: "h23",
});

function zonedParts(date: Date) {
  const parts = Object.fromEntries(
    partsFormat.formatToParts(date).map((part) => [part.type, Number(part.value)]),
  );
  return {
    year: parts.year,
    month: parts.month,
    day: parts.day,
    hour: parts.hour,
    minute: parts.minute,
    second: parts.second,
  };
}

// Selisih jam dinding di zona perusahaan terhadap UTC, dalam milidetik.
// WIB = +7 jam. Indonesia tidak memakai daylight saving time.
function offsetMs(date: Date) {
  const p = zonedParts(date);
  const wallClockAsUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return wallClockAsUtc - Math.floor(date.getTime() / 1000) * 1000;
}
