// Pengaturan company (tabel company_settings, satu baris per company) dan
// daftar kategori biaya untuk halaman Pengaturan (khusus OWNER).

import "server-only";
import { and, asc, eq, sql } from "drizzle-orm";
import { io } from "next/cache";
import { notSuperadmin } from "@/lib/auth/superadmin";
import { db } from "@/lib/db";
import { companySettings, expenseCategories, settlementItems, users } from "@/lib/db/schema";

export type CompanySettings = {
  settlementDueDays: number;
  returnDueDays: number;
  noReceiptMaxAmount: number;
  maxOverdueAdvances: number;
};

export async function getCompanySettings(companyId: string): Promise<CompanySettings> {
  await io(); // lihat penjelasan di features/users/queries.ts
  const [row] = await db
    .select({
      settlementDueDays: companySettings.settlementDueDays,
      returnDueDays: companySettings.returnDueDays,
      noReceiptMaxAmount: companySettings.noReceiptMaxAmount,
      maxOverdueAdvances: companySettings.maxOverdueAdvances,
    })
    .from(companySettings)
    .where(eq(companySettings.companyId, companyId))
    .limit(1);

  // Barisnya dibuat bersama company-nya (features/companies/actions.ts). Bila
  // hilang, lebih baik error jelas daripada diam-diam memakai nilai lain dari
  // yang diatur OWNER.
  if (!row) throw new Error(`Baris company_settings untuk company ${companyId} tidak ditemukan.`);
  return row;
}

// Siapa & kapan terakhir mengubah pengaturan (ditampilkan di halaman Pengaturan).
// Bila yang mengubah superadmin, namanya tidak ditampilkan (updatedByName null).
export async function getSettingsUpdateInfo(
  companyId: string,
): Promise<{ updatedAt: Date; updatedByName: string | null }> {
  await io();
  const [row] = await db
    .select({ updatedAt: companySettings.updatedAt, updatedByName: users.fullName })
    .from(companySettings)
    .leftJoin(users, and(eq(companySettings.updatedById, users.id), notSuperadmin(users.id)))
    .where(eq(companySettings.companyId, companyId))
    .limit(1);
  return row ?? { updatedAt: new Date(0), updatedByName: null };
}

export type ExpenseCategoryWithUsage = {
  id: string;
  name: string;
  isActive: boolean;
  usageCount: number; // jumlah nota yang memakai kategori ini
};

// Semua kategori, termasuk yang nonaktif. Untuk pilihan di form nota pakai
// listExpenseCategories() di features/settlements/queries.ts (hanya aktif).
export async function listAllExpenseCategories(companyId: string): Promise<ExpenseCategoryWithUsage[]> {
  await io();
  return db
    .select({
      id: expenseCategories.id,
      name: expenseCategories.name,
      isActive: expenseCategories.isActive,
      usageCount: sql`(select count(*) from ${settlementItems} where ${settlementItems.categoryId} = ${expenseCategories.id})`.mapWith(
        Number,
      ),
    })
    .from(expenseCategories)
    .where(eq(expenseCategories.companyId, companyId))
    .orderBy(asc(expenseCategories.sortOrder), asc(expenseCategories.name));
}
