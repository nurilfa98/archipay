// GET /api/attendance/review/export?period=2026-11&format=pdf|xlsx: rekap
// absensi bulanan (BUSINESS-FLOW §18.9) untuk dicetak (PDF) atau diolah bagian
// penggajian (Excel: sheet Rekap & Denda). Owner, Admin HR, Superadmin
// (attendance:view-all). Dibuat saat diminta, tidak disimpan.

import { renderToBuffer } from "@react-pdf/renderer";
import { NextResponse } from "next/server";
import writeXlsxFile, { type Row } from "write-excel-file/node";
import { AttendanceReportDocument } from "@/features/attendance/report/attendance-report-document";
import { getMonthReview, PERIOD_PATTERN, periodLabel } from "@/features/attendance/review-data";
import { getCurrentUser } from "@/lib/auth/dal";
import { can } from "@/lib/auth/permissions";
import { formatDateOnly, formatDateTime, zonedDateString } from "@/lib/dates";

const PRIVATE_HEADERS = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user || user.mustChangePassword) return new NextResponse("Unauthorized", { status: 401 });
  if (!user.company || !can(user, "attendance:view-all")) return new NextResponse("Forbidden", { status: 403 });

  const url = new URL(request.url);
  const period = url.searchParams.get("period") ?? "";
  const format = url.searchParams.get("format");
  if (!PERIOD_PATTERN.test(period) || (format !== "pdf" && format !== "xlsx")) {
    return new NextResponse("Parameter tidak valid.", { status: 400, headers: PRIVATE_HEADERS });
  }

  const now = new Date();
  const review = await getMonthReview(user.company.id, period, zonedDateString(now));
  const label = periodLabel(period);
  const penalties = review.penalties.map((penalty) => ({
    fullName: penalty.userName,
    date: penalty.workDate,
    dateText: formatDateOnly(penalty.workDate),
    lateMinutes: penalty.lateMinutes,
    amount: penalty.amount,
    statusText:
      penalty.status === "WAIVED"
        ? "Dibebaskan"
        : penalty.deductedAt
          ? `Dipotong (gaji ${penalty.payrollPeriod})`
          : "Berlaku",
  }));
  const fileName = `rekap-absensi-${period}`;

  if (format === "pdf") {
    const file = await renderToBuffer(
      AttendanceReportDocument({
        companyName: user.company.name,
        periodLabel: label,
        lockText: review.lock ? `Periode dikunci ${formatDateTime(review.lock.lockedAt)}` : "Periode BELUM dikunci",
        generatedAt: formatDateTime(now),
        generatedBy: user.fullName,
        summaries: review.summaries,
        penalties,
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
  const summaryRows: Row[] = [
    [
      "Karyawan",
      "Hadir",
      "Terlambat (kali)",
      "Terlambat (menit)",
      "Pulang cepat",
      "Di luar radius",
      "Tidak absen pulang",
      "Tidak hadir",
      "Lembur (hari)",
      "Lembur (jam)",
      "Absen hari libur tanpa izin (hari)",
      "Cuti/izin dibayar (hari)",
      "Cuti/izin tidak dibayar (hari)",
      "Denda berlaku (Rp)",
      "Denda dibebaskan (kali)",
    ].map(bold),
    ...review.summaries.map((row): Row => [
      { value: row.fullName, type: String },
      { value: row.present, type: Number },
      { value: row.lateCount, type: Number },
      { value: row.lateMinutes, type: Number },
      { value: row.earlyCount, type: Number },
      { value: row.outsideCount, type: Number },
      { value: row.noCheckout, type: Number },
      { value: row.absent, type: Number },
      { value: row.overtimeDays, type: Number },
      { value: row.overtimeMinutes / 60, type: Number, format: "0.0" },
      { value: row.holidayWorkNoOrderDays, type: Number },
      { value: row.paidLeaveDays, type: Number },
      { value: row.unpaidLeaveDays, type: Number },
      { value: row.penaltyTotal, type: Number, format: "#,##0" },
      { value: row.waivedCount, type: Number },
    ]),
  ];
  const penaltyRows: Row[] = [
    ["Karyawan", "Tanggal", "Terlambat (menit)", "Denda (Rp)", "Status"].map(bold),
    ...penalties.map((row): Row => [
      { value: row.fullName, type: String },
      { value: new Date(`${row.date}T00:00:00Z`), type: Date, format: "dd/mm/yyyy" },
      { value: row.lateMinutes, type: Number },
      { value: row.amount, type: Number, format: "#,##0" },
      { value: row.statusText, type: String },
    ]),
  ];
  const file = await writeXlsxFile([
    {
      data: summaryRows,
      sheet: "Rekap",
      columns: [{ width: 28 }, ...Array.from({ length: 14 }, () => ({ width: 14 }))],
      stickyRowsCount: 1,
    },
    {
      data: penaltyRows,
      sheet: "Denda",
      columns: [{ width: 28 }, { width: 14 }, { width: 16 }, { width: 14 }, { width: 24 }],
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
