// Query lembur (BUSINESS-FLOW §24). Pemanggil WAJIB sudah mengecek permission
// dan mengirim company yang sedang dibuka.

import "server-only";
import { and, asc, desc, eq, gte, inArray, lt, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { io } from "next/cache";
import { db } from "@/lib/db";
import { attendanceRecords, companySettings, overtimeOrders, users } from "@/lib/db/schema";
import { overtimeMinutes, type OvertimeSource, type OvertimeStatus } from "./overtime";

const decider = alias(users, "overtime_decider");
const requester = alias(users, "overtime_requester");

export type OvertimeSettings = {
  attendanceOvertimeRequired: boolean;
  overtimeDelegationEnabled: boolean;
  overtimeDelegationHours: number;
};

export async function getOvertimeSettings(companyId: string): Promise<OvertimeSettings> {
  await io();
  const [row] = await db
    .select({
      attendanceOvertimeRequired: companySettings.attendanceOvertimeRequired,
      overtimeDelegationEnabled: companySettings.overtimeDelegationEnabled,
      overtimeDelegationHours: companySettings.overtimeDelegationHours,
    })
    .from(companySettings)
    .where(eq(companySettings.companyId, companyId))
    .limit(1);
  if (!row) throw new Error(`Baris company_settings untuk perusahaan ${companyId} tidak ditemukan.`);
  return row;
}

export type OvertimeRow = {
  id: string;
  userId: string;
  userName: string;
  workDate: string;
  startMinute: number;
  endMinute: number;
  reason: string;
  source: OvertimeSource;
  status: OvertimeStatus;
  requestedById: string;
  requestedByName: string;
  decidedByName: string | null;
  decidedAt: Date | null;
  decidedByDelegate: boolean;
  rejectReason: string | null;
  declineReason: string | null;
  createdAt: Date;
  // Sudah ada absen pada tanggal itu (izin tidak bisa dibatalkan lagi).
  attended: boolean;
  // Menit lembur yang terhitung dari absen tertaut; null = belum ada absen tertaut.
  workedMinutes: number | null;
};

function orderQuery() {
  return (
    db
      .select({
        id: overtimeOrders.id,
        userId: overtimeOrders.userId,
        userName: users.fullName,
        workDate: overtimeOrders.workDate,
        startMinute: overtimeOrders.startMinute,
        endMinute: overtimeOrders.endMinute,
        reason: overtimeOrders.reason,
        source: overtimeOrders.source,
        status: overtimeOrders.status,
        requestedById: overtimeOrders.requestedById,
        requestedByName: requester.fullName,
        decidedByName: decider.fullName,
        decidedAt: overtimeOrders.decidedAt,
        decidedByDelegate: overtimeOrders.decidedByDelegate,
        rejectReason: overtimeOrders.rejectReason,
        declineReason: overtimeOrders.declineReason,
        createdAt: overtimeOrders.createdAt,
        recordId: attendanceRecords.id,
        linkedId: attendanceRecords.overtimeOrderId,
        checkInAt: attendanceRecords.checkInAt,
        checkOutAt: attendanceRecords.checkOutAt,
      })
      .from(overtimeOrders)
      .innerJoin(users, eq(overtimeOrders.userId, users.id))
      .innerJoin(requester, eq(overtimeOrders.requestedById, requester.id))
      .leftJoin(decider, eq(overtimeOrders.decidedById, decider.id))
      // Absen karyawan itu pada tanggal izin (satu per hari).
      .leftJoin(
        attendanceRecords,
        and(
          eq(attendanceRecords.userId, overtimeOrders.userId),
          eq(attendanceRecords.workDate, overtimeOrders.workDate),
        ),
      )
  );
}

function toRow(row: Awaited<ReturnType<ReturnType<typeof orderQuery>["execute"]>>[number]): OvertimeRow {
  const { recordId, linkedId, checkInAt, checkOutAt, ...rest } = row;
  const linked = recordId !== null && linkedId === row.id && checkInAt !== null;
  return {
    ...rest,
    source: row.source as OvertimeSource,
    status: row.status as OvertimeStatus,
    attended: recordId !== null,
    workedMinutes: linked
      ? overtimeMinutes({
          checkInAt: checkInAt!,
          checkOutAt,
          plannedStartMinute: row.startMinute,
          plannedEndMinute: row.endMinute,
        })
      : null,
  };
}

export async function listMyOvertime(companyId: string, userId: string, limit = 50): Promise<OvertimeRow[]> {
  await io();
  const rows = await orderQuery()
    .where(and(eq(overtimeOrders.companyId, companyId), eq(overtimeOrders.userId, userId)))
    .orderBy(desc(overtimeOrders.workDate), desc(overtimeOrders.createdAt))
    .limit(limit);
  return rows.map(toRow);
}

export async function listCompanyOvertime(
  companyId: string,
  statuses: OvertimeStatus[],
  limit = 100,
): Promise<OvertimeRow[]> {
  await io();
  const rows = await orderQuery()
    .where(and(eq(overtimeOrders.companyId, companyId), inArray(overtimeOrders.status, statuses)))
    .orderBy(
      statuses.includes("PENDING") ? asc(overtimeOrders.createdAt) : desc(overtimeOrders.workDate),
      desc(overtimeOrders.createdAt),
    )
    .limit(limit);
  return rows.map(toRow);
}

export async function countPendingOvertime(companyId: string) {
  await io();
  const [row] = await db
    .select({ count: sql`count(*)`.mapWith(Number) })
    .from(overtimeOrders)
    .where(and(eq(overtimeOrders.companyId, companyId), eq(overtimeOrders.status, "PENDING")));
  return row?.count ?? 0;
}

// Lembur milik satu karyawan yang masih berlaku (menunggu / disetujui) pada tanggal-tanggal ini,
// untuk absen di hari libur dan kartu "Absen hari ini".
export async function listMyActiveOvertimeOn(companyId: string, userId: string, dates: string[]) {
  await io();
  if (dates.length === 0) return [];
  const rows = await db
    .select({
      id: overtimeOrders.id,
      workDate: overtimeOrders.workDate,
      startMinute: overtimeOrders.startMinute,
      endMinute: overtimeOrders.endMinute,
      status: overtimeOrders.status,
    })
    .from(overtimeOrders)
    .where(
      and(
        eq(overtimeOrders.companyId, companyId),
        eq(overtimeOrders.userId, userId),
        inArray(overtimeOrders.workDate, dates),
        inArray(overtimeOrders.status, ["PENDING", "APPROVED"]),
      ),
    );
  return rows.map((row) => ({ ...row, status: row.status as OvertimeStatus }));
}

// Izin lembur DISETUJUI satu company dalam satu bulan ("2026-11"), untuk menghitung jam lembur
// dari absen (review bulanan dan penggajian). Jam rencana menjadi batas atas.
export async function listMonthOvertimeOrders(companyId: string, period: string) {
  await io();
  const [year, month] = period.split("-").map(Number);
  const next = month === 12 ? `${year + 1}-01-01` : `${year}-${String(month + 1).padStart(2, "0")}-01`;
  return db
    .select({
      id: overtimeOrders.id,
      userId: overtimeOrders.userId,
      workDate: overtimeOrders.workDate,
      startMinute: overtimeOrders.startMinute,
      endMinute: overtimeOrders.endMinute,
    })
    .from(overtimeOrders)
    .where(
      and(
        eq(overtimeOrders.companyId, companyId),
        eq(overtimeOrders.status, "APPROVED"),
        gte(overtimeOrders.workDate, `${period}-01`),
        lt(overtimeOrders.workDate, next),
      ),
    );
}

export async function getOvertimeOrder(companyId: string, id: string) {
  await io();
  const [row] = await db
    .select()
    .from(overtimeOrders)
    .where(and(eq(overtimeOrders.id, id), eq(overtimeOrders.companyId, companyId)))
    .limit(1);
  return row ?? null;
}
