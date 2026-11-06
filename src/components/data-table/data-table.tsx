// Data table yang bisa dipakai ulang: pencarian, filter, urutkan kolom, dan halaman.
//
//   [Cari...]                                        [≡ Filter 2]
//   ┌ panel filter (dibuka/tutup tombol Filter) ─────────────────┐
//   └────────────────────────────────────────────────────────────┘
//   ┌ tabel ─────────────────────────────────────────────────────┐
//
// Pencarian berjalan di browser atas data yang sudah dimuat. Filter (tahun,
// bulan, status, ...) disimpan di URL dan diterapkan server saat mengambil
// data, sehingga data lama di luar batas muatan tetap bisa ditemukan.
//
// Mengikuti pola "Data Table" shadcn/ui: TanStack Table mengurus logika
// (filter, sort, pagination), sedangkan tampilannya memakai komponen
// <Table> shadcn. Panduan shadcn masih ditulis untuk TanStack Table v8;
// proyek ini memakai v9 yang API-nya berbeda:
// - useTable({ features, columns, data }) menggantikan useReactTable().
// - Fitur yang dipakai (sorting, filtering, pagination) WAJIB didaftarkan di
//   tableFeatures(); tanpa itu API-nya (getCanSort, nextPage, dst) tidak ada.
// - features & columns harus stabil (dibuat di luar komponen), kalau tidak
//   tabel menghitung ulang semua baris di setiap render.
//
// Semua pemrosesan terjadi di browser (client-side), cocok untuk data
// ratusan baris. Untuk ribuan baris, pindahkan ke server (manualPagination).
//
// Tampilan HP (< md, 768px) bila `renderCard` diisi: tabel diganti daftar
// kartu (tanpa geser ke samping). Kartu tampil 10 dulu, lalu bertambah 10
// setiap kali daftar di-scroll sampai bawah (ada juga tombol "Tampilkan 10
// lagi" sebagai cadangan). Pencarian & filter yang sama tetap berlaku; datanya
// sudah ada di browser, jadi menambah kartu tidak memanggil server. Kedua
// tampilan dirender sekaligus dan dipilih lewat CSS (md:hidden / hidden
// md:block), supaya tidak ada kedipan saat halaman pertama kali tampil.
//
// Referensi:
// - https://ui.shadcn.com/docs/components/data-table
// - node_modules/@tanstack/react-table/skills/getting-started/SKILL.md
// - node_modules/@tanstack/table-core/skills/table-features/SKILL.md

"use client";

import {
  columnFilteringFeature,
  createColumnHelper,
  createFilteredRowModel,
  createPaginatedRowModel,
  createSortedRowModel,
  filterFn_includesString,
  globalFilteringFeature,
  metaHelper,
  rowPaginationFeature,
  rowSortingFeature,
  sortFn_basic,
  sortFn_text,
  tableFeatures,
  useTable,
  type ColumnDef,
  type RowData,
} from "@tanstack/react-table";
import { ArrowDownIcon, ArrowUpDownIcon, ArrowUpIcon, ListFilterIcon, SearchIcon } from "lucide-react";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

// Info tambahan per kolom untuk tampilan, misalnya rata kanan atau
// disembunyikan di HP: { meta: { className: "hidden md:table-cell" } }.
export type DataTableColumnMeta = {
  className?: string;
};

export const dataTableFeatures = tableFeatures({
  columnFilteringFeature,
  globalFilteringFeature,
  rowSortingFeature,
  rowPaginationFeature,
  filteredRowModel: createFilteredRowModel(),
  sortedRowModel: createSortedRowModel(),
  paginatedRowModel: createPaginatedRowModel(),
  filterFns: { includesString: filterFn_includesString },
  sortFns: { text: sortFn_text, basic: sortFn_basic },
  columnMeta: metaHelper<DataTableColumnMeta>(),
});

export type DataTableFeatures = typeof dataTableFeatures;

// Pembuat definisi kolom yang sudah terhubung ke fitur di atas.
export function createDataTableColumns<TData extends RowData>() {
  return createColumnHelper<DataTableFeatures, TData>();
}

