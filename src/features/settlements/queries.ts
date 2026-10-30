// Query database untuk pertanggungjawaban. Hasilnya DTO (hanya kolom yang
// dibutuhkan).
//
// Pemanggil WAJIB sudah memastikan user boleh melihat datanya: penerima
// dana atau pemegang advance:view-all (sama dengan aturan uang muka).
//
// Referensi:
// - https://orm.drizzle.team/docs/joins (bagian "Aliases & Selfjoins")
// - node_modules/next/dist/docs/01-app/03-api-reference/04-functions/io.md

import "server-only";
import { and, asc, desc, eq, inArray, isNotNull, ne, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { io } from "next/cache";
import type { AdvanceStatus } from "@/features/advances/constants";
import { projectCondition } from "@/features/projects/queries";
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
import {
  toSettlementStatus,
  type ItemVerificationStatus,
  type LedgerEntryType,
  type SettlementStatus,
} from "./constants";

const recipient = alias(users, "recipient");

// Total nominal nota di satu laporan (semua nota, sebelum verifikasi).
const itemTotal = sql`coalesce((select sum(${settlementItems.amount}) from ${settlementItems} where ${settlementItems.settlementId} = ${settlements.id}), 0)`.mapWith(
  Number,
);
const itemCount = sql`(select count(*) from ${settlementItems} where ${settlementItems.settlementId} = ${settlements.id})`.mapWith(
  Number,
);
// Saldo TERKINI uang muka dari ledger (berubah lagi setelah verifikasi bila
// ada pengembalian, penggantian, atau potong gaji).
const currentBalance = sql`coalesce((select sum(${advanceLedgerEntries.amount}) from ${advanceLedgerEntries} where ${advanceLedgerEntries.advanceId} = ${advanceRequests.id}), 0)`.mapWith(
  Number,
);
const returnOverdue = sql<boolean>`coalesce(${advanceRequests.status} = 'RETURN_PENDING' and ${settlements.returnDueAt} < now(), false)`;

// ---------------------------------------------------------------------------
// Daftar laporan
// ---------------------------------------------------------------------------

export type SettlementListItem = {
  id: string;
  number: string | null; // null = draf, belum pernah dikirim
  lateReason: string | null; // alasan kalau dikirim melewati batas unggah nota
  status: SettlementStatus;
  advanceId: string;
  advanceNumber: string;
  advanceAmount: number;
  purpose: string;
  recipientId: string;
  recipientName: string;
  itemCount: number;
  itemTotal: number;
  // Saldo terkini setelah diverifikasi (null sebelum diverifikasi):
  // > 0 sisa yang belum dikembalikan, < 0 penggantian yang belum dibayar.
  balanceAmount: number | null;
  returnOverdue: boolean; // sisa belum kembali & lewat batas pengembalian
  submittedAt: Date | null;
  createdAt: Date;
};

const listColumns = {
  id: settlements.id,
  number: settlements.number,
  lateReason: settlements.lateReason,
  advanceStatus: advanceRequests.status,
  advanceId: advanceRequests.id,
  advanceNumber: advanceRequests.number,
  advanceAmount: advanceRequests.amount,
  purpose: advanceRequests.purpose,
  recipientId: advanceRequests.recipientId,
  recipientName: recipient.fullName,
  itemCount,
  itemTotal,
  verifiedAt: settlements.verifiedAt,
  currentBalance,
  returnOverdue,
  submittedAt: settlements.submittedAt,
  createdAt: settlements.createdAt,
};

function toListItem({
  advanceStatus,
  verifiedAt,
  currentBalance,
  ...row
}: { advanceStatus: string; verifiedAt: Date | null; currentBalance: number } & Omit<
  SettlementListItem,
  "status" | "balanceAmount"
>): SettlementListItem {
  return {
    ...row,
    status: toSettlementStatus(advanceStatus as AdvanceStatus),
    balanceAmount: verifiedAt ? currentBalance : null,
  };
}

// year/month → periode nomor laporan (PJ-2026-10-xxxx). Draf belum bernomor,
// jadi tidak ikut bila tahun dipilih.
export async function listSettlements(filter: {
  recipientId?: string;
  // id project, atau NO_PROJECT untuk uang muka lama tanpa project.
  project?: string;
  advanceStatuses?: readonly AdvanceStatus[];
  year?: number;
  month?: number;
  limit: number;
}): Promise<SettlementListItem[]> {
  await io();
  const rows = await db
    .select(listColumns)
    .from(settlements)
    .innerJoin(advanceRequests, eq(settlements.advanceId, advanceRequests.id))
    .innerJoin(recipient, eq(advanceRequests.recipientId, recipient.id))
    .where(
      and(
        filter.recipientId ? eq(advanceRequests.recipientId, filter.recipientId) : undefined,
        projectCondition(filter.project),
        filter.advanceStatuses ? inArray(advanceRequests.status, [...filter.advanceStatuses]) : undefined,
        filter.year ? eq(settlements.periodYear, filter.year) : undefined,
        filter.month ? eq(settlements.periodMonth, filter.month) : undefined,
      ),
    )
    .orderBy(desc(settlements.createdAt))
    .limit(filter.limit);
  return rows.map(toListItem);
}

export async function listSettlementYears(filter: { recipientId?: string; project?: string }): Promise<number[]> {
  await io();
  const rows = await db
    .selectDistinct({ year: settlements.periodYear })
    .from(settlements)
    .innerJoin(advanceRequests, eq(settlements.advanceId, advanceRequests.id))
    .where(
      and(
        isNotNull(settlements.periodYear),
        filter.recipientId ? eq(advanceRequests.recipientId, filter.recipientId) : undefined,
        projectCondition(filter.project),
      ),
    )
    .orderBy(desc(settlements.periodYear));
  return rows.map((row) => row.year!).filter(Boolean);
}

// ---------------------------------------------------------------------------
// "Perlu tindakan Anda"
// ---------------------------------------------------------------------------

export type SettlementTodo = {
  // fill/revise/return: karyawan · verify/record-return/reimburse: OWNER/FINANCE
  kind: "fill" | "revise" | "return" | "verify" | "record-return" | "reimburse";
  advanceId: string;
  advanceNumber: string;
  amount: number;
  purpose: string;
  recipientName: string;
  settlementId: string;
  settlementNumber: string | null; // null = draf, belum pernah dikirim
  settlementDueAtPassed: boolean;
  balance: number; // saldo terkini ledger
  returnOverdue: boolean;
};

const TODO_KIND_FOR_RECIPIENT: Partial<Record<string, SettlementTodo["kind"]>> = {
  ACKNOWLEDGED: "fill",
  REVISION_REQUESTED: "revise",
  RETURN_PENDING: "return",
};
const TODO_KIND_FOR_VERIFIER: Partial<Record<string, SettlementTodo["kind"]>> = {
  SUBMITTED: "verify",
  RETURN_PENDING: "record-return",
  REIMBURSE_PENDING: "reimburse",
};

// - Karyawan: isi nota, perbaiki nota, atau kembalikan sisa dana.
// - Verifikator: verifikasi laporan orang lain, catat pengembalian sisa,
//   atau bayar penggantian.
export async function listSettlementTodos(viewer: {
  id: string;
  canVerify: boolean;
  // Batasi ke satu project (id, atau NO_PROJECT). Kosong = semua project.
  project?: string;
}): Promise<SettlementTodo[]> {
  await io();
  const columns = {
    advanceId: advanceRequests.id,
    advanceNumber: advanceRequests.number,
    status: advanceRequests.status,
    amount: advanceRequests.amount,
    purpose: advanceRequests.purpose,
    recipientName: recipient.fullName,
    settlementId: settlements.id,
    settlementNumber: settlements.number,
    settlementDueAtPassed: sql<boolean>`coalesce(${advanceRequests.settlementDueAt} < now(), false)`,
    balance: currentBalance,
    returnOverdue,
  };

  const own = await db
    .select(columns)
    .from(advanceRequests)
    .innerJoin(recipient, eq(advanceRequests.recipientId, recipient.id))
    .innerJoin(settlements, eq(settlements.advanceId, advanceRequests.id))
    .where(
      and(
        eq(advanceRequests.recipientId, viewer.id),
        projectCondition(viewer.project),
        inArray(advanceRequests.status, Object.keys(TODO_KIND_FOR_RECIPIENT)),
      ),
    )
    .orderBy(asc(advanceRequests.settlementDueAt));

  const toVerify = viewer.canVerify
    ? await db
        .select(columns)
        .from(advanceRequests)
        .innerJoin(recipient, eq(advanceRequests.recipientId, recipient.id))
        .innerJoin(settlements, eq(settlements.advanceId, advanceRequests.id))
        .where(
          and(
            inArray(advanceRequests.status, Object.keys(TODO_KIND_FOR_VERIFIER)),
            ne(advanceRequests.recipientId, viewer.id),
            projectCondition(viewer.project),
          ),
        )
        .orderBy(asc(settlements.submittedAt))
    : [];

  return [
    ...own.map(({ status, ...row }) => ({ ...row, kind: TODO_KIND_FOR_RECIPIENT[status]! })),
    ...toVerify.map(({ status, ...row }) => ({ ...row, kind: TODO_KIND_FOR_VERIFIER[status]! })),
  ];
}

// ---------------------------------------------------------------------------
// Detail laporan
// ---------------------------------------------------------------------------

export type SettlementDetail = {
  id: string;
  projectId: string | null; // null = uang muka lama, belum punya project
  projectName: string | null;
  number: string | null;
  status: SettlementStatus;
  advanceStatus: AdvanceStatus;
  advanceId: string;
  advanceNumber: string;
  advanceAmount: number;
  purpose: string;
  recipientId: string;
  recipientName: string;
  disbursedById: string | null;
  disbursedAt: Date | null;
  settlementDueAt: Date | null;
  settlementDueAtPassed: boolean;
  returnDueDays: number | null;
  submittedAt: Date | null;
  // true bila dikirim (terakhir) setelah batas unggah nota.
  submittedLate: boolean;
  lateReason: string | null;
  revisionNote: string | null;
  revisionRequestedByName: string | null;
  revisionRequestedAt: Date | null;
  verifiedByName: string | null;
  verifiedAt: Date | null;
  approvedAmount: number | null;
  balanceAmount: number | null;
  returnDueAt: Date | null;
  returnOverdue: boolean;
};

export async function getSettlementDetail(id: string): Promise<SettlementDetail | null> {
  await io();
  const revisionBy = alias(users, "revision_by");
  const verifiedBy = alias(users, "verified_by");

  const [row] = await db
    .select({
      id: settlements.id,
      projectId: advanceRequests.projectId,
      projectName: projects.name,
      number: settlements.number,
      advanceStatus: advanceRequests.status,
      advanceId: advanceRequests.id,
      advanceNumber: advanceRequests.number,
      advanceAmount: advanceRequests.amount,
      purpose: advanceRequests.purpose,
      recipientId: advanceRequests.recipientId,
      recipientName: recipient.fullName,
      disbursedById: advanceRequests.disbursedById,
      disbursedAt: advanceRequests.disbursedAt,
      settlementDueAt: advanceRequests.settlementDueAt,
      settlementDueAtPassed: sql<boolean>`coalesce(${advanceRequests.settlementDueAt} < now(), false)`,
      returnDueDays: advanceRequests.returnDueDays,
      submittedAt: settlements.submittedAt,
      submittedLate: sql<boolean>`coalesce(${settlements.submittedAt} > ${advanceRequests.settlementDueAt}, false)`,
      lateReason: settlements.lateReason,
      revisionNote: settlements.revisionNote,
      revisionRequestedByName: revisionBy.fullName,
      revisionRequestedAt: settlements.revisionRequestedAt,
      verifiedByName: verifiedBy.fullName,
      verifiedAt: settlements.verifiedAt,
      approvedAmount: settlements.approvedAmount,
      balanceAmount: settlements.balanceAmount,
      returnDueAt: settlements.returnDueAt,
      returnOverdue,
    })
    .from(settlements)
    .innerJoin(advanceRequests, eq(settlements.advanceId, advanceRequests.id))
    .innerJoin(recipient, eq(advanceRequests.recipientId, recipient.id))
    .leftJoin(projects, eq(advanceRequests.projectId, projects.id))
    .leftJoin(revisionBy, eq(settlements.revisionRequestedById, revisionBy.id))
    .leftJoin(verifiedBy, eq(settlements.verifiedById, verifiedBy.id))
    .where(eq(settlements.id, id))
    .limit(1);

  if (!row) return null;
  const advanceStatus = row.advanceStatus as AdvanceStatus;
  return { ...row, advanceStatus, status: toSettlementStatus(advanceStatus) };
}

export type SettlementItem = {
  id: string;
  receiptDate: string; // "2026-10-24"
  categoryName: string;
  description: string;
  amount: number;
  hasReceipt: boolean;
  noReceiptReason: string | null;
  fileContentType: string | null;
  verificationStatus: ItemVerificationStatus;
  rejectionReason: string | null;
};

export async function listSettlementItems(settlementId: string): Promise<SettlementItem[]> {
  await io();
  const rows = await db
    .select({
      id: settlementItems.id,
      receiptDate: settlementItems.receiptDate,
      categoryName: expenseCategories.name,
      description: settlementItems.description,
      amount: settlementItems.amount,
      hasReceipt: settlementItems.hasReceipt,
      noReceiptReason: settlementItems.noReceiptReason,
      fileContentType: settlementItems.fileContentType,
      verificationStatus: settlementItems.verificationStatus,
      rejectionReason: settlementItems.rejectionReason,
    })
    .from(settlementItems)
    .innerJoin(expenseCategories, eq(settlementItems.categoryId, expenseCategories.id))
    .where(eq(settlementItems.settlementId, settlementId))
    .orderBy(asc(settlementItems.receiptDate), asc(settlementItems.createdAt));
  return rows.map((row) => ({ ...row, verificationStatus: row.verificationStatus as ItemVerificationStatus }));
}

export type LedgerEntry = {
  id: string;
  type: LedgerEntryType;
  amount: number;
  method: string | null;
  reference: string | null;
  payrollPeriod: string | null;
  note: string | null;
  createdByName: string;
  createdAt: Date;
};

export async function listLedgerEntries(advanceId: string): Promise<LedgerEntry[]> {
  await io();
  const rows = await db
    .select({
      id: advanceLedgerEntries.id,
      type: advanceLedgerEntries.type,
      amount: advanceLedgerEntries.amount,
      method: advanceLedgerEntries.method,
      reference: advanceLedgerEntries.reference,
      payrollPeriod: advanceLedgerEntries.payrollPeriod,
      note: advanceLedgerEntries.note,
      createdByName: users.fullName,
      createdAt: advanceLedgerEntries.createdAt,
    })
    .from(advanceLedgerEntries)
    .innerJoin(users, eq(advanceLedgerEntries.createdById, users.id))
    .where(eq(advanceLedgerEntries.advanceId, advanceId))
    .orderBy(asc(advanceLedgerEntries.createdAt));
  return rows.map((row) => ({ ...row, type: row.type as LedgerEntryType }));
}

// Untuk link ke laporan dari halaman detail uang muka.
export async function getSettlementRefByAdvance(
  advanceId: string,
): Promise<{ id: string; number: string | null } | null> {
  await io();
  const [row] = await db
    .select({ id: settlements.id, number: settlements.number })
    .from(settlements)
    .where(eq(settlements.advanceId, advanceId))
    .limit(1);
  return row ?? null;
}

export type ExpenseCategory = { id: string; name: string };

export async function listExpenseCategories(): Promise<ExpenseCategory[]> {
  await io();
  return db
    .select({ id: expenseCategories.id, name: expenseCategories.name })
    .from(expenseCategories)
    .where(eq(expenseCategories.isActive, true))
    .orderBy(asc(expenseCategories.sortOrder), asc(expenseCategories.name));
}

// File nota + pemilik datanya, untuk route /api/receipts/[itemId].
export async function getReceiptFile(itemId: string) {
  const [row] = await db
    .select({
      fileKey: settlementItems.fileKey,
      fileContentType: settlementItems.fileContentType,
      recipientId: advanceRequests.recipientId,
    })
    .from(settlementItems)
    .innerJoin(settlements, eq(settlementItems.settlementId, settlements.id))
    .innerJoin(advanceRequests, eq(settlements.advanceId, advanceRequests.id))
    .where(eq(settlementItems.id, itemId))
    .limit(1);
  return row ?? null;
}
