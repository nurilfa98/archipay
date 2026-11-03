// Server Action review bulanan absensi (BUSINESS-FLOW §18.9–18.10):
// - bebaskan / berlakukan lagi denda (Waive Penalty), koreksi absen, kunci &
//   buka periode: Owner (attendance:review);
// - tandai denda sudah dipotong di Potong Gaji: Owner & Finance (payroll:manage).
// Periode yang sudah dikunci tidak bisa diubah (lihat period-lock.ts).

"use server";

import { and, eq, isNotNull, isNull, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { logAudit } from "@/lib/audit";
import { verifySession } from "@/lib/auth/dal";
import { can } from "@/lib/auth/permissions";
import { zonedDateString } from "@/lib/dates";
import { db } from "@/lib/db";
import {
  attendanceHolidays,
  attendanceLocations,
  attendancePenalties,
  attendancePeriods,
  attendanceRecords,
  users,
} from "@/lib/db/schema";
import { getClientIp } from "@/lib/request";
import type { ActionResult } from "@/types/action-result";
import { zonedToDate } from "./clock";
import { isoWeekdayOf } from "./leave-days";
import { listApprovedLeavesOn } from "./leave-queries";
import { isPeriodLocked, LOCKED_MESSAGE } from "./period-lock";
import { getAttendanceSettings } from "./queries";
import { countPendingLeavesInPeriod } from "./review-queries";
import { isWorkDay, parseTime } from "./schedule";
import { idSchema, REASON_MIN } from "./schemas";

const FORBIDDEN = { success: false, message: "Anda tidak memiliki akses." } as const;
const periodSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Periode tidak valid");

async function getReviewer() {
  const actor = await verifySession();
  return can(actor, "attendance:review") ? actor : null;
}

function revalidateReview() {
  revalidatePath("/attendance", "layout");
  revalidatePath("/payroll-deductions");
}

// ---------------------------------------------------------------------------
// Bebaskan denda (Waive Penalty)
// ---------------------------------------------------------------------------

export async function setPenaltyWaived(penaltyId: string, waived: boolean, note?: string): Promise<ActionResult> {
  const actor = await getReviewer();
  if (!actor) return FORBIDDEN;
  const id = idSchema.safeParse(penaltyId);
  const waiveNote = z.string().trim().max(300).optional().safeParse(note);
  if (!id.success || typeof waived !== "boolean" || !waiveNote.success) {
    return { success: false, message: "Denda tidak ditemukan." };
  }

  const [penalty] = await db
    .select({
      period: attendancePenalties.period,
      status: attendancePenalties.status,
      deductedAt: attendancePenalties.deductedAt,
      amount: attendancePenalties.amount,
      userName: users.fullName,
    })
    .from(attendancePenalties)
    .innerJoin(users, eq(attendancePenalties.userId, users.id))
    .where(and(eq(attendancePenalties.id, id.data), eq(attendancePenalties.companyId, actor.company.id)))
    .limit(1);
  if (!penalty) return { success: false, message: "Denda tidak ditemukan." };
  if (await isPeriodLocked(actor.company.id, penalty.period)) return { success: false, message: LOCKED_MESSAGE };
  if (penalty.deductedAt) return { success: false, message: "Denda sudah ditandai dipotong dari gaji." };
  if ((penalty.status === "WAIVED") === waived) return { success: true, data: undefined };

  const ip = await getClientIp();
  await db.transaction(async (tx) => {
    await tx
      .update(attendancePenalties)
      .set(
        waived
          ? { status: "WAIVED", waivedAt: new Date(), waivedById: actor.id, waiveNote: waiveNote.data || null }
          : { status: "ACTIVE", waivedAt: null, waivedById: null, waiveNote: null },
      )
      .where(eq(attendancePenalties.id, id.data));
    await logAudit(
      {
        companyId: actor.company.id,
        userId: actor.id,
        action: waived ? "PENALTY_WAIVED" : "PENALTY_REINSTATED",
        entityName: "attendance_penalties",
        entityId: id.data,
        newValues: { employeeName: penalty.userName, amount: penalty.amount, note: waiveNote.data || null },
        ipAddress: ip,
      },
      tx,
    );
  });
  revalidateReview();
  return { success: true, data: undefined };
}

// ---------------------------------------------------------------------------
// Kunci / buka periode
// ---------------------------------------------------------------------------

export async function lockPeriod(period: string): Promise<ActionResult> {
  const actor = await getReviewer();
  if (!actor) return FORBIDDEN;
  const parsed = periodSchema.safeParse(period);
  if (!parsed.success) return { success: false, message: "Periode tidak valid." };
  // Hanya bulan yang sudah lewat: bulan berjalan masih bisa bertambah absennya.
  if (parsed.data >= zonedDateString(new Date()).slice(0, 7)) {
    return { success: false, message: "Periode bisa dikunci setelah bulannya berakhir." };
  }
  const pending = await countPendingLeavesInPeriod(actor.company.id, parsed.data);
  if (pending > 0) {
    return {
      success: false,
      message: `Masih ada ${pending} pengajuan cuti/izin yang menunggu di bulan ini. Proses dulu sebelum mengunci.`,
    };
  }

  const ip = await getClientIp();
  const locked = await db.transaction(async (tx) => {
    const inserted = await tx
      .insert(attendancePeriods)
      .values({ companyId: actor.company.id, period: parsed.data, lockedById: actor.id })
      .onConflictDoNothing()
      .returning({ period: attendancePeriods.period });
    if (inserted.length === 0) return false;
    await logAudit(
      {
        companyId: actor.company.id,
        userId: actor.id,
        action: "ATTENDANCE_PERIOD_LOCKED",
        entityName: "attendance_periods",
        entityId: parsed.data,
        newValues: { attendancePeriod: parsed.data },
        ipAddress: ip,
      },
      tx,
    );
    return true;
  });
  if (!locked) return { success: false, message: "Periode ini sudah dikunci." };
  revalidateReview();
  return { success: true, data: undefined };
}

export async function unlockPeriod(period: string): Promise<ActionResult> {
  const actor = await getReviewer();
  if (!actor) return FORBIDDEN;
  const parsed = periodSchema.safeParse(period);
  if (!parsed.success) return { success: false, message: "Periode tidak valid." };

  const [deducted] = await db
    .select({ count: sql`count(*)`.mapWith(Number) })
    .from(attendancePenalties)
    .where(
      and(
        eq(attendancePenalties.companyId, actor.company.id),
        eq(attendancePenalties.period, parsed.data),
        isNotNull(attendancePenalties.deductedAt),
      ),
    );
  if ((deducted?.count ?? 0) > 0) {
    return { success: false, message: "Sebagian denda periode ini sudah ditandai dipotong; kunci tidak bisa dibuka." };
  }

  const ip = await getClientIp();
  const unlocked = await db.transaction(async (tx) => {
    const removed = await tx
      .delete(attendancePeriods)
      .where(and(eq(attendancePeriods.companyId, actor.company.id), eq(attendancePeriods.period, parsed.data)))
      .returning({ period: attendancePeriods.period });
    if (removed.length === 0) return false;
    await logAudit(
      {
        companyId: actor.company.id,
        userId: actor.id,
        action: "ATTENDANCE_PERIOD_UNLOCKED",
        entityName: "attendance_periods",
        entityId: parsed.data,
        newValues: { attendancePeriod: parsed.data },
        ipAddress: ip,
      },
      tx,
    );
    return true;
  });
  if (!unlocked) return { success: false, message: "Periode ini belum dikunci." };
  revalidateReview();
  return { success: true, data: undefined };
}

// ---------------------------------------------------------------------------
// Koreksi absen (misal HP karyawan mati)
// ---------------------------------------------------------------------------

const correctionSchema = z.object({
  date: z.iso.date("Tanggal tidak valid"),
  locationId: idSchema,
  checkIn: z.string().transform((value, ctx) => {
    const minutes = parseTime(value);
    if (minutes === null) {
      ctx.addIssue({ code: "custom", message: "Isi jam masuk" });
      return z.NEVER;
    }
    return minutes;
  }),
  checkOut: z.string().transform((value, ctx) => {
    if (!value.trim()) return null;
    const minutes = parseTime(value);
    if (minutes === null) {
      ctx.addIssue({ code: "custom", message: "Jam pulang tidak valid" });
      return z.NEVER;
    }
    return minutes;
  }),
  note: z
    .string()
    .trim()
    .min(REASON_MIN, `Alasan koreksi minimal ${REASON_MIN} karakter`)
    .max(500, "Alasan maksimal 500 karakter"),
});

export async function correctAttendance(userId: string, formData: FormData): Promise<ActionResult> {
  const actor = await getReviewer();
  if (!actor) return FORBIDDEN;
  const target = idSchema.safeParse(userId);
  if (!target.success) return { success: false, message: "Karyawan tidak ditemukan." };
  const parsed = correctionSchema.safeParse({
    date: formData.get("date"),
    locationId: formData.get("locationId"),
    checkIn: formData.get("checkIn") ?? "",
    checkOut: formData.get("checkOut") ?? "",
    note: formData.get("note") ?? "",
  });
  if (!parsed.success) {
    return {
      success: false,
      message: "Periksa kembali isian Anda.",
      fieldErrors: z.flattenError(parsed.error).fieldErrors as Record<string, string[]>,
    };
  }
  const input = parsed.data;
  const companyId = actor.company.id;
  if (input.date > zonedDateString(new Date()))
    return fieldFail("date", "Tidak bisa mengoreksi tanggal yang belum terjadi");
  if (await isPeriodLocked(companyId, input.date.slice(0, 7))) return { success: false, message: LOCKED_MESSAGE };
  if (input.checkOut !== null && input.checkOut <= input.checkIn) {
    return fieldFail("checkOut", "Jam pulang harus setelah jam masuk");
  }

  const [person] = await db
    .select({ fullName: users.fullName })
    .from(users)
    .where(and(eq(users.id, target.data), eq(users.companyId, companyId)))
    .limit(1);
  const [location] = await db
    .select()
    .from(attendanceLocations)
    .where(and(eq(attendanceLocations.id, input.locationId), eq(attendanceLocations.companyId, companyId)))
    .limit(1);
  if (!person) return { success: false, message: "Karyawan tidak ditemukan." };
  if (!location) return fieldFail("locationId", "Pilih lokasi");

  const leaves = await listApprovedLeavesOn(companyId, target.data, [input.date]);
  if (leaves.some((leave) => leave.kind === "FULL_DAY")) {
    return fieldFail("date", "Karyawan sedang cuti/izin seharian pada tanggal ini. Batalkan cutinya dulu.");
  }
  const settings = await getAttendanceSettings(companyId);
  const [holiday] = await db
    .select({ id: attendanceHolidays.id })
    .from(attendanceHolidays)
    .where(and(eq(attendanceHolidays.companyId, companyId), eq(attendanceHolidays.date, input.date)))
    .limit(1);
  const workDay = isWorkDay(settings.workDays, isoWeekdayOf(input.date)) && !holiday;
  const permitted = (kind: string) => leaves.find((leave) => leave.kind === kind)?.timeMinute ?? null;
  const start = Math.max(location.workStartMinute ?? settings.workStartMinute, permitted("LATE_ARRIVAL") ?? 0);
  const end = Math.min(location.workEndMinute ?? settings.workEndMinute, permitted("EARLY_LEAVE") ?? Infinity);
  const lateMinutes = workDay && input.checkIn > start + settings.lateToleranceMinutes ? input.checkIn - start : 0;
  const earlyMinutes = workDay && input.checkOut !== null && input.checkOut < end ? end - input.checkOut : 0;

  const checkInAt = zonedToDate(input.date, input.checkIn, location.timezone);
  const checkOutAt = input.checkOut === null ? null : zonedToDate(input.date, input.checkOut, location.timezone);
  const correction = { correctionNote: input.note, correctedById: actor.id, correctedAt: new Date() };
  const checkOutValues = checkOutAt
    ? {
        checkOutLocationId: location.id,
        checkOutAt,
        checkOutLatitude: location.latitude,
        checkOutLongitude: location.longitude,
        checkOutAccuracy: 0,
        checkOutDistance: 0,
        checkOutInRadius: true,
        checkOutFaceScore: 0,
        earlyMinutes,
      }
    : {};

  const ip = await getClientIp();
  await db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(attendanceRecords)
      .where(and(eq(attendanceRecords.userId, target.data), eq(attendanceRecords.workDate, input.date)))
      .limit(1);

    let recordId: string;
    if (existing) {
      recordId = existing.id;
      await tx
        .update(attendanceRecords)
        .set({ checkInAt, lateMinutes, ...checkOutValues, ...correction })
        .where(eq(attendanceRecords.id, existing.id));
    } else {
      recordId = crypto.randomUUID();
      await tx.insert(attendanceRecords).values({
        id: recordId,
        companyId,
        userId: target.data,
        workDate: input.date,
        timezone: location.timezone,
        isWorkDay: workDay,
        scheduleStartMinute: start,
        scheduleEndMinute: Number.isFinite(end) ? end : settings.workEndMinute,
        toleranceMinutes: settings.lateToleranceMinutes,
        checkInLocationId: location.id,
        checkInAt,
        checkInLatitude: location.latitude,
        checkInLongitude: location.longitude,
        checkInAccuracy: 0,
        checkInDistance: 0,
        checkInInRadius: true,
        checkInFaceScore: 0,
        lateMinutes,
        ...checkOutValues,
        ...correction,
      });
    }

    // Denda mengikuti hasil koreksi.
    const [penalty] = await tx
      .select({ id: attendancePenalties.id, status: attendancePenalties.status })
      .from(attendancePenalties)
      .where(eq(attendancePenalties.recordId, recordId))
      .limit(1);
    if (lateMinutes > 0 && !penalty && settings.latePenaltyAmount > 0) {
      await tx.insert(attendancePenalties).values({
        companyId,
        recordId,
        userId: target.data,
        period: input.date.slice(0, 7),
        amount: settings.latePenaltyAmount,
      });
    } else if (lateMinutes === 0 && penalty?.status === "ACTIVE") {
      await tx
        .update(attendancePenalties)
        .set({
          status: "WAIVED",
          waivedAt: new Date(),
          waivedById: actor.id,
          waiveNote: "Koreksi absen: tidak terlambat",
        })
        .where(eq(attendancePenalties.id, penalty.id));
    }

    await logAudit(
      {
        companyId,
        userId: actor.id,
        action: "ATTENDANCE_CORRECTED",
        entityName: "attendance_records",
        entityId: recordId,
        oldValues: existing
          ? { lateMinutes: existing.lateMinutes, earlyMinutes: existing.earlyMinutes }
          : { employeeName: person.fullName },
        newValues: {
          employeeName: person.fullName,
          workDate: input.date,
          locationName: location.name,
          lateMinutes,
          earlyMinutes,
          correctionNote: input.note,
        },
        ipAddress: ip,
      },
      tx,
    );
  });
  revalidateReview();
  return { success: true, data: undefined };
}

