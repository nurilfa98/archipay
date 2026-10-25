// Data table riwayat uang muka (Client Component, memakai
// components/data-table). Tanggal sudah diformat di server (zona waktu
// perusahaan) dan dikirim sebagai teks, karena lib/dates.ts khusus server.
//
// - Kolom Penerima hanya untuk OWNER/FINANCE; karyawan hanya melihat uang
//   mukanya sendiri sehingga kolom itu tidak perlu.
// - Keperluan dipotong satu baris ("..."); teks lengkap ada di halaman detail.
// - Batas nota = batas unggah nota; amber bila terlewati.
// - Filter Tahun/Bulan/Status ada di panel "Filter" dan diterapkan server
//   lewat URL; pencarian berjalan di browser atas data yang sudah dimuat.
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
  ADVANCE_STATUS,
  ADVANCE_STATUS_LABELS,
  type AdvanceStatus,
} from "@/features/advances/constants";
import type { AdvanceFilters } from "@/features/advances/schemas";
import { formatRupiah, MONTH_NAMES } from "@/lib/format";
import { cn } from "@/lib/utils";
import { AdvanceStatusBadge } from "./advance-status-badge";

export type AdvanceRow = {
  id: string;
  numberLabel: string; // "UM-2026-10-0012"
  purpose: string;
  recipientName: string;
  createdAtLabel: string; // "24 Okt 2026, 15.30 WIB"
  createdAtTime: number; // untuk mengurutkan
  settlementDueLabel: string | null; // "27 Okt 2026"; null bila belum dicairkan
  settlementDueTime: number | null;
  settlementOverdue: boolean;
  amount: number;
  status: AdvanceStatus;
  disputed: boolean;
};

const column = createDataTableColumns<AdvanceRow>();

const numberColumn = column.accessor("numberLabel", {
  header: "No. Transaksi",
  sortFn: "text",
  meta: { className: "w-28 whitespace-nowrap" },
  cell: ({ row }) => (
    <Link
      href={`/advances/${row.original.id}`}
      className="font-medium after:absolute after:inset-0 hover:underline"
    >
      {row.original.numberLabel}
    </Link>
  ),
});

const purposeColumn = column.accessor("purpose", {
  header: "Keperluan",
  enableSorting: false,
  cell: ({ getValue }) => (
    <span className="block max-w-48 truncate md:max-w-72">{getValue()}</span>
  ),
});

const recipientColumn = column.accessor("recipientName", {
  header: "Penerima",
  sortFn: "text",
  meta: { className: "whitespace-nowrap" },
});

// "Dibuat", bukan "Diajukan": pencairan langsung oleh Owner (push) tidak
// melalui pengajuan, waktunya sama dengan waktu dana dicairkan.
const dateColumn = column.accessor("createdAtTime", {
  header: "Dibuat",
  sortFn: "basic",
  meta: { className: "whitespace-nowrap" },
  cell: ({ row }) => row.original.createdAtLabel,
});

// Batas unggah nota (akhir hari, 23.59). Amber (warning) bila sudah terlewati.
// Yang belum dicairkan (tanpa batas) selalu di urutan paling bawah.
// sortUndefined hanya berlaku untuk undefined, jadi null diubah lebih dulu.
const settlementDueColumn = column.accessor(
  (row) => row.settlementDueTime ?? undefined,
  {
    id: "settlementDue",
    header: "Batas nota",
    sortFn: "basic",
    sortUndefined: "last",
    meta: { className: "whitespace-nowrap" },
    cell: ({ row }) => {
      const { settlementDueLabel, settlementOverdue } = row.original;
      if (!settlementDueLabel)
        return <span className="text-muted-foreground">-</span>;
      return (
        <span
          className={cn(
            settlementOverdue &&
              "font-medium text-amber-700 dark:text-amber-300",
          )}
        >
          {settlementDueLabel}
          {settlementOverdue && " (terlewati)"}
        </span>
      );
    },
  },
);

// pr-8 memberi jarak antara angka (rata kanan) dan badge status di sebelahnya.
const amountColumn = column.accessor("amount", {
  header: "Nominal",
  sortFn: "basic",
  meta: {
    className: "pr-8 text-right font-medium whitespace-nowrap tabular-nums",
  },
  cell: ({ getValue }) => formatRupiah(getValue()),
});

const statusColumn = column.accessor("status", {
  header: "Status",
  enableSorting: false,
  meta: { className: "whitespace-nowrap" },
  cell: ({ row }) => (
    <AdvanceStatusBadge
      status={row.original.status}
      disputed={row.original.disputed}
    />
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
  purposeColumn,
  recipientColumn,
  dateColumn,
  settlementDueColumn,
  amountColumn,
  statusColumn,
  openColumn,
]);
const COLUMNS_OWN = column.columns([
  numberColumn,
  purposeColumn,
  dateColumn,
  settlementDueColumn,
  amountColumn,
  statusColumn,
  openColumn,
]);

const SEARCHABLE_WITH_RECIPIENT = [
  "numberLabel",
  "purpose",
  "recipientName",
] as const;
const SEARCHABLE_OWN = ["numberLabel", "purpose"] as const;

const STATUS_OPTIONS: FilterOption[] = [
  { value: FILTER_ALL, label: "Semua status" },
  ...ADVANCE_STATUS.map((value) => ({
    value,
    label: ADVANCE_STATUS_LABELS[value],
  })),
];

const MONTH_OPTIONS: FilterOption[] = [
  { value: FILTER_ALL, label: "Semua bulan" },
  ...MONTH_NAMES.map((label, index) => ({ value: String(index + 1), label })),
];

export function AdvancesTable({
  rows,
  showRecipient,
  filters,
  years,
}: {
  rows: AdvanceRow[];
  showRecipient: boolean;
  filters: AdvanceFilters;
  years: number[]; // tahun yang punya data, untuk pilihan filter Tahun
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
          ? "Tidak ada uang muka pada filter ini."
          : "Belum ada uang muka."
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
            // Ganti/hapus tahun → bulan ikut dihapus.
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
