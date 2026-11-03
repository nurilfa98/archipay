// Data ringkasan email harian per company (BUSINESS-FLOW §10). Dibaca cron,
// bukan halaman, jadi tidak memakai io()/permission: penerimanya ditentukan
// di features/digest/run.ts.

import "server-only";
import { and, asc, eq, gte, inArray, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "@/lib/db";
import {
  advanceLedgerEntries,
  advanceRequests,
  faceProfiles,
  leaveRequests,
  leaveTypes,
  projects,
  reminderLogs,
  settlementItems,
  settlements,
  users,
} from "@/lib/db/schema";

const recipient = alias(users, "recipient");

export type DigestAdvance = {
  id: string;
  number: string;
  recipientName: string;
  projectName: string | null;
  amount: number;
};

export type DigestSettlement = {
  id: string;
  number: string;
  recipientName: string;
  projectName: string | null;
  total: number;
  late: boolean;
};

export type DigestOverdue = {
  kind: "SETTLEMENT_OVERDUE" | "RETURN_OVERDUE";
  advanceId: string;
  advanceNumber: string;
  settlementId: string | null;
  settlementNumber: string | null;
  recipientName: string;
  dueAt: Date | null;
  balance: number;
};

export type DigestData = {
  pendingApprovals: DigestAdvance[];
  pendingFaces: { fullName: string; createdAt: Date }[];
  pendingLeaves: { number: string; fullName: string; typeName: string; startDate: string; endDate: string }[];
  awaitingVerification: DigestSettlement[];
  approvedNotDisbursed: DigestAdvance[];
  newlyOverdue: DigestOverdue[];
  acknowledged: { id: string; number: string; recipientName: string }[];
};

const advanceColumns = {
  id: advanceRequests.id,
  number: advanceRequests.number,
  recipientName: recipient.fullName,
  projectName: projects.name,
  amount: advanceRequests.amount,
};

// `since` = awal jendela "kemarin" & "baru lewat batas" (24 jam terakhir).
// `attendance` = add-on Absensi aktif; tanpa add-on, foto wajah & cuti tidak ikut diringkas.
export async function getDigestData(
  companyId: string,
  since: Date,
  { attendance }: { attendance: boolean },
): Promise<DigestData> {
  const byStatus = (status: string) =>
    db
      .select(advanceColumns)
      .from(advanceRequests)
      .innerJoin(recipient, eq(advanceRequests.recipientId, recipient.id))
      .leftJoin(projects, eq(advanceRequests.projectId, projects.id))
      .where(and(eq(advanceRequests.companyId, companyId), eq(advanceRequests.status, status)))
      .orderBy(asc(advanceRequests.createdAt));

  const [pendingApprovals, approvedNotDisbursed, pendingFaces, awaiting, overdue, acknowledged, pendingLeaves] =
    await Promise.all([
      byStatus("PENDING_APPROVAL"),
      byStatus("APPROVED"),
      attendance
        ? db
            .select({ fullName: users.fullName, createdAt: faceProfiles.createdAt })
            .from(faceProfiles)
            .innerJoin(users, eq(faceProfiles.userId, users.id))
            .where(and(eq(faceProfiles.companyId, companyId), eq(faceProfiles.status, "PENDING")))
            .orderBy(asc(faceProfiles.createdAt))
        : [],
      db
        .select({
          id: settlements.id,
          number: settlements.number,
          recipientName: recipient.fullName,
          projectName: projects.name,
          lateReason: settlements.lateReason,
          total:
            sql`coalesce((select sum(${settlementItems.amount}) from ${settlementItems} where ${settlementItems.settlementId} = ${settlements.id}), 0)`.mapWith(
              Number,
            ),
        })
        .from(settlements)
        .innerJoin(advanceRequests, eq(settlements.advanceId, advanceRequests.id))
        .innerJoin(recipient, eq(advanceRequests.recipientId, recipient.id))
        .leftJoin(projects, eq(advanceRequests.projectId, projects.id))
        .where(and(eq(settlements.companyId, companyId), eq(advanceRequests.status, "SUBMITTED")))
        .orderBy(asc(settlements.submittedAt)),
      // "Baru lewat batas" = pengingat lewat batas yang dicatat cron dalam 24 jam
      // terakhir (features/reminders/run.ts), sehingga tiap kasus muncul sekali.
      db
        .select({
          kind: reminderLogs.kind,
          advanceId: advanceRequests.id,
          advanceNumber: advanceRequests.number,
          settlementId: settlements.id,
          settlementNumber: settlements.number,
          recipientName: recipient.fullName,
          settlementDueAt: advanceRequests.settlementDueAt,
          returnDueAt: settlements.returnDueAt,
          balance:
            sql`coalesce((select sum(${advanceLedgerEntries.amount}) from ${advanceLedgerEntries} where ${advanceLedgerEntries.advanceId} = ${advanceRequests.id}), 0)`.mapWith(
              Number,
            ),
        })
        .from(reminderLogs)
        .innerJoin(advanceRequests, eq(reminderLogs.advanceId, advanceRequests.id))
        .innerJoin(recipient, eq(advanceRequests.recipientId, recipient.id))
        .leftJoin(settlements, eq(settlements.advanceId, advanceRequests.id))
        .where(
          and(
            eq(advanceRequests.companyId, companyId),
            inArray(reminderLogs.kind, ["SETTLEMENT_OVERDUE", "RETURN_OVERDUE"]),
            gte(reminderLogs.createdAt, since),
          ),
        )
        .orderBy(asc(reminderLogs.createdAt)),
      db
        .select({ id: advanceRequests.id, number: advanceRequests.number, recipientName: recipient.fullName })
        .from(advanceRequests)
        .innerJoin(recipient, eq(advanceRequests.recipientId, recipient.id))
        .where(and(eq(advanceRequests.companyId, companyId), gte(advanceRequests.acknowledgedAt, since)))
        .orderBy(asc(advanceRequests.acknowledgedAt)),
      attendance
        ? db
            .select({
              number: leaveRequests.number,
              fullName: users.fullName,
              typeName: leaveTypes.name,
              startDate: leaveRequests.startDate,
              endDate: leaveRequests.endDate,
            })
            .from(leaveRequests)
            .innerJoin(users, eq(leaveRequests.userId, users.id))
            .innerJoin(leaveTypes, eq(leaveRequests.leaveTypeId, leaveTypes.id))
            .where(and(eq(leaveRequests.companyId, companyId), eq(leaveRequests.status, "PENDING")))
            .orderBy(asc(leaveRequests.createdAt))
        : [],
    ]);

  return {
    pendingApprovals: pendingApprovals.map(withNumber),
    approvedNotDisbursed: approvedNotDisbursed.map(withNumber),
    pendingFaces,
    pendingLeaves,
    awaitingVerification: awaiting.map((row) => ({
      id: row.id,
      number: row.number ?? "-",
      recipientName: row.recipientName,
      projectName: row.projectName,
      total: row.total,
      late: !!row.lateReason,
    })),
    newlyOverdue: overdue.map((row) => ({
      kind: row.kind as DigestOverdue["kind"],
      advanceId: row.advanceId,
      advanceNumber: row.advanceNumber ?? "-",
      settlementId: row.settlementId,
      settlementNumber: row.settlementNumber,
      recipientName: row.recipientName,
      dueAt: row.kind === "SETTLEMENT_OVERDUE" ? row.settlementDueAt : row.returnDueAt,
      balance: row.balance,
    })),
    acknowledged: acknowledged.map((row) => ({ ...row, number: row.number ?? "-" })),
  };
}

function withNumber<T extends { number: string | null }>(row: T) {
  return { ...row, number: row.number ?? "-" };
}
