// Rumus harga langganan (BUSINESS-FLOW §17.1 & §17.6). Fungsi murni, dipakai server
// (harga yang disimpan di tagihan) dan browser (kalkulasi otomatis di form &
// kartu paket), sehingga angka yang dilihat Owner sama dengan yang ditagih.
//
//   harga per bulan = harga dasar + max(0, pengguna − termasuk) × harga per pengguna tambahan
//                     + pengguna × Σ harga add-on yang dipilih
//   paket N bulan   = harga per bulan × N × (100 − diskon N bulan) / 100
//   tambah kuota    = tambahan pengguna × (harga per pengguna × sisa hari
//                     + Σ harga add-on × sisa hari add-on berbayar) / 30 (prorata)
//   aktifkan add-on = batas pengguna × harga add-on × sisa hari / 30 (prorata)

import type { AddonKey } from "@/lib/addons";
import type { PlanMonths } from "./constants";

export type Pricing = {
  basePrice: number; // per bulan, 0 = paket belum dijual
  includedUsers: number; // pengguna yang sudah termasuk harga dasar
  extraUserPrice: number; // per pengguna tambahan per bulan
  discount6: number; // persen
  discount12: number; // persen
  // Harga add-on per pengguna per bulan (selalu harga standar).
  addonUserPrices: Record<AddonKey, number>;
};

export const MAX_USERS = 1000;

export function discountOf(pricing: Pricing, months: PlanMonths) {
  return months === 6 ? pricing.discount6 : months === 12 ? pricing.discount12 : 0;
}

// Total harga add-on per pengguna per bulan.
export function addonsUserPrice(pricing: Pricing, addons: readonly AddonKey[]) {
  return addons.reduce((total, key) => total + pricing.addonUserPrices[key], 0);
}

export function monthlyPrice(pricing: Pricing, users: number, addons: readonly AddonKey[] = []) {
  return (
    pricing.basePrice +
    Math.max(0, users - pricing.includedUsers) * pricing.extraUserPrice +
    users * addonsUserPrice(pricing, addons)
  );
}

export function planPrice(pricing: Pricing, months: PlanMonths, users: number, addons: readonly AddonKey[] = []) {
  return Math.round((monthlyPrice(pricing, users, addons) * months * (100 - discountOf(pricing, months))) / 100);
}

// Dibulatkan ke atas per Rp100 agar nominal transfer rapi. `addonDays` = sisa
// hari setiap add-on yang sedang aktif & sudah dibayar (pengguna tambahan
// ikut memakainya).
export function topupPrice(
  pricing: Pricing,
  extraUsers: number,
  daysLeft: number,
  addonDays: Partial<Record<AddonKey, number>> = {},
) {
  const addonPart = (Object.entries(addonDays) as [AddonKey, number][]).reduce(
    (total, [key, days]) => total + pricing.addonUserPrices[key] * Math.max(days, 0),
    0,
  );
  return roundUp100((extraUsers * (pricing.extraUserPrice * Math.max(daysLeft, 0) + addonPart)) / 30);
}

// Mengaktifkan satu add-on di tengah periode untuk semua pengguna paket.
export function addonPrice(pricing: Pricing, addon: AddonKey, users: number, days: number) {
  return roundUp100((users * pricing.addonUserPrices[addon] * Math.max(days, 0)) / 30);
}

function roundUp100(value: number) {
  return Math.ceil(value / 100) * 100;
}

// Jumlah pengguna paling sedikit yang bisa dibeli: minimal yang termasuk harga
// dasar, dan tidak kurang dari pengguna aktif saat ini.
export function minPlanUsers(pricing: Pricing, activeUsers: number) {
  return Math.min(MAX_USERS, Math.max(pricing.includedUsers, activeUsers, 1));
}
