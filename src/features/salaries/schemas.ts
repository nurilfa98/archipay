// Skema validasi Penggajian (BUSINESS-FLOW §20): input dari browser wajib
// divalidasi ulang di server.

import { z } from "zod";
import { COMPONENT_TYPES, DAILY_RATE_METHODS, DEDUCTION_BASES, MAX_COMPONENTS, OVERTIME_METHODS } from "./constants";

export const idSchema = z.string().min(1).max(36);
export const periodSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Periode tidak valid");

const MAX_RUPIAH = 99_999_999_999;

// "1.500.000" → 1500000.
const rupiah = (label: string) =>
  z
    .string()
    .transform((value) => value.replace(/\D/g, ""))
    .pipe(z.string().min(1, `Isi ${label.toLowerCase()}`).max(11, `${label} terlalu besar`))
    .transform(Number);

const optionalRupiah = (label: string) =>
  z.string().transform((value, ctx) => {
    const digits = value.replace(/\D/g, "");
    if (!digits) return null;
    if (digits.length > 11) {
      ctx.addIssue({ code: "custom", message: `${label} terlalu besar` });
      return z.NEVER;
    }
    return Number(digits);
  });

const optionalDate = z
  .string()
  .transform((value) => value.trim() || null)
  .pipe(z.iso.date("Tanggal tidak valid").nullable());

const checkbox = z
  .string()
  .nullish()
  .transform((value) => value === "on" || value === "1" || value === "true");

// Pengaturan → Penggajian (Owner).
export const payrollSettingsSchema = z.object({
  absenceDeduction: checkbox,
  dailyRateMethod: z.enum(DAILY_RATE_METHODS, "Pilih cara menghitung tarif per hari"),
  dailyDivisor: z.coerce
    .number("Pembagi harus berupa angka")
    .int("Pembagi harus bilangan bulat")
    .min(1, "Pembagi minimal 1")
    .max(31, "Pembagi maksimal 31"),
  deductionBase: z.enum(DEDUCTION_BASES, "Pilih dasar potongan"),
  overtimeMethod: z.enum(OVERTIME_METHODS, "Pilih cara hitung upah lembur"),
});

export const salaryComponentSchema = z.object({
  type: z.enum(COMPONENT_TYPES),
  name: z.string().trim().min(2, "Nama minimal 2 karakter").max(60, "Nama maksimal 60 karakter"),
  amount: z.number().int().min(1, "Nominal minimal Rp1").max(MAX_RUPIAH, "Nominal terlalu besar"),
  perDay: z.boolean(),
});

// Data gaji satu karyawan. Komponen dikirim sebagai JSON (daftar dinamis).
export const salaryProfileSchema = z
  .object({
    baseSalary: rupiah("Gaji pokok"),
    dailyRate: optionalRupiah("Nominal per hari"),
    overtimeHourlyRate: optionalRupiah("Tarif lembur per jam"),
    startDate: optionalDate,
    endDate: optionalDate,
    absenceExempt: checkbox,
    components: z
      .string()
      .transform((value, ctx) => {
        try {
          return JSON.parse(value || "[]") as unknown;
        } catch {
          ctx.addIssue({ code: "custom", message: "Daftar tunjangan/potongan tidak valid" });
          return z.NEVER;
        }
      })
      .pipe(z.array(salaryComponentSchema).max(MAX_COMPONENTS, `Maksimal ${MAX_COMPONENTS} tunjangan/potongan`)),
  })
  .refine((value) => !value.startDate || !value.endDate || value.endDate >= value.startDate, {
    path: ["endDate"],
    message: "Tanggal berhenti tidak boleh sebelum tanggal mulai",
  })
  .transform((value) => ({
    ...value,
    // Tunjangan per hari hanya untuk tunjangan, bukan potongan.
    components: value.components.map((component) => ({
      ...component,
      perDay: component.type === "ALLOWANCE" && component.perDay,
    })),
  }));

export const createRunSchema = z.object({ period: periodSchema });

export const payDateSchema = z.object({ payDate: z.iso.date("Isi tanggal bayar") });

export const lineAmountSchema = z.object({ amount: rupiah("Nominal").pipe(z.number().max(MAX_RUPIAH)) });

export const manualLineSchema = z.object({
  type: z.enum(["EARNING", "DEDUCTION"], "Pilih pendapatan atau potongan"),
  label: z.string().trim().min(2, "Keterangan minimal 2 karakter").max(150, "Keterangan maksimal 150 karakter"),
  amount: rupiah("Nominal").pipe(z.number().min(1, "Nominal minimal Rp1").max(MAX_RUPIAH)),
});
