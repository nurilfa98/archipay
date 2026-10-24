// Service = aturan bisnis murni. Tidak boleh import database, cookies,
// atau apa pun dari Next.js, supaya mudah di-unit-test.
//
// Uang selalu dihitung dalam satuan terkecil (sen) sebagai integer.
// Jangan menghitung uang dengan float: 0.1 + 0.2 !== 0.3.

export type SettlementType =
  | "EXACT"
  | "RETURN_PENDING"
  | "RETURN_COMPLETED"
  | "REIMBURSEMENT"
  | "PAYROLL_DEDUCT";

export function calculateSettlement(amountIssuedSen: number, totalSpentSen: number) {
  const balanceSen = amountIssuedSen - totalSpentSen;

  let type: SettlementType = "EXACT";
  if (balanceSen > 0) type = "RETURN_PENDING"; // karyawan pegang kembalian
  if (balanceSen < 0) type = "REIMBURSEMENT"; // karyawan nombok

  return { balanceSen, type };
}
