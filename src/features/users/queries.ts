// Query database untuk halaman Pengguna. Hasilnya berupa DTO tanpa
// password_hash, aman dikirim ke komponen.
//
// Pemanggil WAJIB sudah mengecek permission "user:manage" (requirePermission)
// sebelum memakai fungsi di sini, dan mengirim company yang sedang dibuka:
// pengguna company lain tidak pernah ikut terbaca.
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
// - https://orm.drizzle.team/docs/operators (eq, inArray)
// - node_modules/next/dist/docs/01-app/03-api-reference/04-functions/io.md
// - node_modules/next/dist/docs/01-app/02-guides/data-security.md

import "server-only";
import { and, asc, desc, eq, gte, inArray, not, sql, type SQL } from "drizzle-orm";
import { io } from "next/cache";
import { isRole, type Role } from "@/lib/auth/roles";
import { notSuperadmin } from "@/lib/auth/superadmin";
import { db } from "@/lib/db";
import { auditLogs, roles, userRoles, users } from "@/lib/db/schema";
import type { UserStatus } from "./constants";
import type { UserFilters } from "./schemas";

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

// Filter role & status dari URL (halaman /users). Pencarian nama/email
// berjalan di browser (components/data-table), jadi tidak di sini.
// Akun superadmin tidak ikut tampil.
export async function listUsers(companyId: string, filters: UserFilters = {}): Promise<UserListItem[]> {
  await io();

  const rows = await db
    .select(listColumns)
    .from(users)
    .where(
      and(
        eq(users.companyId, companyId),
        notSuperadmin(users.id),
        filters.role
          ? inArray(
              users.id,
              db
                .select({ id: userRoles.userId })
                .from(userRoles)
                .innerJoin(roles, eq(userRoles.roleId, roles.id))
                .where(eq(roles.name, filters.role)),
            )
          : undefined,
        filters.status ? statusCondition(filters.status) : undefined,
      ),
    )
    .orderBy(asc(users.fullName));

  const rolesByUser = await getRolesByUserIds(rows.map((row) => row.id));
  return rows.map((row) => ({ ...row, roles: rolesByUser.get(row.id) ?? [] }));
}

// Email akun ini diubah dalam 7 hari terakhir? Dipakai dialog "Reset password":
// perubahan email baru-baru ini adalah tanda pengambilalihan akun, jadi Owner
// diminta memastikan dulu permintaan reset benar dari orangnya. Perubahan oleh
// Superadmin tidak tercatat di audit log, jadi tidak muncul di sini.
export async function getRecentEmailChange(companyId: string, userId: string) {
  await io();
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const [row] = await db
    .select({ at: auditLogs.createdAt, oldValues: auditLogs.oldValues, byName: users.fullName })
    .from(auditLogs)
    .leftJoin(users, eq(auditLogs.userId, users.id))
    .where(
      and(
        eq(auditLogs.companyId, companyId),
        eq(auditLogs.entityName, "users"),
        eq(auditLogs.entityId, userId),
        eq(auditLogs.action, "USER_UPDATED"),
        gte(auditLogs.createdAt, since),
        sql`jsonb_exists(${auditLogs.newValues}, 'email')`,
      ),
    )
    .orderBy(desc(auditLogs.createdAt))
    .limit(1);
  if (!row) return null;
  const oldEmail = (row.oldValues as { email?: unknown } | null)?.email;
  return { at: row.at, byName: row.byName, oldEmail: typeof oldEmail === "string" ? oldEmail : null };
}

// Satu pengguna di company tertentu. Tidak menyaring superadmin (company-nya
// null, jadi memang tidak pernah cocok); halaman yang menampilkan user lain
// tetap mengecek roles-nya.
export async function getUserDetail(companyId: string, id: string): Promise<UserDetail | null> {
  return findUserDetail(and(eq(users.id, id), eq(users.companyId, companyId)));
}

// Akun milik sendiri (halaman & action Profil), termasuk Superadmin yang tidak
// punya company.
export async function getOwnProfile(userId: string): Promise<UserDetail | null> {
  return findUserDetail(eq(users.id, userId));
}

async function findUserDetail(where: SQL | undefined): Promise<UserDetail | null> {
  await io();
  const [row] = await db
    .select({ ...listColumns, bankName: users.bankName, bankAccountNumber: users.bankAccountNumber })
    .from(users)
    .where(where)
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

// Sama dengan urutan StatusBadge (user-badges.tsx): nonaktif menang atas
// "menunggu login".
function statusCondition(status: UserStatus) {
  switch (status) {
    case "INACTIVE":
      return not(users.isActive);
    case "PENDING_LOGIN":
      return and(eq(users.isActive, true), eq(users.mustChangePassword, true));
    case "ACTIVE":
      return and(eq(users.isActive, true), eq(users.mustChangePassword, false));
  }
}
