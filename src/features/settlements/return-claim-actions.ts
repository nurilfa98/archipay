// Server Action laporan pengembalian sisa dana (BUSINESS-FLOW §8.1.1):
//
//   Karyawan  : reportReturn          "Saya sudah mengembalikan" (+ tanggal, bukti opsional)
//   Owner/Finance : confirmReturnClaim  cek mutasi/kas lalu konfirmasi → baris RETURN di ledger
//                   rejectReturnClaim   belum masuk → tolak dengan alasan (karyawan dikabari)
//
// Selama laporan MENUNGGU, uang muka itu tidak dianggap terlambat (pengingat &
// Potong Gaji berhenti, penggajian diblokir; lihat hasPendingReturnClaim di
// queries.ts), supaya karyawan tidak ditagih/dipotong karena Owner/Finance
// belum sempat mencatat. Hanya penerima uang muka yang boleh melapor; yang
// memutuskan harus pemegang settlement:verify DAN bukan penerimanya (aturan
// yang sama dengan pencatatan langsung).
//
// Tiga tanggal tersimpan terpisah: dilaporkan (created_at), tanggal diterima
// (received_on, boleh dikoreksi pemeriksa), dan dicatat (decided_at / ledger created_at).

"use server";

import { and, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { z } from "zod";
import { getActiveRecipient } from "@/features/advances/queries";
import { logAudit } from "@/lib/audit";
import { verifySession } from "@/lib/auth/dal";
import { zonedDateString } from "@/lib/dates";
import { db, isUniqueViolation } from "@/lib/db";
import { advanceLedgerEntries, returnClaims } from "@/lib/db/schema";
import { formatRupiah } from "@/lib/format";
import { getClientIp } from "@/lib/request";
import { deleteObject } from "@/lib/storage";
import type { ActionResult } from "@/types/action-result";
import { checkBalanceDate, readProofUpload, storeProof } from "./balance-evidence";
import { postBalanceEntry } from "./ledger";
import { notifyReturnClaimRejected } from "./notifications";
import { getSettlementDetail } from "./queries";
import { confirmClaimSchema, rejectClaimSchema, reportReturnSchema, settlementIdSchema } from "./schemas";
import { getSettlementActions } from "./service";

const FORBIDDEN = { success: false, message: "Anda tidak memiliki akses untuk tindakan ini." } as const;
const NOT_FOUND = { success: false, message: "Laporan tidak ditemukan." } as const;
const DECIDED = { success: false, message: "Laporan ini sudah diputuskan. Muat ulang halaman." } as const;
const NOT_RETURN_PENDING = {
  success: false,
  message: "Uang muka ini tidak sedang menunggu pengembalian sisa dana.",
} as const;

class ClaimDecidedError extends Error {}

function fieldError(field: string, message: string) {
  return { success: false as const, message: "Periksa kembali isian Anda.", fieldErrors: { [field]: [message] } };
}

function invalid(error: z.ZodError) {
  return {
    success: false as const,
    message: "Periksa kembali isian Anda.",
    fieldErrors: z.flattenError(error).fieldErrors as Record<string, string[]>,
  };
}

async function outstandingOf(advanceId: string) {
  const [row] = await db
    .select({ balance: sql`coalesce(sum(${advanceLedgerEntries.amount}), 0)`.mapWith(Number) })
    .from(advanceLedgerEntries)
    .where(eq(advanceLedgerEntries.advanceId, advanceId));
  return Math.max(0, row?.balance ?? 0);
}

function revalidateClaims() {
  revalidatePath("/settlements", "layout");
  revalidatePath("/advances", "layout");
  revalidatePath("/payroll-deductions");
  revalidatePath("/payroll", "layout");
  revalidatePath("/beranda");
  revalidatePath("/projects", "layout");
}

// ---------------------------------------------------------------------------
// Karyawan melapor
// ---------------------------------------------------------------------------

export async function reportReturn(settlementId: string, formData: FormData): Promise<ActionResult> {
  const actor = await verifySession();
  const id = settlementIdSchema.safeParse(settlementId);
  if (!id.success) return { success: false, message: "Pertanggungjawaban tidak ditemukan." };
  const settlement = await getSettlementDetail(actor.company.id, id.data);
  // Hanya penerima uang muka itu sendiri; selain itu "tidak ditemukan".
  if (!settlement || settlement.recipientId !== actor.id) {
    return { success: false, message: "Pertanggungjawaban tidak ditemukan." };
  }
  if (settlement.advanceStatus !== "RETURN_PENDING") return NOT_RETURN_PENDING;

  const parsed = reportReturnSchema.safeParse({
    amount: formData.get("amount") ?? "",
    method: formData.get("method") ?? "",
    returnedOn: formData.get("returnedOn") ?? "",
    note: formData.get("note") ?? "",
  });
  if (!parsed.success) return invalid(parsed.error);
  const input = parsed.data;

  const outstanding = await outstandingOf(settlement.advanceId);
  if (input.amount > outstanding) {
    return fieldError("amount", `Nominal melebihi sisa yang harus dikembalikan ${formatRupiah(outstanding)}`);
  }
  const dateError = checkBalanceDate(input.returnedOn, zonedDateString(settlement.disbursedAt!));
  if (dateError) return fieldError("returnedOn", dateError);

  const upload = await readProofUpload(formData.get("proof"));
  if (!upload.ok) return fieldError("proof", upload.message);

  const claimId = crypto.randomUUID();
  let proof: { key: string; contentType: string } | null = null;
  if (upload.file) {
    const stored = await storeProof(actor.company.id, "return-proofs", claimId, upload.file);
    if (!stored.ok) return { success: false, message: stored.message };
    proof = stored;
  }

  const ip = await getClientIp();
  try {
    await db.transaction(async (tx) => {
      await tx.insert(returnClaims).values({
        id: claimId,
        companyId: actor.company.id,
        settlementId: settlement.id,
        advanceId: settlement.advanceId,
        reporterId: actor.id,
        amount: input.amount,
        method: input.method,
        returnedOn: input.returnedOn,
        note: input.note,
        proofKey: proof?.key ?? null,
        proofContentType: proof?.contentType ?? null,
      });
      await logAudit(
        {
          companyId: actor.company.id,
          userId: actor.id,
          action: "RETURN_CLAIM_REPORTED",
          entityName: "settlements",
          entityId: settlement.id,
          newValues: { amount: input.amount, method: input.method, returnedOn: input.returnedOn },
          ipAddress: ip,
        },
        tx,
      );
    });
  } catch (error) {
    if (proof) await deleteObject(proof.key).catch(() => undefined);
    if (isUniqueViolation(error)) {
      return { success: false, message: "Sudah ada laporan pengembalian yang menunggu konfirmasi." };
    }
    throw error;
  }

  revalidateClaims();
  return { success: true, data: undefined };
}

// ---------------------------------------------------------------------------
// Owner/Finance memutuskan
// ---------------------------------------------------------------------------

async function loadClaimForDecision(claimId: string) {
  const actor = await verifySession();
  const id = settlementIdSchema.safeParse(claimId);
  if (!id.success) return { ok: false, error: NOT_FOUND } as const;

  const [claim] = await db
    .select()
    .from(returnClaims)
    .where(and(eq(returnClaims.id, id.data), eq(returnClaims.companyId, actor.company.id)))
    .limit(1);
  if (!claim) return { ok: false, error: NOT_FOUND } as const;

  const settlement = await getSettlementDetail(actor.company.id, claim.settlementId);
  if (!settlement) return { ok: false, error: NOT_FOUND } as const;
  const actions = getSettlementActions({ ...settlement, itemCount: 0 }, actor);
  // recordReturn = pemegang settlement:verify, bukan penerima, dan status RETURN_PENDING.
  if (settlement.advanceStatus === "RETURN_PENDING" && !actions.recordReturn) return { ok: false, error: FORBIDDEN } as const;
  if (settlement.advanceStatus !== "RETURN_PENDING") return { ok: false, error: NOT_RETURN_PENDING } as const;
  if (claim.status !== "PENDING") return { ok: false, error: DECIDED } as const;
  return { ok: true, actor, claim, settlement } as const;
}

export async function confirmReturnClaim(claimId: string, formData: FormData): Promise<ActionResult> {
  const loaded = await loadClaimForDecision(claimId);
  if (!loaded.ok) return loaded.error;
  const { actor, claim, settlement } = loaded;

  const parsed = confirmClaimSchema.safeParse({
    amount: formData.get("amount") ?? "",
    receivedOn: formData.get("receivedOn") ?? "",
    note: formData.get("note") ?? "",
  });
  if (!parsed.success) return invalid(parsed.error);
  const input = parsed.data;

  const dateError = checkBalanceDate(input.receivedOn, zonedDateString(settlement.disbursedAt!));
  if (dateError) return fieldError("receivedOn", dateError);

  let result;
  try {
    result = await postBalanceEntry({
      actor,
      advanceId: settlement.advanceId,
      settlementId: settlement.id,
      type: "RETURN",
      amount: input.amount,
      method: claim.method,
      reference: null,
      note: input.note ?? claim.note,
      audit: "RETURN_CLAIM_CONFIRMED",
      receivedOn: input.receivedOn,
      proof: claim.proofKey && claim.proofContentType ? { key: claim.proofKey, contentType: claim.proofContentType } : null,
      // Di transaksi yang sama: laporan hanya berubah bila masih menunggu.
      onPosted: async (tx, entry) => {
        const [updated] = await tx
          .update(returnClaims)
          .set({
            status: "CONFIRMED",
            decidedAt: new Date(),
            decidedById: actor.id,
            receivedOn: input.receivedOn,
            ledgerEntryId: entry.id,
          })
          .where(and(eq(returnClaims.id, claim.id), eq(returnClaims.status, "PENDING")))
          .returning({ id: returnClaims.id });
        if (!updated) throw new ClaimDecidedError();
      },
    });
  } catch (error) {
    if (error instanceof ClaimDecidedError) return DECIDED;
    throw error;
  }
  if (!result.ok) {
    return result.reason === "EXCEEDS"
      ? fieldError("amount", `Nominal melebihi sisa saldo ${formatRupiah(result.outstanding)}`)
      : NOT_RETURN_PENDING;
  }

  // Karyawan yang melapor sendiri sudah tahu hasilnya di aplikasi, jadi
  // konfirmasi tidak dikabarkan lewat WhatsApp (hemat kuota); penolakan dikabari.
  revalidateClaims();
  return { success: true, data: undefined };
}

export async function rejectReturnClaim(claimId: string, formData: FormData): Promise<ActionResult> {
  const loaded = await loadClaimForDecision(claimId);
  if (!loaded.ok) return loaded.error;
  const { actor, claim, settlement } = loaded;

  const parsed = rejectClaimSchema.safeParse({ reason: formData.get("reason") ?? "" });
  if (!parsed.success) return invalid(parsed.error);

  const ip = await getClientIp();
  const rejected = await db.transaction(async (tx) => {
    const [updated] = await tx
      .update(returnClaims)
      .set({ status: "REJECTED", decidedAt: new Date(), decidedById: actor.id, rejectReason: parsed.data.reason })
      .where(and(eq(returnClaims.id, claim.id), eq(returnClaims.status, "PENDING")))
      .returning({ id: returnClaims.id });
    if (!updated) return false;
    await logAudit(
      {
        companyId: actor.company.id,
        userId: actor.id,
        action: "RETURN_CLAIM_REJECTED",
        entityName: "settlements",
        entityId: settlement.id,
        newValues: { amount: claim.amount, returnedOn: claim.returnedOn, reason: parsed.data.reason },
        ipAddress: ip,
      },
      tx,
    );
    return true;
  });
  if (!rejected) return DECIDED;

  const recipient = await getActiveRecipient(actor.company.id, settlement.recipientId);
  if (recipient && settlement.number) {
    const summary = { id: settlement.id, number: settlement.number, advanceNumber: settlement.advanceNumber };
    const details = { amount: claim.amount, reason: parsed.data.reason };
    after(() => notifyReturnClaimRejected(summary, recipient, details));
  }
  revalidateClaims();
  return { success: true, data: undefined };
}
