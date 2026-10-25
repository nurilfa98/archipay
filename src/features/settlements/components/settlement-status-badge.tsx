// Badge status pertanggungjawaban. Warnanya sama dengan status uang muka
// yang setara (features/advances/components/advance-status-badge.tsx):
//   pending (slate)   = draf
//   active  (indigo)  = menunggu verifikasi
//   warning (amber)   = perlu diperbaiki, sisa belum dikembalikan, menunggu penggantian
//   success (emerald) = selesai

import { ToneBadge, type Tone } from "@/components/tone-badge";
import {
  SETTLEMENT_STATUS_LABELS,
  type ItemVerificationStatus,
  type SettlementStatus,
} from "@/features/settlements/constants";

const TONES: Record<SettlementStatus, Tone> = {
  DRAFT: "pending",
  SUBMITTED: "active",
  REVISION_REQUESTED: "warning",
  RETURN_PENDING: "warning",
  REIMBURSE_PENDING: "warning",
  CLOSED: "success",
};

export function SettlementStatusBadge({ status }: { status: SettlementStatus }) {
  return <ToneBadge tone={TONES[status]}>{SETTLEMENT_STATUS_LABELS[status]}</ToneBadge>;
}

// Hasil verifikasi per nota. PENDING tidak ditampilkan.
export function ItemVerificationBadge({ status }: { status: ItemVerificationStatus }) {
  if (status === "APPROVED") return <ToneBadge tone="success">Disetujui</ToneBadge>;
  if (status === "REJECTED") return <ToneBadge tone="danger">Ditolak</ToneBadge>;
  return null;
}
