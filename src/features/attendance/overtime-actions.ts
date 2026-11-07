// Server Action lembur di hari libur (BUSINESS-FLOW §24):
// - karyawan mengajukan (perlu persetujuan) dan membatalkan,
// - Owner menyetujui/menolak; Admin HR lewat delegasi yang sama dengan cuti (leave-rules.ts),
// - Owner/Admin HR menugaskan lembur (langsung disetujui); karyawan boleh menolak
//   penugasan ("Tidak bisa hadir"),
// - izin hanya bisa dibatalkan sebelum karyawan absen di tanggal itu.
//
// Hitungan jam & upah ada di overtime.ts / salaries/overtime-math.ts; absen yang
// memakai izin ini ditautkan lewat attendance_records.overtime_order_id.

"use server";

import { and, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { z } from "zod";
import { logAudit } from "@/lib/audit";
import { verifySession } from "@/lib/auth/dal";
import { can } from "@/lib/auth/permissions";
import { zonedDateString } from "@/lib/dates";
import { db, isUniqueViolation } from "@/lib/db";
import { attendanceRecords, companySettings, overtimeOrders } from "@/lib/db/schema";
import { getClientIp } from "@/lib/request";
import type { ActionResult } from "@/types/action-result";
import { addDays, isoWeekdayOf } from "./leave-days";
import { getLeaveSettings, listApprovedLeavesOn, listHolidayDates } from "./leave-queries";
import {
  notifyOvertimeAssigned,
  notifyOvertimeCancelledByEmployee,
  notifyOvertimeCancelledByManager,
  notifyOvertimeDeclined,
  notifyOvertimeDecided,
} from "./overtime-notifications";
import { getOvertimeSettings } from "./overtime-queries";
import { overtimeDecisionRight } from "./overtime-rules";
import { anyPeriodLocked, LOCKED_MESSAGE } from "./period-lock";
import { listCheckInPeople } from "./queries";
import { isWorkDay } from "./schedule";
import {
  idSchema,
  overtimeAssignSchema,
  overtimeRequestSchema,
  overtimeSettingsSchema,
  rejectReasonSchema,
} from "./schemas";

const FORBIDDEN = { success: false, message: "Anda tidak memiliki akses." } as const;
const NOT_FOUND = { success: false, message: "Lembur tidak ditemukan atau sudah diproses." } as const;
// Batas jauh ke depan (hari) dan ke belakang (hari, hanya penugasan susulan).
const MAX_AHEAD_DAYS = 90;
const MAX_BACK_DAYS = 60;

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

function revalidateOvertime() {
  revalidatePath("/attendance", "layout");
}

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

// Aturan tanggal yang sama untuk pengajuan dan penugasan. allowPast: penugasan
// susulan oleh Owner/Admin HR untuk karyawan yang terlanjur bekerja.
async function checkDate(companyId: string, userId: string, date: string, allowPast: boolean) {
  const today = zonedDateString(new Date());
  if (date < today && !allowPast) return fail("date", "Lembur diajukan sebelum atau di hari H.");
  if (date < addDays(today, -MAX_BACK_DAYS))
    return fail("date", `Penugasan susulan maksimal ${MAX_BACK_DAYS} hari ke belakang`);
  if (date > addDays(today, MAX_AHEAD_DAYS)) return fail("date", `Maksimal ${MAX_AHEAD_DAYS} hari ke depan`);

  const [settings, holidays] = await Promise.all([
    getLeaveSettings(companyId),
    listHolidayDates(companyId, date, date),
  ]);
  if (isWorkDay(settings.workDays, isoWeekdayOf(date)) && !holidays.has(date)) {
    return fail("date", "Tanggal itu hari kerja biasa. Lembur hanya untuk hari libur.");
  }

  const leaves = await listApprovedLeavesOn(companyId, userId, [date]);
  if (leaves.some((leave) => leave.kind === "FULL_DAY")) {
    return fail("date", "Karyawan sedang cuti/izin pada tanggal itu.");
  }
  if (await anyPeriodLocked(companyId, [date.slice(0, 7)])) return { success: false as const, message: LOCKED_MESSAGE };
  return null;
}

const CLASH = "Karyawan sudah punya izin lembur pada tanggal itu.";

// Absen karyawan yang sudah ada pada tanggal izin (mis. saklar wajib izin lembur dimatikan,
// atau penugasan susulan) ditautkan ke izinnya agar jam lemburnya terhitung.
async function linkExistingRecord(tx: Transaction, order: { id: string; userId: string; workDate: string }) {
  await tx
    .update(attendanceRecords)
    .set({ overtimeOrderId: order.id })
    .where(
      and(
        eq(attendanceRecords.userId, order.userId),
        eq(attendanceRecords.workDate, order.workDate),
        isNull(attendanceRecords.overtimeOrderId),
      ),
    );
}

async function hasAttended(tx: Transaction | typeof db, userId: string, workDate: string) {
  const [record] = await tx
    .select({ id: attendanceRecords.id })
    .from(attendanceRecords)
    .where(and(eq(attendanceRecords.userId, userId), eq(attendanceRecords.workDate, workDate)))
    .limit(1);
  return !!record;
}

// ---------------------------------------------------------------------------
// Mengajukan (karyawan)
// ---------------------------------------------------------------------------

export async function requestOvertime(formData: FormData): Promise<ActionResult> {
  const actor = await verifySession();
  if (!can(actor, "attendance:check-in")) return FORBIDDEN;

  const parsed = overtimeRequestSchema.safeParse({
    date: formData.get("date"),
    start: formData.get("start") ?? "",
    end: formData.get("end") ?? "",
    reason: formData.get("reason"),
  });
  if (!parsed.success) return invalid(parsed.error);
  const input = parsed.data;

  const problem = await checkDate(actor.company.id, actor.id, input.date, false);
  if (problem) return problem;

  const ip = await getClientIp();
  try {
    await db.transaction(async (tx) => {
      const [created] = await tx
        .insert(overtimeOrders)
        .values({
          companyId: actor.company.id,
          userId: actor.id,
          workDate: input.date,
          startMinute: input.start,
          endMinute: input.end,
          reason: input.reason,
          source: "REQUEST",
          status: "PENDING",
          requestedById: actor.id,
        })
        .returning({ id: overtimeOrders.id });
      await logAudit(
        {
          companyId: actor.company.id,
          userId: actor.id,
          action: "OVERTIME_REQUESTED",
          entityName: "overtime_orders",
          entityId: created.id,
          newValues: { workDate: input.date, startMinute: input.start, endMinute: input.end, reason: input.reason },
          ipAddress: ip,
        },
        tx,
      );
    });
  } catch (error) {
    if (isUniqueViolation(error)) return fail("date", "Anda sudah punya izin lembur pada tanggal itu.");
    throw error;
  }

  revalidateOvertime();
  return { success: true, data: undefined };
}

// ---------------------------------------------------------------------------
// Menugaskan (Owner / Admin HR)
// ---------------------------------------------------------------------------

export async function assignOvertime(formData: FormData): Promise<ActionResult> {
  const actor = await verifySession();
  if (!can(actor, "overtime:assign")) return FORBIDDEN;

  const parsed = overtimeAssignSchema.safeParse({
    userId: formData.get("userId"),
    date: formData.get("date"),
    start: formData.get("start") ?? "",
    end: formData.get("end") ?? "",
    reason: formData.get("reason"),
  });
  if (!parsed.success) return invalid(parsed.error);
  const input = parsed.data;

  // Admin HR tidak menugasi dirinya sendiri (Owner tidak absen, jadi tidak ada di daftar).
  if (input.userId === actor.id) return fail("userId", "Penugasan untuk diri sendiri dibuat lewat pengajuan.");
  const people = await listCheckInPeople(actor.company.id);
  if (!people.some((person) => person.id === input.userId)) return fail("userId", "Pilih karyawan yang wajib absen");

  const problem = await checkDate(actor.company.id, input.userId, input.date, true);
  if (problem) return problem;

  const ip = await getClientIp();
  const now = new Date();
  try {
    await db.transaction(async (tx) => {
      const [created] = await tx
        .insert(overtimeOrders)
        .values({
          companyId: actor.company.id,
          userId: input.userId,
          workDate: input.date,
          startMinute: input.start,
          endMinute: input.end,
          reason: input.reason,
          source: "ASSIGNED",
          status: "APPROVED",
          requestedById: actor.id,
          decidedById: actor.id,
          decidedAt: now,
        })
        .returning({ id: overtimeOrders.id });
      await linkExistingRecord(tx, { id: created.id, userId: input.userId, workDate: input.date });
      await logAudit(
        {
          companyId: actor.company.id,
          userId: actor.id,
          action: "OVERTIME_ASSIGNED",
          entityName: "overtime_orders",
          entityId: created.id,
          newValues: {
            employee: people.find((person) => person.id === input.userId)?.fullName,
            workDate: input.date,
            startMinute: input.start,
            endMinute: input.end,
            reason: input.reason,
          },
          ipAddress: ip,
        },
        tx,
      );
    });
  } catch (error) {
    if (isUniqueViolation(error)) return fail("date", CLASH);
    throw error;
  }

  after(() =>
    notifyOvertimeAssigned(
      actor.company.id,
      input.userId,
      { workDate: input.date, startMinute: input.start, endMinute: input.end },
      actor.fullName,
    ),
  );
  revalidateOvertime();
  return { success: true, data: undefined };
}

// ---------------------------------------------------------------------------
// Menyetujui / menolak
// ---------------------------------------------------------------------------

export async function approveOvertime(orderId: string): Promise<ActionResult> {
  return decide(orderId, true, null);
}

export async function rejectOvertime(orderId: string, formData: FormData): Promise<ActionResult> {
  const reason = rejectReasonSchema.safeParse(formData.get("reason"));
  if (!reason.success) return fail("reason", z.flattenError(reason.error).formErrors[0] ?? "Alasan tidak valid");
  return decide(orderId, false, reason.data);
}

async function decide(orderId: string, approve: boolean, rejectReason: string | null): Promise<ActionResult> {
  const actor = await verifySession();
  const id = idSchema.safeParse(orderId);
  if (!id.success) return NOT_FOUND;

  const settings = await getOvertimeSettings(actor.company.id);
  const ip = await getClientIp();
  const now = new Date();
  let notice = null as (() => Promise<void>) | null;
  const result = await db.transaction(async (tx): Promise<ActionResult> => {
    const [order] = await tx
      .select()
      .from(overtimeOrders)
      .where(
        and(
          eq(overtimeOrders.id, id.data),
          eq(overtimeOrders.companyId, actor.company.id),
          eq(overtimeOrders.status, "PENDING"),
        ),
      )
      .limit(1)
      .for("update");
    if (!order) return NOT_FOUND;

    const right = overtimeDecisionRight(actor, order, settings, now);
    if (!right) {
      return {
        success: false,
        message:
          order.userId === actor.id
            ? "Pengajuan lembur Anda sendiri diproses oleh Owner."
            : "Pengajuan ini masih menunggu Owner. Admin HR bisa memprosesnya setelah waktu delegasi lewat.",
      };
    }
    if (await anyPeriodLocked(actor.company.id, [order.workDate.slice(0, 7)])) {
      return { success: false, message: LOCKED_MESSAGE };
    }

    await tx
      .update(overtimeOrders)
      .set({
        status: approve ? "APPROVED" : "REJECTED",
        decidedById: actor.id,
        decidedAt: now,
        decidedByDelegate: right === "delegate",
        rejectReason,
      })
      .where(eq(overtimeOrders.id, order.id));
    if (approve) await linkExistingRecord(tx, order);

    await logAudit(
      {
        companyId: actor.company.id,
        userId: actor.id,
        action: approve ? "OVERTIME_APPROVED" : "OVERTIME_REJECTED",
        entityName: "overtime_orders",
        entityId: order.id,
        newValues: {
          workDate: order.workDate,
          delegated: right === "delegate",
          ...(rejectReason ? { rejectReason } : {}),
        },
        ipAddress: ip,
      },
      tx,
    );
    notice = () =>
      notifyOvertimeDecided(actor.company.id, order.userId, order, { approved: approve, reason: rejectReason });
    return { success: true, data: undefined };
  });
  if (result.success) {
    revalidateOvertime();
    if (notice) after(notice);
  }
  return result;
}

// ---------------------------------------------------------------------------
// Membatalkan & tidak bisa hadir
// ---------------------------------------------------------------------------

// Pengaju membatalkan pengajuannya; Owner/Admin HR membatalkan lembur siapa pun
// (kecuali penugasan untuk dirinya sendiri: itu lewat "Tidak bisa hadir").
// Izin yang sudah dipakai absen tidak bisa dibatalkan.
export async function cancelOvertime(orderId: string): Promise<ActionResult> {
  const actor = await verifySession();
  const id = idSchema.safeParse(orderId);
  if (!id.success) return NOT_FOUND;

  const ip = await getClientIp();
  let notice = null as (() => Promise<void>) | null;
  const result = await db.transaction(async (tx): Promise<ActionResult> => {
    const [order] = await tx
      .select()
      .from(overtimeOrders)
      .where(and(eq(overtimeOrders.id, id.data), eq(overtimeOrders.companyId, actor.company.id)))
      .limit(1)
      .for("update");
    if (!order || (order.status !== "PENDING" && order.status !== "APPROVED")) return NOT_FOUND;

    const own = order.userId === actor.id;
    const manager = !own && (can(actor, "overtime:assign") || can(actor, "leave:approve"));
    const ownRequest = own && order.source === "REQUEST";
    if (!manager && !ownRequest) return FORBIDDEN;

    if (await anyPeriodLocked(actor.company.id, [order.workDate.slice(0, 7)])) {
      return { success: false, message: LOCKED_MESSAGE };
    }
    if (order.status === "APPROVED" && (await hasAttended(tx, order.userId, order.workDate))) {
      return {
        success: false,
        message: "Karyawan sudah absen pada tanggal ini, jadi izin lembur tidak bisa dibatalkan.",
      };
    }

    await tx
      .update(overtimeOrders)
      .set({ status: "CANCELLED", cancelledAt: new Date() })
      .where(eq(overtimeOrders.id, order.id));
    await logAudit(
      {
        companyId: actor.company.id,
        userId: actor.id,
        action: "OVERTIME_CANCELLED",
        entityName: "overtime_orders",
        entityId: order.id,
        newValues: { workDate: order.workDate, byEmployee: own },
        ipAddress: ip,
      },
      tx,
    );
    // Pengaju membatalkan yang sudah disetujui: Owner/Admin HR diberi tahu. Pembatalan oleh Owner/Admin HR:
    // karyawan diberi tahu. Pengajuan yang masih menunggu lalu ditarik sendiri tidak perlu kabar.
    if (!own) notice = () => notifyOvertimeCancelledByManager(actor.company.id, order.userId, order, actor.fullName);
    else if (order.status === "APPROVED") {
      notice = () =>
        notifyOvertimeCancelledByEmployee(actor.company.id, { id: actor.id, fullName: actor.fullName }, order);
    }
    return { success: true, data: undefined };
  });
  if (result.success) {
    revalidateOvertime();
    if (notice) after(notice);
  }
  return result;
}

// Karyawan menolak penugasan lembur ("Tidak bisa hadir"), dengan alasan.
export async function declineOvertime(orderId: string, formData: FormData): Promise<ActionResult> {
  const actor = await verifySession();
  const id = idSchema.safeParse(orderId);
  if (!id.success) return NOT_FOUND;
  const reason = rejectReasonSchema.safeParse(formData.get("reason"));
  if (!reason.success) return fail("reason", z.flattenError(reason.error).formErrors[0] ?? "Alasan tidak valid");

  const ip = await getClientIp();
  let notice = null as (() => Promise<void>) | null;
  const result = await db.transaction(async (tx): Promise<ActionResult> => {
    const [order] = await tx
      .select()
      .from(overtimeOrders)
      .where(
        and(
          eq(overtimeOrders.id, id.data),
          eq(overtimeOrders.companyId, actor.company.id),
          eq(overtimeOrders.userId, actor.id),
          eq(overtimeOrders.source, "ASSIGNED"),
          eq(overtimeOrders.status, "APPROVED"),
        ),
      )
      .limit(1)
      .for("update");
    if (!order) return NOT_FOUND;
    if (await anyPeriodLocked(actor.company.id, [order.workDate.slice(0, 7)])) {
      return { success: false, message: LOCKED_MESSAGE };
    }
    if (await hasAttended(tx, actor.id, order.workDate)) {
      return { success: false, message: "Anda sudah absen pada tanggal ini." };
    }

    await tx
      .update(overtimeOrders)
      .set({ status: "DECLINED", declineReason: reason.data, cancelledAt: new Date() })
      .where(eq(overtimeOrders.id, order.id));
    await logAudit(
      {
        companyId: actor.company.id,
        userId: actor.id,
        action: "OVERTIME_DECLINED",
        entityName: "overtime_orders",
        entityId: order.id,
        newValues: { workDate: order.workDate, declineReason: reason.data },
        ipAddress: ip,
      },
      tx,
    );
    notice = () =>
      notifyOvertimeDeclined(actor.company.id, { id: actor.id, fullName: actor.fullName }, order, reason.data);
    return { success: true, data: undefined };
  });
  if (result.success) {
    revalidateOvertime();
    if (notice) after(notice);
  }
  return result;
}

// ---------------------------------------------------------------------------
// Pengaturan delegasi lembur (Owner)
// ---------------------------------------------------------------------------

// Saklar "wajib izin lembur" boleh diubah Owner dan Admin HR (attendance:configure). Delegasi ke
// Admin HR hanya diatur Owner (Admin HR tidak boleh memberi dirinya wewenang): bagi Admin HR,
// nilai delegasi yang ada dipertahankan.
export async function updateOvertimeSettings(
  _prevState: ActionResult | undefined,
  formData: FormData,
): Promise<ActionResult> {
  const actor = await verifySession();
  if (!can(actor, "attendance:configure")) return FORBIDDEN;

  const before = await getOvertimeSettings(actor.company.id);
  const setsDelegation = can(actor, "leave:approve");
  const parsed = overtimeSettingsSchema.safeParse({
    attendanceOvertimeRequired: formData.get("attendanceOvertimeRequired") === "on",
    overtimeDelegationEnabled: setsDelegation
      ? formData.get("overtimeDelegationEnabled") === "on"
      : before.overtimeDelegationEnabled,
    overtimeDelegationHours: setsDelegation ? formData.get("overtimeDelegationHours") : before.overtimeDelegationHours,
  });
  if (!parsed.success) return invalid(parsed.error);

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
  revalidateOvertime();
  return { success: true, data: undefined };
}
