// Query database untuk halaman Pengguna. Hasilnya berupa DTO tanpa
// password_hash, aman dikirim ke komponen.
//
// Pemanggil WAJIB sudah mengecek permission "user:manage" (requirePermission)
// sebelum memakai fungsi di sini.
//
// Kenapa setiap fungsi diawali `await io()`?
// Driver postgres.js memanggil Math.random() saat membuka koneksi. Saat
// prerender (dev & prefetch), hasil getCurrentUser() bisa sudah ada di cache
// sehingga query di sini ikut berjalan, lalu Next.js menolak Math.random()
// ("encountered the unstable value Math.random()"). io() menandai bahwa
// setelah baris ini ada operasi I/O: saat prerender ia berhenti (fallback
// <Suspense> yang tampil), saat request biasa langsung lanjut.
//
// Referensi:
// - https://orm.drizzle.team/docs/operators (ilike, or, inArray)
// - node_modules/next/dist/docs/01-app/03-api-reference/04-functions/io.md
// - node_modules/next/dist/docs/01-app/02-guides/data-security.md

import "server-only";
import { asc, eq, ilike, inArray, or } from "drizzle-orm";
import { io } from "next/cache";
import { isRole, type Role } from "@/lib/auth/roles";
import { db } from "@/lib/db";
import { roles, userRoles, users } from "@/lib/db/schema";

export type UserListItem = {
  id: string;
  fullName: string;
  email: string;
  phoneNumber: string | null;
  isActive: boolean;
  mustChangePassword: boolean;
  roles: Role[];
};

export type UserDetail = UserListItem & {
  bankName: string | null;
  bankAccountNumber: string | null;
};

const listColumns = {
  id: users.id,
  fullName: users.fullName,
  email: users.email,
  phoneNumber: users.phoneNumber,
  isActive: users.isActive,
  mustChangePassword: users.mustChangePassword,
};

// `search` mencocokkan nama atau email (tidak peka huruf besar/kecil).
export async function listUsers(search?: string): Promise<UserListItem[]> {
  await io();
  const pattern = search ? `%${escapeLike(search)}%` : undefined;

  const rows = await db
    .select(listColumns)
    .from(users)
    .where(pattern ? or(ilike(users.fullName, pattern), ilike(users.email, pattern)) : undefined)
    .orderBy(asc(users.fullName));

  const rolesByUser = await getRolesByUserIds(rows.map((row) => row.id));
  return rows.map((row) => ({ ...row, roles: rolesByUser.get(row.id) ?? [] }));
}

export async function getUserDetail(id: string): Promise<UserDetail | null> {
  await io();
  const [row] = await db
    .select({ ...listColumns, bankName: users.bankName, bankAccountNumber: users.bankAccountNumber })
    .from(users)
    .where(eq(users.id, id))
    .limit(1);

  if (!row) return null;

  const rolesByUser = await getRolesByUserIds([row.id]);
  return { ...row, roles: rolesByUser.get(row.id) ?? [] };
}

// Satu query untuk role SEMUA user di daftar, bukan satu query per user
// (menghindari masalah "N+1 query" yang membuat halaman makin lambat
// seiring bertambahnya user).
async function getRolesByUserIds(userIds: string[]) {
  const result = new Map<string, Role[]>();
  if (userIds.length === 0) return result;

  const rows = await db
    .select({ userId: userRoles.userId, name: roles.name })
    .from(userRoles)
    .innerJoin(roles, eq(userRoles.roleId, roles.id))
    .where(inArray(userRoles.userId, userIds));

  for (const row of rows) {
    if (!isRole(row.name)) continue;
    result.set(row.userId, [...(result.get(row.userId) ?? []), row.name]);
  }
  return result;
}

// Karakter % dan _ punya arti khusus di LIKE. Tanpa di-escape, pencarian "_"
// akan cocok dengan semua user.
function escapeLike(value: string) {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}
