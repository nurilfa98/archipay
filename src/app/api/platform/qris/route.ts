// GET /api/platform/qris: gambar QRIS statis untuk pembayaran langganan
// (diunggah Superadmin di Pengaturan platform). Dibuka Owner di menu
// Langganan dan Superadmin di Pengaturan platform; user lain tidak perlu.

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/dal";
import { can } from "@/lib/auth/permissions";
import { getPlatformSettings } from "@/lib/platform-settings";
import { getPresignedUrl, readLocalObject } from "@/lib/storage";

const PRIVATE_HEADERS = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };

export async function GET() {
  const user = await getCurrentUser();
  if (!user || user.mustChangePassword) return new NextResponse("Unauthorized", { status: 401 });
  if (!can(user, "subscription:view") && !can(user, "subscription:manage")) {
    return new NextResponse("Not found", { status: 404 });
  }

  const { qrisImageKey } = await getPlatformSettings();
  if (!qrisImageKey) return new NextResponse("Not found", { status: 404 });

  const presignedUrl = await getPresignedUrl(qrisImageKey);
  if (presignedUrl) return NextResponse.redirect(presignedUrl, { status: 302, headers: PRIVATE_HEADERS });

  const extension = qrisImageKey.split(".").pop();
  const body = await readLocalObject(qrisImageKey);
  return new NextResponse(new Uint8Array(body), {
    headers: {
      ...PRIVATE_HEADERS,
      "Content-Type": extension === "png" ? "image/png" : extension === "webp" ? "image/webp" : "image/jpeg",
      "Content-Disposition": "inline",
    },
  });
}
