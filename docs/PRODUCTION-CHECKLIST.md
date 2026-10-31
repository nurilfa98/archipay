# Ceklis Production ArchiPay

Hal yang perlu disiapkan agar aplikasi berjalan sesuai harapan di production.
Satu deployment melayani banyak company (multi-tenant): bagian 1–8 dijalankan
sekali per deployment, bagian 9 untuk setiap company baru. Contoh nilai dan cara generate kunci ada di `.env.example`; alur
bisnisnya ada di [BUSINESS-FLOW.md](./BUSINESS-FLOW.md).

Ditulis berdasarkan kode per 31 Oktober 2026.

---

## 1. Database (PostgreSQL)

- [ ] Siapkan database production yang **terpisah** dari database development, lalu isi `DATABASE_URL`.
- [ ] Jalankan `pnpm db:migrate`. Pengaturan bawaan dan 6 kategori biaya dibuat otomatis untuk setiap company baru.
- [ ] **Connection pooling.** Di serverless (Vercel), setiap instance membuka koneksinya sendiri (bawaan postgres.js: 10 koneksi), jadi pakai URL *pooler* dari provider database.
- [ ] ⚠️ Bila pooler memakai mode *transaction* (misal Supabase port 6543), postgres.js wajib diberi opsi `prepare: false` di `src/lib/db/index.ts`. Saat ini opsi tersebut **belum** diatur.
- [ ] Aktifkan backup otomatis harian.

## 2. Akun superadmin & company pertama

- [ ] Jalankan `pnpm db:create-superadmin <email> <password> "Nama"`.
- [ ] Login, lalu **langsung ganti password** lewat menu user → Ganti password, karena password tadi tersimpan di riwayat terminal.
- [ ] Isi **Pengaturan platform** sebelum membuat company: harga dasar per bulan, jumlah pengguna termasuk, harga per pengguna tambahan, diskon 6 bulan & 1 tahun, masa gratis (bawaan 14 hari) & tenggang (3 hari), batas pengguna masa gratis (10), nomor WhatsApp admin, rekening bank dan/atau gambar QRIS. Tanpa harga dasar, Owner tidak bisa memilih paket.
- [ ] Buat company (klien) beserta Owner pertamanya lewat menu **Company** → Tambah company. Password sementara dikirim ke email Owner, dan masa gratis dimulai saat itu.

## 3. Environment variables

| Variabel | Wajib | Catatan |
|---|:---:|---|
| `DATABASE_URL` | ✓ | Lihat bagian 1. |
| `SESSION_SECRET` | ✓ | Minimal 32 karakter, **berbeda** dari development. |
| `NEXT_PUBLIC_APP_URL` | ✓ | Domain production lengkap dengan `https://`. Isi **sebelum build**, karena variabel `NEXT_PUBLIC_` ditanam saat build. Dipakai untuk link di WhatsApp & email. |
| `APP_TIMEZONE` | ✓ | `Asia/Jakarta` (WIB), `Asia/Makassar` (WITA), atau `Asia/Jayapura` (WIT). Menentukan batas pukul 23.59 dan "besok" pada pengingat. |
| `RESEND_API_KEY`, `EMAIL_FROM` | ✓ | Lihat bagian 4. |
| `FONNTE_TOKEN` | ✓ | Lihat bagian 5. |
| `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET` | ✓ | Lihat bagian 6. Diisi keempatnya atau tidak sama sekali. |
| `CRON_SECRET` | ✓ | Lihat bagian 7. |

Aplikasi memvalidasi variabel ini saat start (`src/lib/env.ts`) dan langsung
gagal dengan pesan jelas bila formatnya salah.

## 4. Email (Resend)

Dipakai untuk mengirim password sementara saat akun dibuat dan saat password di-reset.

- [ ] Isi `RESEND_API_KEY`.
- [ ] Verifikasi domain pengirim di Resend, lalu isi `EMAIL_FROM`, misalnya `ArchiPay <noreply@domainanda.com>`.
- [ ] Tanpa ini, pengguna tetap terbuat di production tetapi email password sementaranya **tidak terkirim**.

## 5. WhatsApp (Fonnte)

