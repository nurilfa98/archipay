// Daftar role disimpan sebagai konstanta (bukan string bebas) supaya TypeScript
// menangkap typo seperti "FINANCES". File ini TIDAK memakai `server-only`
// karena Client Component juga boleh memakainya, misalnya untuk menyembunyikan
// tombol. Ingat: menyembunyikan tombol bukan pengaman, pengecekan sebenarnya
// tetap di server (lib/auth/dal.ts).

export const ROLES = ["OWNER", "FINANCE", "EMPLOYEE"] as const;

export type Role = (typeof ROLES)[number];

export function isRole(value: string): value is Role {
  return (ROLES as readonly string[]).includes(value);
}

// Nama role yang tampil di UI. Kode tetap memakai nilai aslinya (OWNER, dst).
export const ROLE_LABELS: Record<Role, string> = {
  OWNER: "Owner",
  FINANCE: "Finance",
  EMPLOYEE: "Karyawan",
};
