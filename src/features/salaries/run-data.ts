// Penyusun draf slip gaji satu bulan (BUSINESS-FLOW §20.4). Mengumpulkan data
// gaji, hari kerja & absensi, sisa uang muka (Potong Gaji), dan denda, lalu
// membentuk baris otomatis per karyawan. Tidak menulis ke database; yang
// menyimpan adalah run-actions.ts.
//
// Sisa uang muka & denda selalu disusun dari sumber aslinya:
// - yang SUDAH dicatat untuk periode gaji ini (ledger potong gaji / denda
//   ditandai dipotong) → baris tercatat (`postedAt`), tidak bisa diubah;
// - yang belum (daftar Potong Gaji) → baris usulan, dicatat saat diselesaikan.

import "server-only";
import { and, eq, inArray, sql } from "drizzle-orm";
import { listHolidayDates } from "@/features/attendance/leave-queries";
import { listMonthRecords } from "@/features/attendance/queries";
import { monthDates } from "@/features/attendance/review";
import { periodLabel } from "@/features/attendance/review-data";
import { listMonthLeaves, listPenaltyCandidates, listReviewPeople } from "@/features/attendance/review-queries";
import { listPayrollCandidates } from "@/features/payroll/queries";
import { zonedDateString } from "@/lib/dates";
import { db } from "@/lib/db";
import { advanceLedgerEntries, advanceRequests, attendancePenalties, settlements, users } from "@/lib/db/schema";
import { getPayrollSettings, listProfiles } from "./queries";
import {
  countMonthDays,
  dailyRateOf,
  employedInPeriod,
  salaryLines,
  type LineDraft,
  type MonthDays,
} from "./payslip-math";

export type PayslipDraft = {
  userId: string;
  fullName: string;
  bankName: string | null;
  bankAccountNumber: string | null;
  days: MonthDays;
  dailyRate: number | null;
  // Baris tercatat membawa waktu pencatatannya.
  lines: (LineDraft & { postedAt: Date | null })[];
};

