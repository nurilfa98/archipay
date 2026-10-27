// Skema validasi pertanggungjawaban: isian nota, hasil verifikasi, dan
// filter daftar dari URL.
//
// Referensi: https://zod.dev/api#transforms

import { z } from "zod";
import { MAX_ADVANCE_AMOUNT } from "@/features/advances/constants";
import { SETTLE_METHODS, SETTLEMENT_STATUS, type SettlementStatus } from "./constants";

export const settlementIdSchema = z.string().min(1).max(36);

// "2026-10-24" dari <input type="date">.
const receiptDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Isi tanggal nota")
  .refine((value) => !Number.isNaN(Date.parse(`${value}T00:00:00Z`)), "Tanggal nota tidak valid");

// Input "50.000" atau "Rp 50.000" → 50000.
const amount = z
  .string()
  .transform((value) => value.replace(/\D/g, ""))
  .pipe(z.string().min(1, "Isi nominal").max(13, "Nominal terlalu besar"))
  .transform(Number)
  .pipe(z.number().int().min(1, "Nominal minimal Rp1").max(MAX_ADVANCE_AMOUNT, "Nominal terlalu besar"));

export const settlementItemSchema = z
  .object({
    receiptDate,
    categoryId: z.string().min(1, "Pilih kategori").max(36),
    description: z
      .string()
      .trim()
      .min(3, "Keterangan minimal 3 karakter")
      .max(200, "Keterangan maksimal 200 karakter"),
    amount,
    // Checkbox "Tanpa nota": tercentang = "on", tidak = null.
    noReceipt: z.literal("on").nullable().transform((value) => value === "on"),
    noReceiptReason: z
      .string()
      .trim()
      .max(200, "Alasan maksimal 200 karakter")
      .transform((value) => value || null),
  })
  .refine((item) => !item.noReceipt || (item.noReceiptReason?.length ?? 0) >= 5, {
    path: ["noReceiptReason"],
    message: "Jelaskan kenapa tidak ada nota (minimal 5 karakter)",
  });

// Alasan keterlambatan wajib diisi bila pertanggungjawaban dikirim melewati batas unggah nota.
export const lateReasonSchema = z
  .string()
  .trim()
  .min(5, "Tuliskan alasan keterlambatan, minimal 5 karakter")
  .max(500, "Alasan maksimal 500 karakter");

export const revisionNoteSchema = z
  .string()
  .trim()
  .min(5, "Catatan minimal 5 karakter")
  .max(500, "Catatan maksimal 500 karakter");

// Keputusan verifikasi per nota. Setiap nota di laporan WAJIB diputuskan.
export const verificationSchema = z.array(
  z
    .object({
      itemId: z.string().min(1).max(36),
      approved: z.boolean(),
      reason: z.string().trim().max(500).optional(),
    })
    .refine((decision) => decision.approved || (decision.reason?.length ?? 0) >= 5, {
      path: ["reason"],
      message: "Alasan penolakan minimal 5 karakter",
    }),
);

export type VerificationDecision = z.infer<typeof verificationSchema>[number];

// Pengembalian sisa dana / pembayaran penggantian (OWNER/FINANCE).
export const balancePaymentSchema = z.object({
  amount,
  method: z.enum(SETTLE_METHODS, "Pilih cara pembayaran"),
  reference: z
    .string()
    .trim()
    .max(100, "Referensi maksimal 100 karakter")
    .transform((value) => value || null),
  note: z
    .string()
    .trim()
    .max(300, "Catatan maksimal 300 karakter")
    .transform((value) => value || null),
});

// ---------------------------------------------------------------------------
// Filter daftar dari URL: /settlements?year=2026&month=10&status=SUBMITTED
// ---------------------------------------------------------------------------

export type SettlementFilters = {
  year?: number;
  month?: number;
  status?: SettlementStatus;
};

const filterYear = z.coerce.number().int().min(2000).max(2100);
const filterMonth = z.coerce.number().int().min(1).max(12);
const filterStatus = z.enum(SETTLEMENT_STATUS);

// Nilai yang tidak valid (diketik manual di URL) diabaikan, bukan error.
export function parseSettlementFilters(
  params: Record<string, string | string[] | undefined>,
): SettlementFilters {
  const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);
  const year = filterYear.safeParse(first(params.year)).data;
  const month = year ? filterMonth.safeParse(first(params.month)).data : undefined;
  const status = filterStatus.safeParse(first(params.status)).data;
  return { year, month, status };
}