const PAGE_SIZE = 10;
// Jumlah kartu yang ditambahkan setiap kali daftar kartu (HP) di-scroll ke bawah.
export const CARD_BATCH = 10;
// Pencarian baru berjalan setelah minimal 3 karakter, supaya ketikan 1-2
// huruf tidak langsung menyaring tabel. Langsung saat mengetik, tanpa Enter.
export const SEARCH_MIN_LENGTH = 3;

export function DataTable<TData extends RowData>({
  columns,
  data,
  searchPlaceholder = "Cari...",
  searchableColumns,
  filters,
  activeFilterCount = 0,
  pending = false,
  emptyMessage = "Belum ada data.",
  renderCard,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- setiap kolom punya tipe nilai berbeda
  columns: ReadonlyArray<ColumnDef<DataTableFeatures, TData, any>>;
  data: TData[];
  searchPlaceholder?: string;
  // id kolom yang ikut dicari oleh kotak pencarian.
  searchableColumns: readonly string[];
  // Isi panel filter (lihat data-table-filters.tsx). Bila diisi, tombol
  // "Filter" muncul di kanan atas dan membuka panel selebar tabel.
  filters?: ReactNode;
  // Jumlah filter yang sedang aktif, tampil sebagai angka di tombol Filter.
  activeFilterCount?: number;
  // true selama data baru dimuat (misal setelah filter diganti): tabel diredupkan.
  pending?: boolean;
  emptyMessage?: string;
  // Isi satu kartu untuk tampilan HP. Bila tidak diisi, HP tetap memakai tabel.
  renderCard?: (row: TData) => ReactNode;
}) {
  const [search, setSearch] = useState("");
  const [cardLimit, setCardLimit] = useState(CARD_BATCH);
  // Data baru (filter di URL diganti) → kartu kembali ke 10 pertama.
  const [prevData, setPrevData] = useState(data);
  if (data !== prevData) {
    setPrevData(data);
    setCardLimit(CARD_BATCH);
  }
  // Panel langsung terbuka bila halaman dibuka dengan filter aktif
  // (misal dari link/bookmark), supaya user tahu datanya sedang disaring.
  const [filtersOpen, setFiltersOpen] = useState(activeFilterCount > 0);
  const filtersId = useId();
  const table = useTable({
    features: dataTableFeatures,
    columns,
    data,
    globalFilterFn: "includesString",
    getColumnCanGlobalFilter: (column) => searchableColumns.includes(column.id),
    initialState: { pagination: { pageIndex: 0, pageSize: PAGE_SIZE } },
  });

  const rows = table.getRowModel().rows;
  const total = table.getFilteredRowModel().rows.length;
  const { pageIndex, pageSize } = table.state.pagination;
  const from = total === 0 ? 0 : pageIndex * pageSize + 1;
  const to = Math.min(total, (pageIndex + 1) * pageSize);
  // Kartu memakai baris yang sudah dicari & diurutkan, tanpa pembagian halaman.
  const cardRows = renderCard ? table.getPrePaginatedRowModel().rows.slice(0, cardLimit) : [];
  const hasMoreCards = cardRows.length < total;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative w-full sm:max-w-xs">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            aria-label={searchPlaceholder}
            placeholder={searchPlaceholder}
            value={search}
            onChange={(event) => {
              const value = event.target.value;
              setSearch(value);
              setCardLimit(CARD_BATCH);
              table.setGlobalFilter(value.trim().length >= SEARCH_MIN_LENGTH ? value.trim() : "");
            }}
            className="pl-8"
          />
        </div>
        {search.trim().length > 0 && search.trim().length < SEARCH_MIN_LENGTH && (
          <p className="text-xs text-muted-foreground">Ketik minimal {SEARCH_MIN_LENGTH} karakter</p>
        )}
        {filters && (
          <Button
            variant="outline"
            className="bg-card sm:ml-auto"
            aria-expanded={filtersOpen}
            aria-controls={filtersId}
            onClick={() => setFiltersOpen((open) => !open)}
          >
            <ListFilterIcon />
            Filter
            {activeFilterCount > 0 && (
              <Badge className="h-4 min-w-4 px-1 tabular-nums">{activeFilterCount}</Badge>
            )}
          </Button>
        )}
      </div>

      {filters && filtersOpen && (
        <div id={filtersId} className="rounded-lg border bg-card p-4">
          {filters}
        </div>
      )}

      {renderCard && (
        <div className={cn("flex flex-col gap-3 transition-opacity md:hidden", pending && "opacity-60")} aria-busy={pending}>
          {cardRows.length === 0 ? (
            <p className="rounded-lg border border-dashed bg-card p-6 text-center text-sm text-muted-foreground">
              {data.length === 0 ? emptyMessage : "Tidak ada data yang cocok."}
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {cardRows.map((row) => (
                <li key={row.id}>{renderCard(row.original)}</li>
              ))}
            </ul>
          )}
          <div className="flex flex-col items-center gap-2 text-sm text-muted-foreground">
            <p>{total === 0 ? "0 data" : `${cardRows.length} dari ${total} data`}</p>
            {hasMoreCards && (
              // key: dipasang ulang setiap kali kartu bertambah, sehingga bila
              // tombol masih terlihat (kartu belum memenuhi layar) langsung
              // memuat lagi.
              <LoadMoreTrigger key={cardLimit} onLoadMore={() => setCardLimit((limit) => limit + CARD_BATCH)} />
            )}
          </div>
        </div>
      )}

      <div
        className={cn(
          "rounded-lg border bg-card transition-opacity",
          renderCard && "hidden md:block",
          pending && "opacity-60",
        )}
        aria-busy={pending}
      >
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((group) => (
              <TableRow key={group.id}>
                {group.headers.map((header) => {
                  const sorted = header.column.getIsSorted();
                  return (
                    <TableHead key={header.id} className={header.column.columnDef.meta?.className}>
                      {header.isPlaceholder ? null : header.column.getCanSort() ? (
                        // Tombol urutkan: klik bergantian naik → turun → tanpa urutan.
                        <Button
                          variant="ghost"
                          size="sm"
                          className="-mx-2 h-8 px-2"
                          onClick={header.column.getToggleSortingHandler()}
                        >
                          <table.FlexRender header={header} />
                          {sorted === "asc" ? (
                            <ArrowUpIcon />
                          ) : sorted === "desc" ? (
                            <ArrowDownIcon />
                          ) : (
                            <ArrowUpDownIcon className="text-muted-foreground" />
                          )}
                        </Button>
                      ) : (
                        <table.FlexRender header={header} />
                      )}
                    </TableHead>
                  );
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={table.getAllLeafColumns().length}
                  className="h-24 text-center text-muted-foreground"
                >
                  {data.length === 0 ? emptyMessage : "Tidak ada data yang cocok."}
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => (
                // `relative`: kolom berisi link `after:absolute after:inset-0`
                // membuat seluruh baris bisa diklik.
                <TableRow key={row.id} className="relative">
                  {row.getAllCells().map((cell) => (
                    <TableCell key={cell.id} className={cell.column.columnDef.meta?.className}>
                      <table.FlexRender cell={cell} />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <div
        className={cn(
          "flex items-center justify-between gap-2 text-sm text-muted-foreground",
          renderCard && "hidden md:flex",
        )}
      >
        <p>{total === 0 ? "0 data" : `${from}–${to} dari ${total} data`}</p>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
          >
            Sebelumnya
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
          >
            Berikutnya
          </Button>
        </div>
      </div>
    </div>
  );
}

// Tombol "Tampilkan 10 lagi" yang juga otomatis "ditekan" saat terlihat di
// layar (IntersectionObserver), sehingga kartu bertambah sendiri ketika
// daftar di-scroll sampai bawah. rootMargin memuat sedikit lebih awal.
export function LoadMoreTrigger({ onLoadMore }: { onLoadMore: () => void }) {
  const ref = useRef<HTMLButtonElement>(null);
  const callback = useRef(onLoadMore);

  useEffect(() => {
    callback.current = onLoadMore;
  });

  useEffect(() => {
    const target = ref.current;
    if (!target) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) callback.current();
      },
      { rootMargin: "200px" },
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, []);

  return (
    <Button ref={ref} variant="outline" size="sm" className="bg-card" onClick={() => callback.current()}>
      Tampilkan {CARD_BATCH} lagi
    </Button>
  );
}
