// Skema validasi potong gaji & filter riwayat dari URL.

import { z } from "zod";
import { MAX_ADVANCE_AMOUNT } from "@/features/advances/constants";

// "80.000" → 80000
const amount = z
  .string()
  .transform((value) => value.replace(/\D/g, ""))
  .pipe(z.string().min(1, "Isi nominal").max(13, "Nominal terlalu besar"))
  .transform(Number)
  .pipe(z.number().int().min(1, "Nominal minimal Rp1").max(MAX_ADVANCE_AMOUNT, "Nominal terlalu besar"));

export const payrollDeductionSchema = z.object({
  amount,
  // Dari <input type="month">: "2026-11".
  period: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Pilih periode gaji"),
});

export type PayrollFilters = { year?: number; month?: number };

const filterYear = z.coerce.number().int().min(2000).max(2100);
const filterMonth = z.coerce.number().int().min(1).max(12);

// /payroll-deductions?year=2026&month=11 (periode gaji). Nilai tidak valid diabaikan.
export function parsePayrollFilters(params: Record<string, string | string[] | undefined>): PayrollFilters {
  const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);
  const year = filterYear.safeParse(first(params.year)).data;
  const month = year ? filterMonth.safeParse(first(params.month)).data : undefined;
  return { year, month };
}
