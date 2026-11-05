// Mengubah old_values / new_values audit log (JSON mentah) menjadi baris
// "Data | Sebelum | Sesudah" yang mudah dibaca Owner, misalnya
// { amount: 250000 } → "Nominal: Rp 250.000".
//
// Dijalankan di server (memakai format tanggal zona waktu perusahaan);
// Client Component hanya menerima teks yang sudah jadi.

import "server-only";
import { ADVANCE_STATUS_LABELS, DISBURSEMENT_METHOD_LABELS } from "@/features/advances/constants";
import { LEDGER_ENTRY_LABELS, LEDGER_METHOD_LABELS } from "@/features/settlements/constants";
import { timezoneLabel } from "@/features/attendance/constants";
import { formatMinutes, formatWorkDays } from "@/features/attendance/schedule";
import { isRole, ROLE_LABELS, type Role } from "@/lib/auth/roles";
import { formatDateOnly, formatDateTime } from "@/lib/dates";
import { formatRupiah, MONTH_NAMES } from "@/lib/format";

export type AuditChange = {
  field: string;
  before: string | null; // null = tidak ada nilai sebelumnya
  after: string | null; // null = dihapus / tidak ada nilai sesudahnya
};

type Formatter = (value: unknown) => string;

const rupiah: Formatter = (value) => (typeof value === "number" ? formatRupiah(value) : text(value));
const days: Formatter = (value) => `${text(value)} hari`;
const dateTime: Formatter = (value) => {
  const date = typeof value === "string" ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? formatDateTime(date) : text(value);
};
const clock: Formatter = (value) => (typeof value === "number" ? formatMinutes(value) : text(value));
const minutes: Formatter = (value) => `${text(value)} menit`;
const label =
  (labels: Record<string, string>): Formatter =>
  (value) =>
    typeof value === "string" ? (labels[value] ?? value) : text(value);

const LOGIN_FAILED_REASONS: Record<string, string> = {
  WRONG_PASSWORD: "Password salah",
  INACTIVE: "Akun nonaktif",
  COMPANY_INACTIVE: "Perusahaan nonaktif",
  SUBSCRIPTION_LOCKED: "Langganan perusahaan terkunci",
};

