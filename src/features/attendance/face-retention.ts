// Pembersihan foto acuan yang DITOLAK (BUSINESS-FLOW §18.4), dipanggil cron
// harian (app/api/cron/reminders). Foto yang ditolak sengaja disimpan sebentar
// agar karyawan bisa melihatnya di kartu "Foto yang diajukan", lalu dihapus:
//
// 1. Karyawan sudah punya foto acuan yang DISETUJUI: penolakan tidak menghalangi
//    absen, jadi seluruh barisnya (alasan + file) dihapus setelah
//    FACE_REJECT_NOTICE_DAYS hari.
// 2. Belum punya foto acuan: kartu penolakan tetap tampil sampai ia mengambil
//    ulang, tetapi FILE fotonya dihapus setelah FACE_REJECT_PHOTO_DAYS hari
//    (alasan tetap ada, tanpa foto).
//
// Saat karyawan mengambil ulang foto, baris dan file lama dihapus oleh
// submitFaceProfile (face-actions.ts), tanpa menunggu cron.

import "server-only";
import { and, eq, inArray, isNotNull, lt, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { faceProfiles } from "@/lib/db/schema";
import { logError } from "@/lib/error-log";
import { deleteObject } from "@/lib/storage";
import { FACE_REJECT_NOTICE_DAYS, FACE_REJECT_PHOTO_DAYS } from "./constants";

const DAY_MS = 24 * 60 * 60 * 1000;

async function deleteFiles(keys: string[]) {
  if (keys.length === 0) return 0;
  const results = await Promise.allSettled(keys.map((key) => deleteObject(key)));
  const failed = results.filter((item) => item.status === "rejected").length;
  if (failed > 0) {
    await logError(new Error(`${failed} file foto wajah ditolak gagal dihapus`), {
      source: "CRON",
      action: "hapus foto wajah ditolak",
    });
  }
  return failed;
}

export async function purgeRejectedFaces(now = new Date()) {
  const noticeCutoff = new Date(now.getTime() - FACE_REJECT_NOTICE_DAYS * DAY_MS);
  const photoCutoff = new Date(now.getTime() - FACE_REJECT_PHOTO_DAYS * DAY_MS);

  // 1. Punya foto yang disetujui: hapus baris + file.
  const removed = await db
    .delete(faceProfiles)
    .where(
      and(
        eq(faceProfiles.status, "REJECTED"),
        lt(faceProfiles.reviewedAt, noticeCutoff),
        sql`exists (select 1 from face_profiles approved where approved.user_id = ${faceProfiles.userId} and approved.status = 'APPROVED')`,
      ),
    )
    .returning({ photoKey: faceProfiles.photoKey });

  // 2. Belum punya: hapus file saja, alasan tetap.
  const stale = await db
    .select({ id: faceProfiles.id, photoKey: faceProfiles.photoKey })
    .from(faceProfiles)
    .where(
      and(
        eq(faceProfiles.status, "REJECTED"),
        isNotNull(faceProfiles.photoKey),
        lt(faceProfiles.reviewedAt, photoCutoff),
      ),
    )
    .limit(500);
  if (stale.length > 0) {
    await db
      .update(faceProfiles)
      .set({ photoKey: null })
      .where(
        inArray(
          faceProfiles.id,
          stale.map((row) => row.id),
        ),
      );
  }

  const keys = [...removed, ...stale].map((row) => row.photoKey).filter((key): key is string => key !== null);
  const failed = await deleteFiles(keys);
  return { rows: removed.length, files: keys.length - failed, failed };
}
