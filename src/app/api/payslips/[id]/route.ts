// GET /api/payslips/<id>: unduh satu Slip Gaji (PDF, BUSINESS-FLOW §20.5).
// Pemilik slip (salary:view-own) setelah penggajian selesai, atau Owner
// (salary:manage). Superadmin tidak punya keduanya (data gaji rahasia).

import { renderToBuffer } from "@react-pdf/renderer";
import { NextResponse } from "next/server";
import { getPayslipWithRun } from "@/features/salaries/queries";
import { documentMeta, toPayslipDoc } from "@/features/salaries/report/document-data";
import { PayslipsDocument } from "@/features/salaries/report/payslip-documents";
import { idSchema } from "@/features/salaries/schemas";
import { getCurrentUser } from "@/lib/auth/dal";
import { can } from "@/lib/auth/permissions";

const PRIVATE_HEADERS = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };

export async function GET(_request: Request, { params }: RouteContext<"/api/payslips/[id]">) {
  const user = await getCurrentUser();
  if (!user || user.mustChangePassword) return new NextResponse("Unauthorized", { status: 401 });
  if (!user.company) return new NextResponse("Forbidden", { status: 403 });

  const id = idSchema.safeParse((await params).id);
  if (!id.success) return new NextResponse("Not found", { status: 404, headers: PRIVATE_HEADERS });
  const found = await getPayslipWithRun(user.company.id, id.data);
  // Owner & Finance (salary:prepare) boleh membuka slip siapa pun.
  const isPreparer = can(user, "salary:prepare");
  const isOwn = !!found && found.userId === user.id && can(user, "salary:view-own") && found.status === "FINALIZED";
  if (!found || !(isPreparer || isOwn)) return new NextResponse("Not found", { status: 404, headers: PRIVATE_HEADERS });

  const meta = await documentMeta(user.company.id, found);
  const file = await renderToBuffer(PayslipsDocument({ meta, slips: [toPayslipDoc(found.payslip)] }));
  const name = found.payslip.fullName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return new NextResponse(new Uint8Array(file), {
    headers: {
      ...PRIVATE_HEADERS,
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="slip-gaji-${found.period}-${name}.pdf"`,
    },
  });
}
