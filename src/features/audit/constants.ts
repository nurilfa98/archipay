// Label & pengelompokan aksi audit log untuk halaman /audit.
// Daftar aksinya sendiri (AuditAction) ada di lib/audit.ts; `satisfies`
// memastikan setiap aksi baru wajib diberi label & kategori di sini.

import type { Tone } from "@/components/tone-badge";
import type { AuditAction } from "@/lib/audit";

export const AUDIT_CATEGORIES = [
  "AUTH",
  "USER",
  "PROJECT",
  "ADVANCE",
  "SETTLEMENT",
  "ATTENDANCE",
  "PAYROLL",
  "SETTINGS",
] as const;
export type AuditCategory = (typeof AUDIT_CATEGORIES)[number];

export const AUDIT_CATEGORY_LABELS: Record<AuditCategory, string> = {
  AUTH: "Login & akun",
  USER: "Pengguna",
  PROJECT: "Proyek",
  ADVANCE: "Uang muka",
  SETTLEMENT: "Pertanggungjawaban",
  ATTENDANCE: "Absensi",
  PAYROLL: "Penggajian",
  SETTINGS: "Pengaturan",
};

type ActionInfo = { label: string; category: AuditCategory; tone: Tone };

// tone mengikuti aturan warna ArchiPay (components/tone-badge.tsx):
// success = berhasil, active = berjalan, pending = netral, warning = perlu
// perhatian, danger = ditolak/bermasalah.
export const AUDIT_ACTIONS = {
  LOGIN_SUCCESS: { label: "Login", category: "AUTH", tone: "pending" },
  LOGIN_FAILED: { label: "Login gagal", category: "AUTH", tone: "danger" },
  LOGOUT: { label: "Logout", category: "AUTH", tone: "pending" },
  PASSWORD_CHANGED: { label: "Ganti password", category: "AUTH", tone: "active" },
  USER_CREATED: { label: "Tambah pengguna", category: "USER", tone: "success" },
  USER_UPDATED: { label: "Ubah pengguna", category: "USER", tone: "active" },
  USER_ACTIVATED: { label: "Aktifkan pengguna", category: "USER", tone: "success" },
  USER_DEACTIVATED: { label: "Nonaktifkan pengguna", category: "USER", tone: "danger" },
  USER_PASSWORD_RESET: { label: "Reset password", category: "USER", tone: "warning" },
  PHONE_VERIFIED: { label: "Verifikasi nomor WhatsApp", category: "USER", tone: "success" },
  ADVANCE_PROPOSED: { label: "Usulkan pencairan", category: "ADVANCE", tone: "pending" },
  ADVANCE_REQUESTED: { label: "Ajukan uang muka", category: "ADVANCE", tone: "pending" },
  ADVANCE_APPROVED: { label: "Setujui uang muka", category: "ADVANCE", tone: "success" },
  ADVANCE_REJECTED: { label: "Tolak uang muka", category: "ADVANCE", tone: "danger" },
  ADVANCE_DISBURSED: { label: "Cairkan dana", category: "ADVANCE", tone: "active" },
  ADVANCE_CANCELLED: { label: "Batalkan uang muka", category: "ADVANCE", tone: "danger" },
  ADVANCE_ACKNOWLEDGED: { label: "Konfirmasi terima dana", category: "ADVANCE", tone: "success" },
  ADVANCE_DISPUTED: { label: "Laporkan dana belum diterima", category: "ADVANCE", tone: "warning" },
  ADVANCE_PROJECT_ASSIGNED: { label: "Tetapkan proyek uang muka", category: "ADVANCE", tone: "active" },
  PROJECT_CREATED: { label: "Tambah proyek", category: "PROJECT", tone: "success" },
  PROJECT_UPDATED: { label: "Ubah proyek", category: "PROJECT", tone: "active" },
  SETTLEMENT_ITEM_ADDED: { label: "Tambah nota", category: "SETTLEMENT", tone: "pending" },
  SETTLEMENT_ITEM_REMOVED: { label: "Hapus nota", category: "SETTLEMENT", tone: "warning" },
  SETTLEMENT_SUBMITTED: { label: "Kirim pertanggungjawaban", category: "SETTLEMENT", tone: "active" },
  SETTLEMENT_REVISION_REQUESTED: { label: "Minta perbaikan", category: "SETTLEMENT", tone: "warning" },
  SETTLEMENT_VERIFIED: { label: "Verifikasi pertanggungjawaban", category: "SETTLEMENT", tone: "success" },
  SETTLEMENT_RETURN_RECORDED: { label: "Catat pengembalian", category: "SETTLEMENT", tone: "success" },
  SETTLEMENT_REIMBURSEMENT_RECORDED: { label: "Catat penggantian", category: "SETTLEMENT", tone: "success" },
  PAYROLL_DEDUCTION_RECORDED: { label: "Catat potong gaji", category: "SETTLEMENT", tone: "warning" },
  SETTINGS_UPDATED: { label: "Ubah kebijakan", category: "SETTINGS", tone: "active" },
  EXPENSE_CATEGORY_CREATED: { label: "Tambah kategori biaya", category: "SETTINGS", tone: "success" },
  EXPENSE_CATEGORY_UPDATED: { label: "Ubah kategori biaya", category: "SETTINGS", tone: "active" },
  SUBSCRIPTION_PAYMENT_CLAIMED: { label: "Kirim bukti bayar langganan", category: "SETTINGS", tone: "active" },
  ATTENDANCE_SETTINGS_UPDATED: { label: "Ubah jam kerja & denda", category: "ATTENDANCE", tone: "active" },
  HOLIDAY_CREATED: { label: "Tambah hari libur", category: "ATTENDANCE", tone: "success" },
  HOLIDAY_DELETED: { label: "Hapus hari libur", category: "ATTENDANCE", tone: "danger" },
  ATTENDANCE_LOCATION_CREATED: { label: "Tambah lokasi absensi", category: "ATTENDANCE", tone: "success" },
  ATTENDANCE_LOCATION_UPDATED: { label: "Ubah lokasi absensi", category: "ATTENDANCE", tone: "active" },
  ATTENDANCE_LOCATIONS_IMPORTED: { label: "Impor lokasi absensi", category: "ATTENDANCE", tone: "success" },
  ATTENDANCE_CONSENT_GIVEN: { label: "Setujui pengolahan data wajah & lokasi", category: "ATTENDANCE", tone: "pending" },
  FACE_PROFILE_SUBMITTED: { label: "Kirim foto acuan wajah", category: "ATTENDANCE", tone: "pending" },
  FACE_PROFILE_APPROVED: { label: "Setujui foto acuan wajah", category: "ATTENDANCE", tone: "success" },
  FACE_PROFILE_REJECTED: { label: "Tolak foto acuan wajah", category: "ATTENDANCE", tone: "danger" },
  ATTENDANCE_CHECKED_IN: { label: "Absen masuk", category: "ATTENDANCE", tone: "success" },
  ATTENDANCE_CHECKED_OUT: { label: "Absen pulang", category: "ATTENDANCE", tone: "success" },
  ATTENDANCE_FACE_REJECTED: { label: "Absen ditolak: wajah tidak cocok", category: "ATTENDANCE", tone: "danger" },
  LEAVE_REQUESTED: { label: "Ajukan cuti/izin", category: "ATTENDANCE", tone: "pending" },
  LEAVE_APPROVED: { label: "Setujui cuti/izin", category: "ATTENDANCE", tone: "success" },
  LEAVE_REJECTED: { label: "Tolak cuti/izin", category: "ATTENDANCE", tone: "danger" },
  LEAVE_CANCELLED: { label: "Batalkan cuti/izin", category: "ATTENDANCE", tone: "warning" },
  LEAVE_TYPE_CREATED: { label: "Tambah jenis cuti/izin", category: "ATTENDANCE", tone: "success" },
  LEAVE_TYPE_UPDATED: { label: "Ubah jenis cuti/izin", category: "ATTENDANCE", tone: "active" },
  LEAVE_QUOTA_UPDATED: { label: "Ubah kuota cuti karyawan", category: "ATTENDANCE", tone: "active" },
  PENALTY_WAIVED: { label: "Bebaskan denda keterlambatan", category: "ATTENDANCE", tone: "success" },
  PENALTY_REINSTATED: { label: "Berlakukan lagi denda", category: "ATTENDANCE", tone: "warning" },
  PENALTY_DEDUCTED: { label: "Catat potong gaji denda", category: "ATTENDANCE", tone: "warning" },
  ATTENDANCE_CORRECTED: { label: "Koreksi absen", category: "ATTENDANCE", tone: "active" },
  ATTENDANCE_PERIOD_LOCKED: { label: "Kunci periode absensi", category: "ATTENDANCE", tone: "success" },
  ATTENDANCE_PERIOD_UNLOCKED: { label: "Buka kunci periode absensi", category: "ATTENDANCE", tone: "warning" },
  PAYROLL_SETTINGS_UPDATED: { label: "Ubah pengaturan penggajian", category: "PAYROLL", tone: "active" },
  SALARY_PROFILE_SAVED: { label: "Simpan data gaji", category: "PAYROLL", tone: "active" },
  SALARY_PROFILE_DELETED: { label: "Hapus data gaji", category: "PAYROLL", tone: "warning" },
  PAYROLL_RUN_CREATED: { label: "Buat penggajian", category: "PAYROLL", tone: "pending" },
  PAYROLL_RECALCULATED: { label: "Hitung ulang penggajian", category: "PAYROLL", tone: "active" },
  PAYSLIP_LINE_CHANGED: { label: "Ubah baris slip gaji", category: "PAYROLL", tone: "active" },
  PAYROLL_FINALIZED: { label: "Selesaikan penggajian", category: "PAYROLL", tone: "success" },
  PAYROLL_REOPENED: { label: "Buka kunci penggajian", category: "PAYROLL", tone: "warning" },
} as const satisfies Record<AuditAction, ActionInfo>;

// Aksi lama yang tidak (lagi) dikenal tetap ditampilkan apa adanya.
export function auditActionInfo(action: string): ActionInfo {
  return (
    (AUDIT_ACTIONS as Record<string, ActionInfo>)[action] ?? { label: action, category: "SETTINGS", tone: "pending" }
  );
}

export function auditActionsOf(category: AuditCategory): AuditAction[] {
  return (Object.keys(AUDIT_ACTIONS) as AuditAction[]).filter((action) => AUDIT_ACTIONS[action].category === category);
}

// Batas baris yang dimuat sekaligus; data lebih lama dicari lewat filter.
export const AUDIT_PAGE_LIMIT = 500;
