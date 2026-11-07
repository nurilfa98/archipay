// Rumus slip gaji (BUSINESS-FLOW §20.2–20.4). Fungsi murni: dipakai saat
// menyusun draf penggajian (run-actions.ts) dan saat menghitung total setiap
// baris berubah, sehingga angka di layar, PDF, dan Excel selalu sama.

import { isoWeekdayOf } from "@/features/attendance/leave-days";
import { dayStatus, monthDates, type ReviewLeave, type ReviewRecord } from "@/features/attendance/review";
import { formatOvertimeHours } from "@/features/attendance/overtime";
import { isWorkDay } from "@/features/attendance/schedule";
import { formatRupiah } from "@/lib/format";
import {
  MAX_DEDUCTION_PERCENT,
  type ComponentType,
  type DailyRateMethod,
  type DeductionBase,
  type OvertimeMethod,
} from "./constants";
import type { OvertimePay } from "./overtime-math";
import type { LineSource, LineType } from "./constants";

export type PayrollSettings = {
  absenceDeduction: boolean;
  dailyRateMethod: DailyRateMethod;
  dailyDivisor: number;
  deductionBase: DeductionBase;
  // Cara hitung upah lembur (BUSINESS-FLOW §24.5).
  overtimeMethod: OvertimeMethod;
};

export type SalaryComponentInput = { type: ComponentType; name: string; amount: number; perDay: boolean };

export type SalaryProfileInput = {
  baseSalary: number;
  dailyRate: number | null;
  // Hanya untuk cara hitung lembur CUSTOM.
  overtimeHourlyRate: number | null;
  startDate: string | null; // "2026-11-10"
  endDate: string | null;
  absenceExempt: boolean;
  components: SalaryComponentInput[];
};

export type LineDraft = { type: LineType; source: LineSource; label: string; amount: number; refId: string | null };

export type MonthDays = {
  workingDays: number; // hari kerja satu bulan penuh
  employedWorkingDays: number; // hari kerja dalam masa kerja
  outsideDays: number; // hari kerja di luar masa kerja (prorata)
  // Dari absensi, hanya dalam masa kerja. null = karyawan tidak tercatat di
  // absensi (add-on Absensi tidak aktif / tidak wajib absen).
  attendance: { present: number; absent: number; unpaidLeave: number } | null;
};

// Hitung hari kerja, masa kerja, dan (bila ada) kehadiran satu karyawan.
export function countMonthDays(input: {
  period: string;
  today: string;
  workDays: number;
  holidays: Set<string>;
  startDate: string | null;
  endDate: string | null;
  // Data absensi karyawan ini; `accountStartDate` = sebelum tanggal ini tidak
  // dihitung tidak hadir (sama dengan review absensi).
  tracked: { accountStartDate: string; records: ReviewRecord[]; leaves: ReviewLeave[] } | null;
}): MonthDays {
  const working = (date: string) => isWorkDay(input.workDays, isoWeekdayOf(date)) && !input.holidays.has(date);
  const employed = (date: string) =>
    (!input.startDate || date >= input.startDate) && (!input.endDate || date <= input.endDate);

  const result: MonthDays = { workingDays: 0, employedWorkingDays: 0, outsideDays: 0, attendance: null };
  const attendance = { present: 0, absent: 0, unpaidLeave: 0 };
  const records = new Map(input.tracked?.records.map((record) => [record.workDate, record]));

  for (const date of monthDates(input.period)) {
    if (working(date)) {
      result.workingDays += 1;
      if (employed(date)) result.employedWorkingDays += 1;
      else result.outsideDays += 1;
    }
    if (!input.tracked || !employed(date)) continue;
    const leave = input.tracked.leaves.find((item) => item.startDate <= date && item.endDate >= date);
    const status = dayStatus({
      date,
      today: input.today,
      startDate: input.tracked.accountStartDate,
      workDays: input.workDays,
      holidays: input.holidays,
      record: records.get(date),
      leave,
    });
    if (status === "PRESENT") attendance.present += 1;
    else if (status === "ABSENT") attendance.absent += 1;
    else if (status === "LEAVE" && leave && !leave.isPaid && working(date)) attendance.unpaidLeave += 1;
  }
  if (input.tracked) result.attendance = attendance;
  return result;
}

// Tarif per hari (dibulatkan ke rupiah). null = tidak bisa dihitung (mis.
// nominal per hari belum diisi), sehingga potongan harian tidak dibuat.
export function dailyRateOf(settings: PayrollSettings, profile: SalaryProfileInput, workingDays: number) {
  const monthlyAllowances = profile.components
    .filter((component) => component.type === "ALLOWANCE" && !component.perDay)
    .reduce((total, component) => total + component.amount, 0);
  const base = profile.baseSalary + (settings.deductionBase === "BASE_ALLOWANCES" ? monthlyAllowances : 0);
  switch (settings.dailyRateMethod) {
    case "WORKING_DAYS":
      return workingDays > 0 ? Math.round(base / workingDays) : null;
    case "FIXED_DIVISOR":
      return settings.dailyDivisor > 0 ? Math.round(base / settings.dailyDivisor) : null;
    case "FIXED_AMOUNT":
      return profile.dailyRate;
  }
}

