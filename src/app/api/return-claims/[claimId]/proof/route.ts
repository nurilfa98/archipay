// GET /api/return-claims/<claimId>/proof: membuka foto/PDF bukti yang dilampirkan
// karyawan pada laporan pengembaliannya (sebelum/tanpa dikonfirmasi).
//
// Boleh dibuka oleh karyawan pelapor atau pemegang advance:view-all di company
// yang sama. Polanya sama dengan app/api/ledger-proofs/[entryId]/route.ts.

import { NextResponse } from "next/server";
import { proofResponse } from "@/features/settlements/balance-evidence";
import { getClaimProof } from "@/features/settlements/queries";
import { getCurrentUser } from "@/lib/auth/dal";
import { can } from "@/lib/auth/permissions";

export async function GET(_request: Request, ctx: RouteContext<"/api/return-claims/[claimId]/proof">) {
  const { claimId } = await ctx.params;
  const user = await getCurrentUser();
  if (!user || user.mustChangePassword) return new NextResponse("Unauthorized", { status: 401 });

  const proof = user.company && claimId.length <= 36 ? await getClaimProof(user.company.id, claimId) : null;
  const allowed = proof && (proof.recipientId === user.id || can(user, "advance:view-all"));
  if (!allowed || !proof.proofKey) return new NextResponse("Not found", { status: 404 });
  if (proof.proofDeletedAt) {
    return new NextResponse("Bukti sudah dihapus otomatis karena lewat masa simpan.", {
      status: 410,
      headers: { "Cache-Control": "private, no-store", "Content-Type": "text/plain; charset=utf-8" },
    });
  }
  return proofResponse(proof.proofKey, proof.proofContentType);
}
