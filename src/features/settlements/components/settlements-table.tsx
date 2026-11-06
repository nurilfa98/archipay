// Data table daftar pertanggungjawaban (Client Component), memakai pola yang
// sama dengan tabel uang muka: pencarian di browser, filter Tahun/Bulan/
// Status di panel "Filter" yang diterapkan server lewat URL.
//
// - Kolom Penerima hanya untuk OWNER/FINANCE.
// - Sisa saldo: setelah diverifikasi = saldo TERKINI dari ledger (berkurang saat
//   sisa dikembalikan, dipotong gaji, atau penggantian dibayar). Sebelum itu =
//   PERKIRAAN (dana uang muka − total nota), sama dengan kartu di halaman detail;
//   "-" bila belum ada nota sama sekali.
// - Seluruh baris bisa diklik lewat link di kolom No.
// - HP (< md): kartu (SettlementCard), 10 dulu lalu +10 saat di-scroll.

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
  advanceAmount: number; // dana uang muka, untuk perkiraan sisa saldo
  balanceAmount: number | null; // saldo resmi dari ledger, null sebelum diverifikasi
  returnOverdue: boolean;
  pendingClaim: boolean; // karyawan sudah melapor mengembalikan, menunggu konfirmasi
  status: SettlementStatus;
};

// Karyawan sudah melapor "saya sudah mengembalikan" dan menunggu Owner/Finance.
function PendingClaimNote() {
  return (
    <span className="mt-1 block text-xs font-medium text-amber-700 dark:text-amber-300">
      laporan pengembalian menunggu
    </span>
  );
}

// Saldo yang ditampilkan: resmi (ledger) setelah diverifikasi; sebelum itu
// perkiraan = dana − total nota, dan hanya bila sudah ada nota (draf kosong
// akan menampilkan "seluruh dana dikembalikan", menyesatkan).
// Positif = belum dikembalikan karyawan, negatif = belum diganti kantor.
function shownBalance(row: SettlementRow): { amount: number; estimate: boolean } | null {
  if (row.balanceAmount !== null) return { amount: row.balanceAmount, estimate: false };
  if (row.itemCount === 0) return null;
  return { amount: row.advanceAmount - row.itemTotal, estimate: true };
}

// Keterangan di bawah angka sisa saldo.
function balanceNote({ amount, estimate }: { amount: number; estimate: boolean }) {
  if (estimate) {
    return amount === 0 ? "perkiraan pas" : amount > 0 ? "perkiraan dikembalikan" : "perkiraan diganti kantor";
  }
  return amount === 0 ? "lunas" : amount > 0 ? "belum dikembalikan" : "belum diganti kantor";
}

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

const balanceColumn = column.accessor((row) => shownBalance(row)?.amount ?? undefined, {
  id: "balance",
  header: "Sisa saldo",
  sortFn: "basic",
  sortUndefined: "last",
  meta: { className: "pr-8 text-right whitespace-nowrap tabular-nums" },
  cell: ({ row }) => {
    const balance = shownBalance(row.original);
    if (balance === null)
      return <span className="text-muted-foreground">-</span>;
    return (
      <>
        <span className="block font-medium">
          {formatRupiah(Math.abs(balance.amount))}
        </span>
        <span className="block text-xs text-muted-foreground">
          {balanceNote(balance)}
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
      {row.original.pendingClaim && <PendingClaimNote />}
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
      renderCard={(row) => <SettlementCard row={row} showRecipient={showRecipient} />}
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

// Kartu satu pertanggungjawaban untuk HP. Seluruh kartu bisa diklik (link
// dibentangkan lewat ::after); tanda alasan terlambat diletakkan di atas link
// (relative z-10) agar tooltip-nya tetap bisa ditekan.
function SettlementCard({ row, showRecipient }: { row: SettlementRow; showRecipient: boolean }) {
  const balance = shownBalance(row);
  return (
    <div className="relative flex flex-col gap-2 rounded-lg border bg-card p-3 transition-colors hover:bg-muted/50">
      <div className="flex items-start justify-between gap-2">
        <span className="flex items-center gap-1.5">
          <Link
            href={`/settlements/${row.id}`}
            className={cn(
              "font-medium after:absolute after:inset-0 hover:underline",
              row.status === "DRAFT" && "text-muted-foreground",
            )}
          >
            {row.numberLabel}
          </Link>
          {row.lateReason && (
            <span className="relative z-10 inline-flex">
              <LateReasonIndicator reason={row.lateReason} />
            </span>
          )}
        </span>
        <div className="flex flex-col items-end gap-0.5">
          <SettlementStatusBadge status={row.status} />
          {row.pendingClaim && <PendingClaimNote />}
        </div>
      </div>
      <p className="line-clamp-2 text-sm">{row.purpose}</p>
      <p className="text-xs text-muted-foreground">
        {row.advanceNumber}
        {showRecipient && ` · ${row.recipientName}`}
        {` · ${row.submittedAtLabel ? `Dikirim ${row.submittedAtLabel}` : "Belum dikirim"}`}
      </p>
      {row.returnOverdue && (
        <p className="text-xs font-medium text-amber-700 dark:text-amber-300">lewat batas pengembalian</p>
      )}
      <dl className="grid grid-cols-2 gap-2 border-t pt-2 text-xs">
        <div className="flex flex-col">
          <dt className="text-muted-foreground">Total nota</dt>
          <dd className="text-sm font-medium tabular-nums">{formatRupiah(row.itemTotal)}</dd>
          <dd className="text-muted-foreground">{row.itemCount} nota</dd>
        </div>
        <div className="flex flex-col items-end text-right">
          <dt className="text-muted-foreground">Sisa saldo</dt>
          {balance === null ? (
            <dd className="text-sm text-muted-foreground">-</dd>
          ) : (
            <>
              <dd className="text-sm font-medium tabular-nums">{formatRupiah(Math.abs(balance.amount))}</dd>
              <dd className="text-muted-foreground">{balanceNote(balance)}</dd>
            </>
          )}
        </div>
      </dl>
    </div>
  );
}
