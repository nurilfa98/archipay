// Upah lembur (BUSINESS-FLOW §24.5). Fungsi murni: dipakai saat menyusun draf
// penggajian dan tampilan Review bulanan, sehingga angkanya selalu sama.
//
// Masukannya MENIT lembur per hari (sudah dibulatkan per 30 menit oleh
// features/attendance/overtime.ts) dan jenis pekan kerja (5 atau 6 hari).

export type OvertimeWorkWeek = 5 | 6;

// Pembagi upah sebulan menjadi upah sejam (Kepmenakertrans 102/2004).
export const OVERTIME_MONTHLY_DIVISOR = 173;

// Jumlah "jam setara" satu hari lembur di hari libur: jam ke-1 s.d. batas pertama
// ×2, satu jam berikutnya ×3, sisanya ×4. Batas pertama 7 jam (pekan 6 hari) atau
// 8 jam (pekan 5 hari). Jam setengah (0,5) dihitung proporsional.
export function holidayMultiplierUnits(hours: number, week: OvertimeWorkWeek) {
  const firstTier = week === 6 ? 7 : 8;
  const first = Math.min(hours, firstTier);
  const second = Math.min(Math.max(hours - firstTier, 0), 1);
  const third = Math.max(hours - firstTier - 1, 0);
  return first * 2 + second * 3 + third * 4;
}

// Upah sebulan untuk tarif sejam: gaji pokok + tunjangan tetap bulanan
// (tunjangan per hari hadir tidak ikut).
export function overtimeMonthlyBase(profile: {
  baseSalary: number;
  components: { type: string; amount: number; perDay: boolean }[];
}) {
  const allowances = profile.components
    .filter((component) => component.type === "ALLOWANCE" && !component.perDay)
    .reduce((total, component) => total + component.amount, 0);
  return profile.baseSalary + allowances;
}

export type OvertimePay = {
  amount: number; // rupiah, dibulatkan di hasil akhir
  days: number; // jumlah hari lembur
  hours: number; // total jam lembur
  // CUSTOM tanpa tarif: tidak ada upah, draf memberi peringatan.
  missingRate: boolean;
};

// dayMinutes: menit lembur tiap hari (hari bernilai 0 diabaikan).
export function overtimePay(
  input:
    | { method: "GOVERNMENT"; dayMinutes: number[]; monthlyBase: number; week: OvertimeWorkWeek }
    | { method: "CUSTOM"; dayMinutes: number[]; hourlyRate: number | null },
): OvertimePay {
  const worked = input.dayMinutes.filter((minutes) => minutes > 0);
  const hours = worked.reduce((total, minutes) => total + minutes / 60, 0);
  const result = { days: worked.length, hours, missingRate: false };

  if (input.method === "GOVERNMENT") {
    const hourly = input.monthlyBase / OVERTIME_MONTHLY_DIVISOR;
    const units = worked.reduce((total, minutes) => total + holidayMultiplierUnits(minutes / 60, input.week), 0);
    return { ...result, amount: Math.round(units * hourly) };
  }
  if (input.hourlyRate === null) return { ...result, amount: 0, missingRate: worked.length > 0 };
  return { ...result, amount: Math.round(hours * input.hourlyRate) };
}
