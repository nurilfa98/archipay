// Daftar kartu review bulanan untuk HP (< md): satu kartu per karyawan berisi
// hadir, terlambat, dll., dengan pencarian nama. Tampil 10 kartu dulu, bertambah
// 10 setiap daftar di-scroll sampai bawah (pola sama dengan DataTable). Di layar
// lebar halaman review tetap memakai tabel.

"use client";

import { SearchIcon } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { CARD_BATCH, LoadMoreTrigger, SEARCH_MIN_LENGTH } from "@/components/data-table/data-table";
import { Input } from "@/components/ui/input";
import { formatOvertimeHours } from "../overtime";
import { formatRupiah } from "@/lib/format";
import type { PersonSummary } from "../review";

export function ReviewCardList({ rows, period }: { rows: PersonSummary[]; period: string }) {
  const [search, setSearch] = useState("");
  const [limit, setLimit] = useState(CARD_BATCH);

  const query = search.trim().toLowerCase();
  const filtered =
    query.length >= SEARCH_MIN_LENGTH ? rows.filter((row) => row.fullName.toLowerCase().includes(query)) : rows;
  const shown = filtered.slice(0, limit);

  return (
    <div className="flex flex-col gap-3 md:hidden">
      <div className="relative">
        <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          aria-label="Cari nama karyawan"
          placeholder="Cari nama karyawan"
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            setLimit(CARD_BATCH);
          }}
          className="bg-card pl-8"
        />
      </div>
      {search.trim().length > 0 && search.trim().length < SEARCH_MIN_LENGTH && (
        <p className="text-xs text-muted-foreground">Ketik minimal {SEARCH_MIN_LENGTH} karakter</p>
      )}

      {shown.length === 0 ? (
        <p className="rounded-lg border border-dashed bg-card p-6 text-center text-sm text-muted-foreground">
          Tidak ada karyawan yang cocok.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {shown.map((row) => (
            <li key={row.userId}>
              <ReviewCard row={row} period={period} />
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-col items-center gap-2 text-sm text-muted-foreground">
        <p>{filtered.length === 0 ? "0 data" : `${shown.length} dari ${filtered.length} data`}</p>
        {shown.length < filtered.length && (
          // key: dipasang ulang setiap kartu bertambah, agar bila tombol masih
          // terlihat (kartu belum memenuhi layar) langsung memuat lagi.
          <LoadMoreTrigger key={limit} onLoadMore={() => setLimit((current) => current + CARD_BATCH)} />
        )}
      </div>
    </div>
  );
}

function ReviewCard({ row, period }: { row: PersonSummary; period: string }) {
  const leave =
    row.paidLeaveDays + row.unpaidLeaveDays > 0
      ? `${row.paidLeaveDays}${row.unpaidLeaveDays ? ` + ${row.unpaidLeaveDays} tdk dibayar` : ""}`
      : "-";
  return (
    <div className="relative flex flex-col gap-3 rounded-lg border bg-card p-3 transition-colors hover:bg-muted/50">
      <div className="flex items-start justify-between gap-2">
        <Link
          href={`/attendance/review/${row.userId}?period=${period}`}
          className="min-w-0 truncate font-medium text-brand after:absolute after:inset-0 hover:underline"
        >
          {row.fullName}
        </Link>
        <div className="shrink-0 text-right">
          <p className="font-semibold whitespace-nowrap tabular-nums">
            {row.penaltyTotal > 0 ? formatRupiah(row.penaltyTotal) : "-"}
          </p>
          <p className="text-xs text-muted-foreground">
            Denda{row.waivedCount > 0 ? ` · ${row.waivedCount} dibebaskan` : ""}
          </p>
        </div>
      </div>
      <dl className="grid grid-cols-3 gap-x-2 gap-y-2 border-t pt-3 text-xs">
        <Stat label="Hadir" value={row.present} />
        <Stat label="Terlambat" value={row.lateCount > 0 ? `${row.lateCount}× (${row.lateMinutes} mnt)` : "-"} />
        <Stat label="Pulang cepat" value={row.earlyCount || "-"} />
        <Stat label="Luar radius" value={row.outsideCount || "-"} />
        <Stat label="Tdk absen pulang" value={row.noCheckout || "-"} />
        <Stat label="Tidak hadir" value={row.absent || "-"} />
        <Stat
          label="Lembur"
          value={row.overtimeDays > 0 ? `${row.overtimeDays} hari (${formatOvertimeHours(row.overtimeMinutes)})` : "-"}
          className="col-span-2"
        />
        <Stat label="Libur tanpa izin" value={row.holidayWorkNoOrderDays || "-"} />
        <Stat label="Cuti/izin" value={leave} className="col-span-3" />
      </dl>
    </div>
  );
}

function Stat({ label, value, className }: { label: string; value: string | number; className?: string }) {
  return (
    <div className={className}>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium tabular-nums">{value}</dd>
    </div>
  );
}
