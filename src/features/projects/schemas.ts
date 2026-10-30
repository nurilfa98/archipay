// Skema validasi form project dan parameter ?project= di URL.
//
// Referensi: https://zod.dev/api#transforms

import { z } from "zod";
import { MAX_CONTRACT_DIGITS, PROJECT_ICONS, PROJECT_STATUS } from "./constants";

export const projectIdSchema = z.string().min(1).max(36);

// Input "1.500.000.000" atau "Rp 1.500.000.000" → 1500000000. Kosong = belum diisi.
const contractValue = z
  .string()
  .transform((value) => value.replace(/\D/g, ""))
  .pipe(z.string().max(MAX_CONTRACT_DIGITS, "Nilai kontrak terlalu besar"))
  .transform((value) => (value ? Number(value) : null))
  .pipe(z.number().int().min(1, "Nilai kontrak minimal Rp1").nullable());

export const projectSchema = z.object({
  name: z.string().trim().min(3, "Nama project minimal 3 karakter").max(120, "Nama project maksimal 120 karakter"),
  client: z
    .string()
    .trim()
    .max(120, "Nama klien maksimal 120 karakter")
    .transform((value) => value || null),
  contractValue,
  icon: z.enum(PROJECT_ICONS, "Pilih ikon project"),
});

export const projectStatusSchema = z.enum(PROJECT_STATUS);

// ?project= dari URL. Mengembalikan teks apa adanya (maksimal 36 karakter);
// project-nya sendiri dicari di database oleh resolveProjectScope().
export function readProjectParam(params: Record<string, string | string[] | undefined>): string | undefined {
  const value = Array.isArray(params.project) ? params.project[0] : params.project;
  return value && value.length <= 36 ? value : undefined;
}
