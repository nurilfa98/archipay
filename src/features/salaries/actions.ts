// Server Action Penggajian bagian data (BUSINESS-FLOW §20.2–20.3): pengaturan
// penggajian dan data gaji per karyawan, selama add-on Penggajian aktif
// (lib/auth/permissions.ts).
// - Pengaturan penggajian: Owner (salary:manage).
// - Data gaji: Owner & Finance (salary:prepare). Finance tidak bisa mengubah
//   data gajinya sendiri, Owner, atau Finance lain (access.ts).
// Audit log mencatat siapa mengubah apa tanpa nominal (Superadmin bisa membuka
// audit log).

"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { logAudit } from "@/lib/audit";
import { verifySession } from "@/lib/auth/dal";
import { can } from "@/lib/auth/permissions";
import { db } from "@/lib/db";
import { companySettings, salaryComponents, salaryProfiles, users } from "@/lib/db/schema";
import { getClientIp } from "@/lib/request";
import type { ActionResult } from "@/types/action-result";
import { SALARY_EDIT_DENIED, salaryEditChecker } from "./access";
import { idSchema, payrollSettingsSchema, salaryProfileSchema } from "./schemas";

const FORBIDDEN = { success: false, message: "Anda tidak memiliki akses." } as const;

async function getSalaryManager() {
  const actor = await verifySession();
  return can(actor, "salary:manage") ? actor : null;
}

async function getSalaryPreparer() {
  const actor = await verifySession();
  return can(actor, "salary:prepare") ? actor : null;
}

export async function updatePayrollSettings(
  _prevState: ActionResult | undefined,
  formData: FormData,
): Promise<ActionResult> {
  const actor = await getSalaryManager();
  if (!actor) return FORBIDDEN;

  const parsed = payrollSettingsSchema.safeParse({
    absenceDeduction: formData.get("absenceDeduction"),
    dailyRateMethod: formData.get("dailyRateMethod"),
    dailyDivisor: formData.get("dailyDivisor"),
    deductionBase: formData.get("deductionBase"),
    overtimeMethod: formData.get("overtimeMethod"),
  });
  if (!parsed.success) return invalid(parsed.error);

  const ip = await getClientIp();
  await db.transaction(async (tx) => {
    await tx
      .update(companySettings)
      .set({
        payrollAbsenceDeduction: parsed.data.absenceDeduction,
        payrollDailyRateMethod: parsed.data.dailyRateMethod,
        payrollDailyDivisor: parsed.data.dailyDivisor,
        payrollDeductionBase: parsed.data.deductionBase,
        payrollOvertimeMethod: parsed.data.overtimeMethod,
        updatedById: actor.id,
      })
      .where(eq(companySettings.companyId, actor.company.id));
    await logAudit(
      {
        companyId: actor.company.id,
        userId: actor.id,
        action: "PAYROLL_SETTINGS_UPDATED",
        entityName: "company_settings",
        entityId: actor.company.id,
        newValues: parsed.data,
        ipAddress: ip,
      },
      tx,
    );
  });

  revalidatePath("/settings");
  revalidatePath("/payroll", "layout");
  return { success: true, data: undefined };
}

export async function saveSalaryProfile(userId: string, formData: FormData): Promise<ActionResult> {
  const actor = await getSalaryPreparer();
  if (!actor) return FORBIDDEN;
  const id = idSchema.safeParse(userId);
  if (!id.success) return { success: false, message: "Pengguna tidak ditemukan." };
  if (!(await salaryEditChecker(actor))(id.data)) return { success: false, message: SALARY_EDIT_DENIED };

  const parsed = salaryProfileSchema.safeParse({
    baseSalary: formData.get("baseSalary") ?? "",
    dailyRate: formData.get("dailyRate") ?? "",
    overtimeHourlyRate: formData.get("overtimeHourlyRate") ?? "",
    startDate: formData.get("startDate") ?? "",
    endDate: formData.get("endDate") ?? "",
    absenceExempt: formData.get("absenceExempt"),
    components: formData.get("components") ?? "[]",
  });
  if (!parsed.success) return invalid(parsed.error);

  const [target] = await db
    .select({ id: users.id, fullName: users.fullName })
    .from(users)
    .where(and(eq(users.id, id.data), eq(users.companyId, actor.company.id)))
    .limit(1);
  if (!target) return { success: false, message: "Pengguna tidak ditemukan." };

  // Tarif lembur hanya ikut diubah bila isiannya tampil di form (cara hitung "tarif sendiri");
  // selain itu tarif yang tersimpan dipertahankan.
  const { components, overtimeHourlyRate, ...profileRest } = parsed.data;
  const profile = formData.has("overtimeHourlyRate") ? { ...profileRest, overtimeHourlyRate } : profileRest;
  const ip = await getClientIp();
  await db.transaction(async (tx) => {
    const values = { ...profile, updatedById: actor.id };
    await tx
      .insert(salaryProfiles)
      .values({ userId: target.id, companyId: actor.company.id, ...values })
      .onConflictDoUpdate({ target: salaryProfiles.userId, set: values });
    await tx.delete(salaryComponents).where(eq(salaryComponents.userId, target.id));
    if (components.length > 0) {
      await tx.insert(salaryComponents).values(
        components.map((component, index) => ({
          ...component,
          companyId: actor.company.id,
          userId: target.id,
          sortOrder: index,
        })),
      );
    }
    await logAudit(
      {
        companyId: actor.company.id,
        userId: actor.id,
        action: "SALARY_PROFILE_SAVED",
        entityName: "users",
        entityId: target.id,
        // Tanpa nominal (data gaji rahasia).
        newValues: {
          fullName: target.fullName,
          allowanceCount: components.filter((component) => component.type === "ALLOWANCE").length,
          deductionCount: components.filter((component) => component.type === "DEDUCTION").length,
          startDate: profile.startDate,
          endDate: profile.endDate,
          absenceExempt: profile.absenceExempt,
        },
        ipAddress: ip,
      },
      tx,
    );
  });

  revalidatePath("/payroll", "layout");
  return { success: true, data: undefined };
}

// Hapus data gaji: pengguna tidak ikut penggajian berikutnya. Slip lama tetap ada.
export async function deleteSalaryProfile(userId: string): Promise<ActionResult> {
  const actor = await getSalaryPreparer();
  if (!actor) return FORBIDDEN;
  const id = idSchema.safeParse(userId);
  if (!id.success) return { success: false, message: "Data gaji tidak ditemukan." };
  if (!(await salaryEditChecker(actor))(id.data)) return { success: false, message: SALARY_EDIT_DENIED };

  const ip = await getClientIp();
  const deleted = await db.transaction(async (tx) => {
    const [row] = await tx
      .delete(salaryProfiles)
      .where(and(eq(salaryProfiles.userId, id.data), eq(salaryProfiles.companyId, actor.company.id)))
      .returning({ userId: salaryProfiles.userId });
    if (!row) return false;
    await tx.delete(salaryComponents).where(eq(salaryComponents.userId, row.userId));
    await logAudit(
      {
        companyId: actor.company.id,
        userId: actor.id,
        action: "SALARY_PROFILE_DELETED",
        entityName: "users",
        entityId: row.userId,
        ipAddress: ip,
      },
      tx,
    );
    return true;
  });
  if (!deleted) return { success: false, message: "Data gaji tidak ditemukan." };

  revalidatePath("/payroll", "layout");
  return { success: true, data: undefined };
}

function invalid(error: z.ZodError) {
  return {
    success: false as const,
    message: "Periksa kembali isian Anda.",
    fieldErrors: z.flattenError(error).fieldErrors as Record<string, string[]>,
  };
}
