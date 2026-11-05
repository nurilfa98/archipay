// Siapa boleh MENGUBAH data gaji / slip siapa (BUSINESS-FLOW §20.1).
//
// - Owner (salary:manage): semua orang.
// - Finance (salary:prepare saja): semua orang KECUALI dirinya sendiri, akun
//   Owner, dan Finance lain. Gaji mereka tetap bisa dilihat, tetapi hanya Owner
//   yang bisa mengubahnya, supaya Finance tidak bisa menaikkan gajinya sendiri
//   atau gaji rekannya. Selesaikan penggajian tetap khusus Owner.
//
// Dipakai Server Action (pengaman sebenarnya) dan halaman (menyembunyikan
// tombol ubah).

import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import type { CompanyUser } from "@/lib/auth/dal";
import { can } from "@/lib/auth/permissions";
import { db } from "@/lib/db";
import { roles, userRoles, users } from "@/lib/db/schema";

export const SALARY_EDIT_DENIED = "Data gaji Anda sendiri, Owner, dan Finance lain hanya bisa diubah Owner.";

// Fungsi pengecek untuk satu aktor. Satu query untuk semua target.
export async function salaryEditChecker(actor: CompanyUser): Promise<(userId: string) => boolean> {
  if (can(actor, "salary:manage")) return () => true;
  if (!can(actor, "salary:prepare")) return () => false;

  const rows = await db
    .selectDistinct({ id: users.id })
    .from(users)
    .innerJoin(userRoles, eq(userRoles.userId, users.id))
    .innerJoin(roles, eq(userRoles.roleId, roles.id))
    .where(and(eq(users.companyId, actor.company.id), inArray(roles.name, ["OWNER", "FINANCE"])));
  const protectedIds = new Set(rows.map((row) => row.id));
  return (userId) => userId !== actor.id && !protectedIds.has(userId);
}
