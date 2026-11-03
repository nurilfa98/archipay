// Server Action pengaturan absensi (khusus OWNER, permission settings:manage):
// jam kerja, toleransi, denda keterlambatan, hari kerja, dan hari libur
// (BUSINESS-FLOW §18.2). Nilainya disimpan di company_settings.

"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { logAudit } from "@/lib/audit";
import { verifySession } from "@/lib/auth/dal";
import { can } from "@/lib/auth/permissions";
import { db, isUniqueViolation } from "@/lib/db";
import { attendanceHolidays, companySettings } from "@/lib/db/schema";
import { getClientIp } from "@/lib/request";
import type { ActionResult } from "@/types/action-result";
import { getAttendanceSettings } from "./queries";
import { attendanceSettingsSchema, holidaySchema, idSchema } from "./schemas";

const FORBIDDEN = {
  success: false,
  message: "Anda tidak memiliki akses.",
} as const;

async function getSettingsManager() {
  const actor = await verifySession();
  return can(actor, "settings:manage") ? actor : null;
}

export async function updateAttendanceSettings(
  _prevState: ActionResult | undefined,
  formData: FormData,
): Promise<ActionResult> {
  const actor = await getSettingsManager();
  if (!actor) return FORBIDDEN;

  const parsed = attendanceSettingsSchema.safeParse({
    workStartMinute: formData.get("workStart") ?? "",
    workEndMinute: formData.get("workEnd") ?? "",
    lateToleranceMinutes: formData.get("lateToleranceMinutes"),
    latePenaltyAmount: formData.get("latePenaltyAmount") ?? "",
    // Setiap hari kerja yang dicentang dikirim sebagai bit-nya; dijumlahkan
    // menjadi bitmask (lihat features/attendance/schedule.ts).
    workDays: formData.getAll("workDays").reduce<number>((mask, bit) => mask | Number(bit), 0),
  });
  if (!parsed.success) return invalid(parsed.error);

  const before = await getAttendanceSettings(actor.company.id);
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
  revalidatePath("/attendance", "layout");
  return { success: true, data: undefined };
}

export async function createHoliday(formData: FormData): Promise<ActionResult> {
  const actor = await getSettingsManager();
  if (!actor) return FORBIDDEN;

  const parsed = holidaySchema.safeParse({
    date: formData.get("date"),
    name: formData.get("name"),
  });
  if (!parsed.success) return invalid(parsed.error);

  const ip = await getClientIp();
  try {
    await db.transaction(async (tx) => {
      const [created] = await tx
        .insert(attendanceHolidays)
        .values({ companyId: actor.company.id, ...parsed.data })
        .returning({ id: attendanceHolidays.id });
      await logAudit(
        {
          companyId: actor.company.id,
          userId: actor.id,
          action: "HOLIDAY_CREATED",
          entityName: "attendance_holidays",
          entityId: created.id,
          newValues: { holidayDate: parsed.data.date, name: parsed.data.name },
          ipAddress: ip,
        },
        tx,
      );
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      return {
        success: false,
        message: "Periksa kembali isian Anda.",
        fieldErrors: { date: ["Tanggal ini sudah ada di daftar hari libur"] },
      };
    }
    throw error;
  }

  revalidateHolidays();
  return { success: true, data: undefined };
}

export async function deleteHoliday(holidayId: string): Promise<ActionResult> {
  const actor = await getSettingsManager();
  if (!actor) return FORBIDDEN;

  const id = idSchema.safeParse(holidayId);
  if (!id.success) return { success: false, message: "Hari libur tidak ditemukan." };

  const ip = await getClientIp();
  const deleted = await db.transaction(async (tx) => {
    const [row] = await tx
      .delete(attendanceHolidays)
      .where(and(eq(attendanceHolidays.id, id.data), eq(attendanceHolidays.companyId, actor.company.id)))
      .returning({
        date: attendanceHolidays.date,
        name: attendanceHolidays.name,
      });
    if (!row) return false;
    await logAudit(
      {
        companyId: actor.company.id,
        userId: actor.id,
        action: "HOLIDAY_DELETED",
        entityName: "attendance_holidays",
        entityId: id.data,
        oldValues: { holidayDate: row.date, name: row.name },
        ipAddress: ip,
      },
      tx,
    );
    return true;
  });
  if (!deleted) return { success: false, message: "Hari libur tidak ditemukan." };

  revalidateHolidays();
  return { success: true, data: undefined };
}

function revalidateHolidays() {
  revalidatePath("/settings");
  revalidatePath("/attendance", "layout");
}

function invalid(error: z.ZodError) {
  return {
    success: false as const,
    message: "Periksa kembali isian Anda.",
    fieldErrors: z.flattenError(error).fieldErrors as Record<string, string[]>,
  };
}
