// GET /api/attendance/records/<recordId>/selfie/<in|out>: membuka selfie absen.
//
// File ada di bucket PRIVAT. Boleh dibuka pemilik absen atau pemegang
// attendance:view-all (Owner, Admin HR, Superadmin) di company yang sama.
// Polanya sama dengan app/api/receipts/[itemId]/route.ts.

import { NextResponse } from "next/server";
import { getRecordSelfie } from "@/features/attendance/queries";
import { getCurrentUser } from "@/lib/auth/dal";
import { can } from "@/lib/auth/permissions";
import { getPresignedUrl, readLocalObject } from "@/lib/storage";

// Jangan simpan di cache bersama (CDN/proxy): isinya data pribadi (biometrik).
const PRIVATE_HEADERS = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };

export async function GET(_request: Request, ctx: RouteContext<"/api/attendance/records/[recordId]/selfie/[kind]">) {
  const { recordId, kind } = await ctx.params;
  const user = await getCurrentUser();
  if (!user || user.mustChangePassword) return new NextResponse("Unauthorized", { status: 401 });

  const record =
    user.company && recordId.length <= 36 && (kind === "in" || kind === "out")
      ? await getRecordSelfie(user.company.id, recordId)
      : null;
  // Tidak berhak = "tidak ditemukan", agar keberadaan file tidak bocor.
  const allowed = record && (record.userId === user.id || can(user, "attendance:view-all"));
  const key = allowed ? (kind === "in" ? record.checkInSelfieKey : record.checkOutSelfieKey) : null;
  if (!key) {
    if (record?.selfieDeletedAt && allowed) {
      return new NextResponse("Selfie sudah dihapus otomatis karena lewat masa simpan.", {
        status: 410,
        headers: { ...PRIVATE_HEADERS, "Content-Type": "text/plain; charset=utf-8" },
      });
    }
    return new NextResponse("Not found", { status: 404 });
  }

  const presignedUrl = await getPresignedUrl(key);
  if (presignedUrl) return NextResponse.redirect(presignedUrl, { status: 302, headers: PRIVATE_HEADERS });

  const body = await readLocalObject(key);
  return new NextResponse(new Uint8Array(body), {
    headers: { ...PRIVATE_HEADERS, "Content-Type": "image/jpeg", "Content-Disposition": "inline" },
  });
}
