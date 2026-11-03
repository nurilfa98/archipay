// Server Action cuti & izin (BUSINESS-FLOW §19):
// - mengajukan & membatalkan (pengguna yang wajib absen),
// - menyetujui / menolak (Owner; Admin HR lewat delegasi, leave-rules.ts),
// - pengaturan kuota, delegasi, jenis cuti/izin, dan kuota per karyawan (Owner).

"use server";

import { and, eq, gte, inArray, lte } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { z } from "zod";
import { detectReceiptType } from "@/features/settlements/receipt-file";
import { logAudit } from "@/lib/audit";
import { verifySession, type CompanyUser } from "@/lib/auth/dal";
import { can } from "@/lib/auth/permissions";
import { zonedDateString } from "@/lib/dates";
import { db, isUniqueViolation } from "@/lib/db";
import {
  attendancePenalties,
  attendanceRecords,
  companySettings,
  leaveRequests,
  leaveTypes,
  users,
} from "@/lib/db/schema";
import { nextDocumentNumber } from "@/lib/document-number";
import { getClientIp } from "@/lib/request";
import { deleteObject, putObject } from "@/lib/storage";
import type { ActionResult } from "@/types/action-result";
import { LEAVE_ATTACHMENT_MAX_BYTES, type LeaveKind } from "./constants";
import { addDays, workDatesBetween } from "./leave-days";
import {
  notifyLeaveCancelled,
  notifyLeaveDecided,
  notifyLeaveRequested,
  type LeaveSummary,
} from "./leave-notifications";
import { getLeaveQuota, getLeaveRequest, getLeaveSettings, listHolidayDates } from "./leave-queries";
import { leaveDecisionRight } from "./leave-rules";
import {
  idSchema,
  leaveRequestSchema,
  leaveSettingsSchema,
  leaveTypeSchema,
  rejectReasonSchema,
  userQuotaSchema,
} from "./schemas";

const FORBIDDEN = { success: false, message: "Anda tidak memiliki akses." } as const;
const NOT_FOUND = { success: false, message: "Pengajuan tidak ditemukan atau sudah diproses." } as const;
const MAX_RANGE_DAYS = 90;

function fail(field: string, message: string) {
  return { success: false as const, message: "Periksa kembali isian Anda.", fieldErrors: { [field]: [message] } };
}

function invalid(error: z.ZodError) {
  return {
    success: false as const,
    message: "Periksa kembali isian Anda.",
    fieldErrors: z.flattenError(error).fieldErrors as Record<string, string[]>,
  };
}

function revalidateLeave() {
  revalidatePath("/attendance", "layout");
}

// ---------------------------------------------------------------------------
// Mengajukan
// ---------------------------------------------------------------------------

