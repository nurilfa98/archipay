// Server Action konfirmasi karyawan atas penggantian kekurangan (kantor
// nombok) yang sudah dibayar Owner/Finance (BUSINESS-FLOW §8.1.2):
//
//   acknowledgeReimbursement  "Sudah saya terima"  → selesai
//   disputeReimbursement      "Belum saya terima"  → pencatatan DIBATALKAN lewat
//                              baris pembalik di ledger (ledger tidak pernah
//                              diubah/dihapus), kekurangan kembali tercatat belum
//                              dibayar, Owner & pencatatnya langsung dikabari
//
// Hanya penerima uang muka itu sendiri yang boleh, dan hanya selama statusnya
// masih PENDING (tanpa jawaban 3 hari → AUTO "dianggap diterima" oleh cron,
// reimbursement-ack.ts). Penggantian lewat slip gaji tidak perlu konfirmasi.

"use server";

import { and, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { z } from "zod";
import { getOwnerContacts } from "@/features/advances/queries";
import { logAudit } from "@/lib/audit";
import { verifySession } from "@/lib/auth/dal";
import { db } from "@/lib/db";
import { advanceLedgerEntries, advanceRequests, settlements } from "@/lib/db/schema";
import { getClientIp } from "@/lib/request";
import type { ActionResult } from "@/types/action-result";
import { notifyReimbursementDisputed } from "./notifications";

const NOT_FOUND = { success: false, message: "Penggantian tidak ditemukan." } as const;
const DECIDED = {
  success: false,
  message: "Penggantian ini sudah dikonfirmasi atau sudah dianggap diterima.",
} as const;

const noteSchema = z
  .string()
  .trim()
  .max(250, "Catatan maksimal 250 karakter")
  .transform((value) => value || null);

async function loadOwnEntry(entryId: string) {
  const actor = await verifySession();
  const id = z.string().min(1).max(36).safeParse(entryId);
  if (!id.success) return { ok: false, error: NOT_FOUND } as const;

  const [row] = await db
    .select({
      id: advanceLedgerEntries.id,
      advanceId: advanceLedgerEntries.advanceId,
      amount: advanceLedgerEntries.amount,
      method: advanceLedgerEntries.method,
      ackStatus: advanceLedgerEntries.ackStatus,
      createdById: advanceLedgerEntries.createdById,
      settlementId: settlements.id,
      settlementNumber: settlements.number,
      advanceNumber: advanceRequests.number,
      recipientId: advanceRequests.recipientId,
    })
    .from(advanceLedgerEntries)
    .innerJoin(advanceRequests, eq(advanceLedgerEntries.advanceId, advanceRequests.id))
    .innerJoin(settlements, eq(settlements.advanceId, advanceRequests.id))
    .where(
      and(
        eq(advanceLedgerEntries.id, id.data),
        eq(advanceLedgerEntries.companyId, actor.company.id),
        eq(advanceLedgerEntries.type, "REIMBURSEMENT"),
      ),
    )
    .limit(1);
  // Hanya penerima uang muka itu sendiri; selain itu "tidak ditemukan".
  if (!row || row.recipientId !== actor.id) return { ok: false, error: NOT_FOUND } as const;
  if (row.ackStatus !== "PENDING") return { ok: false, error: DECIDED } as const;
  return { ok: true, actor, row } as const;
}

function revalidateAck() {
  revalidatePath("/settlements", "layout");
  revalidatePath("/advances", "layout");
  revalidatePath("/payroll", "layout");
  revalidatePath("/beranda");
  revalidatePath("/projects", "layout");
}

export async function acknowledgeReimbursement(entryId: string): Promise<ActionResult> {
  const loaded = await loadOwnEntry(entryId);
  if (!loaded.ok) return loaded.error;
  const { actor, row } = loaded;

  const ip = await getClientIp();
  const saved = await db.transaction(async (tx) => {
    const [updated] = await tx
      .update(advanceLedgerEntries)
      .set({ ackStatus: "CONFIRMED", ackAt: new Date() })
      .where(and(eq(advanceLedgerEntries.id, row.id), eq(advanceLedgerEntries.ackStatus, "PENDING")))
      .returning({ id: advanceLedgerEntries.id });
    if (!updated) return false;
    await logAudit(
      {
        companyId: actor.company.id,
        userId: actor.id,
        action: "REIMBURSEMENT_ACKNOWLEDGED",
        entityName: "settlements",
        entityId: row.settlementId,
        newValues: { amount: row.amount, method: row.method },
        ipAddress: ip,
      },
      tx,
    );
    return true;
  });
  if (!saved) return DECIDED;

  revalidateAck();
  return { success: true, data: undefined };
}

export async function disputeReimbursement(entryId: string, formData: FormData): Promise<ActionResult> {
  const loaded = await loadOwnEntry(entryId);
  if (!loaded.ok) return loaded.error;
  const { actor, row } = loaded;

  const note = noteSchema.safeParse(formData.get("note") ?? "");
  if (!note.success) {
    return {
      success: false,
      message: "Periksa kembali isian Anda.",
      fieldErrors: { note: [note.error.issues[0]?.message ?? "Catatan tidak valid"] },
    };
  }

  const ip = await getClientIp();
  const saved = await db.transaction(async (tx) => {
    // Kunci baris uang muka: pembalikan & perubahan status tidak bertabrakan
    // dengan pencatatan lain di uang muka yang sama.
    await tx
      .select({ id: advanceRequests.id })
      .from(advanceRequests)
      .where(eq(advanceRequests.id, row.advanceId))
      .for("update");

    const [updated] = await tx
      .update(advanceLedgerEntries)
      .set({ ackStatus: "DISPUTED", ackAt: new Date(), ackNote: note.data })
      .where(and(eq(advanceLedgerEntries.id, row.id), eq(advanceLedgerEntries.ackStatus, "PENDING")))
      .returning({ id: advanceLedgerEntries.id });
    if (!updated) return false;

    // Baris pembalik: saldo kembali ke kekurangan sebelum pembayaran dicatat.
    await tx.insert(advanceLedgerEntries).values({
      companyId: actor.company.id,
      advanceId: row.advanceId,
      type: "REIMBURSEMENT_REVERSAL",
      amount: -row.amount,
      method: row.method,
      note: `Karyawan menyatakan belum menerima${note.data ? `: ${note.data}` : ""}`.slice(0, 300),
      reversalOf: row.id,
      createdById: actor.id,
    });
    const [{ balance }] = await tx
      .select({ balance: sql`coalesce(sum(${advanceLedgerEntries.amount}), 0)`.mapWith(Number) })
      .from(advanceLedgerEntries)
      .where(eq(advanceLedgerEntries.advanceId, row.advanceId));
    if (balance < 0) {
      await tx.update(advanceRequests).set({ status: "REIMBURSE_PENDING" }).where(eq(advanceRequests.id, row.advanceId));
    }

    await logAudit(
      {
        companyId: actor.company.id,
        userId: actor.id,
        action: "REIMBURSEMENT_DISPUTED",
        entityName: "settlements",
        entityId: row.settlementId,
        newValues: { amount: row.amount, method: row.method, remaining: Math.abs(balance), reason: note.data },
        ipAddress: ip,
      },
      tx,
    );
    return true;
  });
  if (!saved) return DECIDED;

  // Urgent: Owner dan pencatat pembayaran langsung dikabari lewat WhatsApp.
  const people = (await getOwnerContacts(actor.company.id, [row.createdById])).filter(
    (person) => person.id !== actor.id,
  );
  if (people.length > 0 && row.settlementNumber) {
    const summary = { id: row.settlementId, number: row.settlementNumber, advanceNumber: row.advanceNumber ?? "-" };
    after(() =>
      notifyReimbursementDisputed(summary, people, {
        employeeName: actor.fullName,
        amount: row.amount,
        note: note.data,
      }),
    );
  }
  revalidateAck();
  return { success: true, data: undefined };
}
