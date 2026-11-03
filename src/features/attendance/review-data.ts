// Data review bulanan satu company (BUSINESS-FLOW §18.9), dipakai halaman
// /attendance/review, detail per karyawan, dan ekspor PDF/Excel.

import "server-only";
import { listHolidayDates, getLeaveSettings } from "./leave-queries";
import { listMonthRecords } from "./queries";
import { monthDates, summarizeMonth } from "./review";
import {
  countPendingLeavesInPeriod,
  getPeriodLock,
  listMonthLeaves,
  listMonthPenalties,
  listReviewPeople,
} from "./review-queries";

export const PERIOD_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

export async function getMonthReview(companyId: string, period: string, today: string) {
  const dates = monthDates(period);
  const [people, records, leaves, penalties, lock, pendingLeaves, settings, holidays] = await Promise.all([
    listReviewPeople(companyId, period),
    listMonthRecords(companyId, period),
    listMonthLeaves(companyId, period),
    listMonthPenalties(companyId, period),
    getPeriodLock(companyId, period),
    countPendingLeavesInPeriod(companyId, period),
    getLeaveSettings(companyId),
    listHolidayDates(companyId, dates[0], dates[dates.length - 1]),
  ]);
  const summaries = summarizeMonth({
    period,
    today,
    workDays: settings.workDays,
    holidays,
    people,
    records,
    leaves,
    penalties,
  });
  return { dates, people, records, leaves, penalties, lock, pendingLeaves, settings, holidays, summaries };
}

// "2026-11" → "November 2026"
export function periodLabel(period: string) {
  const [year, month] = period.split("-").map(Number);
  const names = [
    "Januari",
    "Februari",
    "Maret",
    "April",
    "Mei",
    "Juni",
    "Juli",
    "Agustus",
    "September",
    "Oktober",
    "November",
    "Desember",
  ];
  return `${names[month - 1]} ${year}`;
}

export function previousPeriod(period: string) {
  const [year, month] = period.split("-").map(Number);
  return month === 1 ? `${year - 1}-12` : `${year}-${String(month - 1).padStart(2, "0")}`;
}
