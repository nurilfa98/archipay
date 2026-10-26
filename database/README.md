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
- Data awal yang wajib ada (pengaturan perusahaan, kategori biaya) diisi lewat migration, sehingga database baru langsung siap setelah `pnpm db:migrate`. Akun Owner pertama dibuat terpisah lewat `pnpm db:create-owner` (lihat `scripts/create-owner.mjs`).

## Riwayat migration

| File | Isi |
|---|---|
| `0000_giant_leopardon` | Tabel `users`, `roles`, `user_roles`. Nama acak bawaan drizzle-kit untuk migration pertama, dibiarkan agar riwayat tidak berubah. |
| `0001_audit_logs_login_attempts` | Tabel `audit_logs` dan `login_attempts` (rate limit login). |
| `0002_users_password_session` | Kolom `must_change_password` dan `session_version` di `users`. |
| `0003_advances_company_settings` | Tabel `advance_requests` dan `company_settings`. *Manual:* baris pengaturan bawaan (nota 3 hari, pengembalian 3 hari, tanpa nota maks. Rp50.000). |
| `0004_advance_monthly_number` | Nomor uang muka per bulan (`UM-2026-10-0001`): kolom periode + tabel `document_sequences`. *Manual:* menomori ulang data lama. |
| `0005_settlements_ledger` | Tabel `settlements`, `settlement_items`, `expense_categories`, `advance_ledger_entries`. *Manual:* 6 kategori biaya awal, dan baris ledger untuk uang muka yang sudah dikonfirmasi sebelumnya. |
| `0006_settlement_drafts` | *Manual:* membuat draf pertanggungjawaban untuk uang muka yang sudah dikonfirmasi sebelum draf dibuat otomatis. |
| `0007_returns_reminders` | Kolom `method`, `reference`, `payroll_period` di ledger + tabel `reminder_logs`. |
| `0008_audit_logs_created_at` | Index `created_at` di `audit_logs` (filter Audit Log). |
