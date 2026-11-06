// Query database untuk pertanggungjawaban. Hasilnya DTO (hanya kolom yang
// dibutuhkan).
//
// Pemanggil WAJIB sudah memastikan user boleh melihat datanya: penerima
// dana atau pemegang advance:view-all (sama dengan aturan uang muka). Daftar
// & detail dibatasi ke company yang sedang dibuka; fungsi yang menerima id
// laporan/uang muka (nota, ledger) dipanggil SETELAH detailnya lolos cek itu.
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
  returnClaims,
  settlementItems,
  settlements,
  users,
} from "@/lib/db/schema";
import {
  toSettlementStatus,
  type ItemVerificationStatus,
  type AckStatus,
  type LedgerEntryType,
  type ReturnClaimStatus,
  type SettlementStatus,
} from "./constants";

const recipient = alias(users, "recipient");
const claimReporter = alias(users, "claim_reporter");
const claimDecider = alias(users, "claim_decider");

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
// Karyawan sudah melapor "saya sudah mengembalikan" dan laporannya belum
// diputuskan (BUSINESS-FLOW §8.1.1). Selama itu uang muka tidak dianggap
// terlambat: tanda "lewat batas", pengingat, dan Potong Gaji ikut berhenti.
export const hasPendingReturnClaim = sql`exists (select 1 from ${returnClaims} where ${returnClaims.settlementId} = ${settlements.id} and ${returnClaims.status} = 'PENDING')`;
const returnOverdue = sql<boolean>`coalesce(${advanceRequests.status} = 'RETURN_PENDING' and ${settlements.returnDueAt} < now() and not ${hasPendingReturnClaim}, false)`;

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
  pendingClaim: boolean; // karyawan sudah melapor mengembalikan, belum diputuskan
  submittedAt: Date | null;
  createdAt: Date;
};

const pendingClaim = sql<boolean>`coalesce(${hasPendingReturnClaim}, false)`;

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
  pendingClaim,
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
  companyId: string;
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
        eq(settlements.companyId, filter.companyId),
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

