// Kunci periode bulanan absensi (BUSINESS-FLOW §18.9). Dipakai Server Action
// review, cuti/izin, dan koreksi: periode yang sudah dikunci tidak bisa diubah.

import "server-only";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { attendancePeriods } from "@/lib/db/schema";

export const LOCKED_MESSAGE = "Periode absensi bulan ini sudah dikunci Owner. Minta Owner membuka kunci dulu.";

export async function isPeriodLocked(companyId: string, period: string) {
  const [row] = await db
    .select({ period: attendancePeriods.period })
    .from(attendancePeriods)
    .where(and(eq(attendancePeriods.companyId, companyId), eq(attendancePeriods.period, period)))
    .limit(1);
  return !!row;
}

// Periode mana saja (dari daftar) yang terkunci, misal rentang cuti 2 bulan.
export async function anyPeriodLocked(companyId: string, periods: string[]) {
  for (const period of new Set(periods)) if (await isPeriodLocked(companyId, period)) return true;
  return false;
}