export async function createLeaveRequest(formData: FormData): Promise<ActionResult> {
  const actor = await verifySession();
  if (!can(actor, "attendance:check-in")) return FORBIDDEN;

  const parsed = leaveRequestSchema.safeParse({
    leaveTypeId: formData.get("leaveTypeId"),
    startDate: formData.get("startDate"),
    endDate: formData.get("endDate") ?? "",
    time: formData.get("time") ?? "",
    reason: formData.get("reason"),
  });
  if (!parsed.success) return invalid(parsed.error);
  const input = parsed.data;

  const [type] = await db
    .select()
    .from(leaveTypes)
    .where(
      and(
        eq(leaveTypes.id, input.leaveTypeId),
        eq(leaveTypes.companyId, actor.company.id),
        eq(leaveTypes.isActive, true),
      ),
    )
    .limit(1);
  if (!type) return fail("leaveTypeId", "Pilih jenis cuti/izin");
  const kind = type.kind as LeaveKind;

  const now = new Date();
  const today = zonedDateString(now);
  const start = input.startDate;
  const end = kind === "FULL_DAY" ? (input.endDate ?? start) : start;
  const settings = await getLeaveSettings(actor.company.id);

  // Lampiran (foto/PDF, misal surat dokter).
  const file = formData.get("attachment");
  const hasFile = file instanceof File && file.size > 0;
  if (type.attachment === "REQUIRED" && !hasFile) return fail("attachment", "Lampiran wajib untuk jenis ini");
  let attachment: { bytes: Uint8Array<ArrayBuffer>; contentType: string; extension: string } | null = null;
  if (hasFile && type.attachment !== "NONE") {
    if (file.size > LEAVE_ATTACHMENT_MAX_BYTES) return fail("attachment", "Ukuran lampiran maksimal 4 MB");
    const bytes = new Uint8Array(await file.arrayBuffer());
    const detected = detectReceiptType(bytes);
    if (!detected) return fail("attachment", "Lampiran harus foto (JPG/PNG/WebP) atau PDF");
    attachment = { bytes, ...detected };
  }

  let days = 0;
  let timeMinute: number | null = null;
  if (kind === "FULL_DAY") {
    if (end < start) return fail("endDate", "Tanggal selesai tidak boleh sebelum tanggal mulai");
    if (start.slice(0, 4) !== end.slice(0, 4))
      return fail("endDate", "Pisahkan pengajuan yang melewati pergantian tahun");
    if (end > addDays(start, MAX_RANGE_DAYS)) return fail("endDate", `Maksimal ${MAX_RANGE_DAYS} hari per pengajuan`);
    const earliest = addDays(today, -type.backdateDays);
    if (start < earliest) {
      return fail(
        "startDate",
        type.backdateDays === 0
          ? `${type.name} harus diajukan sebelum hari H`
          : `${type.name} boleh diajukan mundur paling lama ${type.backdateDays} hari`,
      );
    }
    const holidays = await listHolidayDates(actor.company.id, start, end);
    const workDates = workDatesBetween(start, end, settings.workDays, holidays);
    days = workDates.length;
    if (days === 0) return fail("endDate", "Rentang tanggal tidak berisi hari kerja");

    if (type.usesQuota) {
      const quota = await getLeaveQuota(actor.company.id, actor.id, Number(start.slice(0, 4)));
      if (days > quota.remaining) {
        return fail("endDate", `Sisa cuti tahunan Anda ${quota.remaining} hari, pengajuan ini ${days} hari kerja`);
      }
    }
    const conflict = await findConflict(actor, start, end, "FULL_DAY");
    if (conflict) return fail("startDate", conflict);
    const [attended] = await db
      .select({ workDate: attendanceRecords.workDate })
      .from(attendanceRecords)
      .where(
        and(
          eq(attendanceRecords.userId, actor.id),
          gte(attendanceRecords.workDate, start),
          lte(attendanceRecords.workDate, end),
        ),
      )
      .limit(1);
    if (attended) return fail("startDate", `Anda sudah absen pada ${attended.workDate}. Ubah tanggalnya.`);
  } else {
    if (input.time === null) return fail("time", "Isi jam");
    if (start < today) return fail("startDate", "Izin per jam harus diajukan sebelum hari H atau di hari yang sama");
    timeMinute = input.time;
    const conflict = await findConflict(actor, start, start, kind);
    if (conflict) return fail("startDate", conflict);
    const [record] = await db
      .select({ checkOutAt: attendanceRecords.checkOutAt })
      .from(attendanceRecords)
      .where(and(eq(attendanceRecords.userId, actor.id), eq(attendanceRecords.workDate, start)))
      .limit(1);
    if (kind === "LATE_ARRIVAL" && record) return fail("startDate", "Anda sudah absen masuk pada tanggal ini");
    if (kind === "EARLY_LEAVE" && record?.checkOutAt)
      return fail("startDate", "Anda sudah absen pulang pada tanggal ini");
  }

  const id = crypto.randomUUID();
  const attachmentKey = attachment ? `${actor.company.id}/leave/${id}.${attachment.extension}` : null;
  if (attachment && attachmentKey) await putObject(attachmentKey, attachment.bytes, attachment.contentType);

  const ip = await getClientIp();
  let summary: LeaveSummary;
  try {
    summary = await db.transaction(async (tx) => {
      const { number } = await nextDocumentNumber(tx, actor.company.id, "IZ", now);
      await tx.insert(leaveRequests).values({
        id,
        companyId: actor.company.id,
        number,
        userId: actor.id,
        leaveTypeId: type.id,
        kind,
        isPaid: type.isPaid,
        usesQuota: type.usesQuota,
        startDate: start,
        endDate: end,
        days,
        timeMinute,
        reason: input.reason,
        attachmentKey,
        attachmentType: attachment?.contentType ?? null,
      });
      await logAudit(
        {
          companyId: actor.company.id,
          userId: actor.id,
          action: "LEAVE_REQUESTED",
          entityName: "leave_requests",
          entityId: id,
          newValues: { number, leaveType: type.name, startDate: start, endDate: end, days, reason: input.reason },
          ipAddress: ip,
        },
        tx,
      );
      return {
        number,
        typeName: type.name,
        kind,
        startDate: start,
        endDate: end,
        days,
        timeMinute,
        reason: input.reason,
      };
    });
  } catch (error) {
    if (attachmentKey) await deleteObject(attachmentKey).catch(() => undefined);
    throw error;
  }

  const requester = await getPerson(actor.id);
  after(() => notifyLeaveRequested(actor.company.id, requester, summary));
  revalidateLeave();
  return { success: true, data: undefined };
}

