// Hapus otomatis file selfie absen yang lewat masa simpan (Pengaturan
// platform, bawaan 3 bulan sejak absen), dipanggil cron harian
// (app/api/cron/reminders). Data absen (jam, jarak, skor, alasan) tetap ada;
// barisnya ditandai selfie_deleted_at. Polanya sama dengan
// features/settlements/receipt-retention.ts: file dihapus dulu, baru
// ditandai; bila gagal, dicoba lagi besok. Company nonaktif dikecualikan.

import "server-only";
import { and, asc, eq, inArray, isNull, lt, or, isNotNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { attendanceRecords, companies } from "@/lib/db/schema";
import { getPlatformSettings } from "@/lib/platform-settings";
import { deleteObject } from "@/lib/storage";

const MAX_PER_RUN = 1000;
const BATCH_SIZE = 20;

export async function purgeExpiredSelfies(now = new Date()) {
  const { attendanceSelfieRetentionMonths } = await getPlatformSettings();
  const cutoff = new Date(now);
  cutoff.setMonth(cutoff.getMonth() - attendanceSelfieRetentionMonths);

  const expired = await db
    .select({
      id: attendanceRecords.id,
      inKey: attendanceRecords.checkInSelfieKey,
      outKey: attendanceRecords.checkOutSelfieKey,
    })
    .from(attendanceRecords)
    .innerJoin(companies, eq(attendanceRecords.companyId, companies.id))
    .where(
      and(
        isNull(attendanceRecords.selfieDeletedAt),
        or(isNotNull(attendanceRecords.checkInSelfieKey), isNotNull(attendanceRecords.checkOutSelfieKey)),
        lt(attendanceRecords.checkInAt, cutoff),
        eq(companies.isActive, true),
      ),
    )
    .orderBy(asc(attendanceRecords.checkInAt))
    .limit(MAX_PER_RUN);

  let deleted = 0;
  for (let start = 0; start < expired.length; start += BATCH_SIZE) {
    const batch = expired.slice(start, start + BATCH_SIZE);
    const results = await Promise.allSettled(
      batch.map(async (row) => {
        for (const key of [row.inKey, row.outKey]) if (key) await deleteObject(key);
        return row.id;
      }),
    );
    const done = results.flatMap((result) => (result.status === "fulfilled" ? [result.value] : []));
    if (done.length > 0) {
      await db
        .update(attendanceRecords)
        .set({ checkInSelfieKey: null, checkOutSelfieKey: null, selfieDeletedAt: now })
        .where(inArray(attendanceRecords.id, done));
      deleted += done.length;
    }
  }
  return { records: deleted, remaining: expired.length === MAX_PER_RUN };
}
