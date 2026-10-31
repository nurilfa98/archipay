# ArchiPay

Project Financial Control & Petty Cash Management System. ArchiPay mencatat
**uang muka** (kas bon operasional) yang diberikan kantor ke karyawan, beserta
**pertanggungjawaban** nota, pengembalian sisa dana, penggantian kekurangan,
dan **potong gaji** bila sisa dana tidak dikembalikan. Notifikasi dan
pengingat dikirim lewat WhatsApp.

Satu deployment = satu perusahaan.

## Teknologi

- Next.js 16 (App Router, Cache Components), React 19, TypeScript
- Tailwind CSS v4 + shadcn/ui (Base UI)
- PostgreSQL + Drizzle ORM
- iron-session (login berbasis cookie), zod (validasi)
- Resend (email), Fonnte (WhatsApp), Cloudflare R2 (file nota)

## Menjalankan di komputer sendiri

Prasyarat: Node.js 20.9 atau lebih baru, pnpm 9, dan database PostgreSQL.

1. Pasang dependensi:

   ```bash
   pnpm install
   ```

2. Salin `.env.example` menjadi `.env`, lalu isi minimal `DATABASE_URL` dan
   `SESSION_SECRET` (cara generate ada di file tersebut).

3. Buat tabel database dan akun superadmin (superadmin lalu mendaftarkan
   Owner dari menu Pengguna):

   ```bash
   pnpm db:migrate
   pnpm db:create-superadmin admin@perusahaan.com passwordRahasia "Nama Superadmin"
   ```

4. Jalankan aplikasi, lalu buka [http://localhost:3000](http://localhost:3000):

   ```bash
   pnpm dev
   ```

Saat development, layanan luar boleh dikosongkan:

| Bila kosong | Yang terjadi |
|---|---|
| `RESEND_API_KEY` / `EMAIL_FROM` | Isi email (termasuk password sementara) dicetak di terminal `pnpm dev`. |
| `FONNTE_TOKEN` | Pesan WhatsApp dicetak di terminal dengan awalan `[whatsapp:dev]`. |
| `R2_*` | File nota disimpan di folder `.storage/` (tidak ikut git). |
| `CRON_SECRET` | Endpoint pengingat menolak semua request. Isi bila ingin menguji pengingat. |

Uji pengingat harian secara manual:

```bash
curl -H "Authorization: Bearer <CRON_SECRET>" http://localhost:3000/api/cron/reminders
```

## Perintah

| Perintah | Fungsi |
|---|---|
| `pnpm dev` | Server development |
| `pnpm build` / `pnpm start` | Build & jalankan versi production |
| `pnpm typecheck` | Cek tipe TypeScript |
| `pnpm lint` | Cek kode dengan ESLint |
| `pnpm db:generate` | Buat file migration baru setelah mengubah `src/lib/db/schema.ts` |
| `pnpm db:migrate` | Jalankan migration ke database |
| `pnpm db:create-superadmin` | Buat akun superadmin (sekaligus mengisi tabel role bila belum ada) |

## Dokumentasi

- [docs/BUSINESS-FLOW.md](docs/BUSINESS-FLOW.md): alur bisnis, peran, status, aturan, dan notifikasi.
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md): struktur folder, alur data, keamanan, dan cara menangani uang di kode.
- [docs/PRODUCTION-CHECKLIST.md](docs/PRODUCTION-CHECKLIST.md): yang perlu disiapkan sebelum deploy ke production.
- [database/README.md](database/README.md): isi folder migration, cara mengubah struktur database, dan riwayat migration.

Proyek ini memakai Next.js 16 yang punya perubahan besar dibanding versi
sebelumnya. Rujukan utama adalah dokumentasi versi terpasang di
`node_modules/next/dist/docs/` (lihat `AGENTS.md`).

## Deploy

Ikuti [docs/PRODUCTION-CHECKLIST.md](docs/PRODUCTION-CHECKLIST.md). Jadwal
pengingat harian untuk Vercel sudah ada di `vercel.json` (08.00 WIB).
