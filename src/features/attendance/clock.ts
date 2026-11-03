// Tanggal & jam setempat di zona waktu lokasi absen (WIB/WITA/WIT), dihitung
// dari jam server (bukan jam HP). Fungsi murni, dipakai server dan client.

export type LocalTime = {
  date: string; // "2026-11-04", sama dengan kolom date PostgreSQL
  minutes: number; // menit sejak 00.00 (480 = 08.00)
  isoWeekday: number; // 1 = Senin … 7 = Minggu
};

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timeZone: string) {
  let formatter = formatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      weekday: "short",
      hourCycle: "h23",
    });
    formatters.set(timeZone, formatter);
  }
  return formatter;
}

const WEEKDAY_INDEX: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };

export function localTime(date: Date, timeZone: string): LocalTime {
  const parts = Object.fromEntries(
    formatterFor(timeZone)
      .formatToParts(date)
      .map((part) => [part.type, part.value]),
  );
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    minutes: Number(parts.hour) * 60 + Number(parts.minute),
    isoWeekday: WEEKDAY_INDEX[parts.weekday] ?? 1,
  };
}

// "08.05" di zona waktu lokasi.
export function formatLocalClock(date: Date, timeZone: string) {
  const { minutes } = localTime(date, timeZone);
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}.${String(minutes % 60).padStart(2, "0")}`;
}

// Selisih zona waktu Indonesia terhadap UTC (tanpa musim panas).
const UTC_OFFSET_HOURS: Record<string, number> = { "Asia/Jakarta": 7, "Asia/Makassar": 8, "Asia/Jayapura": 9 };

// "2026-11-04" + 480 menit di Asia/Jakarta → Date (UTC) 2026-11-04T01:00Z.
// Dipakai koreksi absen oleh Owner.
export function zonedToDate(date: string, minutes: number, timeZone: string) {
  const [year, month, day] = date.split("-").map(Number);
  const offset = UTC_OFFSET_HOURS[timeZone] ?? 7;
  return new Date(Date.UTC(year, month - 1, day, 0, minutes - offset * 60));
}
