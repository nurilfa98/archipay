// Aturan siapa boleh memproses pengajuan lembur (BUSINESS-FLOW §24.2).
// Sama seperti cuti/izin (leave-rules.ts), tetapi delegasi ke Admin HR punya
// pengaturan sendiri (aktif/nonaktif dan waktu tunggu) karena persetujuan lembur
// biasanya perlu lebih cepat.
//
// - Owner (leave:approve): kapan saja.
// - Admin HR (leave:approve-delegated): bila delegasi lembur aktif dan pengajuan sudah
//   menunggu lebih lama dari waktu tunggu lembur.
// - Tidak ada yang memproses pengajuannya sendiri.

import type { Role } from "@/lib/auth/roles";
import { delegatedAt, leaveDecisionRight } from "./leave-rules";

type Actor = { id: string; roles: readonly Role[] };
type Order = { userId: string; createdAt: Date };
export type OvertimeDelegation = { overtimeDelegationEnabled: boolean; overtimeDelegationHours: number };

const asLeaveSettings = (settings: OvertimeDelegation) => ({
  leaveDelegationEnabled: settings.overtimeDelegationEnabled,
  leaveDelegationHours: settings.overtimeDelegationHours,
});

export function overtimeDelegatedAt(order: Order, settings: OvertimeDelegation) {
  return delegatedAt(order, asLeaveSettings(settings));
}

export function overtimeDecisionRight(
  actor: Actor,
  order: Order,
  settings: OvertimeDelegation,
  now: Date,
): "owner" | "delegate" | null {
  return leaveDecisionRight(actor, order, asLeaveSettings(settings), now);
}
