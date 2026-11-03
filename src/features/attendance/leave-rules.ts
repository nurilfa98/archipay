// Aturan siapa boleh memproses pengajuan cuti/izin (BUSINESS-FLOW §19.4).
// Fungsi murni, dipakai halaman (tampilkan tombol) dan Server Action.
//
// - Owner (leave:approve): kapan saja.
// - Admin HR (leave:approve-delegated): bila delegasi aktif dan pengajuan
//   sudah menunggu lebih lama dari waktu tunggu (bawaan 24 jam).
// - Tidak ada yang memproses pengajuannya sendiri.

import { can } from "@/lib/auth/permissions";
import type { Role } from "@/lib/auth/roles";

type Actor = { id: string; roles: readonly Role[] };
type Request = { userId: string; createdAt: Date };
type Settings = { leaveDelegationEnabled: boolean; leaveDelegationHours: number };

export function delegatedAt(request: Request, settings: Settings) {
  return new Date(request.createdAt.getTime() + settings.leaveDelegationHours * 60 * 60 * 1000);
}

export function leaveDecisionRight(
  actor: Actor,
  request: Request,
  settings: Settings,
  now: Date,
): "owner" | "delegate" | null {
  if (request.userId === actor.id) return null;
  if (can(actor, "leave:approve")) return "owner";
  if (
    can(actor, "leave:approve-delegated") &&
    settings.leaveDelegationEnabled &&
    now >= delegatedAt(request, settings)
  ) {
    return "delegate";
  }
  return null;
}
