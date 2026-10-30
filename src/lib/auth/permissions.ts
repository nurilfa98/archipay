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
  "payroll:manage", // daftar potong gaji: ekspor & tandai sudah dipotong
  "project:manage", // kelola project: nilai kontrak, status, menetapkan project uang muka lama
  "settings:manage", // ubah kebijakan uang muka & kategori biaya
  "user:manage", // tambah/nonaktifkan user & atur role
  "audit:view", // melihat audit log
] as const;

export type Permission = (typeof PERMISSIONS)[number];

// Contoh pembagian akses; sesuaikan dengan SOP perusahaan.
// `satisfies` memastikan setiap role terdaftar dan setiap permission valid.
const ROLE_PERMISSIONS = {
  // Owner boleh semuanya, kecuali mengajukan uang muka untuk dirinya sendiri:
  // dana perusahaan memang di tangannya, dan pengajuan Owner tidak bisa
  // disetujui siapa pun (penyetuju tidak boleh penerimanya sendiri).
  OWNER: PERMISSIONS.filter((permission) => permission !== "advance:request"),
  FINANCE: [
    "advance:view-own",
    "advance:view-all",
    "advance:propose", // FINANCE tidak bisa mencairkan tanpa persetujuan OWNER
    "advance:request",
    "settlement:submit",
    "settlement:verify",
    "payroll:manage",
  ],
  EMPLOYEE: ["advance:view-own", "advance:request", "settlement:submit"],
} satisfies Record<Role, readonly Permission[]>;

// User dengan banyak role mendapat gabungan permission dari semua role-nya.
export function can(user: { roles: readonly Role[] }, permission: Permission) {
  return user.roles.some((role) => (ROLE_PERMISSIONS[role] as readonly Permission[]).includes(permission));
}
