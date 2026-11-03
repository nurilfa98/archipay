// GET /api/attendance/locations/template: template .xlsx impor lokasi absensi
// (Owner & Admin HR). Sheet "Lokasi" berisi judul kolom + 2 baris contoh,
// sheet "Petunjuk" berisi cara mengisi. Judul kolom harus sama dengan yang
// dibaca features/attendance/import-file.ts.
//
// Koordinat & jam ditulis sebagai TEKS agar Excel berbahasa Indonesia tidak
// mengubah titik desimal menjadi koma (atau angka ribuan).

import { NextResponse } from "next/server";
import writeXlsxFile, { type Row } from "write-excel-file/node";
import { IMPORT_COLUMNS } from "@/features/attendance/import-file";
import { getCurrentUser } from "@/lib/auth/dal";
import { can } from "@/lib/auth/permissions";

const COLUMNS = [
  { header: IMPORT_COLUMNS.name, width: 32 },
  { header: IMPORT_COLUMNS.coordinates, width: 26 },
  { header: IMPORT_COLUMNS.radius, width: 15 },
  { header: IMPORT_COLUMNS.timezone, width: 12 },
  { header: IMPORT_COLUMNS.project, width: 28 },
  { header: IMPORT_COLUMNS.workStart, width: 12 },
  { header: IMPORT_COLUMNS.workEnd, width: 12 },
];

const EXAMPLES = [
  ["Kantor Pusat", "-6.208763, 106.845599", "100", "WIB", "", "", ""],
  ["Proyek Rumah Bintaro", "-6.271810, 106.713350", "150", "WIB", "Rumah Tinggal Bintaro", "07:30", "16:30"],
];

const GUIDE = [
  ["Kolom", "Wajib", "Cara mengisi"],
  [IMPORT_COLUMNS.name, "Ya", "Nama unik, maks. 100 karakter. Nama yang sudah ada di ArchiPay akan ditolak."],
  [
    IMPORT_COLUMNS.coordinates,
    "Ya*",
    'Format "lintang, bujur" dengan titik desimal, misal -6.271810, 106.713350. Di Google Maps: klik kanan titik lokasi, lalu klik angka koordinatnya. *Boleh dikosongkan lalu dipilih di peta ArchiPay setelah diunggah.',
  ],
  [IMPORT_COLUMNS.radius, "Ya", "10 – 5000. Disarankan minimal 50 karena GPS HP bisa meleset 5–20 m."],
  [IMPORT_COLUMNS.timezone, "Ya", "WIB, WITA, atau WIT."],
  [IMPORT_COLUMNS.project, "Tidak", "Nama project persis seperti di menu Project. Kosongkan untuk kantor/gudang."],
  [IMPORT_COLUMNS.workStart, "Tidak", "Format 07:30. Kosongkan jam masuk & pulang untuk memakai jam kerja company."],
  [IMPORT_COLUMNS.workEnd, "Tidak", "Format 16:30. Isi bersama jam masuk."],
  ["", "", "Maksimal 200 lokasi per unggahan. Hapus baris contoh sebelum mengunggah."],
];

export async function GET() {
  const user = await getCurrentUser();
  if (!user || user.mustChangePassword) return new NextResponse("Unauthorized", { status: 401 });
  if (!user.company || !can(user, "attendance:manage-locations")) return new NextResponse("Forbidden", { status: 403 });

  const header: Row = COLUMNS.map((column) => ({
    value: column.header,
    fontWeight: "bold" as const,
  }));
  const examples: Row[] = EXAMPLES.map((row) => row.map((value) => ({ value, type: String })));
  const guide: Row[] = GUIDE.map((row, index) =>
    row.map((value) => ({
      value,
      type: String,
      ...(index === 0 ? { fontWeight: "bold" as const } : { wrap: true }),
    })),
  );

  const file = await writeXlsxFile([
    {
      data: [header, ...examples],
      sheet: "Lokasi",
      columns: COLUMNS.map((column) => ({ width: column.width })),
      stickyRowsCount: 1,
    },
    {
      data: guide,
      sheet: "Petunjuk",
      columns: [{ width: 18 }, { width: 8 }, { width: 90 }],
      stickyRowsCount: 1,
    },
  ]).toBuffer();

  return new NextResponse(new Uint8Array(file), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="template-lokasi-absensi.xlsx"',
      "Cache-Control": "private, no-store",
    },
  });
}
