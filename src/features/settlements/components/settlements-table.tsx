// Data table daftar pertanggungjawaban (Client Component), memakai pola yang
// sama dengan tabel uang muka: pencarian di browser, filter Tahun/Bulan/
// Status di panel "Filter" yang diterapkan server lewat URL.
//
// - Kolom Penerima hanya untuk OWNER/FINANCE.
// - Sisa saldo baru terisi setelah diverifikasi: saldo TERKINI dari ledger
//   (berkurang saat sisa dikembalikan, dipotong gaji, atau penggantian dibayar).
// - Seluruh baris bisa diklik lewat link di kolom No.

"use client";

import { ChevronRightIcon } from "lucide-react";
import Link from "next/link";
import {
  createDataTableColumns,
  DataTable,
} from "@/components/data-table/data-table";
import {
  DataTableFilters,
  DataTableFilterSelect,
  FILTER_ALL,
  useUrlFilters,
  type FilterOption,
} from "@/components/data-table/data-table-filters";
import {
  SETTLEMENT_STATUS,
  SETTLEMENT_STATUS_LABELS,
  type SettlementStatus,
} from "@/features/settlements/constants";
import type { SettlementFilters } from "@/features/settlements/schemas";
import { formatRupiah, MONTH_NAMES } from "@/lib/format";
import { cn } from "@/lib/utils";
import { LateReasonIndicator } from "./late-reason-indicator";
import { SettlementStatusBadge } from "./settlement-status-badge";

export type SettlementRow = {
  id: string;
  numberLabel: string; // "PJ-2026-10-0001" atau "Draf"
  lateReason: string | null; // alasan keterlambatan, null bila tepat waktu
  advanceNumber: string;
  purpose: string;
  recipientName: string;
  submittedAtLabel: string | null; // "24 Okt 2026, 15.30 WIB"
  submittedAtTime: number | null;
  itemCount: number;
  itemTotal: number;
  balanceAmount: number | null;
  returnOverdue: boolean;
  status: SettlementStatus;
};

const column = createDataTableColumns<SettlementRow>();

const numberColumn = column.accessor("numberLabel", {
  header: "No. Transaksi",
  sortFn: "text",
  meta: { className: "w-32 whitespace-nowrap" },
  cell: ({ row }) => (
    <span className="flex items-center gap-1.5">
      <Link
        href={`/settlements/${row.original.id}`}
        className={cn(
          "font-medium after:absolute after:inset-0 hover:underline",
          row.original.status === "DRAFT" && "text-muted-foreground",
        )}
      >
        {row.original.numberLabel}
      </Link>
      <LateReasonIndicator reason={row.original.lateReason} />
    </span>
  ),
});

const advanceColumn = column.accessor("advanceNumber", {
  header: "Uang muka",
  sortFn: "text",
  meta: { className: "whitespace-nowrap" },
});

const purposeColumn = column.accessor("purpose", {
  header: "Keperluan",
  enableSorting: false,
  cell: ({ getValue }) => (
    <span className="block max-w-40 truncate md:max-w-60">{getValue()}</span>
  ),
});

const recipientColumn = column.accessor("recipientName", {
  header: "Penerima",
  sortFn: "text",
  meta: { className: "whitespace-nowrap" },
});

// sortUndefined hanya berlaku untuk undefined: draf (belum dikirim) di bawah.
const submittedColumn = column.accessor(
  (row) => row.submittedAtTime ?? undefined,
  {
    id: "submittedAt",
    header: "Dikirim",
    sortFn: "basic",
    sortUndefined: "last",
    meta: { className: "whitespace-nowrap" },
    cell: ({ row }) =>
      row.original.submittedAtLabel ?? (
        <span className="text-muted-foreground">-</span>
      ),
  },
);

const totalColumn = column.accessor("itemTotal", {
  header: "Total nota",
  sortFn: "basic",
  meta: { className: "text-right whitespace-nowrap tabular-nums" },
  cell: ({ row }) => (
    <>
      <span className="block font-medium">
        {formatRupiah(row.original.itemTotal)}
      </span>
      <span className="block text-xs text-muted-foreground">
        {row.original.itemCount} nota
      </span>
    </>
  ),
});

// Positif = sisa belum dikembalikan karyawan, negatif = belum diganti kantor.
const balanceColumn = column.accessor((row) => row.balanceAmount ?? undefined, {
  id: "balance",
  header: "Sisa saldo",
  sortFn: "basic",
  sortUndefined: "last",
  meta: { className: "pr-8 text-right whitespace-nowrap tabular-nums" },
  cell: ({ row }) => {
    const balance = row.original.balanceAmount;
    if (balance === null)
      return <span className="text-muted-foreground">-</span>;
    if (balance === 0) {
      return (
        <>
          <span className="block font-medium">{formatRupiah(0)}</span>
          <span className="block text-xs text-muted-foreground">lunas</span>
        </>
      );
    }
    return (
      <>
        <span className="block font-medium">
          {formatRupiah(Math.abs(balance))}
        </span>
        <span className="block text-xs text-muted-foreground">
          {balance > 0 ? "belum dikembalikan" : "belum diganti kantor"}
        </span>
      </>
    );
  },
});

