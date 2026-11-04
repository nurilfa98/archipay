// Aturan akses company berdasarkan masa langganan (BUSINESS-FLOW §17). Di lib/
// karena dipakai lib/auth/dal.ts (penentu akses) dan fitur companies &
// subscriptions. Fungsi murni tanpa database.
//
//   TRIAL  belum pernah lunas, masa gratis masih berjalan   → normal
//   ACTIVE pernah lunas, masa langganan masih berjalan       → normal
//   GRACE  pernah lunas, masa aktif habis, belum lewat masa tenggang
//                                                            → normal + spanduk merah
//   LOCKED lewat masa tenggang (masa gratis: langsung saat habis) → Owner hanya
//          membuka Langganan, Finance & Karyawan tidak bisa login. Superadmin
//          tetap bisa membuka company.
//
// Masa tenggang khusus klien berbayar: masa gratis tidak punya tenggang.

const DAY_MS = 24 * 60 * 60 * 1000;

export type CompanyAccessStatus = "TRIAL" | "ACTIVE" | "GRACE" | "LOCKED";

export type CompanyAccess = {
  status: CompanyAccessStatus;
  until: Date; // akhir masa gratis/langganan (companies.subscription_until)
  graceUntil: Date; // until + masa tenggang
  // Hari tersisa sampai `until` (negatif bila sudah lewat), dibulatkan ke atas.
  daysLeft: number;
  locked: boolean;
  // true bila perlu spanduk pengingat (H-7 atau sedang masa tenggang).
  needsReminder: boolean;
};

// Spanduk pengingat & chip "Segera habis" mulai H-7.
export const REMINDER_DAYS = 7;

// `hasPaid` = pernah ada tagihan lunas: membedakan TRIAL vs ACTIVE, dan hanya
// company yang pernah lunas mendapat masa tenggang (`graceDays`).
export function getCompanyAccess({
  subscriptionUntil,
  hasPaid,
  graceDays,
  now = new Date(),
}: {
  subscriptionUntil: Date;
  hasPaid: boolean;
  graceDays: number;
  now?: Date;
}): CompanyAccess {
  const graceUntil = addDays(subscriptionUntil, hasPaid ? graceDays : 0);
  const daysLeft = Math.ceil((subscriptionUntil.getTime() - now.getTime()) / DAY_MS);
  const locked = now > graceUntil;
  const status: CompanyAccessStatus = locked
    ? "LOCKED"
    : now > subscriptionUntil
      ? "GRACE"
      : hasPaid
        ? "ACTIVE"
        : "TRIAL";
  return {
    status,
    until: subscriptionUntil,
    graceUntil,
    daysLeft,
    locked,
    needsReminder: status === "GRACE" || (!locked && daysLeft <= REMINDER_DAYS),
  };
}

export function addDays(date: Date, days: number) {
  return new Date(date.getTime() + days * DAY_MS);
}

// Tambah bulan kalender; tanggal 31 → akhir bulan tujuan bila tidak ada.
export function addMonths(date: Date, months: number) {
  const result = new Date(date);
  const day = result.getDate();
  result.setDate(1);
  result.setMonth(result.getMonth() + months);
  const lastDay = new Date(result.getFullYear(), result.getMonth() + 1, 0).getDate();
  result.setDate(Math.min(day, lastDay));
  return result;
}

// Periode langganan baru: mulai dari akhir langganan yang sedang berjalan
// bila masih di masa depan (bayar lebih awal tidak rugi); bila sudah lewat
// (termasuk masa tenggang), mulai dari sekarang.
export function nextPeriod(currentUntil: Date, months: number, now = new Date()) {
  const startsAt = currentUntil > now ? currentUntil : now;
  return { startsAt, endsAt: addMonths(startsAt, months) };
}
