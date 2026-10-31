// Query keuangan project untuk Beranda Owner (pengeluaran, keuntungan, grafik).
//
// Pemanggil WAJIB sudah memeriksa project:manage (OWNER): hasilnya memuat
// nilai kontrak dan keuntungan yang tidak boleh dilihat Finance / karyawan.
//
// Definisi (disepakati dengan Owner):
//   Pengeluaran = nota yang DISETUJUI (ledger EXPENSE_APPROVED). Nota yang masih
//                 menunggu verifikasi atau ditolak tidak dihitung.
//   Keuntungan  = nilai kontrak − pengeluaran. Hanya ada bila nilai kontrak diisi.
//                 Project yang masih Aktif berarti "sementara", Selesai berarti "final".
//   Dana beredar = uang muka sudah dicairkan tetapi nota belum diverifikasi.
//                 Ini BUKAN pengeluaran, jadi ditampilkan terpisah.
//
// Referensi: node_modules/next/dist/docs/01-app/03-api-reference/04-functions/io.md

import "server-only";
import { and, desc, eq, gte, sql } from "drizzle-orm";
import { io } from "next/cache";
import { zonedYearMonth } from "@/lib/dates";
import { db } from "@/lib/db";
import {
  advanceLedgerEntries,
  advanceRequests,
  expenseCategories,
  settlementItems,
} from "@/lib/db/schema";
import { MONTH_NAMES } from "@/lib/format";
import type { ProjectIconKey, ProjectStatus } from "./constants";
import { projectCondition, listProjectCards, listProjectsForManage, type ProjectStats } from "./queries";

// Pengeluaran disimpan di ledger sebagai angka negatif, jadi dibalik.
const expenseSum = sql`coalesce(-sum(${advanceLedgerEntries.amount}), 0)`.mapWith(Number);

export type ProjectFinanceRow = {
  id: string | null; // null = "Tanpa project" (uang muka lama)
  name: string;
  client: string | null;
  icon: ProjectIconKey;
  status: ProjectStatus | null;
  createdAt: Date | null;
  contractValue: number | null;
  expense: number;
  // Null bila nilai kontrak belum diisi.
  profit: number | null;
  // Keuntungan / nilai kontrak, dalam persen.
  marginPercent: number | null;
  // Pengeluaran / nilai kontrak, dalam persen (bisa lebih dari 100).
  usedPercent: number | null;
  outstanding: number;
  stats: ProjectStats;
};

export type CategoryExpense = { id: string; name: string; amount: number };
export type MonthExpense = { key: string; label: string; amount: number };

export type OwnerDashboard = {
  projects: ProjectFinanceRow[];
  categories: CategoryExpense[];
  months: MonthExpense[];
};

// Total pengeluaran per project (null = uang muka tanpa project).
async function expenseByProject(companyId: string): Promise<Map<string | null, number>> {
  const rows = await db
    .select({ projectId: advanceRequests.projectId, expense: expenseSum })
    .from(advanceLedgerEntries)
    .innerJoin(advanceRequests, eq(advanceLedgerEntries.advanceId, advanceRequests.id))
    .where(and(eq(advanceLedgerEntries.companyId, companyId), eq(advanceLedgerEntries.type, "EXPENSE_APPROVED")))
    .groupBy(advanceRequests.projectId);
  return new Map(rows.map((row) => [row.projectId, row.expense]));
}

// Pengeluaran per kategori biaya, terbesar dulu. `project` kosong = semua
// project; diisi id project atau NO_PROJECT untuk satu project saja.
export async function expenseByCategory(companyId: string, project?: string): Promise<CategoryExpense[]> {
  await io();
  return db
    .select({ id: expenseCategories.id, name: expenseCategories.name, amount: expenseSum })
    .from(advanceLedgerEntries)
    .innerJoin(advanceRequests, eq(advanceLedgerEntries.advanceId, advanceRequests.id))
    .innerJoin(settlementItems, eq(advanceLedgerEntries.settlementItemId, settlementItems.id))
    .innerJoin(expenseCategories, eq(settlementItems.categoryId, expenseCategories.id))
    .where(
      and(
        eq(advanceLedgerEntries.companyId, companyId),
        eq(advanceLedgerEntries.type, "EXPENSE_APPROVED"),
        projectCondition(project),
      ),
    )
    .groupBy(expenseCategories.id, expenseCategories.name)
    .orderBy(desc(expenseSum));
}

