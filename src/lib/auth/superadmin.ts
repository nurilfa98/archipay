// Akun superadmin (role SUPERADMIN, dibuat lewat scripts/create-superadmin.mjs)
// disembunyikan dari aplikasi:
// - tidak tampil di daftar pengguna, filter audit, maupun pilihan penerima;
// - tindakannya tidak dicatat ke audit log (lib/audit.ts).
//
// Helper di sini dipakai query yang menampilkan daftar user. Halaman yang
// membaca satu user (misal /users/[id]) cukup mengecek roles-nya.
//
// Referensi: https://orm.drizzle.team/docs/operators#exists

import "server-only";
import { and, eq, inArray, notExists } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { db } from "@/lib/db";
import { roles, userRoles } from "@/lib/db/schema";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

// Kondisi WHERE "user ini bukan superadmin". `userId` boleh kolom alias,
// misalnya recipient.id.
export function notSuperadmin(userId: AnyPgColumn) {
  return notExists(
    db
      .select({ userId: userRoles.userId })
      .from(userRoles)
      .innerJoin(roles, eq(userRoles.roleId, roles.id))
      .where(and(eq(userRoles.userId, userId), eq(roles.name, "SUPERADMIN"))),
  );
}

// true bila salah satu id milik superadmin.
export async function hasSuperadmin(userIds: string[], tx: typeof db | Transaction = db) {
  if (userIds.length === 0) return false;
  const [row] = await tx
    .select({ userId: userRoles.userId })
    .from(userRoles)
    .innerJoin(roles, eq(userRoles.roleId, roles.id))
    .where(and(inArray(userRoles.userId, userIds), eq(roles.name, "SUPERADMIN")))
    .limit(1);
  return !!row;
}
