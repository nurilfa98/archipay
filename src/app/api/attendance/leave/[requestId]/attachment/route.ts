// GET /api/attendance/leave/<requestId>/attachment: membuka lampiran cuti/izin
// (misal surat dokter). Boleh dibuka pengaju atau pemegang attendance:view-all
// (Owner, Admin HR, Superadmin) di company yang sama. Polanya sama dengan
// app/api/receipts/[itemId]/route.ts.

import { NextResponse } from "next/server";
import { getLeaveRequest } from "@/features/attendance/leave-queries";
import { getCurrentUser } from "@/lib/auth/dal";
import { can } from "@/lib/auth/permissions";
import { getPresignedUrl, readLocalObject } from "@/lib/storage";

const PRIVATE_HEADERS = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };

export async function GET(_request: Request, ctx: RouteContext<"/api/attendance/leave/[requestId]/attachment">) {
  const { requestId } = await ctx.params;
  const user = await getCurrentUser();
  if (!user || user.mustChangePassword) return new NextResponse("Unauthorized", { status: 401 });

  const leave = user.company && requestId.length <= 36 ? await getLeaveRequest(user.company.id, requestId) : null;
  const allowed = leave && (leave.userId === user.id || can(user, "attendance:view-all"));
  if (!allowed || !leave.attachmentKey) return new NextResponse("Not found", { status: 404 });

  const presignedUrl = await getPresignedUrl(leave.attachmentKey);
  if (presignedUrl) return NextResponse.redirect(presignedUrl, { status: 302, headers: PRIVATE_HEADERS });

  const body = await readLocalObject(leave.attachmentKey);
  return new NextResponse(new Uint8Array(body), {
    headers: {
      ...PRIVATE_HEADERS,
      "Content-Type": leave.attachmentType ?? "application/octet-stream",
      "Content-Disposition": "inline",
    },
  });
}
