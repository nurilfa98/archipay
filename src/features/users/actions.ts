// Server Action untuk kelola pengguna (khusus permission "user:manage").
//
// Setiap action mengecek permission sendiri, walaupun halamannya sudah
// dilindungi requirePermission(): Server Action bisa dipanggil langsung lewat
// POST tanpa membuka halamannya.
//
// Aturan penting:
// - User TIDAK dihapus, hanya dinonaktifkan, agar riwayat (audit log, uang
//   muka) tetap utuh.
// - Siapa boleh mengelola akun siapa diatur features/users/access.ts:
//   superadmin mengelola Owner, Owner mengelola Finance & Karyawan. Akun
//   superadmin dijawab "tidak ditemukan".
// - Tidak ada yang bisa menonaktifkan atau me-reset akunnya sendiri.
//
// Referensi:
// - node_modules/next/dist/docs/01-app/01-getting-started/07-mutating-data.md
// - node_modules/next/dist/docs/01-app/02-guides/data-security.md
//   (bagian "Authentication and authorization")
// - node_modules/next/dist/docs/01-app/03-api-reference/04-functions/revalidatePath.md

"use server";

import { eq, inArray, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { logAudit } from "@/lib/audit";
import { verifySession, type CurrentUser } from "@/lib/auth/dal";
import { generateTemporaryPassword, hashPassword } from "@/lib/auth/password";
import { can } from "@/lib/auth/permissions";
import type { AssignableRole, Role } from "@/lib/auth/roles";
import { db, isUniqueViolation } from "@/lib/db";
import { roles, userRoles, users } from "@/lib/db/schema";
import { sendEmail } from "@/lib/email";
import { getClientIp } from "@/lib/request";
import type { ActionResult } from "@/types/action-result";
import { assignableRolesFor, canManageUser } from "./access";
import { credentialsEmail } from "./emails";
import { getUserDetail, type UserDetail } from "./queries";
import { createUserSchema, profileSchema, updateUserSchema, userIdSchema } from "./schemas";

const FORBIDDEN = { success: false, message: "Anda tidak memiliki akses." } as const;
const NOT_FOUND = { success: false, message: "Pengguna tidak ditemukan." } as const;
const OWNER_ONLY = { success: false, message: "Akun Owner hanya bisa diubah oleh superadmin." } as const;
const ROLE_NOT_ALLOWED = "Anda tidak bisa memberi role Owner";
const EMAIL_TAKEN = {
  success: false as const,
  message: "Periksa kembali isian Anda.",
  fieldErrors: { email: ["Email sudah dipakai pengguna lain"] },
};

// ---------------------------------------------------------------------------
// Tambah pengguna
// ---------------------------------------------------------------------------

export type CreateUserResult = { id: string; email: string; emailSent: boolean };

// Cukup mengisi nama, email, dan role awal (superadmin boleh memilih Owner,
// Owner hanya Finance/Karyawan). Password sementara dibuat sistem dan HANYA
// dikirim ke email user.
export async function createUser(
  _prevState: ActionResult<CreateUserResult> | undefined,
  formData: FormData,
): Promise<ActionResult<CreateUserResult>> {
  const actor = await getUserManager();
  if (!actor) return FORBIDDEN;

  const parsed = createUserSchema.safeParse({
    fullName: formData.get("fullName"),
    email: formData.get("email"),
    role: formData.get("role"),
  });
  if (!parsed.success) return invalid(parsed.error);

  const { role, ...data } = parsed.data;
  if (!assignableRolesFor(actor).includes(role)) {
    return { success: false, message: "Periksa kembali isian Anda.", fieldErrors: { role: [ROLE_NOT_ALLOWED] } };
  }

  const temporaryPassword = generateTemporaryPassword();
  const passwordHash = await hashPassword(temporaryPassword);
  const ip = await getClientIp();
  const initialRoles: AssignableRole[] = [role];

  let userId: string;
  try {
    // Transaksi: user, role, dan audit tersimpan bersamaan atau tidak sama sekali.
    userId = await db.transaction(async (tx) => {
      const [created] = await tx
        .insert(users)
        .values({ ...data, passwordHash, mustChangePassword: true })
        .returning({ id: users.id });

      await setRoles(tx, created.id, initialRoles);
      await logAudit(
        {
          userId: actor.id,
          action: "USER_CREATED",
          entityName: "users",
          entityId: created.id,
          newValues: { ...data, roles: initialRoles },
          ipAddress: ip,
        },
        tx,
      );
      return created.id;
    });
  } catch (error) {
    // Email ganda ditolak oleh UNIQUE constraint di database, bukan dengan
    // "cek dulu baru insert", agar tetap aman walau dua orang submit bersamaan.
    if (isUniqueViolation(error)) return EMAIL_TAKEN;
    throw error;
  }

  // Email dikirim SETELAH transaksi berhasil. Kalau gagal, user tetap
  // tersimpan; OWNER bisa mengirim ulang lewat "Reset password".
  const emailSent = await sendEmail(credentialsEmail({ ...data, temporaryPassword, kind: "created" }));

  revalidateUsers();
  return { success: true, data: { id: userId, email: data.email, emailSent } };
}

// ---------------------------------------------------------------------------
// Edit data & role
// ---------------------------------------------------------------------------

export async function updateUser(
  _prevState: ActionResult | undefined,
  formData: FormData,
): Promise<ActionResult> {
  const actor = await getUserManager();
  if (!actor) return FORBIDDEN;

  const userId = userIdSchema.safeParse(formData.get("userId"));
  if (!userId.success) return NOT_FOUND;

  const parsed = updateUserSchema.safeParse({
    fullName: formData.get("fullName"),
    email: formData.get("email"),
    phoneNumber: formData.get("phoneNumber"),
    bankName: formData.get("bankName"),
    bankAccountNumber: formData.get("bankAccountNumber"),
    roles: formData.getAll("roles"),
  });
  if (!parsed.success) return invalid(parsed.error);

  const target = await getManagedUser(actor, userId.data);
  if (!target.success) return target;
  const before = target.data;

  const { roles: newRoles, ...profile } = parsed.data;
  const allowedRoles = assignableRolesFor(actor);
  if (!newRoles.every((role) => allowedRoles.includes(role))) {
    return { success: false, message: "Periksa kembali isian Anda.", fieldErrors: { roles: [ROLE_NOT_ALLOWED] } };
  }

  // Audit hanya mencatat field yang benar-benar berubah.
  const oldValues: Record<string, unknown> = {};
  const newValues: Record<string, unknown> = {};
  for (const key of Object.keys(profile) as (keyof typeof profile)[]) {
    if (before[key] !== profile[key]) {
      oldValues[key] = before[key];
      newValues[key] = profile[key];
    }
  }
  const rolesChanged = before.roles.toSorted().join() !== newRoles.toSorted().join();
  if (rolesChanged) {
    oldValues.roles = before.roles;
    newValues.roles = newRoles;
  }

  // Tidak ada yang berubah: tidak perlu menulis ke database maupun audit log.
  if (Object.keys(newValues).length === 0) return { success: true, data: undefined };

  try {
    await db.transaction(async (tx) => {
      await tx.update(users).set(profile).where(eq(users.id, before.id));
      if (rolesChanged) await setRoles(tx, before.id, newRoles);
      await logAudit(
        {
          userId: actor.id,
          action: "USER_UPDATED",
          entityName: "users",
          entityId: before.id,
          oldValues,
          newValues,
          ipAddress: await getClientIp(),
        },
        tx,
      );
    });
  } catch (error) {
    if (isUniqueViolation(error)) return EMAIL_TAKEN;
    throw error;
  }

  revalidateUsers();
  return { success: true, data: undefined };
}

// ---------------------------------------------------------------------------
// Profil sendiri (menu Profil)
// ---------------------------------------------------------------------------

// Pengguna melengkapi datanya sendiri: nomor WhatsApp, rekening, dan kontak.
// Tidak butuh user:manage, dan hanya mengubah akun yang sedang login. Role
// tidak ikut diubah di sini.
export async function updateOwnProfile(
  _prevState: ActionResult | undefined,
  formData: FormData,
): Promise<ActionResult> {
  const actor = await verifySession();

  const parsed = profileSchema.safeParse({
    fullName: formData.get("fullName"),
    email: formData.get("email"),
    phoneNumber: formData.get("phoneNumber"),
    bankName: formData.get("bankName"),
    bankAccountNumber: formData.get("bankAccountNumber"),
  });
  if (!parsed.success) return invalid(parsed.error);

  const before = await getUserDetail(actor.id);
  if (!before) return NOT_FOUND;

  // Audit hanya mencatat field yang benar-benar berubah.
  const profile = parsed.data;
  const oldValues: Record<string, unknown> = {};
  const newValues: Record<string, unknown> = {};
  for (const key of Object.keys(profile) as (keyof typeof profile)[]) {
    if (before[key] !== profile[key]) {
      oldValues[key] = before[key];
      newValues[key] = profile[key];
    }
  }

  // Tidak ada yang berubah: tidak perlu menulis ke database maupun audit log.
  if (Object.keys(newValues).length === 0) return { success: true, data: undefined };

  try {
    await db.transaction(async (tx) => {
      await tx.update(users).set(profile).where(eq(users.id, actor.id));
      await logAudit(
        {
          userId: actor.id,
          action: "USER_UPDATED",
          entityName: "users",
          entityId: actor.id,
          oldValues,
          newValues,
          ipAddress: await getClientIp(),
        },
        tx,
      );
    });
  } catch (error) {
    if (isUniqueViolation(error)) return EMAIL_TAKEN;
    throw error;
  }

  // Nama di navbar ikut berubah, jadi seluruh layout (app) dimuat ulang.
  revalidatePath("/", "layout");
  return { success: true, data: undefined };
}

// ---------------------------------------------------------------------------
// Aktifkan / nonaktifkan
// ---------------------------------------------------------------------------

// Dipanggil dari event handler (bukan form), jadi argumennya bisa dikirim
// siapa saja dengan nilai apa saja. Keduanya divalidasi ulang dengan zod.
export async function setUserActive(userId: string, active: boolean): Promise<ActionResult> {
  const actor = await getUserManager();
  if (!actor) return FORBIDDEN;

  const input = z.object({ userId: userIdSchema, active: z.boolean() }).safeParse({ userId, active });
  if (!input.success) return NOT_FOUND;

  if (input.data.userId === actor.id) {
    return { success: false, message: "Anda tidak bisa menonaktifkan akun sendiri." };
  }
  const target = await getManagedUser(actor, input.data.userId);
  if (!target.success) return target;

  // Cookie session user yang dinonaktifkan masih tersimpan di browsernya,
  // tapi getCurrentUser() di DAL mengecek is_active, jadi aksesnya berhenti
  // di request berikutnya.
  const updated = await db.transaction(async (tx) => {
    const [row] = await tx
      .update(users)
      .set({ isActive: input.data.active })
      .where(eq(users.id, input.data.userId))
      .returning({ id: users.id });
    if (!row) return false;

    await logAudit(
      {
        userId: actor.id,
        action: input.data.active ? "USER_ACTIVATED" : "USER_DEACTIVATED",
        entityName: "users",
        entityId: row.id,
        ipAddress: await getClientIp(),
      },
      tx,
    );
    return true;
  });
  if (!updated) return NOT_FOUND;

  revalidateUsers();
  return { success: true, data: undefined };
}

// ---------------------------------------------------------------------------
// Reset password
// ---------------------------------------------------------------------------

// Membuat password sementara baru, mengirimnya ke email user, dan
// mengeluarkan user dari semua perangkat (sessionVersion + 1).
export async function resetUserPassword(
  userId: string,
): Promise<ActionResult<{ emailSent: boolean }>> {
  const actor = await getUserManager();
  if (!actor) return FORBIDDEN;

  const id = userIdSchema.safeParse(userId);
  if (!id.success) return NOT_FOUND;

  if (id.data === actor.id) {
    return { success: false, message: "Untuk akun sendiri, gunakan menu Ganti password." };
  }

  const managed = await getManagedUser(actor, id.data);
  if (!managed.success) return managed;
  const target = managed.data;
  if (!target.isActive) {
    return { success: false, message: "Aktifkan akun ini terlebih dahulu sebelum me-reset password." };
  }

  const temporaryPassword = generateTemporaryPassword();
  const passwordHash = await hashPassword(temporaryPassword);

  await db.transaction(async (tx) => {
    await tx
      .update(users)
      .set({
        passwordHash,
        mustChangePassword: true,
        // Dinaikkan langsung di database (bukan dibaca lalu ditulis) agar
        // tetap benar bila ada dua reset bersamaan.
        sessionVersion: sql`${users.sessionVersion} + 1`,
      })
      .where(eq(users.id, target.id));
    await logAudit(
      {
        userId: actor.id,
        action: "USER_PASSWORD_RESET",
        entityName: "users",
        entityId: target.id,
        ipAddress: await getClientIp(),
      },
      tx,
    );
  });

  const emailSent = await sendEmail(
    credentialsEmail({
      fullName: target.fullName,
      email: target.email,
      temporaryPassword,
      kind: "reset",
    }),
  );

  revalidateUsers();
  return { success: true, data: { emailSent } };
}

// ---------------------------------------------------------------------------
// Helper (tanpa export → bukan Server Action, tidak bisa dipanggil dari browser)
// ---------------------------------------------------------------------------

async function getUserManager() {
  const user = await verifySession();
  return can(user, "user:manage") ? user : null;
}

// Akun target harus boleh dikelola actor (features/users/access.ts). Akun
// superadmin dijawab "tidak ditemukan" agar keberadaannya tidak bocor.
async function getManagedUser(actor: CurrentUser, userId: string): Promise<ActionResult<UserDetail>> {
  const target = await getUserDetail(userId);
  if (!target || target.roles.includes("SUPERADMIN")) return NOT_FOUND;
  if (!canManageUser(actor, target)) return OWNER_ONLY;
  return { success: true, data: target };
}

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

// Ganti seluruh role user: hapus semua, lalu isi ulang.
async function setRoles(tx: Transaction, userId: string, roleNames: Role[]) {
  const roleRows = await tx
    .select({ id: roles.id })
    .from(roles)
    .where(inArray(roles.name, roleNames));
  // Tabel roles diisi oleh scripts/create-superadmin.mjs. Kalau jumlahnya tidak
  // cocok, data role di database belum lengkap: batalkan transaksi.
  if (roleRows.length !== roleNames.length) throw new Error("Data role di database tidak lengkap");

  await tx.delete(userRoles).where(eq(userRoles.userId, userId));
  await tx.insert(userRoles).values(roleRows.map((role) => ({ userId, roleId: role.id })));
}

function invalid(error: z.ZodError) {
  return {
    success: false as const,
    message: "Periksa kembali isian Anda.",
    fieldErrors: z.flattenError(error).fieldErrors as Record<string, string[]>,
  };
}

// Daftar & detail pengguna dibaca ulang dari database. "layout" mencakup
// /users, /users/new, dan /users/[id].
function revalidateUsers() {
  revalidatePath("/users", "layout");
}
