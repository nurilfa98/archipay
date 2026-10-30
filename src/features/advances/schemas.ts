// Skema validasi form uang muka & filter daftar uang muka.
//
// Referensi: https://zod.dev/api#transforms

import { z } from "zod";
import {
  ADVANCE_STATUS,
  DISBURSEMENT_METHODS,
  MAX_ADVANCE_AMOUNT,
  MIN_ADVANCE_AMOUNT,
  type AdvanceStatus,
} from "./constants";

export const advanceIdSchema = z.string().min(1).max(36);

// Input "500.000" atau "Rp 500.000" → 500000.
const amount = z
  .string()
  .transform((value) => value.replace(/\D/g, ""))
  .pipe(z.string().min(1, "Isi nominal uang muka").max(13, "Nominal terlalu besar"))
  .transform(Number)
  .pipe(
    z
      .number()
      .int()
      .min(MIN_ADVANCE_AMOUNT, "Nominal minimal Rp1.000")
      .max(MAX_ADVANCE_AMOUNT, "Nominal maksimal Rp1.000.000.000"),
  );

export const createAdvanceSchema = z.object({
  projectId: z.string().min(1, "Pilih project dulu di halaman Uang Muka").max(36),
  recipientId: z.string().min(1, "Pilih karyawan penerima").max(36),
  amount,
  purpose: z
    .string()
    .trim()
    .min(3, "Tuliskan keperluan, minimal 3 karakter")
    .max(500, "Keperluan maksimal 500 karakter"),
  disbursementMethod: z.enum(DISBURSEMENT_METHODS, "Pilih metode pencairan"),
  transferReference: z
    .string()
    .trim()
    .max(100, "Nomor referensi maksimal 100 karakter")
    .transform((value) => value || null),
});

export const transferReferenceSchema = createAdvanceSchema.shape.transferReference;

// Alasan penolakan, pembatalan, dan laporan tidak sesuai.
export const reasonSchema = z
  .string()
  .trim()
  .min(5, "Tuliskan alasan, minimal 5 karakter")
  .max(500, "Alasan maksimal 500 karakter");

// ---------------------------------------------------------------------------
// Filter daftar uang muka dari URL: /advances?year=2026&month=10&status=APPROVED
// ---------------------------------------------------------------------------

export type AdvanceFilters = {
  year?: number;
  month?: number;
  status?: AdvanceStatus;
};

const filterYear = z.coerce.number().int().min(2000).max(2100);
const filterMonth = z.coerce.number().int().min(1).max(12);
const filterStatus = z.enum(ADVANCE_STATUS);

// Nilai yang tidak valid (diketik manual di URL) diabaikan, bukan error.
// Bulan hanya berlaku bila tahun juga dipilih.
export function parseAdvanceFilters(params: Record<string, string | string[] | undefined>): AdvanceFilters {
  const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);
  const year = filterYear.safeParse(first(params.year)).data;
  const month = year ? filterMonth.safeParse(first(params.month)).data : undefined;
  const status = filterStatus.safeParse(first(params.status)).data;
  return { year, month, status };
}
