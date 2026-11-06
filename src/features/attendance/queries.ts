// Query fitur absensi (BUSINESS-FLOW §18). Pemanggil WAJIB sudah mengecek
// permission (requirePermission) dan mengirim company yang sedang dibuka.
// Setiap fungsi diawali `await io()` (lihat penjelasan di features/users/queries.ts).

import "server-only";
import { and, asc, desc, eq, gte, inArray, lt, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { io } from "next/cache";
import { can } from "@/lib/auth/permissions";
import { isRole, type Role } from "@/lib/auth/roles";
import { notSuperadmin } from "@/lib/auth/superadmin";
import { db } from "@/lib/db";
import {
  attendanceConsents,
  attendanceRecords,
  attendanceHolidays,
  attendanceLocations,
  companySettings,
  faceProfiles,
  projects,
  roles,
  userRoles,
  users,
} from "@/lib/db/schema";
import type { AttendanceTimezone, FaceStatus } from "./constants";

// ---------------------------------------------------------------------------
// Pengaturan & hari libur
// ---------------------------------------------------------------------------

export type AttendanceSettings = {
  workStartMinute: number;
  workEndMinute: number;
  lateToleranceMinutes: number;
  latePenaltyAmount: number;
  workDays: number;
};

export async function getAttendanceSettings(companyId: string): Promise<AttendanceSettings> {
  await io();
  const [row] = await db
    .select({
      workStartMinute: companySettings.workStartMinute,
      workEndMinute: companySettings.workEndMinute,
      lateToleranceMinutes: companySettings.lateToleranceMinutes,
      latePenaltyAmount: companySettings.latePenaltyAmount,
      workDays: companySettings.workDays,
    })
    .from(companySettings)
    .where(eq(companySettings.companyId, companyId))
    .limit(1);
  // Baris dibuat bersama company-nya (lihat features/settings/queries.ts).
  if (!row) throw new Error(`Baris company_settings untuk perusahaan ${companyId} tidak ditemukan.`);
  return row;
}

export type Holiday = { id: string; date: string; name: string };

// Hari libur satu tahun kalender, urut tanggal.
export async function listHolidays(companyId: string, year: number): Promise<Holiday[]> {
  await io();
  return db
    .select({
      id: attendanceHolidays.id,
      date: attendanceHolidays.date,
      name: attendanceHolidays.name,
    })
    .from(attendanceHolidays)
    .where(
      and(
        eq(attendanceHolidays.companyId, companyId),
        gte(attendanceHolidays.date, `${year}-01-01`),
        lt(attendanceHolidays.date, `${year + 1}-01-01`),
      ),
    )
    .orderBy(asc(attendanceHolidays.date));
}

// ---------------------------------------------------------------------------
// Lokasi
// ---------------------------------------------------------------------------

export type AttendanceLocation = {
  id: string;
  name: string;
  projectId: string | null;
  projectName: string | null;
  latitude: number;
  longitude: number;
  radiusMeters: number;
  timezone: AttendanceTimezone;
  workStartMinute: number | null;
  workEndMinute: number | null;
  isActive: boolean;
};

const locationColumns = {
  id: attendanceLocations.id,
  name: attendanceLocations.name,
  projectId: attendanceLocations.projectId,
  projectName: projects.name,
  latitude: attendanceLocations.latitude,
  longitude: attendanceLocations.longitude,
  radiusMeters: attendanceLocations.radiusMeters,
  timezone: attendanceLocations.timezone,
  workStartMinute: attendanceLocations.workStartMinute,
  workEndMinute: attendanceLocations.workEndMinute,
  isActive: attendanceLocations.isActive,
};

// Semua lokasi (aktif dulu, lalu nama).
export async function listLocations(companyId: string): Promise<AttendanceLocation[]> {
  await io();
  const rows = await db
    .select(locationColumns)
    .from(attendanceLocations)
    .leftJoin(projects, eq(attendanceLocations.projectId, projects.id))
    .where(eq(attendanceLocations.companyId, companyId))
    .orderBy(desc(attendanceLocations.isActive), asc(attendanceLocations.name));
  return rows.map((row) => ({
    ...row,
    timezone: row.timezone as AttendanceTimezone,
  }));
}

export async function getLocation(companyId: string, locationId: string): Promise<AttendanceLocation | null> {
  await io();
  const [row] = await db
    .select(locationColumns)
    .from(attendanceLocations)
    .leftJoin(projects, eq(attendanceLocations.projectId, projects.id))
    .where(and(eq(attendanceLocations.id, locationId), eq(attendanceLocations.companyId, companyId)))
    .limit(1);
  return row ? { ...row, timezone: row.timezone as AttendanceTimezone } : null;
}

export type ProjectOption = { id: string; name: string; isActive: boolean };

// Pilihan project untuk ditautkan ke lokasi (aktif dulu).
export async function listProjectOptions(companyId: string): Promise<ProjectOption[]> {
  await io();
  const rows = await db
    .select({ id: projects.id, name: projects.name, status: projects.status })
    .from(projects)
    .where(eq(projects.companyId, companyId))
    .orderBy(asc(projects.name));
  return rows
    .map((row) => ({
      id: row.id,
      name: row.name,
      isActive: row.status === "ACTIVE",
    }))
    .sort((a, b) => Number(b.isActive) - Number(a.isActive));
}

// ---------------------------------------------------------------------------
// Persetujuan data & foto acuan wajah
// ---------------------------------------------------------------------------

export async function hasConsent(userId: string) {
  await io();
  const [row] = await db
    .select({ userId: attendanceConsents.userId })
    .from(attendanceConsents)
    .where(eq(attendanceConsents.userId, userId))
    .limit(1);
  return !!row;
}

export type FaceProfileSummary = {
  id: string;
  status: FaceStatus;
  rejectCode: string | null;
  rejectReason: string | null;
  hasPhoto: boolean; // file foto masih ada (bisa dipratinjau)
  createdAt: Date;
  reviewedAt: Date | null;
};

// Foto acuan milik user: yang disetujui (dipakai absen) dan pengajuan
// terbarunya (menunggu / ditolak terakhir), bila ada.
export async function getMyFaceProfiles(
  companyId: string,
  userId: string,
): Promise<{
  approved: FaceProfileSummary | null;
  latest: FaceProfileSummary | null;
}> {
  await io();
  const rows = await db
    .select({
      id: faceProfiles.id,
      status: faceProfiles.status,
      rejectCode: faceProfiles.rejectCode,
      rejectReason: faceProfiles.rejectReason,
      hasPhoto: sql<boolean>`${faceProfiles.photoKey} is not null`,
      createdAt: faceProfiles.createdAt,
      reviewedAt: faceProfiles.reviewedAt,
    })
    .from(faceProfiles)
    .where(and(eq(faceProfiles.companyId, companyId), eq(faceProfiles.userId, userId)))
    .orderBy(desc(faceProfiles.createdAt));
  const typed = rows.map((row) => ({
    ...row,
    status: row.status as FaceStatus,
  }));
  const approved = typed.find((row) => row.status === "APPROVED") ?? null;
  const latest = typed.find((row) => row.status !== "APPROVED" && row.createdAt > (approved?.createdAt ?? new Date(0)));
  return { approved, latest: latest ?? null };
}

export type FaceOverviewRow = {
  userId: string;
  fullName: string;
  email: string;
  roles: Role[];
  consented: boolean;
  approvedId: string | null;
  approvedAt: Date | null;
  pending: { id: string; createdAt: Date } | null;
  lastRejected: { reason: string | null; reviewedAt: Date | null } | null;
};

// Semua pengguna aktif yang wajib absen (Owner tidak), beserta status foto
// acuannya. Untuk halaman persetujuan foto (Owner & Admin HR).
export async function listFaceOverview(companyId: string): Promise<FaceOverviewRow[]> {
  await io();
  const people = await db
    .select({ id: users.id, fullName: users.fullName, email: users.email })
    .from(users)
    .where(and(eq(users.companyId, companyId), eq(users.isActive, true), notSuperadmin(users.id)))
    .orderBy(asc(users.fullName));
  if (people.length === 0) return [];

  const ids = people.map((person) => person.id);
  const [roleRows, profileRows, consentRows] = await Promise.all([
    db
      .select({ userId: userRoles.userId, name: roles.name })
      .from(userRoles)
      .innerJoin(roles, eq(userRoles.roleId, roles.id))
      .where(inArray(userRoles.userId, ids)),
    db
      .select({
        id: faceProfiles.id,
        userId: faceProfiles.userId,
        status: faceProfiles.status,
        rejectReason: faceProfiles.rejectReason,
        createdAt: faceProfiles.createdAt,
        reviewedAt: faceProfiles.reviewedAt,
      })
      .from(faceProfiles)
      .where(eq(faceProfiles.companyId, companyId))
      .orderBy(desc(faceProfiles.createdAt)),
    db
      .select({ userId: attendanceConsents.userId })
      .from(attendanceConsents)
      .where(eq(attendanceConsents.companyId, companyId)),
  ]);

  const consented = new Set(consentRows.map((row) => row.userId));
  return people
    .map((person) => {
      const personRoles = roleRows
        .filter((row) => row.userId === person.id)
        .map((row) => row.name)
        .filter(isRole);
      const profiles = profileRows.filter((row) => row.userId === person.id);
      const approved = profiles.find((row) => row.status === "APPROVED");
      const pending = profiles.find((row) => row.status === "PENDING");
      const rejected = profiles.find((row) => row.status === "REJECTED");
      const rejectedIsLatest = rejected && (!approved || rejected.createdAt > approved.createdAt) && !pending;
      return {
        userId: person.id,
        fullName: person.fullName,
        email: person.email,
        roles: personRoles,
        consented: consented.has(person.id),
        approvedId: approved?.id ?? null,
        approvedAt: approved?.reviewedAt ?? null,
        pending: pending ? { id: pending.id, createdAt: pending.createdAt } : null,
        lastRejected: rejectedIsLatest ? { reason: rejected.rejectReason, reviewedAt: rejected.reviewedAt } : null,
      };
    })
    .filter((row) => can({ roles: row.roles }, "attendance:check-in"));
}

export async function countPendingFaces(companyId: string) {
  await io();
  const [row] = await db
    .select({ count: sql`count(*)`.mapWith(Number) })
    .from(faceProfiles)
    .where(and(eq(faceProfiles.companyId, companyId), eq(faceProfiles.status, "PENDING")));
  return row?.count ?? 0;
}

export async function countActiveLocations(companyId: string) {
  await io();
  const [row] = await db
    .select({ count: sql`count(*)`.mapWith(Number) })
    .from(attendanceLocations)
    .where(and(eq(attendanceLocations.companyId, companyId), eq(attendanceLocations.isActive, true)));
  return row?.count ?? 0;
}

// File foto acuan untuk route /api/attendance/faces/<id>/photo.
export async function getFacePhoto(companyId: string, profileId: string) {
  await io();
  const [row] = await db
    .select({ userId: faceProfiles.userId, photoKey: faceProfiles.photoKey })
    .from(faceProfiles)
    .where(and(eq(faceProfiles.id, profileId), eq(faceProfiles.companyId, companyId)))
    .limit(1);
  return row ?? null;
}

// ---------------------------------------------------------------------------
// Absen masuk / pulang (BUSINESS-FLOW §18.5–18.8)
// ---------------------------------------------------------------------------

export type AttendanceRecordRow = typeof attendanceRecords.$inferSelect & {
  checkInLocationName: string;
  checkOutLocationName: string | null;
};

const checkOutLocation = alias(attendanceLocations, "check_out_location");

function recordQuery() {
  return db
    .select({
      record: attendanceRecords,
      checkInLocationName: attendanceLocations.name,
      checkOutLocationName: checkOutLocation.name,
    })
    .from(attendanceRecords)
    .innerJoin(attendanceLocations, eq(attendanceRecords.checkInLocationId, attendanceLocations.id))
    .leftJoin(checkOutLocation, eq(attendanceRecords.checkOutLocationId, checkOutLocation.id));
}

function toRow(row: {
  record: typeof attendanceRecords.$inferSelect;
  checkInLocationName: string;
  checkOutLocationName: string | null;
}): AttendanceRecordRow {
  return {
    ...row.record,
    checkInLocationName: row.checkInLocationName,
    checkOutLocationName: row.checkOutLocationName,
  };
}

// Absen terakhir user (untuk menentukan absen masuk atau pulang).
export async function getLatestRecord(companyId: string, userId: string): Promise<AttendanceRecordRow | null> {
  await io();
  const [row] = await recordQuery()
    .where(and(eq(attendanceRecords.companyId, companyId), eq(attendanceRecords.userId, userId)))
    .orderBy(desc(attendanceRecords.checkInAt))
    .limit(1);
  return row ? toRow(row) : null;
}

// Riwayat absen user dalam satu bulan ("2026-11"), terbaru dulu.
export async function listMyRecords(companyId: string, userId: string, period: string): Promise<AttendanceRecordRow[]> {
  await io();
  const [year, month] = period.split("-").map(Number);
  const next = month === 12 ? `${year + 1}-01-01` : `${year}-${String(month + 1).padStart(2, "0")}-01`;
  const rows = await recordQuery()
    .where(
      and(
        eq(attendanceRecords.companyId, companyId),
        eq(attendanceRecords.userId, userId),
        gte(attendanceRecords.workDate, `${period}-01`),
        lt(attendanceRecords.workDate, next),
      ),
    )
    .orderBy(desc(attendanceRecords.workDate));
  return rows.map(toRow);
}

// Semua absen company pada satu tanggal kerja (halaman Absensi hari ini).
export async function listRecordsOnDate(companyId: string, workDate: string): Promise<AttendanceRecordRow[]> {
  await io();
  const rows = await recordQuery()
    .where(and(eq(attendanceRecords.companyId, companyId), eq(attendanceRecords.workDate, workDate)))
    .orderBy(asc(attendanceRecords.checkInAt));
  return rows.map(toRow);
}

// Pengguna aktif yang wajib absen (Owner tidak), untuk daftar "belum absen".
export async function listCheckInPeople(
  companyId: string,
): Promise<{ id: string; fullName: string; email: string }[]> {
  await io();
  const people = await db
    .select({ id: users.id, fullName: users.fullName, email: users.email, role: roles.name })
    .from(users)
    .innerJoin(userRoles, eq(userRoles.userId, users.id))
    .innerJoin(roles, eq(userRoles.roleId, roles.id))
    .where(and(eq(users.companyId, companyId), eq(users.isActive, true)))
    .orderBy(asc(users.fullName));
  const byUser = new Map<string, { fullName: string; email: string; roles: Role[] }>();
  for (const person of people) {
    const entry = byUser.get(person.id) ?? { fullName: person.fullName, email: person.email, roles: [] };
    if (isRole(person.role)) entry.roles.push(person.role);
    byUser.set(person.id, entry);
  }
  return [...byUser]
    .filter(([, person]) => can({ roles: person.roles }, "attendance:check-in"))
    .map(([id, person]) => ({ id, fullName: person.fullName, email: person.email }));
}

// id foto acuan yang DISETUJUI per pengguna (userId → id foto), untuk avatar di
// daftar absensi. Pengguna tanpa foto tersetuju tidak ada di hasil.
export async function listApprovedFaceIds(companyId: string): Promise<Map<string, string>> {
  await io();
  const rows = await db
    .select({ id: faceProfiles.id, userId: faceProfiles.userId })
    .from(faceProfiles)
    .where(and(eq(faceProfiles.companyId, companyId), eq(faceProfiles.status, "APPROVED")));
  return new Map(rows.map((row) => [row.userId, row.id]));
}

export async function isHoliday(companyId: string, date: string) {
  await io();
  const [row] = await db
    .select({ id: attendanceHolidays.id })
    .from(attendanceHolidays)
    .where(and(eq(attendanceHolidays.companyId, companyId), eq(attendanceHolidays.date, date)))
    .limit(1);
  return !!row;
}

export async function getApprovedFace(companyId: string, userId: string) {
  await io();
  const [row] = await db
    .select({ embedding: faceProfiles.embedding, modelVersion: faceProfiles.modelVersion })
    .from(faceProfiles)
    .where(
      and(eq(faceProfiles.companyId, companyId), eq(faceProfiles.userId, userId), eq(faceProfiles.status, "APPROVED")),
    )
    .limit(1);
  return row ?? null;
}

// Semua absen company dalam satu bulan ("2026-11"), untuk review bulanan.
export async function listMonthRecords(companyId: string, period: string): Promise<AttendanceRecordRow[]> {
  await io();
  const [year, month] = period.split("-").map(Number);
  const next = month === 12 ? `${year + 1}-01-01` : `${year}-${String(month + 1).padStart(2, "0")}-01`;
  const rows = await recordQuery()
    .where(
      and(
        eq(attendanceRecords.companyId, companyId),
        gte(attendanceRecords.workDate, `${period}-01`),
        lt(attendanceRecords.workDate, next),
      ),
    )
    .orderBy(asc(attendanceRecords.workDate));
  return rows.map(toRow);
}
