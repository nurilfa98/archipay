// Server Action menu Company (platform, khusus Superadmin / company:manage).
//
// Setiap action mengecek hak akses sendiri, walaupun halamannya sudah
// dilindungi: Server Action bisa dipanggil langsung lewat POST tanpa membuka
// halamannya.
//
// - Company dibuat bersama pengaturan awal, kategori biaya awal, dan akun
//   Owner pertamanya (password sementara dikirim ke email Owner).
// - Company TIDAK dihapus, hanya dinonaktifkan; semua user company itu
//   otomatis tidak bisa login (lib/auth/dal.ts mengecek companies.is_active).
// - Superadmin bisa "masuk" ke company (cookie, lib/auth/active-company.ts)
//   untuk melihat semua menunya.
// - Tindakan Superadmin tidak dicatat ke audit log (lib/audit.ts), jadi di
//   sini memang tidak ada logAudit.
//
// Referensi:
// - node_modules/next/dist/docs/01-app/01-getting-started/07-mutating-data.md
// - node_modules/next/dist/docs/01-app/03-api-reference/04-functions/revalidatePath.md

"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { clearActiveCompanyCookie, setActiveCompanyCookie } from "@/lib/auth/active-company";
import { verifyAccount } from "@/lib/auth/dal";
import { generateTemporaryPassword, hashPassword } from "@/lib/auth/password";
import { can } from "@/lib/auth/permissions";
import { db, violatedConstraint } from "@/lib/db";
import { companies, companySettings, expenseCategories, roles, userRoles, users } from "@/lib/db/schema";
import { sendEmail } from "@/lib/email";
import { getPlatformSettings } from "@/lib/platform-settings";
import { addDays } from "@/lib/subscription-access";
import type { ActionResult } from "@/types/action-result";
import { credentialsEmail } from "@/features/users/emails";
import { DEFAULT_EXPENSE_CATEGORIES } from "./constants";
import { getCompany } from "./queries";
import { companyIdSchema, companySchema, createCompanySchema } from "./schemas";

const FORBIDDEN = { success: false, message: "Anda tidak memiliki akses." } as const;
const NOT_FOUND = { success: false, message: "Company tidak ditemukan." } as const;

async function getPlatformAdmin() {
  const actor = await verifyAccount();
  return can(actor, "company:manage") ? actor : null;
}

// ---------------------------------------------------------------------------
// Tambah company + Owner pertama
// ---------------------------------------------------------------------------

export type CreateCompanyResult = { id: string; ownerEmail: string; emailSent: boolean };

export async function createCompany(
  _prevState: ActionResult<CreateCompanyResult> | undefined,
  formData: FormData,
): Promise<ActionResult<CreateCompanyResult>> {
  if (!(await getPlatformAdmin())) return FORBIDDEN;

  const parsed = createCompanySchema.safeParse({
    name: formData.get("name") ?? "",
    address: formData.get("address") ?? "",
    phoneNumber: formData.get("phoneNumber") ?? "",
    ownerName: formData.get("ownerName") ?? "",
    ownerEmail: formData.get("ownerEmail") ?? "",
  });
  if (!parsed.success) return invalid(parsed.error);
  const { ownerName, ownerEmail, ...company } = parsed.data;

  const temporaryPassword = generateTemporaryPassword();
  const passwordHash = await hashPassword(temporaryPassword);
  const { freeDays, trialMaxUsers } = await getPlatformSettings();

  let companyId: string;
  try {
    // Semua tersimpan bersamaan atau tidak sama sekali: company tanpa
    // pengaturan atau tanpa Owner tidak bisa dipakai.
    companyId = await db.transaction(async (tx) => {
      // Setiap company baru mendapat masa gratis dengan batas pengguna masa
      // gratis (Pengaturan platform).
      const [created] = await tx
        .insert(companies)
        .values({ ...company, subscriptionUntil: addDays(new Date(), freeDays), userLimit: trialMaxUsers })
        .returning({ id: companies.id });
      await tx.insert(companySettings).values({ companyId: created.id });
      await tx
        .insert(expenseCategories)
        .values(DEFAULT_EXPENSE_CATEGORIES.map((name, index) => ({ companyId: created.id, name, sortOrder: index + 1 })));

      const [owner] = await tx
        .insert(users)
        .values({
          companyId: created.id,
          fullName: ownerName,
          email: ownerEmail,
          passwordHash,
          mustChangePassword: true,
        })
        .returning({ id: users.id });
      const [ownerRole] = await tx.select({ id: roles.id }).from(roles).where(eq(roles.name, "OWNER")).limit(1);
      // Tabel roles diisi scripts/create-superadmin.mjs.
      if (!ownerRole) throw new Error("Data role di database tidak lengkap");
      await tx.insert(userRoles).values({ userId: owner.id, roleId: ownerRole.id });
      return created.id;
    });
  } catch (error) {
    // Ditolak UNIQUE constraint di database, bukan "cek dulu baru insert",
    // agar tetap aman walau dua orang submit bersamaan.
    const constraint = violatedConstraint(error);
    if (constraint === "companies_name_unique") return fieldError("name", "Nama company sudah dipakai");
    if (constraint === "users_email_unique") return fieldError("ownerEmail", "Email sudah dipakai pengguna lain");
    throw error;
  }

  // Email dikirim SETELAH transaksi berhasil. Kalau gagal, Owner tetap
  // tersimpan; kirim ulang lewat "Reset password" setelah masuk ke company.
  const emailSent = await sendEmail(
    credentialsEmail({ fullName: ownerName, email: ownerEmail, temporaryPassword, kind: "created" }),
  );

  revalidateCompanies();
  return { success: true, data: { id: companyId, ownerEmail, emailSent } };
}

