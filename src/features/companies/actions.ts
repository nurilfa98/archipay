// Server Action menu Company (platform, khusus Superadmin / company:manage).
//
// Setiap action mengecek hak akses sendiri, walaupun halamannya sudah
// dilindungi: Server Action bisa dipanggil langsung lewat POST tanpa membuka
// halamannya.
//
// - Company dibuat bersama pengaturan awal, kategori biaya awal, dan akun
//   Owner pertamanya (password sementara dikirim ke email Owner).
// - Nonaktifkan: semua user company itu otomatis tidak bisa login
//   (lib/auth/dal.ts mengecek companies.is_active), data tetap tersimpan.
// - Hapus: company beserta SEMUA datanya dihapus permanen (deleteCompany).
// - Superadmin bisa "masuk" ke company (cookie, lib/auth/active-company.ts)
//   untuk melihat semua menunya.
// - Tindakan Superadmin tidak dicatat ke audit log (lib/audit.ts), jadi di
//   sini memang tidak ada logAudit.
//
// Referensi:
// - node_modules/next/dist/docs/01-app/01-getting-started/07-mutating-data.md
// - node_modules/next/dist/docs/01-app/03-api-reference/04-functions/revalidatePath.md

"use server";

import { and, eq, inArray, isNull, or } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { z } from "zod";
import { clearActiveCompanyCookie, readActiveCompanyCookie, setActiveCompanyCookie } from "@/lib/auth/active-company";
import { verifyAccount } from "@/lib/auth/dal";
import { generateTemporaryPassword, hashPassword } from "@/lib/auth/password";
import { can } from "@/lib/auth/permissions";
import { db, violatedConstraint } from "@/lib/db";
import {
  advanceLedgerEntries,
  attendanceConsents,
  attendanceHolidays,
  attendanceLocations,
  attendancePenalties,
  attendancePeriods,
  attendanceRecords,
  payrollRuns,
  payslips,
  salaryComponents,
  salaryProfiles,
  leaveRequests,
  leaveTypes,
  faceProfiles,
  advanceRequests,
  auditLogs,
  companies,
  companyPricing,
  companySettings,
  documentSequences,
  expenseCategories,
  loginAttempts,
  projects,
  reminderLogs,
  roles,
  settlementItems,
  settlements,
  subscriptionPayments,
  subscriptions,
  userRoles,
  users,
} from "@/lib/db/schema";
import { sendEmail } from "@/lib/email";
import { deleteObject } from "@/lib/storage";
import { addDays } from "@/lib/subscription-access";
import type { ActionResult } from "@/types/action-result";
import { credentialsEmail } from "@/features/users/emails";
import { DEFAULT_LEAVE_TYPES } from "@/features/attendance/constants";
import { DEFAULT_EXPENSE_CATEGORIES } from "./constants";
import { getCompany } from "./queries";
import { companyIdSchema, companySchema, createCompanySchema } from "./schemas";
import { logError } from "@/lib/error-log";

