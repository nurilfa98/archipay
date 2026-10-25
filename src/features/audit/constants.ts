// Label & pengelompokan aksi audit log untuk halaman /audit.
// Daftar aksinya sendiri (AuditAction) ada di lib/audit.ts; `satisfies`
// memastikan setiap aksi baru wajib diberi label & kategori di sini.

import type { Tone } from "@/components/tone-badge";
import type { AuditAction } from "@/lib/audit";

export const AUDIT_CATEGORIES = ["AUTH", "USER", "ADVANCE", "SETTLEMENT", "SETTINGS"] as const;
export type AuditCategory = (typeof AUDIT_CATEGORIES)[number];

export const AUDIT_CATEGORY_LABELS: Record<AuditCategory, string> = {
  AUTH: "Login & akun",
  USER: "Pengguna",
  ADVANCE: "Uang muka",
  SETTLEMENT: "Pertanggungjawaban",
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
  ADVANCE_PROPOSED: { label: "Usulkan pencairan", category: "ADVANCE", tone: "pending" },
  ADVANCE_REQUESTED: { label: "Ajukan uang muka", category: "ADVANCE", tone: "pending" },
  ADVANCE_APPROVED: { label: "Setujui uang muka", category: "ADVANCE", tone: "success" },
  ADVANCE_REJECTED: { label: "Tolak uang muka", category: "ADVANCE", tone: "danger" },
  ADVANCE_DISBURSED: { label: "Cairkan dana", category: "ADVANCE", tone: "active" },
  ADVANCE_CANCELLED: { label: "Batalkan uang muka", category: "ADVANCE", tone: "danger" },
  ADVANCE_ACKNOWLEDGED: { label: "Konfirmasi terima dana", category: "ADVANCE", tone: "success" },
  ADVANCE_DISPUTED: { label: "Laporkan dana belum diterima", category: "ADVANCE", tone: "warning" },
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
