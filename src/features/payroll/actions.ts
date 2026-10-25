// Server Action potong gaji: tandai sisa uang muka yang lewat batas
// pengembalian sebagai "sudah dipotong dari gaji" periode tertentu.
//
// Boleh sebagian (dicicil), misalnya agar total potongan per periode tidak
// melebihi 50% upah (PP 36/2021). ArchiPay tidak menyimpan data gaji, jadi
// batas 50% itu dicek oleh bagian penggajian.
//
// Pencatatannya memakai postBalanceEntry() yang sama dengan pengembalian
// tunai/transfer: ledger PAYROLL_DEDUCTION, saldo 0 → uang muka selesai.

"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { z } from "zod";
import { getActiveRecipient } from "@/features/advances/queries";
import { postBalanceEntry } from "@/features/settlements/ledger";
import { notifyBalanceRecorded } from "@/features/settlements/notifications";
import { getSettlementDetail } from "@/features/settlements/queries";
import { settlementIdSchema } from "@/features/settlements/schemas";
import { verifySession } from "@/lib/auth/dal";
import { can } from "@/lib/auth/permissions";
import { formatRupiah } from "@/lib/format";
import type { ActionResult } from "@/types/action-result";
import { payrollDeductionSchema } from "./schemas";

const FORBIDDEN = { success: false, message: "Anda tidak memiliki akses untuk tindakan ini." } as const;
const NOT_ELIGIBLE = {
  success: false,
  message: "Sisa dana ini belum lewat batas pengembalian atau sudah lunas. Muat ulang halaman.",
} as const;

export async function recordPayrollDeduction(settlementId: string, formData: FormData): Promise<ActionResult> {
  const actor = await verifySession();
  if (!can(actor, "payroll:manage")) return FORBIDDEN;

  const id = settlementIdSchema.safeParse(settlementId);
  if (!id.success) return NOT_ELIGIBLE;
  const settlement = await getSettlementDetail(id.data);
  if (!settlement || settlement.advanceStatus !== "RETURN_PENDING" || !settlement.returnOverdue) return NOT_ELIGIBLE;
  // Pemisahan tugas: tidak bisa menandai potongan gaji untuk diri sendiri.
  if (settlement.recipientId === actor.id) return FORBIDDEN;

  const parsed = payrollDeductionSchema.safeParse({
    amount: formData.get("amount") ?? "",
    period: formData.get("period") ?? "",
  });
  if (!parsed.success) {
    return {
      success: false,
      message: "Periksa kembali isian Anda.",
      fieldErrors: z.flattenError(parsed.error).fieldErrors as Record<string, string[]>,
    };
  }

  const result = await postBalanceEntry({
    actor,
    advanceId: settlement.advanceId,
    settlementId: settlement.id,
    type: "PAYROLL_DEDUCTION",
    amount: parsed.data.amount,
    method: "PAYROLL",
    reference: null,
    payrollPeriod: parsed.data.period,
    note: `Potong gaji periode ${parsed.data.period}`,
    audit: "PAYROLL_DEDUCTION_RECORDED",
  });
  if (!result.ok) {
    if (result.reason === "EXCEEDS") {
      return {
        success: false,
        message: "Periksa kembali isian Anda.",
        fieldErrors: { amount: [`Nominal melebihi sisa ${formatRupiah(result.outstanding)}`] },
      };
    }
    return NOT_ELIGIBLE;
  }

  const recipient = await getActiveRecipient(settlement.recipientId);
  if (recipient && settlement.number) {
    const summary = { id: settlement.id, number: settlement.number, advanceNumber: settlement.advanceNumber };
    after(() =>
      notifyBalanceRecorded(summary, recipient, {
        type: "PAYROLL_DEDUCTION",
        ...result,
        payrollPeriod: parsed.data.period,
      }),
    );
  }

  revalidatePath("/payroll-deductions");
  revalidatePath("/settlements", "layout");
  revalidatePath("/advances", "layout");
  revalidatePath("/");
  return { success: true, data: undefined };
}