// ---------------------------------------------------------------------------
// Ubah data company
// ---------------------------------------------------------------------------

export async function updateCompany(_prevState: ActionResult | undefined, formData: FormData): Promise<ActionResult> {
  if (!(await getPlatformAdmin())) return FORBIDDEN;

  const companyId = companyIdSchema.safeParse(formData.get("companyId"));
  if (!companyId.success) return NOT_FOUND;

  const parsed = companySchema.safeParse({
    name: formData.get("name") ?? "",
    address: formData.get("address") ?? "",
    phoneNumber: formData.get("phoneNumber") ?? "",
  });
  if (!parsed.success) return invalid(parsed.error);

  try {
    const [row] = await db
      .update(companies)
      .set(parsed.data)
      .where(eq(companies.id, companyId.data))
      .returning({ id: companies.id });
    if (!row) return NOT_FOUND;
  } catch (error) {
    if (violatedConstraint(error) === "companies_name_unique") return fieldError("name", "Nama company sudah dipakai");
    throw error;
  }

  // Nama company tampil di header semua halaman.
  revalidatePath("/", "layout");
  return { success: true, data: undefined };
}

// ---------------------------------------------------------------------------
// Aktifkan / nonaktifkan
// ---------------------------------------------------------------------------

// Dipanggil dari event handler (bukan form), jadi argumennya bisa dikirim
// siapa saja dengan nilai apa saja. Keduanya divalidasi ulang dengan zod.
export async function setCompanyActive(companyId: string, active: boolean): Promise<ActionResult> {
  if (!(await getPlatformAdmin())) return FORBIDDEN;

  const input = z.object({ companyId: companyIdSchema, active: z.boolean() }).safeParse({ companyId, active });
  if (!input.success) return NOT_FOUND;

  // Sesi user company ini berhenti di request berikutnya: getCurrentUser()
  // di DAL mengecek companies.is_active.
  const [row] = await db
    .update(companies)
    .set({ isActive: input.data.active })
    .where(eq(companies.id, input.data.companyId))
    .returning({ id: companies.id });
  if (!row) return NOT_FOUND;

  revalidatePath("/", "layout");
  return { success: true, data: undefined };
}

// ---------------------------------------------------------------------------
// Superadmin masuk / keluar company (lib/auth/active-company.ts)
// ---------------------------------------------------------------------------

// Dipanggil dari <form action={enterCompany}> dengan hidden input companyId.
export async function enterCompany(formData: FormData) {
  if (!(await getPlatformAdmin())) redirect("/");

  const companyId = companyIdSchema.safeParse(formData.get("companyId"));
  const company = companyId.success ? await getCompany(companyId.data) : null;
  if (!company) redirect("/companies");

  await setActiveCompanyCookie(company.id);
  // Data user (termasuk company aktif) di-cache per sesi; buang agar menu &
  // halaman langsung memakai company yang baru dipilih.
  revalidatePath("/", "layout");
  redirect("/");
}

export async function leaveCompany() {
  if (await getPlatformAdmin()) await clearActiveCompanyCookie();
  revalidatePath("/", "layout");
  redirect("/companies");
}

function invalid(error: z.ZodError) {
  return {
    success: false as const,
    message: "Periksa kembali isian Anda.",
    fieldErrors: z.flattenError(error).fieldErrors as Record<string, string[]>,
  };
}

function fieldError(field: string, message: string) {
  return { success: false as const, message: "Periksa kembali isian Anda.", fieldErrors: { [field]: [message] } };
}

function revalidateCompanies() {
  revalidatePath("/companies", "layout");
}
