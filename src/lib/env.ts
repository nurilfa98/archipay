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
  // WhatsApp via Fonnte. Opsional dengan alasan yang sama seperti email:
  // tanpa token, pesan hanya ditampilkan di terminal (lihat lib/whatsapp.ts).
  FONNTE_TOKEN: optional(z.string()),
  // Zona waktu perusahaan, dipakai untuk menghitung "hari kalender" (batas
  // unggah nota berakhir pukul 23.59 waktu setempat) dan menampilkan tanggal.
  // Diisi per deployment: Asia/Jakarta (WIB), Asia/Makassar (WITA), Asia/Jayapura (WIT).
  APP_TIMEZONE: z
    .string()
    .default("Asia/Jakarta")
    .refine(isValidTimeZone, "APP_TIMEZONE bukan zona waktu IANA yang valid, contoh: Asia/Jakarta"),
  // Cloudflare R2 untuk foto nota (lihat lib/storage.ts). Opsional: saat
  // development tanpa R2, file disimpan di folder .storage/ di proyek ini.
  R2_ACCOUNT_ID: optional(z.string()),
  R2_ACCESS_KEY_ID: optional(z.string()),
  R2_SECRET_ACCESS_KEY: optional(z.string()),
  R2_BUCKET: optional(z.string()),
  // Kunci untuk endpoint pengingat harian /api/cron/reminders (lihat
  // app/api/cron/reminders/route.ts). Tanpa kunci ini endpoint menolak semua request.
  CRON_SECRET: optional(z.string().min(16, "CRON_SECRET minimal 16 karakter")),
});

function isValidTimeZone(timeZone: string) {
  try {
    new Intl.DateTimeFormat("id-ID", { timeZone });
    return true;
  } catch {
    return false;
  }
}

export const env = envSchema
  .refine(
    (value) => {
      const r2 = [value.R2_ACCOUNT_ID, value.R2_ACCESS_KEY_ID, value.R2_SECRET_ACCESS_KEY, value.R2_BUCKET];
      return r2.every(Boolean) || !r2.some(Boolean);
    },
    "R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, dan R2_BUCKET harus diisi semua (atau dikosongkan semua)",
  )
  .parse(process.env);
