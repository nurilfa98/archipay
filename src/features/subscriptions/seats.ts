// Batas pengguna aktif per company (companies.user_limit), BUSINESS-FLOW §17.1.
// Dicek saat menambah pengguna baru dan mengaktifkan kembali pengguna, di
// DALAM transaksi yang sama dengan baris company dikunci (FOR UPDATE), agar
// dua penambahan bersamaan tidak melewati batas.

import "server-only";
import { and, count, eq } from "drizzle-orm";
import { io } from "next/cache";
import { db } from "@/lib/db";
import { companies, users } from "@/lib/db/schema";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export class SeatLimitError extends Error {
  constructor(public readonly limit: number) {
    super(
      `Batas ${limit} pengguna aktif paket company ini sudah penuh. Nonaktifkan pengguna lain atau tambah kuota pengguna di menu Langganan.`,
    );
  }
}

// Lempar SeatLimitError bila satu pengguna aktif lagi akan melewati batas.
export async function assertSeatAvailable(tx: Transaction, companyId: string) {
  const [company] = await tx
    .select({ userLimit: companies.userLimit })
    .from(companies)
    .where(eq(companies.id, companyId))
    .for("update");
  if (!company) throw new Error("Company tidak ditemukan");

  const [row] = await tx
    .select({ total: count() })
    .from(users)
    .where(and(eq(users.companyId, companyId), eq(users.isActive, true)));
  if ((row?.total ?? 0) >= company.userLimit) throw new SeatLimitError(company.userLimit);
}

// Pengguna aktif + batasnya, untuk tampilan (halaman Langganan, Pengguna, detail company).
export async function getSeatUsage(companyId: string) {
  await io();
  const [[company], [row]] = await Promise.all([
    db.select({ userLimit: companies.userLimit }).from(companies).where(eq(companies.id, companyId)).limit(1),
    db
      .select({ total: count() })
      .from(users)
      .where(and(eq(users.companyId, companyId), eq(users.isActive, true))),
  ]);
  return { limit: company?.userLimit ?? 0, active: row?.total ?? 0 };
}