const statusColumn = column.accessor("status", {
  header: "Status",
  enableSorting: false,
  meta: { className: "whitespace-nowrap" },
  cell: ({ row }) => (
    <>
      <SettlementStatusBadge status={row.original.status} />
      {row.original.returnOverdue && (
        <span className="mt-1 block text-xs font-medium text-amber-700 dark:text-amber-300">
          lewat batas pengembalian
        </span>
      )}
    </>
  ),
});

const openColumn = column.display({
  id: "open",
  header: () => <span className="sr-only">Detail</span>,
  meta: { className: "w-10" },
  cell: () => <ChevronRightIcon className="size-4 text-muted-foreground" />,
});

// Dibuat sekali di luar komponen (wajib stabil untuk TanStack Table v9).
const COLUMNS_WITH_RECIPIENT = column.columns([
  numberColumn,
  advanceColumn,
  purposeColumn,
  recipientColumn,
  submittedColumn,
  totalColumn,
  balanceColumn,
  statusColumn,
  openColumn,
]);
const COLUMNS_OWN = column.columns([
  numberColumn,
  advanceColumn,
  purposeColumn,
  submittedColumn,
  totalColumn,
  balanceColumn,
  statusColumn,
  openColumn,
]);

const SEARCHABLE_WITH_RECIPIENT = [
  "numberLabel",
  "advanceNumber",
  "purpose",
  "recipientName",
] as const;
const SEARCHABLE_OWN = ["numberLabel", "advanceNumber", "purpose"] as const;

const STATUS_OPTIONS: FilterOption[] = [
  { value: FILTER_ALL, label: "Semua status" },
  ...SETTLEMENT_STATUS.map((value) => ({
    value,
    label: SETTLEMENT_STATUS_LABELS[value],
  })),
];

const MONTH_OPTIONS: FilterOption[] = [
  { value: FILTER_ALL, label: "Semua bulan" },
  ...MONTH_NAMES.map((label, index) => ({ value: String(index + 1), label })),
];

export function SettlementsTable({
  rows,
  showRecipient,
  filters,
  years,
}: {
  rows: SettlementRow[];
  showRecipient: boolean;
  filters: SettlementFilters;
  years: number[];
}) {
  const { setFilters, pending } = useUrlFilters();
  const activeFilterCount = [
    filters.year,
    filters.month,
    filters.status,
  ].filter(Boolean).length;
  const yearOptions: FilterOption[] = [
    { value: FILTER_ALL, label: "Semua tahun" },
    ...years.map((year) => ({ value: String(year), label: String(year) })),
  ];

  return (
    <DataTable
      columns={showRecipient ? COLUMNS_WITH_RECIPIENT : COLUMNS_OWN}
      data={rows}
      searchableColumns={
        showRecipient ? SEARCHABLE_WITH_RECIPIENT : SEARCHABLE_OWN
      }
      searchPlaceholder={
        showRecipient
          ? "Cari nomor, keperluan, penerima"
          : "Cari nomor atau keperluan"
      }
      emptyMessage={
        activeFilterCount > 0
          ? "Tidak ada pertanggungjawaban pada filter ini."
          : "Belum ada pertanggungjawaban."
      }
      activeFilterCount={activeFilterCount}
      pending={pending}
      filters={
        <DataTableFilters
          canReset={activeFilterCount > 0}
          pending={pending}
          onReset={() =>
            setFilters({ year: undefined, month: undefined, status: undefined })
          }
        >
          <DataTableFilterSelect
            label="Tahun"
            value={filters.year ? String(filters.year) : FILTER_ALL}
            options={yearOptions}
            description="Tahun nomor PJ; draf belum bernomor"
            onValueChange={(year) => setFilters({ year, month: undefined })}
          />
          <DataTableFilterSelect
            label="Bulan"
            value={filters.month ? String(filters.month) : FILTER_ALL}
            options={MONTH_OPTIONS}
            disabled={!filters.year}
            description={
              filters.year ? undefined : "Pilih tahun terlebih dahulu"
            }
            onValueChange={(month) => setFilters({ month })}
          />
          <DataTableFilterSelect
            label="Status"
            value={filters.status ?? FILTER_ALL}
            options={STATUS_OPTIONS}
            onValueChange={(status) => setFilters({ status })}
          />
        </DataTableFilters>
      }
    />
  );
}
