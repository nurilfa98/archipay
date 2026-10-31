// Skema validasi form company (khusus Superadmin). Selain memvalidasi, skema
// juga merapikan data (trim, string kosong → null, nomor ke format 62...).

import { z } from "zod";
import { emailSchema, fullNameSchema } from "@/features/users/schemas";
import { normalizeIndonesianPhone } from "@/lib/phone";

const name = z
  .string()
  .trim()
  .min(2, "Nama company minimal 2 karakter")
  .max(100, "Nama company maksimal 100 karakter");

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

// Company baru selalu dibuat bersama Owner pertamanya. Password sementara
// Owner dibuat sistem dan dikirim ke emailnya.
export const createCompanySchema = companySchema.extend({
  ownerName: fullNameSchema,
  ownerEmail: emailSchema,
});

// id company yang dikirim dari browser juga wajib divalidasi.
export const companyIdSchema = z.string().min(1).max(36);
