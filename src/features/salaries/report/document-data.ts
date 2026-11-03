// Menyiapkan data dokumen Penggajian (PDF slip/rekap & Excel) dari slip di
// database, dipakai route /api/payroll/[period]/export dan /api/payslips/[id].

import "server-only";
import { eq } from "drizzle-orm";
import { periodLabel } from "@/features/attendance/review-data";
import { formatAccountNumber } from "@/lib/bank";
import { formatDateOnly, formatDateTime } from "@/lib/dates";
import { formatRupiah } from "@/lib/format";
import { db } from "@/lib/db";
import { companies } from "@/lib/db/schema";
import type { Payslip } from "../queries";
import type { PayrollDocMeta, PayslipDoc } from "./payslip-documents";

export function bankText(slip: Pick<Payslip, "bankName" | "bankAccountNumber" | "fullName">) {
  if (!slip.bankName || !slip.bankAccountNumber) return "Belum diisi";
  return `${slip.bankName} ${formatAccountNumber(slip.bankName, slip.bankAccountNumber)} a.n. ${slip.fullName}`;
}

export function daysText(slip: Payslip) {
  return [
    `${slip.workingDays} hari kerja`,
    slip.presentDays != null ? `hadir ${slip.presentDays}` : null,
    slip.absentDays != null ? `tidak hadir ${slip.absentDays}` : null,
    slip.unpaidLeaveDays ? `cuti/izin tidak dibayar ${slip.unpaidLeaveDays}` : null,
    slip.dailyRate != null ? `tarif harian ${formatRupiah(slip.dailyRate)}` : null,
  ]
    .filter(Boolean)
    .join(" | ");
}

export function toPayslipDoc(slip: Payslip): PayslipDoc {
  return {
    fullName: slip.fullName,
    bankText: bankText(slip),
    daysText: daysText(slip),
    earnings: slip.lines.filter((line) => line.type === "EARNING").map(({ label, amount }) => ({ label, amount })),
    deductions: slip.lines.filter((line) => line.type === "DEDUCTION").map(({ label, amount }) => ({ label, amount })),
    totalEarnings: slip.totalEarnings,
    totalDeductions: slip.totalDeductions,
    netPay: slip.netPay,
  };
}

export async function documentMeta(
  companyId: string,
  run: { period: string; payDate: string | null },
): Promise<PayrollDocMeta> {
  const [company] = await db
    .select({ name: companies.name, address: companies.address })
    .from(companies)
    .where(eq(companies.id, companyId))
    .limit(1);
  return {
    companyName: company?.name ?? "",
    companyAddress: company?.address ?? null,
    periodLabel: periodLabel(run.period),
    payDateText: run.payDate ? formatDateOnly(run.payDate) : "-",
    generatedAt: formatDateTime(new Date()),
  };
}
