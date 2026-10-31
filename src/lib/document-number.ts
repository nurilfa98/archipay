// Nomor transaksi berformat PREFIX-TAHUN-BULAN-URUTAN, misalnya
// "UM-2026-10-0001". Urutan mulai dari 0001 lagi setiap bulan baru, sehingga
// transaksi mudah didata per bulan.
//
// Tahun & bulan memakai zona waktu PERUSAHAAN (APP_TIMEZONE), bukan server:
// uang muka 1 November pukul 00.30 WIB tetap masuk November walau server
// (UTC) masih 31 Oktober.
//
// WAJIB dipanggil di dalam db.transaction() yang sama dengan INSERT
// dokumennya. Baris penghitung terkunci sampai transaksi selesai, sehingga
// dua penyimpanan bersamaan tidak mendapat nomor kembar, dan bila transaksi
// gagal kenaikan nomornya ikut dibatalkan (tidak ada nomor yang terlewat).
//
// Referensi: https://www.postgresql.org/docs/current/sql-insert.html#SQL-ON-CONFLICT

import "server-only";
import { sql } from "drizzle-orm";
import type { db } from "@/lib/db";
import { documentSequences } from "@/lib/db/schema";
import { zonedYearMonth } from "@/lib/dates";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type DocumentNumber = {
  number: string; // "UM-2026-10-0001"
  periodYear: number;
  periodMonth: number;
};

// Urutan nomor terpisah per company: UM-2026-10-0001 di company A tidak
// berhubungan dengan UM-2026-10-0001 di company B.
export async function nextDocumentNumber(
  tx: Transaction,
  companyId: string,
  prefix: string,
  date: Date,
): Promise<DocumentNumber> {
  const { year, month } = zonedYearMonth(date);
  const [row] = await tx
    .insert(documentSequences)
    .values({ companyId, prefix, periodYear: year, periodMonth: month, lastValue: 1 })
    .onConflictDoUpdate({
      target: [
        documentSequences.companyId,
        documentSequences.prefix,
        documentSequences.periodYear,
        documentSequences.periodMonth,
      ],
      set: { lastValue: sql`${documentSequences.lastValue} + 1` },
    })
    .returning({ lastValue: documentSequences.lastValue });

  return {
    number: formatDocumentNumber(prefix, year, month, row.lastValue),
    periodYear: year,
    periodMonth: month,
  };
}

// ("UM", 2026, 10, 1) → "UM-2026-10-0001". Lebih dari 9999 per bulan
// tetap aman, hanya menjadi 5 digit.
function formatDocumentNumber(prefix: string, year: number, month: number, sequence: number) {
  return `${prefix}-${year}-${String(month).padStart(2, "0")}-${String(sequence).padStart(4, "0")}`;
}
