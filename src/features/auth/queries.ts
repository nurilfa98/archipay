// Query database khusus fitur auth.
//
// Kedua fungsi di sini mengembalikan password_hash, jadi hanya boleh dipanggil
// dari Server Action auth. Jangan pernah mengirim hasilnya ke komponen.
//
// Referensi: node_modules/next/dist/docs/01-app/02-guides/data-security.md
// (bagian "Data Access Layer")

import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { companies, roles, userRoles, users } from "@/lib/db/schema";

const credentialColumns = {
  id: users.id,
  companyId: users.companyId,
  passwordHash: users.passwordHash,
  isActive: users.isActive,
  mustChangePassword: users.mustChangePassword,
  sessionVersion: users.sessionVersion,
};

// Status & masa langganan company ikut dibaca: user dari company yang
// dinonaktifkan atau terkunci (langganan habis) tidak bisa login.
// companyIsActive null = superadmin (tanpa company).
export async function findUserForLogin(email: string) {
  const [user] = await db
    .select({
      ...credentialColumns,
      companyIsActive: companies.isActive,
      companySubscriptionUntil: companies.subscriptionUntil,
    })
    .from(users)
    .leftJoin(companies, eq(users.companyId, companies.id))
    .where(eq(users.email, email))
    .limit(1);

  return user;
}

// Dipakai saat ganti password. Sengaja TIDAK lewat getCurrentUser() di DAL:
// hasil getCurrentUser() di-cache selama satu request, sehingga setelah
// password diganti, redirect di request yang sama masih membaca data lama
// (mustChangePassword: true) dan user terlempar balik ke /change-password.
export async function findUserCredentials(userId: string) {
  const [user] = await db
    .select(credentialColumns)
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  return user;
}

// Nama role user, untuk aturan login company terkunci (hanya Owner yang boleh masuk).
export async function findUserRoleNames(userId: string) {
  const rows = await db
    .select({ name: roles.name })
    .from(userRoles)
    .innerJoin(roles, eq(userRoles.roleId, roles.id))
    .where(eq(userRoles.userId, userId));
  return rows.map((row) => row.name);
}