export async function buildPayslipDrafts(
  companyId: string,
  period: string,
  options: { attendanceActive: boolean },
): Promise<PayslipDraft[]> {
  const dates = monthDates(period);
  const first = dates[0];
  const last = dates[dates.length - 1];
  const today = zonedDateString(new Date());

  const [settings, profiles, holidays] = await Promise.all([
    getPayrollSettings(companyId),
    listProfiles(companyId),
    listHolidayDates(companyId, first, last),
  ]);
  const userIds = [...profiles.keys()];
  if (userIds.length === 0) return [];

  const people = await db
    .select({
      id: users.id,
      fullName: users.fullName,
      isActive: users.isActive,
      bankName: users.bankName,
      bankAccountNumber: users.bankAccountNumber,
    })
    .from(users)
    .where(and(eq(users.companyId, companyId), inArray(users.id, userIds)));

  // Absensi bulan ini (hanya bila add-on Absensi aktif).
  const [reviewPeople, records, leaves] = options.attendanceActive
    ? await Promise.all([
        listReviewPeople(companyId, period),
        listMonthRecords(companyId, period),
        listMonthLeaves(companyId, period),
      ])
    : [[], [], []];
  const tracked = new Map(reviewPeople.map((person) => [person.id, person.startDate]));

  const [advanceCandidates, postedAdvances, penaltyCandidates, postedPenalties, reimbursementCandidates, postedReimbursements] =
    await Promise.all([
      listPayrollCandidates(companyId),
      listPostedAdvances(companyId, period),
      listPenaltyCandidates(companyId),
      listPostedPenalties(companyId, period),
      listReimbursementCandidates(companyId),
      listPostedReimbursements(companyId, period),
    ]);

  const absenceDeductionActive = settings.absenceDeduction && options.attendanceActive;
  const drafts: PayslipDraft[] = [];

  for (const person of people) {
    const profile = profiles.get(person.id);
    if (!profile || !employedInPeriod(period, profile.startDate, profile.endDate)) continue;
    // Pengguna nonaktif hanya ikut bila berhenti di bulan ini.
    if (!person.isActive && !(profile.endDate && profile.endDate >= first)) continue;

    const accountStartDate = tracked.get(person.id);
    const days = countMonthDays({
      period,
      today,
      workDays: settings.workDays,
      holidays,
      startDate: profile.startDate,
      endDate: profile.endDate,
      tracked:
        accountStartDate != null
          ? {
              accountStartDate,
              records: records.filter((record) => record.userId === person.id),
              leaves: leaves.filter((leave) => leave.userId === person.id),
            }
          : null,
    });
    const dailyRate = dailyRateOf(settings, profile, days.workingDays);
    const lines: PayslipDraft["lines"] = salaryLines({
      settings,
      profile,
      days,
      dailyRate,
      absenceDeductionActive,
    }).map((line) => ({ ...line, postedAt: null }));

    for (const advance of postedAdvances.filter((row) => row.recipientId === person.id)) {
      lines.push({
        type: "DEDUCTION",
        source: "ADVANCE",
        label: `Sisa uang muka ${advance.advanceNumber} (${advance.settlementNumber ?? "-"})`,
        amount: advance.amount,
        refId: advance.settlementId,
        postedAt: advance.postedAt,
      });
    }
    for (const advance of advanceCandidates.filter((row) => row.recipientId === person.id)) {
      lines.push({
        type: "DEDUCTION",
        source: "ADVANCE",
        label: `Sisa uang muka ${advance.advanceNumber} (${advance.settlementNumber})`,
        amount: advance.outstanding,
        refId: advance.settlementId,
        postedAt: null,
      });
    }
    // Penggantian kekurangan (kantor nombok) dibayar lewat slip: pendapatan,
    // dicatat ke ledger saat penggajian diselesaikan (tanpa konfirmasi karyawan,
    // slip sendiri buktinya). Hapus baris di draf bila dibayar dengan cara lain.
    for (const item of postedReimbursements.filter((row) => row.recipientId === person.id)) {
      lines.push({
        type: "EARNING",
        source: "REIMBURSE",
        label: `Penggantian uang muka ${item.advanceNumber} (${item.settlementNumber ?? "-"})`,
        amount: item.amount,
        refId: item.settlementId,
        postedAt: item.postedAt,
      });
    }
    for (const item of reimbursementCandidates.filter((row) => row.recipientId === person.id)) {
      lines.push({
        type: "EARNING",
        source: "REIMBURSE",
        label: `Penggantian uang muka ${item.advanceNumber} (${item.settlementNumber ?? "-"})`,
        amount: item.outstanding,
        refId: item.settlementId,
        postedAt: null,
      });
    }
    for (const penalty of postedPenalties.filter((row) => row.userId === person.id)) {
      lines.push({
        type: "DEDUCTION",
        source: "PENALTY",
        label: `Denda keterlambatan ${periodLabel(penalty.period)} (${penalty.count}×)`,
        amount: penalty.total,
        refId: penalty.period,
        postedAt: penalty.postedAt,
      });
    }
    for (const penalty of penaltyCandidates.filter((row) => row.userId === person.id)) {
      lines.push({
        type: "DEDUCTION",
        source: "PENALTY",
        label: `Denda keterlambatan ${periodLabel(penalty.period)} (${penalty.count}×)`,
        amount: penalty.total,
        refId: penalty.period,
        postedAt: null,
      });
    }

    drafts.push({
      userId: person.id,
      fullName: person.fullName,
      bankName: person.bankName,
      bankAccountNumber: person.bankAccountNumber,
      days,
      dailyRate,
      lines,
    });
  }
  return drafts.sort((a, b) => a.fullName.localeCompare(b.fullName, "id"));
}

