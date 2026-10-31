// Membuat akun SUPERADMIN, karena belum ada halaman register.
// Sekaligus mengisi tabel roles (SUPERADMIN, OWNER, FINANCE, EMPLOYEE) bila belum ada.
//
// Cara pakai (jalankan setelah pnpm db:migrate):
//   pnpm db:create-superadmin admin@archipay.id passwordRahasia "Nama Superadmin"
//
// Urutannya: superadmin membuat company (klien) beserta Owner pertamanya di
// menu Company, lalu Owner mendaftarkan Finance & Karyawan. Superadmin tidak
// terikat company mana pun (users.company_id NULL), tidak tampil di UI mana
// pun, dan tindakannya tidak dicatat ke audit log.
//
// Catatan: password yang diketik di terminal tersimpan di riwayat shell.
// Setelah login, ganti password lewat menu user → "Ganti password".

import nextEnv from "@next/env";
import bcrypt from "bcryptjs";
import postgres from "postgres";

nextEnv.loadEnvConfig(process.cwd());

const [email, password, fullName = "Superadmin"] = process.argv.slice(2);

if (!email || !password) {
  console.error('Cara pakai: pnpm db:create-superadmin <email> <password> ["Nama Lengkap"]');
  process.exit(1);
}

const sql = postgres(process.env.DATABASE_URL);

try {
  // ON CONFLICT DO NOTHING membuat script aman dijalankan berulang kali.
  for (const name of ["SUPERADMIN", "OWNER", "FINANCE", "EMPLOYEE"]) {
    await sql`insert into roles (id, name) values (${crypto.randomUUID()}, ${name}) on conflict (name) do nothing`;
  }

  // Cost 12, sama dengan src/lib/auth/password.ts
  const passwordHash = await bcrypt.hash(password, 12);
  const userId = crypto.randomUUID();

  // Transaksi: user dan role-nya tersimpan bersamaan, atau tidak sama sekali.
  await sql.begin(async (tx) => {
    await tx`
      insert into users (id, full_name, email, password_hash)
      values (${userId}, ${fullName}, ${email.trim().toLowerCase()}, ${passwordHash})`;
    await tx`
      insert into user_roles (user_id, role_id)
      select ${userId}, id from roles where name = 'SUPERADMIN'`;
  });

  console.log(`✓ Akun SUPERADMIN dibuat: ${email}`);
} finally {
  await sql.end();
}
