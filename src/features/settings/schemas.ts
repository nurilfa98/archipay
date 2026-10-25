// Skema validasi halaman Pengaturan (khusus OWNER).

import { z } from "zod";

const days = (label: string) =>
  z.coerce
    .number(`${label} harus berupa angka`)
    .int(`${label} harus bilangan bulat`)
    .min(1, `${label} minimal 1 hari`)
    .max(60, `${label} maksimal 60 hari`);

// Sama dengan CHECK constraint company_settings di database.
export const companySettingsSchema = z.object({
  settlementDueDays: days("Batas unggah nota"),
  returnDueDays: days("Batas pengembalian"),
  // "50.000" → 50000. 0 = biaya tanpa nota tidak diizinkan.
  noReceiptMaxAmount: z
    .string()
    .transform((value) => value.replace(/\D/g, ""))
    .pipe(z.string().min(1, "Isi batas biaya tanpa nota").max(9, "Nominal terlalu besar"))
    .transform(Number)
    .pipe(z.number().int().min(0).max(10_000_000, "Batas biaya tanpa nota maksimal Rp10.000.000")),
});

export const categoryNameSchema = z
  .string()
  .trim()
  .min(2, "Nama kategori minimal 2 karakter")
  .max(50, "Nama kategori maksimal 50 karakter");

export const categoryIdSchema = z.string().min(1).max(36);
