// Service = aturan bisnis murni. Tidak boleh import database, cookies,
// atau apa pun dari Next.js, supaya mudah di-unit-test.
//
// Uang dihitung dalam RUPIAH bulat (integer), sama dengan kolom bigint di
// database. Jangan menghitung uang dengan pecahan: 0.1 + 0.2 !== 0.3.
//
// getSettlementActions() adalah SATU-SATUNYA tempat aturan "siapa boleh
// melakukan apa terhadap laporan ini", dipakai halaman (tampil/sembunyi
// tombol) dan Server Action (pengaman sebenarnya).
//
// Pemisahan tugas: penerima dana tidak pernah boleh memverifikasi laporannya
// sendiri, termasuk bila ia FINANCE atau OWNER.

import type { AdvanceStatus } from "@/features/advances/constants";
import { can } from "@/lib/auth/permissions";
import type { Role } from "@/lib/auth/roles";
import { EDITABLE_ADVANCE_STATUSES } from "./constants";

export type SettlementViewer = { id: string; roles: readonly Role[] };

export type SettlementForRules = {
  advanceStatus: AdvanceStatus;
  recipientId: string;
  itemCount: number;
};

export type SettlementActions = {
  edit: boolean; // karyawan: tambah / hapus nota
  submit: boolean; // karyawan: kirim laporan
  verify: boolean; // OWNER/FINANCE: setujui/tolak per nota & selesaikan
  requestRevision: boolean; // OWNER/FINANCE: kembalikan untuk diperbaiki
  recordReturn: boolean; // OWNER/FINANCE: catat sisa dana yang dikembalikan
  recordReimbursement: boolean; // OWNER/FINANCE: catat penggantian yang dibayar
};

export function getSettlementActions(
  settlement: SettlementForRules,
  viewer: SettlementViewer,
): SettlementActions {
  const isRecipient = settlement.recipientId === viewer.id;
  const edit =
    isRecipient &&
    can(viewer, "settlement:submit") &&
    (EDITABLE_ADVANCE_STATUSES as readonly AdvanceStatus[]).includes(settlement.advanceStatus);
  const verifier = can(viewer, "settlement:verify") && !isRecipient;
  const verify = settlement.advanceStatus === "SUBMITTED" && verifier;

  return {
    edit,
    submit: edit && settlement.itemCount > 0,
    verify,
    requestRevision: verify,
    recordReturn: settlement.advanceStatus === "RETURN_PENDING" && verifier,
    recordReimbursement: settlement.advanceStatus === "REIMBURSE_PENDING" && verifier,
  };
}

// Hasil verifikasi dari saldo ledger SETELAH nota yang disetujui dicatat.
//   saldo > 0 → karyawan masih memegang sisa uang kantor
//   saldo < 0 → karyawan nombok, kantor mengganti
//   saldo = 0 → selesai
export function settlementOutcome(balance: number): Extract<
  AdvanceStatus,
  "CLOSED" | "RETURN_PENDING" | "REIMBURSE_PENDING"
> {
  if (balance > 0) return "RETURN_PENDING";
  if (balance < 0) return "REIMBURSE_PENDING";
  return "CLOSED";
}

// Ringkasan angka untuk tampilan: dana diterima vs total nota.
// `received` = dana uang muka, `spent` = jumlah nota (yang dihitung).
export function summarizeBalance(received: number, spent: number) {
  const balance = received - spent;
  return { received, spent, balance, outcome: settlementOutcome(balance) };
}
