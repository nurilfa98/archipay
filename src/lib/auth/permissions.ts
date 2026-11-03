// SATU-SATUNYA tempat untuk mengatur "role apa boleh melakukan apa" (RBAC).
//
// Kode di halaman dan Server Action TIDAK mengecek role secara langsung
// (`roles.includes("OWNER")`), melainkan mengecek permission:
//
//     await requirePermission("settlement:verify");   // di server (lib/auth/dal.ts)
//     can(user, "audit:view")                          // untuk menampilkan/menyembunyikan UI
//
// Jadi kalau suatu hari FINANCE boleh melihat audit log, cukup ubah
// ROLE_PERMISSIONS di bawah, tanpa mencari-cari pengecekan di seluruh kode.
//
// File ini tidak memakai `server-only` karena Client Component juga memakainya
// (misalnya kotak menu menyembunyikan menu). Menyembunyikan menu hanya soal
// tampilan; pengaman sebenarnya tetap requirePermission() di server.
//
// Referensi:
// - node_modules/next/dist/docs/01-app/02-guides/authentication.md (bagian "Authorization")
// - https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html

import type { Role } from "./roles";

// Format penamaan: "<sumber-daya>:<aksi>".
export const PERMISSIONS = [
  "advance:view-own", // melihat uang muka milik sendiri
  "advance:view-all", // melihat uang muka semua karyawan
  "advance:disburse", // mencairkan uang muka langsung, tanpa persetujuan
  "advance:propose", // mengusulkan pencairan, wajib disetujui pemegang advance:approve
  "advance:approve", // menyetujui/menolak usulan & pengajuan pencairan
  "advance:request", // mengajukan uang muka untuk diri sendiri, wajib disetujui
  "settlement:submit", // upload struk / laporan penggunaan uang
  "settlement:verify", // memverifikasi struk & mencatat pengembalian/penggantian selisih
  "payroll:view", // melihat daftar potong gaji & mengekspornya ke Excel
  "payroll:manage", // menandai sisa uang muka sudah dipotong dari gaji
  "project:view-finance", // melihat nilai kontrak, keuntungan, Beranda Owner & PDF laporan project
  "project:manage", // kelola project: tambah, ubah, status, menetapkan project uang muka lama
  "settings:view", // membuka halaman Pengaturan (baca saja)
  "settings:manage", // ubah kebijakan uang muka & kategori biaya
  "user:manage", // tambah/nonaktifkan user & atur role Finance/Karyawan
  "user:manage-owner", // tambah/kelola akun Owner & memberi/mencabut role Owner
  "user:manage-employee", // tambah/kelola akun yang role-nya Karyawan saja, tanpa rekening bank (Admin HR)
  "audit:view", // melihat audit log
  "company:manage", // kelola company (klien) & masuk ke company mana pun (platform)
  "subscription:view", // menu Langganan company sendiri: pilih paket & kirim bukti bayar
  "subscription:manage", // verifikasi tagihan semua company, harga paket, Pengaturan platform
  // Absensi (BUSINESS-FLOW §18). Jam kerja, toleransi, denda & hari libur
  // memakai settings:view / settings:manage.
  "attendance:check-in", // wajib absen: daftar foto acuan wajah, absen masuk/pulang
  "attendance:view-all", // melihat absensi, lokasi & foto acuan semua orang
  "attendance:manage-locations", // tambah/ubah/nonaktifkan/impor lokasi absensi
  "attendance:approve-face", // menyetujui/menolak foto acuan wajah
  // Cuti & izin (BUSINESS-FLOW §19). Mengajukan memakai attendance:check-in;
  // melihat semua pengajuan memakai attendance:view-all.
  "leave:approve", // menyetujui/menolak cuti & izin kapan saja (Owner)
  "leave:approve-delegated", // menyetujui/menolak setelah waktu delegasi lewat (Admin HR)
] as const;

export type Permission = (typeof PERMISSIONS)[number];

// Contoh pembagian akses; sesuaikan dengan SOP perusahaan.
// `satisfies` memastikan setiap role terdaftar dan setiap permission valid.
const ROLE_PERMISSIONS = {
  // Superadmin mengelola company (klien). Setelah masuk ke sebuah company
  // (lib/auth/active-company.ts) ia membuka semua menu dan melihat semua
  // data company itu, tetapi TIDAK melakukan transaksi uang (mencairkan, menyetujui, memverifikasi,
  // mencatat potong gaji): tindakannya tidak dicatat ke audit log, jadi
  // jejak uang harus selalu milik Owner/Finance/Karyawan. Project dan
  // Pengaturan company juga baca saja (dikelola Owner). Langganan company
  // dikelola dari halaman Company/Tagihan (subscription:manage), bukan dari
  // menu Langganan milik Owner.
  SUPERADMIN: PERMISSIONS.filter(
    (permission) =>
      ![
        "subscription:view",
        "advance:disburse",
        "advance:propose",
        "advance:approve",
        "advance:request",
        "settlement:submit",
        "settlement:verify",
        "payroll:manage",
        "project:manage",
        "settings:manage",
        "attendance:check-in",
        "attendance:manage-locations",
        "attendance:approve-face",
        "leave:approve",
        "leave:approve-delegated",
      ].includes(permission),
  ),
  // Owner boleh semuanya, kecuali mengajukan uang muka untuk dirinya sendiri
  // (dana perusahaan memang di tangannya, dan pengajuan Owner tidak bisa
  // disetujui siapa pun karena penyetuju tidak boleh penerimanya sendiri),
  // serta mengelola akun Owner, company, & tagihan semua company (khusus superadmin).
  // Owner juga tidak absen (BUSINESS-FLOW §18.1).
  OWNER: PERMISSIONS.filter(
    (permission) =>
      ![
        "advance:request",
        "user:manage-owner",
        "company:manage",
        "subscription:manage",
        "attendance:check-in",
      ].includes(permission),
  ),
  FINANCE: [
    "advance:view-own",
    "advance:view-all",
    "advance:propose", // FINANCE tidak bisa mencairkan tanpa persetujuan OWNER
    "advance:request",
    "settlement:submit",
    "settlement:verify",
    "payroll:view",
    "payroll:manage",
    "attendance:check-in",
  ],
  // Admin HR mengurus absensi & akun Karyawan (features/users/access.ts).
  // Bila perlu mengajukan uang muka, beri juga role Karyawan (permission digabung).
  HR_ADMIN: [
    "user:manage-employee",
    "attendance:check-in",
    "attendance:view-all",
    "attendance:manage-locations",
    "attendance:approve-face",
    "leave:approve-delegated",
  ],
  EMPLOYEE: ["advance:view-own", "advance:request", "settlement:submit", "attendance:check-in"],
} satisfies Record<Role, readonly Permission[]>;

// User dengan banyak role mendapat gabungan permission dari semua role-nya.
export function can(user: { roles: readonly Role[] }, permission: Permission) {
  return user.roles.some((role) => (ROLE_PERMISSIONS[role] as readonly Permission[]).includes(permission));
}
