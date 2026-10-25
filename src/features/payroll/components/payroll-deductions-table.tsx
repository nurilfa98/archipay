// Tabel "Riwayat potongan" (Client Component): potongan gaji yang sudah
// dicatat, dengan panel Filter Tahun/Bulan periode gaji yang diterapkan
// server lewat URL, sama seperti tabel uang muka.

"use client";

import Link from "next/link";
import { createDataTableColumns, DataTable } from "@/components/data-table/data-table";
import {
  DataTableFilters,
  DataTableFilterSelect,
  FILTER_ALL,
  useUrlFilters,
  type FilterOption,
} from "@/components/data-table/data-table-filters";
import type { PayrollFilters } from "@/features/payroll/schemas";
import { formatRupiah, MONTH_NAMES } from "@/lib/format";

export type PayrollDeductionRow = {
  id: string;
  periodLabel: string; // "November 2026"
  period: string; // "2026-11", untuk mengurutkan
  recipientName: string;
  settlementId: string;
  settlementNumber: string;
  advanceNumber: string;
  amount: number;
  createdByName: string;
  createdAtLabel: string;
};

const column = createDataTableColumns<PayrollDeductionRow>();

const COLUMNS = column.columns([
  column.accessor("period", {
    header: "Periode gaji",
    sortFn: "text",
    meta: { className: "whitespace-nowrap" },
    cell: ({ row }) => <span className="font-medium">{row.original.periodLabel}</span>,
  }),
  column.accessor("recipientName", {
    header: "Karyawan",
    sortFn: "text",
    meta: { className: "whitespace-nowrap" },
  }),
  column.accessor("settlementNumber", {
    header: "No. PJ",
    sortFn: "text",
    meta: { className: "whitespace-nowrap" },
    cell: ({ row }) => (
      <Link
        href={`/settlements/${row.original.settlementId}`}
        className="font-medium after:absolute after:inset-0 hover:underline"
      >
        {row.original.settlementNumber}
      </Link>
    ),
  }),
  column.accessor("advanceNumber", {
    header: "Uang muka",
    sortFn: "text",
    meta: { className: "whitespace-nowrap" },
  }),
  column.accessor("amount", {
    header: "Nominal",
    sortFn: "basic",
    meta: { className: "pr-8 text-right font-medium whitespace-nowrap tabular-nums" },
    cell: ({ getValue }) => formatRupiah(getValue()),
  }),
  column.accessor("createdByName", {
    header: "Dicatat oleh",
    sortFn: "text",
    meta: { className: "whitespace-nowrap" },
    cell: ({ row }) => (
      <>
        <span className="block">{row.original.createdByName}</span>
        <span className="block text-xs text-muted-foreground">{row.original.createdAtLabel}</span>
      </>
    ),
  }),
]);

const SEARCHABLE = ["recipientName", "settlementNumber", "advanceNumber"] as const;

const MONTH_OPTIONS: FilterOption[] = [
  { value: FILTER_ALL, label: "Semua bulan" },
  ...MONTH_NAMES.map((label, index) => ({ value: String(index + 1), label })),
];

export function PayrollDeductionsTable({
  rows,
  filters,
  years,
}: {
  rows: PayrollDeductionRow[];
  filters: PayrollFilters;
  years: number[];
}) {
  const { setFilters, pending } = useUrlFilters();
  const activeFilterCount = [filters.year, filters.month].filter(Boolean).length;
  const yearOptions: FilterOption[] = [
    { value: FILTER_ALL, label: "Semua tahun" },
    ...years.map((year) => ({ value: String(year), label: String(year) })),
  ];

  return (
    <DataTable
      columns={COLUMNS}
      data={rows}
      searchableColumns={SEARCHABLE}
      searchPlaceholder="Cari karyawan atau nomor"
      emptyMessage={activeFilterCount > 0 ? "Tidak ada potongan pada periode ini." : "Belum ada potongan gaji."}
      activeFilterCount={activeFilterCount}
      pending={pending}
      filters={
        <DataTableFilters
          canReset={activeFilterCount > 0}
          pending={pending}
          onReset={() => setFilters({ year: undefined, month: undefined })}
        >
          <DataTableFilterSelect
            label="Tahun"
            value={filters.year ? String(filters.year) : FILTER_ALL}
            options={yearOptions}
            onValueChange={(year) => setFilters({ year, month: undefined })}
          />
          <DataTableFilterSelect
            label="Bulan"
            value={filters.month ? String(filters.month) : FILTER_ALL}
            options={MONTH_OPTIONS}
            disabled={!filters.year}
            description={filters.year ? undefined : "Pilih tahun terlebih dahulu"}
            onValueChange={(month) => setFilters({ month })}
          />
        </DataTableFilters>
      }
    />
  );
}
