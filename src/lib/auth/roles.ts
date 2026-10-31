// Daftar role disimpan sebagai konstanta (bukan string bebas) supaya TypeScript
// menangkap typo seperti "FINANCES". File ini TIDAK memakai `server-only`
// karena Client Component juga boleh memakainya, misalnya untuk menyembunyikan
// tombol. Ingat: menyembunyikan tombol bukan pengaman, pengecekan sebenarnya
// tetap di server (lib/auth/dal.ts).

//
// SUPERADMIN = akun pengelola aplikasi, dibuat lewat scripts/create-superadmin.mjs.
// Urutannya: SUPERADMIN mendaftarkan OWNER, OWNER mendaftarkan karyawan
// (FINANCE & EMPLOYEE). Akun superadmin tidak tampil di UI mana pun dan
// tindakannya tidak dicatat ke audit log (lihat lib/auth/superadmin.ts).
export const ROLES = ["SUPERADMIN", "OWNER", "FINANCE", "EMPLOYEE"] as const;

export type Role = (typeof ROLES)[number];

// Role yang bisa diberikan lewat halaman Pengguna. SUPERADMIN hanya dari script.
export const ASSIGNABLE_ROLES = ["OWNER", "FINANCE", "EMPLOYEE"] as const satisfies readonly Role[];

export type AssignableRole = (typeof ASSIGNABLE_ROLES)[number];

export function isRole(value: string): value is Role {
  return (ROLES as readonly string[]).includes(value);
}

// Nama role yang tampil di UI. Kode tetap memakai nilai aslinya (OWNER, dst).
export const ROLE_LABELS: Record<Role, string> = {
  SUPERADMIN: "Superadmin",
  OWNER: "Owner",
  FINANCE: "Finance",
  EMPLOYEE: "Karyawan",
};
