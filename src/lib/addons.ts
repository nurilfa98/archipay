// Add-on langganan (BUSINESS-FLOW §17.6): daftar add-on dan aturan masa
// aktifnya. Fungsi murni tanpa database, dipakai server & browser (harga di
// form Langganan, permission di lib/auth/permissions.ts). Query-nya ada di
// lib/addons-db.ts.
//
// Sebuah add-on aktif bila salah satu:
// 1. Masa gratis: belum ada paket lunas yang periodenya sudah mulai, dan masa
//    aktif company belum habis. (Owner yang membayar lebih awal tetap
//    memakainya sampai paket pertamanya mulai.)
// 2. Ada tagihan lunas yang termasuk add-on itu (PLAN yang dicentang, atau
//    ADDON) yang periodenya mencakup saat ini.
// Tidak ada masa tenggang untuk add-on: begitu periodenya habis, add-on
// berhenti walau company masih dalam masa tenggang langganan.
//
// Aturan yang sama ditulis dua kali: addonActiveSql() (lib/addons-db.ts) untuk
// query banyak company sekaligus, dan addonCoverage() di bawah untuk
// tanggal-tanggal di halaman Langganan. Ubah keduanya bersamaan.
//
// Menambah add-on baru: tambahkan kuncinya di ADDON_KEYS, kolom boolean
// bernama sama di tabel subscriptions, harga di platform_settings, dan
// permission-nya di lib/auth/permissions.ts (ADDON_PERMISSIONS).

const DAY_MS = 24 * 60 * 60 * 1000;

export const ADDON_KEYS = ["attendance", "payroll"] as const;
export type AddonKey = (typeof ADDON_KEYS)[number];

// Add-on yang aktif untuk sebuah company (lib/auth/dal.ts → user.company).
export type AddonFlags = Record<AddonKey, boolean>;

export const ADDON_LABELS: Record<AddonKey, string> = {
  attendance: "Absensi",
  payroll: "Penggajian",
};

export const ADDON_DESCRIPTIONS: Record<AddonKey, string> = {
  attendance: "Absen selfie + GPS, cuti & izin, dan denda keterlambatan ke Potong Gaji.",
  payroll: "Data gaji karyawan, penggajian bulanan otomatis, dan Slip Gaji PDF.",
};

export function isAddonKey(value: unknown): value is AddonKey {
  return typeof value === "string" && (ADDON_KEYS as readonly string[]).includes(value);
}

export function addonKeysOf(flags: Partial<AddonFlags>): AddonKey[] {
  return ADDON_KEYS.filter((key) => flags[key]);
}

// Periode tagihan lunas (PLAN/ADDON) beserta add-on yang termasuk di dalamnya.
export type CoveragePeriod = AddonFlags & { kind: string; startsAt: Date; endsAt: Date };

export type AddonCoverage = {
  active: boolean;
  // Aktif karena masa gratis (bukan karena dibayar), dan kapan masa gratis
  // itu berakhir (paket pertama mulai / masa gratis habis).
  trial: boolean;
  trialEnd: Date | null;
  // Aktif sampai (termasuk periode berikutnya yang sudah dibayar dengan
  // add-on ini dan bersambung). null bila tidak aktif.
  until: Date | null;
  // Bila add-on dibeli sekarang (ADDON): berlaku sampai akhir masa aktif, atau
  // sampai periode berikutnya yang sudah termasuk add-on ini (agar tidak dobel bayar).
  addonEnd: Date;
};

export function addonCoverage(
  periods: readonly CoveragePeriod[],
  key: AddonKey,
  subscriptionUntil: Date,
  now = new Date(),
): AddonCoverage {
  const plans = periods.filter((period) => period.kind === "PLAN");
  const included = periods.filter((period) => period[key] && (period.kind === "PLAN" || period.kind === "ADDON"));

  const trial = !plans.some((period) => period.startsAt <= now) && subscriptionUntil > now;
  const covering = included.filter((period) => period.startsAt <= now && period.endsAt > now);
  const active = trial || covering.length > 0;

  const trialEnd = trial ? (earliest(plans.map((period) => period.startsAt)) ?? subscriptionUntil) : null;
  let until: Date | null = null;
  if (active) {
    let end = trialEnd ?? new Date(Math.max(...covering.map((period) => period.endsAt.getTime())));
    // Sambung dengan periode berikutnya yang juga termasuk add-on ini.
    for (;;) {
      const next = included.find((period) => period.startsAt <= end && period.endsAt > end);
      if (!next) break;
      end = next.endsAt;
    }
    until = end;
  }

  const nextIncluded = earliest(included.filter((period) => period.startsAt > now).map((period) => period.startsAt));
  const addonEnd = nextIncluded && nextIncluded < subscriptionUntil ? nextIncluded : subscriptionUntil;

  return { active, trial, trialEnd, until, addonEnd };
}

// Hari tersisa sampai `date`, dibulatkan ke atas (sama dengan CompanyAccess.daysLeft).
export function daysUntil(date: Date, now = new Date()) {
  return Math.max(0, Math.ceil((date.getTime() - now.getTime()) / DAY_MS));
}

// Sisa hari add-on yang SUDAH DIBAYAR (hari masa gratis tidak dihitung), untuk
// harga add-on pengguna tambahan (tambah kuota).
export function paidAddonDays(coverage: AddonCoverage, now = new Date()) {
  if (!coverage.until) return 0;
  return Math.max(0, daysUntil(coverage.until, now) - (coverage.trialEnd ? daysUntil(coverage.trialEnd, now) : 0));
}

// "aktif s.d. 10 Des 2026" / "aktif selama masa gratis (s.d. …)" / "tidak aktif".
export function isTrialOnly(coverage: AddonCoverage) {
  return coverage.trial && coverage.until?.getTime() === coverage.trialEnd?.getTime();
}

function earliest(dates: Date[]) {
  return dates.length ? new Date(Math.min(...dates.map((date) => date.getTime()))) : null;
}
