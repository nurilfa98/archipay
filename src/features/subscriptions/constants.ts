// Konstanta fitur langganan yang dipakai server & browser (BUSINESS-FLOW §17).

import type { Tone } from "@/components/tone-badge";

// Status tagihan (subscriptions). Owner menekan "Saya sudah bayar" + bukti →
// CLAIMED. Superadmin memeriksa bukti dan mengisi nominal yang masuk: cukup →
// ACTIVE (lunas); kurang → UNDERPAID (Owner mengirim bukti kekurangan pada
// tagihan yang sama → CLAIMED lagi); dana tidak masuk / bukti palsu →
// REJECTED (status akhir, Owner mulai lagi dari pilihan paket).
export const SUBSCRIPTION_STATUSES = ["CLAIMED", "UNDERPAID", "ACTIVE", "REJECTED"] as const;
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];

export const SUBSCRIPTION_STATUS_LABELS: Record<SubscriptionStatus, string> = {
  CLAIMED: "Menunggu verifikasi",
  UNDERPAID: "Kurang bayar",
  ACTIVE: "Lunas",
  REJECTED: "Ditolak",
};

export const SUBSCRIPTION_STATUS_TONES: Record<SubscriptionStatus, Tone> = {
  CLAIMED: "active",
  UNDERPAID: "warning",
  ACTIVE: "success",
  REJECTED: "danger",
};

// Tagihan yang belum selesai; satu company hanya boleh punya satu (dijaga
// unique index subscriptions_company_open_unique).
export const OPEN_SUBSCRIPTION_STATUSES = ["CLAIMED", "UNDERPAID"] as const;

export const PAYMENT_STATUSES = ["PENDING", "ACCEPTED", "REJECTED"] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  PENDING: "Menunggu verifikasi",
  ACCEPTED: "Diterima",
  REJECTED: "Ditolak",
};

export const PAYMENT_STATUS_TONES: Record<PaymentStatus, Tone> = {
  PENDING: "active",
  ACCEPTED: "success",
  REJECTED: "danger",
};

// Bukti transfer: foto/screenshot atau PDF, maksimal 4 MB (sama dengan nota).
export const PROOF_MAX_BYTES = 4 * 1024 * 1024;
export const PROOF_TYPES = ["image/png", "image/jpeg", "image/webp", "application/pdf"] as const;

// Gambar QRIS statis (Pengaturan platform).
export const QRIS_MAX_BYTES = 2 * 1024 * 1024;
export const QRIS_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;

// Periode paket yang dijual. Harga dihitung dari jumlah pengguna (pricing.ts).
export const PLAN_MONTHS = [1, 6, 12] as const;
export type PlanMonths = (typeof PLAN_MONTHS)[number];

export const PLAN_LABELS: Record<PlanMonths, string> = {
  1: "1 bulan",
  6: "6 bulan",
  12: "1 tahun",
};

// PLAN = paket 1/6/12 bulan; TOPUP = tambah kuota pengguna untuk sisa masa aktif.
export const SUBSCRIPTION_KINDS = ["PLAN", "TOPUP"] as const;
export type SubscriptionKind = (typeof SUBSCRIPTION_KINDS)[number];
