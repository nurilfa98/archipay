// Pengaturan perusahaan (tabel company_settings, selalu satu baris) dan
// daftar kategori biaya untuk halaman Pengaturan (khusus OWNER).

import "server-only";
import { asc, eq, sql } from "drizzle-orm";
import { io } from "next/cache";
import { db } from "@/lib/db";
import { companySettings, expenseCategories, settlementItems, users } from "@/lib/db/schema";

export type CompanySettings = {
  settlementDueDays: number;
  returnDueDays: number;
  noReceiptMaxAmount: number;
};

export async function getCompanySettings(): Promise<CompanySettings> {
  await io(); // lihat penjelasan di features/users/queries.ts
  const [row] = await db
    .select({
      settlementDueDays: companySettings.settlementDueDays,
      returnDueDays: companySettings.returnDueDays,
      noReceiptMaxAmount: companySettings.noReceiptMaxAmount,
    })
    .from(companySettings)
    .where(eq(companySettings.id, 1))
    .limit(1);

  // Barisnya dibuat oleh migration 0003. Bila hilang, lebih baik error jelas
  // daripada diam-diam memakai nilai lain dari yang diatur OWNER.
  if (!row) throw new Error("Baris company_settings tidak ditemukan. Jalankan pnpm db:migrate.");
  return row;
}

// Siapa & kapan terakhir mengubah pengaturan (ditampilkan di halaman Pengaturan).
export async function getSettingsUpdateInfo(): Promise<{ updatedAt: Date; updatedByName: string | null }> {
  await io();
  const [row] = await db
    .select({ updatedAt: companySettings.updatedAt, updatedByName: users.fullName })
    .from(companySettings)
    .leftJoin(users, eq(companySettings.updatedById, users.id))
    .where(eq(companySettings.id, 1))
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
export async function listAllExpenseCategories(): Promise<ExpenseCategoryWithUsage[]> {
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
    .orderBy(asc(expenseCategories.sortOrder), asc(expenseCategories.name));
}
