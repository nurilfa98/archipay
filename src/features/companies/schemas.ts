// Skema validasi form company (khusus Superadmin). Selain memvalidasi, skema
// juga merapikan data (trim, string kosong → null, nomor ke format 62...).

import { z } from "zod";
import { emailSchema, fullNameSchema } from "@/features/users/schemas";
import { MAX_USERS } from "@/features/subscriptions/pricing";
import { normalizeIndonesianPhone } from "@/lib/phone";

export const MAX_FREE_DAYS = 90;

const name = z
  .string()
  .trim()
  .min(2, "Nama perusahaan minimal 2 karakter")
  .max(100, "Nama perusahaan maksimal 100 karakter");

const address = z
  .string()
  .trim()
  .max(255, "Alamat maksimal 255 karakter")
  .transform((value) => value || null);

// Opsional: kosong disimpan sebagai NULL, selain itu harus nomor Indonesia.
const phoneNumber = z.string().transform((value, ctx) => {
  if (!value.trim()) return null;
  const normalized = normalizeIndonesianPhone(value);
  if (!normalized) {
    ctx.addIssue({ code: "custom", message: "Nomor telepon tidak valid, contoh: 0812-3456-7890" });
    return z.NEVER;
  }
  return normalized;
});

export const companySchema = z.object({ name, address, phoneNumber });

// Masa gratis company baru: diisi Superadmin, nilai awal dari Pengaturan
// platform. Batas sama dengan Pengaturan platform (features/subscriptions/schemas).
const freeDays = z.coerce
  .number("Masa gratis harus berupa angka")
  .int("Masa gratis harus bilangan bulat")
  .min(1, "Masa gratis minimal 1 hari")
  .max(MAX_FREE_DAYS, `Masa gratis maksimal ${MAX_FREE_DAYS} hari`);

const trialMaxUsers = z.coerce
  .number("Batas pengguna harus berupa angka")
  .int("Batas pengguna harus bilangan bulat")
  .min(1, "Batas pengguna minimal 1")
  .max(MAX_USERS, `Batas pengguna maksimal ${MAX_USERS}`);

// Company baru selalu dibuat bersama Owner pertamanya. Password sementara
// Owner dibuat sistem dan dikirim ke emailnya.
export const createCompanySchema = companySchema.extend({
  freeDays,
  trialMaxUsers,
  ownerName: fullNameSchema,
  ownerEmail: emailSchema,
});

// id company yang dikirim dari browser juga wajib divalidasi.
export const companyIdSchema = z.string().min(1).max(36);