// Tumpang tindih dengan pengajuan lain yang menunggu/disetujui.
async function findConflict(actor: CompanyUser, start: string, end: string, kind: LeaveKind) {
  const rows = await db
    .select({ number: leaveRequests.number, kind: leaveRequests.kind })
    .from(leaveRequests)
    .where(
      and(
        eq(leaveRequests.userId, actor.id),
        inArray(leaveRequests.status, ["PENDING", "APPROVED"]),
        lte(leaveRequests.startDate, end),
        gte(leaveRequests.endDate, start),
      ),
    );
  // Seharian bentrok dengan apa pun; per jam bentrok dengan seharian atau jenis jam yang sama.
  const clash = rows.find((row) => kind === "FULL_DAY" || row.kind === "FULL_DAY" || row.kind === kind);
  return clash ? `Bertabrakan dengan pengajuan ${clash.number}` : null;
}

async function getPerson(userId: string) {
  const [person] = await db
    .select({ id: users.id, fullName: users.fullName, phoneNumber: users.phoneNumber })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return person;
}

// ---------------------------------------------------------------------------
// Menyetujui / menolak
// ---------------------------------------------------------------------------

export async function approveLeave(requestId: string): Promise<ActionResult> {
  return decide(requestId, true, null);
}

export async function rejectLeave(requestId: string, formData: FormData): Promise<ActionResult> {
  const reason = rejectReasonSchema.safeParse(formData.get("reason"));
  if (!reason.success) return fail("reason", z.flattenError(reason.error).formErrors[0] ?? "Alasan tidak valid");
  return decide(requestId, false, reason.data);
}

async function decide(requestId: string, approve: boolean, rejectReason: string | null): Promise<ActionResult> {
  const actor = await verifySession();
  const id = idSchema.safeParse(requestId);
  if (!id.success) return NOT_FOUND;

  const settings = await getLeaveSettings(actor.company.id);
  const ip = await getClientIp();
  const now = new Date();
  const result = await db.transaction(async (tx) => {
    const [request] = await tx
      .select()
      .from(leaveRequests)
      .where(
        and(
          eq(leaveRequests.id, id.data),
          eq(leaveRequests.companyId, actor.company.id),
          eq(leaveRequests.status, "PENDING"),
        ),
      )
      .limit(1)
      .for("update");
    if (!request) return NOT_FOUND;
    const right = leaveDecisionRight(actor, request, settings, now);
    if (!right) {
      return {
        success: false as const,
        message:
          request.userId === actor.id
            ? "Pengajuan Anda sendiri diproses oleh Owner."
            : "Pengajuan ini masih menunggu Owner. Admin HR bisa memprosesnya setelah waktu delegasi lewat.",
      };
    }

    if (approve && request.kind === "FULL_DAY") {
      const [attended] = await tx
        .select({ workDate: attendanceRecords.workDate })
        .from(attendanceRecords)
        .where(
          and(
            eq(attendanceRecords.userId, request.userId),
            gte(attendanceRecords.workDate, request.startDate),
            lte(attendanceRecords.workDate, request.endDate),
          ),
        )
        .limit(1);
      if (attended) {
        return {
          success: false as const,
          message: `Karyawan sudah absen pada ${attended.workDate}. Tolak pengajuan ini atau minta karyawan membuat ulang.`,
        };
      }
    }

    await tx
      .update(leaveRequests)
      .set({
        status: approve ? "APPROVED" : "REJECTED",
        decidedById: actor.id,
        decidedAt: now,
        decidedByDelegate: right === "delegate",
        rejectReason,
      })
      .where(eq(leaveRequests.id, request.id));
    if (approve) await applyHourlyPermission(tx, request, actor.id, now);

    const [type] = await tx
      .select({ name: leaveTypes.name })
      .from(leaveTypes)
      .where(eq(leaveTypes.id, request.leaveTypeId))
      .limit(1);
    await logAudit(
      {
        companyId: actor.company.id,
        userId: actor.id,
        action: approve ? "LEAVE_APPROVED" : "LEAVE_REJECTED",
        entityName: "leave_requests",
        entityId: request.id,
        newValues: {
          number: request.number,
          leaveType: type?.name,
          delegated: right === "delegate",
          ...(rejectReason ? { rejectReason } : {}),
        },
        ipAddress: ip,
      },
      tx,
    );
    return { success: true as const, request, typeName: type?.name ?? "Cuti/izin" };
  });
  if (!result.success) return result;

  const recipient = await getPerson(result.request.userId);
  const summary = summaryOf(result.request, result.typeName);
  after(() => notifyLeaveDecided(recipient, summary, { approved: approve, reason: rejectReason }));
  revalidateLeave();
  return { success: true, data: undefined };
}

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
type RequestRow = typeof leaveRequests.$inferSelect;

