// Label satu tagihan untuk tampilan, audit log, dan pesan WhatsApp:
// "Paket 1 tahun · 25 pengguna" atau "Tambah 5 pengguna".

import { PLAN_LABELS, type PlanMonths } from "./constants";

export function invoiceLabel(invoice: { kind: string; months: number | null; users: number }) {
  if (invoice.kind === "TOPUP" || invoice.months == null) return `Tambah ${invoice.users} pengguna`;
  return `Paket ${PLAN_LABELS[invoice.months as PlanMonths]} · ${invoice.users} pengguna`;
}