const days = (count: number, rate: number) => `${count} hari × ${formatRupiah(rate)}`;

// Baris otomatis dari data gaji + hari (tanpa sisa uang muka & denda, yang
// ditambahkan pemanggil dari data Potong Gaji).
export function salaryLines(input: {
  settings: PayrollSettings;
  profile: SalaryProfileInput;
  days: MonthDays;
  dailyRate: number | null;
  // Potong otomatis ketidakhadiran berlaku (pengaturan nyala + add-on Absensi aktif).
  absenceDeductionActive: boolean;
}): LineDraft[] {
  const { profile, days: month, dailyRate } = input;
  const lines: LineDraft[] = [
    { type: "EARNING", source: "BASE", label: "Gaji pokok", amount: profile.baseSalary, refId: null },
  ];
  // Hari hadir untuk tunjangan per hari: dari absensi, atau hari kerja dalam
  // masa kerja bila karyawan tidak tercatat di absensi.
  const presentDays = month.attendance ? month.attendance.present : month.employedWorkingDays;

  for (const component of profile.components) {
    if (component.type === "ALLOWANCE" && component.perDay) {
      lines.push({
        type: "EARNING",
        source: "ALLOWANCE_PER_DAY",
        label: `${component.name} (${days(presentDays, component.amount)})`,
        amount: presentDays * component.amount,
        refId: null,
      });
    } else if (component.type === "ALLOWANCE") {
      lines.push({
        type: "EARNING",
        source: "ALLOWANCE",
        label: component.name,
        amount: component.amount,
        refId: null,
      });
    } else {
      lines.push({
        type: "DEDUCTION",
        source: "FIXED_DEDUCTION",
        label: component.name,
        amount: component.amount,
        refId: null,
      });
    }
  }

  if (dailyRate && month.outsideDays > 0) {
    lines.push({
      type: "DEDUCTION",
      source: "PRORATE",
      label: `Di luar masa kerja (${days(month.outsideDays, dailyRate)})`,
      amount: month.outsideDays * dailyRate,
      refId: null,
    });
  }

  if (input.absenceDeductionActive && !profile.absenceExempt && month.attendance && dailyRate) {
    const { absent, unpaidLeave } = month.attendance;
    const total = absent + unpaidLeave;
    if (total > 0) {
      const parts = [
        absent > 0 ? `tidak hadir ${absent} hari` : null,
        unpaidLeave > 0 ? `cuti/izin tidak dibayar ${unpaidLeave} hari` : null,
      ].filter(Boolean);
      lines.push({
        type: "DEDUCTION",
        source: "ABSENCE",
        label: `Potongan ${parts.join(" + ")} (${days(total, dailyRate)})`,
        amount: total * dailyRate,
        refId: null,
      });
    }
  }
  return lines;
}

// Baris pendapatan "Upah lembur" (satu per bulan). null = tidak ada lembur. Tarif sendiri yang belum
// diisi menghasilkan baris Rp0 sebagai peringatan di draf (penggajian tidak bisa diselesaikan
// sebelum baris itu diperbaiki atau dihapus).
export function overtimeLine(pay: OvertimePay): LineDraft | null {
  if (pay.days === 0) return null;
  const detail = `${pay.days} hari, ${formatOvertimeHours(Math.round(pay.hours * 60))}`;
  if (pay.missingRate) {
    return {
      type: "EARNING",
      source: "OVERTIME",
      label: `Upah lembur (${detail}): isi tarif lembur di Data gaji`,
      amount: 0,
      refId: null,
    };
  }
  if (pay.amount <= 0) return null;
  return { type: "EARNING", source: "OVERTIME", label: `Upah lembur (${detail})`, amount: pay.amount, refId: null };
}

export function totalsOf(lines: readonly { type: LineType; amount: number }[]) {
  const earnings = lines.filter((line) => line.type === "EARNING").reduce((total, line) => total + line.amount, 0);
  const deductions = lines.filter((line) => line.type === "DEDUCTION").reduce((total, line) => total + line.amount, 0);
  return { earnings, deductions, net: earnings - deductions };
}

// Potongan melebihi 50% pendapatan (PP 36/2021): peringatan, tidak menghalangi.
export function exceedsDeductionLimit(totals: { earnings: number; deductions: number }) {
  return totals.deductions > (totals.earnings * MAX_DEDUCTION_PERCENT) / 100;
}

// Masa kerja mencakup bulan ini?
export function employedInPeriod(period: string, startDate: string | null, endDate: string | null) {
  const dates = monthDates(period);
  const first = dates[0];
  const last = dates[dates.length - 1];
  return (!startDate || startDate <= last) && (!endDate || endDate >= first);
}