function fieldFail(field: string, message: string) {
  return { success: false as const, message: "Periksa kembali isian Anda.", fieldErrors: { [field]: [message] } };
}

// ---------------------------------------------------------------------------
// Potong Gaji: tandai denda sudah dipotong
// ---------------------------------------------------------------------------

export async function markPenaltiesDeducted(userId: string, period: string, formData: FormData): Promise<ActionResult> {
  const actor = await verifySession();
  if (!can(actor, "payroll:manage")) return FORBIDDEN;
  const target = idSchema.safeParse(userId);
  const attendancePeriod = periodSchema.safeParse(period);
  const payrollPeriod = periodSchema.safeParse(formData.get("period"));
  if (!target.success || !attendancePeriod.success) return { success: false, message: "Data denda tidak ditemukan." };
  if (!payrollPeriod.success) return fieldFail("period", "Pilih periode gaji");
  if (target.data === actor.id) return { success: false, message: "Tidak bisa menandai potongan untuk diri sendiri." };
  if (!(await isPeriodLocked(actor.company.id, attendancePeriod.data))) {
    return { success: false, message: "Periode absensi ini belum dikunci Owner." };
  }

  const ip = await getClientIp();
  const count = await db.transaction(async (tx) => {
    const updated = await tx
      .update(attendancePenalties)
      .set({ deductedAt: new Date(), deductedById: actor.id, payrollPeriod: payrollPeriod.data })
      .where(
        and(
          eq(attendancePenalties.companyId, actor.company.id),
          eq(attendancePenalties.userId, target.data),
          eq(attendancePenalties.period, attendancePeriod.data),
          eq(attendancePenalties.status, "ACTIVE"),
          isNull(attendancePenalties.deductedAt),
        ),
      )
      .returning({ amount: attendancePenalties.amount });
    if (updated.length === 0) return 0;
    await logAudit(
      {
        companyId: actor.company.id,
        userId: actor.id,
        action: "PENALTY_DEDUCTED",
        entityName: "users",
        entityId: target.data,
        newValues: {
          attendancePeriod: attendancePeriod.data,
          payrollPeriod: payrollPeriod.data,
          penaltyCount: updated.length,
          amount: updated.reduce((total, row) => total + row.amount, 0),
        },
        ipAddress: ip,
      },
      tx,
    );
    return updated.length;
  });
  if (count === 0) return { success: false, message: "Denda sudah ditandai dipotong atau dibebaskan." };
  revalidateReview();
  return { success: true, data: undefined };
}