// Potong gaji uang muka yang sudah dicatat untuk periode gaji ini, per laporan.
async function listPostedAdvances(companyId: string, period: string) {
  return db
    .select({
      recipientId: advanceRequests.recipientId,
      advanceNumber: advanceRequests.number,
      settlementId: settlements.id,
      settlementNumber: settlements.number,
      amount: sql`-sum(${advanceLedgerEntries.amount})`.mapWith(Number),
      postedAt: sql<Date>`max(${advanceLedgerEntries.createdAt})`.mapWith((value) => new Date(value)),
    })
    .from(advanceLedgerEntries)
    .innerJoin(advanceRequests, eq(advanceLedgerEntries.advanceId, advanceRequests.id))
    .innerJoin(settlements, eq(settlements.advanceId, advanceRequests.id))
    .where(
      and(
        eq(advanceLedgerEntries.companyId, companyId),
        eq(advanceLedgerEntries.type, "PAYROLL_DEDUCTION"),
        eq(advanceLedgerEntries.payrollPeriod, period),
      ),
    )
    .groupBy(advanceRequests.recipientId, advanceRequests.number, settlements.id, settlements.number);
}

// Penggantian kekurangan yang belum dibayar (uang muka REIMBURSE_PENDING): sisa
// kewajiban kantor ke karyawan, positif.
async function listReimbursementCandidates(companyId: string) {
  return db
    .select({
      recipientId: advanceRequests.recipientId,
      advanceNumber: advanceRequests.number,
      settlementId: settlements.id,
      settlementNumber: settlements.number,
      outstanding:
        sql`-coalesce((select sum(${advanceLedgerEntries.amount}) from ${advanceLedgerEntries} where ${advanceLedgerEntries.advanceId} = ${advanceRequests.id}), 0)`.mapWith(
          Number,
        ),
    })
    .from(settlements)
    .innerJoin(advanceRequests, eq(settlements.advanceId, advanceRequests.id))
    .where(and(eq(settlements.companyId, companyId), eq(advanceRequests.status, "REIMBURSE_PENDING")));
}

// Penggantian yang sudah dicatat lewat slip gaji periode ini, per laporan.
async function listPostedReimbursements(companyId: string, period: string) {
  return db
    .select({
      recipientId: advanceRequests.recipientId,
      advanceNumber: advanceRequests.number,
      settlementId: settlements.id,
      settlementNumber: settlements.number,
      amount: sql`sum(${advanceLedgerEntries.amount})`.mapWith(Number),
      postedAt: sql<Date>`max(${advanceLedgerEntries.createdAt})`.mapWith((value) => new Date(value)),
    })
    .from(advanceLedgerEntries)
    .innerJoin(advanceRequests, eq(advanceLedgerEntries.advanceId, advanceRequests.id))
    .innerJoin(settlements, eq(settlements.advanceId, advanceRequests.id))
    .where(
      and(
        eq(advanceLedgerEntries.companyId, companyId),
        eq(advanceLedgerEntries.type, "REIMBURSEMENT"),
        eq(advanceLedgerEntries.method, "PAYROLL"),
        eq(advanceLedgerEntries.payrollPeriod, period),
      ),
    )
    .groupBy(advanceRequests.recipientId, advanceRequests.number, settlements.id, settlements.number);
}

// Denda yang sudah ditandai dipotong untuk periode gaji ini, per bulan absen.
async function listPostedPenalties(companyId: string, period: string) {
  return db
    .select({
      userId: attendancePenalties.userId,
      period: attendancePenalties.period,
      count: sql`count(*)`.mapWith(Number),
      total: sql`sum(${attendancePenalties.amount})`.mapWith(Number),
      postedAt: sql<Date>`max(${attendancePenalties.deductedAt})`.mapWith((value) => new Date(value)),
    })
    .from(attendancePenalties)
    .where(
      and(
        eq(attendancePenalties.companyId, companyId),
        eq(attendancePenalties.status, "ACTIVE"),
        eq(attendancePenalties.payrollPeriod, period),
        sql`${attendancePenalties.deductedAt} is not null`,
      ),
    )
    .groupBy(attendancePenalties.userId, attendancePenalties.period);
}
