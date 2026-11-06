// Query cuti & izin (BUSINESS-FLOW §19). Pemanggil WAJIB sudah mengecek
// permission dan mengirim company yang sedang dibuka.

import "server-only";
import { and, asc, desc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { io } from "next/cache";
import { db } from "@/lib/db";
import { attendanceHolidays, companySettings, leaveRequests, leaveTypes, users } from "@/lib/db/schema";
import type { LeaveAttachment, LeaveKind, LeaveStatus } from "./constants";

export type LeaveSettings = {
  annualLeaveQuota: number;
  leaveDelegationEnabled: boolean;
  leaveDelegationHours: number;
  workDays: number;
};

export async function getLeaveSettings(companyId: string): Promise<LeaveSettings> {
  await io();
  const [row] = await db
    .select({
      annualLeaveQuota: companySettings.annualLeaveQuota,
      leaveDelegationEnabled: companySettings.leaveDelegationEnabled,
      leaveDelegationHours: companySettings.leaveDelegationHours,
      workDays: companySettings.workDays,
    })
    .from(companySettings)
    .where(eq(companySettings.companyId, companyId))
    .limit(1);
  if (!row) throw new Error(`Baris company_settings untuk perusahaan ${companyId} tidak ditemukan.`);
  return row;
}

export type LeaveType = {
  id: string;
  name: string;
  kind: LeaveKind;
  isPaid: boolean;
  usesQuota: boolean;
  attachment: LeaveAttachment;
  backdateDays: number;
  isActive: boolean;
};

export async function listLeaveTypes(companyId: string, activeOnly = false): Promise<LeaveType[]> {
  await io();
  const rows = await db
    .select({
      id: leaveTypes.id,
      name: leaveTypes.name,
      kind: leaveTypes.kind,
      isPaid: leaveTypes.isPaid,
      usesQuota: leaveTypes.usesQuota,
      attachment: leaveTypes.attachment,
      backdateDays: leaveTypes.backdateDays,
      isActive: leaveTypes.isActive,
    })
    .from(leaveTypes)
    .where(
      activeOnly
        ? and(eq(leaveTypes.companyId, companyId), eq(leaveTypes.isActive, true))
        : eq(leaveTypes.companyId, companyId),
    )
    .orderBy(asc(leaveTypes.sortOrder), asc(leaveTypes.name));
  return rows.map((row) => ({ ...row, kind: row.kind as LeaveKind, attachment: row.attachment as LeaveAttachment }));
}

export async function listHolidayDates(companyId: string, start: string, end: string) {
  await io();
  const rows = await db
    .select({ date: attendanceHolidays.date })
    .from(attendanceHolidays)
    .where(
      and(
        eq(attendanceHolidays.companyId, companyId),
        gte(attendanceHolidays.date, start),
        lte(attendanceHolidays.date, end),
      ),
    );
  return new Set(rows.map((row) => row.date));
}

export type LeaveQuota = { year: number; quota: number; used: number; pending: number; remaining: number };

// Kuota cuti tahunan satu karyawan: kuota (khusus atau company) dikurangi cuti
// yang memotong kuota, disetujui maupun masih menunggu, di tahun itu.
export async function getLeaveQuota(companyId: string, userId: string, year: number): Promise<LeaveQuota> {
  await io();
  const [[person], [settings], [usage]] = await Promise.all([
    db.select({ quota: users.annualLeaveQuota }).from(users).where(eq(users.id, userId)).limit(1),
    db
      .select({ quota: companySettings.annualLeaveQuota })
      .from(companySettings)
      .where(eq(companySettings.companyId, companyId))
      .limit(1),
    db
      .select({
        used: sql`coalesce(sum(${leaveRequests.days}) filter (where ${leaveRequests.status} = 'APPROVED'), 0)`.mapWith(
          Number,
        ),
        pending:
          sql`coalesce(sum(${leaveRequests.days}) filter (where ${leaveRequests.status} = 'PENDING'), 0)`.mapWith(
            Number,
          ),
      })
      .from(leaveRequests)
      .where(
        and(
          eq(leaveRequests.companyId, companyId),
          eq(leaveRequests.userId, userId),
          eq(leaveRequests.usesQuota, true),
          gte(leaveRequests.startDate, `${year}-01-01`),
          lte(leaveRequests.startDate, `${year}-12-31`),
        ),
      ),
  ]);
  const quota = person?.quota ?? settings?.quota ?? 0;
  const used = usage?.used ?? 0;
  const pending = usage?.pending ?? 0;
  return { year, quota, used, pending, remaining: Math.max(0, quota - used - pending) };
}

export type LeaveRequestRow = {
  id: string;
  number: string;
  userId: string;
  userName: string;
  typeName: string;
  kind: LeaveKind;
  isPaid: boolean;
  usesQuota: boolean;
  startDate: string;
  endDate: string;
  days: number;
  timeMinute: number | null;
  reason: string;
  hasAttachment: boolean;
  attachmentIsPdf: boolean;
  status: LeaveStatus;
  decidedByName: string | null;
  decidedAt: Date | null;
  decidedByDelegate: boolean;
  rejectReason: string | null;
  createdAt: Date;
};

const decider = alias(users, "decider");

function requestQuery() {
  return db
    .select({
      id: leaveRequests.id,
      number: leaveRequests.number,
      userId: leaveRequests.userId,
      userName: users.fullName,
      typeName: leaveTypes.name,
      kind: leaveRequests.kind,
      isPaid: leaveRequests.isPaid,
      usesQuota: leaveRequests.usesQuota,
      startDate: leaveRequests.startDate,
      endDate: leaveRequests.endDate,
      days: leaveRequests.days,
      timeMinute: leaveRequests.timeMinute,
      reason: leaveRequests.reason,
      attachmentKey: leaveRequests.attachmentKey,
      attachmentType: leaveRequests.attachmentType,
      status: leaveRequests.status,
      decidedByName: decider.fullName,
      decidedAt: leaveRequests.decidedAt,
      decidedByDelegate: leaveRequests.decidedByDelegate,
      rejectReason: leaveRequests.rejectReason,
      createdAt: leaveRequests.createdAt,
    })
    .from(leaveRequests)
    .innerJoin(users, eq(leaveRequests.userId, users.id))
    .innerJoin(leaveTypes, eq(leaveRequests.leaveTypeId, leaveTypes.id))
    .leftJoin(decider, eq(leaveRequests.decidedById, decider.id));
}

function toRow(row: Awaited<ReturnType<ReturnType<typeof requestQuery>["execute"]>>[number]): LeaveRequestRow {
  const { attachmentKey, attachmentType, ...rest } = row;
  return {
    ...rest,
    kind: row.kind as LeaveKind,
    status: row.status as LeaveStatus,
    hasAttachment: !!attachmentKey,
    attachmentIsPdf: attachmentType === "application/pdf",
  };
}

export async function listMyLeaves(companyId: string, userId: string, limit = 50): Promise<LeaveRequestRow[]> {
  await io();
  const rows = await requestQuery()
    .where(and(eq(leaveRequests.companyId, companyId), eq(leaveRequests.userId, userId)))
    .orderBy(desc(leaveRequests.createdAt))
    .limit(limit);
  return rows.map(toRow);
}

export async function listCompanyLeaves(
  companyId: string,
  statuses: LeaveStatus[],
  limit = 100,
): Promise<LeaveRequestRow[]> {
  await io();
  const rows = await requestQuery()
    .where(and(eq(leaveRequests.companyId, companyId), inArray(leaveRequests.status, statuses)))
    .orderBy(statuses.includes("PENDING") ? asc(leaveRequests.createdAt) : desc(leaveRequests.createdAt))
    .limit(limit);
  return rows.map(toRow);
}

export async function getLeaveRequest(companyId: string, id: string) {
  await io();
  const [row] = await db
    .select()
    .from(leaveRequests)
    .where(and(eq(leaveRequests.id, id), eq(leaveRequests.companyId, companyId)))
    .limit(1);
  return row ?? null;
}

// Cuti/izin DISETUJUI milik satu user yang menyentuh tanggal-tanggal ini
// (untuk absen masuk/pulang).
export async function listApprovedLeavesOn(companyId: string, userId: string, dates: string[]) {
  await io();
  if (dates.length === 0) return [];
  const sorted = [...dates].sort();
  return db
    .select({
      number: leaveRequests.number,
      kind: leaveRequests.kind,
      startDate: leaveRequests.startDate,
      endDate: leaveRequests.endDate,
      timeMinute: leaveRequests.timeMinute,
      typeName: leaveTypes.name,
    })
    .from(leaveRequests)
    .innerJoin(leaveTypes, eq(leaveRequests.leaveTypeId, leaveTypes.id))
    .where(
      and(
        eq(leaveRequests.companyId, companyId),
        eq(leaveRequests.userId, userId),
        eq(leaveRequests.status, "APPROVED"),
        lte(leaveRequests.startDate, sorted[sorted.length - 1]),
        gte(leaveRequests.endDate, sorted[0]),
      ),
    );
}

// Cuti/izin seharian yang disetujui pada satu tanggal (halaman Absensi hari ini).
export async function listFullDayLeavesOn(companyId: string, date: string) {
  await io();
  return db
    .select({
      userId: leaveRequests.userId,
      typeName: leaveTypes.name,
      number: leaveRequests.number,
      endDate: leaveRequests.endDate,
    })
    .from(leaveRequests)
    .innerJoin(leaveTypes, eq(leaveRequests.leaveTypeId, leaveTypes.id))
    .where(
      and(
        eq(leaveRequests.companyId, companyId),
        eq(leaveRequests.status, "APPROVED"),
        eq(leaveRequests.kind, "FULL_DAY"),
        lte(leaveRequests.startDate, date),
        gte(leaveRequests.endDate, date),
      ),
    );
}

export async function countPendingLeaves(companyId: string) {
  await io();
  const [row] = await db
    .select({ count: sql`count(*)`.mapWith(Number) })
    .from(leaveRequests)
    .where(and(eq(leaveRequests.companyId, companyId), eq(leaveRequests.status, "PENDING")));
  return row?.count ?? 0;
}

export type QuotaRow = { userId: string; fullName: string; customQuota: number | null };

export async function listQuotaPeople(companyId: string, userIds: string[]): Promise<QuotaRow[]> {
  await io();
  if (userIds.length === 0) return [];
  return db
    .select({ userId: users.id, fullName: users.fullName, customQuota: users.annualLeaveQuota })
    .from(users)
    .where(and(eq(users.companyId, companyId), inArray(users.id, userIds)))
    .orderBy(asc(users.fullName));
}
