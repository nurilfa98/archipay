// Data untuk laporan PDF satu project (khusus OWNER).
//
// Pemanggil WAJIB sudah memeriksa project:manage: laporan memuat nilai kontrak
// dan keuntungan. Definisi angkanya sama dengan Beranda Owner (lihat
// finance-queries.ts): pengeluaran = nota yang DISETUJUI saat verifikasi.
//
// Referensi: node_modules/next/dist/docs/01-app/03-api-reference/04-functions/io.md

import "server-only";
import { asc, eq, and } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { io } from "next/cache";
import type { AdvanceStatus } from "@/features/advances/constants";
import { db } from "@/lib/db";
import {
  advanceLedgerEntries,
  advanceRequests,
  expenseCategories,
  projects,
  settlementItems,
  settlements,
  users,
} from "@/lib/db/schema";
import { type ProjectStatus } from "./constants";

// Sudah dicairkan (dana pernah berpindah ke karyawan).
const DISBURSED_STATUSES: readonly AdvanceStatus[] = [
  "DISBURSED",
  "ACKNOWLEDGED",
  "SUBMITTED",
  "REVISION_REQUESTED",
  "RETURN_PENDING",
  "REIMBURSE_PENDING",
  "CLOSED",
];
// Dicairkan tetapi nota belum diverifikasi: sama dengan "Dana beredar" di Beranda.
const OUTSTANDING_STATUSES: readonly AdvanceStatus[] = ["DISBURSED", "ACKNOWLEDGED", "SUBMITTED", "REVISION_REQUESTED"];

export type ReportReceipt = {
  date: string; // tanggal di nota, "2026-10-24"
  settlementNumber: string | null;
  advanceNumber: string;
  employee: string;
  category: string;
  description: string;
  hasReceipt: boolean;
  amount: number;
};

export type ReportRow = { name: string; count: number; amount: number };
export type ReportEmployee = { name: string; advances: number; disbursed: number; expense: number };

export type ProjectReport = {
  project: { id: string; name: string; client: string | null; status: ProjectStatus; contractValue: number | null };
  summary: {
    contractValue: number | null;
    expense: number;
    profit: number | null;
    marginPercent: number | null;
    usedPercent: number | null;
    outstanding: number;
    advanceCount: number; // sudah dicairkan
    disbursedTotal: number;
    receiptCount: number;
  };
  categories: ReportRow[];
  employees: ReportEmployee[];
  receipts: ReportReceipt[];
};

const recipient = alias(users, "recipient");

export async function getProjectReport(projectId: string): Promise<ProjectReport | null> {
  await io();
  const [project] = await db
    .select({
      id: projects.id,
      name: projects.name,
      client: projects.client,
      status: projects.status,
      contractValue: projects.contractValue,
    })
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);
  if (!project) return null;

  const [advances, receipts] = await Promise.all([
    db
      .select({
        recipientId: advanceRequests.recipientId,
        recipientName: recipient.fullName,
        amount: advanceRequests.amount,
        status: advanceRequests.status,
      })
      .from(advanceRequests)
      .innerJoin(recipient, eq(advanceRequests.recipientId, recipient.id))
      .where(eq(advanceRequests.projectId, projectId)),
    db
      .select({
        recipientId: advanceRequests.recipientId,
        employee: recipient.fullName,
        advanceNumber: advanceRequests.number,
        settlementNumber: settlements.number,
        date: settlementItems.receiptDate,
        category: expenseCategories.name,
        description: settlementItems.description,
        hasReceipt: settlementItems.hasReceipt,
        amount: settlementItems.amount,
      })
      .from(advanceLedgerEntries)
      .innerJoin(advanceRequests, eq(advanceLedgerEntries.advanceId, advanceRequests.id))
      .innerJoin(settlementItems, eq(advanceLedgerEntries.settlementItemId, settlementItems.id))
      .innerJoin(settlements, eq(settlementItems.settlementId, settlements.id))
      .innerJoin(expenseCategories, eq(settlementItems.categoryId, expenseCategories.id))
      .innerJoin(recipient, eq(advanceRequests.recipientId, recipient.id))
      .where(and(eq(advanceRequests.projectId, projectId), eq(advanceLedgerEntries.type, "EXPENSE_APPROVED")))
      .orderBy(asc(settlementItems.receiptDate), asc(settlementItems.createdAt)),
  ]);

  const disbursed = advances.filter((advance) => (DISBURSED_STATUSES as readonly string[]).includes(advance.status));
  const expense = receipts.reduce((sum, receipt) => sum + receipt.amount, 0);
  const contractValue = project.contractValue;
  const profit = contractValue === null ? null : contractValue - expense;

  const categories = new Map<string, ReportRow>();
  for (const receipt of receipts) {
    const row = categories.get(receipt.category) ?? { name: receipt.category, count: 0, amount: 0 };
    row.count += 1;
    row.amount += receipt.amount;
    categories.set(receipt.category, row);
  }

  const employees = new Map<string, ReportEmployee>();
  const employeeOf = (id: string, name: string) => {
    const row = employees.get(id) ?? { name, advances: 0, disbursed: 0, expense: 0 };
    employees.set(id, row);
    return row;
  };
  for (const advance of disbursed) {
    const row = employeeOf(advance.recipientId, advance.recipientName);
    row.advances += 1;
    row.disbursed += advance.amount;
  }
  for (const receipt of receipts) employeeOf(receipt.recipientId, receipt.employee).expense += receipt.amount;

  return {
    project: { ...project, status: project.status as ProjectStatus },
    summary: {
      contractValue,
      expense,
      profit,
      marginPercent: profit !== null && contractValue ? (profit / contractValue) * 100 : null,
      usedPercent: contractValue ? (expense / contractValue) * 100 : null,
      outstanding: advances
        .filter((advance) => (OUTSTANDING_STATUSES as readonly string[]).includes(advance.status))
        .reduce((sum, advance) => sum + advance.amount, 0),
      advanceCount: disbursed.length,
      disbursedTotal: disbursed.reduce((sum, advance) => sum + advance.amount, 0),
      receiptCount: receipts.length,
    },
    categories: [...categories.values()].sort((a, b) => b.amount - a.amount),
    employees: [...employees.values()].sort((a, b) => b.expense - a.expense),
    receipts: receipts.map((receipt) => ({
      date: receipt.date,
      settlementNumber: receipt.settlementNumber,
      advanceNumber: receipt.advanceNumber,
      employee: receipt.employee,
      category: receipt.category,
      description: receipt.description,
      hasReceipt: receipt.hasReceipt,
      amount: receipt.amount,
    })),
  };
}
