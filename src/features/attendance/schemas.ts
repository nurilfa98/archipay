// Skema validasi fitur absensi (BUSINESS-FLOW §18). Dipakai Server Action;
// batasnya sama dengan CHECK constraint di database.

import { z } from "zod";
import {
  FACE_EMBEDDING_LENGTH,
  FACE_PHOTO_MAX_BYTES,
  LOCATION_IMPORT_MAX_ROWS,
  RADIUS_MAX,
  RADIUS_MIN,
  TIMEZONE_VALUES,
} from "./constants";
import { parseCoordinates } from "./geo";
import { ALL_WORK_DAYS, parseTime } from "./schedule";

export const idSchema = z.string().min(1).max(36);

const time = (label: string) =>
  z
    .string(`Isi ${label.toLowerCase()}`)
    .trim()
    .min(1, `Isi ${label.toLowerCase()}`)
    .transform((value, ctx) => {
      const minutes = parseTime(value);
      if (minutes === null) {
        ctx.addIssue({ code: "custom", message: `${label} tidak valid` });
        return z.NEVER;
      }
      return minutes;
    });

// ---------------------------------------------------------------------------
// Pengaturan absensi (Owner)
// ---------------------------------------------------------------------------

export const attendanceSettingsSchema = z
  .object({
    workStartMinute: time("Jam masuk"),
    workEndMinute: time("Jam pulang"),
    lateToleranceMinutes: z.coerce
      .number("Toleransi harus berupa angka")
      .int("Toleransi harus bilangan bulat")
      .min(0, "Toleransi minimal 0 menit")
      .max(180, "Toleransi maksimal 180 menit"),
    // "25.000" → 25000. 0 = belum ada denda.
    latePenaltyAmount: z
      .string()
      .transform((value) => value.replace(/\D/g, ""))
      .pipe(z.string().min(1, "Isi denda keterlambatan").max(9, "Nominal terlalu besar"))
      .transform(Number)
      .pipe(z.number().int().min(0).max(10_000_000, "Denda maksimal Rp10.000.000")),
    workDays: z.coerce
      .number()
      .int()
      .min(1, "Pilih minimal satu hari kerja")
      .max(ALL_WORK_DAYS, "Hari kerja tidak valid"),
  })
  .refine((value) => value.workStartMinute < value.workEndMinute, {
    path: ["workEndMinute"],
    message: "Jam pulang harus setelah jam masuk (shift malam belum didukung)",
  });

export const holidaySchema = z.object({
  date: z.iso.date("Tanggal tidak valid"),
  name: z
    .string()
    .trim()
    .min(2, "Nama hari libur minimal 2 karakter")
    .max(100, "Nama hari libur maksimal 100 karakter"),
});

// ---------------------------------------------------------------------------
// Lokasi absensi (Owner & Admin HR)
// ---------------------------------------------------------------------------

const locationName = z
  .string("Isi nama lokasi")
  .trim()
  .min(2, "Nama lokasi minimal 2 karakter")
  .max(100, "Nama lokasi maksimal 100 karakter");

const coordinates = z
  .string("Isi koordinat")
  .trim()
  .min(1, "Pilih titik di peta atau isi koordinat")
  .transform((value, ctx) => {
    const point = parseCoordinates(value);
    if (!point) {
      ctx.addIssue({
        code: "custom",
        message: "Koordinat tidak valid. Contoh: -6.27181, 106.71335",
      });
      return z.NEVER;
    }
    return point;
  });

const radius = z.coerce
  .number("Radius harus berupa angka")
  .int("Radius harus bilangan bulat")
  .min(RADIUS_MIN, `Radius minimal ${RADIUS_MIN} m`)
  .max(RADIUS_MAX, `Radius maksimal ${RADIUS_MAX.toLocaleString("id-ID")} m`);

const timezone = z.enum(TIMEZONE_VALUES, "Pilih zona waktu");

