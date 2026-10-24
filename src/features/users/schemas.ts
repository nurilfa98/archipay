// Skema validasi form tambah & edit pengguna.
//
// Selain memvalidasi, skema juga MERAPIKAN data sebelum disimpan
// (trim, email huruf kecil, nomor WhatsApp ke format 62...), sehingga data di
// database selalu seragam.
//
// Referensi:
// - https://zod.dev/api#transforms
// - node_modules/next/dist/docs/01-app/02-guides/forms.md (bagian "Form validation")

import { z } from "zod";
import { ROLES } from "@/lib/auth/roles";
import { normalizeIndonesianPhone } from "@/lib/phone";

const fullName = z
  .string()
  .trim()
  .min(2, "Nama minimal 2 karakter")
  .max(100, "Nama maksimal 100 karakter");

const email = z
  .string()
  .trim()
  .toLowerCase()
  .max(100, "Email maksimal 100 karakter")
  .pipe(z.email("Format email tidak valid"));

// transform bisa sekaligus memvalidasi: kembalikan z.NEVER + addIssue bila gagal.
const phoneNumber = z.string().transform((value, ctx) => {
  const normalized = normalizeIndonesianPhone(value);
  if (!normalized) {
    ctx.addIssue({ code: "custom", message: "Nomor WhatsApp tidak valid, contoh: 0812-3456-7890" });
    return z.NEVER;
  }
  return normalized;
});

// Kolom opsional: string kosong dari form disimpan sebagai NULL.
const bankName = z
  .string()
  .trim()
  .max(50, "Nama bank maksimal 50 karakter")
  .transform((value) => value || null);

const bankAccountNumber = z
  .string()
  .transform((value) => value.replace(/[\s.-]/g, "")) // "123-456 789" → "123456789"
  .pipe(z.string().regex(/^\d{0,30}$/, "Nomor rekening hanya boleh berisi angka"))
  .transform((value) => value || null);

export const createUserSchema = z.object({ fullName, email, phoneNumber });

export const updateUserSchema = z
  .object({
    fullName,
    email,
    phoneNumber,
    bankName,
    bankAccountNumber,
    roles: z.array(z.enum(ROLES)).min(1, "Pilih minimal satu role"),
  })
  .refine((data) => !data.bankAccountNumber || data.bankName, {
    path: ["bankName"],
    message: "Isi nama bank untuk nomor rekening ini",
  })
  .refine((data) => !data.bankName || data.bankAccountNumber, {
    path: ["bankAccountNumber"],
    message: "Isi nomor rekening untuk bank ini",
  });

// id user yang dikirim dari browser (event handler) juga wajib divalidasi.
export const userIdSchema = z.string().min(1).max(36);
