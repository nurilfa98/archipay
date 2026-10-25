// Service = aturan bisnis murni. Tidak boleh import database, cookies,
// atau apa pun dari Next.js, supaya mudah di-unit-test.
//
// getAvailableActions() adalah SATU-SATUNYA tempat aturan "siapa boleh
// melakukan apa terhadap uang muka ini". Dipakai dua kali:
// 1. Halaman: menampilkan/menyembunyikan tombol.
// 2. Server Action: menolak aksi yang tidak diizinkan (pengaman sebenarnya).
//
// Pemisahan tugas (segregation of duties): penerima dana tidak pernah boleh
// menyetujui atau mencairkan uang mukanya sendiri, dan tidak bisa membatalkan
// dana yang sudah cair. Ia hanya boleh menarik pengajuannya sendiri selama
// dana belum diserahkan.

import { can } from "@/lib/auth/permissions";
import type { Role } from "@/lib/auth/roles";
import type { AdvanceStatus } from "./constants";

export type AdvanceViewer = { id: string; roles: readonly Role[] };

export type AdvanceForRules = {
  status: AdvanceStatus;
  recipientId: string;
  createdById: string;
  disbursedById: string | null;
  disputedAt: Date | null;
};

export type AdvanceActions = {
  acknowledge: boolean; // karyawan: konfirmasi terima
  dispute: boolean; // karyawan: laporkan tidak sesuai
  decide: boolean; // OWNER: setujui / tolak pengajuan atau usulan
  disburse: boolean; // catat penyerahan dana yang sudah disetujui
  cancel: boolean;
};

export function getAvailableActions(advance: AdvanceForRules, viewer: AdvanceViewer): AdvanceActions {
  const isRecipient = advance.recipientId === viewer.id;
  const isCreator = advance.createdById === viewer.id;
  const canApprove = can(viewer, "advance:approve");

  return {
    acknowledge: advance.status === "DISBURSED" && isRecipient,
    dispute: advance.status === "DISBURSED" && isRecipient && !advance.disputedAt,
    // Pengusul tidak boleh menyetujui usulannya sendiri.
    decide: advance.status === "PENDING_APPROVAL" && canApprove && !isRecipient && !isCreator,
    disburse:
      advance.status === "APPROVED" &&
      !isRecipient &&
      (can(viewer, "advance:disburse") || can(viewer, "advance:propose")),
    cancel: canCancel(advance, viewer, isRecipient, isCreator, canApprove),
  };
}

function canCancel(
  advance: AdvanceForRules,
  viewer: AdvanceViewer,
  isRecipient: boolean,
  isCreator: boolean,
  canApprove: boolean,
) {
  switch (advance.status) {
    case "PENDING_APPROVAL":
      // Pengaju/pengusul menarik pengajuannya; OWNER memakai "Tolak".
      return isCreator;
    case "APPROVED":
      // Dana belum diserahkan: pengaju boleh membatalkan (tidak jadi butuh).
      return isCreator || (canApprove && !isRecipient);
    case "DISBURSED":
      // Salah input / laporan tidak sesuai. Setelah dikonfirmasi karyawan,
      // data terkunci dan koreksi dilakukan lewat pertanggungjawaban.
      return !isRecipient && (advance.disbursedById === viewer.id || canApprove);
    default:
      return false;
  }
}

// Uang muka yang menunggu tindakan viewer (tampil di "Perlu tindakan Anda").
// Pembatalan tidak dihitung, kecuali karyawan sudah melaporkan tidak sesuai.
export function needsActionFrom(advance: AdvanceForRules, viewer: AdvanceViewer) {
  const actions = getAvailableActions(advance, viewer);
  return (
    actions.acknowledge ||
    actions.decide ||
    actions.disburse ||
    (actions.cancel && advance.status === "DISBURSED" && !!advance.disputedAt)
  );
}

// Teks persetujuan yang dibaca dan disetujui karyawan saat konfirmasi.
// Teks PERSIS ini disimpan di database (acknowledgment_text) sebagai bukti.
//
// Dasar potong gaji: PP 36/2021 tentang Pengupahan mensyaratkan persetujuan
// tertulis karyawan, dan total potongan maksimal 50% upah per periode
// (batas ini diterapkan di irisan daftar potong gaji). Mohon dicek ulang
// redaksinya dengan konsultan HR/hukum perusahaan.
export function buildAcknowledgmentText(input: {
  recipientName: string;
  advanceNumber: string;
  amountLabel: string; // "Rp 500.000"
  purpose: string;
  settlementDueLabel: string; // "Kamis, 27 Oktober 2026"
  returnDueDays: number;
}) {
  return (
    `Saya, ${input.recipientName}, menyatakan telah menerima uang muka ${input.advanceNumber} ` +
    `sebesar ${input.amountLabel} untuk keperluan "${input.purpose}". ` +
    `Saya akan mengunggah nota pertanggungjawaban paling lambat ${input.settlementDueLabel} pukul 23.59. ` +
    `Saya setuju bahwa sisa dana yang belum saya kembalikan dalam ${input.returnDueDays} hari kalender ` +
    `setelah pertanggungjawaban diverifikasi akan dipotong dari gaji saya sesuai ketentuan perusahaan.`
  );
}
