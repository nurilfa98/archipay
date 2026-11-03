// Rekap absensi bulanan per karyawan (BUSINESS-FLOW §18.8–18.9), dihitung saat
// dibuka dari absen, cuti/izin yang disetujui, hari kerja/libur, dan denda.
// Fungsi murni: dipakai halaman review, PDF, dan Excel.

import { addDays, datesBetween, isoWeekdayOf } from "./leave-days";
import { isWorkDay } from "./schedule";

export type ReviewPerson = { id: string; fullName: string; startDate: string };
export type ReviewRecord = {
  id: string;
  userId: string;
  workDate: string;
  lateMinutes: number;
  earlyMinutes: number | null;
  checkInInRadius: boolean;
  checkOutInRadius: boolean | null;
  checkOutAt: Date | null;
  isWorkDay: boolean;
};
export type ReviewLeave = {
  userId: string;
  typeName: string;
  isPaid: boolean;
  startDate: string;
  endDate: string;
};
export type ReviewPenalty = { userId: string; amount: number; status: string };

export type DayStatus = "PRESENT" | "LEAVE" | "ABSENT" | "OFF" | "UPCOMING";

export type PersonSummary = {
  userId: string;
  fullName: string;
  present: number;
  lateCount: number;
  lateMinutes: number;
  earlyCount: number;
  outsideCount: number;
  noCheckout: number;
  absent: number;
  paidLeaveDays: number;
  unpaidLeaveDays: number;
  leaveByType: Record<string, number>;
  penaltyTotal: number; // denda yang masih berlaku
  penaltyCount: number;
  waivedCount: number;
};

export function monthDates(period: string) {
  const [year, month] = period.split("-").map(Number);
  const start = `${period}-01`;
  const next = month === 12 ? `${year + 1}-01-01` : `${year}-${String(month + 1).padStart(2, "0")}-01`;
  return datesBetween(start, addDays(next, -1));
}

// Status satu tanggal untuk satu karyawan. Hari ini belum dianggap "tidak
// hadir" (karyawan masih bisa absen sampai pukul 23.59).
export function dayStatus(input: {
  date: string;
  today: string;
  startDate: string;
  workDays: number;
  holidays: Set<string>;
  record: ReviewRecord | undefined;
  leave: ReviewLeave | undefined;
}): DayStatus {
  const { date, today, record, leave } = input;
  if (record) return "PRESENT";
  if (leave) return "LEAVE";
  const working = isWorkDay(input.workDays, isoWeekdayOf(date)) && !input.holidays.has(date);
  if (!working || date < input.startDate) return "OFF";
  return date < today ? "ABSENT" : "UPCOMING";
}

export function summarizeMonth(input: {
  period: string;
  today: string;
  workDays: number;
  holidays: Set<string>;
  people: ReviewPerson[];
  records: ReviewRecord[];
  leaves: ReviewLeave[];
  penalties: ReviewPenalty[];
}): PersonSummary[] {
  const dates = monthDates(input.period);
  return input.people.map((person) => {
    const records = new Map(
      input.records.filter((record) => record.userId === person.id).map((record) => [record.workDate, record]),
    );
    const leaves = input.leaves.filter((leave) => leave.userId === person.id);
    const summary: PersonSummary = {
      userId: person.id,
      fullName: person.fullName,
      present: 0,
      lateCount: 0,
      lateMinutes: 0,
      earlyCount: 0,
      outsideCount: 0,
      noCheckout: 0,
      absent: 0,
      paidLeaveDays: 0,
      unpaidLeaveDays: 0,
      leaveByType: {},
      penaltyTotal: 0,
      penaltyCount: 0,
      waivedCount: 0,
    };
    for (const date of dates) {
      const record = records.get(date);
      const leave = leaves.find((item) => item.startDate <= date && item.endDate >= date);
      const status = dayStatus({ ...input, date, startDate: person.startDate, record, leave });
      if (status === "PRESENT" && record) {
        summary.present += 1;
        if (record.lateMinutes > 0) {
          summary.lateCount += 1;
          summary.lateMinutes += record.lateMinutes;
        }
        if ((record.earlyMinutes ?? 0) > 0) summary.earlyCount += 1;
        if (!record.checkInInRadius || record.checkOutInRadius === false) summary.outsideCount += 1;
        if (!record.checkOutAt && date < input.today) summary.noCheckout += 1;
      } else if (status === "LEAVE" && leave) {
        // Hanya hari kerja yang dihitung sebagai hari cuti.
        if (isWorkDay(input.workDays, isoWeekdayOf(date)) && !input.holidays.has(date)) {
          if (leave.isPaid) summary.paidLeaveDays += 1;
          else summary.unpaidLeaveDays += 1;
          summary.leaveByType[leave.typeName] = (summary.leaveByType[leave.typeName] ?? 0) + 1;
        }
      } else if (status === "ABSENT") {
        summary.absent += 1;
      }
    }
    for (const penalty of input.penalties.filter((item) => item.userId === person.id)) {
      if (penalty.status === "ACTIVE") {
        summary.penaltyTotal += penalty.amount;
        summary.penaltyCount += 1;
      } else {
        summary.waivedCount += 1;
      }
    }
    return summary;
  });
}
