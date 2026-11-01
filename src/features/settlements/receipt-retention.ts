// Hapus otomatis file nota yang sudah lewat masa simpan, dipanggil cron
// harian (app/api/cron/reminders). Tujuannya agar penyimpanan R2 tidak terus
// menumpuk; menghapus file di R2 tidak dikenai biaya maupun kuota operasi.
//
// Aturan:
// - Hanya uang muka berstatus CLOSED (Selesai), dan hanya bila sudah lewat
//   platform_settings.receipt_retention_months sejak Selesai.
// - Waktu Selesai = entri buku saldo terakhir uang muka itu (verifikasi,
//   pengembalian, potong gaji, atau penggantian yang membuat saldo 0); tidak
//   ada kolom tersendiri. Cadangan: waktu verifikasi pertanggungjawaban.
// - Company nonaktif dikecualikan (datanya dibiarkan utuh).
// - Hanya FILE yang dihapus. Baris item tetap ada (nominal, keterangan,
//   hasil verifikasi), ditandai file_deleted_at; file_key & file_hash tetap
//   disimpan sehingga nota yang sama tetap ditolak bila diunggah ulang.
// - File dihapus dulu, baru ditandai. Bila hapus file gagal, item tidak
//   ditandai dan dicoba lagi pada cron berikutnya.
// - Paling banyak MAX_PER_RUN file per hari agar cron tidak terlalu lama;
//   sisanya diproses hari berikutnya.
//
// Referensi: https://developers.cloudflare.com/r2/pricing/

import "server-only";
import { and, asc, eq, inArray, isNotNull, isNull, lt, max, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { advanceLedgerEntries, advanceRequests, companies, settlementItems, settlements } from "@/lib/db/schema";
import { getPlatformSettings } from "@/lib/platform-settings";
import { deleteObject } from "@/lib/storage";

const MAX_PER_RUN = 1000;
const BATCH_SIZE = 20;

export async function purgeExpiredReceipts(now = new Date()) {
  const { receiptRetentionMonths } = await getPlatformSettings();
  const cutoff = new Date(now);
  cutoff.setMonth(cutoff.getMonth() - receiptRetentionMonths);

  const closedAt = sql`coalesce((${db
    .select({ value: max(advanceLedgerEntries.createdAt) })
    .from(advanceLedgerEntries)
    .where(eq(advanceLedgerEntries.advanceId, advanceRequests.id))}), ${settlements.verifiedAt})`;

  const expired = await db
    .select({ id: settlementItems.id, fileKey: settlementItems.fileKey })
    .from(settlementItems)
    .innerJoin(settlements, eq(settlementItems.settlementId, settlements.id))
    .innerJoin(advanceRequests, eq(settlements.advanceId, advanceRequests.id))
    .innerJoin(companies, eq(advanceRequests.companyId, companies.id))
    .where(
      and(
        isNotNull(settlementItems.fileKey),
        isNull(settlementItems.fileDeletedAt),
        eq(advanceRequests.status, "CLOSED"),
        eq(companies.isActive, true),
        lt(closedAt, cutoff),
      ),
    )
    .orderBy(asc(settlementItems.createdAt))
    .limit(MAX_PER_RUN);

  let deleted = 0;
  let failed = 0;
  for (let start = 0; start < expired.length; start += BATCH_SIZE) {
    const batch = expired.slice(start, start + BATCH_SIZE);
    const results = await Promise.allSettled(batch.map((item) => deleteObject(item.fileKey!)));
    const doneIds = batch.filter((_, index) => results[index].status === "fulfilled").map((item) => item.id);
    failed += batch.length - doneIds.length;
    if (doneIds.length > 0) {
      await db.update(settlementItems).set({ fileDeletedAt: now }).where(inArray(settlementItems.id, doneIds));
      deleted += doneIds.length;
    }
  }

  if (failed > 0) console.error(`[receipt-retention] ${failed} file nota gagal dihapus, dicoba lagi besok`);
  return { deleted, failed, retentionMonths: receiptRetentionMonths };
}
