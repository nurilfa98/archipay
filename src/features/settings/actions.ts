// Server Action halaman Pengaturan (khusus OWNER, permission settings:manage).
//
// - Kebijakan uang muka: batas unggah nota, batas pengembalian, batas biaya
//   tanpa nota. Hanya berlaku untuk uang muka yang DICAIRKAN SETELAHNYA,
//   karena tenggat disalin ke setiap uang muka saat pencairan (dan sudah
//   disetujui karyawan).
// - Kategori biaya: tambah, ganti nama, aktif/nonaktif. Tidak bisa dihapus
//   agar nota lama tetap utuh; kategori nonaktif tidak muncul di form nota.

"use server";

import { and, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { logAudit } from "@/lib/audit";
import { verifySession, type CompanyUser } from "@/lib/auth/dal";
import { can } from "@/lib/auth/permissions";
import { db, isUniqueViolation } from "@/lib/db";
import { companySettings, expenseCategories } from "@/lib/db/schema";
import { getClientIp } from "@/lib/request";
import type { ActionResult } from "@/types/action-result";
import { getCompanySettings } from "./queries";
import { categoryIdSchema, categoryNameSchema, companySettingsSchema } from "./schemas";

const FORBIDDEN = { success: false, message: "Anda tidak memiliki akses." } as const;
const NAME_TAKEN = {
  success: false as const,
  message: "Periksa kembali isian Anda.",
  fieldErrors: { name: ["Nama kategori sudah ada"] },
};

async function getSettingsManager() {
  const actor = await verifySession();
  return can(actor, "settings:manage") ? actor : null;
}

// ---------------------------------------------------------------------------
// Kebijakan uang muka
// ---------------------------------------------------------------------------

export async function updateCompanySettings(
  _prevState: ActionResult | undefined,
  formData: FormData,
): Promise<ActionResult> {
  const actor = await getSettingsManager();
  if (!actor) return FORBIDDEN;

  const parsed = companySettingsSchema.safeParse({
    settlementDueDays: formData.get("settlementDueDays"),
    returnDueDays: formData.get("returnDueDays"),
    maxOverdueAdvances: formData.get("maxOverdueAdvances"),
    noReceiptMaxAmount: formData.get("noReceiptMaxAmount") ?? "",
  });
  if (!parsed.success) return invalid(parsed.error);

  const before = await getCompanySettings(actor.company.id);
  const changed = (Object.keys(parsed.data) as (keyof typeof parsed.data)[]).filter(
    (key) => before[key] !== parsed.data[key],
  );
  if (changed.length === 0) return { success: true, data: undefined };

  const ip = await getClientIp();
  await db.transaction(async (tx) => {
    await tx
      .update(companySettings)
      .set({ ...parsed.data, updatedById: actor.id })
      .where(eq(companySettings.companyId, actor.company.id));
    await logAudit(
      {
        companyId: actor.company.id,
        userId: actor.id,
        action: "SETTINGS_UPDATED",
        entityName: "company_settings",
        entityId: actor.company.id,
        oldValues: Object.fromEntries(changed.map((key) => [key, before[key]])),
        newValues: Object.fromEntries(changed.map((key) => [key, parsed.data[key]])),
        ipAddress: ip,
      },
      tx,
    );
  });

  revalidatePath("/settings");
  // Batas biaya tanpa nota & tenggat ditampilkan di form uang muka dan nota.
  revalidatePath("/advances", "layout");
  revalidatePath("/settlements", "layout");
  return { success: true, data: undefined };
}

// ---------------------------------------------------------------------------
// Kategori biaya
// ---------------------------------------------------------------------------

export async function createExpenseCategory(name: string): Promise<ActionResult> {
  const actor = await getSettingsManager();
  if (!actor) return FORBIDDEN;

  const parsed = categoryNameSchema.safeParse(name);
  if (!parsed.success) return nameError(parsed.error);

  const ip = await getClientIp();
  try {
    await db.transaction(async (tx) => {
      // Kategori baru diletakkan paling bawah.
      const [{ next }] = await tx
        .select({ next: sql`coalesce(max(${expenseCategories.sortOrder}), 0) + 1`.mapWith(Number) })
        .from(expenseCategories)
        .where(eq(expenseCategories.companyId, actor.company.id));
      const [created] = await tx
        .insert(expenseCategories)
        .values({ companyId: actor.company.id, name: parsed.data, sortOrder: next })
        .returning({ id: expenseCategories.id });
      await logAudit(
        {
          companyId: actor.company.id,
          userId: actor.id,
          action: "EXPENSE_CATEGORY_CREATED",
          entityName: "expense_categories",
          entityId: created.id,
          newValues: { name: parsed.data },
          ipAddress: ip,
        },
        tx,
      );
    });
  } catch (error) {
    if (isUniqueViolation(error)) return NAME_TAKEN;
    throw error;
  }

  revalidateCategories();
  return { success: true, data: undefined };
}

export async function renameExpenseCategory(categoryId: string, name: string): Promise<ActionResult> {
  const actor = await getSettingsManager();
  if (!actor) return FORBIDDEN;

  const id = categoryIdSchema.safeParse(categoryId);
  const parsed = categoryNameSchema.safeParse(name);
  if (!id.success) return { success: false, message: "Kategori tidak ditemukan." };
  if (!parsed.success) return nameError(parsed.error);

  return updateCategory(actor, id.data, { name: parsed.data });
}

export async function setExpenseCategoryActive(categoryId: string, isActive: boolean): Promise<ActionResult> {
  const actor = await getSettingsManager();
  if (!actor) return FORBIDDEN;

  const id = categoryIdSchema.safeParse(categoryId);
  if (!id.success || typeof isActive !== "boolean") return { success: false, message: "Kategori tidak ditemukan." };

  return updateCategory(actor, id.data, { isActive });
}

async function updateCategory(
  actor: CompanyUser,
  categoryId: string,
  values: { name?: string; isActive?: boolean },
): Promise<ActionResult> {
  const ip = await getClientIp();
  try {
    const updated = await db.transaction(async (tx) => {
      const [before] = await tx
        .select({ name: expenseCategories.name, isActive: expenseCategories.isActive })
        .from(expenseCategories)
        .where(and(eq(expenseCategories.id, categoryId), eq(expenseCategories.companyId, actor.company.id)))
        .limit(1);
      if (!before) return false;

      await tx.update(expenseCategories).set(values).where(eq(expenseCategories.id, categoryId));
      await logAudit(
        {
          companyId: actor.company.id,
          userId: actor.id,
          action: "EXPENSE_CATEGORY_UPDATED",
          entityName: "expense_categories",
          entityId: categoryId,
          oldValues: before,
          newValues: values,
          ipAddress: ip,
        },
        tx,
      );
      return true;
    });
    if (!updated) return { success: false, message: "Kategori tidak ditemukan." };
  } catch (error) {
    if (isUniqueViolation(error)) return NAME_TAKEN;
    throw error;
  }

  revalidateCategories();
  return { success: true, data: undefined };
}

function invalid(error: z.ZodError) {
  return {
    success: false as const,
    message: "Periksa kembali isian Anda.",
    fieldErrors: z.flattenError(error).fieldErrors as Record<string, string[]>,
  };
}

function nameError(error: z.ZodError) {
  return {
    success: false as const,
    message: "Periksa kembali isian Anda.",
    fieldErrors: { name: [z.flattenError(error).formErrors[0] ?? "Nama tidak valid"] },
  };
}

function revalidateCategories() {
  revalidatePath("/settings");
  revalidatePath("/settlements", "layout");
}
