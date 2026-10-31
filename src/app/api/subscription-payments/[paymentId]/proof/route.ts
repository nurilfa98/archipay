// GET /api/subscription-payments/<paymentId>/proof: membuka bukti transfer
// langganan (foto/PDF).
//
// Boleh dibuka Superadmin (subscription:manage) untuk semua company, atau
// Owner (subscription:view) untuk company-nya sendiri. Polanya sama dengan
// /api/receipts/[itemId]: R2 → URL bertanda tangan 5 menit; lokal → isi file.
//
// Referensi: node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/route.md

import { NextResponse } from "next/server";
import { getPaymentProof } from "@/features/subscriptions/queries";
import { getCurrentUser } from "@/lib/auth/dal";
import { can } from "@/lib/auth/permissions";
import { getPresignedUrl, readLocalObject } from "@/lib/storage";

const PRIVATE_HEADERS = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };

export async function GET(_request: Request, ctx: RouteContext<"/api/subscription-payments/[paymentId]/proof">) {
  const { paymentId } = await ctx.params;
  const user = await getCurrentUser();
  if (!user || user.mustChangePassword) return new NextResponse("Unauthorized", { status: 401 });

  const proof = paymentId.length <= 36 ? await getPaymentProof(paymentId) : null;
  const allowed =
    proof &&
    (can(user, "subscription:manage") || (can(user, "subscription:view") && user.company?.id === proof.companyId));
  // Tidak berhak = "tidak ditemukan", agar keberadaan file tidak bocor.
  if (!allowed || !proof.proofKey) return new NextResponse("Not found", { status: 404 });

  const presignedUrl = await getPresignedUrl(proof.proofKey);
  if (presignedUrl) return NextResponse.redirect(presignedUrl, { status: 302, headers: PRIVATE_HEADERS });

  const body = await readLocalObject(proof.proofKey);
  return new NextResponse(new Uint8Array(body), {
    headers: {
      ...PRIVATE_HEADERS,
      "Content-Type": proof.proofContentType ?? "application/octet-stream",
      "Content-Disposition": "inline",
    },
  });
}
