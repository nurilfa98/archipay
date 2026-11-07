// Query Penggajian (BUSINESS-FLOW §20). Pemanggil WAJIB sudah mengecek hak
// akses (salary:prepare untuk data gaji & penggajian, salary:view-own untuk
// slip milik sendiri) dan membatasi ke company yang sedang dibuka.

import "server-only";
import { and, asc, desc, eq, inArray, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { io } from "next/cache";
import { db } from "@/lib/db";
import {
  companySettings,
  payrollRuns,
  payslipLines,
  payslips,
  salaryComponents,
  salaryProfiles,
  users,
} from "@/lib/db/schema";
import type {
  ComponentType,
  DailyRateMethod,
  DeductionBase,
  LineSource,
  LineType,
  OvertimeMethod,
  RunStatus,
} from "./constants";
import type { PayrollSettings, SalaryProfileInput } from "./payslip-math";

export async function getPayrollSettings(companyId: string): Promise<PayrollSettings & { workDays: number }> {
  await io();
  const [row] = await db
    .select({
      absenceDeduction: companySettings.payrollAbsenceDeduction,
      dailyRateMethod: companySettings.payrollDailyRateMethod,
      dailyDivisor: companySettings.payrollDailyDivisor,
      deductionBase: companySettings.payrollDeductionBase,
      overtimeMethod: companySettings.payrollOvertimeMethod,
      workDays: companySettings.workDays,
    })
    .from(companySettings)
    .where(eq(companySettings.companyId, companyId))
    .limit(1);
  if (!row) throw new Error(`Baris company_settings untuk perusahaan ${companyId} tidak ditemukan.`);
  return {
    ...row,
    dailyRateMethod: row.dailyRateMethod as DailyRateMethod,
    deductionBase: row.deductionBase as DeductionBase,
    overtimeMethod: row.overtimeMethod as OvertimeMethod,
  };
}

export type SalaryPerson = {
  id: string;
  fullName: string;
  email: string;
  isActive: boolean;
  hasBankAccount: boolean;
  profile: {
    baseSalary: number;
    allowances: number;
    deductions: number;
    startDate: string | null;
    endDate: string | null;
  } | null;
};

// Pengguna aktif company + pengguna nonaktif yang masih punya data gaji.
export async function listSalaryPeople(companyId: string): Promise<SalaryPerson[]> {
  await io();
  const rows = await db
    .select({
      id: users.id,
      fullName: users.fullName,
      email: users.email,
      isActive: users.isActive,
      bankAccountNumber: users.bankAccountNumber,
      baseSalary: salaryProfiles.baseSalary,
      startDate: salaryProfiles.startDate,
      endDate: salaryProfiles.endDate,
    })
    .from(users)
    .leftJoin(salaryProfiles, eq(salaryProfiles.userId, users.id))
    .where(and(eq(users.companyId, companyId), or(eq(users.isActive, true), sql`${salaryProfiles.userId} is not null`)))
    .orderBy(asc(users.fullName));

  const components = await componentsOf(rows.map((row) => row.id));
  return rows.map((row) => {
    const own = components.get(row.id) ?? [];
    const sum = (type: ComponentType) =>
      own.filter((component) => component.type === type && !component.perDay).reduce((t, c) => t + c.amount, 0);
    return {
      id: row.id,
      fullName: row.fullName,
      email: row.email,
      isActive: row.isActive,
      hasBankAccount: !!row.bankAccountNumber,
      profile:
        row.baseSalary == null
          ? null
          : {
              baseSalary: row.baseSalary,
              allowances: sum("ALLOWANCE"),
              deductions: sum("DEDUCTION"),
              startDate: row.startDate,
              endDate: row.endDate,
            },
    };
  });
}

export type SalaryPersonDetail = {
  user: {
    id: string;
    fullName: string;
    email: string;
    isActive: boolean;
    bankName: string | null;
    bankAccountNumber: string | null;
  };
  profile: SalaryProfileInput | null;
};

export async function getSalaryProfile(companyId: string, userId: string): Promise<SalaryPersonDetail | null> {
  await io();
  const [user] = await db
    .select({
      id: users.id,
      fullName: users.fullName,
      email: users.email,
      isActive: users.isActive,
      bankName: users.bankName,
      bankAccountNumber: users.bankAccountNumber,
    })
    .from(users)
    .where(and(eq(users.id, userId), eq(users.companyId, companyId)))
    .limit(1);
  if (!user) return null;
  const profiles = await listProfiles(companyId, [userId]);
  return { user, profile: profiles.get(userId) ?? null };
}

// Data gaji lengkap (dengan komponen) per pengguna; tanpa `userIds` = semua
// pengguna company yang punya data gaji.
export async function listProfiles(companyId: string, userIds?: string[]) {
  const rows = await db
    .select({
      userId: salaryProfiles.userId,
      baseSalary: salaryProfiles.baseSalary,
      dailyRate: salaryProfiles.dailyRate,
      overtimeHourlyRate: salaryProfiles.overtimeHourlyRate,
      startDate: salaryProfiles.startDate,
      endDate: salaryProfiles.endDate,
      absenceExempt: salaryProfiles.absenceExempt,
    })
    .from(salaryProfiles)
    .where(
      and(
        eq(salaryProfiles.companyId, companyId),
        userIds ? inArray(salaryProfiles.userId, userIds.length ? userIds : ["-"]) : undefined,
      ),
    );
  const components = await componentsOf(rows.map((row) => row.userId));
  return new Map<string, SalaryProfileInput>(
    rows.map(({ userId, ...profile }) => [userId, { ...profile, components: components.get(userId) ?? [] }]),
  );
}

async function componentsOf(userIds: string[]) {
  const result = new Map<string, SalaryProfileInput["components"]>();
  if (userIds.length === 0) return result;
  const rows = await db
    .select({
      userId: salaryComponents.userId,
      type: salaryComponents.type,
      name: salaryComponents.name,
      amount: salaryComponents.amount,
      perDay: salaryComponents.perDay,
    })
    .from(salaryComponents)
    .where(inArray(salaryComponents.userId, userIds))
    .orderBy(asc(salaryComponents.sortOrder));
  for (const { userId, type, ...component } of rows) {
    result.set(userId, [...(result.get(userId) ?? []), { ...component, type: type as ComponentType }]);
  }
  return result;
}

// ---------------------------------------------------------------------------
// Penggajian bulanan
// ---------------------------------------------------------------------------

export type RunSummary = {
  id: string;
  period: string;
  status: RunStatus;
  payDate: string | null;
  finalizedAt: Date | null;
  calculatedAt: Date;
  people: number;
  totalNet: number;
};

export async function listRuns(companyId: string): Promise<RunSummary[]> {
  await io();
  const rows = await db
    .select({
      id: payrollRuns.id,
      period: payrollRuns.period,
      status: payrollRuns.status,
      payDate: payrollRuns.payDate,
      finalizedAt: payrollRuns.finalizedAt,
      calculatedAt: payrollRuns.calculatedAt,
      people: sql`(select count(*) from ${payslips} where ${payslips.runId} = ${payrollRuns.id})`.mapWith(Number),
      totalNet:
        sql`(select coalesce(sum(${payslips.netPay}), 0) from ${payslips} where ${payslips.runId} = ${payrollRuns.id})`.mapWith(
          Number,
        ),
    })
    .from(payrollRuns)
    .where(eq(payrollRuns.companyId, companyId))
    .orderBy(desc(payrollRuns.period))
    .limit(60);
  return rows.map((row) => ({ ...row, status: row.status as RunStatus }));
}

export type PayslipLine = {
  id: string;
  type: LineType;
  source: LineSource;
  label: string;
  amount: number;
  refId: string | null;
  edited: boolean;
  postedAt: Date | null;
};

export type Payslip = {
  id: string;
  userId: string;
  fullName: string;
  bankName: string | null;
  bankAccountNumber: string | null;
  workingDays: number;
  presentDays: number | null;
  absentDays: number | null;
  unpaidLeaveDays: number | null;
  dailyRate: number | null;
  totalEarnings: number;
  totalDeductions: number;
  netPay: number;
  lines: PayslipLine[];
};

export type RunDetail = {
  id: string;
  period: string;
  status: RunStatus;
  payDate: string | null;
  calculatedAt: Date;
  finalizedAt: Date | null;
  finalizedByName: string | null;
  // Finance menekan "Kirim ke Owner" (null = belum / draf berubah sesudahnya).
  reviewRequestedAt: Date | null;
  reviewRequestedByName: string | null;
  payslips: Payslip[];
};

const reviewRequester = alias(users, "review_requester");

export async function getRun(companyId: string, period: string): Promise<RunDetail | null> {
  await io();
  const [run] = await db
    .select({
      id: payrollRuns.id,
      period: payrollRuns.period,
      status: payrollRuns.status,
      payDate: payrollRuns.payDate,
      calculatedAt: payrollRuns.calculatedAt,
      finalizedAt: payrollRuns.finalizedAt,
      finalizedByName: users.fullName,
      reviewRequestedAt: payrollRuns.reviewRequestedAt,
      reviewRequestedByName: reviewRequester.fullName,
    })
    .from(payrollRuns)
    .leftJoin(users, eq(payrollRuns.finalizedById, users.id))
    .leftJoin(reviewRequester, eq(payrollRuns.reviewRequestedById, reviewRequester.id))
    .where(and(eq(payrollRuns.companyId, companyId), eq(payrollRuns.period, period)))
    .limit(1);
  if (!run) return null;
  return { ...run, status: run.status as RunStatus, payslips: await listPayslips({ runId: run.id }) };
}

// Slip beserta barisnya: semua slip satu penggajian, atau satu slip.
export async function listPayslips(filter: { runId: string; userId?: string } | { payslipId: string }) {
  const rows = await db
    .select({
      id: payslips.id,
      userId: payslips.userId,
      fullName: payslips.fullName,
      bankName: payslips.bankName,
      bankAccountNumber: payslips.bankAccountNumber,
      workingDays: payslips.workingDays,
      presentDays: payslips.presentDays,
      absentDays: payslips.absentDays,
      unpaidLeaveDays: payslips.unpaidLeaveDays,
      dailyRate: payslips.dailyRate,
      totalEarnings: payslips.totalEarnings,
      totalDeductions: payslips.totalDeductions,
      netPay: payslips.netPay,
    })
    .from(payslips)
    .where(
      "payslipId" in filter
        ? eq(payslips.id, filter.payslipId)
        : and(eq(payslips.runId, filter.runId), filter.userId ? eq(payslips.userId, filter.userId) : undefined),
    )
    .orderBy(asc(payslips.fullName));
  if (rows.length === 0) return [];

  const lines = await db
    .select({
      id: payslipLines.id,
      payslipId: payslipLines.payslipId,
      type: payslipLines.type,
      source: payslipLines.source,
      label: payslipLines.label,
      amount: payslipLines.amount,
      refId: payslipLines.refId,
      edited: payslipLines.edited,
      postedAt: payslipLines.postedAt,
    })
    .from(payslipLines)
    .where(
      inArray(
        payslipLines.payslipId,
        rows.map((row) => row.id),
      ),
    )
    .orderBy(asc(payslipLines.sortOrder), asc(payslipLines.createdAt));

  const byPayslip = new Map<string, PayslipLine[]>();
  for (const { payslipId, type, source, ...line } of lines) {
    const item: PayslipLine = { ...line, type: type as LineType, source: source as LineSource };
    byPayslip.set(payslipId, [...(byPayslip.get(payslipId) ?? []), item]);
  }
  return rows.map((row) => ({ ...row, lines: byPayslip.get(row.id) ?? [] }));
}

// Slip milik sendiri dari penggajian yang sudah selesai (menu Slip Gaji).
export async function listOwnPayslips(companyId: string, userId: string) {
  await io();
  return db
    .select({
      id: payslips.id,
      period: payrollRuns.period,
      payDate: payrollRuns.payDate,
      netPay: payslips.netPay,
    })
    .from(payslips)
    .innerJoin(payrollRuns, eq(payslips.runId, payrollRuns.id))
    .where(and(eq(payslips.companyId, companyId), eq(payslips.userId, userId), eq(payrollRuns.status, "FINALIZED")))
    .orderBy(desc(payrollRuns.period));
}

// Satu slip + penggajiannya, untuk unduh PDF slip (route API).
export async function getPayslipWithRun(companyId: string, payslipId: string) {
  const [row] = await db
    .select({
      userId: payslips.userId,
      period: payrollRuns.period,
      status: payrollRuns.status,
      payDate: payrollRuns.payDate,
    })
    .from(payslips)
    .innerJoin(payrollRuns, eq(payslips.runId, payrollRuns.id))
    .where(and(eq(payslips.id, payslipId), eq(payslips.companyId, companyId)))
    .limit(1);
  if (!row) return null;
  const [payslip] = await listPayslips({ payslipId });
  return payslip ? { ...row, status: row.status as RunStatus, payslip } : null;
}