// Izin per jam disetujui SETELAH karyawan terlanjur absen (§19.4):
// - datang terlambat: bila datang masih dalam jam izin + toleransi, tanda
//   terlambat dihapus dan dendanya dibebaskan otomatis;
// - pulang cepat: bila pulang mulai jam izin, tanda pulang cepat dihapus.
async function applyHourlyPermission(tx: Transaction, request: RequestRow, actorId: string, now: Date) {
  if (request.kind === "FULL_DAY" || request.timeMinute === null) return;
  const [record] = await tx
    .select()
    .from(attendanceRecords)
    .where(and(eq(attendanceRecords.userId, request.userId), eq(attendanceRecords.workDate, request.startDate)))
    .limit(1);
  if (!record) return;

  if (request.kind === "LATE_ARRIVAL" && record.lateMinutes > 0) {
    const arrivedAt = record.scheduleStartMinute + record.lateMinutes;
    if (arrivedAt <= request.timeMinute + record.toleranceMinutes) {
      await tx.update(attendanceRecords).set({ lateMinutes: 0 }).where(eq(attendanceRecords.id, record.id));
      await tx
        .update(attendancePenalties)
        .set({
          status: "WAIVED",
          waivedAt: now,
          waivedById: actorId,
          waiveNote: `Dibebaskan otomatis: izin datang terlambat ${request.number}`,
        })
        .where(and(eq(attendancePenalties.recordId, record.id), eq(attendancePenalties.status, "ACTIVE")));
    }
  }
  if (request.kind === "EARLY_LEAVE" && (record.earlyMinutes ?? 0) > 0) {
    const leftAt = record.scheduleEndMinute - (record.earlyMinutes ?? 0);
    if (leftAt >= request.timeMinute) {
      await tx.update(attendanceRecords).set({ earlyMinutes: 0 }).where(eq(attendanceRecords.id, record.id));
    }
  }
}

function summaryOf(request: RequestRow, typeName: string): LeaveSummary {
  return {
    number: request.number,
    typeName,
    kind: request.kind,
    startDate: request.startDate,
    endDate: request.endDate,
    days: request.days,
    timeMinute: request.timeMinute,
    reason: request.reason,
  };
}

// ---------------------------------------------------------------------------
// Membatalkan (pengaju)
// ---------------------------------------------------------------------------

