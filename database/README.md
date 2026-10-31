# Database

Folder ini berisi **migration** PostgreSQL yang dibuat oleh drizzle-kit.
Sumber kebenaran struktur tabel adalah `src/lib/db/schema.ts`; file SQL di
sini adalah riwayat perubahannya, dijalankan berurutan ke setiap database.

```
database/
└── migrations/
    ├── 0000_….sql … 0008_….sql   # perubahan struktur, urut dari yang paling lama
    └── meta/
        ├── _journal.json          # daftar & urutan migration (dibaca drizzle-kit)
        └── NNNN_snapshot.json     # potret schema setelah tiap migration
```

Lokasi folder diatur di `drizzle.config.ts` (`out: "./database/migrations"`).

## Cara mengubah struktur database

1. Ubah tabel/kolom di `src/lib/db/schema.ts`.
2. Buat migration baru:

   ```bash
   pnpm db:generate --name=nama_singkat_perubahan
   ```

3. **Periksa file SQL yang dihasilkan.** Bila perubahan butuh mengisi atau
   memindahkan data lama (misal kolom baru yang `NOT NULL`), sunting file
   tersebut dan tandai bagian tambahan dengan komentar
   `-- Ditambahkan manual: …` beserta alasannya.
4. Jalankan ke database:

   ```bash
   pnpm db:migrate
   ```

5. Commit file SQL **dan** perubahan di `meta/` bersama perubahan `schema.ts`.

## Aturan

- **Jangan mengubah, mengganti nama, atau menghapus migration yang sudah dijalankan** di database mana pun (terutama production). drizzle-kit mencatat migration yang sudah dijalankan di tabel `drizzle.__drizzle_migrations`; perubahan berikutnya selalu dibuat sebagai migration baru.
- Jangan menyunting `meta/` secara manual. File di sana dibuat dan dibaca drizzle-kit.
- Migration hanya membuat struktur tabel. Data awal per company (pengaturan bawaan & 6 kategori biaya) dibuat aplikasi saat Superadmin menambah company (`features/companies/actions.ts`). Tabel `roles` dan akun superadmin diisi lewat `pnpm db:create-superadmin` (lihat `scripts/create-superadmin.mjs`).

## Riwayat migration

Riwayat migration di-reset pada 31 Oktober 2026 saat ArchiPay menjadi
multi-tenant (belum ada klien aktif, data lama hanya data uji). Database lama
tidak bisa di-upgrade ke migration ini: buat database baru, lalu jalankan
`pnpm db:migrate` dan `pnpm db:create-superadmin`.

| File | Isi |
|---|---|
| `0000_init` | Seluruh tabel: `companies` (tenant), `users` (+`company_id`, NULL hanya untuk superadmin), `roles`, `user_roles`, `audit_logs`, `login_attempts`, `company_settings` (satu baris per company), `projects`, `advance_requests`, `document_sequences` (nomor per company), `expense_categories`, `settlements`, `settlement_items`, `advance_ledger_entries`, `reminder_logs`. Nama project, nomor UM/PJ, nama kategori, dan hash file nota unik per company. |
| `0001_subscriptions` | Langganan: `companies.subscription_until` & `last_reminder_key`, `platform_settings`, `payment_bank_accounts`, `subscription_plans`, `company_plan_prices`, `subscriptions` (maks. satu tagihan terbuka per company, dijaga unique index parsial), `subscription_payments`. Company yang sudah ada mendapat masa gratis 14 hari sejak dibuat. |
| `0002_drop_plan_prices` | Hapus `subscription_plans` & `company_plan_prices` (harga flat per paket diganti harga dasar + per pengguna). |
| `0003_user_based_pricing` | `companies.user_limit` (batas pengguna aktif), komponen harga & batas pengguna masa gratis di `platform_settings`, `company_pricing` (harga khusus per komponen), `subscriptions.kind` (`PLAN`/`TOPUP`) & `users`; `months` boleh kosong untuk tambah kuota. Tagihan uji yang sudah ada dianggap 10 pengguna. |
