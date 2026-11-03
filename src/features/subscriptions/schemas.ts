// Skema validasi fitur langganan: input dari browser wajib divalidasi ulang.

import { z } from "zod";
import { ADDON_KEYS } from "@/lib/addons";
import { normalizeIndonesianPhone } from "@/lib/phone";
import { PLAN_MONTHS, type PlanMonths } from "./constants";
import { MAX_USERS } from "./pricing";

export const idSchema = z.string().min(1).max(36);

// "6" dari form → 6, dan harus salah satu dari PLAN_MONTHS.
export const planMonthsSchema = z.coerce
  .number()
  .int()
  .refine((value): value is PlanMonths => (PLAN_MONTHS as readonly number[]).includes(value), {
    message: "Pilih paket",
  });

const note = z
  .string()
  .trim()
  .max(255, "Catatan maksimal 255 karakter")
  .transform((value) => value || null);

// "1.500.000" → 1500000. `min` 0 untuk harga standar (0 = belum diatur).
const rupiah = (label: string, min = 0) =>
  z
    .string()
    .transform((value) => value.replace(/\D/g, ""))
    .pipe(z.string().min(1, `Isi ${label.toLowerCase()}`).max(11, `${label} terlalu besar`))
    .transform(Number)
    .pipe(z.number().int().min(min, min > 0 ? `${label} minimal Rp${min.toLocaleString("id-ID")}` : undefined));

// Kosong = tidak memakai harga khusus untuk komponen itu.
const optionalRupiah = (label: string, min: number) =>
  z.string().transform((value, ctx) => {
    if (!value.replace(/\D/g, "")) return null;
    const result = rupiah(label, min).safeParse(value);
    if (!result.success) {
      for (const issue of result.error.issues) ctx.addIssue({ code: "custom", message: issue.message });
      return z.NEVER;
    }
    return result.data;
  });

const userCount = (label: string) =>
  z.coerce
    .number(`${label} harus berupa angka`)
    .int(`${label} harus bilangan bulat`)
    .min(1, `${label} minimal 1`)
    .max(MAX_USERS, `${label} maksimal ${MAX_USERS}`);

// Centang add-on dari form ("1" = dipilih; kosong/"0" = tidak). Nama field =
// kunci add-on (lib/addons.ts).
const addonFlag = z
  .enum(["0", "1"])
  .optional()
  .transform((value) => value === "1");

// Owner menekan "Saya sudah bayar", salah satu dari:
// - paket baru: months + users (jumlah pengguna yang dibeli) + centang add-on
// - tambah kuota: kind TOPUP + users (tambahan pengguna)
// - add-on di tengah periode: kind ADDON + addon (pengguna = batas saat ini)
// - melengkapi kurang bayar: subscriptionId
// Bukti (file) divalidasi di action; harga selalu dihitung ulang di server.
export const claimPaymentSchema = z.object({
  kind: z.enum(["PLAN", "TOPUP", "ADDON"]).default("PLAN"),
  months: planMonthsSchema.optional(),
  users: userCount("Jumlah pengguna").optional(),
  attendance: addonFlag,
  payroll: addonFlag,
  addon: z.enum(ADDON_KEYS).optional(),
  subscriptionId: idSchema.optional(),
  note,
});

// Superadmin menerima pembayaran: nominal yang benar-benar masuk.
export const acceptPaymentSchema = z.object({
  amount: rupiah("Nominal diterima", 1),
  note,
});

// Superadmin menolak pembayaran: alasan WAJIB, tampil ke Owner.
export const rejectPaymentSchema = z.object({
  reason: z.string().trim().min(5, "Tulis alasan penolakan (minimal 5 karakter)").max(255, "Alasan maksimal 255 karakter"),
});

// Superadmin mencatat pembayaran langsung (tunai/transfer saat kunjungan).
export const directPaymentSchema = z.object({
  companyId: idSchema,
  months: planMonthsSchema,
  users: userCount("Jumlah pengguna"),
  attendance: addonFlag,
  payroll: addonFlag,
  note,
});

const percent = (label: string) =>
  z.coerce
    .number(`${label} harus berupa angka`)
    .int(`${label} harus bilangan bulat`)
    .min(0, `${label} minimal 0%`)
    .max(90, `${label} maksimal 90%`);

