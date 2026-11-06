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

// Alasan penolakan foto acuan yang dipilih Owner/Admin HR (dropdown), ditambah
// catatan opsional (wajib bila "Lainnya"). `hint` = saran perbaikan untuk karyawan.
export const FACE_REJECT_REASONS = [
  { code: "NOT_OWNER", label: "Bukan wajah pemilik akun", hint: "Gunakan foto wajah Anda sendiri, tanpa orang lain di dalam bingkai." },
  { code: "UNCLEAR", label: "Wajah kurang jelas atau buram", hint: "Pegang HP dengan stabil dan hadapkan wajah lurus ke kamera." },
  { code: "DARK", label: "Terlalu gelap atau silau", hint: "Cari tempat dengan cahaya merata, hindari cahaya kuat dari belakang." },
  { code: "COVERED", label: "Wajah tertutup", hint: "Lepas masker, kacamata hitam, atau topi yang menutupi wajah." },
  { code: "OTHER", label: "Lainnya", hint: "Ambil ulang foto dengan wajah terlihat jelas." },
] as const;
export type FaceRejectCode = (typeof FACE_REJECT_REASONS)[number]["code"];

export function faceRejectReason(code: string | null) {
  return FACE_REJECT_REASONS.find((item) => item.code === code) ?? null;
}

// Teks lengkap yang disimpan & ditampilkan: "Label" atau "Label: catatan".
export function composeFaceRejectText(code: FaceRejectCode, note: string) {
  const label = faceRejectReason(code)!.label;
  return note ? `${label}: ${note}` : label;
}

// Memecah teks tersimpan menjadi judul dan catatan untuk kartu karyawan.
// Penolakan lama (tanpa kode) seluruhnya dianggap catatan.
export function splitFaceRejection(code: string | null, text: string | null) {
  const reason = faceRejectReason(code);
  if (!reason) return { title: "Foto ditolak", note: text, hint: null as string | null };
  const note = text && text.startsWith(`${reason.label}: `) ? text.slice(reason.label.length + 2) : null;
  return { title: reason.label, note, hint: reason.hint };
}

// Foto yang ditolak: bila karyawan masih punya foto acuan yang disetujui, kartu
// penolakan tampil FACE_REJECT_NOTICE_DAYS hari lalu dihapus otomatis (tidak
// menghalangi absen). Tanpa foto acuan, kartu tetap tampil sampai ia mengambil
// ulang, tetapi FILE fotonya dihapus setelah FACE_REJECT_PHOTO_DAYS hari.
export const FACE_REJECT_NOTICE_DAYS = 3;
export const FACE_REJECT_PHOTO_DAYS = 30;

// Foto acuan yang sudah disetujui hanya boleh diganti sekali dalam
// FACE_CHANGE_INTERVAL_DAYS hari (dihitung sejak foto itu disetujui), agar
// karyawan tidak terus-menerus meminta ganti foto. Pengajuan yang sedang
// berjalan (menunggu / baru ditolak) boleh diambil ulang kapan saja.
export const FACE_CHANGE_INTERVAL_DAYS = 7;

const DAY_MS = 24 * 60 * 60 * 1000;

type FaceTimes = { status: string; createdAt: Date; reviewedAt: Date | null };

// Kartu "Foto yang diajukan" tampil: foto menunggu persetujuan; ditolak dan
// belum punya foto acuan (sampai ambil ulang); atau ditolak tetapi masih punya
// foto acuan, hanya FACE_REJECT_NOTICE_DAYS hari.
export function showFaceSubmission(approved: FaceTimes | null, latest: FaceTimes | null, now: Date) {
  if (!latest) return false;
  if (latest.status === "PENDING" || !approved) return true;
  return !!latest.reviewedAt && now.getTime() - latest.reviewedAt.getTime() < FACE_REJECT_NOTICE_DAYS * DAY_MS;
}

// Kapan foto acuan boleh diganti lagi; null bila boleh sekarang.
export function faceChangeLockedUntil(approved: FaceTimes | null, latest: FaceTimes | null, now: Date) {
  if (!approved || showFaceSubmission(approved, latest, now)) return null;
  const until = new Date((approved.reviewedAt ?? approved.createdAt).getTime() + FACE_CHANGE_INTERVAL_DAYS * DAY_MS);
  return until.getTime() > now.getTime() ? until : null;
}

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
    `dihapus saat akun saya dinonaktifkan. Foto selfie saat absen hanya dipakai untuk dicocokkan dengan foto ` +
    `acuan dan tidak disimpan; yang disimpan hanya waktu, lokasi, dan hasil kecocokan wajah. Lokasi hanya ` +
    `diambil saat saya menekan tombol absen.`
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