// Urutan di sini = urutan tampil. Field yang tidak terdaftar tetap
// ditampilkan di akhir dengan nama aslinya.
const FIELDS: Record<string, { label: string; format?: Formatter }> = {
  status: { label: "Status", format: label(ADVANCE_STATUS_LABELS) },
  number: { label: "Nomor" },
  fullName: { label: "Nama lengkap" },
  name: { label: "Nama" },
  email: { label: "Email" },
  phoneNumber: { label: "No. WhatsApp" },
  roles: {
    label: "Role",
    format: (value) =>
      Array.isArray(value)
        ? value.map((role) => (isRole(String(role)) ? ROLE_LABELS[String(role) as Role] : text(role))).join(", ")
        : text(value),
  },
  bankName: { label: "Bank" },
  bankAccountNumber: { label: "No. rekening" },
  wasTemporary: { label: "Password sementara" },
  isActive: { label: "Aktif" },
  recipientName: { label: "Penerima" },
  projectName: { label: "Proyek" },
  client: { label: "Klien" },
  contractValue: { label: "Nilai kontrak", format: rupiah },
  icon: { label: "Ikon" },
  purpose: { label: "Keperluan" },
  type: { label: "Jenis", format: label(LEDGER_ENTRY_LABELS) },
  amount: { label: "Nominal", format: rupiah },
  plan: { label: "Paket langganan" },
  disbursementMethod: { label: "Metode pencairan", format: label(DISBURSEMENT_METHOD_LABELS) },
  method: { label: "Metode", format: label(LEDGER_METHOD_LABELS) },
  destinationBankName: { label: "Bank tujuan" },
  destinationAccountNumber: { label: "No. rekening tujuan" },
  transferReference: { label: "No. referensi transfer" },
  reference: { label: "No. referensi" },
  payrollPeriod: {
    label: "Periode gaji",
    format: (value) => {
      const [year, month] = String(value).split("-").map(Number);
      return month && MONTH_NAMES[month - 1] ? `${MONTH_NAMES[month - 1]} ${year}` : text(value);
    },
  },
  disbursedAt: { label: "Waktu pencairan", format: dateTime },
  settlementDueAt: { label: "Batas unggah nota", format: dateTime },
  settlementDueDays: { label: "Batas unggah nota", format: days },
  returnDueDays: { label: "Batas pengembalian sisa", format: days },
  noReceiptMaxAmount: { label: "Maks. biaya tanpa nota", format: rupiah },
  description: { label: "Keterangan" },
  receiptDate: { label: "Tanggal nota", format: (value) => (typeof value === "string" ? formatDateOnly(value) : text(value)) },
  noReceipt: { label: "Tanpa nota" },
  noReceiptReason: { label: "Alasan tanpa nota" },
  itemCount: { label: "Jumlah nota" },
  itemTotal: { label: "Total nota", format: rupiah },
  approvedAmount: { label: "Nota disetujui", format: rupiah },
  rejectedItems: {
    label: "Nota ditolak",
    format: (value) => (Array.isArray(value) ? `${value.length} nota` : text(value)),
  },
  balance: { label: "Selisih saldo", format: rupiah },
  remaining: { label: "Sisa setelah dicatat", format: rupiah },
  reason: { label: "Alasan", format: label(LOGIN_FAILED_REASONS) },
  note: { label: "Catatan" },
  acknowledgmentText: { label: "Pernyataan karyawan" },
  // Absensi
  workStartMinute: { label: "Jam masuk", format: clock },
  workEndMinute: { label: "Jam pulang", format: clock },
  lateToleranceMinutes: { label: "Toleransi terlambat", format: minutes },
  latePenaltyAmount: { label: "Denda per keterlambatan", format: rupiah },
  workDays: { label: "Hari kerja", format: (value) => (typeof value === "number" ? formatWorkDays(value) : text(value)) },
  holidayDate: {
    label: "Tanggal libur",
    format: (value) => (typeof value === "string" ? formatDateOnly(value) : text(value)),
  },
  latitude: { label: "Latitude" },
  longitude: { label: "Longitude" },
  radiusMeters: { label: "Radius", format: (value) => `${text(value)} m` },
  timezone: { label: "Zona waktu", format: (value) => (typeof value === "string" ? timezoneLabel(value) : text(value)) },
  locationCount: { label: "Jumlah lokasi" },
  locationNames: { label: "Nama lokasi" },
  employeeName: { label: "Karyawan" },
  rejectReason: { label: "Alasan ditolak" },
  replacedPrevious: { label: "Mengganti foto lama" },
  consentText: { label: "Pernyataan persetujuan" },
  locationName: { label: "Lokasi" },
  distanceMeters: { label: "Jarak dari lokasi", format: (value) => `${text(value)} m` },
  inRadius: { label: "Di dalam radius" },
  lateMinutes: { label: "Terlambat", format: minutes },
  earlyMinutes: { label: "Pulang lebih awal", format: minutes },
  faceScore: { label: "Skor kecocokan wajah" },
  faceThreshold: { label: "Ambang kecocokan" },
  checkMode: { label: "Jenis absen", format: label({ in: "Masuk", out: "Pulang" }) },
  leaveType: { label: "Jenis cuti/izin" },
  attendancePeriod: { label: "Periode absensi" },
  penaltyCount: { label: "Jumlah denda" },
  workDate: { label: "Tanggal kerja", format: (value) => (typeof value === "string" ? formatDateOnly(value) : text(value)) },
  correctionNote: { label: "Alasan koreksi" },
  leaveKind: { label: "Bentuk izin" },
  startDate: { label: "Mulai", format: (value) => (typeof value === "string" ? formatDateOnly(value) : text(value)) },
  endDate: { label: "Selesai", format: (value) => (typeof value === "string" ? formatDateOnly(value) : text(value)) },
  days: { label: "Hari kerja" },
  delegated: { label: "Diproses Admin HR (delegasi)" },
  cancelledAll: { label: "Dibatalkan seluruhnya" },
  isPaid: { label: "Dibayar" },
  usesQuota: { label: "Memotong kuota cuti" },
  annualLeaveQuota: { label: "Kuota cuti tahunan", format: (value) => (value === null ? "Ikut kuota perusahaan" : `${text(value)} hari`) },
  leaveDelegationEnabled: { label: "Delegasi ke Admin HR" },
  leaveDelegationHours: { label: "Waktu tunggu delegasi", format: (value) => `${text(value)} jam` },
  userAgent: { label: "Perangkat (browser)" },
};

// ID internal & hash file tidak berarti bagi pembaca; datanya sudah
// terwakili field lain (misal recipientName).
const HIDDEN_FIELDS = new Set(["itemId", "recipientId", "disbursedById", "categoryId", "fileHash", "projectId"]);

const FIELD_ORDER = Object.keys(FIELDS);

export function formatAuditChanges(
  oldValues: Record<string, unknown> | null,
  newValues: Record<string, unknown> | null,
): AuditChange[] {
  const keys = [...new Set([...Object.keys(oldValues ?? {}), ...Object.keys(newValues ?? {})])]
    .filter((key) => !HIDDEN_FIELDS.has(key))
    .sort((a, b) => order(a) - order(b));

  return keys.map((key) => {
    const field = FIELDS[key];
    const format = field?.format ?? text;
    const show = (values: Record<string, unknown> | null) =>
      values && key in values ? (values[key] === null || values[key] === "" ? "-" : format(values[key])) : null;
    return { field: field?.label ?? key, before: show(oldValues), after: show(newValues) };
  });
}

function order(key: string) {
  const index = FIELD_ORDER.indexOf(key);
  return index === -1 ? FIELD_ORDER.length : index;
}

function text(value: unknown): string {
  if (value === null || value === undefined || value === "") return "-";
  if (typeof value === "boolean") return value ? "Ya" : "Tidak";
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (Array.isArray(value)) return value.map(text).join(", ");
  return JSON.stringify(value);
}
