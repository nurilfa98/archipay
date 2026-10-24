// Service = aturan bisnis murni. Tidak boleh import database, cookies,
// atau apa pun dari Next.js, supaya mudah di-unit-test.

import type { AdvanceStatus } from "./constants";

// Contoh alur status; sesuaikan dengan SOP perusahaan.
const ALLOWED_TRANSITIONS: Record<AdvanceStatus, readonly AdvanceStatus[]> = {
  DISBURSED: ["SUBMITTED", "OVERDUE"],
  SUBMITTED: ["COMPLETED", "DISBURSED"], // DISBURSED = struk ditolak, upload ulang
  OVERDUE: ["SUBMITTED", "COMPLETED"],
  COMPLETED: [],
};

export function canTransition(from: AdvanceStatus, to: AdvanceStatus) {
  return ALLOWED_TRANSITIONS[from].includes(to);
}