export async function listSettlementYears(filter: {
  companyId: string;
  recipientId?: string;
  project?: string;
}): Promise<number[]> {
  await io();
  const rows = await db
    .selectDistinct({ year: settlements.periodYear })
    .from(settlements)
    .innerJoin(advanceRequests, eq(settlements.advanceId, advanceRequests.id))
    .where(
      and(
        eq(settlements.companyId, filter.companyId),
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
  // confirm-claim: Owner/Finance mengonfirmasi laporan pengembalian karyawan
  // ack-reimburse: karyawan menjawab "sudah/belum saya terima" atas penggantian
  kind: "fill" | "revise" | "return" | "verify" | "record-return" | "confirm-claim" | "reimburse" | "ack-reimburse";
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
  claimPending: boolean; // ada laporan pengembalian karyawan yang belum diputuskan
  ackAmount: number; // penggantian yang menunggu jawaban karyawan
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
  companyId: string;
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
    claimPending: pendingClaim,
    ackAmount:
      sql`coalesce((select sum(${advanceLedgerEntries.amount}) from ${advanceLedgerEntries} where ${advanceLedgerEntries.advanceId} = ${advanceRequests.id} and ${advanceLedgerEntries.ackStatus} = 'PENDING'), 0)`.mapWith(
        Number,
      ),
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

  // Penggantian yang dibayar kantor dan menunggu jawaban karyawan ini.
  const toAck = await db
    .select(columns)
    .from(advanceRequests)
    .innerJoin(recipient, eq(advanceRequests.recipientId, recipient.id))
    .innerJoin(settlements, eq(settlements.advanceId, advanceRequests.id))
    .where(
      and(
        eq(advanceRequests.recipientId, viewer.id),
        projectCondition(viewer.project),
        sql`exists (select 1 from ${advanceLedgerEntries} where ${advanceLedgerEntries.advanceId} = ${advanceRequests.id} and ${advanceLedgerEntries.ackStatus} = 'PENDING')`,
      ),
    )
    .orderBy(asc(settlements.submittedAt));

  const toVerify = viewer.canVerify
    ? await db
        .select(columns)
        .from(advanceRequests)
        .innerJoin(recipient, eq(advanceRequests.recipientId, recipient.id))
        .innerJoin(settlements, eq(settlements.advanceId, advanceRequests.id))
        .where(
          and(
            eq(advanceRequests.companyId, viewer.companyId),
            inArray(advanceRequests.status, Object.keys(TODO_KIND_FOR_VERIFIER)),
            ne(advanceRequests.recipientId, viewer.id),
            projectCondition(viewer.project),
          ),
        )
        .orderBy(asc(settlements.submittedAt))
    : [];

  return [
    ...own
      // Sudah melapor mengembalikan: tidak ada lagi yang harus dilakukan karyawan.
      .filter((row) => !(row.status === "RETURN_PENDING" && row.claimPending))
      .map(({ status, ...row }) => ({ ...row, kind: TODO_KIND_FOR_RECIPIENT[status]! })),
    ...toAck.map((row) => ({ ...row, kind: "ack-reimburse" as const })),
    ...toVerify.map(({ status, ...row }) => ({
      ...row,
      kind: status === "RETURN_PENDING" && row.claimPending ? ("confirm-claim" as const) : TODO_KIND_FOR_VERIFIER[status]!,
    })),
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

export async function getSettlementDetail(companyId: string, id: string): Promise<SettlementDetail | null> {
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
    .where(and(eq(settlements.id, id), eq(settlements.companyId, companyId)))
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
  fileDeleted: boolean; // file nota sudah dihapus otomatis (lewat masa simpan)
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
      fileDeleted: sql<boolean>`${settlementItems.fileDeletedAt} is not null`,
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
  receivedOn: string | null; // tanggal uang diterima/dibayarkan ("2026-11-03")
  reportedAt: Date | null; // saat karyawan melapor (bila lewat laporan pengembalian)
  hasProof: boolean;
  proofIsPdf: boolean;
  proofDeleted: boolean; // file sudah dihapus otomatis (lewat masa simpan)
  // Konfirmasi karyawan atas penggantian (null = bukan penggantian / lewat slip gaji).
  ackStatus: AckStatus | null;
  ackAt: Date | null;
  ackNote: string | null;
  createdByName: string;
  createdAt: Date; // saat dicatat
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
      receivedOn: advanceLedgerEntries.receivedOn,
      reportedAt: returnClaims.createdAt,
      proofKey: advanceLedgerEntries.proofKey,
      proofContentType: advanceLedgerEntries.proofContentType,
      proofDeletedAt: advanceLedgerEntries.proofDeletedAt,
      ackStatus: advanceLedgerEntries.ackStatus,
      ackAt: advanceLedgerEntries.ackAt,
      ackNote: advanceLedgerEntries.ackNote,
      createdByName: users.fullName,
      createdAt: advanceLedgerEntries.createdAt,
    })
    .from(advanceLedgerEntries)
    .innerJoin(users, eq(advanceLedgerEntries.createdById, users.id))
    .leftJoin(returnClaims, eq(returnClaims.ledgerEntryId, advanceLedgerEntries.id))
    .where(eq(advanceLedgerEntries.advanceId, advanceId))
    .orderBy(asc(advanceLedgerEntries.createdAt));
  return rows.map(({ proofKey, proofContentType, proofDeletedAt, ...row }) => ({
    ...row,
    type: row.type as LedgerEntryType,
    ackStatus: row.ackStatus as AckStatus | null,
    hasProof: !!proofKey,
    proofIsPdf: proofContentType === "application/pdf",
    proofDeleted: !!proofDeletedAt,
  }));
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

export async function listExpenseCategories(companyId: string): Promise<ExpenseCategory[]> {
  await io();
  return db
    .select({ id: expenseCategories.id, name: expenseCategories.name })
    .from(expenseCategories)
    .where(and(eq(expenseCategories.companyId, companyId), eq(expenseCategories.isActive, true)))
    .orderBy(asc(expenseCategories.sortOrder), asc(expenseCategories.name));
}

// File nota + pemilik datanya, untuk route /api/receipts/[itemId].
export async function getReceiptFile(companyId: string, itemId: string) {
  const [row] = await db
    .select({
      fileKey: settlementItems.fileKey,
      fileContentType: settlementItems.fileContentType,
      fileDeletedAt: settlementItems.fileDeletedAt,
      recipientId: advanceRequests.recipientId,
    })
    .from(settlementItems)
    .innerJoin(settlements, eq(settlementItems.settlementId, settlements.id))
    .innerJoin(advanceRequests, eq(settlements.advanceId, advanceRequests.id))
    .where(and(eq(settlementItems.id, itemId), eq(settlementItems.companyId, companyId)))
    .limit(1);
  return row ?? null;
}

// ---------------------------------------------------------------------------
// Laporan pengembalian dari karyawan (BUSINESS-FLOW §8.1.1)
// ---------------------------------------------------------------------------

export type ReturnClaim = {
  id: string;
  reporterName: string;
  amount: number;
  method: string;
  returnedOn: string; // tanggal menurut karyawan
  note: string | null;
  hasProof: boolean;
  proofIsPdf: boolean;
  proofDeleted: boolean;
  status: ReturnClaimStatus;
  createdAt: Date; // dilaporkan
  decidedAt: Date | null;
  decidedByName: string | null;
  rejectReason: string | null;
  receivedOn: string | null; // tanggal diterima menurut pemeriksa
};

// Laporan terbaru satu pertanggungjawaban (menunggu, atau yang terakhir ditolak/
// dikonfirmasi). null = belum pernah ada laporan.
export async function getLatestReturnClaim(settlementId: string): Promise<ReturnClaim | null> {
  await io();
  const [row] = await db
    .select({
      id: returnClaims.id,
      reporterName: claimReporter.fullName,
      amount: returnClaims.amount,
      method: returnClaims.method,
      returnedOn: returnClaims.returnedOn,
      note: returnClaims.note,
      proofKey: returnClaims.proofKey,
      proofContentType: returnClaims.proofContentType,
      proofDeletedAt: returnClaims.proofDeletedAt,
      status: returnClaims.status,
      createdAt: returnClaims.createdAt,
      decidedAt: returnClaims.decidedAt,
      decidedByName: claimDecider.fullName,
      rejectReason: returnClaims.rejectReason,
      receivedOn: returnClaims.receivedOn,
    })
    .from(returnClaims)
    .innerJoin(claimReporter, eq(returnClaims.reporterId, claimReporter.id))
    .leftJoin(claimDecider, eq(returnClaims.decidedById, claimDecider.id))
    .where(eq(returnClaims.settlementId, settlementId))
    .orderBy(desc(returnClaims.createdAt))
    .limit(1);
  if (!row) return null;
  const { proofKey, proofContentType, proofDeletedAt, ...claim } = row;
  return {
    ...claim,
    status: claim.status as ReturnClaimStatus,
    hasProof: !!proofKey,
    proofIsPdf: proofContentType === "application/pdf",
    proofDeleted: !!proofDeletedAt,
  };
}

export type PendingReturnClaim = {
  id: string;
  settlementId: string;
  settlementNumber: string | null;
  recipientId: string;
  recipientName: string;
  amount: number;
  createdAt: Date;
};

// Laporan yang belum diputuskan di satu company. `overdueOnly`: hanya yang
// uang mukanya sudah lewat batas pengembalian (yang tadinya masuk Potong Gaji),
// dan `userIds`: hanya milik karyawan tertentu (penggajian).
export async function listPendingReturnClaims(
  companyId: string,
  filter: { overdueOnly?: boolean; userIds?: string[] } = {},
): Promise<PendingReturnClaim[]> {
  await io();
  if (filter.userIds && filter.userIds.length === 0) return [];
  return db
    .select({
      id: returnClaims.id,
      settlementId: returnClaims.settlementId,
      settlementNumber: settlements.number,
      recipientId: returnClaims.reporterId,
      recipientName: claimReporter.fullName,
      amount: returnClaims.amount,
      createdAt: returnClaims.createdAt,
    })
    .from(returnClaims)
    .innerJoin(settlements, eq(returnClaims.settlementId, settlements.id))
    .innerJoin(claimReporter, eq(returnClaims.reporterId, claimReporter.id))
    .where(
      and(
        eq(returnClaims.companyId, companyId),
        eq(returnClaims.status, "PENDING"),
        filter.overdueOnly ? sql`${settlements.returnDueAt} < now()` : undefined,
        filter.userIds ? inArray(returnClaims.reporterId, filter.userIds) : undefined,
      ),
    )
    .orderBy(asc(returnClaims.createdAt));
}

// File bukti + pemilik datanya, untuk route /api/ledger-proofs/[entryId] dan
// /api/return-claims/[claimId]/proof.
export async function getLedgerProof(companyId: string, entryId: string) {
  const [row] = await db
    .select({
      proofKey: advanceLedgerEntries.proofKey,
      proofContentType: advanceLedgerEntries.proofContentType,
      proofDeletedAt: advanceLedgerEntries.proofDeletedAt,
      recipientId: advanceRequests.recipientId,
    })
    .from(advanceLedgerEntries)
    .innerJoin(advanceRequests, eq(advanceLedgerEntries.advanceId, advanceRequests.id))
    .where(and(eq(advanceLedgerEntries.id, entryId), eq(advanceLedgerEntries.companyId, companyId)))
    .limit(1);
  return row ?? null;
}

export async function getClaimProof(companyId: string, claimId: string) {
  const [row] = await db
    .select({
      proofKey: returnClaims.proofKey,
      proofContentType: returnClaims.proofContentType,
      proofDeletedAt: returnClaims.proofDeletedAt,
      recipientId: returnClaims.reporterId,
    })
    .from(returnClaims)
    .where(and(eq(returnClaims.id, claimId), eq(returnClaims.companyId, companyId)))
    .limit(1);
  return row ?? null;
}

// ---------------------------------------------------------------------------
// Penggantian yang menunggu jawaban karyawan (BUSINESS-FLOW §8.1.2)
// ---------------------------------------------------------------------------

export type PendingAck = {
  entryId: string;
  settlementId: string;
  settlementNumber: string | null;
  recipientId: string;
  recipientName: string;
  amount: number;
  method: string | null;
  createdAt: Date;
};

// Penggantian yang sudah dibayar tetapi belum dijawab karyawan, satu company;
// `userIds` membatasi ke karyawan tertentu (info di halaman penggajian).
export async function listPendingAcks(companyId: string, filter: { userIds?: string[] } = {}): Promise<PendingAck[]> {
  await io();
  if (filter.userIds && filter.userIds.length === 0) return [];
  return db
    .select({
      entryId: advanceLedgerEntries.id,
      settlementId: settlements.id,
      settlementNumber: settlements.number,
      recipientId: advanceRequests.recipientId,
      recipientName: recipient.fullName,
      amount: advanceLedgerEntries.amount,
      method: advanceLedgerEntries.method,
      createdAt: advanceLedgerEntries.createdAt,
    })
    .from(advanceLedgerEntries)
    .innerJoin(advanceRequests, eq(advanceLedgerEntries.advanceId, advanceRequests.id))
    .innerJoin(settlements, eq(settlements.advanceId, advanceRequests.id))
    .innerJoin(recipient, eq(advanceRequests.recipientId, recipient.id))
    .where(
      and(
        eq(advanceLedgerEntries.companyId, companyId),
        eq(advanceLedgerEntries.ackStatus, "PENDING"),
        filter.userIds ? inArray(advanceRequests.recipientId, filter.userIds) : undefined,
      ),
    )
    .orderBy(asc(advanceLedgerEntries.createdAt));
}