// Komponen harga standar (Pengaturan platform). Sama dengan CHECK constraint
// platform_settings. Harga dasar 0 = paket belum dijual.
export const pricingSchema = z.object({
  basePrice: rupiah("Harga dasar per bulan"),
  includedUsers: userCount("Pengguna termasuk"),
  extraUserPrice: rupiah("Harga per pengguna tambahan"),
  discount6: percent("Diskon 6 bulan"),
  discount12: percent("Diskon 1 tahun"),
  attendanceUserPrice: rupiah("Harga add-on Absensi"),
  payrollUserPrice: rupiah("Harga add-on Penggajian"),
});

// Harga khusus satu company; kosong = ikut standar.
export const companyPricingSchema = z.object({
  companyId: idSchema,
  basePrice: optionalRupiah("Harga dasar per bulan", 1),
  includedUsers: z.string().transform((value, ctx) => {
    if (!value.trim()) return null;
    const result = userCount("Pengguna termasuk").safeParse(value);
    if (!result.success) {
      for (const issue of result.error.issues) ctx.addIssue({ code: "custom", message: issue.message });
      return z.NEVER;
    }
    return result.data;
  }),
  extraUserPrice: optionalRupiah("Harga per pengguna tambahan", 0),
  note,
});

const days = (label: string, max: number) =>
  z.coerce
    .number(`${label} harus berupa angka`)
    .int(`${label} harus bilangan bulat`)
    .min(0, `${label} minimal 0 hari`)
    .max(max, `${label} maksimal ${max} hari`);

// Sama dengan CHECK constraint platform_settings_receipt_retention_check.
// Absensi: masa simpan selfie & ambang kecocokan wajah (BUSINESS-FLOW §18).
export const attendancePlatformSchema = z.object({
  attendanceSelfieRetentionMonths: z.coerce
    .number("Masa simpan selfie harus berupa angka")
    .int("Masa simpan selfie harus bilangan bulat")
    .min(1, "Masa simpan selfie minimal 1 bulan")
    .max(24, "Masa simpan selfie maksimal 24 bulan"),
  faceMatchThreshold: z.coerce
    .number("Ambang kecocokan harus berupa angka")
    .int("Ambang kecocokan harus bilangan bulat")
    .min(30, "Ambang kecocokan minimal 30")
    .max(95, "Ambang kecocokan maksimal 95"),
});

export const RECEIPT_RETENTION_MAX_MONTHS = 120;
export const receiptRetentionSchema = z.object({
  receiptRetentionMonths: z.coerce
    .number("Masa simpan nota harus berupa angka")
    .int("Masa simpan nota harus bilangan bulat")
    .min(1, "Masa simpan nota minimal 1 bulan")
    .max(RECEIPT_RETENTION_MAX_MONTHS, `Masa simpan nota maksimal ${RECEIPT_RETENTION_MAX_MONTHS} bulan`),
});

// Sama dengan CHECK constraint platform_settings.
export const platformSettingsSchema = z.object({
  freeDays: days("Masa gratis", 90),
  graceDays: days("Masa tenggang", 30),
  trialMaxUsers: userCount("Batas pengguna masa gratis"),
  adminPhone: z.string().transform((value, ctx) => {
    if (!value.trim()) return null;
    const normalized = normalizeIndonesianPhone(value);
    if (!normalized) {
      ctx.addIssue({ code: "custom", message: "Nomor WhatsApp tidak valid, contoh: 0812-3456-7890" });
      return z.NEVER;
    }
    return normalized;
  }),
});

export const bankAccountSchema = z.object({
  bankName: z.string().trim().min(2, "Nama bank minimal 2 karakter").max(50, "Nama bank maksimal 50 karakter"),
  accountNumber: z
    .string()
    .transform((value) => value.replace(/\D/g, ""))
    .pipe(z.string().min(5, "Nomor rekening minimal 5 digit").max(30, "Nomor rekening maksimal 30 digit")),
  accountName: z.string().trim().min(2, "Nama pemilik rekening minimal 2 karakter").max(100),
});
