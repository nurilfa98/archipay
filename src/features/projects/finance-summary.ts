// Angka gabungan seluruh project untuk kartu ringkasan dan daftar "Perlu
// perhatian" di Beranda Owner. Fungsi murni (tanpa database).

import type { ProjectFinanceRow } from "./finance-queries";

// Pengeluaran sudah mencapai angka ini dari nilai kontrak → ditandai "hampir habis".
export const NEAR_LIMIT_PERCENT = 80;

export type FinanceTotals = {
  contractValue: number; // hanya project yang nilai kontraknya diisi
  valuedCount: number;
  expense: number; // semua project, termasuk yang tanpa nilai kontrak
  profit: number; // hanya project yang nilai kontraknya diisi
  marginPercent: number | null;
  provisional: boolean; // masih ada project aktif di hitungan keuntungan
  outstanding: number;
  activeWithoutValue: number;
};

export function summarizeFinance(projects: ProjectFinanceRow[]): FinanceTotals {
  const valued = projects.filter((project) => project.contractValue !== null);
  const contractValue = valued.reduce((sum, project) => sum + (project.contractValue ?? 0), 0);
  const profit = valued.reduce((sum, project) => sum + (project.profit ?? 0), 0);
  return {
    contractValue,
    valuedCount: valued.length,
    expense: projects.reduce((sum, project) => sum + project.expense, 0),
    profit,
    marginPercent: contractValue > 0 ? (profit / contractValue) * 100 : null,
    provisional: valued.some((project) => project.status === "ACTIVE"),
    outstanding: projects.reduce((sum, project) => sum + project.outstanding, 0),
    activeWithoutValue: projects.filter((project) => project.status === "ACTIVE" && project.contractValue === null)
      .length,
  };
}

// "12,5%" — satu desimal, koma Indonesia.
export function formatPercent(value: number) {
  return `${new Intl.NumberFormat("id-ID", { maximumFractionDigits: 1 }).format(value)}%`;
}
