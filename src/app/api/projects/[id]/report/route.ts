// GET /api/projects/<id>/report: unduh laporan PDF satu project (hanya OWNER,
// permission project:manage, karena memuat nilai kontrak dan keuntungan).
//
// PDF dibuat saat diminta dengan data terbaru. Tidak ada yang disimpan.
// Project tidak ada = 404.
//
// Referensi:
// - node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/route.md
// - https://react-pdf.org/node

import { renderToBuffer } from "@react-pdf/renderer";
import { NextResponse } from "next/server";
import { ProjectReportDocument } from "@/features/projects/report/project-report-document";
import { getProjectReport } from "@/features/projects/report-queries";
import { projectIdSchema } from "@/features/projects/schemas";
import { getCurrentUser } from "@/lib/auth/dal";
import { can } from "@/lib/auth/permissions";
import { formatDateTime, zonedDateString } from "@/lib/dates";

const PRIVATE_HEADERS = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };

export async function GET(_request: Request, ctx: RouteContext<"/api/projects/[id]/report">) {
  const user = await getCurrentUser();
  if (!user || user.mustChangePassword) return new NextResponse("Unauthorized", { status: 401 });
  if (!can(user, "project:manage")) return new NextResponse("Forbidden", { status: 403 });

  const { id } = await ctx.params;
  const parsedId = projectIdSchema.safeParse(id);
  const report = parsedId.success ? await getProjectReport(parsedId.data) : null;
  if (!report) return new NextResponse("Project tidak ditemukan.", { status: 404, headers: PRIVATE_HEADERS });

  const now = new Date();
  // Dipanggil sebagai fungsi (tanpa hook) karena renderToBuffer hanya menerima
  // elemen <Document>, bukan elemen komponen pembungkusnya.
  const file = await renderToBuffer(
    ProjectReportDocument({ report, generatedAt: formatDateTime(now), generatedBy: user.fullName }),
  );

  return new NextResponse(new Uint8Array(file), {
    headers: {
      ...PRIVATE_HEADERS,
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="laporan-project-${slugify(report.project.name)}-${zonedDateString(now)}.pdf"`,
    },
  });
}

// "Gedung Kantor A/B" → "gedung-kantor-a-b" (aman untuk nama file).
function slugify(name: string) {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "project"
  );
}
