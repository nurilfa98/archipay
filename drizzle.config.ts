// Konfigurasi drizzle-kit (CLI untuk membuat & menjalankan migration).
//
// drizzle-kit berjalan di luar Next.js, jadi file .env tidak dimuat otomatis.
// loadEnvConfig dari @next/env memuat .env dengan aturan yang sama seperti Next.
//
// Referensi:
// - node_modules/next/dist/docs/01-app/02-guides/environment-variables.md
//   (bagian "Loading Environment Variables with @next/env")
// - https://orm.drizzle.team/docs/drizzle-config-file

import { loadEnvConfig } from "@next/env";
import { defineConfig } from "drizzle-kit";

loadEnvConfig(process.cwd());

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/lib/db/schema.ts",
  out: "./database/migrations",
  dbCredentials: { url: process.env.DATABASE_URL! },
});
