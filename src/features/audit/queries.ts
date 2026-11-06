// Query halaman Audit Log (khusus OWNER). Hanya catatan company yang sedang dibuka.
//
// Setiap baris audit_logs menunjuk data yang terdampak lewat
// entity_name + entity_id. Query ini menyambungkannya ke tabel aslinya agar
// halaman bisa menampilkan "UM-2026-10-0001", "Budi", atau nama project, bukan UUID.
// Laporan yang belum pernah dikirim belum bernomor PJ: tampil sebagai
// "Draf UM-2026-10-0001".

import "server-only";
import { and, asc, desc, eq, gte, inArray, lt, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { io } from "next/cache";
import { notSuperadmin } from "@/lib/auth/superadmin";
import { db } from "@/lib/db";
import {
  advanceRequests,
  attendanceHolidays,
  attendanceLocations,
  attendancePenalties,
  attendanceRecords,
  auditLogs,
  expenseCategories,
  faceProfiles,
  leaveRequests,
  leaveTypes,
  payrollRuns,
  projects,
  settlements,
  users,
} from "@/lib/db/schema";
import { env } from "@/lib/env";
import { AUDIT_PAGE_LIMIT, auditActionsOf } from "./constants";
import type { AuditFilters } from "./schemas";

const tz = env.APP_TIMEZONE;
const actor = alias(users, "actor");
const targetUser = alias(users, "target_user");
const settlementAdvance = alias(advanceRequests, "settlement_advance");
// Pemilik foto wajah (face_profiles) dan pemberi persetujuan data (attendance_consents).
const faceOwner = alias(users, "face_owner");
const consentUser = alias(users, "consent_user");
// Pemilik absen / denda / pengajuan cuti.
const recordUser = alias(users, "record_user");
const penaltyUser = alias(users, "penalty_user");
const leaveUser = alias(users, "leave_user");

export type AuditLogRow = {
  id: string;
  action: string;
  createdAt: Date;
  ipAddress: string | null;
  actorId: string | null;
  actorName: string | null;
  actorEmail: string | null;
  entityName: string;
  entityId: string;
  entityLabel: string | null;
  // Keterangan tambahan sesuai jenis data: tanggal (absen, hari libur), periode
  // "2026-11" (denda, penggajian), atau nama karyawan (cuti/izin).
  entityExtra: string | null;
  oldValues: Record<string, unknown> | null;
  newValues: Record<string, unknown> | null;
};

// Awal tahun/bulan menurut zona waktu perusahaan, sebagai timestamptz.
function zonedStart(year: number, month: number, offset: SQL) {
  return sql`((make_timestamp(${year}, ${month}, 1, 0, 0, 0) + ${offset}) at time zone ${tz})`;
}

export async function listAuditLogs(companyId: string, filter: AuditFilters): Promise<AuditLogRow[]> {
  await io();
  const period = filter.year
    ? filter.month
      ? and(
          gte(auditLogs.createdAt, zonedStart(filter.year, filter.month, sql`interval '0'`)),
          lt(auditLogs.createdAt, zonedStart(filter.year, filter.month, sql`interval '1 month'`)),
        )
      : and(
          gte(auditLogs.createdAt, zonedStart(filter.year, 1, sql`interval '0'`)),
          lt(auditLogs.createdAt, zonedStart(filter.year, 1, sql`interval '1 year'`)),
        )
    : undefined;

  const rows = await db
    .select({
      id: auditLogs.id,
      action: auditLogs.action,
      createdAt: auditLogs.createdAt,
      ipAddress: auditLogs.ipAddress,
      actorId: auditLogs.userId,
      actorName: actor.fullName,
      actorEmail: actor.email,
      entityName: auditLogs.entityName,
      entityId: auditLogs.entityId,
      entityLabel: sql<string | null>`coalesce(
        ${advanceRequests.number},
        ${settlements.number},
        'Draf ' || ${settlementAdvance.number},
        ${targetUser.fullName},
        ${expenseCategories.name},
        ${projects.name},
        ${leaveTypes.name},
        ${faceOwner.fullName},
        ${consentUser.fullName},
        ${recordUser.fullName},
        ${penaltyUser.fullName},
        ${leaveRequests.number},
        ${attendanceLocations.name},
        ${attendanceHolidays.name}
      )`,
      entityExtra: sql<string | null>`coalesce(
        ${attendanceRecords.workDate}::text,
        ${attendancePenalties.period},
        ${leaveUser.fullName},
        ${attendanceHolidays.date}::text,
        ${payrollRuns.period}
      )`,
      oldValues: auditLogs.oldValues,
      newValues: auditLogs.newValues,
    })
    .from(auditLogs)
    .leftJoin(actor, eq(auditLogs.userId, actor.id))
    .leftJoin(
      advanceRequests,
      and(eq(auditLogs.entityName, "advance_requests"), eq(advanceRequests.id, auditLogs.entityId)),
    )
    .leftJoin(settlements, and(eq(auditLogs.entityName, "settlements"), eq(settlements.id, auditLogs.entityId)))
    .leftJoin(settlementAdvance, eq(settlements.advanceId, settlementAdvance.id))
    .leftJoin(targetUser, and(eq(auditLogs.entityName, "users"), eq(targetUser.id, auditLogs.entityId)))
    .leftJoin(
      expenseCategories,
      and(eq(auditLogs.entityName, "expense_categories"), eq(expenseCategories.id, auditLogs.entityId)),
    )
    .leftJoin(projects, and(eq(auditLogs.entityName, "projects"), eq(projects.id, auditLogs.entityId)))
    .leftJoin(leaveTypes, and(eq(auditLogs.entityName, "leave_types"), eq(leaveTypes.id, auditLogs.entityId)))
    .leftJoin(faceProfiles, and(eq(auditLogs.entityName, "face_profiles"), eq(faceProfiles.id, auditLogs.entityId)))
    .leftJoin(faceOwner, eq(faceProfiles.userId, faceOwner.id))
    .leftJoin(consentUser, and(eq(auditLogs.entityName, "attendance_consents"), eq(consentUser.id, auditLogs.entityId)))
    .leftJoin(
      attendanceRecords,
      and(eq(auditLogs.entityName, "attendance_records"), eq(attendanceRecords.id, auditLogs.entityId)),
    )
    .leftJoin(recordUser, eq(attendanceRecords.userId, recordUser.id))
    .leftJoin(
      attendancePenalties,
      and(eq(auditLogs.entityName, "attendance_penalties"), eq(attendancePenalties.id, auditLogs.entityId)),
    )
    .leftJoin(penaltyUser, eq(attendancePenalties.userId, penaltyUser.id))
    .leftJoin(leaveRequests, and(eq(auditLogs.entityName, "leave_requests"), eq(leaveRequests.id, auditLogs.entityId)))
    .leftJoin(leaveUser, eq(leaveRequests.userId, leaveUser.id))
    .leftJoin(
      attendanceLocations,
      and(eq(auditLogs.entityName, "attendance_locations"), eq(attendanceLocations.id, auditLogs.entityId)),
    )
    .leftJoin(
      attendanceHolidays,
      and(eq(auditLogs.entityName, "attendance_holidays"), eq(attendanceHolidays.id, auditLogs.entityId)),
    )
    .leftJoin(payrollRuns, and(eq(auditLogs.entityName, "payroll_runs"), eq(payrollRuns.id, auditLogs.entityId)))
    .where(
      and(
        eq(auditLogs.companyId, companyId),
        period,
        filter.category ? inArray(auditLogs.action, auditActionsOf(filter.category)) : undefined,
        filter.actorId ? eq(auditLogs.userId, filter.actorId) : undefined,
      ),
    )
    .orderBy(desc(auditLogs.createdAt))
    .limit(AUDIT_PAGE_LIMIT);

  return rows.map((row) => ({
    ...row,
    oldValues: asRecord(row.oldValues),
    newValues: asRecord(row.newValues),
  }));
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

// Rentang tahun yang punya catatan, untuk pilihan filter. Memakai min/max
// (dibantu index created_at) agar tidak memindai seluruh tabel.
export async function listAuditYears(companyId: string): Promise<number[]> {
  await io();
  const [row] = await db
    .select({
      first: sql<number | null>`extract(year from min(${auditLogs.createdAt}) at time zone ${tz})::int`,
      last: sql<number | null>`extract(year from max(${auditLogs.createdAt}) at time zone ${tz})::int`,
    })
    .from(auditLogs)
    .where(eq(auditLogs.companyId, companyId));
  if (!row?.first || !row.last) return [];
  return Array.from({ length: row.last - row.first + 1 }, (_, index) => row.last! - index);
}

// Semua pengguna company ini (termasuk nonaktif, tanpa superadmin) untuk filter "Pelaku".
export async function listAuditActors(companyId: string): Promise<{ id: string; fullName: string }[]> {
  await io();
  return db
    .select({ id: users.id, fullName: users.fullName })
    .from(users)
    .where(and(eq(users.companyId, companyId), notSuperadmin(users.id)))
    .orderBy(asc(users.fullName));
}
