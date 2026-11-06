// GET /api/ledger-proofs/<entryId>: membuka foto/PDF bukti pengembalian atau
// penggantian yang dilampirkan pada satu baris buku saldo.
//
// File ada di bucket PRIVAT. Boleh dibuka oleh penerima uang muka atau
// pemegang advance:view-all di company yang sama; selain itu "tidak ditemukan"
// agar keberadaan file tidak bocor. Polanya sama dengan app/api/receipts/[itemId]/route.ts.

import { NextResponse } from "next/server";
import { proofResponse } from "@/features/settlements/balance-evidence";
import { getLedgerProof } from "@/features/settlements/queries";
import { getCurrentUser } from "@/lib/auth/dal";
import { can } from "@/lib/auth/permissions";

export async function GET(_request: Request, ctx: RouteContext<"/api/ledger-proofs/[entryId]">) {
  const { entryId } = await ctx.params;
  const user = await getCurrentUser();
  if (!user || user.mustChangePassword) return new NextResponse("Unauthorized", { status: 401 });

  const proof = user.company && entryId.length <= 36 ? await getLedgerProof(user.company.id, entryId) : null;
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
