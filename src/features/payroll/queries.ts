// Query daftar potong gaji.
//
// "Belum dipotong" = sisa uang muka yang sudah diverifikasi tetapi tidak
// dikembalikan sampai batas pengembalian lewat (status RETURN_PENDING &
// return_due_at < now()). Sesuai pernyataan yang disetujui karyawan saat
// menerima dana, sisa ini dipotong dari gaji.
//
// ArchiPay tidak menjalankan payroll: Finance mengekspor daftar ini untuk
// bagian penggajian, lalu menandai "sudah dipotong" setelah gaji dibayar.

import "server-only";
import { and, asc, desc, eq, like, lt, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { io } from "next/cache";
import { db } from "@/lib/db";
import { advanceLedgerEntries, advanceRequests, settlements, users } from "@/lib/db/schema";
import { env } from "@/lib/env";

const recipient = alias(users, "recipient");

const currentBalance = sql`coalesce((select sum(${advanceLedgerEntries.amount}) from ${advanceLedgerEntries} where ${advanceLedgerEntries.advanceId} = ${advanceRequests.id}), 0)`.mapWith(
  Number,
);

export type PayrollCandidate = {
  settlementId: string;
  settlementNumber: string;
  advanceNumber: string;
  purpose: string;
  recipientId: string;
  recipientName: string;
  recipientEmail: string;
  returnDueAt: Date;
  outstanding: number; // sisa yang belum kembali (positif)
};

export async function listPayrollCandidates(companyId: string): Promise<PayrollCandidate[]> {
  await io();
  const rows = await db
    .select({
      settlementId: settlements.id,
      settlementNumber: settlements.number,
      advanceNumber: advanceRequests.number,
      purpose: advanceRequests.purpose,
      recipientId: advanceRequests.recipientId,
      recipientName: recipient.fullName,
      recipientEmail: recipient.email,
      returnDueAt: settlements.returnDueAt,
      outstanding: currentBalance,
    })
    .from(settlements)
    .innerJoin(advanceRequests, eq(settlements.advanceId, advanceRequests.id))
    .innerJoin(recipient, eq(advanceRequests.recipientId, recipient.id))
    .where(
      and(
        eq(settlements.companyId, companyId),
        eq(advanceRequests.status, "RETURN_PENDING"),
        lt(settlements.returnDueAt, sql`now()`),
      ),
    )
    .orderBy(asc(recipient.fullName), asc(settlements.returnDueAt));

  // Laporan RETURN_PENDING selalu sudah bernomor & punya batas pengembalian.
  return rows.map((row) => ({ ...row, settlementNumber: row.settlementNumber!, returnDueAt: row.returnDueAt! }));
}

export type PayrollDeduction = {
  id: string;
  period: string; // "2026-11"
  amount: number; // positif
  settlementId: string;
  settlementNumber: string;
  advanceNumber: string;
  recipientName: string;
  createdByName: string;
  createdAt: Date;
};

// Riwayat potongan, difilter per periode gaji: tahun saja ("2026-%") atau
// tahun + bulan ("2026-11").
export async function listPayrollDeductions(
  companyId: string,
  filter: { year?: number; month?: number },
): Promise<PayrollDeduction[]> {
  await io();
  const createdBy = alias(users, "created_by");
  const period = filter.year
    ? filter.month
      ? eq(advanceLedgerEntries.payrollPeriod, `${filter.year}-${String(filter.month).padStart(2, "0")}`)
      : like(advanceLedgerEntries.payrollPeriod, `${filter.year}-%`)
    : undefined;

  const rows = await db
    .select({
      id: advanceLedgerEntries.id,
      period: advanceLedgerEntries.payrollPeriod,
      amount: advanceLedgerEntries.amount,
      settlementId: settlements.id,
      settlementNumber: settlements.number,
      advanceNumber: advanceRequests.number,
      recipientName: recipient.fullName,
      createdByName: createdBy.fullName,
      createdAt: advanceLedgerEntries.createdAt,
    })
    .from(advanceLedgerEntries)
    .innerJoin(advanceRequests, eq(advanceLedgerEntries.advanceId, advanceRequests.id))
    .innerJoin(settlements, eq(settlements.advanceId, advanceRequests.id))
    .innerJoin(recipient, eq(advanceRequests.recipientId, recipient.id))
    .innerJoin(createdBy, eq(advanceLedgerEntries.createdById, createdBy.id))
    .where(
      and(eq(advanceLedgerEntries.companyId, companyId), eq(advanceLedgerEntries.type, "PAYROLL_DEDUCTION"), period),
    )
    .orderBy(desc(advanceLedgerEntries.payrollPeriod), desc(advanceLedgerEntries.createdAt))
    .limit(500);

  return rows.map((row) => ({
    ...row,
    period: row.period ?? "-",
    amount: Math.abs(row.amount),
    settlementNumber: row.settlementNumber ?? "-",
  }));
}

// Tahun-tahun periode gaji yang punya potongan, untuk pilihan filter.
export async function listPayrollYears(companyId: string): Promise<number[]> {
  await io();
  const rows = await db
    .selectDistinct({ year: sql<string>`substr(${advanceLedgerEntries.payrollPeriod}, 1, 4)` })
    .from(advanceLedgerEntries)
    .where(and(eq(advanceLedgerEntries.companyId, companyId), eq(advanceLedgerEntries.type, "PAYROLL_DEDUCTION")));
  return rows.map((row) => Number(row.year)).filter(Boolean).sort((a, b) => b - a);
}

// Periode gaji bulan ini menurut zona waktu perusahaan, "2026-10". Dihitung
// database (now()) agar komponen tidak memanggil Date saat render.
export async function getCurrentPayrollPeriod(): Promise<string> {
  await io();
  const [row] = await db.execute<{ period: string }>(
    sql`select to_char(now() at time zone ${env.APP_TIMEZONE}, 'YYYY-MM') as period`,
  );
  return row.period;
}
