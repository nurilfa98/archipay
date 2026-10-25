// GET /api/receipts/<itemId>: membuka foto/PDF nota.
//
// File nota ada di bucket PRIVAT. Route ini mengecek hak akses lebih dulu
// (penerima dana atau pemegang advance:view-all, sama dengan halaman
// laporan), lalu:
// - R2   : mengarahkan browser ke URL bertanda tangan yang berlaku 5 menit.
// - lokal: (development) mengirim isi file langsung.
//
// Referensi:
// - node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/route.md
// - node_modules/next/dist/docs/01-app/02-guides/data-security.md

import { NextResponse } from "next/server";
import { getReceiptFile } from "@/features/settlements/queries";
import { getCurrentUser } from "@/lib/auth/dal";
import { can } from "@/lib/auth/permissions";
import { getPresignedUrl, readLocalObject } from "@/lib/storage";

// Jangan simpan di cache bersama (CDN/proxy): isinya data pribadi.
const PRIVATE_HEADERS = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };

export async function GET(_request: Request, ctx: RouteContext<"/api/receipts/[itemId]">) {
  const { itemId } = await ctx.params;
  const user = await getCurrentUser();
  if (!user || user.mustChangePassword) return new NextResponse("Unauthorized", { status: 401 });

  const receipt = itemId.length <= 36 ? await getReceiptFile(itemId) : null;
  // Tidak berhak = "tidak ditemukan", agar keberadaan file tidak bocor.
  const allowed = receipt && (receipt.recipientId === user.id || can(user, "advance:view-all"));
  if (!allowed || !receipt.fileKey) return new NextResponse("Not found", { status: 404 });

  const presignedUrl = await getPresignedUrl(receipt.fileKey);
  if (presignedUrl) return NextResponse.redirect(presignedUrl, { status: 302, headers: PRIVATE_HEADERS });

  const body = await readLocalObject(receipt.fileKey);
  return new NextResponse(new Uint8Array(body), {
    headers: {
      ...PRIVATE_HEADERS,
      "Content-Type": receipt.fileContentType ?? "application/octet-stream",
      "Content-Disposition": "inline",
    },
  });
}
