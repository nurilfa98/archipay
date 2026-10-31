// DAL (Data Access Layer) untuk autentikasi & otorisasi.
//
// Ini SATU-SATUNYA tempat yang memutuskan "siapa user yang sedang login,
// company mana yang sedang dibuka, dan apa haknya". Semua page, query, dan
// Server Action yang butuh user wajib lewat sini, bukan membaca cookie
// sendiri-sendiri.
//
// - Autentikasi = memastikan siapa Anda       → verifySession()
// - Otorisasi   = memastikan Anda boleh apa   → requirePermission()
//   (daftar "role apa boleh apa" ada di lib/auth/permissions.ts)
// - Tenant      = data company mana           → user.company.id
// - Langganan   = company terkunci?           → user.company.access
//   (lib/subscription-access.ts). Company yang lewat masa tenggang: Owner
//   hanya bisa membuka menu Langganan, user lain tidak bisa masuk sama sekali.
//
// Multi-tenant: setiap query & action fitur bisnis WAJIB membatasi data ke
// `user.company.id` (where company_id = ...). verifySession() dan
// requirePermission() menjamin company itu ada; halaman platform Superadmin
// (menu Company) yang belum memilih company memakai verifyAccount().
//
// Referensi:
// - node_modules/next/dist/docs/01-app/02-guides/authentication.md
//   (bagian "Creating a Data Access Layer (DAL)" & "Using Data Transfer Objects (DTO)")
// - node_modules/next/dist/docs/01-app/02-guides/authentication-with-cache-components.md
//   (bagian "Step 1: Read the current user")

import "server-only";
import { and, eq, exists, sql } from "drizzle-orm";
import { cacheLife } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { companies, roles, subscriptions, userRoles, users } from "@/lib/db/schema";
import { getPlatformSettings } from "@/lib/platform-settings";
import { getCompanyAccess, type CompanyAccess } from "@/lib/subscription-access";
import { readActiveCompanyCookie } from "./active-company";
import { can, type Permission } from "./permissions";
import { isRole, type Role } from "./roles";
import { getSession } from "./session";

export type ActiveCompany = { id: string; name: string; isActive: boolean; access: CompanyAccess };

// DTO (Data Transfer Object): hanya field yang aman & dibutuhkan UI.
// password_hash, nomor rekening, dll TIDAK ikut.
export type CurrentUser = {
  id: string;
  fullName: string;
  email: string;
  roles: Role[];
  mustChangePassword: boolean;
  // Company yang sedang dibuka: untuk Owner/Finance/Karyawan = company-nya
  // sendiri, untuk Superadmin = company yang dipilih di menu Company
  // (lib/auth/active-company.ts), null bila belum memilih.
  company: ActiveCompany | null;
};

// User yang pasti sedang membuka sebuah company (hasil verifySession()).
export type CompanyUser = CurrentUser & { company: ActiveCompany };

// 'use cache: private' = cache khusus data milik satu user (membaca cookie).
//
// 1. Dalam satu request, layout, page, dan komponen lain yang memanggil
//    getCurrentUser() memakai hasil yang sama: query database cukup sekali.
// 2. Hasil render yang bergantung pada user ini boleh ikut di-PREFETCH dan
//    disimpan di memori browser user itu sendiri. Hasilnya, saat menu
//    diklik, konten halaman langsung tampil tanpa menunggu server.
//
// Hasilnya TIDAK disimpan di cache server (tidak bisa bocor ke user lain).
//
// cacheLife("minutes") → stale 5 menit: browser boleh memakai hasil prefetch
// paling lama 5 menit. Minimal 5 menit diperlukan agar konten ikut masuk
// App Shell (prefetch per halaman). Konsekuensinya, user yang dinonaktifkan
// masih bisa MELIHAT halaman yang sudah ter-prefetch paling lama 5 menit,
// tetapi tidak bisa mengubah data, karena setiap Server Action mengecek ulang
// ke server.
//
// Referensi:
// - node_modules/next/dist/docs/01-app/03-api-reference/01-directives/use-cache-private.md
// - node_modules/next/dist/docs/01-app/03-api-reference/04-functions/cacheLife.md
//   (bagian "Prerendering behavior")
// - node_modules/next/dist/docs/01-app/02-guides/authentication-with-cache-components.md
//   (bagian "Step 1" & "Step 6: Make authenticated navigations instant")
//
// Cookie company aktif Superadmin dibaca DI LUAR fungsi cache lalu dikirim
// sebagai argumen, sehingga menjadi bagian dari kunci cache. Tanpa ini, hasil
// lama (company sebelumnya / belum ada company) bisa terpakai lagi tepat
// setelah Superadmin menekan "Buka", lalu ia terlempar kembali ke /companies.
export async function getCurrentUser(): Promise<CurrentUser | null> {
  return loadCurrentUser(await readActiveCompanyCookie());
}

