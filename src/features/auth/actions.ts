// Server Action untuk login & logout.
//
// "use server" membuat setiap fungsi di file ini bisa dipanggil dari browser
// (Next.js membuatkan endpoint POST di belakang layar). Artinya fungsi ini
// adalah PINTU PUBLIK: siapa pun bisa memanggilnya dengan data apa pun.
// Karena itu urutannya selalu: validasi → cek → baru ubah data.
//
// Referensi:
// - node_modules/next/dist/docs/01-app/01-getting-started/07-mutating-data.md
// - node_modules/next/dist/docs/01-app/02-guides/forms.md (bagian useActionState)
// - node_modules/next/dist/docs/01-app/02-guides/authentication.md
//   (bagian "Sign-up and login functionality" & "Deleting the session")

"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { z } from "zod";
import { logAudit } from "@/lib/audit";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { createSession, destroySession, getSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { getClientIp } from "@/lib/request";
import type { ActionResult } from "@/types/action-result";
import { findUserCredentials, findUserForLogin } from "./queries";
import { checkLoginRateLimit, recordLoginAttempt } from "./rate-limit";
import { changePasswordSchema, loginSchema } from "./schemas";

// Dipakai bersama useActionState di login-form.tsx. Karena itu parameter
// pertamanya adalah state sebelumnya, baru formData.
export async function login(
  _prevState: ActionResult | undefined,
  formData: FormData,
): Promise<ActionResult> {
  // 1. Validasi input
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return {
      success: false,
      message: "Periksa kembali isian Anda.",
      fieldErrors: z.flattenError(parsed.error).fieldErrors,
    };
  }

  const { email, password } = parsed.data;
  const ip = await getClientIp();

  // 2. Rate limit. Dicek SEBELUM bcrypt: selain menghambat penebakan,
  // juga menghemat CPU karena bcrypt sengaja dibuat lambat.
  const rateLimit = await checkLoginRateLimit(email, ip);
  if (rateLimit.limited) {
    return {
      success: false,
      message: `Terlalu banyak percobaan login. Coba lagi dalam ${rateLimit.retryAfterMinutes} menit.`,
    };
  }

  // 3. Cari user & cocokkan password.
  // Pesan error sengaja dibuat sama untuk "email tidak ada" dan "password
  // salah", supaya penyerang tidak bisa mengetahui email mana yang terdaftar.
  const user = await findUserForLogin(email);
  const passwordValid = await verifyPassword(password, user?.passwordHash);

  if (!user || !passwordValid) {
    await recordLoginAttempt(email, ip, false);
    // Audit hanya untuk akun yang ada, agar OWNER bisa melihat bila ada
    // yang mencoba menebak password akun tertentu.
    if (user) await logFailedLogin(user.id, "WRONG_PASSWORD", ip);
    return { success: false, message: "Email atau password salah." };
  }

  // Aman memberi tahu status akun di sini karena password sudah terbukti benar.
  if (!user.isActive) {
    await logFailedLogin(user.id, "INACTIVE", ip);
    return { success: false, message: "Akun Anda dinonaktifkan. Hubungi admin." };
  }

  // 4. Catat, lalu buat session (menulis cookie terenkripsi)
  await recordLoginAttempt(email, ip, true);
  await logAudit({
    userId: user.id,
    action: "LOGIN_SUCCESS",
    entityName: "users",
    entityId: user.id,
    ipAddress: ip,
  });
  // Checkbox "Ingat saya" di login-form.tsx: value="1" bila dicentang.
  const rememberMe = formData.get("rememberMe") === "1";
  await createSession(user.id, user.sessionVersion, rememberMe);
  clearClientCache();

  // 5. Pindah halaman. redirect() bekerja dengan melempar error khusus, jadi
  // JANGAN letakkan di dalam try/catch, nanti tertangkap dan tidak jalan.
  // User dengan password sementara langsung diarahkan ke halaman ganti password.
  redirect(user.mustChangePassword ? "/change-password" : "/");
}

