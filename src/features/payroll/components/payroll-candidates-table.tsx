// Tabel "Belum dipotong": sisa uang muka yang lewat batas pengembalian.
// Pola sama dengan tabel uang muka (DataTable + pencarian). Kolom Aksi
// berisi tombol "Tandai dipotong"; tombol itu diberi `relative z-10` agar
// tetap bisa diklik di atas link baris (after:absolute inset-0).

"use client";

import Link from "next/link";
import { createDataTableColumns, DataTable } from "@/components/data-table/data-table";
import { formatRupiah } from "@/lib/format";
import { PayrollDeductionAction } from "./payroll-deduction-action";

export type PayrollCandidateRow = {
  settlementId: string;
  settlementNumber: string;
  advanceNumber: string;
  recipientName: string;
  recipientEmail: string;
  returnDueLabel: string; // "27 Okt 2026"
  returnDueTime: number;
  outstanding: number;
  // Periode gaji default di dialog ("2026-10") & boleh tidaknya viewer menandai.
  defaultPeriod: string;
  canRecord: boolean;
  // Sisa dana milik user yang sedang login (tidak bisa ditandai sendiri).
  isOwn: boolean;
};

const column = createDataTableColumns<PayrollCandidateRow>();

const COLUMNS = column.columns([
  column.accessor("recipientName", {
    header: "Karyawan",
    sortFn: "text",
    meta: { className: "whitespace-nowrap" },
    cell: ({ row }) => (
      <>
        <span className="block font-medium">{row.original.recipientName}</span>
        <span className="block text-xs text-muted-foreground">{row.original.recipientEmail}</span>
      </>
    ),
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
  column.accessor("returnDueTime", {
    header: "Batas pengembalian",
    sortFn: "basic",
    meta: { className: "whitespace-nowrap" },
    cell: ({ row }) => (
      <span className="font-medium text-amber-700 dark:text-amber-300">{row.original.returnDueLabel}</span>
    ),
  }),
  column.accessor("outstanding", {
    header: "Sisa",
    sortFn: "basic",
    meta: { className: "pr-8 text-right font-medium whitespace-nowrap tabular-nums" },
    cell: ({ getValue }) => formatRupiah(getValue()),
  }),
  column.display({
    id: "action",
    header: "Aksi",
    meta: { className: "w-40 text-center" },
    cell: ({ row }) =>
      row.original.canRecord ? (
        <div className="relative z-10 flex justify-center">
          <PayrollDeductionAction
            settlementId={row.original.settlementId}
            outstanding={row.original.outstanding}
            defaultPeriod={row.original.defaultPeriod}
            summary={`${row.original.settlementNumber} · ${row.original.recipientName}`}
          />
        </div>
      ) : (
        <span className="text-xs text-muted-foreground">{row.original.isOwn ? "Milik Anda" : "-"}</span>
      ),
  }),
]);

const SEARCHABLE = ["recipientName", "settlementNumber", "advanceNumber"] as const;

export function PayrollCandidatesTable({ rows }: { rows: PayrollCandidateRow[] }) {
  return (
    <DataTable
      columns={COLUMNS}
      data={rows}
      searchableColumns={SEARCHABLE}
      searchPlaceholder="Cari karyawan atau nomor"
      emptyMessage="Tidak ada sisa uang muka yang lewat batas pengembalian."
    />
  );
}
