// GET /api/payroll-deductions/export: unduh daftar "Belum dipotong" sebagai
// file Excel (.xlsx) untuk bagian penggajian (OWNER & FINANCE).
//
// Kenapa .xlsx, bukan CSV? Excel membaca CSV memakai "List separator" di
// pengaturan Region Windows masing-masing laptop (bisa koma, titik koma, atau
// titik). Bila tidak cocok, isi kolom tercampur. File .xlsx sudah menyimpan
// kolomnya sendiri, jadi selalu rapi di laptop mana pun.
// - Sisa berupa angka (format ribuan), bisa langsung dijumlahkan.
// - Batas pengembalian berupa tanggal Excel (bisa diurutkan/difilter).
// - Teks disimpan sebagai teks biasa, bukan rumus, jadi aman dari injeksi
//   rumus (= + - @).
//
// Daftar kosong → 409 tanpa file, agar tidak terunduh file berisi judul kolom
// saja (tombol di halaman menampilkan toast, lihat payroll-export-button.tsx).
//
// Referensi:
// - node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/route.md
// - node_modules/write-excel-file/README.md

import { NextResponse } from "next/server";
import writeXlsxFile, { type Row } from "write-excel-file/node";
import { listPayrollCandidates } from "@/features/payroll/queries";
import { getCurrentUser } from "@/lib/auth/dal";
import { can } from "@/lib/auth/permissions";
import { zonedDateString } from "@/lib/dates";

const COLUMNS = [
  { header: "Nama karyawan", width: 28 },
  { header: "Email", width: 32 },
  { header: "No. pertanggungjawaban", width: 24 },
  { header: "No. uang muka", width: 18 },
  { header: "Batas pengembalian", width: 20 },
  { header: "Sisa (Rp)", width: 16 },
];

export async function GET() {
  const user = await getCurrentUser();
  if (!user || user.mustChangePassword) return new NextResponse("Unauthorized", { status: 401 });
  if (!can(user, "payroll:manage")) return new NextResponse("Forbidden", { status: 403 });

  const candidates = await listPayrollCandidates();
  if (candidates.length === 0) {
    return new NextResponse("Belum ada sisa uang muka yang perlu dipotong dari gaji.", {
      status: 409,
      headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "private, no-store" },
    });
  }

  const rows: Row[] = [
    COLUMNS.map((column) => ({ value: column.header, fontWeight: "bold" as const })),
    ...candidates.map((candidate): Row => [
      { value: candidate.recipientName, type: String },
      { value: candidate.recipientEmail, type: String },
      { value: candidate.settlementNumber, type: String },
      { value: candidate.advanceNumber, type: String },
      { value: dateOnly(zonedDateString(candidate.returnDueAt)), type: Date, format: "dd/mm/yyyy" },
      { value: candidate.outstanding, type: Number, format: "#,##0" },
    ]),
  ];

  const file = await writeXlsxFile(rows, {
    sheet: "Potong Gaji",
    columns: COLUMNS.map((column) => ({ width: column.width })),
    stickyRowsCount: 1,
  }).toBuffer();

  const today = zonedDateString(new Date());
  return new NextResponse(new Uint8Array(file), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="potong-gaji-${today}.xlsx"`,
      "Cache-Control": "private, no-store",
    },
  });
}

// "2026-10-25" (tanggal WIB) → Date tengah malam UTC. write-excel-file
// menghitung tanggal Excel dari UTC, jadi tanggalnya tidak bergeser sehari.
function dateOnly(value: string) {
  return new Date(`${value}T00:00:00Z`);
}