// Jam khusus lokasi: keduanya kosong (ikut jam company) atau keduanya diisi.
const optionalTime = (label: string) =>
  z
    .string()
    .trim()
    .optional()
    .transform((value, ctx) => {
      if (!value) return null;
      const minutes = parseTime(value);
      if (minutes === null) {
        ctx.addIssue({ code: "custom", message: `${label} tidak valid` });
        return z.NEVER;
      }
      return minutes;
    });

function refineHours<T extends { workStartMinute: number | null; workEndMinute: number | null }>(
  value: T,
  ctx: z.RefinementCtx,
) {
  const { workStartMinute: start, workEndMinute: end } = value;
  if ((start === null) !== (end === null)) {
    ctx.addIssue({
      code: "custom",
      path: [start === null ? "workStartMinute" : "workEndMinute"],
      message: "Isi jam masuk dan jam pulang, atau kosongkan keduanya",
    });
  } else if (start !== null && end !== null && start >= end) {
    ctx.addIssue({
      code: "custom",
      path: ["workEndMinute"],
      message: "Jam pulang harus setelah jam masuk",
    });
  }
}

export const locationSchema = z
  .object({
    name: locationName,
    projectId: z
      .string()
      .max(36)
      .optional()
      .transform((value) => value || null),
    coordinates,
    radiusMeters: radius,
    timezone,
    workStartMinute: optionalTime("Jam masuk"),
    workEndMinute: optionalTime("Jam pulang"),
  })
  .superRefine(refineHours);

export type LocationInput = z.infer<typeof locationSchema>;

// Satu baris impor / "tambah banyak". Project diisi NAMA (dari file .xlsx),
// dicocokkan ke project company di server.
export const importLocationRowSchema = z
  .object({
    name: locationName,
    coordinates,
    radiusMeters: radius,
    timezone,
    projectName: z
      .string()
      .trim()
      .max(120)
      .optional()
      .transform((value) => value || null),
    workStartMinute: optionalTime("Jam masuk"),
    workEndMinute: optionalTime("Jam pulang"),
  })
  .superRefine(refineHours);

export type ImportLocationRow = z.input<typeof importLocationRowSchema>;

export const importLocationsSchema = z
  .array(z.unknown())
  .min(1, "Belum ada lokasi untuk disimpan")
  .max(LOCATION_IMPORT_MAX_ROWS, `Maksimal ${LOCATION_IMPORT_MAX_ROWS} lokasi sekali simpan`);

export const placeQuerySchema = z.string().trim().min(3, "Ketik minimal 3 huruf").max(200);

// ---------------------------------------------------------------------------
// Foto acuan wajah
// ---------------------------------------------------------------------------

const facePhoto = z
  .instanceof(File, { message: "Foto wajah belum diambil" })
  .refine((file) => file.size > 0, "Foto wajah belum diambil")
  .refine((file) => file.size <= FACE_PHOTO_MAX_BYTES, "Ukuran foto terlalu besar")
  .refine((file) => file.type === "image/jpeg", "Format foto tidak valid");

const faceEmbedding = z
  .string()
  .max(40_000)
  .transform((value, ctx) => {
    try {
      const parsed: unknown = JSON.parse(value);
      if (
        Array.isArray(parsed) &&
        parsed.length === FACE_EMBEDDING_LENGTH &&
        parsed.every((n) => typeof n === "number" && Number.isFinite(n))
      ) {
        return parsed as number[];
      }
    } catch {
      // ditangani di bawah
    }
    ctx.addIssue({
      code: "custom",
      message: "Data wajah tidak valid. Ambil ulang foto.",
    });
    return z.NEVER;
  });

export const faceSubmissionSchema = z.object({ photo: facePhoto, embedding: faceEmbedding });

export const rejectReasonSchema = z
  .string("Isi alasan penolakan")
  .trim()
  .min(5, "Alasan minimal 5 karakter")
  .max(300, "Alasan maksimal 300 karakter");

