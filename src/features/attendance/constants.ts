// Konstanta fitur absensi (BUSINESS-FLOW §18). Tanpa `server-only`: dipakai
// juga oleh Client Component (form, label status).

export const ATTENDANCE_TIMEZONES = [
  {
    value: "Asia/Jakarta",
    label: "WIB",
    description: "WIB (Jawa, Sumatra, Kalimantan Barat & Tengah)",
  },
  {
    value: "Asia/Makassar",
    label: "WITA",
    description: "WITA (Bali, NTB, NTT, Sulawesi, Kalimantan Timur & Selatan)",
  },
  { value: "Asia/Jayapura", label: "WIT", description: "WIT (Maluku, Papua)" },
] as const;

export type AttendanceTimezone = (typeof ATTENDANCE_TIMEZONES)[number]["value"];

export const TIMEZONE_VALUES = ATTENDANCE_TIMEZONES.map((zone) => zone.value) as [
  AttendanceTimezone,
  ...AttendanceTimezone[],
];

export function timezoneLabel(value: string) {
  return ATTENDANCE_TIMEZONES.find((zone) => zone.value === value)?.label ?? value;
}

// Batas radius lokasi, sama dengan CHECK constraint di database.
export const RADIUS_MIN = 10;
export const RADIUS_MAX = 5000;
// GPS HP di luar ruangan biasanya meleset 5–20 m; radius lebih kecil dari ini
// berisiko menolak karyawan yang benar-benar di lokasi.
export const RADIUS_RECOMMENDED_MIN = 50;
export const RADIUS_DEFAULT = 100;

// Batas baris per impor lokasi (form "tambah banyak" & file .xlsx/.csv).
export const LOCATION_IMPORT_MAX_ROWS = 200;

// Status foto acuan wajah (tabel face_profiles).
export const FACE_STATUSES = ["PENDING", "APPROVED", "REJECTED"] as const;
export type FaceStatus = (typeof FACE_STATUSES)[number];

export const FACE_STATUS_LABELS: Record<FaceStatus, string> = {
  PENDING: "Menunggu persetujuan",
  APPROVED: "Disetujui",
  REJECTED: "Ditolak",
};

// Versi library & model pembuat embedding wajah. Wajib ikut berubah bila versi
// @vladmandic/human di package.json diganti, karena embedding dari versi/model
// berbeda tidak bisa dibandingkan.
export const FACE_MODEL_VERSION = "human-3.3.6/faceres";
// Model faceres menghasilkan 1024 angka per wajah.
export const FACE_EMBEDDING_LENGTH = 1024;
// Foto acuan dikompres di HP (JPEG, sisi terpanjang 640 px).
export const FACE_PHOTO_MAX_BYTES = 1024 * 1024;

// Pernyataan persetujuan pengolahan data wajah & lokasi (UU PDP 27/2022).
// Teks PERSIS ini yang disimpan sebagai bukti (attendance_consents.statement).
// Redaksinya sebaiknya dicek konsultan HR/hukum perusahaan klien.
export function consentStatement(fullName: string, companyName: string) {
  return (
    `Saya, ${fullName}, menyetujui ${companyName} mengolah foto wajah dan lokasi GPS saya melalui ArchiPay ` +
    `untuk keperluan absensi kerja. Foto acuan wajah saya disimpan selama saya aktif sebagai pengguna dan ` +
    `dihapus saat akun saya dinonaktifkan. Foto selfie absensi disimpan sementara sebagai bukti kehadiran, ` +
    `lalu dihapus otomatis setelah masa simpan berakhir. Lokasi hanya diambil saat saya menekan tombol absen.`
  );
}

// ---------------------------------------------------------------------------
// Cuti & izin (BUSINESS-FLOW §19)
// ---------------------------------------------------------------------------

export const LEAVE_KINDS = ["FULL_DAY", "LATE_ARRIVAL", "EARLY_LEAVE"] as const;
export type LeaveKind = (typeof LEAVE_KINDS)[number];
export const LEAVE_KIND_LABELS: Record<LeaveKind, string> = {
  FULL_DAY: "Seharian",
  LATE_ARRIVAL: "Datang terlambat (per jam)",
  EARLY_LEAVE: "Pulang cepat (per jam)",
};

export const LEAVE_ATTACHMENTS = ["NONE", "OPTIONAL", "REQUIRED"] as const;
export type LeaveAttachment = (typeof LEAVE_ATTACHMENTS)[number];
export const LEAVE_ATTACHMENT_LABELS: Record<LeaveAttachment, string> = {
  NONE: "Tanpa lampiran",
  OPTIONAL: "Lampiran opsional",
  REQUIRED: "Lampiran wajib",
};

export const LEAVE_STATUSES = ["PENDING", "APPROVED", "REJECTED", "CANCELLED"] as const;
export type LeaveStatus = (typeof LEAVE_STATUSES)[number];
export const LEAVE_STATUS_LABELS: Record<LeaveStatus, string> = {
  PENDING: "Menunggu persetujuan",
  APPROVED: "Disetujui",
  REJECTED: "Ditolak",
  CANCELLED: "Dibatalkan",
};

// Lampiran cuti (surat dokter, dll): foto atau PDF, maks. 4 MB.
export const LEAVE_ATTACHMENT_MAX_BYTES = 4 * 1024 * 1024;

// Jenis bawaan setiap company baru. Sama dengan isian manual di migration
// 0010_leave_requests.sql (untuk company yang sudah ada).
export const DEFAULT_LEAVE_TYPES: {
  name: string;
  kind: LeaveKind;
  isPaid: boolean;
  usesQuota: boolean;
  attachment: LeaveAttachment;
  backdateDays: number;
}[] = [
  { name: "Cuti tahunan", kind: "FULL_DAY", isPaid: true, usesQuota: true, attachment: "NONE", backdateDays: 0 },
  { name: "Sakit", kind: "FULL_DAY", isPaid: true, usesQuota: false, attachment: "OPTIONAL", backdateDays: 3 },
  {
    name: "Izin (keperluan pribadi)",
    kind: "FULL_DAY",
    isPaid: true,
    usesQuota: false,
    attachment: "NONE",
    backdateDays: 3,
  },
  {
    name: "Izin tidak dibayar",
    kind: "FULL_DAY",
    isPaid: false,
    usesQuota: false,
    attachment: "NONE",
    backdateDays: 0,
  },
  {
    name: "Cuti khusus (menikah, melahirkan, duka)",
    kind: "FULL_DAY",
    isPaid: true,
    usesQuota: false,
    attachment: "OPTIONAL",
    backdateDays: 3,
  },
  {
    name: "Izin datang terlambat",
    kind: "LATE_ARRIVAL",
    isPaid: true,
    usesQuota: false,
    attachment: "NONE",
    backdateDays: 0,
  },
  {
    name: "Izin pulang cepat",
    kind: "EARLY_LEAVE",
    isPaid: true,
    usesQuota: false,
    attachment: "NONE",
    backdateDays: 0,
  },
];
