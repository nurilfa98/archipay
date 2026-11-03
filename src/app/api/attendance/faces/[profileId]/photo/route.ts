// GET /api/attendance/faces/<profileId>/photo: membuka foto acuan wajah.
//
// Foto ada di bucket PRIVAT. Boleh dibuka oleh pemilik foto atau pemegang
// attendance:view-all (Owner, Admin HR, Superadmin) di company yang sama.
// Polanya sama dengan app/api/receipts/[itemId]/route.ts.

import { NextResponse } from "next/server";
import { getFacePhoto } from "@/features/attendance/queries";
import { getCurrentUser } from "@/lib/auth/dal";
import { can } from "@/lib/auth/permissions";
import { getPresignedUrl, readLocalObject } from "@/lib/storage";

// Jangan simpan di cache bersama (CDN/proxy): isinya data pribadi (biometrik).
const PRIVATE_HEADERS = {
  "Cache-Control": "private, no-store",
  "X-Content-Type-Options": "nosniff",
};

export async function GET(_request: Request, ctx: RouteContext<"/api/attendance/faces/[profileId]/photo">) {
  const { profileId } = await ctx.params;
  const user = await getCurrentUser();
  if (!user || user.mustChangePassword) return new NextResponse("Unauthorized", { status: 401 });

  const photo = user.company && profileId.length <= 36 ? await getFacePhoto(user.company.id, profileId) : null;
  // Tidak berhak = "tidak ditemukan", agar keberadaan file tidak bocor.
  const allowed = photo && (photo.userId === user.id || can(user, "attendance:view-all"));
  if (!allowed || !photo.photoKey) return new NextResponse("Not found", { status: 404 });

  const presignedUrl = await getPresignedUrl(photo.photoKey);
  if (presignedUrl)
    return NextResponse.redirect(presignedUrl, {
      status: 302,
      headers: PRIVATE_HEADERS,
    });

  const body = await readLocalObject(photo.photoKey);
  return new NextResponse(new Uint8Array(body), {
    headers: {
      ...PRIVATE_HEADERS,
      "Content-Type": "image/jpeg",
      "Content-Disposition": "inline",
    },
  });
}
