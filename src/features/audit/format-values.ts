// Mengubah old_values / new_values audit log (JSON mentah) menjadi baris
// "Data | Sebelum | Sesudah" yang mudah dibaca Owner, misalnya
// { amount: 250000 } → "Nominal: Rp 250.000".
//
// Dijalankan di server (memakai format tanggal zona waktu perusahaan);
// Client Component hanya menerima teks yang sudah jadi.

import "server-only";
import { ADVANCE_STATUS_LABELS, DISBURSEMENT_METHOD_LABELS } from "@/features/advances/constants";
import { LEDGER_ENTRY_LABELS, LEDGER_METHOD_LABELS } from "@/features/settlements/constants";
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
const label =
  (labels: Record<string, string>): Formatter =>
  (value) =>
    typeof value === "string" ? (labels[value] ?? value) : text(value);

const LOGIN_FAILED_REASONS: Record<string, string> = {
  WRONG_PASSWORD: "Password salah",
  INACTIVE: "Akun nonaktif",
  COMPANY_INACTIVE: "Company nonaktif",
  SUBSCRIPTION_LOCKED: "Langganan company terkunci",
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
  projectName: { label: "Project" },
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
