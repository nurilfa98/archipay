// Pencatatan penyelesaian saldo setelah verifikasi, dipakai bersama oleh
// Server Action pengembalian/penggantian (settlements/actions.ts) dan potong
// gaji (payroll/actions.ts). BUKAN Server Action (tanpa "use server"), jadi
// tidak bisa dipanggil langsung dari browser.
//
//   RETURN / PAYROLL_DEDUCTION : saldo > 0 berkurang (karyawan → kantor)
//   REIMBURSEMENT              : saldo < 0 bertambah (kantor → karyawan)
//
// Boleh dicicil. Begitu saldo tepat 0, status uang muka menjadi CLOSED.
// Nominal tidak boleh melebihi sisa, sehingga saldo tidak pernah berbalik tanda.

import "server-only";
import { eq, sql } from "drizzle-orm";
import { logAudit, type AuditAction } from "@/lib/audit";
import type { CompanyUser } from "@/lib/auth/dal";
import { db } from "@/lib/db";
import { advanceLedgerEntries, advanceRequests } from "@/lib/db/schema";
import { getClientIp } from "@/lib/request";
import type { LedgerEntryType } from "./constants";

type BalanceEntryType = Extract<LedgerEntryType, "RETURN" | "PAYROLL_DEDUCTION" | "REIMBURSEMENT">;

export type BalanceEntryResult =
  | { ok: true; amount: number; remaining: number; closed: boolean }
  | { ok: false; reason: "STALE" }
  | { ok: false; reason: "EXCEEDS"; outstanding: number };

export async function postBalanceEntry(input: {
  actor: CompanyUser;
  advanceId: string;
  settlementId: string;
  type: BalanceEntryType;
  amount: number; // selalu positif; tandanya ditentukan dari `type`
  method: string;
  reference: string | null;
  payrollPeriod?: string | null;
  note: string | null;
  audit: AuditAction;
}): Promise<BalanceEntryResult> {
  const expectedStatus = input.type === "REIMBURSEMENT" ? "REIMBURSE_PENDING" : "RETURN_PENDING";
  const ip = await getClientIp();

  return db.transaction(async (tx) => {
    // Kunci baris uang muka: dua pencatatan bersamaan tidak bisa melebihi sisa.
    const [locked] = await tx
      .select({ status: advanceRequests.status })
      .from(advanceRequests)
      .where(eq(advanceRequests.id, input.advanceId))
      .for("update");
    if (locked?.status !== expectedStatus) return { ok: false, reason: "STALE" } as const;

    const [{ balance }] = await tx
      .select({ balance: sql`coalesce(sum(${advanceLedgerEntries.amount}), 0)`.mapWith(Number) })
      .from(advanceLedgerEntries)
      .where(eq(advanceLedgerEntries.advanceId, input.advanceId));
    const outstanding = Math.abs(balance);
    if (input.amount > outstanding) return { ok: false, reason: "EXCEEDS", outstanding } as const;

    const signed = input.type === "REIMBURSEMENT" ? input.amount : -input.amount;
    await tx.insert(advanceLedgerEntries).values({
      companyId: input.actor.company.id,
      advanceId: input.advanceId,
      type: input.type,
      amount: signed,
      method: input.method,
      reference: input.reference,
      payrollPeriod: input.payrollPeriod ?? null,
      note: input.note,
      createdById: input.actor.id,
    });

    const remaining = outstanding - input.amount;
    if (remaining === 0) {
      await tx.update(advanceRequests).set({ status: "CLOSED" }).where(eq(advanceRequests.id, input.advanceId));
    }

    await logAudit(
      {
        companyId: input.actor.company.id,
        userId: input.actor.id,
        action: input.audit,
        entityName: "settlements",
        entityId: input.settlementId,
        newValues: {
          type: input.type,
          amount: input.amount,
          method: input.method,
          reference: input.reference,
          payrollPeriod: input.payrollPeriod ?? null,
          remaining,
          status: remaining === 0 ? "CLOSED" : expectedStatus,
        },
        ipAddress: ip,
      },
      tx,
    );
    return { ok: true, amount: input.amount, remaining, closed: remaining === 0 } as const;
  });
}