// Menunggu → dibatalkan seluruhnya. Disetujui → hari yang belum lewat:
// `fromDate` = mulai tanggal berapa dibatalkan (kosong = dari hari ini /
// tanggal mulai). Bila semua hari dibatalkan, statusnya Dibatalkan; bila
// sebagian, tanggal selesai dimajukan & jumlah hari dihitung ulang.
export async function cancelLeave(requestId: string, fromDateInput?: string): Promise<ActionResult> {
  const actor = await verifySession();
  const id = idSchema.safeParse(requestId);
  if (!id.success) return NOT_FOUND;
  const request = await getLeaveRequest(actor.company.id, id.data);
  if (!request || request.userId !== actor.id || !["PENDING", "APPROVED"].includes(request.status)) return NOT_FOUND;

  const now = new Date();
  const today = zonedDateString(now);
  let newEnd: string | null = null; // null = batal seluruhnya
  if (request.status === "APPROVED") {
    if (request.endDate < today) return { success: false, message: "Semua tanggal pengajuan ini sudah lewat." };
    if (request.kind === "FULL_DAY") {
      const parsedFrom = z.iso.date().safeParse(fromDateInput ?? "");
      const from = parsedFrom.success ? parsedFrom.data : today;
      const firstCancelled = from < today ? today : from;
      if (firstCancelled > request.endDate) return fail("fromDate", "Tanggal di luar rentang pengajuan");
      if (firstCancelled > request.startDate) newEnd = addDays(firstCancelled, -1);
    }
  }

  let days = request.days;
  if (newEnd) {
    const settings = await getLeaveSettings(actor.company.id);
    const holidays = await listHolidayDates(actor.company.id, request.startDate, newEnd);
    days = workDatesBetween(request.startDate, newEnd, settings.workDays, holidays).length;
  }

  const ip = await getClientIp();
  const updated = await db.transaction(async (tx) => {
    const [row] = await tx
      .update(leaveRequests)
      .set(newEnd ? { endDate: newEnd, days } : { status: "CANCELLED", cancelledAt: now })
      .where(and(eq(leaveRequests.id, request.id), eq(leaveRequests.status, request.status)))
      .returning({ id: leaveRequests.id });
    if (!row) return false;
    await logAudit(
      {
        companyId: actor.company.id,
        userId: actor.id,
        action: "LEAVE_CANCELLED",
        entityName: "leave_requests",
        entityId: request.id,
        oldValues: { number: request.number, endDate: request.endDate, days: request.days },
        newValues: newEnd ? { endDate: newEnd, days } : { cancelledAll: true },
        ipAddress: ip,
      },
      tx,
    );
    return true;
  });
  if (!updated) return NOT_FOUND;

  if (request.status === "APPROVED") {
    const [type] = await db
      .select({ name: leaveTypes.name })
      .from(leaveTypes)
      .where(eq(leaveTypes.id, request.leaveTypeId))
      .limit(1);
    const requester = await getPerson(actor.id);
    const note = newEnd ? `Kini sampai ${newEnd} (${days} hari kerja).` : "Seluruh tanggal dibatalkan.";
    after(() => notifyLeaveCancelled(actor.company.id, requester, summaryOf(request, type?.name ?? "Cuti/izin"), note));
  }
  revalidateLeave();
  return { success: true, data: undefined };
}

// ---------------------------------------------------------------------------
// Pengaturan (Owner)
// ---------------------------------------------------------------------------

async function getSettingsManager() {
  const actor = await verifySession();
  return can(actor, "settings:manage") ? actor : null;
}

export async function updateLeaveSettings(
  _prevState: ActionResult | undefined,
  formData: FormData,
): Promise<ActionResult> {
  const actor = await getSettingsManager();
  if (!actor) return FORBIDDEN;
  const parsed = leaveSettingsSchema.safeParse({
    annualLeaveQuota: formData.get("annualLeaveQuota"),
    leaveDelegationEnabled: formData.get("leaveDelegationEnabled") === "on",
    leaveDelegationHours: formData.get("leaveDelegationHours"),
  });
  if (!parsed.success) return invalid(parsed.error);

  const before = await getLeaveSettings(actor.company.id);
  const changed = (Object.keys(parsed.data) as (keyof typeof parsed.data)[]).filter(
    (key) => before[key] !== parsed.data[key],
  );
  if (changed.length === 0) return { success: true, data: undefined };
  const ip = await getClientIp();
  await db.transaction(async (tx) => {
    await tx
      .update(companySettings)
      .set({ ...parsed.data, updatedById: actor.id })
      .where(eq(companySettings.companyId, actor.company.id));
    await logAudit(
      {
        companyId: actor.company.id,
        userId: actor.id,
        action: "ATTENDANCE_SETTINGS_UPDATED",
        entityName: "company_settings",
        entityId: actor.company.id,
        oldValues: Object.fromEntries(changed.map((key) => [key, before[key]])),
        newValues: Object.fromEntries(changed.map((key) => [key, parsed.data[key]])),
        ipAddress: ip,
      },
      tx,
    );
  });
  revalidatePath("/settings");
  revalidateLeave();
  return { success: true, data: undefined };
}

function readLeaveType(formData: FormData) {
  return leaveTypeSchema.safeParse({
    name: formData.get("name"),
    kind: formData.get("kind"),
    isPaid: formData.get("isPaid") === "on",
    usesQuota: formData.get("usesQuota") === "on",
    attachment: formData.get("attachment"),
    backdateDays: formData.get("backdateDays"),
  });
}