const FORBIDDEN = { success: false, message: "Anda tidak memiliki akses." } as const;
const NOT_FOUND = { success: false, message: "Perusahaan tidak ditemukan." } as const;

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
    freeDays: formData.get("freeDays"),
    trialMaxUsers: formData.get("trialMaxUsers"),
    ownerName: formData.get("ownerName") ?? "",
    ownerEmail: formData.get("ownerEmail") ?? "",
  });
  if (!parsed.success) return invalid(parsed.error);
  const { ownerName, ownerEmail, freeDays, trialMaxUsers, ...company } = parsed.data;

  const temporaryPassword = generateTemporaryPassword();
  const passwordHash = await hashPassword(temporaryPassword);

  let companyId: string;
  try {
    // Semua tersimpan bersamaan atau tidak sama sekali: company tanpa
    // pengaturan atau tanpa Owner tidak bisa dipakai.
    companyId = await db.transaction(async (tx) => {
      // Setiap company baru mendapat masa gratis dengan batas pengguna masa
      // gratis, diisi Superadmin di form (nilai awal dari Pengaturan platform).
      const [created] = await tx
        .insert(companies)
        .values({ ...company, subscriptionUntil: addDays(new Date(), freeDays), userLimit: trialMaxUsers })
        .returning({ id: companies.id });
      await tx.insert(companySettings).values({ companyId: created.id });
      await tx
        .insert(expenseCategories)
        .values(DEFAULT_EXPENSE_CATEGORIES.map((name, index) => ({ companyId: created.id, name, sortOrder: index + 1 })));
      await tx
        .insert(leaveTypes)
        .values(DEFAULT_LEAVE_TYPES.map((type, index) => ({ ...type, companyId: created.id, sortOrder: index + 1 })));

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
    if (constraint === "companies_name_unique") return fieldError("name", "Nama perusahaan sudah dipakai");
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
    if (violatedConstraint(error) === "companies_name_unique") return fieldError("name", "Nama perusahaan sudah dipakai");
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
// Hapus company beserta semua datanya (permanen)
// ---------------------------------------------------------------------------

// Dipanggil dari event handler. confirmName = nama company yang diketik ulang
// di dialog konfirmasi; dicek lagi di sini agar penghapusan tidak terjadi
// karena salah klik atau request yang dikirim langsung.
//
// Semua baris dihapus dalam SATU transaksi (semua atau tidak sama sekali),
// berurutan dari tabel anak ke induk karena foreign key tanpa onDelete
// cascade. File nota & bukti bayar di penyimpanan dihapus SETELAH transaksi
// berhasil (after()), sehingga kegagalan hapus file tidak membatalkan apa pun.
// Berhasil → redirect ke daftar company.
export async function deleteCompany(companyId: string, confirmName: string): Promise<ActionResult> {
  if (!(await getPlatformAdmin())) return FORBIDDEN;

  const input = z.object({ companyId: companyIdSchema, confirmName: z.string().max(200) }).safeParse({
    companyId,
    confirmName,
  });
  if (!input.success) return NOT_FOUND;

  const [company] = await db
    .select({ id: companies.id, name: companies.name })
    .from(companies)
    .where(eq(companies.id, input.data.companyId))
    .limit(1);
  if (!company) return NOT_FOUND;
  if (input.data.confirmName.trim() !== company.name) {
    return { success: false, message: "Nama perusahaan yang diketik tidak sesuai." };
  }

  const fileKeys = await db.transaction(async (tx) => {
    const id = company.id;
    const companyUsers = await tx
      .select({ id: users.id, email: users.email })
      .from(users)
      .where(eq(users.companyId, id));
    const userIds = companyUsers.map((user) => user.id);

    // Key file dikumpulkan sebelum barisnya hilang.
    const [receiptFiles, proofFiles, faceFiles, leaveFiles] = await Promise.all([
      // Nota yang sudah dihapus otomatis (lewat masa simpan) dilewati.
      tx
        .select({ key: settlementItems.fileKey })
        .from(settlementItems)
        .where(and(eq(settlementItems.companyId, id), isNull(settlementItems.fileDeletedAt))),
      tx
        .select({ key: subscriptionPayments.proofKey })
        .from(subscriptionPayments)
        .where(eq(subscriptionPayments.companyId, id)),
      tx.select({ key: faceProfiles.photoKey }).from(faceProfiles).where(eq(faceProfiles.companyId, id)),
      tx.select({ key: leaveRequests.attachmentKey }).from(leaveRequests).where(eq(leaveRequests.companyId, id)),
    ]);

    // Absensi (BUSINESS-FLOW §18.11) & cuti/izin (§19).
    await tx.delete(leaveRequests).where(eq(leaveRequests.companyId, id));
    await tx.delete(leaveTypes).where(eq(leaveTypes.companyId, id));
    await tx.delete(attendancePenalties).where(eq(attendancePenalties.companyId, id));
    await tx.delete(attendanceRecords).where(eq(attendanceRecords.companyId, id));
    await tx.delete(faceProfiles).where(eq(faceProfiles.companyId, id));
    await tx.delete(attendanceConsents).where(eq(attendanceConsents.companyId, id));
    await tx.delete(attendanceHolidays).where(eq(attendanceHolidays.companyId, id));
    await tx.delete(attendanceLocations).where(eq(attendanceLocations.companyId, id));
    await tx.delete(attendancePeriods).where(eq(attendancePeriods.companyId, id));

    // Penggajian (BUSINESS-FLOW §20); baris slip ikut terhapus bersama slipnya.
    await tx.delete(payslips).where(eq(payslips.companyId, id));
    await tx.delete(payrollRuns).where(eq(payrollRuns.companyId, id));
    await tx.delete(salaryComponents).where(eq(salaryComponents.companyId, id));
    await tx.delete(salaryProfiles).where(eq(salaryProfiles.companyId, id));

    // Uang muka & pertanggungjawaban (anak → induk).
    await tx
      .delete(reminderLogs)
      .where(
        inArray(
          reminderLogs.advanceId,
          tx.select({ id: advanceRequests.id }).from(advanceRequests).where(eq(advanceRequests.companyId, id)),
        ),
      );
    await tx.delete(advanceLedgerEntries).where(eq(advanceLedgerEntries.companyId, id));
    await tx.delete(settlementItems).where(eq(settlementItems.companyId, id));
    await tx.delete(settlements).where(eq(settlements.companyId, id));
    await tx.delete(advanceRequests).where(eq(advanceRequests.companyId, id));
    await tx.delete(projects).where(eq(projects.companyId, id));
    await tx.delete(documentSequences).where(eq(documentSequences.companyId, id));
    await tx.delete(expenseCategories).where(eq(expenseCategories.companyId, id));

    // Langganan.
    await tx.delete(subscriptionPayments).where(eq(subscriptionPayments.companyId, id));
    await tx.delete(subscriptions).where(eq(subscriptions.companyId, id));
    await tx.delete(companyPricing).where(eq(companyPricing.companyId, id));
    await tx.delete(companySettings).where(eq(companySettings.companyId, id));

    // Jejak audit company ini & semua user-nya, catatan percobaan login
    // akun-akunnya, lalu user (user_roles ikut terhapus: onDelete cascade).
    const byCompany = eq(auditLogs.companyId, id);
    await tx.delete(auditLogs).where(userIds.length > 0 ? or(byCompany, inArray(auditLogs.userId, userIds)) : byCompany);
    if (companyUsers.length > 0) {
      await tx.delete(loginAttempts).where(inArray(loginAttempts.email, companyUsers.map((user) => user.email)));
    }
    await tx.delete(users).where(eq(users.companyId, id));

    await tx.delete(companies).where(eq(companies.id, id));

    return [...receiptFiles, ...proofFiles, ...faceFiles, ...leaveFiles].map((file) => file.key).filter((key): key is string => key !== null);
  });

  after(async () => {
    // 20 file sekaligus agar tidak membuka ratusan request bersamaan.
    let failed = 0;
    for (let start = 0; start < fileKeys.length; start += 20) {
      const results = await Promise.allSettled(fileKeys.slice(start, start + 20).map((key) => deleteObject(key)));
      failed += results.filter((result) => result.status === "rejected").length;
    }
    if (failed > 0) {
      await logError(new Error(`${failed} file perusahaan gagal dihapus`), {
        source: "EXTERNAL",
        action: "hapus file perusahaan",
        context: { companyId: company.id },
      });
    }
  });

  // Superadmin sedang membuka company ini: keluarkan dari company tersebut.
  if ((await readActiveCompanyCookie()) === company.id) await clearActiveCompanyCookie();

  revalidatePath("/", "layout");
  redirect("/companies");
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
