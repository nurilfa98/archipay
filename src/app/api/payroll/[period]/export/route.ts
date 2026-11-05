// GET /api/payroll/2026-11/export?format=slips|recap|xlsx (BUSINESS-FLOW §20.5):
// semua Slip Gaji (PDF, satu halaman per karyawan), rekap (PDF), atau Excel
// (sheet Transfer & Rincian). Owner & Finance (salary:prepare) selama add-on
// Penggajian aktif. Slip & Excel hanya untuk penggajian yang sudah selesai;
// rekap boleh untuk draf (ditandai DRAF). Dibuat saat diminta, tidak disimpan.

import { renderToBuffer } from "@react-pdf/renderer";
import { NextResponse } from "next/server";
import writeXlsxFile, { type Row } from "write-excel-file/node";
import { getRun } from "@/features/salaries/queries";
import { bankText, documentMeta, toPayslipDoc } from "@/features/salaries/report/document-data";
import { PayrollRecapDocument, PayslipsDocument } from "@/features/salaries/report/payslip-documents";
import { periodSchema } from "@/features/salaries/schemas";
import { getCurrentUser } from "@/lib/auth/dal";
import { can } from "@/lib/auth/permissions";

const PRIVATE_HEADERS = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };

export async function GET(request: Request, { params }: RouteContext<"/api/payroll/[period]/export">) {
  const user = await getCurrentUser();
  if (!user || user.mustChangePassword) return new NextResponse("Unauthorized", { status: 401 });
  if (!user.company || !can(user, "salary:prepare")) return new NextResponse("Forbidden", { status: 403 });

  const period = periodSchema.safeParse((await params).period);
  const format = new URL(request.url).searchParams.get("format");
  if (!period.success || (format !== "slips" && format !== "recap" && format !== "xlsx")) {
    return new NextResponse("Parameter tidak valid.", { status: 400, headers: PRIVATE_HEADERS });
  }
  const run = await getRun(user.company.id, period.data);
  if (!run) return new NextResponse("Penggajian tidak ditemukan.", { status: 404, headers: PRIVATE_HEADERS });
  if (format !== "recap" && run.status !== "FINALIZED") {
    return new NextResponse("Selesaikan penggajian dulu.", { status: 409, headers: PRIVATE_HEADERS });
  }

  const meta = await documentMeta(user.company.id, run);
  const fileName = format === "slips" ? `slip-gaji-${run.period}` : `rekap-penggajian-${run.period}`;

  if (format === "slips" || format === "recap") {
    const file = await renderToBuffer(
      format === "slips"
        ? PayslipsDocument({ meta, slips: run.payslips.map(toPayslipDoc) })
        : PayrollRecapDocument({
            meta,
            statusText: run.status === "FINALIZED" ? "Selesai" : "DRAF (belum diselesaikan)",
            generatedBy: user.fullName,
            rows: run.payslips.map((slip) => ({
              fullName: slip.fullName,
              bankText: bankText(slip),
              totalEarnings: slip.totalEarnings,
              totalDeductions: slip.totalDeductions,
              netPay: slip.netPay,
            })),
          }),
    );
    return new NextResponse(new Uint8Array(file), {
      headers: {
        ...PRIVATE_HEADERS,
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${fileName}.pdf"`,
      },
    });
  }

  const bold = (value: string) => ({ value, fontWeight: "bold" as const });
  const money = (value: number) => ({ value, type: Number, format: "#,##0" });
  const transferRows: Row[] = [
    ["Nama", "Bank", "Nomor rekening", "Gaji bersih (Rp)"].map(bold),
    ...run.payslips.map((slip): Row => [
      { value: slip.fullName, type: String },
      { value: slip.bankName ?? "", type: String },
      // Teks agar angka nol di depan tidak hilang.
      { value: slip.bankAccountNumber ?? "", type: String },
      money(slip.netPay),
    ]),
    [
      bold("Total"),
      null,
      null,
      { ...money(run.payslips.reduce((sum, slip) => sum + slip.netPay, 0)), fontWeight: "bold" },
    ],
  ];
  const detailRows: Row[] = [
    ["Nama", "Jenis", "Keterangan", "Nominal (Rp)"].map(bold),
    ...run.payslips.flatMap((slip) =>
      slip.lines.map((line): Row => [
        { value: slip.fullName, type: String },
        { value: line.type === "EARNING" ? "Pendapatan" : "Potongan", type: String },
        { value: line.label, type: String },
        money(line.amount),
      ]),
    ),
  ];
  const file = await writeXlsxFile([
    {
      data: transferRows,
      sheet: "Transfer",
      columns: [{ width: 28 }, { width: 16 }, { width: 22 }, { width: 18 }],
      stickyRowsCount: 1,
    },
    {
      data: detailRows,
      sheet: "Rincian",
      columns: [{ width: 28 }, { width: 14 }, { width: 50 }, { width: 18 }],
      stickyRowsCount: 1,
    },
  ]).toBuffer();
  return new NextResponse(new Uint8Array(file), {
    headers: {
      ...PRIVATE_HEADERS,
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${fileName}.xlsx"`,
    },
  });
}