const MONTHS_SHOWN = 6;

// Pengeluaran per bulan (menurut tanggal di nota) untuk MONTHS_SHOWN bulan
// terakhir, bulan tanpa pengeluaran tetap tampil dengan nilai 0.
async function expenseByMonth(companyId: string): Promise<MonthExpense[]> {
  const { year, month } = zonedYearMonth(new Date());
  const keys: { key: string; label: string }[] = [];
  for (let back = MONTHS_SHOWN - 1; back >= 0; back--) {
    const date = new Date(Date.UTC(year, month - 1 - back, 1));
    const y = date.getUTCFullYear();
    const m = date.getUTCMonth();
    keys.push({
      key: `${y}-${String(m + 1).padStart(2, "0")}`,
      label: `${MONTH_NAMES[m].slice(0, 3)} ${String(y).slice(2)}`,
    });
  }

  const monthKey = sql<string>`to_char(${settlementItems.receiptDate}, 'YYYY-MM')`;
  const rows = await db
    .select({ key: monthKey, amount: expenseSum })
    .from(advanceLedgerEntries)
    .innerJoin(settlementItems, eq(advanceLedgerEntries.settlementItemId, settlementItems.id))
    .where(
      and(
        eq(advanceLedgerEntries.companyId, companyId),
        eq(advanceLedgerEntries.type, "EXPENSE_APPROVED"),
        gte(settlementItems.receiptDate, `${keys[0].key}-01`),
      ),
    )
    .groupBy(monthKey);
  const byKey = new Map(rows.map((row) => [row.key, row.amount]));
  return keys.map(({ key, label }) => ({ key, label, amount: byKey.get(key) ?? 0 }));
}

export async function getOwnerDashboard(companyId: string): Promise<OwnerDashboard> {
  await io();
  const [projects, categories, months] = await Promise.all([
    listProjectFinance(companyId),
    expenseByCategory(companyId),
    expenseByMonth(companyId),
  ]);
  return { projects, categories, months };
}

// Keuangan seluruh project (satu company). Berisi semua project aktif,
// plus project selesai / "Tanpa project" yang punya uang muka; includeAll =
// project selesai tanpa uang muka juga ikut (halaman Project milik OWNER).
export async function listProjectFinance(
  companyId: string,
  options: { includeAll?: boolean } = {},
): Promise<ProjectFinanceRow[]> {
  await io();
  const [cards, manage, expenses] = await Promise.all([
    listProjectCards({ companyId, includeAll: options.includeAll }),
    listProjectsForManage(companyId),
    expenseByProject(companyId),
  ]);

  const contractValues = new Map(manage.map((project) => [project.id, project.contractValue]));
  const projects = cards.map((card): ProjectFinanceRow => {
    const contractValue = card.id ? (contractValues.get(card.id) ?? null) : null;
    const expense = expenses.get(card.id) ?? 0;
    const profit = contractValue === null ? null : contractValue - expense;
    return {
      id: card.id,
      name: card.name,
      client: card.client,
      icon: card.icon,
      status: card.status,
      createdAt: card.createdAt,
      contractValue,
      expense,
      profit,
      marginPercent: profit !== null && contractValue ? (profit / contractValue) * 100 : null,
      usedPercent: contractValue ? (expense / contractValue) * 100 : null,
      outstanding: card.stats.outstandingAmount,
      stats: card.stats,
    };
  });

  // Aktif dulu; di dalam kelompoknya, pengeluaran terbesar dulu.
  projects.sort((a, b) => rank(a) - rank(b) || b.expense - a.expense);
  return projects;
}

function rank(project: ProjectFinanceRow) {
  return project.status === "ACTIVE" ? 0 : project.status === "COMPLETED" ? 1 : 2;
}
