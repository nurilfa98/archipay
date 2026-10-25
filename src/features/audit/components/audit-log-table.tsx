// Tabel Audit Log (Client Component): aktivitas terbaru dengan panel Filter
// Tahun/Bulan/Kategori/Pelaku yang diterapkan server lewat URL, sama seperti
// tabel uang muka. Tombol mata membuka detail data yang berubah.

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
import { ToneBadge, type Tone } from "@/components/tone-badge";
import { AUDIT_CATEGORIES, AUDIT_CATEGORY_LABELS } from "@/features/audit/constants";
import type { AuditFilters } from "@/features/audit/schemas";
import { MONTH_NAMES } from "@/lib/format";
import { AuditDetailSheet } from "./audit-detail-sheet";

export type AuditLogTableRow = {
  id: string;
  createdAtLabel: string; // "24 Okt 2026, 15.30 WIB"
  createdAtTime: number; // untuk mengurutkan
  actorName: string;
  actorEmail: string | null;
  actionLabel: string;
  categoryLabel: string;
  tone: Tone;
  entityKind: string; // "Uang muka", "Pengguna", ...
  entityLabel: string; // "UM-2026-10-0001", "Budi", ...
  entityHref: string | null;
  ipAddress: string | null;
  changes: { field: string; before: string | null; after: string | null }[];
};

const column = createDataTableColumns<AuditLogTableRow>();

const COLUMNS = column.columns([
  column.accessor("createdAtTime", {
    id: "createdAt",
    header: "Waktu",
    sortFn: "basic",
    meta: { className: "whitespace-nowrap" },
    cell: ({ row }) => row.original.createdAtLabel,
  }),
  column.accessor("actorName", {
    header: "Pelaku",
    sortFn: "text",
    meta: { className: "whitespace-nowrap" },
    cell: ({ row }) => (
      <>
        <span className="block font-medium">{row.original.actorName}</span>
        {row.original.actorEmail && (
          <span className="block text-xs text-muted-foreground">{row.original.actorEmail}</span>
        )}
      </>
    ),
  }),
  column.accessor("actionLabel", {
    header: "Aktivitas",
    sortFn: "text",
    meta: { className: "whitespace-nowrap" },
    cell: ({ row }) => <ToneBadge tone={row.original.tone}>{row.original.actionLabel}</ToneBadge>,
  }),
  column.accessor("entityLabel", {
    header: "Data",
    sortFn: "text",
    meta: { className: "whitespace-nowrap" },
    cell: ({ row }) => (
      <>
        <span className="block text-xs text-muted-foreground">{row.original.entityKind}</span>
        {row.original.entityHref ? (
          <Link href={row.original.entityHref} className="font-medium hover:underline">
            {row.original.entityLabel}
          </Link>
        ) : (
          <span className="font-medium">{row.original.entityLabel}</span>
        )}
      </>
    ),
  }),
  column.accessor("ipAddress", {
    header: "Alamat IP",
    enableSorting: false,
    meta: { className: "hidden whitespace-nowrap text-muted-foreground lg:table-cell" },
    cell: ({ getValue }) => getValue() ?? "-",
  }),
  column.display({
    id: "detail",
    header: "Aksi",
    meta: { className: "w-16 text-center" },
    cell: ({ row }) => <AuditDetailSheet row={row.original} />,
  }),
]);

const SEARCHABLE = ["actorName", "actionLabel", "entityLabel"] as const;

const MONTH_OPTIONS: FilterOption[] = [
  { value: FILTER_ALL, label: "Semua bulan" },
  ...MONTH_NAMES.map((label, index) => ({ value: String(index + 1), label })),
];

const CATEGORY_OPTIONS: FilterOption[] = [
  { value: FILTER_ALL, label: "Semua kategori" },
  ...AUDIT_CATEGORIES.map((category) => ({ value: category, label: AUDIT_CATEGORY_LABELS[category] })),
];

export function AuditLogTable({
  rows,
  filters,
  years,
  actors,
  limited,
}: {
  rows: AuditLogTableRow[];
  filters: AuditFilters;
  years: number[];
  actors: { id: string; fullName: string }[];
  limited: boolean; // true bila jumlah baris mencapai batas muatan
}) {
  const { setFilters, pending } = useUrlFilters();
  const activeFilterCount = [filters.year, filters.month, filters.category, filters.actorId].filter(Boolean).length;
  const yearOptions: FilterOption[] = [
    { value: FILTER_ALL, label: "Semua tahun" },
    ...years.map((year) => ({ value: String(year), label: String(year) })),
  ];
  const actorOptions: FilterOption[] = [
    { value: FILTER_ALL, label: "Semua pengguna" },
    ...actors.map((actor) => ({ value: actor.id, label: actor.fullName })),
  ];

  return (
    <div className="flex flex-col gap-2">
      <DataTable
        columns={COLUMNS}
        data={rows}
        searchableColumns={SEARCHABLE}
        searchPlaceholder="Cari pelaku, aktivitas, atau nomor"
        emptyMessage={activeFilterCount > 0 ? "Tidak ada aktivitas yang cocok dengan filter." : "Belum ada aktivitas."}
        activeFilterCount={activeFilterCount}
        pending={pending}
        filters={
          <DataTableFilters
            canReset={activeFilterCount > 0}
            pending={pending}
            onReset={() => setFilters({ year: undefined, month: undefined, category: undefined, actor: undefined })}
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
            <DataTableFilterSelect
              label="Kategori"
              value={filters.category ?? FILTER_ALL}
              options={CATEGORY_OPTIONS}
              onValueChange={(category) => setFilters({ category })}
            />
            <DataTableFilterSelect
              label="Pelaku"
              value={filters.actorId ?? FILTER_ALL}
              options={actorOptions}
              onValueChange={(actor) => setFilters({ actor })}
            />
          </DataTableFilters>
        }
      />
      {limited && (
        <p className="text-xs text-muted-foreground">
          Hanya {rows.length} aktivitas terbaru yang ditampilkan. Gunakan Filter untuk melihat aktivitas yang lebih lama.
        </p>
      )}
    </div>
  );
}