- [ ] Isi `FONNTE_TOKEN` (menu Device di Fonnte).
- [ ] Pastikan device sudah tersambung (scan QR) dan paket/kuota aktif.
- [ ] Pakai **nomor khusus aplikasi**, bukan nomor pribadi. Nomor yang dianggap spam bisa diblokir WhatsApp.
- [ ] Tanpa token, pesan di production **tidak terkirim** dan hanya tercatat sebagai error di log server.

## 6. Penyimpanan nota (Cloudflare R2)

- [ ] Buat bucket **privat** (jangan aktifkan akses publik).
- [ ] Buat API token dengan izin Object Read & Write yang dibatasi ke bucket tersebut, lalu isi keempat variabel `R2_*`.
- [ ] Tanpa R2, **unggah nota gagal** di production.
- [ ] File dari development (folder `.storage/`) tidak ikut pindah ke R2.

## 7. Pengingat harian (cron)

- [ ] Isi `CRON_SECRET` (minimal 16 karakter). Tanpa nilai ini, endpoint pengingat menolak semua request.
- [ ] Cron yang sama juga mengirim pengingat masa aktif langganan H-3/H-1 ke Owner (WhatsApp & email). Penguncian company tidak bergantung pada cron.
- [ ] **Vercel:** jadwal sudah ada di `vercel.json` (`0 1 * * *` = 08.00 WIB), dan Vercel mengirim header otorisasinya otomatis.
- [ ] **Hosting lain:** pasang penjadwal (crontab, cron-job.org, dll) seperti contoh di `.env.example`.
- [ ] Uji sekali; respons harus `{"ok":true,...}`:

  ```bash
  curl -H "Authorization: Bearer <CRON_SECRET>" https://domain-anda/api/cron/reminders
  ```

## 8. Hosting

- [ ] Wajib **HTTPS**: cookie login hanya dikirim lewat HTTPS di production.
- [ ] ⚠️ **Vercel:** batas ukuran request 4,5 MB, sedangkan file nota boleh sampai 4 MB plus isian form. Masih masuk tetapi tipis, jadi uji unggah PDF berukuran sekitar 4 MB.
- [ ] **Self-hosting:** pakai server Node yang terus berjalan (`pnpm build && pnpm start`) agar notifikasi yang dikirim setelah respons (`after()`) sempat selesai.

## 9. Data awal di aplikasi (per company)

Dikerjakan Owner company tersebut (Superadmin hanya bisa melihat).

- [ ] Tinjau **Pengaturan**: batas unggah nota (bawaan 3 hari), batas pengembalian (3 hari), batas biaya tanpa nota (Rp50.000).
- [ ] Sesuaikan **kategori biaya** dengan kebutuhan perusahaan.
- [ ] Buat pengguna beserta role-nya.
- [ ] Isi **nomor WhatsApp** setiap pengguna, satu nomor untuk satu orang. Tanpa nomor, pengguna tidak menerima WhatsApp.
- [ ] Isi **rekening bank** pengguna yang akan menerima dana lewat Transfer.

## 10. Legal & SOP

- [ ] Minta HR/konsultan hukum mengecek **teks persetujuan potong gaji** (`buildAcknowledgmentText` di `src/features/advances/service.ts`, dasar PP 36/2021). Teks ini disimpan sebagai bukti, jadi sebaiknya final sebelum dipakai.
- [ ] Sepakati SOP dengan bagian penggajian: total potongan maksimal **50% upah per periode** dicek manual, karena ArchiPay tidak menyimpan data gaji.

## 11. Sebelum go-live

- [ ] Pastikan database production bersih dari data uji.
- [ ] Jalankan `pnpm build` dengan env production.
- [ ] Uji alur penuh dan cek hasilnya:
  1. Buat pengguna → email password sementara masuk.
  2. Karyawan mengajukan → Owner menerima WhatsApp.
  3. Owner menyetujui → catat pencairan → karyawan menerima WhatsApp.
  4. Karyawan konfirmasi → unggah nota → foto tersimpan di R2 dan bisa dibuka.
  5. Verifikasi → catat pengembalian.
  6. Cek semua langkah tercatat di **Audit Log**.
- [ ] Putuskan [catatan terbuka di BUSINESS-FLOW.md](./BUSINESS-FLOW.md#18-catatan-terbuka). Yang paling penting: karyawan yang tidak pernah mengirim nota tidak pernah masuk daftar Potong Gaji.