export async function saveLeaveType(typeId: string | null, formData: FormData): Promise<ActionResult> {
  const actor = await getSettingsManager();
  if (!actor) return FORBIDDEN;
  const parsed = readLeaveType(formData);
  if (!parsed.success) return invalid(parsed.error);
  // Hanya cuti seharian yang bisa memotong kuota cuti tahunan.
  const values = { ...parsed.data, usesQuota: parsed.data.kind === "FULL_DAY" && parsed.data.usesQuota };

  const ip = await getClientIp();
  try {
    const saved = await db.transaction(async (tx) => {
      let entityId = typeId;
      if (typeId) {
        const [row] = await tx
          .update(leaveTypes)
          .set(values)
          .where(and(eq(leaveTypes.id, typeId), eq(leaveTypes.companyId, actor.company.id)))
          .returning({ id: leaveTypes.id });
        if (!row) return false;
      } else {
        const [row] = await tx
          .insert(leaveTypes)
          .values({ ...values, companyId: actor.company.id, sortOrder: 100 })
          .returning({ id: leaveTypes.id });
        entityId = row.id;
      }
      await logAudit(
        {
          companyId: actor.company.id,
          userId: actor.id,
          action: typeId ? "LEAVE_TYPE_UPDATED" : "LEAVE_TYPE_CREATED",
          entityName: "leave_types",
          entityId: entityId!,
          newValues: { name: values.name, leaveKind: values.kind, isPaid: values.isPaid, usesQuota: values.usesQuota },
          ipAddress: ip,
        },
        tx,
      );
      return true;
    });
    if (!saved) return { success: false, message: "Jenis cuti/izin tidak ditemukan." };
  } catch (error) {
    if (isUniqueViolation(error)) return fail("name", "Nama jenis sudah ada");
    throw error;
  }
  revalidatePath("/settings");
  revalidateLeave();
  return { success: true, data: undefined };
}

export async function setLeaveTypeActive(typeId: string, isActive: boolean): Promise<ActionResult> {
  const actor = await getSettingsManager();
  if (!actor) return FORBIDDEN;
  const id = idSchema.safeParse(typeId);
  if (!id.success || typeof isActive !== "boolean") return { success: false, message: "Jenis tidak ditemukan." };
  const ip = await getClientIp();
  const updated = await db.transaction(async (tx) => {
    const [row] = await tx
      .update(leaveTypes)
      .set({ isActive })
      .where(and(eq(leaveTypes.id, id.data), eq(leaveTypes.companyId, actor.company.id)))
      .returning({ name: leaveTypes.name });
    if (!row) return false;
    await logAudit(
      {
        companyId: actor.company.id,
        userId: actor.id,
        action: "LEAVE_TYPE_UPDATED",
        entityName: "leave_types",
        entityId: id.data,
        newValues: { name: row.name, isActive },
        ipAddress: ip,
      },
      tx,
    );
    return true;
  });
  if (!updated) return { success: false, message: "Jenis tidak ditemukan." };
  revalidatePath("/settings");
  revalidateLeave();
  return { success: true, data: undefined };
}

export async function setUserLeaveQuota(userId: string, value: string): Promise<ActionResult> {
  const actor = await getSettingsManager();
  if (!actor) return FORBIDDEN;
  const id = idSchema.safeParse(userId);
  const quota = userQuotaSchema.safeParse(value ?? "");
  if (!id.success) return { success: false, message: "Pengguna tidak ditemukan." };
  if (!quota.success)
    return { success: false, message: z.flattenError(quota.error).formErrors[0] ?? "Kuota tidak valid" };

  const ip = await getClientIp();
  const updated = await db.transaction(async (tx) => {
    const [before] = await tx
      .select({ quota: users.annualLeaveQuota, fullName: users.fullName })
      .from(users)
      .where(and(eq(users.id, id.data), eq(users.companyId, actor.company.id)))
      .limit(1);
    if (!before) return false;
    await tx.update(users).set({ annualLeaveQuota: quota.data }).where(eq(users.id, id.data));
    await logAudit(
      {
        companyId: actor.company.id,
        userId: actor.id,
        action: "LEAVE_QUOTA_UPDATED",
        entityName: "users",
        entityId: id.data,
        oldValues: { employeeName: before.fullName, annualLeaveQuota: before.quota },
        newValues: { annualLeaveQuota: quota.data },
        ipAddress: ip,
      },
      tx,
    );
    return true;
  });
  if (!updated) return { success: false, message: "Pengguna tidak ditemukan." };
  revalidateLeave();
  return { success: true, data: undefined };
}
