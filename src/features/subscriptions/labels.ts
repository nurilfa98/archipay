// Label satu tagihan untuk tampilan, audit log, dan pesan WhatsApp:
// "Paket 1 tahun · 25 pengguna + Absensi + Penggajian", "Tambah 5 pengguna",
// atau "Add-on Absensi · 25 pengguna".

import { ADDON_LABELS, addonKeysOf, type AddonFlags } from "@/lib/addons";
import { PLAN_LABELS, type PlanMonths } from "./constants";

export function invoiceLabel(invoice: { kind: string; months: number | null; users: number } & AddonFlags) {
  const keys = addonKeysOf(invoice);
  if (invoice.kind === "ADDON") return `Add-on ${keys.map((key) => ADDON_LABELS[key]).join(" + ")} · ${invoice.users} pengguna`;
  const addon = keys.map((key) => ` + ${ADDON_LABELS[key]}`).join("");
  if (invoice.kind === "TOPUP" || invoice.months == null) return `Tambah ${invoice.users} pengguna${addon}`;
  return `Paket ${PLAN_LABELS[invoice.months as PlanMonths]} · ${invoice.users} pengguna${addon}`;
}
