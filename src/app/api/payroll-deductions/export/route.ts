// GET /api/payroll-deductions/export: unduh daftar "Belum dipotong" sebagai
// CSV untuk bagian penggajian (OWNER & FINANCE).
//
// Format agar langsung rapi saat dibuka di Excel berbahasa Indonesia:
// - pemisah titik koma (;), karena Excel locale Indonesia memakai koma
//   sebagai pemisah desimal;
// - diawali BOM UTF-8 agar huruf non-ASCII pada nama terbaca benar;
// - nominal berupa angka bulat tanpa titik ribuan, agar bisa dijumlahkan.
//
// Referensi: node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/route.md

import { NextResponse } from "next/server";
import { listPayrollCandidates } from "@/features/payroll/queries";
import { getCurrentUser } from "@/lib/auth/dal";
import { can } from "@/lib/auth/permissions";
import { zonedDateString } from "@/lib/dates";

const HEADERS = ["Nama karyawan", "Email", "No. pertanggungjawaban", "No. uang muka", "Batas pengembalian", "Sisa (Rp)"];

export async function GET() {
  const user = await getCurrentUser();
  if (!user || user.mustChangePassword) return new NextResponse("Unauthorized", { status: 401 });
  if (!can(user, "payroll:manage")) return new NextResponse("Forbidden", { status: 403 });

  const candidates = await listPayrollCandidates();
  const lines = [
    HEADERS,
    ...candidates.map((candidate) => [
      candidate.recipientName,
      candidate.recipientEmail,
      candidate.settlementNumber,
      candidate.advanceNumber,
      zonedDateString(candidate.returnDueAt),
      String(candidate.outstanding),
    ]),
  ].map((row) => row.map(csvCell).join(";"));

  const today = zonedDateString(new Date());
  return new NextResponse("﻿" + lines.join("\r\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="potong-gaji-${today}.csv"`,
      "Cache-Control": "private, no-store",
    },
  });
}

// Kutip setiap sel; tanda kutip di dalam teks digandakan (standar CSV).
// Awalan = + - @ diberi tanda kutip tunggal agar tidak dijalankan sebagai
// rumus oleh Excel (CSV injection).
function csvCell(value: string) {
  const safe = /^[=+\-@]/.test(value) ? `'${value}` : value;
  return `"${safe.replace(/"/g, '""')}"`;
}
