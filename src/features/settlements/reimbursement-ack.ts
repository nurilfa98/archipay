// Konfirmasi otomatis penggantian (BUSINESS-FLOW §8.1.2), dipanggil cron harian
// (app/api/cron/reminders): penggantian yang dibayar Owner/Finance dan belum
// dijawab karyawan ("sudah/belum saya terima") selama REIMBURSE_ACK_DAYS hari
// berstatus AUTO, "dianggap diterima". Tercatat di Audit Log (tanpa pelaku).
// Setelah itu karyawan tidak bisa menyanggah lewat aplikasi lagi.
//
// Diperbarui dulu dengan syarat status masih PENDING, baru dicatat: bila
// karyawan menjawab tepat saat cron berjalan, jawabannya yang menang.

import "server-only";
import { and, asc, eq, inArray, lt } from "drizzle-orm";
import { logAudit } from "@/lib/audit";
import { db } from "@/lib/db";
import { advanceLedgerEntries, settlements } from "@/lib/db/schema";
import { REIMBURSE_ACK_DAYS } from "./constants";

const MAX_PER_RUN = 500;

export async function autoConfirmReimbursements(now = new Date()) {
  const cutoff = new Date(now.getTime() - REIMBURSE_ACK_DAYS * 24 * 60 * 60 * 1000);

  const due = await db
    .select({
      id: advanceLedgerEntries.id,
      companyId: advanceLedgerEntries.companyId,
      amount: advanceLedgerEntries.amount,
      method: advanceLedgerEntries.method,
      settlementId: settlements.id,
    })
    .from(advanceLedgerEntries)
    .innerJoin(settlements, eq(settlements.advanceId, advanceLedgerEntries.advanceId))
    .where(and(eq(advanceLedgerEntries.ackStatus, "PENDING"), lt(advanceLedgerEntries.createdAt, cutoff)))
    .orderBy(asc(advanceLedgerEntries.createdAt))
    .limit(MAX_PER_RUN);
  if (due.length === 0) return { confirmed: 0 };

  const updated = await db
    .update(advanceLedgerEntries)
    .set({ ackStatus: "AUTO", ackAt: now })
    .where(
      and(
        inArray(
          advanceLedgerEntries.id,
          due.map((row) => row.id),
        ),
        eq(advanceLedgerEntries.ackStatus, "PENDING"),
      ),
    )
    .returning({ id: advanceLedgerEntries.id });
  const doneIds = new Set(updated.map((row) => row.id));

  for (const row of due.filter((item) => doneIds.has(item.id))) {
    await logAudit({
      companyId: row.companyId,
      userId: null,
      action: "REIMBURSEMENT_AUTO_CONFIRMED",
      entityName: "settlements",
      entityId: row.settlementId,
      newValues: { amount: row.amount, method: row.method },
    });
  }
  return { confirmed: doneIds.size };
}
