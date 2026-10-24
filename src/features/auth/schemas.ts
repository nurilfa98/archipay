// Skema validasi input form login & ganti password.
//
// Semua data dari browser dianggap tidak bisa dipercaya: atribut `required`
// atau `type="email"` di HTML bisa dilewati dengan mudah. Validasi yang
// sebenarnya terjadi di server dengan zod.
//
// Referensi:
// - node_modules/next/dist/docs/01-app/02-guides/forms.md (bagian "Form validation")
// - node_modules/next/dist/docs/01-app/02-guides/data-security.md (bagian "Validating client input")
// - https://zod.dev

import { z } from "zod";

export const loginSchema = z.object({
  // trim + lowercase dulu, baru dicek formatnya. "  Budi@Mail.com " → "budi@mail.com"
  email: z.string().trim().toLowerCase().pipe(z.email("Format email tidak valid")),
  // bcrypt hanya membaca 72 byte pertama, sisanya diabaikan diam-diam.
  password: z.string().min(1, "Password wajib diisi").max(72, "Password maksimal 72 karakter"),
});

// Aturan password baru. Dipakai juga oleh fitur lain yang membuat password.
// Minimal 8 karakter mengikuti rekomendasi OWASP/NIST: panjang lebih penting
// daripada aturan "wajib huruf besar + simbol" yang membuat orang menulis
// password di kertas.
export const newPasswordSchema = z
  .string()
  .min(8, "Password minimal 8 karakter")
  .max(72, "Password maksimal 72 karakter");

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Password saat ini wajib diisi"),
    newPassword: newPasswordSchema,
    confirmPassword: z.string(),
  })
  // refine = aturan yang melibatkan lebih dari satu field. `path` menentukan
  // di field mana pesan error ditampilkan.
  .refine((data) => data.newPassword === data.confirmPassword, {
    path: ["confirmPassword"],
    message: "Konfirmasi password tidak sama",
  })
  .refine((data) => data.newPassword !== data.currentPassword, {
    path: ["newPassword"],
    message: "Password baru harus berbeda dari password saat ini",
  });
