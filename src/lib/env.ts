// Validasi environment variable sekali, saat server start.
//
// Kenapa perlu? process.env selalu bertipe `string | undefined`. Tanpa validasi,
// typo di .env baru ketahuan saat fitur itu dipakai (misalnya login gagal di
// production). Dengan zod, aplikasi langsung error di awal dengan pesan jelas.
//
// Referensi:
// - node_modules/next/dist/docs/01-app/02-guides/environment-variables.md
// - node_modules/next/dist/docs/01-app/02-guides/data-security.md
//   (bagian "Data Access Layer": rahasia hanya boleh dibaca oleh kode server)

// `server-only` membuat build GAGAL kalau file ini ter-import dari Client
// Component, sehingga rahasia tidak mungkin ikut terkirim ke browser.
import "server-only";
import { z } from "zod";

// `KEY=` (kosong, misal disalin dari .env.example) dianggap tidak diisi.
const optional = <T extends z.ZodType>(schema: T) =>
  z.preprocess((value) => (value === "" ? undefined : value), schema.optional());

const envSchema = z.object({
  DATABASE_URL: z.string().startsWith("postgres", "DATABASE_URL harus URL PostgreSQL"),
  // iron-session mewajibkan password minimal 32 karakter.
  SESSION_SECRET: z.string().min(32, "SESSION_SECRET minimal 32 karakter"),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  // Alamat aplikasi, dipakai untuk membuat link di email (misal tombol "Masuk").
  // Karena 1 deployment = 1 perusahaan, setiap deployment mengisi domainnya sendiri.
  NEXT_PUBLIC_APP_URL: z.url("NEXT_PUBLIC_APP_URL harus URL lengkap").default("http://localhost:3000"),
  // Email via Resend. Sengaja opsional: saat development tanpa API key, email
  // hanya ditampilkan di terminal (lihat lib/email.ts). Dibuat opsional juga
  // agar `pnpm build` tidak gagal di mesin yang belum punya key.
  RESEND_API_KEY: optional(z.string().startsWith("re_", "RESEND_API_KEY harus diawali re_")),
  EMAIL_FROM: optional(z.string()),
});

export const env = envSchema.parse(process.env);
