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
import { ASSIGNABLE_ROLES } from "@/lib/auth/roles";
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

// Nomor WhatsApp tidak diminta saat tambah pengguna; diisi lewat profil
// (menu Profil) oleh pengguna sendiri. Role awal dipilih di form; boleh
// tidaknya role itu diberikan dicek di Server Action (features/users/access.ts).
export const createUserSchema = z.object({
  fullName,
  email,
  role: z.enum(ASSIGNABLE_ROLES, "Pilih role"),
});

// Nama bank dan nomor rekening harus diisi berpasangan.
function bankPairRule(data: { bankName: string | null; bankAccountNumber: string | null }, ctx: z.RefinementCtx) {
  if (data.bankAccountNumber && !data.bankName) {
    ctx.addIssue({ code: "custom", path: ["bankName"], message: "Isi nama bank untuk nomor rekening ini" });
  }
  if (data.bankName && !data.bankAccountNumber) {
    ctx.addIssue({ code: "custom", path: ["bankAccountNumber"], message: "Isi nomor rekening untuk bank ini" });
  }
}

// Data profil yang boleh diisi pengguna sendiri (menu Profil), tanpa role.
const profileShape = { fullName, email, phoneNumber, bankName, bankAccountNumber };

export const profileSchema = z.object(profileShape).superRefine(bankPairRule);

// Edit oleh pengelola pengguna: profil + role. SUPERADMIN tidak bisa dipilih.
export const updateUserSchema = z
  .object({
    ...profileShape,
    roles: z.array(z.enum(ASSIGNABLE_ROLES)).min(1, "Pilih minimal satu role"),
  })
  .superRefine(bankPairRule);

// id user yang dikirim dari browser (event handler) juga wajib divalidasi.
export const userIdSchema = z.string().min(1).max(36);