// Ganti password milik sendiri. Dipakai untuk dua keadaan:
// - wajib: password masih sementara (user baru / di-reset OWNER)
// - sukarela: dari menu user → "Ganti password"
export async function changePassword(
  _prevState: ActionResult | undefined,
  formData: FormData,
): Promise<ActionResult> {
  // 1. Pastikan session masih berlaku (lihat alasan findUserCredentials).
  const session = await getSession();
  const account = session.userId ? await findUserCredentials(session.userId) : undefined;
  if (!account || !account.isActive || account.sessionVersion !== session.sessionVersion) {
    redirect("/login");
  }

  // 2. Validasi input
  const parsed = changePasswordSchema.safeParse({
    currentPassword: formData.get("currentPassword"),
    newPassword: formData.get("newPassword"),
    confirmPassword: formData.get("confirmPassword"),
  });
  if (!parsed.success) {
    return {
      success: false,
      message: "Periksa kembali isian Anda.",
      fieldErrors: z.flattenError(parsed.error).fieldErrors,
    };
  }

  // 3. Password lama wajib benar. Tanpa ini, orang yang menemukan laptop
  // dalam keadaan login bisa mengambil alih akun dengan mengganti password.
  const { currentPassword, newPassword } = parsed.data;
  if (!(await verifyPassword(currentPassword, account.passwordHash))) {
    return {
      success: false,
      message: "Periksa kembali isian Anda.",
      fieldErrors: { currentPassword: ["Password saat ini salah"] },
    };
  }

  // 4. Simpan. sessionVersion dinaikkan → session di perangkat lain berakhir.
  const sessionVersion = account.sessionVersion + 1;
  const passwordHash = await hashPassword(newPassword);
  await db.transaction(async (tx) => {
    await tx
      .update(users)
      .set({ passwordHash, mustChangePassword: false, sessionVersion })
      .where(eq(users.id, account.id));
    await logAudit(
      {
        userId: account.id,
        action: "PASSWORD_CHANGED",
        entityName: "users",
        entityId: account.id,
        newValues: { wasTemporary: account.mustChangePassword },
        ipAddress: await getClientIp(),
      },
      tx,
    );
  });

  // 5. Perangkat ini tetap login dengan session versi baru.
  // Pilihan "Ingat saya" dari sesi sebelumnya dipertahankan.
  await createSession(account.id, sessionVersion, session.rememberMe);
  clearClientCache();
  redirect("/");
}

// Logout sengaja TIDAK memanggil redirect(). Halaman tujuan dibuka oleh
// browser lewat reload penuh (lihat user-menu.tsx), karena dengan
// cacheComponents Next.js menyimpan halaman sebelumnya secara tersembunyi
// (React <Activity>). Reload penuh memastikan tidak ada sisa data user di
// DOM maupun memori browser setelah logout.
// Referensi: node_modules/next/dist/docs/01-app/03-api-reference/05-config/01-next-config-js/cacheComponents.md
export async function logout() {
  // Ambil userId SEBELUM session dihapus, untuk dicatat di audit log.
  const { userId } = await getSession();

  if (userId) {
    await logAudit({
      userId,
      action: "LOGOUT",
      entityName: "users",
      entityId: userId,
      ipAddress: await getClientIp(),
    });
  }

  await destroySession();
}

// Halaman yang sudah di-prefetch untuk user (lihat 'use cache: private' di
// lib/auth/dal.ts) tersimpan di memori browser. Saat login, cache itu dibuang
// agar halaman milik user sebelumnya tidak ikut tampil, misalnya saat session
// user lain kedaluwarsa lalu orang berbeda login di tab yang sama.
// Referensi: node_modules/next/dist/docs/01-app/03-api-reference/04-functions/revalidatePath.md
// (bagian "Revalidating all data")
function clearClientCache() {
  revalidatePath("/", "layout");
}

// Fungsi tanpa `export` di file "use server" TIDAK menjadi Server Action,
// jadi tidak bisa dipanggil dari browser. Aman untuk helper internal.
function logFailedLogin(userId: string, reason: "WRONG_PASSWORD" | "INACTIVE", ip: string | null) {
  return logAudit({
    userId: null, // pelaku belum terautentikasi
    action: "LOGIN_FAILED",
    entityName: "users",
    entityId: userId, // akun yang dicoba
    newValues: { reason },
    ipAddress: ip,
  });
}