// ---------------------------------------------------------------------------
// Absen masuk / pulang (BUSINESS-FLOW §18.5–18.7)
// ---------------------------------------------------------------------------

// Akurasi GPS terburuk yang masih diterima (meter).
export const GPS_ACCURACY_MAX = 100;

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Maksimal ${max} karakter`)
    .optional()
    .transform((value) => value || null);

export const gpsSchema = z.object({
  latitude: z.coerce.number().min(-90).max(90),
  longitude: z.coerce.number().min(-180).max(180),
  accuracy: z.coerce.number().min(0).max(100_000),
});

export const checkSubmissionSchema = gpsSchema.extend({
  mode: z.enum(["in", "out"]),
  locationId: idSchema,
  photo: facePhoto,
  embedding: faceEmbedding,
  lateReason: optionalText(500),
  earlyReason: optionalText(500),
  outsideReason: optionalText(500),
  appealNote: optionalText(1000),
});

// Alasan wajib (pulang cepat, di luar radius): minimal 5 karakter.
export const REASON_MIN = 5;

// ---------------------------------------------------------------------------
// Cuti & izin (BUSINESS-FLOW §19)
// ---------------------------------------------------------------------------

export const leaveRequestSchema = z.object({
  leaveTypeId: idSchema,
  startDate: z.iso.date("Isi tanggal"),
  // Seharian: tanggal selesai (kosong = sama dengan tanggal mulai).
  endDate: z.union([z.iso.date("Tanggal selesai tidak valid"), z.literal("")]).transform((value) => value || null),
  // Izin per jam: "10:00".
  time: z
    .string()
    .trim()
    .transform((value) => (value ? parseTime(value) : null)),
  reason: z
    .string("Isi alasan")
    .trim()
    .min(REASON_MIN, `Alasan minimal ${REASON_MIN} karakter`)
    .max(500, "Alasan maksimal 500 karakter"),
});

export const leaveTypeSchema = z.object({
  name: z.string().trim().min(2, "Nama jenis minimal 2 karakter").max(60, "Nama jenis maksimal 60 karakter"),
  kind: z.enum(["FULL_DAY", "LATE_ARRIVAL", "EARLY_LEAVE"], "Pilih bentuk izin"),
  isPaid: z.boolean(),
  usesQuota: z.boolean(),
  attachment: z.enum(["NONE", "OPTIONAL", "REQUIRED"], "Pilih aturan lampiran"),
  backdateDays: z.coerce
    .number("Batas mundur harus berupa angka")
    .int("Batas mundur harus bilangan bulat")
    .min(0, "Batas mundur minimal 0 hari")
    .max(30, "Batas mundur maksimal 30 hari"),
});

export const leaveSettingsSchema = z.object({
  annualLeaveQuota: z.coerce
    .number("Kuota cuti harus berupa angka")
    .int("Kuota cuti harus bilangan bulat")
    .min(0, "Kuota cuti minimal 0 hari")
    .max(60, "Kuota cuti maksimal 60 hari"),
  leaveDelegationEnabled: z.boolean(),
  leaveDelegationHours: z.coerce
    .number("Waktu tunggu harus berupa angka")
    .int("Waktu tunggu harus bilangan bulat")
    .min(1, "Waktu tunggu minimal 1 jam")
    .max(168, "Waktu tunggu maksimal 168 jam (7 hari)"),
});

// Kuota cuti khusus per karyawan; kosong = ikut kuota company.
export const userQuotaSchema = z
  .string()
  .trim()
  .transform((value, ctx) => {
    if (!value) return null;
    const quota = Number(value);
    if (!Number.isInteger(quota) || quota < 0 || quota > 60) {
      ctx.addIssue({ code: "custom", message: "Kuota 0–60 hari, atau kosongkan untuk ikut kuota company" });
      return z.NEVER;
    }
    return quota;
  });
