// Rumus harga langganan (BUSINESS-FLOW §17.1). Fungsi murni, dipakai server
// (harga yang disimpan di tagihan) dan browser (kalkulasi otomatis di form &
// kartu paket), sehingga angka yang dilihat Owner sama dengan yang ditagih.
//
//   harga per bulan = harga dasar + max(0, pengguna − termasuk) × harga per pengguna tambahan
//   paket N bulan   = harga per bulan × N × (100 − diskon N bulan) / 100
//   tambah kuota    = tambahan pengguna × harga per pengguna × sisa hari / 30 (prorata)

import type { PlanMonths } from "./constants";

export type Pricing = {
  basePrice: number; // per bulan, 0 = paket belum dijual
  includedUsers: number; // pengguna yang sudah termasuk harga dasar
  extraUserPrice: number; // per pengguna tambahan per bulan
  discount6: number; // persen
  discount12: number; // persen
};

export const MAX_USERS = 1000;

export function discountOf(pricing: Pricing, months: PlanMonths) {
  return months === 6 ? pricing.discount6 : months === 12 ? pricing.discount12 : 0;
}

export function monthlyPrice(pricing: Pricing, users: number) {
  return pricing.basePrice + Math.max(0, users - pricing.includedUsers) * pricing.extraUserPrice;
}

export function planPrice(pricing: Pricing, months: PlanMonths, users: number) {
  return Math.round((monthlyPrice(pricing, users) * months * (100 - discountOf(pricing, months))) / 100);
}

// Dibulatkan ke atas per Rp100 agar nominal transfer rapi.
export function topupPrice(pricing: Pricing, extraUsers: number, daysLeft: number) {
  const raw = (extraUsers * pricing.extraUserPrice * Math.max(daysLeft, 0)) / 30;
  return Math.ceil(raw / 100) * 100;
}

// Jumlah pengguna paling sedikit yang bisa dibeli: minimal yang termasuk harga
// dasar, dan tidak kurang dari pengguna aktif saat ini.
export function minPlanUsers(pricing: Pricing, activeUsers: number) {
  return Math.min(MAX_USERS, Math.max(pricing.includedUsers, activeUsers, 1));
}