async function loadCurrentUser(activeCompanyId: string | null): Promise<CurrentUser | null> {
  "use cache: private";
  cacheLife("minutes");

  const { userId, sessionVersion } = await getSession();
  if (!userId) return null;

  // Cookie session tetap valid sampai kedaluwarsa walau user sudah
  // dinonaktifkan. Karena itu status user selalu dicek ulang ke database.
  // Company ikut di-join: user dari company yang dinonaktifkan Superadmin
  // tidak bisa masuk walau akunnya sendiri masih aktif.
  const [user] = await db
    .select({
      id: users.id,
      fullName: users.fullName,
      email: users.email,
      isActive: users.isActive,
      mustChangePassword: users.mustChangePassword,
      sessionVersion: users.sessionVersion,
      companyId: users.companyId,
      companyName: companies.name,
      companyIsActive: companies.isActive,
      subscriptionUntil: companies.subscriptionUntil,
      hasPaid: hasPaidSubscription,
    })
    .from(users)
    .leftJoin(companies, eq(users.companyId, companies.id))
    .where(eq(users.id, userId))
    .limit(1);

  if (!user || !user.isActive) return null;
  // Password sudah diganti/di-reset setelah cookie ini dibuat → login ulang.
  if (user.sessionVersion !== sessionVersion) return null;

  const roleRows = await db
    .select({ name: roles.name })
    .from(userRoles)
    .innerJoin(roles, eq(userRoles.roleId, roles.id))
    .where(eq(userRoles.userId, user.id));
  const userRolesList = roleRows.map((r) => r.name).filter(isRole);

  let company: ActiveCompany | null = null;
  if (user.companyId && user.companyName != null && user.subscriptionUntil) {
    if (!user.companyIsActive) return null;
    const access = await accessOf(user.subscriptionUntil, user.hasPaid ?? false);
    // Langganan terkunci: hanya Owner yang boleh masuk (ke menu Langganan).
    if (access.locked && !userRolesList.includes("OWNER")) return null;
    company = { id: user.companyId, name: user.companyName, isActive: true, access };
  } else if (can({ roles: userRolesList }, "company:manage")) {
    company = await findSuperadminCompany(activeCompanyId);
  } else {
    // Akun non-superadmin tanpa company: data tidak lengkap, jangan izinkan masuk.
    return null;
  }

  return {
    id: user.id,
    fullName: user.fullName,
    email: user.email,
    roles: userRolesList,
    mustChangePassword: user.mustChangePassword,
    company,
  };
}

// Company yang dipilih Superadmin (cookie), dicocokkan ke database. Company
// nonaktif tetap boleh dibuka Superadmin (untuk melihat datanya).
async function findSuperadminCompany(companyId: string | null): Promise<ActiveCompany | null> {
  if (!companyId) return null;
  const [row] = await db
    .select({
      id: companies.id,
      name: companies.name,
      isActive: companies.isActive,
      subscriptionUntil: companies.subscriptionUntil,
      hasPaid: hasPaidSubscription,
    })
    .from(companies)
    .where(eq(companies.id, companyId))
    .limit(1);
  if (!row) return null;
  const { subscriptionUntil, hasPaid, ...company } = row;
  return { ...company, access: await accessOf(subscriptionUntil, hasPaid) };
}

// "Company ini pernah punya tagihan lunas" (masa gratis vs langganan aktif).
const hasPaidSubscription = sql<boolean>`${exists(
  db
    .select({ one: subscriptions.id })
    .from(subscriptions)
    .where(and(eq(subscriptions.companyId, companies.id), eq(subscriptions.status, "ACTIVE"))),
)}`;

async function accessOf(subscriptionUntil: Date, hasPaid: boolean) {
  const { graceDays } = await getPlatformSettings();
  return getCompanyAccess({ subscriptionUntil, hasPaid, graceDays });
}

// Untuk halaman yang WAJIB login, tetapi tidak membutuhkan company: kotak menu
// (/), Profil, dan menu Company milik Superadmin. Kalau belum login → /login.
// redirect() bertipe `never`, jadi setelah baris itu TypeScript tahu `user`
// pasti ada.
//
// User yang masih memakai password sementara diarahkan ke /change-password.
// Karena semua page, layout, dan Server Action lewat fungsi ini (atau
// verifySession), user tidak bisa membuka/menjalankan apa pun sebelum
// mengganti password. Halaman /change-password sendiri memakai
// getCurrentUser() agar tidak redirect loop.
export async function verifyAccount() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.mustChangePassword) redirect("/change-password");
  return user;
}

// Untuk halaman/aksi fitur bisnis (data milik SATU company). Mengembalikan
// user beserta company yang sedang dibuka (pasti terisi), sehingga query bisa
// langsung `where(eq(projects.companyId, user.company.id))`.
// - Owner/Finance/Karyawan: company-nya sendiri.
// - Superadmin: company yang dipilih di menu Company; belum memilih → ke sana.
//
// Company terkunci (langganan habis): Owner diarahkan ke /subscription,
// kecuali halaman/aksi Langganan itu sendiri (`allowLocked`). Superadmin
// tetap bisa membuka company terkunci untuk melihat datanya.
export async function verifySession({ allowLocked = false }: { allowLocked?: boolean } = {}): Promise<CompanyUser> {
  const user = await verifyAccount();
  if (!user.company) redirect("/companies");
  if (user.company.access.locked && !allowLocked && !can(user, "company:manage")) redirect("/subscription");
  return { ...user, company: user.company };
}

// Untuk halaman yang hanya boleh dibuka user dengan permission tertentu.
// Contoh: await requirePermission("settlement:verify") di halaman verifikasi.
//
// Next.js punya forbidden() untuk menampilkan halaman 403, tapi masih
// eksperimental (butuh experimental.authInterrupts), jadi untuk sekarang
// user dikembalikan ke beranda.
//
// Di Server Action, sering lebih enak memakai can() lalu mengembalikan pesan
// error (ActionResult) daripada redirect:
//
//     const user = await verifySession();
//     if (!can(user, "advance:disburse")) return { success: false, message: "Akses ditolak." };
export async function requirePermission(permission: Permission, options?: { allowLocked?: boolean }) {
  const user = await verifySession(options);
  if (!can(user, permission)) redirect("/");
  return user;
}

// Untuk halaman platform Superadmin (menu Company), yang tidak membutuhkan
// company aktif.
export async function requirePlatformAdmin() {
  const user = await verifyAccount();
  if (!can(user, "company:manage")) redirect("/");
  return user;
}
