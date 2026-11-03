// Query review bulanan & denda keterlambatan (BUSINESS-FLOW §18.9–18.10).
// Pemanggil WAJIB sudah mengecek permission dan mengirim company yang dibuka.

import "server-only";
import { and, asc, desc, eq, gte, inArray, isNull, lte, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { io } from "next/cache";
import { db } from "@/lib/db";
import {
  attendancePenalties,
  attendancePeriods,
  attendanceRecords,
  leaveRequests,
  leaveTypes,
  users,
} from "@/lib/db/schema";
import { env } from "@/lib/env";
import { listCheckInPeople } from "./queries";
import { monthDates, type ReviewLeave, type ReviewPerson } from "./review";

function monthRange(period: string) {
  const dates = monthDates(period);
  return { start: dates[0], end: dates[dates.length - 1] };
}

export async function getPeriodLock(companyId: string, period: string) {
  await io();
  const lockedBy = alias(users, "locked_by");
  const [row] = await db
    .select({ lockedAt: attendancePeriods.lockedAt, lockedByName: lockedBy.fullName })
    .from(attendancePeriods)
    .leftJoin(lockedBy, eq(attendancePeriods.lockedById, lockedBy.id))
    .where(and(eq(attendancePeriods.companyId, companyId), eq(attendancePeriods.period, period)))
    .limit(1);
  return row ?? null;
}

// Karyawan yang direkap: yang wajib absen sekarang, ditambah siapa pun yang
// punya absen/denda di bulan itu (misal sudah dinonaktifkan). startDate =
// tanggal akun dibuat (zona waktu perusahaan): sebelum itu tidak dihitung
// tidak hadir.
export async function listReviewPeople(companyId: string, period: string): Promise<ReviewPerson[]> {
  await io();
  const { start, end } = monthRange(period);
  const active = await listCheckInPeople(companyId);
  const withRecords = await db
    .selectDistinct({ id: attendanceRecords.userId })
    .from(attendanceRecords)
    .where(
      and(
        eq(attendanceRecords.companyId, companyId),
        gte(attendanceRecords.workDate, start),
        lte(attendanceRecords.workDate, end),
      ),
    );
  const ids = [...new Set([...active.map((person) => person.id), ...withRecords.map((row) => row.id)])];
  if (ids.length === 0) return [];
  return db
    .select({
      id: users.id,
      fullName: users.fullName,
      startDate: sql<string>`to_char(${users.createdAt} at time zone ${env.APP_TIMEZONE}, 'YYYY-MM-DD')`,
    })
    .from(users)
    .where(and(eq(users.companyId, companyId), inArray(users.id, ids)))
    .orderBy(asc(users.fullName));
}

export async function listMonthLeaves(companyId: string, period: string): Promise<ReviewLeave[]> {
  await io();
  const { start, end } = monthRange(period);
  return db
    .select({
      userId: leaveRequests.userId,
      typeName: leaveTypes.name,
      isPaid: leaveRequests.isPaid,
      startDate: leaveRequests.startDate,
      endDate: leaveRequests.endDate,
    })
    .from(leaveRequests)
    .innerJoin(leaveTypes, eq(leaveRequests.leaveTypeId, leaveTypes.id))
    .where(
      and(
        eq(leaveRequests.companyId, companyId),
        eq(leaveRequests.status, "APPROVED"),
        eq(leaveRequests.kind, "FULL_DAY"),
        lte(leaveRequests.startDate, end),
        gte(leaveRequests.endDate, start),
      ),
    );
}

export async function countPendingLeavesInPeriod(companyId: string, period: string) {
  await io();
  const { start, end } = monthRange(period);
  const [row] = await db
    .select({ count: sql`count(*)`.mapWith(Number) })
    .from(leaveRequests)
    .where(
      and(
        eq(leaveRequests.companyId, companyId),
        eq(leaveRequests.status, "PENDING"),
        lte(leaveRequests.startDate, end),
        gte(leaveRequests.endDate, start),
      ),
    );
  return row?.count ?? 0;
}

export type PenaltyRow = {
  id: string;
  recordId: string;
  userId: string;
  userName: string;
  workDate: string;
  lateMinutes: number;
  amount: number;
  status: "ACTIVE" | "WAIVED";
  waiveNote: string | null;
  deductedAt: Date | null;
  payrollPeriod: string | null;
};

export async function listMonthPenalties(companyId: string, period: string, userId?: string): Promise<PenaltyRow[]> {
  await io();
  const rows = await db
    .select({
      id: attendancePenalties.id,
      recordId: attendancePenalties.recordId,
      userId: attendancePenalties.userId,
      userName: users.fullName,
      workDate: attendanceRecords.workDate,
      lateMinutes: attendanceRecords.lateMinutes,
      amount: attendancePenalties.amount,
      status: attendancePenalties.status,
      waiveNote: attendancePenalties.waiveNote,
      deductedAt: attendancePenalties.deductedAt,
      payrollPeriod: attendancePenalties.payrollPeriod,
    })
    .from(attendancePenalties)
    .innerJoin(attendanceRecords, eq(attendancePenalties.recordId, attendanceRecords.id))
    .innerJoin(users, eq(attendancePenalties.userId, users.id))
    .where(
      and(
        eq(attendancePenalties.companyId, companyId),
        eq(attendancePenalties.period, period),
        userId ? eq(attendancePenalties.userId, userId) : undefined,
      ),
    )
    .orderBy(asc(users.fullName), asc(attendanceRecords.workDate));
  return rows.map((row) => ({ ...row, status: row.status as PenaltyRow["status"] }));
}

// ---------------------------------------------------------------------------
// Potong Gaji: denda keterlambatan (§18.10)
// ---------------------------------------------------------------------------

export type PenaltyGroup = {
  userId: string;
  userName: string;
  period: string; // bulan absen
  count: number;
  total: number;
};

// Denda yang masih berlaku dari periode yang SUDAH dikunci dan belum
// ditandai dipotong, dikelompokkan per karyawan per bulan.
export async function listPenaltyCandidates(companyId: string): Promise<PenaltyGroup[]> {
  await io();
  return db
    .select({
      userId: attendancePenalties.userId,
      userName: users.fullName,
      period: attendancePenalties.period,
      count: sql`count(*)`.mapWith(Number),
      total: sql`sum(${attendancePenalties.amount})`.mapWith(Number),
    })
    .from(attendancePenalties)
    .innerJoin(users, eq(attendancePenalties.userId, users.id))
    .innerJoin(
      attendancePeriods,
      and(
        eq(attendancePeriods.companyId, attendancePenalties.companyId),
        eq(attendancePeriods.period, attendancePenalties.period),
      ),
    )
    .where(
      and(
        eq(attendancePenalties.companyId, companyId),
        eq(attendancePenalties.status, "ACTIVE"),
        isNull(attendancePenalties.deductedAt),
      ),
    )
    .groupBy(attendancePenalties.userId, users.fullName, attendancePenalties.period)
    .orderBy(asc(attendancePenalties.period), asc(users.fullName));
}

export type PenaltyDeductionRow = PenaltyGroup & {
  payrollPeriod: string;
  deductedAt: Date;
  deductedByName: string | null;
};

export async function listPenaltyDeductions(companyId: string): Promise<PenaltyDeductionRow[]> {
  await io();
  const deductedBy = alias(users, "deducted_by");
  const rows = await db
    .select({
      userId: attendancePenalties.userId,
      userName: users.fullName,
      period: attendancePenalties.period,
      payrollPeriod: attendancePenalties.payrollPeriod,
      deductedAt: sql<Date>`max(${attendancePenalties.deductedAt})`.mapWith((value) => new Date(value)),
      deductedByName: sql<string | null>`max(${deductedBy.fullName})`,
      count: sql`count(*)`.mapWith(Number),
      total: sql`sum(${attendancePenalties.amount})`.mapWith(Number),
    })
    .from(attendancePenalties)
    .innerJoin(users, eq(attendancePenalties.userId, users.id))
    .leftJoin(deductedBy, eq(attendancePenalties.deductedById, deductedBy.id))
    .where(and(eq(attendancePenalties.companyId, companyId), sql`${attendancePenalties.deductedAt} is not null`))
    .groupBy(attendancePenalties.userId, users.fullName, attendancePenalties.period, attendancePenalties.payrollPeriod)
    .orderBy(desc(sql`max(${attendancePenalties.deductedAt})`))
    .limit(200);
  return rows.map((row) => ({ ...row, payrollPeriod: row.payrollPeriod ?? "-" }));
}
