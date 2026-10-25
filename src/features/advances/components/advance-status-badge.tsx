// Badge status uang muka. Tanpa "use client": bisa dipakai di Server
// Component (detail) maupun Client Component (data table).
//
// Warna mengikuti tone di components/tone-badge.tsx:
//   pending (slate)   = menunggu persetujuan Owner, dibatalkan
//   warning (amber)   = disetujui (dana belum diserahkan), nota perlu
//                       diperbaiki, sisa belum dikembalikan, menunggu penggantian
//   active  (indigo)  = menunggu konfirmasi karyawan, nota menunggu verifikasi
//   success (emerald) = diterima karyawan, selesai
//   danger  (rose)    = ditolak / dilaporkan tidak sesuai

import { ToneBadge, type Tone } from "@/components/tone-badge";
import { ADVANCE_STATUS_LABELS, type AdvanceStatus } from "@/features/advances/constants";

const TONES: Record<AdvanceStatus, Tone> = {
  PENDING_APPROVAL: "pending",
  APPROVED: "warning",
  DISBURSED: "active",
  ACKNOWLEDGED: "success",
  SUBMITTED: "active",
  REVISION_REQUESTED: "warning",
  RETURN_PENDING: "warning",
  REIMBURSE_PENDING: "warning",
  CLOSED: "success",
  REJECTED: "danger",
  CANCELLED: "pending",
};

export function AdvanceStatusBadge({
  status,
  disputed,
}: {
  status: AdvanceStatus;
  disputed: boolean;
}) {
  return (
    <span className="inline-flex flex-wrap gap-1">
      <ToneBadge tone={TONES[status]}>{ADVANCE_STATUS_LABELS[status]}</ToneBadge>
      {/* Laporan hanya relevan selama dana belum dikonfirmasi/dibatalkan */}
      {status === "DISBURSED" && disputed && <ToneBadge tone="danger">Dilaporkan tidak sesuai</ToneBadge>}
    </span>
  );
}
